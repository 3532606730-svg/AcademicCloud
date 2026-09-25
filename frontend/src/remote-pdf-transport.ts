import type { PDFDataRangeTransport } from "pdfjs-dist";

/** Renew the authorized URL per needed range while retaining PDF.js's page cache. */
export function remotePdfTransport(
  Transport: typeof PDFDataRangeTransport,
  size: number,
  getUrl: () => Promise<string>,
  onError: (error: unknown) => void,
  fetcher: typeof fetch = fetch,
): PDFDataRangeTransport {
  return new class extends Transport {
    private controller = new AbortController();
    constructor() { super(size, new Uint8Array(), true); }
    override requestDataRange(begin: number, end: number): void {
      void (async () => {
        const url = await getUrl();
        if (this.controller.signal.aborted) return;
        const response = await fetcher(url, { signal: this.controller.signal, credentials: "omit", headers: { Range: `bytes=${begin}-${end - 1}` } });
        if (response.status !== 206) { await response.body?.cancel(); throw new Error("PDF range request failed"); }
        const range = response.headers.get("content-range");
        const expectedEnd = Math.min(end, size);
        if (range !== `bytes ${begin}-${expectedEnd - 1}/${size}`) { await response.body?.cancel(); throw new Error("PDF range identity mismatch"); }
        if (!response.body) throw new Error("PDF range body missing");
        const reader = response.body.getReader();
        const bytes = new Uint8Array(expectedEnd - begin); let offset = 0;
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            if (offset + chunk.value.length > bytes.length) throw new Error("PDF range length mismatch");
            bytes.set(chunk.value, offset); offset += chunk.value.length;
          }
        } finally { await reader.cancel().catch(() => {}); }
        if (offset !== bytes.length) throw new Error("PDF range length mismatch");
        if (!this.controller.signal.aborted) this.onDataRange(begin, bytes);
      })().catch((error: unknown) => {
        if (this.controller.signal.aborted) return;
        this.controller.abort(); onError(error);
      });
    }
    override abort(): void { this.controller.abort(); }
  }();
}
