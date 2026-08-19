import { createCanvas } from "@napi-rs/canvas";
import type { PDFPageProxy } from "pdfjs-dist";
import { getDocument, PDFDataRangeTransport } from "pdfjs-dist/legacy/build/pdf.mjs";

import { OcrError, TesseractCliOcrAdapter, type OcrAdapter } from "./ocr.js";
import {
  SUGGESTION_LIMITS,
  SUGGESTION_WINDOW,
  type BoundedPdfTextSource,
  type PdfEmbeddedMetadata,
  type PdfTextInspection,
  type PdfTextPage,
  type PdfRangeSource,
  type SuggestionLimits,
} from "./suggestion.js";

export type PdfTextInspectionErrorCode =
  | "too_large"
  | "timeout"
  | "aborted"
  | "invalid_pdf"
  | "encrypted_pdf"
  | "limit_exceeded"
  | "render_failure"
  | "ocr_engine_unavailable"
  | "ocr_engine_failure"
  | "ocr_language_unavailable"
  | "ocr_timeout"
  | "ocr_capacity";

/** Errors expose only a small, non-sensitive code. */
export class PdfTextInspectionError extends Error {
  constructor(readonly code: PdfTextInspectionErrorCode) {
    super(code);
    this.name = "PdfTextInspectionError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PdfTextInspectionError("aborted");
}

function remainingBudget(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new PdfTextInspectionError("timeout");
  return remaining;
}

function operationBudget(deadline: number, maximum: number): number {
  return Math.max(1, Math.min(remainingBudget(deadline), maximum));
}

function asBoundedText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f]/g, "")
    .slice(0, limit);
}

function normaliseEmbedded(info: unknown, limits: Readonly<SuggestionLimits>): PdfEmbeddedMetadata {
  if (typeof info !== "object" || info === null) return {};
  const record = info as Record<string, unknown>;
  const values: PdfEmbeddedMetadata = {};
  let total = 0;
  for (const key of ["Title", "Author", "Subject", "Keywords"] as const) {
    const raw = record[key];
    if (typeof raw !== "string" || raw.trim().length === 0 || total >= limits.maxEmbeddedTotalCharacters) continue;
    const remaining = limits.maxEmbeddedTotalCharacters - total;
    const value = asBoundedText(raw, Math.min(limits.maxEmbeddedValueCharacters, remaining)).trim();
    if (!value) continue;
    total += value.length;
    if (key === "Title") values.title = value;
    else if (key === "Author") values.author = value;
    else if (key === "Subject") values.subject = value;
    else values.keywords = value;
  }
  return values;
}

export function selectedPageIndices(pageCount: number, limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS): number[] {
  const first = Math.min(SUGGESTION_WINDOW.firstPages, pageCount);
  const lastStart = Math.max(1, pageCount - SUGGESTION_WINDOW.lastPages + 1);
  const selected = new Set<number>();
  for (let index = 1; index <= first; index += 1) selected.add(index);
  for (let index = lastStart; index <= pageCount; index += 1) selected.add(index);
  const result = [...selected].sort((left, right) => left - right);
  if (result.length > limits.maxPages) throw new PdfTextInspectionError("limit_exceeded");
  return result;
}

export function isUsableNativeText(text: string): boolean {
  const compact = text
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
    .replace(/\s+/gu, "");
  if (compact.length < 2 || !/[\p{L}]/u.test(compact)) return false;
  if (/^\d+[\p{P}\p{S}]?$/u.test(compact)) return false;
  const letters = [...compact].filter((character) => /\p{L}/u.test(character));
  const meaningful = letters.filter((character) => /[\p{Script=Han}\p{Script=Latin}]/u.test(character));
  if (meaningful.length < 2 || meaningful.length / Math.max(1, letters.length) < 0.55) return false;
  // Broken font maps commonly produce long runs of replacement/private-use
  // glyphs. A short, explicitly labelled title is still admitted by the
  // extractor, but an opaque glyph run must not suppress OCR.
  if (/^[\uE000-\uF8FF\uFFFD]+$/u.test(compact)) return false;
  return true;
}

class PdfRangeTransport extends PDFDataRangeTransport {
  private requests = 0;
  private fetchedBytes = 0;
  private reservedBytes = 0;
  private aborted = false;

  constructor(
    private readonly source: PdfRangeSource,
    private readonly limits: Readonly<SuggestionLimits>,
    private readonly signal?: AbortSignal,
    initialData?: Uint8Array,
  ) {
    // The prefix is deliberately the only progressive data. Marking the
    // progressive stream done forces PDF.js to satisfy later page/xref reads
    // through requestDataRange instead of silently draining the whole object.
    super(source.length, initialData ?? null, true);
    if (initialData) this.reservedBytes += initialData.byteLength;
  }

  get metrics(): { requests: number; fetchedBytes: number } {
    return { requests: this.requests, fetchedBytes: this.fetchedBytes };
  }

  override requestDataRange(begin: number, end: number): void {
    const boundedEnd = Math.min(end, begin + this.limits.rangeChunkBytes, this.length);
    const size = boundedEnd - begin;
    // The aggregate byte budget is reserved synchronously so concurrent PDF.js
    // requests can never collectively exceed the hard ceiling.
    if (size <= 0
      || this.requests >= this.limits.maxRangeRequests
      || this.reservedBytes + size > this.limits.maxRangeBytes) {
      // PDF.js has no public range-error callback. Delivering an empty chunk
      // makes the worker fail closed; the inspection wrapper maps that failure
      // to a bounded invalid/partial result without exposing provider details.
      this.onDataRange(begin, new Uint8Array());
      return;
    }
    this.requests += 1;
    this.reservedBytes += size;
    void this.source.read(begin, boundedEnd, this.signal).then((bytes) => {
      if (this.aborted) return;
      this.fetchedBytes += bytes.byteLength;
      this.onDataRange(begin, bytes);
    }).catch(() => {
      if (this.aborted) return;
      this.onDataRange(begin, new Uint8Array());
    });
  }

  override abort(): void {
    this.aborted = true;
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMilliseconds: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => reject(new PdfTextInspectionError("aborted"));
    if (signal?.aborted) abortHandler();
    else signal?.addEventListener("abort", abortHandler, { once: true });
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfTextInspectionError("timeout")), timeoutMilliseconds);
  });
  try {
    return await Promise.race([operation, abortPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortHandler) signal?.removeEventListener("abort", abortHandler);
  }
}

async function readBoundedPageText(
  page: PDFPageProxy,
  maximumCharacters: number,
  deadline: number,
  operationTimeoutMilliseconds: number,
  signal?: AbortSignal,
): Promise<string> {
  const stream = page.streamTextContent({ disableNormalization: false });
  const reader = stream.getReader();
  let result = "";
  let closed = false;
  try {
    while (result.length < maximumCharacters) {
      throwIfAborted(signal);
      const chunk = await withTimeout(
        reader.read(),
        operationBudget(deadline, operationTimeoutMilliseconds),
        signal,
      );
      if (chunk.done) {
        closed = true;
        break;
      }
      for (const item of chunk.value.items) {
        if (!("str" in item) || typeof item.str !== "string" || item.str.length === 0) continue;
        const separator = result.length === 0 ? "" : "\n";
        const remaining = maximumCharacters - result.length - separator.length;
        if (remaining <= 0) break;
        const text = asBoundedText(item.str, remaining);
        if (text.length > 0) result += separator + text;
      }
    }
    if (result.length >= maximumCharacters) {
      await reader.cancel();
      closed = true;
    }
    return result;
  } finally {
    try {
      if (!closed) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the bounded parser/cancellation failure that led here.
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

class OcrRequestGate {
  #active = 0;

  tryAcquire(maximum: number): (() => void) | null {
    if (this.#active >= maximum) return null;
    this.#active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
    };
  }
}

const DEFAULT_OCR_REQUEST_GATE = new OcrRequestGate();

function mapOcrError(error: OcrError): PdfTextInspectionError {
  switch (error.code) {
    case "aborted": return new PdfTextInspectionError("aborted");
    case "timeout": return new PdfTextInspectionError("ocr_timeout");
    case "engine_unavailable":
    case "engine_version_mismatch": return new PdfTextInspectionError("ocr_engine_unavailable");
    case "language_data_unavailable": return new PdfTextInspectionError("ocr_language_unavailable");
    case "input_limit":
    case "output_limit": return new PdfTextInspectionError("limit_exceeded");
    case "engine_failure": return new PdfTextInspectionError("ocr_engine_failure");
  }
}

async function recognizeWithDeadline(options: {
  ocr: OcrAdapter;
  imageBytes: Uint8Array;
  pageIndex: number;
  deadline: number;
  limits: Readonly<SuggestionLimits>;
  signal?: AbortSignal;
}) {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutBudget: number;
  try {
    timeoutBudget = operationBudget(options.deadline, options.limits.perPageOcrTimeoutMilliseconds);
  } catch (error: unknown) {
    if (error instanceof PdfTextInspectionError && error.code === "timeout") {
      throw new PdfTextInspectionError("ocr_timeout");
    }
    throw error;
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutBudget);
  const onAbort = (): void => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await options.ocr.recognizePage(
      { imageBytes: options.imageBytes, pageIndex: options.pageIndex },
      controller.signal,
    );
  } catch (error: unknown) {
    if (timedOut) throw new PdfTextInspectionError("ocr_timeout");
    if (options.signal?.aborted) throw new PdfTextInspectionError("aborted");
    if (error instanceof OcrError) throw mapOcrError(error);
    throw new PdfTextInspectionError("ocr_engine_failure");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function renderedDimensions(
  page: { getViewport(options: { scale: number }): { width: number; height: number } },
  limits: Readonly<SuggestionLimits>,
): { viewport: ReturnType<typeof page.getViewport>; width: number; height: number } {
  const viewport = page.getViewport({ scale: limits.renderScale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new PdfTextInspectionError("limit_exceeded");
  }
  const pixels = width * height;
  const bitmapBytes = pixels * 4;
  if (!Number.isSafeInteger(pixels)
    || width > limits.maxRenderedPageWidthPixels
    || height > limits.maxRenderedPageHeightPixels
    || pixels > limits.maxRenderedPagePixels
    || bitmapBytes > limits.maxRenderedBitmapBytes) {
    throw new PdfTextInspectionError("limit_exceeded");
  }
  return { viewport, width, height };
}

async function inspectPdf(options: {
  bytes?: Uint8Array;
  source?: PdfRangeSource;
  limits: Readonly<SuggestionLimits>;
  signal?: AbortSignal;
  ocr?: OcrAdapter;
  gate?: OcrRequestGate;
}): Promise<PdfTextInspection> {
  const { bytes, source, limits, signal, ocr } = options;
  throwIfAborted(signal);
  if (!bytes && !source) throw new PdfTextInspectionError("invalid_pdf");
  if (bytes && bytes.byteLength > limits.maxObjectBytes) throw new PdfTextInspectionError("too_large");
  if (source && (!Number.isSafeInteger(source.length) || source.length < 5 || source.length > limits.maxObjectSizeBytes)) {
    throw new PdfTextInspectionError("too_large");
  }
  if (bytes && (bytes.byteLength < 5 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-")) {
    throw new PdfTextInspectionError("invalid_pdf");
  }

  let loadingTask: ReturnType<typeof getDocument> | undefined;
  const startedAt = Date.now();
  const parserDeadline = startedAt + limits.timeoutMilliseconds;
  const requestDeadline = startedAt + (ocr === undefined ? limits.timeoutMilliseconds : limits.totalRequestTimeoutMilliseconds);
  let releaseOcrRequest: (() => void) | undefined;
  try {
    const initialData = source
      ? await withTimeout(source.read(0, Math.min(source.length, limits.rangeChunkBytes), signal), operationBudget(parserDeadline, limits.timeoutMilliseconds), signal)
      : undefined;
    const rangeTransport = source ? new PdfRangeTransport(source, limits, signal, initialData) : undefined;
    loadingTask = getDocument({
      ...(bytes ? { data: new Uint8Array(bytes) } : { range: rangeTransport!, length: source!.length, rangeChunkSize: limits.rangeChunkBytes }),
      disableAutoFetch: true,
      disableRange: source ? false : true,
      disableStream: true,
      enableXfa: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    const document = await withTimeout(loadingTask.promise, operationBudget(parserDeadline, limits.timeoutMilliseconds), signal);
    const pageCount = document.numPages;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100_000) {
      throw new PdfTextInspectionError("limit_exceeded");
    }
    const pageIndices = selectedPageIndices(pageCount, limits);
    const inspectedPages: Array<{
      pageIndex: number;
      page: PDFPageProxy;
      nativeText: string;
    }> = [];
    let decodedTextCharacters = 0;
    let complete = true;
    for (const pageIndex of pageIndices) {
      throwIfAborted(signal);
      try {
        const page = await withTimeout(
          document.getPage(pageIndex),
          operationBudget(parserDeadline, limits.timeoutMilliseconds),
          signal,
        );
        const remainingText = limits.maxTotalTextCharacters - decodedTextCharacters;
        if (remainingText <= 0) {
          complete = false;
          break;
        }
        const nativeText = await readBoundedPageText(
          page,
          Math.min(limits.maxPageTextCharacters, remainingText),
          parserDeadline,
          limits.timeoutMilliseconds,
          signal,
        );
        decodedTextCharacters += nativeText.length;
        inspectedPages.push({ pageIndex, page, nativeText });
      } catch (error: unknown) {
        if (error instanceof PdfTextInspectionError && ["aborted", "timeout", "limit_exceeded"].includes(error.code)) {
          if (error.code === "aborted") throw error;
          complete = false;
          break;
        }
        complete = false;
      }
    }

    let embeddedMetadata: PdfEmbeddedMetadata = {};
    try {
      const metadata = await withTimeout(
        document.getMetadata(),
        operationBudget(parserDeadline, limits.timeoutMilliseconds),
        signal,
      );
      embeddedMetadata = normaliseEmbedded(metadata.info, limits);
    } catch (error: unknown) {
      if (error instanceof PdfTextInspectionError && ["timeout", "aborted", "limit_exceeded"].includes(error.code)) {
        throw error;
      }
    }

    const pages: PdfTextPage[] = [];
    let totalCharacters = decodedTextCharacters;
    let totalOcrCharacters = 0;
    let nativePageCount = 0;
    let ocrPageCount = 0;

    for (const { pageIndex, page, nativeText } of inspectedPages) {
      throwIfAborted(signal);
      if (isUsableNativeText(nativeText)) {
        nativePageCount += 1;
        pages.push({ pageIndex, text: nativeText, evidenceOrigin: "native_text", ocrEngine: null, ocrConfidence: null });
        continue;
      }

      if (ocr === undefined) {
        pages.push({ pageIndex, text: nativeText, evidenceOrigin: "native_text", ocrEngine: null, ocrConfidence: null });
        continue;
      }
      if (releaseOcrRequest === undefined) {
        const release = (options.gate ?? DEFAULT_OCR_REQUEST_GATE).tryAcquire(limits.maxConcurrentOcrRequests);
        if (!release) throw new PdfTextInspectionError("ocr_capacity");
        releaseOcrRequest = release;
      }
      if (limits.maxConcurrentPageOcrJobs !== 1) throw new PdfTextInspectionError("limit_exceeded");
      const dimensions = renderedDimensions(page, limits);
      const canvas = createCanvas(dimensions.width, dimensions.height);
      const context = canvas.getContext("2d");
      let renderTask: ReturnType<typeof page.render> | undefined;
      try {
        renderTask = page.render({
          canvas: canvas as never,
          canvasContext: context as never,
          viewport: dimensions.viewport as never,
        });
        await withTimeout(renderTask.promise, operationBudget(requestDeadline, limits.timeoutMilliseconds), signal);
      } catch (error: unknown) {
        renderTask?.cancel();
        if (error instanceof PdfTextInspectionError) throw error;
        throw new PdfTextInspectionError("render_failure");
      }
      const imageBytes = new Uint8Array(canvas.toBuffer("image/png"));
      if (imageBytes.byteLength > limits.maxEncodedPageImageBytes) throw new PdfTextInspectionError("limit_exceeded");
      ocrPageCount += 1;
      const recognized = await recognizeWithDeadline({
        ocr,
        imageBytes,
        pageIndex,
        deadline: requestDeadline,
        limits,
        ...(signal === undefined ? {} : { signal }),
      });
      const text = recognized.status === "recognized"
        ? asBoundedText(recognized.text, limits.maxOcrOutputCharactersPerPage)
        : "";
      totalOcrCharacters += text.length;
      totalCharacters += text.length;
      if (totalOcrCharacters > limits.maxTotalOcrOutputCharacters || totalCharacters > limits.maxTotalTextCharacters) {
        throw new PdfTextInspectionError("limit_exceeded");
      }
      pages.push({
        pageIndex,
        text,
        evidenceOrigin: "ocr",
        ocrEngine: recognized.engine,
        ocrConfidence: recognized.confidence,
      });
    }
    await loadingTask.destroy();
    return {
      pageCount,
      pageIndices,
      pages,
      embeddedMetadata,
      complete: complete && pages.length === pageIndices.length,
      hasUsableTextLayer: pages.some((page) => page.evidenceOrigin === "native_text" && isUsableNativeText(page.text)),
      hasUsableEvidence: pages.some((page) => isUsableNativeText(page.text)),
      nativePageCount,
      ocrPageCount,
    };
  } catch (error: unknown) {
    if (error instanceof PdfTextInspectionError) throw error;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password") || message.includes("encrypted")) throw new PdfTextInspectionError("encrypted_pdf");
    throw new PdfTextInspectionError("invalid_pdf");
  } finally {
    releaseOcrRequest?.();
    if (loadingTask && !loadingTask.destroyed) {
      try {
        await loadingTask.destroy();
      } catch {
        // Cleanup is best effort; parser internals are never exposed.
      }
    }
  }
}

/** Text-layer-only compatibility path retained for focused parser tests. */
export function inspectPdfText(
  bytes: Uint8Array,
  limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS,
  signal?: AbortSignal,
): Promise<PdfTextInspection> {
  return inspectPdf({ bytes, limits, ...(signal === undefined ? {} : { signal }) });
}

/** Native-text-first bounded inspection with local OCR fallback. */
export function inspectPdfFrontMatter(
  bytes: Uint8Array,
  ocr: OcrAdapter,
  limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS,
  signal?: AbortSignal,
): Promise<PdfTextInspection> {
  return inspectPdf({ bytes, limits, ocr, ...(signal === undefined ? {} : { signal }) });
}

export function inspectPdfFrontMatterRange(
  source: PdfRangeSource,
  ocr: OcrAdapter,
  limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS,
  signal?: AbortSignal,
): Promise<PdfTextInspection> {
  return inspectPdf({ source, limits, ocr, ...(signal === undefined ? {} : { signal }) });
}

export class PdfJsTextInspector implements BoundedPdfTextSource {
  inspect(bytes: Uint8Array, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection> {
    return inspectPdfText(bytes, limits, signal);
  }
}

export class PdfJsFrontMatterInspector implements BoundedPdfTextSource {
  readonly #ocr: OcrAdapter;

  constructor(ocr: OcrAdapter = new TesseractCliOcrAdapter()) {
    this.#ocr = ocr;
  }

  inspect(bytes: Uint8Array, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection> {
    return inspectPdfFrontMatter(bytes, this.#ocr, limits, signal);
  }

  inspectRange(source: PdfRangeSource, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection> {
    return inspectPdfFrontMatterRange(source, this.#ocr, limits, signal);
  }
}

export class PdfJsTextSource extends PdfJsTextInspector {}
export class PdfJsFrontMatterSource extends PdfJsFrontMatterInspector {}
