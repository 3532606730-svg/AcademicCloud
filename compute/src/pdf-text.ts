import type { PDFPageProxy } from "pdfjs-dist";
import { getDocument, PDFDataRangeTransport } from "pdfjs-dist/legacy/build/pdf.mjs";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { isUsableBibliographicEvidence } from "./evidence-usability.js";
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
  | "ocr_capacity"
  | "source_unavailable";

export type PdfTextInspectionDiagnosticStage =
  | "unspecified"
  | "initial_range"
  | "document_load"
  | "page_load"
  | "page_text"
  | "metadata"
  | "ocr_page_load"
  | "render"
  | "ocr";

/** Errors expose only a small, non-sensitive code. */
export class PdfTextInspectionError extends Error {
  constructor(
    readonly code: PdfTextInspectionErrorCode,
    readonly diagnosticStage: PdfTextInspectionDiagnosticStage = "unspecified",
    readonly rangeRequests?: number,
    readonly rangeBytes?: number,
  ) {
    super(code);
    this.name = "PdfTextInspectionError";
  }
}

async function atInspectionStage<T>(
  diagnosticStage: PdfTextInspectionDiagnosticStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof PdfTextInspectionError && error.diagnosticStage === "unspecified") {
      throw new PdfTextInspectionError(error.code, diagnosticStage, error.rangeRequests, error.rangeBytes);
    }
    throw error;
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
  return isUsableBibliographicEvidence(text, "native_text");
}

export class PdfRangeTransport extends PDFDataRangeTransport {
  private requests: number;
  private fetchedBytes: number;
  private reservedBytes = 0;
  private closed = false;
  private sourceFailed = false;
  private readonly maximumRequests: number;
  private readonly sourceController = new AbortController();
  private readonly abortFromParent = (): void => this.sourceController.abort();

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
    const policy = pdfRangeAccessPolicy(source.length, limits);
    this.maximumRequests = policy.maximumRequests;
    this.requests = initialData === undefined ? 0 : 1;
    this.fetchedBytes = initialData?.byteLength ?? 0;
    if (initialData) this.reservedBytes = initialData.byteLength;
    if (signal?.aborted) this.sourceController.abort();
    else signal?.addEventListener("abort", this.abortFromParent, { once: true });
  }

  get metrics(): { requests: number; fetchedBytes: number } {
    return { requests: this.requests, fetchedBytes: this.fetchedBytes };
  }

  get hasSourceFailure(): boolean {
    return this.sourceFailed;
  }

  override requestDataRange(begin: number, end: number): void {
    if (this.closed) return;
    const boundedEnd = Math.min(end, begin + this.limits.rangeChunkBytes, this.length);
    const size = boundedEnd - begin;
    // The aggregate byte budget is reserved synchronously so concurrent PDF.js
    // requests can never collectively exceed the hard ceiling.
    if (size <= 0
      || this.requests >= this.maximumRequests
      || this.reservedBytes + size > this.source.length) {
      // PDF.js has no public range-error callback. Delivering an empty chunk
      // makes the worker fail closed; the inspection wrapper maps that failure
      // to a bounded invalid/partial result without exposing provider details.
      this.onDataRange(begin, new Uint8Array());
      return;
    }
    this.requests += 1;
    this.reservedBytes += size;
    void this.source.read(begin, boundedEnd, this.sourceController.signal).then((bytes) => {
      if (this.closed) return;
      if (bytes.byteLength !== size) {
        this.sourceFailed = true;
        this.onDataRange(begin, new Uint8Array());
        return;
      }
      this.fetchedBytes += bytes.byteLength;
      this.onDataRange(begin, bytes);
    }).catch(() => {
      if (this.closed) return;
      this.sourceFailed = true;
      this.onDataRange(begin, new Uint8Array());
    });
  }

  /**
   * PDF.js can remove a range reader before an outstanding source read settles.
   * Invalidate this adapter first so late callbacks never reach PDF.js' strict
   * range-reader lookup during document teardown.
   */
  override onDataRange(begin: number, chunk: Uint8Array): void {
    if (this.closed) return;
    try {
      super.onDataRange(begin, chunk);
    } catch (error: unknown) {
      // A source response can race PDF.js cancellation and arrive after its
      // range reader has been removed. This is a stale callback, not a PDF
      // parse failure; ignore only PDF.js' exact lifecycle assertion.
      if (error instanceof Error
        && error.message === "#onReceiveData - no `PDFDataTransportStreamRangeReader` instance found.") return;
      throw error;
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.signal?.removeEventListener("abort", this.abortFromParent);
    this.sourceController.abort();
  }

  override abort(): void {
    this.dispose();
  }
}

const LOADING_TASK_DESTROY_TIMEOUT_MILLISECONDS = 1_000;

export async function destroyLoadingTask(task: ReturnType<typeof getDocument>): Promise<void> {
  if (task.destroyed) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task.destroy().catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LOADING_TASK_DESTROY_TIMEOUT_MILLISECONDS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface PdfRangeAccessPolicy {
  maximumBytes: number;
  maximumRequests: number;
}

/**
 * Derive the aggregate range allowance from the admitted object itself. This
 * avoids a fixture-sized byte ceiling while retaining a separate PDF.js
 * allocation guard and the fixed per-request provider bound.
 */
export function pdfRangeAccessPolicy(
  sourceLength: number,
  limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS,
): PdfRangeAccessPolicy {
  if (!Number.isSafeInteger(sourceLength) || sourceLength < 5
    || sourceLength > limits.maxObjectSizeBytes
    || sourceLength > limits.maxPdfJsBufferBytes) {
    throw new PdfTextInspectionError("too_large");
  }
  return {
    maximumBytes: sourceLength,
    maximumRequests: Math.ceil(sourceLength / limits.rangeChunkBytes),
  };
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMilliseconds: number, signal?: AbortSignal): Promise<T> {
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

export async function recognizeWithDeadline(options: {
  ocr: OcrAdapter;
  imageBytes: Uint8Array;
  pageIndex: number;
  deadline: number;
  limits: Readonly<SuggestionLimits>;
  signal?: AbortSignal;
  readerMode?: boolean;
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
      { imageBytes: options.imageBytes, pageIndex: options.pageIndex, ...(options.readerMode ? { readerMode: true } : {}) },
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

export function renderedDimensions(
  page: { getViewport(options: { scale: number }): { width: number; height: number } },
  limits: Readonly<SuggestionLimits>,
): { viewport: ReturnType<typeof page.getViewport>; width: number; height: number; scale: number } {
  const baseViewport = page.getViewport({ scale: 1 });
  if (!Number.isFinite(baseViewport.width) || !Number.isFinite(baseViewport.height)
    || baseViewport.width <= 0 || baseViewport.height <= 0) {
    throw new PdfTextInspectionError("limit_exceeded");
  }
  const basePixels = baseViewport.width * baseViewport.height;
  const maximumPixels = Math.min(limits.maxRenderedPagePixels, Math.floor(limits.maxRenderedBitmapBytes / 4));
  let scale = Math.min(
    limits.renderScale,
    limits.maxRenderedPageWidthPixels / baseViewport.width,
    limits.maxRenderedPageHeightPixels / baseViewport.height,
    Math.sqrt(maximumPixels / basePixels),
  );
  // Below 0.1 PDF viewport units per source unit the raster is not meaningful
  // OCR evidence. Fail closed instead of accepting a technically bounded blur.
  if (!Number.isFinite(scale) || scale < 0.1) throw new PdfTextInspectionError("limit_exceeded");
  if (scale < limits.renderScale) scale *= 0.999_999;
  const viewport = page.getViewport({ scale });
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
  return { viewport, width, height, scale };
}

async function inspectPdf(options: {
  bytes?: Uint8Array;
  source?: PdfRangeSource;
  file?: { path: string; length: number };
  limits: Readonly<SuggestionLimits>;
  signal?: AbortSignal;
  ocr?: OcrAdapter;
  gate?: OcrRequestGate;
}): Promise<PdfTextInspection> {
  const { bytes, source, file, limits, signal, ocr } = options;
  throwIfAborted(signal);
  if ([bytes, source, file].filter((value) => value !== undefined).length !== 1) {
    throw new PdfTextInspectionError("invalid_pdf");
  }
  if (bytes && bytes.byteLength > limits.maxObjectBytes) throw new PdfTextInspectionError("too_large");
  if (source && (!Number.isSafeInteger(source.length) || source.length < 5 || source.length > limits.maxObjectSizeBytes)) {
    throw new PdfTextInspectionError("too_large");
  }
  if (source) pdfRangeAccessPolicy(source.length, limits);
  if (file) pdfRangeAccessPolicy(file.length, limits);
  if (bytes && (bytes.byteLength < 5 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-")) {
    throw new PdfTextInspectionError("invalid_pdf");
  }

  let loadingTask: ReturnType<typeof getDocument> | undefined;
  let rangeTransport: PdfRangeTransport | undefined;
  const startedAt = Date.now();
  const requestDeadline = startedAt + (ocr === undefined ? limits.timeoutMilliseconds : limits.totalRequestTimeoutMilliseconds);
  let releaseOcrRequest: (() => void) | undefined;
  try {
    const initialData = source
      ? await atInspectionStage("initial_range", async () => {
        const expectedBytes = Math.min(source.length, limits.rangeChunkBytes);
        try {
          const data = await withTimeout(
            source.read(0, expectedBytes, signal),
            operationBudget(requestDeadline, limits.timeoutMilliseconds),
            signal,
          );
          if (data.byteLength !== expectedBytes) throw new PdfTextInspectionError("source_unavailable");
          return data;
        } catch (error: unknown) {
          if (error instanceof PdfTextInspectionError && error.code === "aborted") throw error;
          throw new PdfTextInspectionError("source_unavailable");
        }
      })
      : undefined;
    rangeTransport = source ? new PdfRangeTransport(source, limits, signal, initialData) : undefined;
    loadingTask = getDocument({
      ...(bytes
        ? { data: new Uint8Array(bytes) }
        : source
          ? { range: rangeTransport!, length: source.length, rangeChunkSize: limits.rangeChunkBytes }
          : { url: pathToFileURL(file!.path).href, rangeChunkSize: limits.rangeChunkBytes }),
      disableAutoFetch: true,
      disableRange: bytes ? true : false,
      disableStream: true,
      enableXfa: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    const document = await atInspectionStage("document_load", () => withTimeout(
      loadingTask!.promise,
      operationBudget(requestDeadline, ocr === undefined ? limits.timeoutMilliseconds : limits.totalRequestTimeoutMilliseconds),
      signal,
    ));
    // Range-backed PDF.js may need most of a large object merely to resolve
    // its document structure. Keep each later parser operation inside the
    // existing parser timeout while sharing the unchanged aggregate request
    // deadline with document loading and OCR.
    const parserDeadline = Math.min(requestDeadline, Date.now() + limits.timeoutMilliseconds);
    const pageCount = document.numPages;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100_000) {
      throw new PdfTextInspectionError("limit_exceeded");
    }
    const pageIndices = selectedPageIndices(pageCount, limits);
    // Retain only bounded derived text between phases. PDFPageProxy objects
    // own parser/font/image caches and must not accumulate across the exact
    // first-15/last-5 window.
    const inspectedPages: Array<{ pageIndex: number; nativeText: string }> = [];
    let decodedTextCharacters = 0;
    let complete = true;
    for (const pageIndex of pageIndices) {
      throwIfAborted(signal);
      let page: PDFPageProxy | undefined;
      try {
        page = await atInspectionStage("page_load", () => withTimeout(
          document.getPage(pageIndex),
          operationBudget(parserDeadline, limits.timeoutMilliseconds),
          signal,
        ));
        const remainingText = limits.maxTotalTextCharacters - decodedTextCharacters;
        if (remainingText <= 0) {
          complete = false;
          break;
        }
        const nativeText = await atInspectionStage("page_text", () => readBoundedPageText(
          page!,
          Math.min(limits.maxPageTextCharacters, remainingText),
          parserDeadline,
          limits.timeoutMilliseconds,
          signal,
        ));
        decodedTextCharacters += nativeText.length;
        inspectedPages.push({ pageIndex, nativeText });
      } catch (error: unknown) {
        if (error instanceof PdfTextInspectionError && ["aborted", "timeout", "limit_exceeded"].includes(error.code)) {
          if (error.code === "aborted" || error.code === "timeout") throw error;
          complete = false;
          break;
        }
        complete = false;
      } finally {
        try {
          page?.cleanup();
        } catch {
          // The document-level destroy remains the final cleanup boundary.
        }
      }
    }

    let embeddedMetadata: PdfEmbeddedMetadata = {};
    try {
      const metadata = await atInspectionStage("metadata", () => withTimeout(
        document.getMetadata(),
        operationBudget(parserDeadline, limits.timeoutMilliseconds),
        signal,
      ));
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

    for (const { pageIndex, nativeText } of inspectedPages) {
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
      let page: PDFPageProxy | undefined;
      try {
        page = await atInspectionStage("ocr_page_load", () => withTimeout(
          document.getPage(pageIndex),
          operationBudget(requestDeadline, limits.timeoutMilliseconds),
          signal,
        ));
        const dimensions = renderedDimensions(page, limits);
        // Native canvas is an OCR-only dependency. Native-text PDFs never
        // load its backing runtime into the clean worker process.
        const { createCanvas } = await import("@napi-rs/canvas");
        const canvas = createCanvas(dimensions.width, dimensions.height);
        const context = canvas.getContext("2d");
        let renderTask: ReturnType<typeof page.render> | undefined;
        try {
          renderTask = page.render({
            canvas: canvas as never,
            canvasContext: context as never,
            viewport: dimensions.viewport as never,
          });
          await atInspectionStage("render", () => withTimeout(
            renderTask!.promise,
            operationBudget(requestDeadline, limits.timeoutMilliseconds),
            signal,
          ));
        } catch (error: unknown) {
          renderTask?.cancel();
          if (error instanceof PdfTextInspectionError) throw error;
          throw new PdfTextInspectionError("render_failure");
        }
        try {
          // Buffer is already a Uint8Array. Passing it directly avoids the
          // former full encoded-image copy.
          const imageBytes: Uint8Array = canvas.toBuffer("image/png");
          if (imageBytes.byteLength > limits.maxEncodedPageImageBytes) throw new PdfTextInspectionError("limit_exceeded");
          ocrPageCount += 1;
          const recognized = await atInspectionStage("ocr", () => recognizeWithDeadline({
            ocr,
            imageBytes,
            pageIndex,
            deadline: requestDeadline,
            limits,
            ...(signal === undefined ? {} : { signal }),
          }));
          const boundedRecognition = recognized.status === "recognized"
            ? asBoundedText(recognized.text, limits.maxOcrOutputCharactersPerPage)
            : "";
          // Paddle/Tesseract confidence describes glyph recognition only. A
          // separate script-neutral gate decides whether the result may enter
          // bibliography extraction or Qwen reasoning as usable evidence.
          const text = isUsableBibliographicEvidence(
            boundedRecognition,
            "ocr",
            { ocrConfidence: recognized.confidence },
          ) ? boundedRecognition : "";
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
            ocrRenderScale: dimensions.scale,
          });
        } finally {
          // @napi-rs/canvas has no explicit dispose method. Resizing drops the
          // backing surface deterministically before the next page.
          canvas.width = 1;
          canvas.height = 1;
        }
      } catch (error: unknown) {
        // The aggregate extraction deadline is a window-completeness bound,
        // not a reason to discard already completed OCR evidence. Preserve a
        // partial, explicitly incomplete window only after at least one page
        // has completed. A first-page timeout, a per-page timeout before the
        // aggregate deadline, and every non-timeout failure still fail closed.
        if (error instanceof PdfTextInspectionError
          && ["timeout", "ocr_timeout"].includes(error.code)
          && Date.now() >= requestDeadline
          && pages.length > 0) {
          complete = false;
          break;
        }
        throw error;
      } finally {
        try {
          page?.cleanup();
        } catch {
          // The document-level destroy remains the final cleanup boundary.
        }
      }
    }
    return {
      pageCount,
      pageIndices,
      pages,
      embeddedMetadata,
      complete: complete && pages.length === pageIndices.length,
      hasUsableTextLayer: pages.some((page) => page.evidenceOrigin === "native_text" && isUsableNativeText(page.text)),
      hasUsableEvidence: pages.some((page) => isUsableBibliographicEvidence(
        page.text,
        page.evidenceOrigin === "ocr" ? "ocr" : "native_text",
        { ocrConfidence: page.ocrConfidence },
      )),
      nativePageCount,
      ocrPageCount,
    };
  } catch (error: unknown) {
    if (error instanceof PdfTextInspectionError) {
      const metrics = rangeTransport?.metrics;
      const code = error.code !== "aborted" && rangeTransport?.hasSourceFailure
        ? "source_unavailable"
        : error.code;
      throw new PdfTextInspectionError(
        code,
        error.diagnosticStage,
        metrics?.requests,
        metrics?.fetchedBytes,
      );
    }
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password") || message.includes("encrypted")) throw new PdfTextInspectionError("encrypted_pdf");
    throw new PdfTextInspectionError("invalid_pdf");
  } finally {
    releaseOcrRequest?.();
    rangeTransport?.dispose();
    if (loadingTask && !loadingTask.destroyed) {
      await destroyLoadingTask(loadingTask);
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

/**
 * Exceptional catalog-export fallback using PDF.js' own local-file transport.
 * The caller is responsible for streaming and identity-verifying the temporary
 * file before this method is entered.
 */
export async function inspectPdfFrontMatterFile(
  path: string,
  length: number,
  ocr: OcrAdapter,
  limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS,
  signal?: AbortSignal,
): Promise<PdfTextInspection> {
  const details = await stat(path);
  if (!details.isFile() || details.size !== length) throw new PdfTextInspectionError("source_unavailable");
  return inspectPdf({ file: { path, length }, limits, ocr, ...(signal === undefined ? {} : { signal }) });
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

  inspectFile(path: string, length: number, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection> {
    return inspectPdfFrontMatterFile(path, length, this.#ocr, limits, signal);
  }

  close(): Promise<void> | void {
    return this.#ocr.close?.();
  }
}

export class PdfJsTextSource extends PdfJsTextInspector {}
export class PdfJsFrontMatterSource extends PdfJsFrontMatterInspector {}
