import { afterEach, describe, expect, it, vi } from "vitest";
import type { PDFPageProxy } from "pdfjs-dist";
import { createHash, webcrypto } from "node:crypto";
import { boundedOcrSize, captureOcrFrame } from "./local-ocr-frame.ts";
import { LocalOcrController } from "./local-ocr-controller.ts";
import { OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";

afterEach(() => { vi.unstubAllGlobals(); });
function page() {
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }));
  return { page: { getViewport, render } as unknown as PDFPageProxy, render, getViewport };
}
function smallPng(text = "fit-png") {
  const blob = new Blob([text], { type: "image/png" });
  Object.defineProperty(blob, "arrayBuffer", { configurable: true, value: async () => new TextEncoder().encode(text).buffer });
  return blob;
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
  it("fits an oversized book PNG before transport and hashes only its final scaled frame", async () => {
    const p = page(); const encoded = smallPng(); const renders: Array<{ width: number; height: number; scale: number }> = [];
    p.render.mockImplementation(({ canvas, viewport }) => {
      renders.push({ width: canvas.width, height: canvas.height, scale: viewport.width / 600 });
      return { promise: Promise.resolve(), cancel: vi.fn() };
    });
    vi.stubGlobal("crypto", webcrypto); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementationOnce((callback) => callback(new Blob([new Uint8Array(4_194_304)], { type: "image/png" }))).mockImplementation((callback) => callback(encoded));
    const frame = await captureOcrFrame(p.page, 90, () => true, new AbortController().signal, true);
    expect(renders).toHaveLength(2); expect(renders[0]).toMatchObject({ width: 2000, height: 2666 });
    expect(renders[1]!.scale).toBeLessThan(renders[0]!.scale); expect(frame.imageWidth).toBe(renders[1]!.width); expect(frame.imageHeight).toBe(renders[1]!.height);
    expect(frame.imageSha256).toBe(createHash("sha256").update("fit-png").digest("hex")); expect(frame.imageBase64).toBe(Buffer.from("fit-png").toString("base64")); expect(frame.rotation).toBe(90);
    expect(p.getViewport.mock.calls.every((call) => (call[0] as unknown as { rotation: number }).rotation === 90)).toBe(true);
    const canvas = p.render.mock.calls[0]![0].canvas as HTMLCanvasElement; expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it("keeps an ordinary book page at the original full OCR dimensions", async () => {
    const p = page(); vi.stubGlobal("crypto", webcrypto); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(smallPng()));
    const frame = await captureOcrFrame(p.page, 0, () => true, new AbortController().signal, true);
    expect(p.render).toHaveBeenCalledTimes(1); expect(frame.imageWidth).toBe(2000); expect(frame.imageHeight).toBe(2666);
  });
  it("bounds fitting to five renders, uses a final 400k-pixel fallback and fails before transport if none fits", async () => {
    const p = page(); const pixels: number[] = []; const oversized = new Blob([new Uint8Array(2_097_153)], { type: "image/png" });
    p.render.mockImplementation(({ canvas }) => { pixels.push(canvas.width * canvas.height); return { promise: Promise.resolve(), cancel: vi.fn() }; });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(oversized));
    const api = ocrApi(); const controller = new LocalOcrController(api);
    await expect(controller.recognize({ resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, physicalPage: 1 }, OCR_RESULT.deviceId,
      { capture: (signal) => captureOcrFrame(p.page, 0, () => true, signal, true), isCurrent: () => true }, vi.fn())).rejects.toThrow("ocr_image_too_large");
    expect(pixels).toHaveLength(5); expect(pixels[4]).toBeLessThanOrEqual(400_000); expect(pixels.every((value, index) => index === 0 || value < pixels[index - 1]!)).toBe(true);
    expect(api.create).not.toHaveBeenCalled(); expect((p.render.mock.calls[0]![0].canvas as HTMLCanvasElement).width).toBe(0);
  });
  it("rejects a source change during a fitting encode without another render or a late OCR submission", async () => {
    const p = page(); let callback: BlobCallback | null = null; let current = true;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementationOnce((cb) => cb(new Blob([new Uint8Array(2_097_153)], { type: "image/png" }))).mockImplementation((cb) => { callback = cb; });
    const api = ocrApi(); const controller = new LocalOcrController(api);
    const operation = controller.recognize({ resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, physicalPage: 1 }, OCR_RESULT.deviceId,
      { capture: (signal) => captureOcrFrame(p.page, 0, () => current, signal, true), isCurrent: () => current }, vi.fn());
    await vi.waitFor(() => expect(callback).not.toBeNull()); current = false; callback!(smallPng());
    expect(await operation).toBeNull(); expect(p.render).toHaveBeenCalledTimes(2); expect(api.create).not.toHaveBeenCalled();
  });
  it("cancels a pending reduced render and releases its canvas without further attempts", async () => {
    const p = page(); let reject!: (error: Error) => void; const cancel = vi.fn(() => reject(new Error("render cancelled")));
    p.render.mockImplementationOnce(() => ({ promise: Promise.resolve(), cancel: vi.fn() })).mockImplementation(() => ({ promise: new Promise<void>((_yes, no) => { reject = no; }), cancel }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob([new Uint8Array(2_097_153)], { type: "image/png" })));
    const abort = new AbortController(); const operation = captureOcrFrame(p.page, 0, () => true, abort.signal, true);
    await vi.waitFor(() => expect(p.render).toHaveBeenCalledTimes(2)); abort.abort();
    await expect(operation).rejects.toThrow("render cancelled"); expect(cancel).toHaveBeenCalled(); expect(p.render).toHaveBeenCalledTimes(2); expect((p.render.mock.calls[0]![0].canvas as HTMLCanvasElement).width).toBe(0);
  });
  it("checks source authority after reading final PNG bytes and before hashing them", async () => {
    const p = page(); let finish!: (value: ArrayBuffer) => void; let current = true; const blob = smallPng();
    Object.defineProperty(blob, "arrayBuffer", { configurable: true, value: () => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }) });
    const digest = vi.fn(); vi.stubGlobal("crypto", { subtle: { digest } }); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(blob));
    const operation = captureOcrFrame(p.page, 0, () => current, new AbortController().signal, true);
    await vi.waitFor(() => expect(finish).toBeDefined()); current = false; finish(new ArrayBuffer(1));
    await expect(operation).rejects.toThrow("ocr_frame_changed"); expect(digest).not.toHaveBeenCalled(); expect(p.render).toHaveBeenCalledTimes(1);
  });
});
