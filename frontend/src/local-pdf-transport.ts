import type { PDFDataRangeTransport } from "pdfjs-dist";

/** Read requested ranges from the selected local file, never buffer its whole contents. */
export function localPdfTransport(
  Transport: typeof PDFDataRangeTransport,
  file: File,
  onError: (error: unknown) => void,
): PDFDataRangeTransport {
  return new class extends Transport {
    private stopped = false;
    constructor() { super(file.size, new Uint8Array(), true, file.name); }
    override requestDataRange(begin: number, end: number): void {
      void file.slice(begin, end).arrayBuffer().then((buffer) => {
        if (!this.stopped) this.onDataRange(begin, new Uint8Array(buffer));
      }).catch((error: unknown) => { if (!this.stopped) { this.stopped = true; onError(error); } });
    }
    override abort(): void { this.stopped = true; }
  }();
}
