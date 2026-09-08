export const CATALOG_BATCH_SCHEMA_VERSION = "academiccloud.catalog-batch.v1" as const;
export const CATALOG_EXPORT_REQUEST_SCHEMA_VERSION = "academiccloud.catalog-export-request.v1" as const;
export const CATALOG_RESULTS_SCHEMA_VERSION = "academiccloud.catalog-results.v1" as const;
export const CATALOG_RESULTS_PATCH_SCHEMA_VERSION = "academiccloud.catalog-results.v2" as const;
export const CATALOG_FILENAME_POLICY_VERSION = "academiccloud.filename.v1" as const;
export const CATALOG_EVIDENCE_SCHEMA_VERSION = "academiccloud.catalog-evidence.v2" as const;

export const CATALOG_DISPOSITIONS = ["auto", "review", "unknown"] as const;
export type CatalogDisposition = (typeof CATALOG_DISPOSITIONS)[number];

export const CATALOG_FILENAME_STYLES = ["cjk_book", "cjk_source", "cjk_article", "foreign_book", "preserve_original"] as const;
export type CatalogFilenameStyle = (typeof CATALOG_FILENAME_STYLES)[number];

export const CATALOG_EVIDENCE_FAILURE_CODES = [
  "source_unavailable",
  "identity_mismatch",
  "limit_exceeded",
  "inspection_failed",
  "timeout",
] as const;
export type CatalogEvidenceFailureCode = (typeof CATALOG_EVIDENCE_FAILURE_CODES)[number];

export interface CatalogSourceIdentity {
  sourceFingerprint: string;
  fileRevision: number;
  checksumAlgorithm: string | null;
  checksum: string | null;
}

export interface CatalogBatchManifestResource {
  resourceId: string;
  sourceIdentity: CatalogSourceIdentity;
  currentFilename: string;
  mediaType: "application/pdf";
  sizeBytes: number;
  pageCount: number | null;
  evidenceFile: string;
}

export interface CatalogBatchManifest {
  schemaVersion: typeof CATALOG_BATCH_SCHEMA_VERSION;
  batchId: string;
  createdAt: string;
  namingPolicyVersion: typeof CATALOG_FILENAME_POLICY_VERSION;
  evidencePolicy: {
    firstPages: number;
    lastPages: number;
    maxPages: number;
    maxCharactersPerPage: number;
    maxCharactersPerResource: number;
    selectiveOcr: true;
    includesSourceBytes: false;
  };
  resources: CatalogBatchManifestResource[];
}

export interface CatalogExportRequest {
  schemaVersion: typeof CATALOG_EXPORT_REQUEST_SCHEMA_VERSION;
  manifest: CatalogBatchManifest;
  sourceManifestSha256: string;
  sourceAccess: {
    coreBaseUrl: string;
    capabilityToken: string;
    expiresAt: string;
  };
}

export interface CatalogEvidencePage {
  pageIndex: number;
  pageClass: string;
  evidenceOrigin: "native_text" | "ocr";
  ocrConfidence: number | null;
  text: string;
}

/** Historical evidence shape retained for compatibility with direct V1 exporters. */
export interface CatalogResourceEvidence {
  schemaVersion: "academiccloud.catalog-evidence.v1";
  resourceId: string;
  sourceIdentity: CatalogSourceIdentity;
  currentFilename: string;
  pageCount: number;
  embeddedMetadata: Record<string, string>;
  pages: CatalogEvidencePage[];
  complete: boolean;
}

export type CatalogEvidenceInspection =
  | { status: "ready"; failureCode: null }
  | { status: "failed"; failureCode: CatalogEvidenceFailureCode };

/**
 * Batch-resilient evidence shape. Failed resources retain immutable source
 * identity but contain no inferred bibliographic evidence. Reviewers must emit
 * UNKNOWN for them rather than infer facts from a filename or neighboring item.
 */
export interface CatalogResourceEvidenceV2 {
  schemaVersion: typeof CATALOG_EVIDENCE_SCHEMA_VERSION;
  resourceId: string;
  sourceIdentity: CatalogSourceIdentity;
  currentFilename: string;
  pageCount: number | null;
  embeddedMetadata: Record<string, string>;
  pages: CatalogEvidencePage[];
  complete: boolean;
  inspection: CatalogEvidenceInspection;
}

/**
 * Stable JSON used only for batch-document identity. Object keys are sorted;
 * array order is preserved because manifest resources are already ordered by
 * immutable resource identity.
 */
export function canonicalCatalogJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCatalogJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right, "en"));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalCatalogJson(entry)}`).join(",")}}`;
}
