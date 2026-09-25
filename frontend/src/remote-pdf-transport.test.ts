import type { PDFDataRangeTransport } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import { remotePdfTransport } from "./remote-pdf-transport.ts";
class TransportDouble {
  onDataRange = vi.fn();
  constructor(_size: number, _data: Uint8Array, _done: boolean) {}
}
function setup(fetcher: ReturnType<typeof vi.fn>, getUrl = vi.fn().mockResolvedValue("https://files.test/first")) {
  const onError = vi.fn();
  const transport = remotePdfTransport(TransportDouble as unknown as typeof PDFDataRangeTransport, 10, getUrl, onError, fetcher as typeof fetch);
  return { transport, onError, getUrl };
}
function response(range = "bytes 0-3/10", bytes = new Uint8Array([1, 2, 3, 4]), status = 206) {
  return { status, headers: new Headers({ "content-range": range }), body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
}
describe("remote PDF ranges", () => {
  it("uses renewed authorization for each request and delivers only the requested bytes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response("bytes 4-7/10"));
    const getUrl = vi.fn().mockResolvedValueOnce("https://files.test/old").mockResolvedValueOnce("https://files.test/new");
    const f = setup(fetcher, getUrl);
    f.transport.requestDataRange(0, 4);
    await vi.waitFor(() => expect(f.transport.onDataRange).toHaveBeenCalledTimes(1));
    f.transport.requestDataRange(4, 8);
    await vi.waitFor(() => expect(f.transport.onDataRange).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://files.test/old", expect.objectContaining({ credentials: "omit", headers: { Range: "bytes=0-3" } }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://files.test/new", expect.objectContaining({ headers: { Range: "bytes=4-7" } }));
    expect(f.transport.onDataRange).toHaveBeenLastCalledWith(4, new Uint8Array([1, 2, 3, 4]));
    expect(f.onError).not.toHaveBeenCalled();
  });
  it.each([
    ["wrong start", "bytes 1-4/10", 4, 206],
    ["wrong total", "bytes 0-3/11", 4, 206],
    ["short body", "bytes 0-3/10", 3, 206],
    ["full response", "bytes 0-3/10", 4, 200],
  ])("rejects %s before passing bytes to PDF.js", async (_name, range, length, status) => {
    const f = setup(vi.fn().mockResolvedValue(response(String(range), new Uint8Array(Number(length)), Number(status))));
    f.transport.requestDataRange(0, 4);
    await vi.waitFor(() => expect(f.onError).toHaveBeenCalledTimes(1));
    expect(f.transport.onDataRange).not.toHaveBeenCalled();
  });
  it("does not deliver a body that finishes after abort", async () => {
    let finish!: () => void;
    const pendingResponse = response();
    const getReader = vi.fn();
    pendingResponse.body = new ReadableStream<Uint8Array>({ start(controller) { finish = () => { controller.enqueue(new Uint8Array([1,2,3,4])); controller.close(); }; } });
    const originalGetReader = pendingResponse.body.getReader.bind(pendingResponse.body);
    getReader.mockImplementation(originalGetReader);
    pendingResponse.body.getReader = getReader;
    const fetcher = vi.fn().mockResolvedValue(pendingResponse); const f = setup(fetcher);
    f.transport.requestDataRange(0, 4);
    await vi.waitFor(() => expect(getReader).toHaveBeenCalled());
    f.transport.abort(); finish();
    await Promise.resolve(); await Promise.resolve();
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(f.transport.onDataRange).not.toHaveBeenCalled(); expect(f.onError).not.toHaveBeenCalled();
  });
  it("does not fetch when authorization resolves after abort", async () => {
    let finish!: (url: string) => void; const url = new Promise<string>((resolve) => { finish = resolve; });
    const fetcher = vi.fn(); const f = setup(fetcher, vi.fn().mockReturnValue(url));
    f.transport.requestDataRange(0, 4); f.transport.abort(); finish("https://files.test/late");
    await url; await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled(); expect(f.onError).not.toHaveBeenCalled();
  });
});
