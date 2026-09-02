import {
  CATALOG_BATCH_SCHEMA_VERSION,
  CATALOG_DISPOSITIONS,
  CATALOG_FILENAME_POLICY_VERSION,
  CATALOG_FILENAME_STYLES,
  CATALOG_RESULTS_SCHEMA_VERSION,
  type CatalogBatchManifest,
  type CatalogDisposition,
  type CatalogFilenameStyle,
  type CatalogSourceIdentity,
} from "@academiccloud/compute-contracts";

import {
  BibliographyValidationError,
  isValidIsbn,
  normalizeBibliographicProfileInput,
  type BibliographicProfileInput,
} from "../bibliography/bibliography.js";
import { MATERIAL_TYPES, type CanonicalMetadataInput, type MaterialType } from "../metadata/metadata.js";

export const MAX_CATALOG_BATCH_RESOURCES = 500;
export const MAX_CATALOG_RESULTS_BYTES = 8 * 1024 * 1024;
export const MAX_CATALOG_NOTES_CHARACTERS = 2_000;

export class CatalogContractError extends Error {
  constructor(readonly code: "invalid_input" | "manifest_digest_mismatch") {
    super(code);
    this.name = "CatalogContractError";
  }
}

export interface ImportedCatalogBibliography {
  canonicalTitle: string;
  subtitle?: string | null | undefined;
  alternativeTitles?: string[] | undefined;
  dateStatement?: string | null | undefined;
  identifiers?: Array<{ scheme: string; value: string }> | undefined;
  materialType?: MaterialType | undefined;
  profile: BibliographicProfileInput;
  responsibilityStatement?: string | undefined;
  filenameStyle: CatalogFilenameStyle;
  importWarnings: CatalogImportWarning[];
}

export interface CatalogImportWarning {
  code: "invalid_isbn_removed";
  count: number;
}

export interface ImportedCatalogResult {
  resourceId: string;
  sourceIdentity: CatalogSourceIdentity;
  disposition: CatalogDisposition;
  bibliographic: ImportedCatalogBibliography | null;
  confidence: number;
  notes: string | null;
}

export interface CatalogResultsDocument {
  schemaVersion: typeof CATALOG_RESULTS_SCHEMA_VERSION;
  batchId: string;
  sourceManifestSha256: string;
  sourceManifest: CatalogBatchManifest;
  results: ImportedCatalogResult[];
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const SOURCE_FINGERPRINT = /^[A-Za-z0-9_-]{43}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CatalogContractError("invalid_input");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new CatalogContractError("invalid_input");
  }
}

function text(value: unknown, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string") throw new CatalogContractError("invalid_input");
  const result = value.normalize("NFC").trim();
  if (!result || [...result].length > maximum || CONTROL.test(result) || pattern && !pattern.test(result)) {
    throw new CatalogContractError("invalid_input");
  }
  return result;
}

function nullableText(value: unknown, maximum: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return text(value, maximum);
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) throw new CatalogContractError("invalid_input");
  return value as T[number];
}

function sourceIdentity(value: unknown): CatalogSourceIdentity {
  const input = object(value);
  exactKeys(input, ["sourceFingerprint", "fileRevision", "checksumAlgorithm", "checksum"]);
  const checksumAlgorithm = input.checksumAlgorithm === null ? null : text(input.checksumAlgorithm, 32, /^[a-z0-9._-]+$/u);
  const checksum = input.checksum === null ? null : text(input.checksum, 256, /^[A-Za-z0-9+/=_-]+$/u);
  if ((checksumAlgorithm === null) !== (checksum === null)
    || !Number.isSafeInteger(input.fileRevision) || (input.fileRevision as number) < 0) throw new CatalogContractError("invalid_input");
  return {
    sourceFingerprint: text(input.sourceFingerprint, 43, SOURCE_FINGERPRINT),
    fileRevision: input.fileRevision as number,
    checksumAlgorithm,
    checksum,
  };
}

function isoDate(value: unknown): string {
  const result = text(value, 32);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) throw new CatalogContractError("invalid_input");
  return result;
}

export function parseCatalogBatchManifest(value: unknown): CatalogBatchManifest {
  const input = object(value);
  exactKeys(input, ["schemaVersion", "batchId", "createdAt", "namingPolicyVersion", "evidencePolicy", "resources"]);
  if (input.schemaVersion !== CATALOG_BATCH_SCHEMA_VERSION || input.namingPolicyVersion !== CATALOG_FILENAME_POLICY_VERSION) {
    throw new CatalogContractError("invalid_input");
  }
  const policy = object(input.evidencePolicy);
  exactKeys(policy, ["firstPages", "lastPages", "maxPages", "maxCharactersPerPage", "maxCharactersPerResource", "selectiveOcr", "includesSourceBytes"]);
  const integers = ["firstPages", "lastPages", "maxPages", "maxCharactersPerPage", "maxCharactersPerResource"] as const;
  if (integers.some((key) => !Number.isSafeInteger(policy[key]) || (policy[key] as number) < 1)
    || policy.selectiveOcr !== true || policy.includesSourceBytes !== false) throw new CatalogContractError("invalid_input");
  if (!Array.isArray(input.resources) || input.resources.length < 1 || input.resources.length > MAX_CATALOG_BATCH_RESOURCES) {
    throw new CatalogContractError("invalid_input");
  }
  const resources = input.resources.map((entry) => {
    const resource = object(entry);
    exactKeys(resource, ["resourceId", "sourceIdentity", "currentFilename", "mediaType", "sizeBytes", "pageCount", "evidenceFile"]);
    const resourceId = text(resource.resourceId, 128, SAFE_ID);
    const evidenceFile = text(resource.evidenceFile, 300);
    if (resource.mediaType !== "application/pdf" || !Number.isSafeInteger(resource.sizeBytes) || (resource.sizeBytes as number) < 5
      || resource.pageCount !== null && (!Number.isSafeInteger(resource.pageCount) || (resource.pageCount as number) < 1 || (resource.pageCount as number) > 100_000)
      || evidenceFile !== `resources/${resourceId}.json`) throw new CatalogContractError("invalid_input");
    return {
      resourceId,
      sourceIdentity: sourceIdentity(resource.sourceIdentity),
      currentFilename: text(resource.currentFilename, 512),
      mediaType: "application/pdf" as const,
      sizeBytes: resource.sizeBytes as number,
      pageCount: resource.pageCount as number | null,
      evidenceFile,
    };
  });
  if (new Set(resources.map((entry) => entry.resourceId)).size !== resources.length) throw new CatalogContractError("invalid_input");
  return {
    schemaVersion: CATALOG_BATCH_SCHEMA_VERSION,
    batchId: text(input.batchId, 128, SAFE_ID),
    createdAt: isoDate(input.createdAt),
    namingPolicyVersion: CATALOG_FILENAME_POLICY_VERSION,
    evidencePolicy: {
      firstPages: policy.firstPages as number,
      lastPages: policy.lastPages as number,
      maxPages: policy.maxPages as number,
      maxCharactersPerPage: policy.maxCharactersPerPage as number,
      maxCharactersPerResource: policy.maxCharactersPerResource as number,
      selectiveOcr: true,
      includesSourceBytes: false,
    },
    resources,
  };
}

function bibliography(value: unknown): ImportedCatalogBibliography {
  const input = object(value);
  exactKeys(input, ["canonicalTitle", "materialClass", "contributors", "publication", "carrierEdition", "sourceEdition", "filenameStyle"], [
    "subtitle", "alternativeTitles", "dateStatement", "identifiers", "materialType", "series", "volume", "language", "responsibilityStatement",
  ]);
  const alternativeTitles = input.alternativeTitles === undefined ? undefined : (() => {
    if (!Array.isArray(input.alternativeTitles) || input.alternativeTitles.length > 16) throw new CatalogContractError("invalid_input");
    return input.alternativeTitles.map((entry) => text(entry, 512));
  })();
  let invalidIsbnCount = 0;
  const identifiers = input.identifiers === undefined ? undefined : (() => {
    if (!Array.isArray(input.identifiers) || input.identifiers.length > 16) throw new CatalogContractError("invalid_input");
    return input.identifiers.flatMap((entry) => {
      const item = object(entry);
      exactKeys(item, ["scheme", "value"]);
      const identifier = {
        scheme: text(item.scheme, 32, /^[a-z][a-z0-9._-]*$/u).toLowerCase(),
        value: text(item.value, 128),
      };
      if (identifier.scheme === "isbn" && !isValidIsbn(identifier.value)) {
        invalidIsbnCount += 1;
        return [];
      }
      return [identifier];
    });
  })();
  let profile: BibliographicProfileInput;
  try {
    profile = normalizeBibliographicProfileInput({
      materialClass: input.materialClass,
      contributors: input.contributors,
      publication: input.publication,
      ...(input.series === undefined ? {} : { series: input.series }),
      ...(input.volume === undefined ? {} : { volume: input.volume }),
      ...(input.language === undefined ? {} : { language: input.language }),
      carrierEdition: input.carrierEdition,
      sourceEdition: input.sourceEdition,
    });
  } catch (error: unknown) {
    if (error instanceof BibliographyValidationError) throw new CatalogContractError("invalid_input");
    throw error;
  }
  // External output may name people and roles but may never bind internal
  // contributor/authority identities.
  if (profile.contributors.some((entry) => entry.id !== undefined || entry.authorityId !== undefined)) {
    throw new CatalogContractError("invalid_input");
  }
  return {
    canonicalTitle: text(input.canonicalTitle, 512),
    ...(input.subtitle === undefined ? {} : { subtitle: nullableText(input.subtitle, 512) }),
    ...(alternativeTitles === undefined ? {} : { alternativeTitles }),
    ...(input.dateStatement === undefined ? {} : { dateStatement: nullableText(input.dateStatement, 128) }),
    ...(identifiers === undefined ? {} : { identifiers }),
    ...(input.materialType === undefined ? {} : { materialType: enumValue(input.materialType, MATERIAL_TYPES) }),
    profile,
    ...(input.responsibilityStatement === undefined || input.responsibilityStatement === null
      ? {} : { responsibilityStatement: text(input.responsibilityStatement, 512) }),
    filenameStyle: enumValue(input.filenameStyle, CATALOG_FILENAME_STYLES),
    importWarnings: invalidIsbnCount > 0 ? [{ code: "invalid_isbn_removed", count: invalidIsbnCount }] : [],
  };
}

function result(value: unknown): ImportedCatalogResult {
  const input = object(value);
  exactKeys(input, ["resourceId", "sourceIdentity", "disposition", "bibliographic", "confidence", "notes"]);
  const disposition = enumValue(input.disposition, CATALOG_DISPOSITIONS);
  if (!Number.isSafeInteger(input.confidence) || (input.confidence as number) < 0 || (input.confidence as number) > 100) {
    throw new CatalogContractError("invalid_input");
  }
  if (disposition === "unknown" && input.bibliographic !== null || disposition !== "unknown" && input.bibliographic === null) {
    throw new CatalogContractError("invalid_input");
  }
  return {
    resourceId: text(input.resourceId, 128, SAFE_ID),
    sourceIdentity: sourceIdentity(input.sourceIdentity),
    disposition,
    bibliographic: input.bibliographic === null ? null : bibliography(input.bibliographic),
    confidence: input.confidence as number,
    notes: input.notes === null ? null : text(input.notes, MAX_CATALOG_NOTES_CHARACTERS),
  };
}

export function parseCatalogResultsDocument(value: unknown): CatalogResultsDocument {
  const input = object(value);
  exactKeys(input, ["schemaVersion", "batchId", "sourceManifestSha256", "sourceManifest", "results"]);
  if (input.schemaVersion !== CATALOG_RESULTS_SCHEMA_VERSION || !Array.isArray(input.results)
    || input.results.length < 1 || input.results.length > MAX_CATALOG_BATCH_RESOURCES) throw new CatalogContractError("invalid_input");
  const sourceManifest = parseCatalogBatchManifest(input.sourceManifest);
  const batchId = text(input.batchId, 128, SAFE_ID);
  if (sourceManifest.batchId !== batchId) throw new CatalogContractError("invalid_input");
  const results = input.results.map(result);
  if (new Set(results.map((entry) => entry.resourceId)).size !== results.length
    || results.length !== sourceManifest.resources.length
    || results.some((entry) => !sourceManifest.resources.some((resource) => resource.resourceId === entry.resourceId))) {
    throw new CatalogContractError("invalid_input");
  }
  return {
    schemaVersion: CATALOG_RESULTS_SCHEMA_VERSION,
    batchId,
    sourceManifestSha256: text(input.sourceManifestSha256, 64, SHA256_HEX),
    sourceManifest,
    results,
  };
}

export function importedLegacyMetadata(
  input: ImportedCatalogBibliography,
  current: CanonicalMetadataInput | null,
  inferredMaterialType: MaterialType,
): CanonicalMetadataInput {
  const requestedMaterialType = input.materialType ?? current?.materialType ?? inferredMaterialType;
  // Mirror CanonicalMetadataService's incompatible-type guard. A batch import
  // may update safe bibliographic fields, but must never discard existing
  // type-specific canonical facts merely because an external result proposes a
  // different broad material type.
  const materialType = current
    && current.materialType !== requestedMaterialType
    && Object.keys(current.typeFields).length > 0
    ? current.materialType
    : requestedMaterialType;
  const subtitle = input.subtitle === undefined ? current?.subtitle : input.subtitle ?? undefined;
  const dateStatement = input.dateStatement === undefined ? current?.dateStatement : input.dateStatement ?? undefined;
  return {
    materialType,
    canonicalTitle: input.canonicalTitle,
    ...(subtitle === undefined ? {} : { subtitle }),
    alternativeTitles: input.alternativeTitles ?? current?.alternativeTitles ?? [],
    ...(dateStatement === undefined ? {} : { dateStatement }),
    identifiers: input.identifiers ?? current?.identifiers ?? [],
    typeFields: current?.materialType === materialType ? current.typeFields : {},
    authorityLinks: current?.authorityLinks ?? [],
  };
}
