import type {
  DerivedAuthorityRole,
  DerivedAuthorityType,
  DerivedMetadataCandidate,
  DerivedSuggestionConfidence,
  DerivedSuggestionEvidenceOrigin,
  DerivedSuggestionFieldPath,
  DerivedSuggestionPageClass,
  DerivedSuggestionSourceType,
  DerivedSuggestionStatus,
  DerivedTypeFieldName,
} from "@academiccloud/compute-contracts";

export const SUGGESTION_RULESET_VERSION = "rf-frontmatterocr-v2" as const;
export const SUGGESTION_WINDOW = Object.freeze({ firstPages: 15, lastPages: 5 });

export interface SuggestionLimits {
  maxObjectBytes: number;
  maxObjectSizeBytes: number;
  maxPdfJsBufferBytes: number;
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
  // PDF.js allocates a full-length ChunkedStream backing buffer even when it
  // receives the object through byte ranges. One GiB covers the largest
  // approved production PDF observed at this incident checkpoint (922 MB)
  // while preserving the qualified <6 GiB intelligent-worker envelope.
  maxPdfJsBufferBytes: 1 * 1024 * 1024 * 1024,
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
  perPageOcrTimeoutMilliseconds: 60_000,
  totalRequestTimeoutMilliseconds: 300_000,
  maxConcurrentPageOcrJobs: 1,
  maxConcurrentOcrRequests: 1,
  timeoutMilliseconds: 120_000,
});

export type SuggestionCandidate = DerivedMetadataCandidate;
export type SuggestionStatus = DerivedSuggestionStatus;
export type EvidenceOrigin = DerivedSuggestionEvidenceOrigin;
export type PageClass = DerivedSuggestionPageClass;
export type SuggestionConfidence = DerivedSuggestionConfidence;
export type SuggestionFieldPath = DerivedSuggestionFieldPath;
export type SuggestionSourceType = DerivedSuggestionSourceType;
export type AuthorityRole = DerivedAuthorityRole;
export type AuthorityType = DerivedAuthorityType;
export type TypeFieldName = DerivedTypeFieldName;

export interface PdfTextPage {
  pageIndex: number;
  text: string;
  evidenceOrigin?: "native_text" | "ocr";
  ocrEngine?: string | null;
  ocrConfidence?: number | null;
  /** Effective PDF.js viewport scale used for this OCR page. */
  ocrRenderScale?: number;
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
  inspectFile?(path: string, length: number, limits: Readonly<SuggestionLimits>, signal?: AbortSignal): Promise<PdfTextInspection>;
  close?(): Promise<void> | void;
}

export interface PdfRangeSource {
  readonly length: number;
  read(begin: number, end: number, signal?: AbortSignal): Promise<Uint8Array>;
}
