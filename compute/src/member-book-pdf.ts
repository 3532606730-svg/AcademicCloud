import { Worker } from "node:worker_threads";
import { LOCAL_OCR_LIMITS, LOCAL_OCR_BOOK_LIMITS } from "@academiccloud/compute-contracts";
import { MemberOcrError } from "./member-paddle.js";
import { inspectRenderedPng } from "./rendered-png.js";

export interface BookPageFrame { image: Uint8Array; imageWidth: number; imageHeight: number; rotation: 0 | 90 | 180 | 270; renderMs: number }
export interface BookPdfSession { pageCount: number; capture(page: number, signal: AbortSignal): Promise<BookPageFrame>; close(): Promise<void> }
export type BookPdfFactory = (path: string, sizeBytes: number, signal: AbortSignal) => Promise<BookPdfSession>;

export const openBookPdf: BookPdfFactory = async (path, sizeBytes, signal) => {
  const entry = new URL(import.meta.url.endsWith('.ts') ? './member-book-pdf-worker.ts' : './member-book-pdf-worker.js', import.meta.url);
  const worker = new Worker(entry, { stdout: true, stderr: true });
  worker.stdout.resume(); worker.stderr.resume();
  let serial = 0, closed = false, closing: Promise<void> | undefined;
  let pending: { id: number; resolve(value: unknown): void; reject(error: Error): void } | undefined;
  const fail = () => { closed = true; pending?.reject(new MemberOcrError('input_invalid')); pending = undefined; };
  worker.on('error', fail); worker.on('exit', fail);
  worker.on('message', (value: unknown) => {
    if (!value || typeof value !== 'object' || (value as { id?: unknown }).id !== pending?.id) return;
    const waiting = pending; pending = undefined;
    if ((value as { error?: unknown }).error === true) waiting?.reject(new MemberOcrError('input_invalid'));
    else waiting?.resolve(value);
  });
  const close = () => closing ??= (async () => { closed = true; pending?.reject(new MemberOcrError('aborted')); pending = undefined; await worker.terminate(); })();
  async function request(message: object, active: AbortSignal): Promise<unknown> {
    if (closed || active.aborted) throw new MemberOcrError('aborted');
    if (pending) throw new MemberOcrError('engine_busy');
    const abort = () => { void close(); };
    active.addEventListener('abort', abort, { once: true });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        pending = { id: ++serial, resolve, reject };
        worker.postMessage({ ...message, id: serial });
        if (active.aborted) abort();
      });
    } finally { active.removeEventListener('abort', abort); }
  }
  try {
    const decoded = await request({ type: 'open', path, size: sizeBytes }, AbortSignal.any([signal, AbortSignal.timeout(90_000)])) as { pageCount?: unknown };
    if (!Number.isSafeInteger(decoded.pageCount) || Number(decoded.pageCount) < 1 || Number(decoded.pageCount) > LOCAL_OCR_BOOK_LIMITS.maxPhysicalPages) throw new MemberOcrError('input_invalid');
    return { pageCount: Number(decoded.pageCount), close, async capture(page, active) {
      const value = await request({ type: 'page', physicalPage: page }, active) as { frame?: BookPageFrame };
      const f = value.frame;
      if (!f || !(f.image instanceof Uint8Array) || f.image.byteLength > LOCAL_OCR_LIMITS.maxImageBytes || ![0, 90, 180, 270].includes(f.rotation)
        || !Number.isFinite(f.renderMs) || f.renderMs < 0) throw new MemberOcrError('input_invalid');
      const dimensions = inspectRenderedPng(f.image);
      if (dimensions.width !== f.imageWidth || dimensions.height !== f.imageHeight) throw new MemberOcrError('input_invalid');
      return f;
    } };
  } catch (error) { await close(); throw error; }
};
