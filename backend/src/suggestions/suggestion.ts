import type { AuthorityRole, AuthorityType, TypeFieldName } from "../metadata/metadata.js";

export const SUGGESTION_RULESET_VERSION = "rf-metasuggest-v1" as const;
export const SUGGESTION_WINDOW = Object.freeze({ firstPages: 15, lastPages: 5 });
export const SUGGESTION_LIMITS = Object.freeze({
  maxObjectBytes: 32 * 1024 * 1024,
  maxPages: 20,
  maxPageTextCharacters: 16_384,
  maxTotalTextCharacters: 262_144,
  maxEmbeddedValueCharacters: 4_096,
  maxEmbeddedTotalCharacters: 16_384,
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
  rulesetVersion: typeof SUGGESTION_RULESET_VERSION;
}

export interface SuggestionRunSummary {
  id: string;
  libraryId: string;
  fileId: string;
  status: SuggestionStatus;
  rulesetVersion: typeof SUGGESTION_RULESET_VERSION;
  sourceVersion: string;
  window: SuggestionWindow;
  candidates: SuggestionCandidate[];
  createdAt: string;
}

export interface PdfTextPage {
  /** PDF page number, 1-based. */
  pageIndex: number;
  text: string;
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
}

export interface BoundedPdfTextSource {
  inspect(bytes: Uint8Array, limits: typeof SUGGESTION_LIMITS, signal?: AbortSignal): Promise<PdfTextInspection>;
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
