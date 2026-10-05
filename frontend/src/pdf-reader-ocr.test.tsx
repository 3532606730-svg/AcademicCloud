import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfReader, type PdfReaderProps } from "./pdf-reader.tsx";
import { LanguageProvider } from "./i18n-react.tsx";
import { OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";

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
function open() {
  const api = ocrApi({ results: vi.fn().mockResolvedValue([]) });
  const base: PdfReaderProps = { url: "/book.pdf", title: "Book", page: 2, onPageChange: vi.fn(), localOcr: { api, accountId: "member-one", resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId } };
  const ui = (props: PdfReaderProps) => <LanguageProvider><PdfReader {...props} /></LanguageProvider>;
  return { ...render(ui(base)), api, base, ui };
}
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Current page OCR" })).toBeEnabled()); }
describe("actual Reader OCR paint boundary", () => {
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
});
