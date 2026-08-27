export const DERIVED_COMPUTE_JOB_KINDS = ["metadata_suggestion"] as const;
export type DerivedComputeJobKind = (typeof DERIVED_COMPUTE_JOB_KINDS)[number];

export const DERIVED_COMPUTE_JOB_STATES = ["queued", "running", "succeeded", "failed"] as const;
export type DerivedComputeJobState = (typeof DERIVED_COMPUTE_JOB_STATES)[number];

export const DERIVED_COMPUTE_ERROR_CODES = [
  "compute_dispatch_failed",
  "compute_source_stale",
  "compute_source_unavailable",
  "compute_timeout",
  "compute_limit_exceeded",
  "compute_invalid_pdf",
  "compute_unsupported",
  "compute_ocr_unavailable",
  "compute_invalid_result",
  "compute_authorization_changed",
  "compute_internal_error",
] as const;
export type DerivedComputeErrorCode = (typeof DERIVED_COMPUTE_ERROR_CODES)[number];

export interface DerivedComputeDispatchJob {
  id: string;
  kind: DerivedComputeJobKind;
  resourceId: string;
  attemptId: string;
  coreBaseUrl: string;
}

export interface DerivedComputeDispatchReceipt {
  provider: string;
  providerJobId: string;
}

export interface DerivedComputeDispatcher {
  dispatch(job: DerivedComputeDispatchJob): Promise<DerivedComputeDispatchReceipt>;
}

export const AUTHORITY_TYPES = ["person", "place", "language", "work", "institution"] as const;
export type DerivedAuthorityType = (typeof AUTHORITY_TYPES)[number];

export const AUTHORITY_ROLES = [
  "author",
  "editor",
  "translator",
  "compiler",
  "scribe",
  "sender",
  "recipient",
  "creator",
  "contributor",
  "publication_place",
  "creation_place",
  "discovery_place",
  "content_language",
  "original_language",
  "container_work",
  "series_work",
  "source_work",
  "publisher",
  "holding_institution",
  "issuing_body",
] as const;
export type DerivedAuthorityRole = (typeof AUTHORITY_ROLES)[number];

export const TYPE_FIELD_NAMES = [
  "editionStatement",
  "volumeStatement",
  "issueStatement",
  "locator",
  "shelfmark",
  "supportStatement",
  "extentStatement",
  "scriptStatement",
  "objectType",
  "materialStatement",
  "dimensionsStatement",
  "documentType",
  "fondsOrCollection",
  "seriesStatement",
  "referenceCode",
] as const;
export type DerivedTypeFieldName = (typeof TYPE_FIELD_NAMES)[number];

export const SUGGESTION_SOURCE_TYPES = [
  "title_page",
  "copyright_page",
  "cip_page",
  "colophon",
  "series_page",
  "embedded_pdf_metadata",
  "filename",
] as const;
export type DerivedSuggestionSourceType = (typeof SUGGESTION_SOURCE_TYPES)[number];

export const SUGGESTION_PAGE_CLASSES = [
  "cover",
  "half_title",
  "title_page",
  "copyright_page",
  "cip_page",
  "colophon",
  "series_page",
  "contents_preface",
  "ordinary_body",
  "unknown",
] as const;
export type DerivedSuggestionPageClass = (typeof SUGGESTION_PAGE_CLASSES)[number];

export const SUGGESTION_FIELD_PATHS = [
  "canonicalTitle",
  "subtitle",
  "dateStatement",
  "identifier",
  "typeField",
  "authority",
] as const;
export type DerivedSuggestionFieldPath = (typeof SUGGESTION_FIELD_PATHS)[number];

export const SUGGESTION_EVIDENCE_ORIGINS = [
  "native_text",
  "ocr",
  "embedded_pdf_metadata",
  "filename",
] as const;
export type DerivedSuggestionEvidenceOrigin = (typeof SUGGESTION_EVIDENCE_ORIGINS)[number];

export const SUGGESTION_CONFIDENCES = ["high", "medium", "low"] as const;
export type DerivedSuggestionConfidence = (typeof SUGGESTION_CONFIDENCES)[number];

export const DERIVED_SUGGESTION_STATUSES = [
  "ready",
  "ambiguous",
  "no_suggestions",
  "ocr_deferred",
  "unsupported",
] as const;
export type DerivedSuggestionStatus = (typeof DERIVED_SUGGESTION_STATUSES)[number];

export interface DerivedMetadataCandidate {
  position: number;
  fieldPath: DerivedSuggestionFieldPath;
  typeFieldName: DerivedTypeFieldName | null;
  authorityType: DerivedAuthorityType | null;
  authorityRole: DerivedAuthorityRole | null;
  identifierScheme: string | null;
  value: string;
  sourceType: DerivedSuggestionSourceType;
  sourcePageIndex: number | null;
  pageClass: DerivedSuggestionPageClass | null;
  confidence: DerivedSuggestionConfidence;
  precedenceRank: number;
  evidenceExcerpt: string | null;
  evidenceOrigin: DerivedSuggestionEvidenceOrigin;
  ocrEngine: string | null;
  ocrConfidence: number | null;
  rulesetVersion: "rf-frontmatterocr-v1" | "rf-frontmatterocr-v2";
}

export interface DerivedSuggestionWindow {
  firstPages: 15;
  lastPages: 5;
  pageCount: number;
  pageIndices: number[];
  complete: boolean;
}

export interface MetadataSuggestionComputeOutput {
  status: DerivedSuggestionStatus;
  window: DerivedSuggestionWindow;
  candidates: DerivedMetadataCandidate[];
  bibliography?: IntelligentBibliographyResult;
}

export interface DerivedComputeSucceededResult {
  jobId: string;
  attemptId: string;
  kind: "metadata_suggestion";
  state: "succeeded";
  output: MetadataSuggestionComputeOutput;
}

export interface DerivedComputeFailedResult {
  jobId: string;
  attemptId: string;
  kind: "metadata_suggestion";
  state: "failed";
  errorCode: DerivedComputeErrorCode;
}

export type DerivedComputeResult = DerivedComputeSucceededResult | DerivedComputeFailedResult;

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/u;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected) throw new TypeError(`${label} contains unsupported field ${unexpected}`);
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new TypeError(`${label} is invalid`);
  return value as T[number];
}

function boundedString(value: unknown, label: string, maximum: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\u0000\r]/u.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${label} is invalid`);
  }
  return value as number;
}

function nullableOneOf<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] | null {
  return value === null ? null : oneOf(value, allowed, label);
}

function parseCandidate(value: unknown, position: number): DerivedMetadataCandidate {
  const candidate = record(value, `candidate ${position}`);
  exactKeys(candidate, [
    "position", "fieldPath", "typeFieldName", "authorityType", "authorityRole", "identifierScheme",
    "value", "sourceType", "sourcePageIndex", "pageClass", "confidence", "precedenceRank",
    "evidenceExcerpt", "evidenceOrigin", "ocrEngine", "ocrConfidence", "rulesetVersion",
  ], `candidate ${position}`);
  const parsed: DerivedMetadataCandidate = {
    position: boundedInteger(candidate.position, "candidate.position", 0, 255),
    fieldPath: oneOf(candidate.fieldPath, SUGGESTION_FIELD_PATHS, "candidate.fieldPath"),
    typeFieldName: nullableOneOf(candidate.typeFieldName, TYPE_FIELD_NAMES, "candidate.typeFieldName"),
    authorityType: nullableOneOf(candidate.authorityType, AUTHORITY_TYPES, "candidate.authorityType"),
    authorityRole: nullableOneOf(candidate.authorityRole, AUTHORITY_ROLES, "candidate.authorityRole"),
    identifierScheme: boundedString(candidate.identifierScheme, "candidate.identifierScheme", 64, true),
    value: boundedString(candidate.value, "candidate.value", 512)!,
    sourceType: oneOf(candidate.sourceType, SUGGESTION_SOURCE_TYPES, "candidate.sourceType"),
    sourcePageIndex: candidate.sourcePageIndex === null
      ? null
      : boundedInteger(candidate.sourcePageIndex, "candidate.sourcePageIndex", 1, 1_000_000),
    pageClass: nullableOneOf(candidate.pageClass, SUGGESTION_PAGE_CLASSES, "candidate.pageClass"),
    confidence: oneOf(candidate.confidence, SUGGESTION_CONFIDENCES, "candidate.confidence"),
    precedenceRank: boundedInteger(candidate.precedenceRank, "candidate.precedenceRank", 0, 10_000),
    evidenceExcerpt: boundedString(candidate.evidenceExcerpt, "candidate.evidenceExcerpt", 512, true),
    evidenceOrigin: oneOf(candidate.evidenceOrigin, SUGGESTION_EVIDENCE_ORIGINS, "candidate.evidenceOrigin"),
    ocrEngine: boundedString(candidate.ocrEngine, "candidate.ocrEngine", 256, true),
    ocrConfidence: candidate.ocrConfidence === null
      ? null
      : boundedInteger(candidate.ocrConfidence, "candidate.ocrConfidence", 0, 100),
    rulesetVersion: oneOf(candidate.rulesetVersion, ["rf-frontmatterocr-v1", "rf-frontmatterocr-v2"] as const, "candidate.rulesetVersion"),
  };
  if (parsed.position !== position) throw new TypeError("candidate positions must be canonical and contiguous");
  if (parsed.evidenceOrigin === "ocr" && (parsed.ocrEngine === null || parsed.ocrConfidence === null || parsed.sourcePageIndex === null)) {
    throw new TypeError("OCR candidates require bounded engine, confidence, and page provenance");
  }
  if (parsed.evidenceOrigin !== "ocr" && (parsed.ocrEngine !== null || parsed.ocrConfidence !== null)) {
    throw new TypeError("non-OCR candidates cannot carry OCR provenance");
  }
  return parsed;
}

function parseWindow(value: unknown): DerivedSuggestionWindow {
  const window = record(value, "output.window");
  exactKeys(window, ["firstPages", "lastPages", "pageCount", "pageIndices", "complete"], "output.window");
  if (window.firstPages !== 15 || window.lastPages !== 5 || typeof window.complete !== "boolean") {
    throw new TypeError("output.window contract is invalid");
  }
  const pageCount = boundedInteger(window.pageCount, "output.window.pageCount", 1, 1_000_000);
  if (!Array.isArray(window.pageIndices) || window.pageIndices.length > 20) {
    throw new TypeError("output.window.pageIndices is invalid");
  }
  const pageIndices = window.pageIndices.map((entry, index) => boundedInteger(entry, `pageIndices[${index}]`, 1, pageCount));
  if (new Set(pageIndices).size !== pageIndices.length || pageIndices.some((entry, index) => index > 0 && entry <= pageIndices[index - 1]!)) {
    throw new TypeError("output.window.pageIndices must be unique and ordered");
  }
  return { firstPages: 15, lastPages: 5, pageCount, pageIndices, complete: window.complete };
}

function parseOutput(value: unknown): MetadataSuggestionComputeOutput {
  const output = record(value, "result.output");
  exactKeys(output, ["status", "window", "candidates", "bibliography"], "result.output");
  if (!Array.isArray(output.candidates) || output.candidates.length > 256) {
    throw new TypeError("result.output.candidates is invalid");
  }
  const window = parseWindow(output.window);
  const bibliography = output.bibliography === undefined ? undefined : parseIntelligentBibliographyResult(output.bibliography);
  if (bibliography && (bibliography.provenance.selectedPages.some((page) => !window.pageIndices.includes(page))
    || bibliography.fields.some((field) => field.sourcePageIndex !== null && !window.pageIndices.includes(field.sourcePageIndex)))) {
    throw new TypeError("result bibliography provenance falls outside the inspected window");
  }
  return {
    status: oneOf(output.status, DERIVED_SUGGESTION_STATUSES, "result.output.status"),
    window,
    candidates: output.candidates.map((candidate, position) => parseCandidate(candidate, position)),
    ...(bibliography === undefined ? {} : { bibliography }),
  };
}

export function parseDerivedComputeResult(value: unknown): DerivedComputeResult {
  const result = record(value, "result");
  const state = oneOf(result.state, ["succeeded", "failed"] as const, "result.state");
  const allowed = state === "succeeded"
    ? ["jobId", "attemptId", "kind", "state", "output"]
    : ["jobId", "attemptId", "kind", "state", "errorCode"];
  exactKeys(result, allowed, "result");
  const base = {
    jobId: boundedString(result.jobId, "result.jobId", 128)!,
    attemptId: boundedString(result.attemptId, "result.attemptId", 128)!,
    kind: oneOf(result.kind, DERIVED_COMPUTE_JOB_KINDS, "result.kind"),
  };
  if (!IDENTIFIER.test(base.jobId) || !IDENTIFIER.test(base.attemptId)) {
    throw new TypeError("result identifiers are invalid");
  }
  if (state === "failed") {
    return { ...base, kind: "metadata_suggestion", state, errorCode: oneOf(result.errorCode, DERIVED_COMPUTE_ERROR_CODES, "result.errorCode") };
  }
  return { ...base, kind: "metadata_suggestion", state, output: parseOutput(result.output) };
}
import {
  parseIntelligentBibliographyResult,
  type IntelligentBibliographyResult,
} from "./bibliography.js";

export * from "./bibliography.js";
