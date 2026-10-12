import { LOCAL_OCR_BOOK_LIMITS, LOCAL_OCR_LIMITS, parseOcrEngineCapabilities, parseOcrEnginePageResult,
  type LocalOcrBookClaim, type LocalOcrBookPageInput, type OcrEngineAdapter, type OcrEngineCapabilities,
} from "@academiccloud/compute-contracts";
import type { NativeResourceGuard } from "./native-resource.js";
import { MemberOcrError } from "./member-paddle.js";
import { downloadBookSource, validateBookSourceGrant, type PrivateBookSource } from "./member-book-source.js";
import { openBookPdf, type BookPdfFactory, type BookPdfSession } from "./member-book-pdf.js";
import { inspectRenderedPng } from "./rendered-png.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
type DeviceRequest = (path: string, body: unknown | undefined, signal: AbortSignal) => Promise<unknown>;
type BookPhase = 'grant' | 'download' | 'open' | 'heartbeat' | 'native_wait' | 'yield' | 'finish' | 'render' | 'startup' | 'predict' | 'ack';
export interface MemberBookEvent {
  event: string; code?: string; phase?: BookPhase; milliseconds?: number;
  operation?: 'book-claim' | 'book-source' | 'book-heartbeat' | 'book-page' | 'book-finish';
  headersMilliseconds?: number; bodyMilliseconds?: number; requestBytes?: number; responseBytes?: number;
}
export interface MemberBookOptions {
  request: DeviceRequest;
  resourceGuard: NativeResourceGuard;
  sessionFactory: (onTiming: (phase: 'startup' | 'predict', milliseconds: number) => void) => OcrEngineAdapter;
  signal: AbortSignal;
  capabilities: OcrEngineCapabilities;
  fetch?: typeof fetch;
  onEvent?: (event: MemberBookEvent) => void;
  /** Dependency injection for synthetic/offline tests. Never changes page/native bounds. */
  pdfFactory?: BookPdfFactory;
  heartbeatMs?: number;
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemberOcrError('protocol_invalid');
  return value as Record<string, unknown>;
}
function leaseExpiry(value: unknown): number {
  const n = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(n) || n <= Date.now() || n > Date.now() + LOCAL_OCR_BOOK_LIMITS.leaseLifetimeMs + 5_000) throw new MemberOcrError('protocol_invalid');
  return n;
}
function savedPages(value: unknown, pageCount: number): number[] {
  if (!Array.isArray(value) || value.length > pageCount || value.some(page => !Number.isSafeInteger(page) || page < 1 || page > pageCount)
    || new Set(value).size !== value.length) throw new MemberOcrError('protocol_invalid');
  return value as number[];
}
export function parseMemberBookClaim(value: unknown, capabilities: OcrEngineCapabilities): LocalOcrBookClaim {
  const c = object(value), job = object(c.job);
  if (Object.keys(c).sort().join(',') !== ['job', 'attemptId', 'leaseExpiresAt', 'pageCount', 'savedPhysicalPages', 'capabilities'].sort().join(',')) throw new MemberOcrError('protocol_invalid');
  const count = Number(c.pageCount);
  if (!Number.isSafeInteger(c.pageCount) || count < 1 || count > LOCAL_OCR_BOOK_LIMITS.maxPhysicalPages
    || job.pageCount !== count || job.state !== 'running' || job.leaseExpiresAt !== c.leaseExpiresAt
    || !['id', 'resourceId', 'sourceId', 'deviceId', 'clientRequestId'].every(key => typeof job[key] === 'string' && ID.test(job[key] as string))
    || typeof c.attemptId !== 'string' || !ID.test(c.attemptId)
    || typeof job.expiresAt !== 'string' || Date.parse(job.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(job.expiresAt))
    || Date.parse(job.expiresAt) > Date.now() + LOCAL_OCR_BOOK_LIMITS.taskLifetimeMs + 5_000) throw new MemberOcrError('protocol_invalid');
  leaseExpiry(c.leaseExpiresAt);
  savedPages(c.savedPhysicalPages, count); savedPages(job.savedPhysicalPages, count);
  if (JSON.stringify(parseOcrEngineCapabilities(c.capabilities)) !== JSON.stringify(parseOcrEngineCapabilities(capabilities))) throw new MemberOcrError('protocol_invalid');
  return c as unknown as LocalOcrBookClaim;
}
export async function memberBookDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
  });
}

/** Book lifetime belongs to the connector; only successful server receipts advance it. */
export async function runMemberBookJob(claim: LocalOcrBookClaim, options: MemberBookOptions): Promise<void> {
  const book = parseMemberBookClaim(claim, options.capabilities);
  const identity = { bookId: book.job.id, attemptId: book.attemptId };
  const stop = new AbortController();
  const signal = AbortSignal.any([options.signal, stop.signal]);
  const delay = options.delay ?? memberBookDelay;
  let heartbeatFailure: unknown, heartbeatTimer: ReturnType<typeof setTimeout> | undefined, latestExpiry = 0;
  const heartbeatStop = new AbortController();
  const heartbeatSignal = AbortSignal.any([signal, heartbeatStop.signal]);
  let decodedCount: number | undefined, physicalPage: number | undefined;
  let source: PrivateBookSource | undefined, pdf: BookPdfSession | undefined;
  const saved = new Set(book.savedPhysicalPages);
  const timings = (phase: BookPhase, milliseconds: number) => {
    try { options.onEvent?.({ event: 'member_ocr.book_timing', phase, milliseconds: Math.round(milliseconds) }); }
    catch { /* A timing consumer is never recognition or checkpoint authority. */ }
  };
  const ensureActive = () => { if (signal.aborted) throw new MemberOcrError('aborted'); };
  const renewWatchdog = (value: unknown) => {
    const expires = Math.max(latestExpiry, leaseExpiry(value)); latestExpiry = expires;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => { heartbeatFailure = new MemberOcrError('access_revoked'); stop.abort(); }, expires - Date.now());
  };
  renewWatchdog(book.leaseExpiresAt);
  let pendingHeartbeat: { pageCount: number | undefined; promise: Promise<void> } | undefined;
  async function heartbeat(): Promise<void> {
    ensureActive();
    const pageCount = decodedCount, pending = pendingHeartbeat;
    if (pending) {
      // Share only a currently outstanding authority check, never a cached result.
      // A download-time check cannot replace registration of the decoded count.
      await pending.promise;
      ensureActive();
      if (pending.pageCount === pageCount) return;
      return heartbeat();
    }
    const started = performance.now();
    const promise = (async () => {
      const state = object(await options.request('/device/book-heartbeat', { ...identity, ...(pageCount === undefined ? {} : { pageCount }) }, signal));
      if (state.active !== true) throw new MemberOcrError('access_revoked');
      renewWatchdog(state.leaseExpiresAt);
      for (const page of savedPages(state.savedPhysicalPages, book.pageCount)) saved.add(page);
      timings('heartbeat', performance.now() - started);
    })();
    pendingHeartbeat = { pageCount, promise };
    try { await promise; }
    finally { if (pendingHeartbeat?.promise === promise) pendingHeartbeat = undefined; }
  }
  const heartbeats = (async () => {
    while (!heartbeatSignal.aborted) {
      await memberBookDelay(options.heartbeatMs ?? 2_000, heartbeatSignal);
      if (heartbeatSignal.aborted) return;
      try { await heartbeat(); }
      catch (error) { heartbeatFailure = error; stop.abort(); return; }
    }
  })();
  try {
    let started = performance.now();
    const granted = await options.request('/device/book-source', identity, signal);
    ensureActive();
    const grant = validateBookSourceGrant(granted, book.job);
    timings('grant', performance.now() - started);
    started = performance.now();
    source = await downloadBookSource(grant, signal, options.fetch);
    ensureActive();
    timings('download', performance.now() - started);
    started = performance.now();
    pdf = await (options.pdfFactory ?? openBookPdf)(source.path, source.sizeBytes, signal);
    ensureActive();
    if (pdf.pageCount !== book.pageCount) throw new MemberOcrError('input_invalid');
    decodedCount = pdf.pageCount;
    timings('open', performance.now() - started);
    await heartbeat();
    options.onEvent?.({ event: 'member_ocr.book_running' });
    while (saved.size < book.pageCount) {
      ensureActive();
      const waitStart = performance.now();
      const lease = await options.resourceGuard.acquire(signal);
      if (!lease) {
        options.onEvent?.({ event: 'member_ocr.busy' });
        await delay(LOCAL_OCR_BOOK_LIMITS.sliceYieldMs, signal);
        timings('native_wait', performance.now() - waitStart);
        continue;
      }
      timings('native_wait', performance.now() - waitStart);
      let session: OcrEngineAdapter | undefined;
      const sliceSignal = AbortSignal.any([signal, lease.signal]);
      const started = performance.now();
      let completed = 0;
      try {
        session = options.sessionFactory((phase, ms) => timings(phase, ms));
        if (JSON.stringify(parseOcrEngineCapabilities(await session.capabilities())) !== JSON.stringify(options.capabilities)) throw new MemberOcrError('protocol_invalid');
        while (completed < LOCAL_OCR_BOOK_LIMITS.maxSlicePages && performance.now() - started < LOCAL_OCR_BOOK_LIMITS.maxSliceStartMs) {
          ensureActive();
          if (sliceSignal.aborted) throw new MemberOcrError('aborted');
          await heartbeat();
          if (performance.now() - started >= LOCAL_OCR_BOOK_LIMITS.maxSliceStartMs) break;
          physicalPage = Array.from({ length: book.pageCount }, (_, index) => index + 1).find(page => !saved.has(page));
          if (physicalPage === undefined) break;
          const pageSignal = AbortSignal.any([sliceSignal, AbortSignal.timeout(90_000)]);
          const frame = await pdf.capture(physicalPage, pageSignal);
          if (pageSignal.aborted) throw new MemberOcrError('aborted');
          timings('render', frame.renderMs);
          if (frame.image.byteLength > LOCAL_OCR_LIMITS.maxImageBytes) throw new MemberOcrError('input_invalid');
          const dimensions = inspectRenderedPng(frame.image);
          if (dimensions.width !== frame.imageWidth || dimensions.height !== frame.imageHeight || ![0, 90, 180, 270].includes(frame.rotation)) throw new MemberOcrError('input_invalid');
          const requestId = `${book.job.id}-${physicalPage}`;
          const returned = await session.recognize({ requestId, image: frame.image, mimeType: 'image/png', languageHints: [] }, { signal: pageSignal });
          if (pageSignal.aborted) throw new MemberOcrError('aborted');
          let result;
          try { result = parseOcrEnginePageResult(returned, { requestId, capabilities: options.capabilities }); }
          catch { throw new MemberOcrError('invalid_result'); }
          const payload: LocalOcrBookPageInput = { ...identity, physicalPage, imageBase64: Buffer.from(frame.image).toString('base64'),
            imageWidth: frame.imageWidth, imageHeight: frame.imageHeight, rotation: frame.rotation, result };
          const ackStart = performance.now();
          let receipt: unknown;
          try { receipt = await options.request('/device/book-page', payload, pageSignal); }
          catch (error) {
            // A lost reply may already be committed. Replay the identical payload,
            // after an authority check; never render or recognize this page again.
            if (!(error instanceof MemberOcrError) || error.code !== 'network_failed' || pageSignal.aborted) throw error;
            await heartbeat();
            receipt = await options.request('/device/book-page', payload, pageSignal);
          }
          if (pageSignal.aborted) throw new MemberOcrError('aborted');
          const accepted = object(receipt);
          if (accepted.accepted !== true || typeof accepted.resultId !== 'string' || !ID.test(accepted.resultId)) throw new MemberOcrError('protocol_invalid');
          const checkpoints = savedPages(accepted.savedPhysicalPages, book.pageCount);
          if (!checkpoints.includes(physicalPage)) throw new MemberOcrError('protocol_invalid');
          for (const page of checkpoints) saved.add(page);
          timings('ack', performance.now() - ackStart);
          completed++; physicalPage = undefined;
          options.onEvent?.({ event: 'member_ocr.book_page_saved' });
        }
      } finally {
        // Deliberately no nested finally: failed native closure must retain the guard.
        await session?.close();
        await lease.release();
      }
      if (saved.size < book.pageCount) {
        const yieldStart = performance.now();
        await delay(LOCAL_OCR_BOOK_LIMITS.sliceYieldMs, signal);
        timings('yield', performance.now() - yieldStart);
      }
    }
    // Join any outstanding heartbeat before committing terminal state. A late
    // heartbeat must not turn a successful finish into a false revoked event.
    heartbeatStop.abort(); await heartbeats;
    ensureActive();
    const finishStart = performance.now();
    const finished = object(await options.request('/device/book-finish', { ...identity, pageCount: decodedCount }, signal));
    const job = object(finished.job);
    if (job.id !== book.job.id || job.state !== 'succeeded' || savedPages(job.savedPhysicalPages, book.pageCount).length !== book.pageCount) throw new MemberOcrError('protocol_invalid');
    timings('finish', performance.now() - finishStart);
    options.onEvent?.({ event: 'member_ocr.book_completed' });
  } catch (error) {
    const failure = heartbeatFailure ?? error;
    if (!signal.aborted && !(failure instanceof MemberOcrError && ['access_revoked', 'network_failed'].includes(failure.code))) {
      await options.request('/device/book-finish', { ...identity, errorCode: failure instanceof MemberOcrError && ['input_invalid', 'invalid_result', 'protocol_invalid'].includes(failure.code) ? 'invalid_result' : 'engine_failed',
        ...(physicalPage === undefined ? {} : { failedPhysicalPage: physicalPage }) }, signal).catch(() => {});
    }
    options.onEvent?.({ event: 'member_ocr.book_stopped', code: failure instanceof MemberOcrError ? failure.code : 'engine_failed' });
    if (failure instanceof MemberOcrError && failure.code === 'access_revoked') throw failure;
  } finally {
    stop.abort(); heartbeatStop.abort(); if (heartbeatTimer) clearTimeout(heartbeatTimer);
    await heartbeats;
    await pdf?.close();
    await source?.close();
  }
}
