import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WholeBookOcr } from "./local-ocr-book-ui.tsx";
import { LanguageProvider } from "./i18n-react.tsx";
import { OCR_BOOK_PROGRESS, OCR_DEVICE, OCR_FRAME, OCR_JOB, OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";
import type { LocalOcrApi, LocalOcrBookProgress } from "./local-ocr-api.ts";
import type { BookOcrDocument } from "./local-ocr-book-controller.ts";

beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
});
afterEach(() => { window.localStorage.removeItem("academiccloud.language"); vi.unstubAllGlobals(); });
const sourceDocument: BookOcrDocument = { capture: async () => OCR_FRAME, isCurrent: () => true };
function panel(api: LocalOcrApi, options: { pageCount?: number; source?: string; account?: string; document?: BookOcrDocument; blocked?: boolean; review?: (page: number) => void } = {}) {
  return <LanguageProvider><WholeBookOcr connection={{ api, accountId: options.account ?? "member-one", resourceId: OCR_RESULT.resourceId, sourceId: options.source ?? OCR_RESULT.sourceId }} document={options.document ?? sourceDocument} pageCount={options.pageCount ?? 3} blocked={options.blocked ?? false} onReview={options.review ?? vi.fn()} /></LanguageProvider>;
}
async function open() { fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" })); await screen.findByText(/1\/3 pages processed/); }
describe("private whole-book OCR controls", () => {
  it("reopens durable progress and exports saved text through ordinary authenticated download links", async () => {
    const api = ocrApi(); const view = render(panel(api)); await open();
    expect(screen.getByRole("link", { name: "Export saved text .txt" })).toHaveAttribute("href", "/api/reader/local-ocr/book-export?resourceId=resource-one&sourceId=source-one&pageCount=3&format=txt");
    expect(screen.getByRole("link", { name: "Export page records .jsonl" })).toHaveAttribute("download");
    expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeEnabled(); expect(api.create).not.toHaveBeenCalled();
    view.unmount(); render(panel(api)); await open(); expect(api.bookProgress).toHaveBeenCalledTimes(2); expect(api.create).not.toHaveBeenCalled();
  });
  it("reports insufficient remaining quota and the supported page limit before any image is captured", async () => {
    const capture = vi.fn().mockResolvedValue(OCR_FRAME); const book = { ...OCR_BOOK_PROGRESS, quota: { used: 499, remaining: 1, limit: 500 } };
    const api = ocrApi({ bookProgress: vi.fn().mockResolvedValue(book) }); const view = render(panel(api, { document: { capture, isCurrent: () => true } })); await open();
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" }));
    await waitFor(() => expect(screen.getAllByText("Remaining private-result quota cannot cover the missing pages.").length).toBeGreaterThan(0));
    expect(capture).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
    view.rerender(panel(api, { pageCount: 501 })); expect(screen.getByText("Whole-book OCR supports PDFs of up to 500 pages.")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Start whole-book OCR" })).toBeDisabled();
  });
  it("pauses and cancels active work when the tab is hidden and resumes only after a user action", async () => {
    const api = ocrApi({ create: vi.fn().mockResolvedValue({ ...OCR_JOB, physicalPage: 1, state: "queued", resultId: null }), status: vi.fn().mockResolvedValue({ ...OCR_JOB, physicalPage: 1, state: "queued", resultId: null }) });
    render(panel(api)); await open(); fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange"));
    await screen.findByText("Page hidden; OCR paused. Return to resume missing pages."); expect(api.cancel).toHaveBeenCalledWith(OCR_JOB.id);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); fireEvent(document, new Event("visibilitychange"));
    expect(api.create).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeEnabled();
  });
  it("shows failure and page-quality flags separately and navigates only on explicit review", async () => {
    const review = vi.fn(); const progress: LocalOcrBookProgress = { ...OCR_BOOK_PROGRESS, pages: [{ ...OCR_BOOK_PROGRESS.pages[0]!, status: "low_confidence", truncated: true }] };
    const api = ocrApi({ bookProgress: vi.fn().mockImplementation(async () => structuredClone(progress)), create: vi.fn().mockResolvedValue({ ...OCR_JOB, physicalPage: 1, state: "failed", resultId: null, errorCode: "engine_failed" }) });
    render(panel(api, { review })); await open(); expect(screen.getByText(/1 need review/)).toBeInTheDocument(); expect(review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review page 2" })); expect(review).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" })); await screen.findByText(/Stopped at PDF page 1/);
    fireEvent.click(screen.getByRole("button", { name: "Review failed page" })); expect(review).toHaveBeenLastCalledWith(1); expect(api.create).toHaveBeenCalledTimes(1);
  });
  it("drops old account/source progress immediately and ignores a late private response", async () => {
    let finish!: (book: LocalOcrBookProgress) => void;
    const api = ocrApi({ bookProgress: vi.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ ...OCR_BOOK_PROGRESS, sourceId: "source-two", pages: [] }) });
    const view = render(panel(api)); fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" }));
    view.rerender(panel(api, { source: "source-two", account: "member-two" })); await act(async () => finish(OCR_BOOK_PROGRESS));
    expect(screen.queryByRole("link", { name: "Export saved text .txt" })).not.toBeInTheDocument(); expect(screen.getByText(/0\/3 pages processed/)).toBeInTheDocument();
  });
  it("blocks book execution during current-page OCR and opens the existing pairing tutorial", async () => {
    const api = ocrApi(); render(panel(api, { blocked: true })); await open(); expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Manage OCR connection" })); await screen.findByRole("dialog", { name: "Connect OCR" });
    expect(screen.getByRole("button", { name: "Generate pairing code" })).toBeInTheDocument(); expect(api.create).not.toHaveBeenCalled();
  });
  it("refreshes paused checkpoints without dispatching new work", async () => {
    const api = ocrApi(); render(panel(api)); await open();
    vi.mocked(api.bookProgress).mockResolvedValue({ ...OCR_BOOK_PROGRESS, pages: [OCR_BOOK_PROGRESS.pages[0]!, { ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: 1 }] });
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved progress" })); await screen.findByText(/2\/3 pages processed/); expect(api.create).not.toHaveBeenCalled();
  });
  it("cancels active work on leaving the Reader", async () => {
    const api = ocrApi({ create: vi.fn().mockResolvedValue({ ...OCR_JOB, physicalPage: 1, state: "queued", resultId: null }) });
    const view = render(panel(api)); await open(); fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" })); await waitFor(() => expect(api.create).toHaveBeenCalled()); view.unmount();
    expect(api.cancel).toHaveBeenCalledWith(OCR_JOB.id); expect(api.create).toHaveBeenCalledTimes(1);
  });
});
