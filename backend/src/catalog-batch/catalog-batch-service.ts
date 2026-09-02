import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  CATALOG_BATCH_SCHEMA_VERSION,
  CATALOG_EXPORT_REQUEST_SCHEMA_VERSION,
  CATALOG_FILENAME_POLICY_VERSION,
  canonicalCatalogJson,
  type CatalogBatchManifest,
  type CatalogExportRequest,
  type CatalogSourceIdentity,
} from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import {
  changedBibliographicFields,
  type BibliographicFieldName,
  type BibliographicProfile,
  type BibliographicProfileInput,
  type MaterialClass,
} from "../bibliography/bibliography.js";
import type { StoredFile } from "../drive/file.js";
import { catalogSourceIdentity, sameCatalogSourceIdentity, sameStoredContent } from "../drive/source-identity.js";
import type { Library, LibraryHolding } from "../library/library.js";
import type { CanonicalMetadata, CanonicalMetadataInput, MaterialType } from "../metadata/metadata.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { StorageAdapter, StorageObjectMetadata } from "../storage/storage-adapter.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import {
  CatalogContractError,
  importedLegacyMetadata,
  MAX_CATALOG_BATCH_RESOURCES,
  parseCatalogResultsDocument,
  type CatalogResultsDocument,
  type ImportedCatalogBibliography,
  type ImportedCatalogResult,
} from "./contracts.js";
import { formatCatalogFilename } from "./filename-policy.js";
import {
  CATALOG_INTERNAL_SOURCE_EXCLUSIONS,
  findCatalogInternalSourceExclusion,
  type CatalogInternalSourceExclusion,
} from "./internal-resource-exclusions.js";

const PDF_MEDIA_TYPE = "application/pdf";
const EXPORT_CAPABILITY_BYTES = 32;
const EXPORT_CAPABILITY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAX_ACTIVE_EXPORT_CAPABILITIES = 8;
const SOURCE_AUTHORIZATION_SECONDS = 15 * 60;

export type CatalogBatchErrorCode = "invalid_input" | "not_found" | "stale" | "conflict" | "storage_unavailable";

export class CatalogBatchError extends Error {
  constructor(readonly code: CatalogBatchErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "CatalogBatchError";
  }
}

interface ExportCapability {
  batchId: string;
  libraryId: string;
  actorAccountId: string;
  tokenDigest: string;
  expiresAt: Date;
  resources: ReadonlyMap<string, CatalogSourceIdentity>;
}

export type CatalogPreviewCategory = "auto" | "review" | "unknown" | "excluded" | "stale" | "collision" | "unchanged";
export type CatalogCollisionStatus = "none" | "exact_duplicate" | "name_collision";
export type CatalogRenameStatus = "proposed" | "no_rename" | "unchanged" | "exact_duplicate" | "name_collision";
export type CatalogPreviewWarning = "internal_test_resource_excluded" | "invalid_isbn_removed";

export interface CatalogPreviewItem {
  resourceId: string;
  currentFilename: string;
  proposedFilename: string | null;
  canonicalTitle: string | null;
  responsibility: string | null;
  year: string | null;
  materialClass: MaterialClass | null;
  disposition: ImportedCatalogResult["disposition"];
  confidence: number;
  notes: string | null;
  identityMatch: boolean;
  collisionStatus: CatalogCollisionStatus;
  renameStatus: CatalogRenameStatus;
  metadataChanges: string[];
  warnings: CatalogPreviewWarning[];
  category: CatalogPreviewCategory;
  previewVersion: string;
}

export interface CatalogPreview {
  batchId: string;
  documentDigest: string;
  counts: Record<"AUTO" | "REVIEW" | "UNKNOWN" | "EXCLUDED" | "STALE" | "COLLISION" | "UNCHANGED", number>;
  items: CatalogPreviewItem[];
}

export interface CatalogApplySelection {
  resourceId: string;
  previewVersion: string;
}

export interface CatalogApplyResult {
  resourceId: string;
  status: "applied" | "unchanged" | "stale" | "collision" | "not_found" | "invalid_input" | "conflict";
  displayName: string | null;
}

interface PlannedItem {
  public: CatalogPreviewItem;
  library: Library | null;
  holding: LibraryHolding | null;
  file: StoredFile | null;
  currentMetadata: CanonicalMetadata | null;
  currentBibliography: BibliographicProfile | null;
  nextMetadata: CanonicalMetadataInput | null;
  nextBibliography: BibliographicProfileInput | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function digestToken(value: string): string {
  return sha256(value);
}

function safeEqualDigest(expected: string, token: string): boolean {
  const actual = digestToken(token);
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function storageMatches(file: StoredFile, metadata: StorageObjectMetadata | null): boolean {
  if (!metadata || file.sizeBytes === null || metadata.sizeBytes !== file.sizeBytes) return false;
  if (metadata.mediaType && file.mediaType && metadata.mediaType.toLowerCase() !== file.mediaType.toLowerCase()) return false;
  return metadata.checksum === null || file.checksum === null || metadata.checksumAlgorithm !== file.checksumAlgorithm
    || metadata.checksum === file.checksum;
}

function inferredMaterialType(materialClass: MaterialClass): MaterialType {
  if (["journal_article", "book_chapter", "conference_paper", "review"].includes(materialClass)) return "article";
  if (["traditional_book", "manuscript"].includes(materialClass)) return "manuscript";
  if (["inscription_epigraphy", "rubbing"].includes(materialClass)) return "inscription";
  if (materialClass === "archival_document") return "archival_document";
  return "book";
}

function metadataInput(metadata: CanonicalMetadata | null): CanonicalMetadataInput | null {
  if (!metadata) return null;
  return {
    materialType: metadata.materialType,
    canonicalTitle: metadata.canonicalTitle,
    ...(metadata.subtitle === undefined ? {} : { subtitle: metadata.subtitle }),
    alternativeTitles: [...metadata.alternativeTitles],
    ...(metadata.dateStatement === undefined ? {} : { dateStatement: metadata.dateStatement }),
    identifiers: metadata.identifiers.map((entry) => ({ ...entry })),
    typeFields: { ...metadata.typeFields },
    authorityLinks: metadata.authorityLinks.map((entry) => ({ ...entry })),
  };
}

function bibliographyInput(profile: BibliographicProfile | null): BibliographicProfileInput | null {
  if (!profile) return null;
  return {
    materialClass: profile.materialClass,
    contributors: profile.contributors.map(({ id: _id, ...entry }) => ({ ...entry })),
    publication: { ...profile.publication },
    ...(profile.series === undefined ? {} : { series: profile.series }),
    ...(profile.volume === undefined ? {} : { volume: profile.volume }),
    ...(profile.language === undefined ? {} : { language: profile.language }),
    carrierEdition: { ...profile.carrierEdition },
    sourceEdition: { ...profile.sourceEdition },
  };
}

function changedLegacyFields(left: CanonicalMetadataInput | null, right: CanonicalMetadataInput): BibliographicFieldName[] {
  const fields: Array<[BibliographicFieldName, unknown, unknown]> = [
    ["canonicalTitle", left?.canonicalTitle, right.canonicalTitle],
    ["subtitle", left?.subtitle, right.subtitle],
    ["alternativeTitles", left?.alternativeTitles ?? [], right.alternativeTitles],
    ["dateStatement", left?.dateStatement, right.dateStatement],
    ["identifiers", left?.identifiers ?? [], right.identifiers],
  ];
  return fields.filter(([, before, after]) => canonicalCatalogJson(before) !== canonicalCatalogJson(after)).map(([name]) => name);
}

function changedMetadataLabels(left: CanonicalMetadataInput | null, right: CanonicalMetadataInput): string[] {
  const names: string[] = [...changedLegacyFields(left, right)];
  if (left?.materialType !== right.materialType) names.unshift("materialType");
  if (canonicalCatalogJson(left?.typeFields ?? {}) !== canonicalCatalogJson(right.typeFields)) names.push("typeFields");
  return names;
}

function changedBibliographyLabels(left: BibliographicProfile | null, right: BibliographicProfileInput): string[] {
  const before = bibliographyInput(left);
  const labels: string[] = [];
  for (const key of ["materialClass", "contributors", "publication", "series", "volume", "language", "carrierEdition", "sourceEdition"] as const) {
    if (canonicalCatalogJson(before?.[key]) !== canonicalCatalogJson(right[key])) labels.push(key);
  }
  return labels;
}

function publicCounts(items: CatalogPreviewItem[]): CatalogPreview["counts"] {
  const counts = { AUTO: 0, REVIEW: 0, UNKNOWN: 0, EXCLUDED: 0, STALE: 0, COLLISION: 0, UNCHANGED: 0 };
  for (const item of items) counts[item.category.toUpperCase() as keyof typeof counts] += 1;
  return counts;
}

export class CatalogBatchService {
  readonly #persistence: Persistence;
  readonly #storage: StorageAdapter;
  readonly #coreBaseUrl: string;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #createToken: () => string;
  readonly #excludedCatalogSources: readonly CatalogInternalSourceExclusion[];
  readonly #capabilities = new Map<string, ExportCapability>();

  constructor(options: {
    persistence: Persistence;
    storage: StorageAdapter;
    coreBaseUrl: string;
    now?: () => Date;
    createId?: () => string;
    createToken?: () => string;
    excludedCatalogSources?: readonly CatalogInternalSourceExclusion[];
  }) {
    this.#persistence = options.persistence;
    this.#storage = options.storage;
    this.#coreBaseUrl = options.coreBaseUrl.replace(/\/$/u, "");
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
    this.#createToken = options.createToken ?? (() => randomBytes(EXPORT_CAPABILITY_BYTES).toString("base64url"));
    this.#excludedCatalogSources = options.excludedCatalogSources ?? CATALOG_INTERNAL_SOURCE_EXCLUSIONS;
  }

  async prepareExport(actor: AuthenticatedAccount, libraryId: string, fileIds: unknown): Promise<CatalogExportRequest> {
    const ids = this.#parseIds(fileIds);
    const snapshot = this.#persistence.runInTransaction((repositories) => {
      const library = this.#requireOwnerManager(actor, libraryId, repositories);
      return ids.map((resourceId) => {
        const holding = repositories.libraries.findHoldingByFile(library.id, resourceId);
        const file = holding ? repositories.files.findByDomainId(library.ownerDomainId, resourceId) : null;
        if (!holding || !file || file.state !== "active" || file.mediaType?.toLowerCase() !== PDF_MEDIA_TYPE || file.sizeBytes === null) {
          throw new CatalogBatchError("not_found");
        }
        return { holding, file, identity: catalogSourceIdentity(file) };
      });
    });
    const eligibleSnapshot = snapshot.filter((item) => !findCatalogInternalSourceExclusion(
      item.file.id,
      item.identity,
      this.#excludedCatalogSources,
    ));
    if (eligibleSnapshot.length < 1) throw new CatalogBatchError("invalid_input");
    for (const item of eligibleSnapshot) {
      let metadata: StorageObjectMetadata | null;
      try {
        metadata = await this.#storage.statObject(item.file.objectKey);
      } catch (error: unknown) {
        throw new CatalogBatchError("storage_unavailable", { cause: error });
      }
      if (!storageMatches(item.file, metadata)) throw new CatalogBatchError("stale");
    }
    const createdAt = this.#now();
    const batchId = this.#createId();
    const resources = eligibleSnapshot
      .map(({ file, identity }) => ({
        resourceId: file.id,
        sourceIdentity: identity,
        currentFilename: file.displayName,
        mediaType: PDF_MEDIA_TYPE as "application/pdf",
        sizeBytes: file.sizeBytes!,
        pageCount: null,
        evidenceFile: `resources/${file.id}.json`,
      }))
      .sort((left, right) => left.resourceId.localeCompare(right.resourceId, "en"));
    const manifest: CatalogBatchManifest = {
      schemaVersion: CATALOG_BATCH_SCHEMA_VERSION,
      batchId,
      createdAt: createdAt.toISOString(),
      namingPolicyVersion: CATALOG_FILENAME_POLICY_VERSION,
      evidencePolicy: {
        firstPages: 15,
        lastPages: 5,
        maxPages: 20,
        maxCharactersPerPage: 16_384,
        maxCharactersPerResource: 262_144,
        selectiveOcr: true,
        includesSourceBytes: false,
      },
      resources,
    };
    const token = this.#createToken();
    const expiresAt = new Date(createdAt.getTime() + EXPORT_CAPABILITY_MILLISECONDS);
    this.#pruneCapabilities(createdAt);
    if (this.#capabilities.size >= MAX_ACTIVE_EXPORT_CAPABILITIES) {
      const oldest = [...this.#capabilities.values()].sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())[0];
      if (oldest) this.#capabilities.delete(oldest.batchId);
    }
    this.#capabilities.set(batchId, {
      batchId,
      libraryId,
      actorAccountId: actor.id,
      tokenDigest: digestToken(token),
      expiresAt,
      resources: new Map(resources.map((entry) => [entry.resourceId, entry.sourceIdentity])),
    });
    return {
      schemaVersion: CATALOG_EXPORT_REQUEST_SCHEMA_VERSION,
      manifest,
      sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
      sourceAccess: { coreBaseUrl: this.#coreBaseUrl, capabilityToken: token, expiresAt: expiresAt.toISOString() },
    };
  }

  async authorizeExportSource(batchId: string, resourceId: string, token: string) {
    const now = this.#now();
    this.#pruneCapabilities(now);
    const capability = this.#capabilities.get(batchId);
    const expected = capability?.resources.get(resourceId);
    if (!capability || !expected || capability.expiresAt <= now || !safeEqualDigest(capability.tokenDigest, token)) {
      throw new CatalogBatchError("not_found");
    }
    const file = this.#persistence.runInTransaction((repositories) => {
      const account = repositories.accounts.findById(capability.actorAccountId);
      const library = repositories.libraries.findById(capability.libraryId);
      const membership = repositories.libraries.findMembership(capability.libraryId, capability.actorAccountId);
      const holding = repositories.libraries.findHoldingByFile(capability.libraryId, resourceId);
      const current = library && holding ? repositories.files.findByDomainId(library.ownerDomainId, resourceId) : null;
      if (!account || account.state !== "active" || account.role !== "owner" || !library || membership?.role !== "manager"
        || !current || current.state !== "active" || !sameCatalogSourceIdentity(expected, catalogSourceIdentity(current))) {
        throw new CatalogBatchError("stale");
      }
      return current;
    });
    let metadata: StorageObjectMetadata | null;
    try {
      metadata = await this.#storage.statObject(file.objectKey);
    } catch (error: unknown) {
      throw new CatalogBatchError("storage_unavailable", { cause: error });
    }
    if (!storageMatches(file, metadata)) throw new CatalogBatchError("stale");
    try {
      const source = await this.#storage.createDownloadAuthorization({
        objectKey: file.objectKey,
        downloadFilename: "academiccloud-catalog-source.pdf",
        disposition: "inline",
        expiresInSeconds: SOURCE_AUTHORIZATION_SECONDS,
      });
      return {
        method: "GET" as const,
        url: source.url,
        expiresAt: source.expiresAt.toISOString(),
        sizeBytes: file.sizeBytes,
        mediaType: PDF_MEDIA_TYPE as "application/pdf",
      };
    } catch (error: unknown) {
      throw new CatalogBatchError("storage_unavailable", { cause: error });
    }
  }

  preview(actor: AuthenticatedAccount, libraryId: string, value: unknown): CatalogPreview {
    const document = this.#parseDocument(value);
    return this.#persistence.runInTransaction((repositories) => this.#previewInRepositories(actor, libraryId, document, repositories));
  }

  apply(
    actor: AuthenticatedAccount,
    libraryId: string,
    value: unknown,
    documentDigest: unknown,
    selections: unknown,
  ): CatalogApplyResult[] {
    const document = this.#parseDocument(value);
    if (typeof documentDigest !== "string" || documentDigest !== sha256(canonicalCatalogJson(document))) {
      throw new CatalogBatchError("invalid_input");
    }
    const selected = this.#parseSelections(selections);
    const results: CatalogApplyResult[] = [];
    for (const selection of selected) {
      try {
        const result = this.#persistence.runInTransaction((repositories) => {
          const preview = this.#previewInRepositories(actor, libraryId, document, repositories);
          const item = preview.items.find((entry) => entry.resourceId === selection.resourceId);
          if (!item || item.previewVersion !== selection.previewVersion) throw new CatalogBatchError("stale");
          if (item.category === "stale") throw new CatalogBatchError("stale");
          if (item.category === "collision") return { resourceId: item.resourceId, status: "collision" as const, displayName: item.currentFilename };
          if (item.category === "unknown" || item.category === "excluded") throw new CatalogBatchError("invalid_input");
          if (item.category === "unchanged") return { resourceId: item.resourceId, status: "unchanged" as const, displayName: item.currentFilename };
          const imported = document.results.find((entry) => entry.resourceId === item.resourceId)!;
          const planned = this.#planItem(actor, libraryId, document, imported, repositories);
          if (!planned.file || !planned.holding || !planned.library || !planned.nextMetadata || !planned.nextBibliography) {
            throw new CatalogBatchError("stale");
          }
          this.#applyPlan(actor, planned, repositories);
          return {
            resourceId: item.resourceId,
            status: "applied" as const,
            displayName: item.renameStatus === "proposed" ? item.proposedFilename : item.currentFilename,
          };
        });
        results.push(result);
      } catch (error: unknown) {
        const code = error instanceof CatalogBatchError ? error.code : "conflict";
        results.push({
          resourceId: selection.resourceId,
          status: code === "stale" ? "stale" : code === "not_found" ? "not_found" : code === "invalid_input" ? "invalid_input" : "conflict",
          displayName: null,
        });
      }
    }
    return results;
  }

  #parseDocument(value: unknown): CatalogResultsDocument {
    let document: CatalogResultsDocument;
    try {
      document = parseCatalogResultsDocument(value);
    } catch (error: unknown) {
      if (error instanceof CatalogContractError) throw new CatalogBatchError("invalid_input", { cause: error });
      throw error;
    }
    if (sha256(canonicalCatalogJson(document.sourceManifest)) !== document.sourceManifestSha256) {
      throw new CatalogBatchError("invalid_input");
    }
    for (const result of document.results) {
      const manifest = document.sourceManifest.resources.find((entry) => entry.resourceId === result.resourceId)!;
      if (!sameCatalogSourceIdentity(manifest.sourceIdentity, result.sourceIdentity)) throw new CatalogBatchError("invalid_input");
    }
    return document;
  }

  #previewInRepositories(actor: AuthenticatedAccount, libraryId: string, document: CatalogResultsDocument, repositories: RepositorySet): CatalogPreview {
    this.#requireOwnerManager(actor, libraryId, repositories);
    const plans = document.results.map((result) => this.#planItem(actor, libraryId, document, result, repositories));
    const targets = new Map<string, PlannedItem[]>();
    for (const plan of plans) {
      const filename = plan.public.proposedFilename;
      if (!filename || !plan.file || !plan.public.identityMatch) continue;
      const key = filename.normalize("NFC").toLocaleLowerCase("en");
      targets.set(key, [...targets.get(key) ?? [], plan]);
    }
    for (const group of targets.values()) {
      if (group.length < 2) continue;
      const first = group[0]!.file!;
      const collision: CatalogCollisionStatus = group.every((entry) => sameStoredContent(first, entry.file!))
        ? "exact_duplicate" : "name_collision";
      for (const plan of group) {
        plan.public.collisionStatus = collision;
        plan.public.renameStatus = collision;
        plan.public.category = "collision";
        plan.public.previewVersion = createHash("sha256")
          .update(canonicalCatalogJson([plan.public.previewVersion, "batch-target-collision", collision]))
          .digest("base64url");
      }
    }
    const items = plans.map((entry) => entry.public);
    return {
      batchId: document.batchId,
      documentDigest: sha256(canonicalCatalogJson(document)),
      counts: publicCounts(items),
      items,
    };
  }

  #planItem(
    actor: AuthenticatedAccount,
    libraryId: string,
    document: CatalogResultsDocument,
    result: ImportedCatalogResult,
    repositories: RepositorySet,
  ): PlannedItem {
    const library = this.#requireOwnerManager(actor, libraryId, repositories);
    const manifestResource = document.sourceManifest.resources.find((entry) => entry.resourceId === result.resourceId)!;
    const holding = repositories.libraries.findHoldingByFile(libraryId, result.resourceId);
    const file = holding ? repositories.files.findByDomainId(library.ownerDomainId, result.resourceId) : null;
    const identityMatch = Boolean(file && file.state === "active"
      && sameCatalogSourceIdentity(manifestResource.sourceIdentity, catalogSourceIdentity(file))
      && sameCatalogSourceIdentity(result.sourceIdentity, catalogSourceIdentity(file)));
    const currentFilename = file?.displayName ?? manifestResource.currentFilename;
    if (!identityMatch || !file || !holding) {
      const previewVersion = sha256(canonicalCatalogJson([document.batchId, result.resourceId, "stale"]));
      return {
        public: {
          resourceId: result.resourceId, currentFilename, proposedFilename: null,
          canonicalTitle: result.bibliographic?.canonicalTitle ?? null, responsibility: null, year: null,
          materialClass: result.bibliographic?.profile.materialClass ?? null, disposition: result.disposition,
          confidence: result.confidence, notes: result.notes, identityMatch: false, collisionStatus: "none",
          renameStatus: "no_rename", metadataChanges: [], warnings: [], category: "stale", previewVersion,
        },
        library, holding, file, currentMetadata: null, currentBibliography: null, nextMetadata: null, nextBibliography: null,
      };
    }
    const currentMetadata = repositories.metadata.findMetadata(library.ownerDomainId, holding.recordId);
    const currentBibliography = repositories.bibliography.findProfile(library.ownerDomainId, holding.recordId);
    const internalExclusion = findCatalogInternalSourceExclusion(
      result.resourceId,
      catalogSourceIdentity(file),
      this.#excludedCatalogSources,
    );
    if (internalExclusion) {
      const previewVersion = createHash("sha256").update(canonicalCatalogJson([
        document.batchId,
        result.resourceId,
        internalExclusion.reason,
        catalogSourceIdentity(file),
      ])).digest("base64url");
      return {
        public: {
          resourceId: result.resourceId, currentFilename, proposedFilename: null, canonicalTitle: null,
          responsibility: null, year: null, materialClass: null, disposition: result.disposition,
          confidence: result.confidence, notes: result.notes, identityMatch: true, collisionStatus: "none",
          renameStatus: "no_rename", metadataChanges: [], warnings: ["internal_test_resource_excluded"],
          category: "excluded", previewVersion,
        },
        library, holding, file, currentMetadata, currentBibliography, nextMetadata: null, nextBibliography: null,
      };
    }
    if (result.disposition === "unknown" || !result.bibliographic) {
      const previewVersion = this.#previewVersion(document, result, file, currentMetadata, currentBibliography, null, "none");
      return {
        public: {
          resourceId: result.resourceId, currentFilename, proposedFilename: null, canonicalTitle: null,
          responsibility: null, year: null, materialClass: null, disposition: result.disposition,
          confidence: result.confidence, notes: result.notes, identityMatch: true, collisionStatus: "none",
          renameStatus: "no_rename", metadataChanges: [], warnings: [], category: "unknown", previewVersion,
        },
        library, holding, file, currentMetadata, currentBibliography, nextMetadata: null, nextBibliography: null,
      };
    }
    const imported = result.bibliographic;
    const nextMetadata = importedLegacyMetadata(imported, metadataInput(currentMetadata), inferredMaterialType(imported.profile.materialClass));
    const nextBibliography = imported.profile;
    const filename = formatCatalogFilename({
      canonicalTitle: imported.canonicalTitle,
      materialClass: imported.profile.materialClass,
      contributors: imported.profile.contributors,
      ...(imported.profile.carrierEdition.editionType ? { editionType: imported.profile.carrierEdition.editionType } : {}),
      ...(imported.dateStatement ? { dateStatement: imported.dateStatement } : {}),
      ...(imported.profile.publication.publicationDate ? { publicationDate: imported.profile.publication.publicationDate } : {}),
      ...(imported.responsibilityStatement ? { responsibilityStatement: imported.responsibilityStatement } : {}),
      filenameStyle: imported.filenameStyle,
    });
    let collisionStatus: CatalogCollisionStatus = "none";
    let renameStatus: CatalogRenameStatus = filename.status === "proposed" ? "proposed" : "no_rename";
    const proposedFilename = filename.status === "proposed" ? filename.filename : null;
    if (proposedFilename === currentFilename) renameStatus = "unchanged";
    if (proposedFilename && proposedFilename !== currentFilename) {
      const conflict = repositories.files.findAvailableByDomainName(library.ownerDomainId, file.folderId, proposedFilename);
      if (conflict && conflict.id !== file.id) {
        collisionStatus = sameStoredContent(file, conflict) ? "exact_duplicate" : "name_collision";
        renameStatus = collisionStatus;
      }
    }
    const metadataChanges = [
      ...changedMetadataLabels(metadataInput(currentMetadata), nextMetadata),
      ...changedBibliographyLabels(currentBibliography, nextBibliography).map((entry) => `bibliography.${entry}`),
    ];
    if (renameStatus === "proposed") metadataChanges.push("displayName");
    let category: CatalogPreviewCategory;
    if (collisionStatus !== "none") category = "collision";
    else if (metadataChanges.length === 0) category = "unchanged";
    else if (result.disposition === "auto" && renameStatus !== "no_rename") category = "auto";
    else category = "review";
    const previewVersion = this.#previewVersion(document, result, file, currentMetadata, currentBibliography, proposedFilename, collisionStatus);
    return {
      public: {
        resourceId: result.resourceId,
        currentFilename,
        proposedFilename,
        canonicalTitle: imported.canonicalTitle,
        responsibility: filename.status === "proposed" ? filename.responsibility : null,
        year: filename.status === "proposed" ? filename.year : null,
        materialClass: imported.profile.materialClass,
        disposition: result.disposition,
        confidence: result.confidence,
        notes: result.notes,
        identityMatch: true,
        collisionStatus,
        renameStatus,
        metadataChanges,
        warnings: imported.importWarnings.map((entry) => entry.code),
        category,
        previewVersion,
      },
      library, holding, file, currentMetadata, currentBibliography, nextMetadata, nextBibliography,
    };
  }

  #applyPlan(actor: AuthenticatedAccount, plan: PlannedItem, repositories: RepositorySet): void {
    const { library, holding, file, currentMetadata, currentBibliography, nextMetadata, nextBibliography } = plan;
    if (!library || !holding || !file || !nextMetadata || !nextBibliography) throw new CatalogBatchError("stale");
    const now = this.#now();
    const legacyFields = changedLegacyFields(metadataInput(currentMetadata), nextMetadata);
    if (legacyFields.length > 0 || canonicalCatalogJson(metadataInput(currentMetadata)) !== canonicalCatalogJson(nextMetadata)) {
      const saved = repositories.metadata.saveMetadata({
        ...nextMetadata,
        recordId: holding.recordId,
        ownerDomainId: library.ownerDomainId,
        actorAccountId: actor.id,
        expectedRevision: currentMetadata?.revision ?? null,
        now,
      });
      if (!saved) throw new CatalogBatchError("conflict");
      for (const fieldName of legacyFields) repositories.bibliography.setFieldAuthority({
        recordId: holding.recordId, ownerDomainId: library.ownerDomainId, fieldName, scopeKey: "",
        source: "human", actorAccountId: actor.id, now,
      });
    }
    if (changedBibliographyLabels(currentBibliography, nextBibliography).length > 0) {
      const currentIds = new Map((currentBibliography?.contributors ?? []).map((entry) => [
        canonicalCatalogJson([entry.label, entry.role, entry.roleLabel ?? null]), entry.id,
      ]));
      const saved = repositories.bibliography.saveProfile({
        ...nextBibliography,
        contributors: nextBibliography.contributors.map((entry) => ({
          ...entry,
          id: currentIds.get(canonicalCatalogJson([entry.label, entry.role, entry.roleLabel ?? null])) ?? this.#createId(),
        })),
        recordId: holding.recordId,
        ownerDomainId: library.ownerDomainId,
        actorAccountId: actor.id,
        expectedRevision: currentBibliography?.revision ?? null,
        now,
      });
      if (!saved) throw new CatalogBatchError("conflict");
      for (const field of changedBibliographicFields(currentBibliography, saved)) repositories.bibliography.setFieldAuthority({
        recordId: holding.recordId, ownerDomainId: library.ownerDomainId,
        fieldName: field.fieldName, scopeKey: field.scopeKey, source: "human", actorAccountId: actor.id, now,
      });
    }
    if (plan.public.renameStatus === "proposed" && plan.public.proposedFilename) {
      const updated = repositories.files.updateForDomain(
        { ...file, displayName: plan.public.proposedFilename, updatedAt: now },
        "active",
        file.revision,
      );
      if (!updated || updated.objectKey !== file.objectKey) throw new CatalogBatchError("conflict");
    }
    recordAuditEvent(repositories, {
      action: "libraries.metadata_update",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: holding.recordId,
      outcome: "succeeded",
      reason: null,
      occurredAt: now,
    });
  }

  #previewVersion(
    document: CatalogResultsDocument,
    result: ImportedCatalogResult,
    file: StoredFile,
    metadata: CanonicalMetadata | null,
    bibliography: BibliographicProfile | null,
    proposedFilename: string | null,
    collision: CatalogCollisionStatus,
  ): string {
    return createHash("sha256").update(canonicalCatalogJson([
      "academiccloud.catalog-preview.v1",
      document.batchId,
      result,
      catalogSourceIdentity(file),
      file.displayName,
      metadata ? [metadata.revision, metadata.updatedAt.toISOString()] : null,
      bibliography ? [bibliography.revision, bibliography.updatedAt.toISOString()] : null,
      proposedFilename,
      collision,
    ])).digest("base64url");
  }

  #parseIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CATALOG_BATCH_RESOURCES) throw new CatalogBatchError("invalid_input");
    const ids = value.map((entry) => {
      if (typeof entry !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(entry)) throw new CatalogBatchError("invalid_input");
      return entry;
    });
    if (new Set(ids).size !== ids.length) throw new CatalogBatchError("invalid_input");
    return ids;
  }

  #parseSelections(value: unknown): CatalogApplySelection[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CATALOG_BATCH_RESOURCES) throw new CatalogBatchError("invalid_input");
    const selections = value.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new CatalogBatchError("invalid_input");
      const item = entry as Record<string, unknown>;
      if (Object.keys(item).length !== 2 || typeof item.resourceId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(item.resourceId)
        || typeof item.previewVersion !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(item.previewVersion)) throw new CatalogBatchError("invalid_input");
      return { resourceId: item.resourceId, previewVersion: item.previewVersion };
    });
    if (new Set(selections.map((entry) => entry.resourceId)).size !== selections.length) throw new CatalogBatchError("invalid_input");
    return selections;
  }

  #requireOwnerManager(actor: AuthenticatedAccount, libraryId: string, repositories: RepositorySet): Library {
    const account = repositories.accounts.findById(actor.id);
    const library = repositories.libraries.findById(libraryId);
    const membership = library ? repositories.libraries.findMembership(libraryId, actor.id) : null;
    if (!account || account.state !== "active" || account.role !== "owner" || actor.role !== "owner"
      || !library || membership?.role !== "manager") throw new CatalogBatchError("not_found");
    return library;
  }

  #pruneCapabilities(now: Date): void {
    for (const [batchId, capability] of this.#capabilities) if (capability.expiresAt <= now) this.#capabilities.delete(batchId);
  }
}
