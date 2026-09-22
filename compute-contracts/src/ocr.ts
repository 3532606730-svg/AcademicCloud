/**
 * Provider-neutral contract reserved for the future Reader OCR adapter.
 *
 * This contract describes an authorized source generation and an explicit
 * physical-page selection. It does not imply that OCR is enabled, persisted,
 * or dispatched by the current product.
 */

export const OCR_CONTRACT_VERSION = "academiccloud.reader-ocr.v1" as const;
export const OCR_PAGE_MIN = 1 as const;
export const OCR_PAGE_MAX = 1_000_000 as const;
export const OCR_MAX_PAGE_SPAN = 64 as const;
export const OCR_MAX_LANGUAGE_HINTS = 8 as const;
export const OCR_MAX_LANGUAGE_HINT_LENGTH = 64 as const;

export type OcrPageSelection =
  | { kind: "single"; physicalPage: number }
  | { kind: "range"; startPhysicalPage: number; endPhysicalPage: number };

export interface OcrRequest {
  resourceId: string;
  sourceId: string;
  selection: OcrPageSelection;
  languageHints?: string[];
}

export interface OcrPageResult {
  physicalPage: number;
  pageId: string | null;
  status: "recognized" | "no_text" | "low_confidence" | "unsupported_script";
  text: string | null;
  confidence: number | null;
  provenance: {
    engineId: string;
    engineVersion: string;
    modelVersion: string | null;
    adapterVersion: string;
  } | null;
}

export interface OcrResponse {
  contractVersion: typeof OCR_CONTRACT_VERSION;
  requestId: string;
  source: { resourceId: string; sourceId: string };
  state: "disabled" | "succeeded" | "failed";
  pages: OcrPageResult[];
  truncated: boolean;
  limits: {
    maxPages: number;
    maxCharsPerPage: number;
    maxTotalChars: number;
  };
  errorCode?: "ocr_deferred" | "ocr_unavailable" | "source_stale" | "invalid_request";
}

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/u;

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function physicalPage(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < OCR_PAGE_MIN || value > OCR_PAGE_MAX) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

/** Parse and bound an untrusted request before it reaches an OCR adapter. */
export function parseOcrRequest(value: unknown): OcrRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("request must be an object");
  const input = value as Record<string, unknown>;
  const keys = new Set(["resourceId", "sourceId", "selection", "languageHints"]);
  const unexpected = Object.keys(input).find((key) => !keys.has(key));
  if (unexpected) throw new TypeError(`request contains unsupported field ${unexpected}`);

  const selectionValue = input.selection;
  if (typeof selectionValue !== "object" || selectionValue === null || Array.isArray(selectionValue)) {
    throw new TypeError("selection is invalid");
  }
  const selection = selectionValue as Record<string, unknown>;
  let parsedSelection: OcrPageSelection;
  if (selection.kind === "single") {
    if (Object.keys(selection).some((key) => !["kind", "physicalPage"].includes(key))) throw new TypeError("selection is invalid");
    parsedSelection = { kind: "single", physicalPage: physicalPage(selection.physicalPage, "physicalPage") };
  } else if (selection.kind === "range") {
    if (Object.keys(selection).some((key) => !["kind", "startPhysicalPage", "endPhysicalPage"].includes(key))) throw new TypeError("selection is invalid");
    const startPhysicalPage = physicalPage(selection.startPhysicalPage, "startPhysicalPage");
    const endPhysicalPage = physicalPage(selection.endPhysicalPage, "endPhysicalPage");
    if (endPhysicalPage < startPhysicalPage || endPhysicalPage - startPhysicalPage + 1 > OCR_MAX_PAGE_SPAN) throw new TypeError("selection is invalid");
    parsedSelection = { kind: "range", startPhysicalPage, endPhysicalPage };
  } else {
    throw new TypeError("selection is invalid");
  }

  let languageHints: string[] | undefined;
  if (input.languageHints !== undefined) {
    if (!Array.isArray(input.languageHints) || input.languageHints.length > OCR_MAX_LANGUAGE_HINTS) throw new TypeError("languageHints is invalid");
    languageHints = input.languageHints.map((hint, index) => {
      if (typeof hint !== "string" || hint.length < 1 || hint.length > OCR_MAX_LANGUAGE_HINT_LENGTH || /[\u0000\r\n]/u.test(hint)) throw new TypeError(`languageHints[${index}] is invalid`);
      return hint;
    });
  }

  return {
    resourceId: boundedIdentifier(input.resourceId, "resourceId"),
    sourceId: boundedIdentifier(input.sourceId, "sourceId"),
    selection: parsedSelection,
    ...(languageHints === undefined ? {} : { languageHints }),
  };
}
