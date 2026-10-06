import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalOcrBookController, bookOcrSummary, type BookOcrDocument } from "./local-ocr-book-controller.ts";
import { OCR_BOOK_PROGRESS, OCR_DEVICE, OCR_FRAME, OCR_JOB, OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";
import type { LocalOcrBookProgress, LocalOcrResult } from "./local-ocr-api.ts";

const input = { resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, pageCount: 3 };
function fixture() {
  const book = structuredClone(OCR_BOOK_PROGRESS);
  const results = new Map<string, LocalOcrResult>();
  const api = ocrApi({
    bookProgress: vi.fn().mockImplementation(async () => structuredClone(book)),
    create: vi.fn().mockImplementation(async (request) => {
      const result = { ...OCR_RESULT, id: `result-${request.physicalPage}`, physicalPage: request.physicalPage, correctedText: null };
      results.set(result.id, result); return { ...OCR_JOB, id: `job-${request.physicalPage}`, physicalPage: request.physicalPage, resultId: result.id };
    }),
    result: vi.fn().mockImplementation(async (id) => {
      const result = results.get(id)!;
      book.pages.push({ physicalPage: result.physicalPage, resultId: id, rotation: 0, status: result.machine.status, truncated: result.machine.truncated, hasCorrection: false, createdAt: result.createdAt });
      book.quota.used++; book.quota.remaining--; return result;
    }),
  });
  const document: BookOcrDocument = { capture: vi.fn().mockResolvedValue(OCR_FRAME), isCurrent: () => true };
  return { api, book, document, results };
}
afterEach(() => vi.useRealTimers());
describe("sequential private book OCR", () => {
  it("skips saved corrections, submits missing pages sequentially and reconstructs progress after reopening", async () => {
    const f = fixture(); let finish!: (frame: typeof OCR_FRAME) => void;
    vi.mocked(f.document.capture).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const controller = new LocalOcrBookController(f.api);
    const operation = controller.run(input, OCR_DEVICE.id, f.document, vi.fn());
    await vi.waitFor(() => expect(f.document.capture).toHaveBeenCalledTimes(1)); expect(f.api.create).not.toHaveBeenCalled();
    finish(OCR_FRAME); const outcome = await operation;
    expect(outcome.state).toBe("completed"); expect(f.document.capture).toHaveBeenNthCalledWith(1, 1, expect.any(AbortSignal)); expect(f.document.capture).toHaveBeenNthCalledWith(2, 3, expect.any(AbortSignal));
    expect(f.api.create).toHaveBeenCalledTimes(2); expect(f.book.pages.find((page) => page.physicalPage === 2)?.hasCorrection).toBe(true);
    expect(await new LocalOcrBookController(f.api).run(input, OCR_DEVICE.id, f.document, vi.fn())).toMatchObject({ state: "completed" });
    expect(f.api.create).toHaveBeenCalledTimes(2);
  });
  it("checks whole-book page and remaining-result limits before capture", async () => {
    const f = fixture(); f.book.quota = { used: 499, remaining: 1, limit: 500 };
    expect(await new LocalOcrBookController(f.api).run(input, OCR_DEVICE.id, f.document, vi.fn())).toMatchObject({ state: "failed", errorCode: "book_quota_exceeded", physicalPage: null });
    expect(await new LocalOcrBookController(f.api).run({ ...input, pageCount: 501 }, OCR_DEVICE.id, f.document, vi.fn())).toMatchObject({ state: "failed", errorCode: "book_page_limit" });
    expect(f.document.capture).not.toHaveBeenCalled(); expect(f.api.create).not.toHaveBeenCalled();
  });
  it("stops at the exact failed page and retries it only on manual resume", async () => {
    const f = fixture(); const normalCreate = f.api.create;
    f.api.create = vi.fn().mockImplementation(async (request) => request.physicalPage === 3 ? { ...OCR_JOB, id: "job-3", physicalPage: 3, state: "failed", resultId: null, errorCode: "engine_failed" } : normalCreate(request));
    const controller = new LocalOcrBookController(f.api);
    const failed = await controller.run(input, OCR_DEVICE.id, f.document, vi.fn());
    expect(failed).toMatchObject({ state: "failed", physicalPage: 3, errorCode: "engine_failed" }); expect(f.api.create).toHaveBeenCalledTimes(2);
    f.api.create = normalCreate;
    expect(await controller.run(input, OCR_DEVICE.id, f.document, vi.fn())).toMatchObject({ state: "completed" });
    expect(vi.mocked(f.document.capture).mock.calls.map((call) => call[0])).toEqual([1, 3, 3]);
  });
  it("waits for an existing same-source request without submitting that page again", async () => {
    vi.useFakeTimers(); const f = fixture(); f.book.pages = []; f.book.activeJob = { ...OCR_JOB, physicalPage: 1, state: "running", resultId: null }; f.book.accountBusy = true;
    vi.mocked(f.api.status).mockImplementation(async () => {
      f.book.pages.push({ ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: 1 }); f.book.activeJob = null; f.book.accountBusy = false; return { ...OCR_JOB, physicalPage: 1 };
    });
    const operation = new LocalOcrBookController(f.api).run(input, OCR_DEVICE.id, f.document, vi.fn());
    await vi.advanceTimersByTimeAsync(1000); expect((await operation).state).toBe("completed");
    expect(vi.mocked(f.document.capture).mock.calls.map((call) => call[0])).toEqual([2, 3]);
  });
  it("does not submit when another source owns the account request", async () => {
    const f = fixture(); f.book.accountBusy = true;
    expect(await new LocalOcrBookController(f.api).run(input, OCR_DEVICE.id, f.document, vi.fn())).toMatchObject({ state: "failed", errorCode: "account_busy" });
    expect(f.api.create).not.toHaveBeenCalled();
  });
  it("cancels a late submitted request after a source change and never starts another page", async () => {
    const f = fixture(); let finish!: (job: typeof OCR_JOB) => void; let current = true;
    f.document.isCurrent = () => current; vi.mocked(f.api.create).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const operation = new LocalOcrBookController(f.api).run(input, OCR_DEVICE.id, f.document, vi.fn());
    await vi.waitFor(() => expect(f.api.create).toHaveBeenCalled()); current = false; finish({ ...OCR_JOB, physicalPage: 1 });
    expect(await operation).toMatchObject({ state: "paused", physicalPage: 1 }); expect(f.api.cancel).toHaveBeenCalledWith(OCR_JOB.id); expect(f.api.result).not.toHaveBeenCalled(); expect(f.document.capture).toHaveBeenCalledTimes(1);
  });
  it("pauses capture and retains saved checkpoints without further submission", async () => {
    const f = fixture(); let finish!: (frame: typeof OCR_FRAME) => void;
    vi.mocked(f.document.capture).mockReturnValue(new Promise((resolve) => { finish = resolve; })); const controller = new LocalOcrBookController(f.api);
    const operation = controller.run(input, OCR_DEVICE.id, f.document, vi.fn()); await vi.waitFor(() => expect(f.document.capture).toHaveBeenCalled()); controller.pause(); finish(OCR_FRAME);
    expect(await operation).toMatchObject({ state: "paused", book: { pages: OCR_BOOK_PROGRESS.pages } }); expect(f.api.create).not.toHaveBeenCalled();
  });
  it("counts processed quality issues and empty pages separately", () => {
    const book: LocalOcrBookProgress = { ...OCR_BOOK_PROGRESS, pages: [
      { ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: 1, status: "low_confidence", truncated: true },
      { ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: 2, status: "no_text" },
      { ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: 3, status: "unsupported_script" },
    ] };
    expect(bookOcrSummary(book)).toMatchObject({ processed: 3, noText: 1 }); expect(bookOcrSummary(book).issues.map((page) => page.physicalPage)).toEqual([1, 3]);
  });
  it("skips a missing page that another tab has saved before the next capture", async () => {
    const f = fixture(); const read = f.api.bookProgress;
    f.api.bookProgress = vi.fn().mockImplementation(async (book, signal) => {
      if (f.book.pages.some((page) => page.physicalPage === 1) && !f.book.pages.some((page) => page.physicalPage === 3)) f.book.pages.push({ ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: 3 });
      return read(book, signal);
    });
    expect(await new LocalOcrBookController(f.api).run(input, OCR_DEVICE.id, f.document, vi.fn())).toMatchObject({ state: "completed" });
    expect(f.document.capture).toHaveBeenCalledTimes(1); expect(f.api.create).toHaveBeenCalledTimes(1); expect(f.api.create).toHaveBeenCalledWith(expect.objectContaining({ physicalPage: 1 }));
  });
});
