import type { AuthorityRole, AuthorityType, TypeFieldName } from "../metadata/metadata.js";

export const LEGACY_SUGGESTION_RULESET_VERSION = "rf-metasuggest-v1" as const;
export const PREVIOUS_SUGGESTION_RULESET_VERSION = "rf-frontmatterocr-v1" as const;
export const SUGGESTION_RULESET_VERSION = "rf-frontmatterocr-v2" as const;
export type SuggestionRulesetVersion =
  | typeof LEGACY_SUGGESTION_RULESET_VERSION
  | typeof PREVIOUS_SUGGESTION_RULESET_VERSION
  | typeof SUGGESTION_RULESET_VERSION;
export const SUGGESTION_WINDOW = Object.freeze({ firstPages: 15, lastPages: 5 });
export interface SuggestionLimits {
  maxObjectBytes: number;
  /** Maximum stat-reported PDF size accepted by the bounded range path. */
  maxObjectSizeBytes: number;
  maxRangeBytes: number;
  maxRangeRequests: number;
  rangeChunkBytes: number;
  maxPages: number;
  maxPageTextCharacters: number;
  maxTotalTextCharacters: number;
  maxEmbeddedValueCharacters: number;
  maxEmbeddedTotalCharacters: number;
  renderScale: number;
  maxRenderedPageWidthPixels: number;
  maxRenderedPageHeightPixels: number;
  maxRenderedPagePixels: number;
  maxRenderedBitmapBytes: number;
  maxEncodedPageImageBytes: number;
  maxOcrOutputCharactersPerPage: number;
  maxTotalOcrOutputCharacters: number;
  maxOcrProcessOutputBytes: number;
  minimumOcrConfidence: number;
  perPageOcrTimeoutMilliseconds: number;
  totalRequestTimeoutMilliseconds: number;
  maxConcurrentPageOcrJobs: number;
  maxConcurrentOcrRequests: number;
  timeoutMilliseconds: number;
}
export const SUGGESTION_LIMITS: Readonly<SuggestionLimits> = Object.freeze({
  maxObjectBytes: 32 * 1024 * 1024,
  maxObjectSizeBytes: 4 * 1024 * 1024 * 1024,
  maxRangeBytes: 32 * 1024 * 1024,
  maxRangeRequests: 64,
  rangeChunkBytes: 1 * 1024 * 1024,
  maxPages: 20,
  maxPageTextCharacters: 16_384,
  maxTotalTextCharacters: 262_144,
  maxEmbeddedValueCharacters: 4_096,
  maxEmbeddedTotalCharacters: 16_384,
  renderScale: 1.5,
  maxRenderedPageWidthPixels: 2_000,
  maxRenderedPageHeightPixels: 2_800,
  maxRenderedPagePixels: 5_600_000,
  maxRenderedBitmapBytes: 22_400_000,
  maxEncodedPageImageBytes: 8 * 1024 * 1024,
  maxOcrOutputCharactersPerPage: 16_384,
  maxTotalOcrOutputCharacters: 65_536,
  maxOcrProcessOutputBytes: 2 * 1024 * 1024,
  minimumOcrConfidence: 55,
  perPageOcrTimeoutMilliseconds: 5_000,
  totalRequestTimeoutMilliseconds: 25_000,
  maxConcurrentPageOcrJobs: 1,
  maxConcurrentOcrRequests: 1,
  timeoutMilliseconds: 5_000,
});

export const PAGE_CLASSES = [
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
export type PageClass = (typeof PAGE_CLASSES)[number];

export const SUGGESTION_SOURCE_TYPES = [
  "title_page",
  "copyright_page",
  "cip_page",
  "colophon",
  "series_page",
  "embedded_pdf_metadata",
  "filename",
] as const;
export type SuggestionSourceType = (typeof SUGGESTION_SOURCE_TYPES)[number];

export const SUGGESTION_STATUSES = [
  "ready",
  "ambiguous",
  "no_suggestions",
  "ocr_deferred",
  "unsupported",
  "stale",
  "accepted",
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_FIELD_PATHS = [
  "canonicalTitle",
  "subtitle",
  "dateStatement",
  "identifier",
  "typeField",
  "authority",
] as const;
export type SuggestionFieldPath = (typeof SUGGESTION_FIELD_PATHS)[number];

export type SuggestionConfidence = "high" | "medium" | "low";

export const EVIDENCE_ORIGINS = [
  "native_text",
  "ocr",
  "embedded_pdf_metadata",
  "filename",
] as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export interface SuggestionWindow {
  firstPages: 15;
  lastPages: 5;
  pageCount: number | null;
  /** Selected PDF pages, 1-based: first 15 plus last 5, deduplicated. */
  pageIndices: number[];
  complete: boolean;
}

export interface SuggestionCandidate {
  id: string;
  position: number;
  fieldPath: SuggestionFieldPath;
  typeFieldName: TypeFieldName | null;
  authorityType: AuthorityType | null;
  authorityRole: AuthorityRole | null;
  identifierScheme: string | null;
  value: string;
  sourceType: SuggestionSourceType;
  sourcePageIndex: number | null;
  pageClass: PageClass | null;
  confidence: SuggestionConfidence;
  precedenceRank: number;
  evidenceExcerpt: string | null;
  evidenceOrigin: EvidenceOrigin;
  ocrEngine: string | null;
  ocrConfidence: number | null;
  rulesetVersion: SuggestionRulesetVersion;
}

export interface SuggestionRunSummary {
  id: string;
  libraryId: string;
  fileId: string;
  status: SuggestionStatus;
  rulesetVersion: SuggestionRulesetVersion;
  sourceVersion: string;
  window: SuggestionWindow;
  candidates: SuggestionCandidate[];
  createdAt: string;
}

export interface PdfTextPage {
  /** PDF page number, 1-based. */
  pageIndex: number;
  text: string;
  evidenceOrigin?: "native_text" | "ocr";
  ocrEngine?: string | null;
  /** Integer 0–100 for OCR evidence; null for native text. */
  ocrConfidence?: number | null;
}

export interface PdfEmbeddedMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export interface PdfTextInspection {
  pageCount: number;
  pageIndices: number[];
  pages: PdfTextPage[];
  embeddedMetadata: PdfEmbeddedMetadata;
  complete: boolean;
  hasUsableTextLayer: boolean;
  hasUsableEvidence?: boolean;
  nativePageCount?: number;
  ocrPageCount?: number;
}

export interface BoundedPdfTextSource {
  inspect(bytes: Uint8Array, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection>;
  inspectRange?(source: PdfRangeSource, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection>;
}

export interface PdfRangeSource {
  readonly length: number;
  read(begin: number, end: number, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface SuggestionSourceFingerprint {
  value: string;
  fileRevision: number;
  checksumAlgorithm: string | null;
  checksum: string | null;
}

export interface SuggestionRunRecord extends SuggestionRunSummary {
  ownerDomainId: string;
  recordId: string;
  sourceFingerprint: SuggestionSourceFingerprint;
  createdByAccountId: string;
}

export interface NewSuggestionRun {
  id: string;
  ownerDomainId: string;
  libraryId: string;
  recordId: string;
  fileId: string;
  sourceFingerprint: SuggestionSourceFingerprint;
  status: SuggestionStatus;
  window: SuggestionWindow;
  createdByAccountId: string;
  createdAt: Date;
  candidates: Omit<SuggestionCandidate, "id">[];
}
