import { afterEach, describe, expect, it, vi } from "vitest";
import type { PDFPageProxy } from "pdfjs-dist";
import { webcrypto } from "node:crypto";
import { boundedOcrSize, captureOcrFrame } from "./local-ocr-frame.ts";

afterEach(() => { vi.unstubAllGlobals(); });
function page() {
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }));
  return { page: { getViewport, render } as unknown as PDFPageProxy, render, getViewport };
}
describe("bounded OCR PDF frame", () => {
  it("respects portrait/landscape/dimension/pixel bounds without using the display canvas", () => {
    for (const [width, height] of [[600, 800], [9000, 1000], [1000, 9000], [50000, 50000], [3300, 4600]]) {
      const bounded = boundedOcrSize(width!, height!);
      expect(bounded.width).toBeLessThanOrEqual(2000); expect(bounded.height).toBeLessThanOrEqual(2800); expect(bounded.width * bounded.height).toBeLessThanOrEqual(5_600_000);
    }
    expect(() => boundedOcrSize(Infinity, 10)).toThrow(); expect(() => boundedOcrSize(0, 10)).toThrow();
  });
  it("renders a fresh PNG and rejects oversized encoded bytes before transport", async () => {
    const p = page(); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) { expect(this.width).toBe(2000); expect(this.height).toBe(2666); cb(new Blob([new Uint8Array(2_097_153)], { type: "image/png" })); });
    await expect(captureOcrFrame(p.page, 90, () => true, new AbortController().signal)).rejects.toThrow("ocr_image_too_large");
    expect(p.render).toHaveBeenCalledWith(expect.objectContaining({ background: "rgb(255,255,255)" }));
    expect(p.getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 90 });
  });
  it("returns only a static bounded PNG with a digest matching its submitted bytes", async () => {
    const p = page(); const blob = new Blob(["png"], { type: "image/png" }); Object.defineProperty(blob, "arrayBuffer", { value: async () => new TextEncoder().encode("png").buffer });
    vi.stubGlobal("crypto", webcrypto); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((_cb) => _cb(blob));
    const frame = await captureOcrFrame(p.page, 0, () => true, new AbortController().signal);
    expect(frame.imageBase64).toBe("cG5n"); expect(frame.previewUrl).toBe("data:image/png;base64,cG5n"); expect(frame.imageSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(frame.imageWidth).toBe(2000); expect(frame.imageHeight).toBe(2666);
  });
  it("rejects a page switch during PNG encoding and releases the temporary canvas", async () => {
    const p = page(); let callback: BlobCallback | null = null; let canvas: HTMLCanvasElement | null = null; let current = true;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) { callback = cb; canvas = this; });
    const operation = captureOcrFrame(p.page, 0, () => current, new AbortController().signal);
    await vi.waitFor(() => expect(callback).not.toBeNull()); current = false; callback!(new Blob(["png"], { type: "image/png" }));
    await expect(operation).rejects.toThrow("ocr_frame_changed"); expect(canvas!.width).toBe(0); expect(canvas!.height).toBe(0);
  });
  it("aborts a pending PDF render when its source changes", async () => {
    const p = page(); let reject!: (error: Error) => void; const cancel = vi.fn(() => reject(new Error("render cancelled")));
    p.render.mockReturnValue({ promise: new Promise<void>((_yes, no) => { reject = no; }), cancel });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    const abort = new AbortController(); const operation = captureOcrFrame(p.page, 0, () => true, abort.signal); abort.abort();
    await expect(operation).rejects.toThrow(); expect(cancel).toHaveBeenCalled();
  });
});
