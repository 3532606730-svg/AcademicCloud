import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WholeBookOcr } from "./local-ocr-book-ui.tsx";
import { LanguageProvider } from "./i18n-react.tsx";
import { OCR_BOOK_DEVICE, OCR_BOOK_JOB, OCR_BOOK_PROGRESS, OCR_DEVICE, OCR_FRAME, OCR_JOB, OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";
import type { LocalOcrApi, LocalOcrBookJob, LocalOcrBookProgress } from "./local-ocr-api.ts";
import type { BookOcrDocument } from "./local-ocr-book-controller.ts";
import { ApiError } from "./api.ts";

beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
  window.sessionStorage.clear();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
});
afterEach(() => { window.localStorage.removeItem("academiccloud.language"); vi.unstubAllGlobals(); });
const sourceDocument: BookOcrDocument = { capture: async () => OCR_FRAME, isCurrent: () => true };
function panel(api: LocalOcrApi, options: { pageCount?: number; source?: string; account?: string; document?: BookOcrDocument; blocked?: boolean; review?: (page: number) => void; busy?: (value: boolean) => void } = {}) {
  return <LanguageProvider><WholeBookOcr connection={{ api, accountId: options.account ?? "member-one", resourceId: OCR_RESULT.resourceId, sourceId: options.source ?? OCR_RESULT.sourceId }} document={options.document ?? sourceDocument} pageCount={options.pageCount ?? 3} blocked={options.blocked ?? false} onReview={options.review ?? vi.fn()} onBusyChange={options.busy} /></LanguageProvider>;
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

describe("device-owned background book controls", () => {
  const backgroundApi = (overrides: Partial<LocalOcrApi> = {}) => ocrApi({ devices: vi.fn().mockResolvedValue([OCR_BOOK_DEVICE]), ...overrides });
  it("starts once on the capable device and leaves work running when hidden or unmounted", async () => {
    const capture = vi.fn().mockResolvedValue(OCR_FRAME); const api = backgroundApi(); const busy = vi.fn();
    const view = render(panel(api, { document: { capture, isCurrent: () => true }, busy })); await open();
    expect(screen.getByText(/continues after you close the website/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" }));
    await waitFor(() => expect(api.createBook).toHaveBeenCalledTimes(1));
    expect(api.createBook).toHaveBeenCalledWith(expect.objectContaining({ deviceId: OCR_BOOK_DEVICE.id, resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, pageCount: 3, clientRequestId: expect.any(String) }));
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(true)); expect(capture).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange"));
    expect(api.pauseBook).not.toHaveBeenCalled(); expect(api.cancelBook).not.toHaveBeenCalled(); expect(api.cancel).not.toHaveBeenCalled();
    view.unmount(); expect(api.pauseBook).not.toHaveBeenCalled(); expect(api.cancelBook).not.toHaveBeenCalled(); expect(api.createBook).toHaveBeenCalledTimes(1);
  });
  it("restores running work after refresh and only explicit pause/cancel mutate it", async () => {
    let job: LocalOcrBookJob = { ...OCR_BOOK_JOB, state: "running" };
    const api = backgroundApi({ books: vi.fn().mockImplementation(async () => [job]), pauseBook: vi.fn().mockImplementation(async () => job = { ...job, state: "paused" }), cancelBook: vi.fn().mockImplementation(async () => job = { ...job, state: "cancelled" }) });
    const busy = vi.fn(); const view = render(panel(api, { busy })); await open(); await waitFor(() => expect(busy).toHaveBeenLastCalledWith(true));
    expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeDisabled(); expect(api.createBook).not.toHaveBeenCalled();
    view.unmount(); render(panel(api, { busy })); await open(); expect(api.createBook).not.toHaveBeenCalled(); expect(api.pauseBook).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause book OCR" })); await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(api.pauseBook).toHaveBeenCalledWith(job.id); expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel background job" })); await screen.findByText("Background job cancelled. Saved pages are retained.");
    expect(api.cancelBook).toHaveBeenCalledWith(job.id); expect(screen.getByRole("link", { name: "Export saved text .txt" })).toBeInTheDocument();
  });
  it("requires explicit resume after restart and can bind the job to a newly paired capable device", async () => {
    const old = { ...OCR_BOOK_DEVICE, online: false, revokedAt: "2026-10-06T01:00:00Z" }; const replacement = { ...OCR_BOOK_DEVICE, id: "paired-again", label: "Restarted computer" };
    const failed = { ...OCR_BOOK_JOB, state: "failed" as const, errorCode: "expired" as const, failedPhysicalPage: 3 };
    const api = backgroundApi({ devices: vi.fn().mockResolvedValue([old, replacement]), books: vi.fn().mockResolvedValue([failed]) });
    const view = render(panel(api)); await open(); expect(api.resumeBook).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Book OCR device" })).toHaveValue(replacement.id);
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" }));
    await waitFor(() => expect(api.resumeBook).toHaveBeenCalledWith(failed.id, replacement.id)); expect(api.createBook).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); view.unmount();
  });
  it("does not infer background transport support from an online OCR engine", async () => {
    const api = ocrApi({ books: vi.fn().mockResolvedValue([{ ...OCR_BOOK_JOB, state: "paused" }]), devices: vi.fn().mockResolvedValue([{ ...OCR_DEVICE, capabilities: OCR_BOOK_DEVICE.capabilities }]) });
    render(panel(api)); await open(); expect(screen.getByRole("option", { name: /Reader required/ })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeDisabled();
    expect(api.resumeBook).not.toHaveBeenCalled(); expect(api.createBook).not.toHaveBeenCalled();
  });
  it("reconciles an uncertain create after reload without automatically creating or resuming another job", async () => {
    const api = backgroundApi({ createBook: vi.fn().mockRejectedValue(new TypeError("Network response lost")) });
    const view = render(panel(api)); await open(); fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" }));
    await screen.findByText("Request outcome is unknown. Refresh the job before continuing."); const input = vi.mocked(api.createBook).mock.calls[0]![0];
    expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeDisabled(); view.unmount();
    vi.mocked(api.books).mockResolvedValue([{ ...OCR_BOOK_JOB, ...input, state: "running" }]);
    render(panel(api)); await open(); expect(api.createBook).toHaveBeenCalledTimes(1); expect(api.resumeBook).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeDisabled();
    expect(window.sessionStorage.length).toBe(0);
  });
  it("reuses the pending key only on an explicit retry when no job was found", async () => {
    const api = backgroundApi({ createBook: vi.fn().mockRejectedValueOnce(new TypeError("Network response lost")).mockImplementation(async (input) => ({ ...OCR_BOOK_JOB, ...input })) });
    const view = render(panel(api)); await open(); fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" }));
    await screen.findByText("Request outcome is unknown. Refresh the job before continuing."); const input = vi.mocked(api.createBook).mock.calls[0]![0]; view.unmount();
    render(panel(api)); await open(); expect(api.createBook).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" })); await waitFor(() => expect(api.createBook).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createBook).mock.calls[1]![0]).toEqual(input);
  });
  it("clears a definitively rejected start and never captures or dispatches under quota or stale-source conditions", async () => {
    const api = backgroundApi({ createBook: vi.fn().mockRejectedValue(new ApiError(503, "device_offline")) }); render(panel(api)); await open();
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" })); await screen.findByText("Device is offline. Start your connector, then resume."); expect(window.sessionStorage.length).toBe(0);
    vi.mocked(api.bookProgress).mockResolvedValue({ ...OCR_BOOK_PROGRESS, quota: { used: 500, limit: 500, remaining: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved progress" })); await screen.findByText(/Private results 500\/500/); expect(screen.getByRole("button", { name: "Resume missing pages" })).toBeDisabled();
    vi.mocked(api.bookProgress).mockRejectedValue(new ApiError(404, "source_changed")); fireEvent.click(screen.getByRole("button", { name: "Refresh saved progress" }));
    await screen.findByText("Source version changed. Reopen the resource."); expect(screen.queryByRole("link", { name: "Export saved text .txt" })).not.toBeInTheDocument(); expect(api.createBook).toHaveBeenCalledTimes(1);
  });
  it("rejects a late job from another source and never leaks its saved export links", async () => {
    let finish!: (jobs: LocalOcrBookJob[]) => void;
    const api = backgroundApi({ books: vi.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValue([]), bookProgress: vi.fn().mockImplementation(async (input) => ({ ...OCR_BOOK_PROGRESS, ...input, pages: [] })) });
    const view = render(panel(api)); fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" })); view.rerender(panel(api, { source: "source-two", account: "member-two" }));
    await act(async () => finish([OCR_BOOK_JOB])); await screen.findByText(/0\/3 pages processed/); expect(screen.queryByRole("button", { name: "Cancel background job" })).not.toBeInTheDocument(); expect(api.createBook).not.toHaveBeenCalled();
  });
});
