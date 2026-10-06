import { open, type FileHandle } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort } from "node:worker_threads";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { LOCAL_OCR_LIMITS, LOCAL_OCR_BOOK_LIMITS } from "@academiccloud/compute-contracts";

const CHUNK = 1024 * 1024;
const MAX_SOURCE = 1024 * 1024 * 1024;
const ATTEMPTS = 5;
const FALLBACK_PIXELS = 400_000;
async function readRange(file: FileHandle, begin: number, end: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(end - begin);
  let offset = 0;
  while (offset < bytes.length) {
    const read = await file.read(bytes, offset, bytes.length - offset, begin + offset);
    if (read.bytesRead < 1) throw Error('invalid_source');
    offset += read.bytesRead;
  }
  return bytes;
}

/** CPU PDF decoding/rendering is isolated from the connector's network heartbeat loop. */
export class LocalBookPdfDocument {
  private file: FileHandle | undefined;
  private loading: ReturnType<typeof getDocument> | undefined;
  private document: PDFDocumentProxy | undefined;
  async open(path: string, size: number): Promise<number> {
    if (this.file || !isAbsolute(path) || /[\x00\r\n]/u.test(path) || !Number.isSafeInteger(size) || size < 5 || size > MAX_SOURCE) throw Error('invalid_source');
    this.file = await open(path, 'r');
    if ((await this.file.stat()).size !== size) throw Error('invalid_source');
    const prefix = await readRange(this.file, 0, 5);
    if (new TextDecoder('ascii').decode(prefix.subarray(0, 5)) !== '%PDF-') throw Error('invalid_source');
    // PDF.js' Node file stream supplies range chunks from this verified private
    // file. A URL from a grant never reaches the decoder or this worker.
    this.loading = getDocument({ url: pathToFileURL(path).href, rangeChunkSize: CHUNK,
      disableAutoFetch: true, disableStream: true, enableXfa: false, isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false, stopAtErrors: true, useSystemFonts: false, verbosity: 0 });
    this.document = await this.loading.promise;
    if (!Number.isSafeInteger(this.document.numPages) || this.document.numPages < 1 || this.document.numPages > LOCAL_OCR_BOOK_LIMITS.maxPhysicalPages) throw Error('invalid_source');
    return this.document.numPages;
  }
  async capture(physicalPage: number): Promise<{ image: Uint8Array; imageWidth: number; imageHeight: number; rotation: 0 | 90 | 180 | 270; renderMs: number }> {
    if (!this.document || !Number.isSafeInteger(physicalPage) || physicalPage < 1 || physicalPage > this.document.numPages) throw Error('invalid_page');
    const started = performance.now();
    let page: PDFPageProxy | undefined;
    const canvas = createCanvas(1, 1);
    try {
      page = await this.document.getPage(physicalPage);
      const rotation = page.rotate;
      if (![0, 90, 180, 270].includes(rotation)) throw Error('invalid_page');
      const original = page.getViewport({ scale: 1, rotation });
      if (!Number.isFinite(original.width) || !Number.isFinite(original.height) || original.width <= 0 || original.height <= 0) throw Error('invalid_page');
      let scale = Math.min(LOCAL_OCR_LIMITS.maxWidth / original.width, LOCAL_OCR_LIMITS.maxHeight / original.height,
        Math.sqrt(LOCAL_OCR_LIMITS.maxPixels / (original.width * original.height)));
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        canvas.width = 1; canvas.height = 1;
        const imageWidth = Math.max(1, Math.floor(original.width * scale));
        const imageHeight = Math.max(1, Math.floor(original.height * scale));
        canvas.width = imageWidth; canvas.height = imageHeight;
        await page.render({ canvas: canvas as never, canvasContext: canvas.getContext('2d') as never,
          viewport: page.getViewport({ scale, rotation }), background: 'rgb(255,255,255)' }).promise;
        let image: Buffer | undefined = canvas.toBuffer('image/png');
        canvas.width = 1; canvas.height = 1;
        if (image.byteLength <= LOCAL_OCR_LIMITS.maxImageBytes) return { image: new Uint8Array(image), imageWidth, imageHeight,
          rotation: rotation as 0 | 90 | 180 | 270, renderMs: performance.now() - started };
        const encoded = image.byteLength; image = undefined;
        if (attempt === ATTEMPTS - 1) throw Error('invalid_frame');
        const next = scale * Math.min(0.85, Math.sqrt(LOCAL_OCR_LIMITS.maxImageBytes / encoded) * 0.9);
        scale = attempt === ATTEMPTS - 2 ? Math.min(next, Math.sqrt(FALLBACK_PIXELS / (original.width * original.height))) : next;
      }
      throw Error('invalid_frame');
    } finally { canvas.width = 1; canvas.height = 1; page?.cleanup(); }
  }
  async close(): Promise<void> {
    try { await this.loading?.destroy(); } finally { await this.file?.close(); this.file = undefined; this.document = undefined; }
  }
}

if (parentPort) {
  const port = parentPort, document = new LocalBookPdfDocument();
  let active = false;
  port.on('message', (value: unknown) => {
    const v = value as { id?: unknown; type?: unknown; path?: unknown; size?: unknown; physicalPage?: unknown };
    if (!v || typeof v !== 'object' || !Number.isSafeInteger(v.id) || active) { port.postMessage({ id: v?.id, error: true }); return; }
    active = true;
    void (async () => {
      try {
        if (v.type === 'open' && typeof v.path === 'string' && typeof v.size === 'number') port.postMessage({ id: v.id, pageCount: await document.open(v.path, v.size) });
        else if (v.type === 'page' && typeof v.physicalPage === 'number') {
          const frame = await document.capture(v.physicalPage);
          port.postMessage({ id: v.id, frame }, [frame.image.buffer as ArrayBuffer]);
        } else throw Error('invalid_request');
      } catch { port.postMessage({ id: v.id, error: true }); }
      finally { active = false; }
    })();
  });
}
