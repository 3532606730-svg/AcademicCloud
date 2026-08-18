import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  SUGGESTION_LIMITS,
  SUGGESTION_WINDOW,
  type BoundedPdfTextSource,
  type PdfEmbeddedMetadata,
  type PdfTextInspection,
  type PdfTextPage,
} from "./suggestion.js";

/**
 * Errors deliberately carry a small, non-sensitive code.  The suggestion
 * service can turn these into an internal `unsupported`/`ocr_deferred` state
 * without exposing parser diagnostics or PDF contents to a caller.
 */
export class PdfTextInspectionError extends Error {
  constructor(
    readonly code: "too_large" | "timeout" | "aborted" | "invalid_pdf" | "encrypted_pdf" | "limit_exceeded",
    message = code,
  ) {
    super(message);
    this.name = "PdfTextInspectionError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PdfTextInspectionError("aborted");
  }
}

function remainingBudget(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new PdfTextInspectionError("timeout");
  return remaining;
}

function asBoundedText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  // PDF.js may return malformed strings containing NUL/control characters.
  // Keep line boundaries, remove other controls, normalize Unicode, and cap
  // before any downstream parser sees the value.
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    // C0, C1, and DEL controls are not valid RF-META01 plain text.  Strip
    // them before limits/evidence extraction so malformed PDF strings cannot
    // survive into a persisted suggestion or UI excerpt.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f]/g, "")
    .slice(0, limit);
}

function normaliseEmbedded(info: unknown, limits: typeof SUGGESTION_LIMITS): PdfEmbeddedMetadata {
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

function selectedPageIndices(pageCount: number, limits: typeof SUGGESTION_LIMITS): number[] {
  const first = Math.min(SUGGESTION_WINDOW.firstPages, pageCount);
  const lastStart = Math.max(1, pageCount - SUGGESTION_WINDOW.lastPages + 1);
  const selected = new Set<number>();
  for (let index = 1; index <= first; index += 1) selected.add(index);
  for (let index = lastStart; index <= pageCount; index += 1) selected.add(index);
  const result = [...selected].sort((a, b) => a - b);
  if (result.length > limits.maxPages) {
    throw new PdfTextInspectionError("limit_exceeded");
  }
  return result;
}

function hasUsableText(pages: readonly PdfTextPage[]): boolean {
  return pages.some((page) => {
    const compact = page.text.replace(/\s+/gu, "");
    return compact.length >= 2 && /[\p{L}]/u.test(compact);
  });
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  signal?: AbortSignal,
): Promise<T> {
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

/**
 * Local, text-layer-only PDF inspector. It never renders a page and therefore
 * cannot perform OCR. The caller must supply an already bounded byte buffer;
 * this second check prevents accidental unbounded use by future callers.
 */
export async function inspectPdfText(
  bytes: Uint8Array,
  limits: typeof SUGGESTION_LIMITS = SUGGESTION_LIMITS,
  signal?: AbortSignal,
): Promise<PdfTextInspection> {
  throwIfAborted(signal);
  if (bytes.byteLength > limits.maxObjectBytes) {
    throw new PdfTextInspectionError("too_large");
  }
  if (bytes.byteLength < 5 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new PdfTextInspectionError("invalid_pdf");
  }

  let loadingTask: ReturnType<typeof getDocument> | undefined;
  const deadline = Date.now() + limits.timeoutMilliseconds;
  try {
    // Clone because PDF.js may transfer ownership of a supplied Uint8Array.
    const data = new Uint8Array(bytes);
    loadingTask = getDocument({
      data,
      disableAutoFetch: true,
      disableRange: true,
      disableStream: true,
      enableXfa: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    const document = await withTimeout(loadingTask.promise, remainingBudget(deadline), signal);
    const pageCount = document.numPages;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100_000) {
      throw new PdfTextInspectionError("limit_exceeded");
    }
    const pageIndices = selectedPageIndices(pageCount, limits);
    const pages: PdfTextPage[] = [];
    let totalCharacters = 0;
    for (const pageIndex of pageIndices) {
      throwIfAborted(signal);
      const page = await withTimeout(document.getPage(pageIndex), remainingBudget(deadline), signal);
      const content = await withTimeout(
        page.getTextContent({ disableNormalization: false }),
        remainingBudget(deadline),
        signal,
      );
      // A newline between items is intentional: PDF.js item boundaries retain
      // enough layout signal for title/CIP line-oriented heuristics.
      const rawText = content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .filter((item) => item.length > 0)
        .join("\n");
      const remaining = limits.maxTotalTextCharacters - totalCharacters;
      if (remaining <= 0) throw new PdfTextInspectionError("limit_exceeded");
      const text = asBoundedText(rawText, Math.min(limits.maxPageTextCharacters, remaining));
      totalCharacters += text.length;
      pages.push({ pageIndex, text });
    }

    let embeddedMetadata: PdfEmbeddedMetadata = {};
    try {
      const metadata = await withTimeout(document.getMetadata(), remainingBudget(deadline), signal);
      embeddedMetadata = normaliseEmbedded(metadata.info, limits);
      // XMP metadata is deliberately not copied wholesale. PDF Info fields are
      // the only bounded, explicit fields accepted by this release.
    } catch (error: unknown) {
      if (error instanceof PdfTextInspectionError && ["timeout", "aborted", "limit_exceeded"].includes(error.code)) {
        throw error;
      }
      // A malformed metadata dictionary must not make otherwise usable text
      // unavailable; simply proceed without embedded candidates.
    }
    await loadingTask.destroy();
    return {
      pageCount,
      pageIndices,
      pages,
      embeddedMetadata,
      complete: pages.length === pageIndices.length,
      hasUsableTextLayer: hasUsableText(pages),
    };
  } catch (error: unknown) {
    if (error instanceof PdfTextInspectionError) throw error;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password") || message.includes("encrypted")) {
      throw new PdfTextInspectionError("encrypted_pdf");
    }
    throw new PdfTextInspectionError("invalid_pdf");
  } finally {
    if (loadingTask && !loadingTask.destroyed) {
      try {
        await loadingTask.destroy();
      } catch {
        // Cleanup is best effort; no parser internals are exposed.
      }
    }
  }
}

export class PdfJsTextInspector implements BoundedPdfTextSource {
  inspect(bytes: Uint8Array, limits: typeof SUGGESTION_LIMITS, signal?: AbortSignal): Promise<PdfTextInspection> {
    return inspectPdfText(bytes, limits, signal);
  }
}

/** Stable service-facing name retained separately from the implementation
 * class so the parser can be replaced without changing suggestion orchestration. */
export class PdfJsTextSource extends PdfJsTextInspector {}
