import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { PdfReader, type PdfReaderProps } from "./pdf-reader.tsx";
import { LanguageProvider } from "./i18n-react.tsx";
import { OCR_BOOK_DEVICE, OCR_BOOK_JOB, OCR_BOOK_PROGRESS, OCR_JOB, OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";
import type { LocalOcrApi, LocalOcrResult } from "./local-ocr-api.ts";
import { CurrentPageOcr } from "./local-ocr-ui.tsx";

const engine = vi.hoisted(() => ({ render: vi.fn(), pages: [] as number[] }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  PDFDataRangeTransport: class { transportReady() {} onDataRange() {} },
  getDocument: () => ({ destroy: async () => {}, promise: Promise.resolve({ numPages: 10, getPage: async (page: number) => {
    engine.pages.push(page);
    return { rotate: 90, userUnit: 1, view: [0, 0, 600, 800], cleanup() {}, streamTextContent() {}, getViewport: ({ scale, rotation }: { scale: number; rotation: number }) => ({ width: (rotation % 180 ? 800 : 600) * scale, height: (rotation % 180 ? 600 : 800) * scale, scale }), render: engine.render };
  } }) }),
  TextLayer: class { container: HTMLElement; constructor({ container }: { container: HTMLElement }) { this.container = container; } async render() { this.container.textContent = "Native text"; } cancel() {} },
}));
beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en"); engine.pages = []; engine.render.mockReset().mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(632);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never); HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.removeItem("academiccloud.language"); });
function open(api: LocalOcrApi = ocrApi({ results: vi.fn().mockResolvedValue([]) })) {
  const base: PdfReaderProps = { url: "/book.pdf", title: "Book", page: 2, onPageChange: vi.fn(), localOcr: { api, accountId: "member-one", resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId } };
  const ui = (props: PdfReaderProps) => <LanguageProvider><PdfReader {...props} /></LanguageProvider>;
  return { ...render(ui(base)), api, base, ui };
}
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Current page OCR" })).toBeEnabled()); }
describe("actual Reader OCR paint boundary", () => {
  it("collapses open reading panels on focus entry, preserves the OCR draft and leaves background work active", async () => {
    const job = { ...OCR_BOOK_JOB, pageCount: 10, state: "running" as const };
    const api = ocrApi({ devices: vi.fn().mockResolvedValue([OCR_BOOK_DEVICE]), books: vi.fn().mockResolvedValue([job]) });
    const view = open(api);
    fireEvent.click(screen.getByRole("button", { name: /Private OCR results/ }));
    const draft = await screen.findByRole("textbox", { name: "Corrected text" });
    fireEvent.change(draft, { target: { value: "Unsaved OCR correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" }));
    await screen.findByRole("button", { name: "Pause book OCR" });
    fireEvent.click(screen.getByRole("button", { name: "Search / export" }));
    expect(screen.getByRole("textbox", { name: "Search native PDF text" })).toBeInTheDocument();
    view.rerender(view.ui({ ...view.base, focusReading: true }));
    expect(screen.queryByRole("textbox", { name: "Corrected text" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause book OCR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search native PDF text" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Private OCR results/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Whole-book OCR" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Private OCR results/ }));
    expect(await screen.findByRole("textbox", { name: "Corrected text" })).toHaveValue("Unsaved OCR correction");
    fireEvent.click(screen.getByRole("button", { name: "Collapse current-page OCR" }));
    expect(screen.queryByRole("textbox", { name: "Corrected text" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" }));
    await screen.findByRole("button", { name: "Pause book OCR" });
    fireEvent.click(screen.getByRole("button", { name: "Collapse whole-book OCR" }));
    expect(screen.queryByRole("button", { name: "Pause book OCR" })).not.toBeInTheDocument();
    expect(api.pauseBook).not.toHaveBeenCalled(); expect(api.cancelBook).not.toHaveBeenCalled();
    expect(api.correct).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); expect(api.createBook).not.toHaveBeenCalled();
  });
  it("keeps OCR disabled while the page paint is pending, including paused navigation", async () => {
    let finish!: () => void; engine.render.mockImplementationOnce(() => ({ promise: new Promise<void>((resolve) => { finish = resolve; }), cancel: vi.fn() }));
    const view = open(); expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled();
    await waitFor(() => expect(engine.render).toHaveBeenCalled()); await act(async () => finish()); await ready();
    view.rerender(view.ui({ ...view.base, navigationPending: true })); expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled();
    view.rerender(view.ui({ ...view.base, navigationPending: false })); await ready();
  });
  it("renders the bound PDF page at OCR dimensions/rotation and cancels capture when page or local source changes", async () => {
    const view = open(); await ready(); await waitFor(() => expect(view.api.devices).toHaveBeenCalled());
    let reject!: (error: Error) => void; const cancel = vi.fn(() => reject(new Error("cancelled")));
    engine.render.mockImplementationOnce(() => ({ promise: new Promise<void>((_yes, no) => { reject = no; }), cancel }));
    fireEvent.click(screen.getByRole("button", { name: "Current page OCR" }));
    await waitFor(() => expect(engine.render).toHaveBeenCalledTimes(2));
    const capture = engine.render.mock.calls[1]![0] as { canvas: HTMLCanvasElement; viewport: { width: number; height: number } };
    expect(capture.canvas.width).toBe(2000); expect(capture.canvas.height).toBe(1500); expect(engine.pages).toEqual([2]);
    view.rerender(view.ui({ ...view.base, page: 3 })); await ready();
    expect(cancel).toHaveBeenCalled(); expect(view.api.create).not.toHaveBeenCalled();
    expect(engine.pages).toEqual([2, 3]);
    const local = new File(["pdf"], "book.pdf", { type: "application/pdf" });
    view.rerender(view.ui({ ...view.base, localFile: local })); expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled(); await ready();
  });
  it("invalidates the painted capture when rotation changes", async () => {
    const view = open(); await ready();
    let finish!: () => void; engine.render.mockImplementationOnce(() => ({ promise: new Promise<void>((resolve) => { finish = resolve; }), cancel: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate right" })); expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled();
    await waitFor(() => expect(engine.render).toHaveBeenCalledTimes(2)); await act(async () => finish()); await ready(); expect(view.api.create).not.toHaveBeenCalled();
  });
  it("does not route dialog arrow keys into page navigation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const view = open(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Connect OCR" }));
    const back = screen.getByRole("button", { name: "Back to reading" }); fireEvent.keyDown(back, { key: "ArrowRight" });
    expect(view.base.onPageChange).not.toHaveBeenCalled(); fireEvent.click(back); expect(screen.getByRole("button", { name: "Connect OCR" })).toHaveFocus();
  });
  it("processes missing physical pages with intrinsic rotation without changing the displayed page or its rotation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      const blob = new Blob(["png"], { type: "image/png" }); Object.defineProperty(blob, "arrayBuffer", { value: async () => new TextEncoder().encode("png").buffer }); callback(blob);
    });
    const view = open(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Rotate right" })); await ready();
    const book = { ...structuredClone(OCR_BOOK_PROGRESS), pageCount: 10 };
    const results = new Map<string, LocalOcrResult>();
    vi.mocked(view.api.bookProgress).mockImplementation(async () => structuredClone(book));
    vi.mocked(view.api.create).mockImplementation(async (input) => {
      const result = { ...OCR_RESULT, id: `result-${input.physicalPage}`, physicalPage: input.physicalPage, imageWidth: input.imageWidth, imageHeight: input.imageHeight, rotation: input.rotation, imageSha256: createHash("sha256").update("png").digest("hex"), correctedText: null };
      results.set(result.id, result); return { ...OCR_JOB, id: `job-${input.physicalPage}`, physicalPage: input.physicalPage, resultId: result.id };
    });
    vi.mocked(view.api.result).mockImplementation(async (id) => {
      const result = results.get(id)!; book.pages.push({ ...OCR_BOOK_PROGRESS.pages[0]!, physicalPage: result.physicalPage, resultId: id }); book.quota.used++; book.quota.remaining--; return result;
    });
    fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" })); await screen.findByRole("button", { name: "Resume missing pages" });
    fireEvent.click(screen.getByRole("button", { name: "Resume missing pages" })); await screen.findByText("All pages processed.");
    expect(vi.mocked(view.api.create).mock.calls.map((call) => call[0].physicalPage)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(view.api.create).toHaveBeenCalledWith(expect.objectContaining({ physicalPage: 1, rotation: 90, imageWidth: 2000, imageHeight: 1500 }));
    expect(view.base.onPageChange).not.toHaveBeenCalled(); expect(screen.getByRole("spinbutton", { name: "PDF page number" })).toHaveValue(2);
    const frames = engine.render.mock.calls.map((call) => call[0] as { canvas: HTMLCanvasElement; background?: string }).filter((call) => call.background);
    expect(frames).toHaveLength(9); expect(frames.every((frame) => frame.canvas.width === 0 && frame.canvas.height === 0)).toBe(true);
  });
  it("refreshes saved current-page history while preserving the selected result and unsaved correction draft", async () => {
    const newer = { ...OCR_RESULT, id: "result-newer", correctedText: null, machine: { ...OCR_RESULT.machine, text: "New machine text" } };
    const api = ocrApi(); const painted = { capture: vi.fn(), isCurrent: () => true };
    const connection = { api, accountId: "member-one", resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId };
    const ui = (refreshVersion: number) => <LanguageProvider><CurrentPageOcr connection={connection} physicalPage={2} painted={painted} refreshVersion={refreshVersion} /></LanguageProvider>;
    const view = render(ui(0)); fireEvent.click(screen.getByRole("button", { name: /Private OCR results/ })); const input = await screen.findByRole("textbox", { name: "Corrected text" });
    fireEvent.change(input, { target: { value: "My retained draft" } }); vi.mocked(api.results).mockResolvedValue([newer, OCR_RESULT]); view.rerender(ui(1));
    await waitFor(() => expect(api.results).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("textbox", { name: "Corrected text" })).toHaveValue("My retained draft"); expect(screen.getByRole("combobox", { name: "Current page history (latest 20)" })).toHaveValue(OCR_RESULT.id);
    expect(api.correct).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
  });
  it.each(["queued", "running"] as const)("restores %s background work, blocks current-page OCR, and preserves private history/drafts through pause", async (state) => {
    const job = { ...OCR_BOOK_JOB, pageCount: 10, state }; const paused = { ...job, state: "paused" as const };
    const api = ocrApi({ devices: vi.fn().mockResolvedValue([OCR_BOOK_DEVICE]), books: vi.fn().mockResolvedValue([job]), pauseBook: vi.fn().mockResolvedValue(paused) });
    const view = open(api); await waitFor(() => expect(engine.render).toHaveBeenCalled());
    await screen.findByText(state === "queued" ? "Background job queued; waiting for the selected connector." : "Your device is recognizing in the background. You can close the website.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /Private OCR results/ })); const draft = await screen.findByRole("textbox", { name: "Corrected text" });
    fireEvent.change(draft, { target: { value: "My private draft during background OCR" } });
    const newer = { ...OCR_RESULT, id: "later-machine-result", correctedText: null, machine: { ...OCR_RESULT.machine, text: "Later machine text" } };
    vi.mocked(api.results).mockResolvedValue([newer, OCR_RESULT]); fireEvent.click(screen.getByRole("button", { name: "Whole-book OCR" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved progress" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Current page history (latest 20)" }).querySelectorAll("option")).toHaveLength(2));
    expect(draft).toHaveValue("My private draft during background OCR"); expect(screen.getByRole("combobox", { name: "Current page history (latest 20)" })).toHaveValue(OCR_RESULT.id);
    fireEvent.click(screen.getByRole("button", { name: "Pause book OCR" })); await ready(); expect(api.pauseBook).toHaveBeenCalledWith(job.id);
    expect(draft).toHaveValue("My private draft during background OCR"); expect(api.correct).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); expect(api.createBook).not.toHaveBeenCalled();
    view.unmount(); expect(api.cancelBook).not.toHaveBeenCalled();
  });
});
