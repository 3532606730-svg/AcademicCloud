import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfReader, type PdfReaderProps } from "./pdf-reader.tsx";
import { LanguageProvider } from "./i18n-react.tsx";

const engine = vi.hoisted(() => ({ renders: 0, texts: 0, loads: 0 }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => {
    engine.loads++;
    return { destroy: async () => {}, promise: Promise.resolve({ numPages: 16, getPage: async () => ({
      rotate: 0, userUnit: 1, view: [0, 0, 600, 800], cleanup() {}, streamTextContent() {},
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale, convertToPdfPoint: (x: number, y: number) => [x / scale, 800 - y / scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (800 - y) * scale] }),
      render: () => { engine.renders++; return { promise: Promise.resolve(), cancel() {} }; },
    }) }) };
  },
  TextLayer: class {
    container: HTMLElement;
    constructor({ container }: { container: HTMLElement }) { this.container = container; }
    async render() { engine.texts++; this.container.textContent = "Synthetic passage"; }
    cancel() {}
  },
}));
const rect = { x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800, toJSON() {} };
beforeEach(() => {
  engine.renders = engine.texts = engine.loads = 0;
  window.localStorage.setItem("academiccloud.language", "en");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(632);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  HTMLElement.prototype.scrollTo = vi.fn();
  window.getSelection()?.removeAllRanges();
});
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.removeItem("academiccloud.language"); });
function open(props: Partial<PdfReaderProps> = {}) {
  const base: PdfReaderProps = { url: "/test.pdf", title: "Test", page: 2, onPageChange: vi.fn(), ...props };
  const ui = (next: PdfReaderProps) => <LanguageProvider><PdfReader {...next} /></LanguageProvider>;
  return { ...render(ui(base)), base, ui };
}
async function ready() { await waitFor(() => { expect(document.querySelector(".textLayer")?.textContent).toBe("Synthetic passage"); expect(document.querySelector(".pdf-reader__viewport")).toHaveAttribute("aria-busy", "false"); }); }
async function selectPassage() {
  const range = window.document.createRange(); range.selectNodeContents(document.querySelector(".textLayer")!);
  range.getClientRects = () => [{ ...rect, width: 100, height: 20, right: 100, bottom: 20 }] as unknown as DOMRectList;
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  fireEvent(document, new Event("selectionchange"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Highlight selection" })).toBeEnabled());
}
describe("reader interaction", () => {
  it("paints a pending highlight before a slow save and does not rerender the PDF", async () => {
    let finish!: () => void;
    const save = vi.fn((_draft: Parameters<NonNullable<PdfReaderProps["onCreateHighlight"]>>[0]) => new Promise<void>((resolve) => { finish = resolve; }));
    const view = open({ onCreateHighlight: save }); await ready(); await selectPassage();
    fireEvent.click(screen.getByRole("button", { name: "Highlight selection" }));
    await waitFor(() => expect(document.querySelectorAll(".pdf-reader__highlights span")).toHaveLength(1));
    expect(screen.getByText("Saving highlight…")).toBeInTheDocument();
    const draft = save.mock.calls[0]![0];
    await act(async () => { view.rerender(view.ui({ ...view.base, highlights: [{ ...draft, id: "saved" }] })); finish(); });
    expect(screen.getByText("Highlight saved")).toBeInTheDocument();
    expect(document.querySelectorAll(".pdf-reader__highlights span")).toHaveLength(1);
    expect([engine.loads, engine.renders, engine.texts]).toEqual([1, 1, 1]);
  });
  it("removes a failed temporary highlight and retains the draft for retry", async () => {
    let reject!: (error: Error) => void;
    open({ onCreateHighlight: () => new Promise<void>((_, no) => { reject = no; }) }); await ready(); await selectPassage();
    fireEvent.click(screen.getByRole("button", { name: "Highlight selection" }));
    await act(async () => reject(new Error("offline")));
    expect(screen.getByText("Highlight was not saved; please retry")).toBeInTheDocument();
    expect(document.querySelectorAll(".pdf-reader__highlights span")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Highlight selection" })).toBeEnabled();
  });
  it("ignores a save response belonging to a replaced document", async () => {
    let finish!: () => void;
    const view = open({ onCreateHighlight: () => new Promise<void>((resolve) => { finish = resolve; }) });
    await ready(); await selectPassage(); fireEvent.click(screen.getByRole("button", { name: "Highlight selection" }));
    view.rerender(view.ui({ ...view.base, url: "/other.pdf" })); await ready();
    await act(async () => finish());
    expect(document.querySelectorAll(".pdf-reader__highlights span")).toHaveLength(0);
    expect(screen.queryByText("Highlight saved")).not.toBeInTheDocument();
  });
  it("handles arrows inside the reader but preserves inputs and modified keys", async () => {
    const go = vi.fn(); open({ onPageChange: go }); await ready();
    const viewport = screen.getByRole("region", { name: /^PDF page;/ });
    fireEvent.keyDown(viewport, { key: "ArrowRight" }); fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    expect(go.mock.calls).toEqual([[3], [1]]);
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "PDF page number" }), { key: "ArrowLeft" });
    fireEvent.keyDown(viewport, { key: "ArrowRight", ctrlKey: true }); fireEvent.keyDown(viewport, { key: "ArrowRight", repeat: true });
    expect(go).toHaveBeenCalledTimes(2); expect(screen.queryByRole("link", { name: "Licenses" })).not.toBeInTheDocument();
  });
  it("only turns at scroll edges and suppresses repeated momentum", async () => {
    const go = vi.fn(); open({ onPageChange: go }); await ready();
    const viewport = screen.getByRole("region", { name: /^PDF page;/ });
    Object.defineProperties(viewport, { clientHeight: { value: 400 }, scrollHeight: { value: 800 } });
    viewport.scrollTop = 100; fireEvent.wheel(viewport, { deltaY: 100, deltaX: 0, deltaMode: 0 }); expect(go).not.toHaveBeenCalled();
    viewport.scrollTop = 400; fireEvent.wheel(viewport, { deltaY: 100, deltaX: 0, deltaMode: 0 }); fireEvent.wheel(viewport, { deltaY: 100, deltaX: 0, deltaMode: 0 });
    expect(go.mock.calls).toEqual([[3]]);
    viewport.scrollTop = 0; fireEvent.wheel(viewport, { deltaY: -100, deltaX: 0, deltaMode: 0 }); expect(go.mock.calls).toEqual([[3], [1]]);
  });
});
