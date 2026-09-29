import type { PDFPageProxy } from "pdfjs-dist";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { OcrAdapter, OcrRecognitionStatus } from "./ocr.js";
import { prepareOcrGeometry, type OcrLineGeometry } from "./ocr-geometry.js";
import {
  destroyLoadingTask,
  PdfRangeTransport,
  PdfTextInspectionError,
  pdfRangeAccessPolicy,
  recognizeWithDeadline,
  renderedDimensions,
  withTimeout,
} from "./pdf-text.js";
import { SUGGESTION_LIMITS, type PdfRangeSource, type SuggestionLimits } from "./suggestion.js";

export interface ExplicitPageOcrInspection {
  physicalPage: number;
  pageCount: number;
  status: OcrRecognitionStatus;
  text: string;
  confidence: number | null;
  engine: string;
  truncated: boolean;
  renderScale: number;
  /** Canvas pixels and the exact PDF.js transform used to render the OCR input. */
  renderedImage?: {
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    rotation: number;
    pdfToImageTransform: number[];
  };
  geometry?: OcrLineGeometry;
  rangeRequests: number;
  rangeBytes: number;
}

export interface ExplicitPageOcrSource {
  inspectRange(source: PdfRangeSource, physicalPage: number, signal?: AbortSignal): Promise<ExplicitPageOcrInspection>;
  close?(): Promise<void> | void;
}

export class ReaderOcrPageOutOfRangeError extends Error {
  constructor() { super("page_out_of_range"); this.name = "ReaderOcrPageOutOfRangeError"; }
}

/** One explicit physical page. Never substitutes the bibliography window or a text layer. */
export class ExplicitPageOcrInspector implements ExplicitPageOcrSource {
  private active = false;
  constructor(
    private readonly ocr: OcrAdapter,
    private readonly limits: Readonly<SuggestionLimits> = SUGGESTION_LIMITS,
    private readonly options: { includeGeometry?: boolean } = {},
  ) {}

  inspect(bytes: Uint8Array, physicalPage: number, signal?: AbortSignal): Promise<ExplicitPageOcrInspection> {
    return this.exclusively(() => this.inspectOne({ bytes }, physicalPage, signal));
  }

  inspectRange(source: PdfRangeSource, physicalPage: number, signal?: AbortSignal): Promise<ExplicitPageOcrInspection> {
    return this.exclusively(() => this.inspectOne({ source }, physicalPage, signal));
  }

  close(): Promise<void> | void { return this.ocr.close?.(); }

  private async exclusively(operation: () => Promise<ExplicitPageOcrInspection>): Promise<ExplicitPageOcrInspection> {
    if (this.active) throw new PdfTextInspectionError("ocr_capacity");
    this.active = true;
    try { return await operation(); } finally { this.active = false; }
  }

  private async inspectOne(
    input: { bytes: Uint8Array; source?: never } | { source: PdfRangeSource; bytes?: never },
    physicalPage: number,
    signal?: AbortSignal,
  ): Promise<ExplicitPageOcrInspection> {
    if (!Number.isSafeInteger(physicalPage) || physicalPage < 1 || physicalPage > 1_000_000) {
      throw new ReaderOcrPageOutOfRangeError();
    }
    if (signal?.aborted) throw new PdfTextInspectionError("aborted");
    if (input.bytes && input.bytes.byteLength > this.limits.maxObjectBytes) throw new PdfTextInspectionError("too_large");
    if (input.source) pdfRangeAccessPolicy(input.source.length, this.limits);
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const deadline = Date.now() + this.limits.totalRequestTimeoutMilliseconds;
    const budget = (): number => {
      if (controller.signal.aborted) throw new PdfTextInspectionError("aborted");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new PdfTextInspectionError("timeout");
      return Math.min(this.limits.timeoutMilliseconds, remaining);
    };
    let transport: PdfRangeTransport | undefined;
    let loadingTask: ReturnType<typeof getDocument> | undefined;
    let page: PDFPageProxy | undefined;
    try {
      let prefix = input.bytes;
      if (input.source) {
        const end = Math.min(input.source.length, this.limits.rangeChunkBytes);
        try {
          prefix = await withTimeout(input.source.read(0, end, controller.signal), budget(), controller.signal);
        } catch (error: unknown) {
          if (error instanceof PdfTextInspectionError) throw error;
          throw new PdfTextInspectionError("source_unavailable", "initial_range");
        }
        if (prefix.byteLength !== end) throw new PdfTextInspectionError("source_unavailable", "initial_range");
      }
      if (!prefix || prefix.byteLength < 5 || new TextDecoder("ascii").decode(prefix.subarray(0, 5)) !== "%PDF-") {
        throw new PdfTextInspectionError("invalid_pdf");
      }
      if (input.source) transport = new PdfRangeTransport(input.source, this.limits, controller.signal, prefix);
      loadingTask = getDocument({
        ...(input.bytes ? { data: new Uint8Array(input.bytes) }
          : { range: transport!, length: input.source!.length, rangeChunkSize: this.limits.rangeChunkBytes }),
        disableAutoFetch: true,
        disableRange: input.bytes !== undefined,
        disableStream: true,
        enableXfa: false,
        isImageDecoderSupported: false,
        isOffscreenCanvasSupported: false,
        stopAtErrors: true,
        useSystemFonts: false,
        verbosity: 0,
      });
      const document = await withTimeout(loadingTask.promise, budget(), controller.signal);
      if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > 100_000) {
        throw new PdfTextInspectionError("limit_exceeded");
      }
      if (physicalPage > document.numPages) throw new ReaderOcrPageOutOfRangeError();
      page = await withTimeout(document.getPage(physicalPage), budget(), controller.signal);
      const dimensions = renderedDimensions(page, this.limits);
      const { createCanvas } = await import("@napi-rs/canvas");
      const canvas = createCanvas(dimensions.width, dimensions.height);
      try {
        const renderTask = page.render({
          canvas: canvas as never,
          canvasContext: canvas.getContext("2d") as never,
          viewport: dimensions.viewport as never,
        });
        try {
          await withTimeout(renderTask.promise, budget(), controller.signal);
        } catch (error: unknown) {
          renderTask.cancel();
          if (error instanceof PdfTextInspectionError) throw error;
          throw new PdfTextInspectionError("render_failure", "render");
        }
        const imageBytes = canvas.toBuffer("image/png");
        if (imageBytes.byteLength > this.limits.maxEncodedPageImageBytes) throw new PdfTextInspectionError("limit_exceeded");
        const recognition = await recognizeWithDeadline({
          ocr: this.ocr, imageBytes, pageIndex: physicalPage,
          deadline, limits: this.limits, signal: controller.signal, readerMode: true,
          ...(this.options.includeGeometry ? { includeGeometry: true } : {}),
        });
        if (controller.signal.aborted) throw new PdfTextInspectionError("aborted");
        if (!["recognized", "no_text", "low_confidence", "unsupported_script"].includes(recognition.status)
          || typeof recognition.text !== "string" || typeof recognition.engine !== "string"
          || recognition.engine.length < 1 || recognition.engine.length > 256
          || (recognition.confidence !== null && (!Number.isInteger(recognition.confidence)
            || recognition.confidence < 0 || recognition.confidence > 100))) {
          throw new PdfTextInspectionError("ocr_engine_failure", "ocr");
        }
        const cleaned = recognition.text.normalize("NFC").replace(/\r\n?/gu, "\n")
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "").trim();
        let truncated = recognition.truncated === true || cleaned.length > this.limits.maxOcrOutputCharactersPerPage;
        let text = cleaned.slice(0, this.limits.maxOcrOutputCharactersPerPage);
        if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
        const prepared = this.options.includeGeometry
          ? prepareOcrGeometry(recognition.text, recognition.geometry, this.limits.maxOcrOutputCharactersPerPage, dimensions)
          : undefined;
        if (prepared) {
          text = prepared.text;
          truncated = recognition.truncated === true || prepared.truncated;
        }
        const viewport = dimensions.viewport as ReturnType<PDFPageProxy["getViewport"]>;
        if ((recognition.status === "recognized" && text.length === 0)
          || (recognition.status === "no_text" && text.length !== 0)) {
          throw new PdfTextInspectionError("ocr_engine_failure", "ocr");
        }
        return {
          physicalPage, pageCount: document.numPages, status: recognition.status,
          text, confidence: recognition.confidence, engine: recognition.engine, truncated,
          renderScale: dimensions.scale,
          ...(prepared ? { geometry: prepared.geometry, renderedImage: {
            width: dimensions.width, height: dimensions.height,
            viewportWidth: viewport.width, viewportHeight: viewport.height, rotation: viewport.rotation,
            pdfToImageTransform: [...viewport.transform],
          } } : {}),
          rangeRequests: transport?.metrics.requests ?? 0,
          rangeBytes: transport?.metrics.fetchedBytes ?? input.bytes?.byteLength ?? 0,
        };
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    } catch (error: unknown) {
      if (error instanceof ReaderOcrPageOutOfRangeError) throw error;
      const metrics = transport?.metrics;
      if (error instanceof PdfTextInspectionError) {
        throw new PdfTextInspectionError(
          error.code !== "aborted" && transport?.hasSourceFailure ? "source_unavailable" : error.code,
          error.diagnosticStage, metrics?.requests, metrics?.fetchedBytes,
        );
      }
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      throw new PdfTextInspectionError(transport?.hasSourceFailure ? "source_unavailable"
        : /password|encrypted/u.test(message) ? "encrypted_pdf" : "invalid_pdf");
    } finally {
      controller.abort();
      signal?.removeEventListener("abort", onAbort);
      try { page?.cleanup(); } catch { /* Document destroy remains the final boundary. */ }
      transport?.dispose();
      if (loadingTask) await destroyLoadingTask(loadingTask);
    }
  }
}
