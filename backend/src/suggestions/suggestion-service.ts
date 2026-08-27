import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION,
  parseIntelligentBibliographyResult,
  type DerivedComputeDispatcher,
  type DerivedComputeResult,
  type DerivedMetadataCandidate,
  type IntelligentBibliographyResult,
} from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { StoredFile } from "../drive/file.js";
import type { Library, LibraryHolding, LibraryMembership } from "../library/library.js";
import { composeCatalogueDisplay } from "../library/catalogue-display.js";
import {
  publicDerivedJob,
  type DerivedJobOrigin,
  type DerivedJobPriority,
  type DerivedJobRecord,
  type DerivedJobSummary,
} from "../jobs/job.js";
import {
  CanonicalMetadataService,
  MetadataError,
  type MetadataDetail,
} from "../metadata/metadata-service.js";
import type {
  CanonicalMetadataInput,
  MaterialType,
  TypeFieldName,
} from "../metadata/metadata.js";
import { MATERIAL_TYPES } from "../metadata/metadata.js";
import {
  changedBibliographicFields,
  type BibliographicFieldAuthority,
  type BibliographicFieldName,
  type BibliographicProfileInput,
  type ContributorRole,
  type MaterialClass,
} from "../bibliography/bibliography.js";
import type { StorageAdapter } from "../storage/storage-adapter.js";
import { extractLightweightSuggestions, mergeSuggestionCandidates } from "./lightweight-extractor.js";
import {
  SUGGESTION_RULESET_VERSION,
  type NewSuggestionRun,
  type SuggestionCandidate,
  type SuggestionRunRecord,
  type SuggestionRunSummary,
} from "./suggestion.js";
import type { SuggestionRunStateEvidence } from "./repositories.js";

export type SuggestionErrorCode =
  | "not_found"
  | "authorization_denied"
  | "invalid_input"
  | "conflict"
  | "concurrent_change"
  | "stale"
  | "unsupported";

export class SuggestionError extends Error {
  constructor(readonly code: SuggestionErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "SuggestionError";
  }
}

interface HoldingContext {
  library: Library;
  membership: LibraryMembership;
  holding: LibraryHolding;
  file: StoredFile;
}

export interface SuggestionAcceptanceInput {
  acceptedCandidateIds: string[];
  metadataVersion: string;
  metadata?: unknown;
}

export interface SuggestionAcceptanceResult {
  detail: MetadataDetail;
  run: SuggestionRunSummary;
}

export interface BatchNamingPreviewItem {
  fileId: string;
  displayName: string;
  canonicalTitle: string | null;
  metadataVersion: string;
  sourceVersion: string;
  materialType: MaterialType | null;
  mediaType: string | null;
  proposedTitle: string | null;
  proposedConfidence: "medium" | "low" | null;
  proposedSource: "filename" | null;
  status: "available" | "unavailable";
}

export interface BatchNamingPreview {
  items: BatchNamingPreviewItem[];
}

export interface BatchNamingItemInput {
  fileId: string;
  metadataVersion: string;
  sourceVersion: string;
  canonicalTitle: string;
  materialType: MaterialType;
}

export type BatchNamingResultStatus =
  | "applied"
  | "stale"
  | "conflict"
  | "invalid_input"
  | "not_found";

export interface BatchNamingResultItem {
  fileId: string;
  status: BatchNamingResultStatus;
  detail?: MetadataDetail;
}

export const BATCH_NAMING_MAX_ITEMS = 50;
export const METADATA_CATALOGUING_BATCH_MAX_ITEMS = 100;

export type MetadataCataloguingState =
  | "not_run"
  | "queued"
  | "running"
  | "failed"
  | "filename_inference_only"
  | "extraction_only"
  | "ai_succeeded_reviewable"
  | "applied";

export interface MetadataCataloguingSummary {
  fileId: string;
  state: MetadataCataloguingState;
  job: DerivedJobSummary | null;
}

const VERSION_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SAFE_FILE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const PDF_MEDIA_TYPE = "application/pdf";
const JOB_DEADLINE_MILLISECONDS = 2 * 60 * 60_000;
const LOCAL_PULL_LEASE_MILLISECONDS = 90_000;
const LOCAL_PULL_HEARTBEAT_MILLISECONDS = 30_000;
const LOCAL_PULL_CAPABILITY_MILLISECONDS = 15 * 60_000;
const LOCAL_PULL_WORKER_ID = /^[A-Za-z0-9_.-]{1,128}$/u;

export function deriveMetadataCataloguingState(
  job: Pick<DerivedJobRecord, "state" | "resultRef"> | null,
  run: Pick<SuggestionRunStateEvidence,
    "id" | "status" | "pageCount" | "pageIndices" | "windowComplete" | "candidateCount" | "nonFilenameCandidateCount" | "aiReviewable" | "applied"
  > | null,
): MetadataCataloguingState {
  if (job?.state === "queued") return "queued";
  if (job?.state === "running") return "running";
  // The newest generation is authoritative. A stale lightweight or accepted
  // run may remain useful history, but it must never hide a current failure.
  if (job?.state === "failed") return "failed";

  const currentResult = run !== null && (job === null || job.resultRef === run.id);
  if (currentResult && (run.status === "accepted" || run.applied)) return "applied";
  if (currentResult && run.aiReviewable) return "ai_succeeded_reviewable";

  if (job?.state === "succeeded") {
    // A terminal job without its exact result run is not a proven reviewable
    // AI result. Treat it as an incomplete extraction/result projection.
    if (!run || !currentResult) return "extraction_only";
    const extractionObserved = run.nonFilenameCandidateCount > 0
      || run.pageCount !== null || run.pageIndices.length > 0 || run.windowComplete;
    return extractionObserved ? "extraction_only" : "filename_inference_only";
  }

  if (!run) return "not_run";
  if (run.status === "accepted" || run.applied) return "applied";
  if (run.nonFilenameCandidateCount > 0
    || run.pageCount !== null || run.pageIndices.length > 0 || run.windowComplete) return "extraction_only";
  return "filename_inference_only";
}

function sourceFingerprint(file: StoredFile): {
  value: string;
  fileRevision: number;
  checksumAlgorithm: string | null;
  checksum: string | null;
} {
  const value = createHash("sha256")
    .update(JSON.stringify([
      "rf-metasuggest-source-v1",
      file.id,
      file.revision,
      file.checksumAlgorithm,
      file.checksum,
    ]))
    .digest("base64url");
  return {
    value,
    fileRevision: file.revision,
    checksumAlgorithm: file.checksumAlgorithm,
    checksum: file.checksum,
  };
}

function publicRun(run: SuggestionRunRecord, repositories: RepositorySet): SuggestionRunSummary {
  const aiEvidence = repositories.bibliography.findAiRunEvidenceBySuggestionRun(run.ownerDomainId, run.id);
  let aiBibliography: SuggestionRunSummary["aiBibliography"];
  if (aiEvidence) {
    if (aiEvidence.fileId !== run.fileId || aiEvidence.recordId !== run.recordId || aiEvidence.suggestionRunId !== run.id) {
      throw new Error("bibliographic AI evidence binding mismatch");
    }
    const actualSha256 = createHash("sha256").update(aiEvidence.structuredOutputJson, "utf8").digest("hex");
    if (actualSha256 !== aiEvidence.structuredOutputSha256) throw new Error("bibliographic AI evidence integrity mismatch");
    const structured = parseIntelligentBibliographyResult(JSON.parse(aiEvidence.structuredOutputJson));
    if (structured.status !== aiEvidence.status
      || structured.rulesetVersion !== aiEvidence.rulesetVersion
      || structured.provenance.promptVersion !== aiEvidence.promptVersion) {
      throw new Error("bibliographic AI evidence identity mismatch");
    }
    const display = structured.canonical
      ? composeCatalogueDisplay({
          canonicalTitle: structured.canonical.canonicalTitle,
          fallbackDisplayName: structured.canonical.canonicalTitle,
          bibliography: structured.canonical,
        })
      : null;
    aiBibliography = {
      ...structured,
      id: aiEvidence.id,
      displayTitle: display?.title ?? null,
      editionStatement: display?.editionStatement ?? null,
      autoApplied: aiEvidence.autoApplied,
      appliedFields: aiEvidence.appliedFields.map((field) => ({ ...field })),
      createdAt: aiEvidence.createdAt.toISOString(),
    };
  }
  return {
    id: run.id,
    libraryId: run.libraryId,
    fileId: run.fileId,
    status: run.status,
    rulesetVersion: run.rulesetVersion,
    sourceVersion: run.sourceVersion,
    window: {
      firstPages: run.window.firstPages,
      lastPages: run.window.lastPages,
      pageCount: run.window.pageCount,
      pageIndices: [...run.window.pageIndices],
      complete: run.window.complete,
    },
    candidates: run.candidates.map((candidate) => ({ ...candidate })),
    createdAt: run.createdAt,
    ...(aiBibliography === undefined ? {} : { aiBibliography }),
  };
}

function isActiveAccount(actor: AuthenticatedAccount, repositories: RepositorySet): boolean {
  const account = repositories.accounts.findById(actor.id);
  return Boolean(account && account.state === "active" && account.role === actor.role);
}

function resolveHolding(
  actor: AuthenticatedAccount,
  libraryId: string,
  fileId: string,
  repositories: RepositorySet,
): HoldingContext {
  if (!isActiveAccount(actor, repositories)) throw new SuggestionError("not_found");
  const library = repositories.libraries.findById(libraryId);
  const membership = library ? repositories.libraries.findMembership(libraryId, actor.id) : null;
  if (!library || !membership) throw new SuggestionError("not_found");
  const holding = repositories.libraries.findHoldingByFile(libraryId, fileId);
  const file = repositories.files.findByDomainId(library.ownerDomainId, fileId);
  if (!holding || !file || file.state !== "active") throw new SuggestionError("not_found");
  // The holding projection is deliberately less privileged than the file row;
  // this equality check prevents a mismatched Record/Version from becoming a
  // suggestion source even when a caller supplies a valid-looking file ID.
  if (holding.file.id !== file.id) throw new SuggestionError("not_found");
  return { library, membership, holding, file };
}

function sourceMatches(run: SuggestionRunRecord, file: StoredFile): boolean {
  const current = sourceFingerprint(file);
  return current.value === run.sourceFingerprint.value
    && current.fileRevision === run.sourceFingerprint.fileRevision
    && current.checksumAlgorithm === run.sourceFingerprint.checksumAlgorithm
    && current.checksum === run.sourceFingerprint.checksum;
}

function objectMatchesFile(
  metadata: Awaited<ReturnType<StorageAdapter["statObject"]>>,
  file: StoredFile,
): boolean {
  if (!metadata || metadata.sizeBytes !== file.sizeBytes) return false;
  if (file.checksum && metadata.checksum !== file.checksum) return false;
  if (file.checksumAlgorithm && metadata.checksumAlgorithm !== file.checksumAlgorithm) return false;
  return true;
}

function safeCandidateIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw new SuggestionError("invalid_input");
  }
  const ids = value.map((entry) => {
    if (typeof entry !== "string" || !/^[A-Za-z0-9_-]{1,128}:[0-9]{1,3}$/u.test(entry)) {
      throw new SuggestionError("invalid_input");
    }
    return entry;
  });
  if (new Set(ids).size !== ids.length) throw new SuggestionError("invalid_input");
  return ids;
}

function candidatePatch(
  current: NonNullable<MetadataDetail["metadata"]>,
  candidates: SuggestionCandidate[],
): CanonicalMetadataInput {
  const result: CanonicalMetadataInput = {
    materialType: current.materialType,
    canonicalTitle: current.canonicalTitle,
    ...(current.subtitle === null ? {} : { subtitle: current.subtitle }),
    alternativeTitles: [...current.alternativeTitles],
    ...(current.dateStatement === null ? {} : { dateStatement: current.dateStatement }),
    identifiers: current.identifiers.map((item) => ({ ...item })),
    typeFields: { ...current.typeFields },
    authorityLinks: current.authorityLinks.map((link) => ({ authorityId: link.id, role: link.role })),
  };
  const selectedValues = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.fieldPath === "authority") continue;
    const key = [candidate.fieldPath, candidate.typeFieldName ?? "", candidate.identifierScheme ?? ""].join("|");
    const previous = selectedValues.get(key);
    if (previous !== undefined && previous !== candidate.value) {
      throw new SuggestionError("conflict");
    }
    selectedValues.set(key, candidate.value);
  }
  for (const candidate of candidates) {
    switch (candidate.fieldPath) {
      case "canonicalTitle":
        result.canonicalTitle = candidate.value;
        break;
      case "subtitle":
        result.subtitle = candidate.value;
        break;
      case "dateStatement":
        result.dateStatement = candidate.value;
        break;
      case "identifier": {
        const scheme = candidate.identifierScheme ?? "isbn";
        if (!result.identifiers.some((item) => item.scheme === scheme && item.value === candidate.value)) {
          result.identifiers.push({ scheme, value: candidate.value });
        }
        break;
      }
      case "typeField":
        if (candidate.typeFieldName) result.typeFields[candidate.typeFieldName] = candidate.value;
        break;
      case "authority":
        // Authority labels are proposals only.  A manager must explicitly
        // choose/create a same-domain authority and provide it in `metadata`.
        throw new SuggestionError("invalid_input");
    }
  }
  return result;
}

function validateAcceptanceMetadata(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SuggestionError("invalid_input");
  }
  return value;
}

function assertAuthorityCandidatesResolved(
  metadata: unknown,
  candidates: readonly SuggestionCandidate[],
  ownerDomainId: string,
  repositories: RepositorySet,
): void {
  const authorityCandidates = candidates.filter((candidate) => candidate.fieldPath === "authority");
  if (authorityCandidates.length === 0) return;
  if (typeof metadata !== "object" || metadata === null || !Array.isArray((metadata as { authorityLinks?: unknown }).authorityLinks)) {
    throw new SuggestionError("invalid_input");
  }
  const links = (metadata as { authorityLinks: unknown[] }).authorityLinks;
  for (const candidate of authorityCandidates) {
    const resolved = links.some((link) => {
      if (typeof link !== "object" || link === null) return false;
      const authorityId = (link as { authorityId?: unknown }).authorityId;
      const role = (link as { role?: unknown }).role;
      if (typeof authorityId !== "string" || role !== candidate.authorityRole) return false;
      const authority = repositories.metadata.findAuthority(ownerDomainId, authorityId);
      if (!authority || authority.type !== candidate.authorityType) return false;
      return authority.canonicalLabel === candidate.value || authority.aliases.includes(candidate.value);
    });
    if (!resolved) throw new SuggestionError("invalid_input");
  }
}

export interface SuggestionComputeClaim {
  job: { id: string; attemptId: string; kind: "metadata_suggestion" };
  capability: { token: string; expiresAt: string };
  source: { method: "GET"; url: string; sizeBytes: number; mediaType: "application/pdf"; expiresAt: string };
  callbackUrl: string;
}

export interface SuggestionLocalPullClaim extends SuggestionComputeClaim {
  lease: { expiresAt: string; heartbeatAfterMilliseconds: number };
}

export interface SuggestionLocalSourceAuthorization {
  source: SuggestionComputeClaim["source"];
}

function jobActor(job: DerivedJobRecord, repositories: RepositorySet): AuthenticatedAccount | null {
  const account = repositories.accounts.findById(job.createdByAccountId);
  if (!account || account.state !== "active") return null;
  return { id: account.id, loginName: account.loginName, role: account.role };
}

function tokenDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameDigest(expected: string | null, token: string): boolean {
  if (!expected) return false;
  const actual = tokenDigest(token);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function derivedCandidate(candidate: DerivedMetadataCandidate): Omit<SuggestionCandidate, "id"> {
  return {
    ...candidate,
    typeFieldName: candidate.typeFieldName,
    authorityType: candidate.authorityType,
    authorityRole: candidate.authorityRole,
  };
}

const MATERIAL_CLASS_TO_LEGACY: Readonly<Record<MaterialClass, MaterialType>> = {
  scholarly_monograph: "book",
  edited_volume: "book",
  journal_article: "article",
  book_chapter: "article",
  thesis_dissertation: "book",
  conference_paper: "article",
  review: "article",
  reference_work: "book",
  dictionary_lexicon: "book",
  primary_source_modern_edition: "book",
  traditional_book: "book",
  archival_document: "archival_document",
  inscription_epigraphy: "inscription",
  rubbing: "inscription",
  manuscript: "manuscript",
  collected_documents: "book",
  catalogue_bibliography: "book",
  other: "book",
  unknown: "book",
};

function legacyAuthorityRole(role: ContributorRole): "author" | "editor" | "compiler" | "translator" | "contributor" {
  if (role === "author" || role === "editor" || role === "compiler" || role === "translator") return role;
  return "contributor";
}

function lockedByHuman(authorities: readonly BibliographicFieldAuthority[], fieldName: BibliographicFieldName, scopeKey = ""): boolean {
  return authorities.some((entry) => entry.fieldName === fieldName && entry.scopeKey === scopeKey && entry.source === "human");
}

function aiMayWrite(
  authorities: readonly BibliographicFieldAuthority[],
  fieldName: BibliographicFieldName,
  existingValueIsAbsent: boolean,
  scopeKey = "",
): boolean {
  const authority = authorities.find((entry) => entry.fieldName === fieldName && entry.scopeKey === scopeKey);
  return authority?.source === "ai" || (authority === undefined && existingValueIsAbsent);
}

function exactPersonAuthorityId(repositories: RepositorySet, ownerDomainId: string, label: string): string | undefined {
  const matches = repositories.bibliography.findExactPersonAuthorities(ownerDomainId, label);
  return matches.length === 1 ? matches[0]!.id : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function autoApplyIntelligentBibliography(options: {
  repositories: RepositorySet;
  context: HoldingContext;
  actor: AuthenticatedAccount;
  result: IntelligentBibliographyResult;
  suggestionRunId: string;
  now: Date;
  createId: () => string;
}): Array<{ fieldName: BibliographicFieldName; scopeKey: string }> {
  const { repositories, context, actor, result, suggestionRunId, now, createId } = options;
  const canonical = result.canonical;
  if (result.status !== "auto_apply" || canonical === null) return [];
  const ownerDomainId = context.library.ownerDomainId;
  const recordId = context.holding.recordId;
  const authorities = repositories.bibliography.listFieldAuthorities(ownerDomainId, recordId);
  const applied = new Map<string, { fieldName: BibliographicFieldName; scopeKey: string }>();
  const mark = (fieldName: BibliographicFieldName, scopeKey = ""): void => {
    applied.set(`${fieldName}:${scopeKey}`, { fieldName, scopeKey });
  };

  const currentMetadata = repositories.metadata.findMetadata(ownerDomainId, recordId);
  const nextMetadata: CanonicalMetadataInput = currentMetadata ? {
    materialType: currentMetadata.materialType,
    canonicalTitle: currentMetadata.canonicalTitle,
    ...(currentMetadata.subtitle === undefined ? {} : { subtitle: currentMetadata.subtitle }),
    alternativeTitles: [...currentMetadata.alternativeTitles],
    ...(currentMetadata.dateStatement === undefined ? {} : { dateStatement: currentMetadata.dateStatement }),
    identifiers: currentMetadata.identifiers.map((entry) => ({ ...entry })),
    typeFields: { ...currentMetadata.typeFields },
    authorityLinks: currentMetadata.authorityLinks.map((entry) => ({ ...entry })),
  } : {
    materialType: MATERIAL_CLASS_TO_LEGACY[canonical.materialClass],
    canonicalTitle: canonical.canonicalTitle,
    alternativeTitles: [],
    identifiers: [],
    typeFields: {},
    authorityLinks: [],
  };
  if (aiMayWrite(authorities, "canonicalTitle", currentMetadata === null) && nextMetadata.canonicalTitle !== canonical.canonicalTitle) {
    nextMetadata.canonicalTitle = canonical.canonicalTitle;
    mark("canonicalTitle");
  } else if (!currentMetadata && aiMayWrite(authorities, "canonicalTitle", true)) mark("canonicalTitle");
  if (canonical.subtitle !== null && aiMayWrite(authorities, "subtitle", nextMetadata.subtitle === undefined)
    && nextMetadata.subtitle !== canonical.subtitle) {
    nextMetadata.subtitle = canonical.subtitle;
    mark("subtitle");
  }
  if (canonical.alternativeTitles.length > 0 && aiMayWrite(authorities, "alternativeTitles", nextMetadata.alternativeTitles.length === 0)
    && JSON.stringify(nextMetadata.alternativeTitles) !== JSON.stringify(canonical.alternativeTitles)) {
    nextMetadata.alternativeTitles = [...canonical.alternativeTitles];
    mark("alternativeTitles");
  }
  if (canonical.dateStatement !== null && aiMayWrite(authorities, "dateStatement", nextMetadata.dateStatement === undefined)
    && nextMetadata.dateStatement !== canonical.dateStatement) {
    nextMetadata.dateStatement = canonical.dateStatement;
    mark("dateStatement");
  }
  if (canonical.identifiers.length > 0 && aiMayWrite(authorities, "identifiers", nextMetadata.identifiers.length === 0)
    && JSON.stringify(nextMetadata.identifiers) !== JSON.stringify(canonical.identifiers)) {
    nextMetadata.identifiers = canonical.identifiers.map((entry) => ({ ...entry }));
    mark("identifiers");
  }
  if (!currentMetadata) {
    for (const contributor of canonical.contributors) {
      const authorityId = exactPersonAuthorityId(repositories, ownerDomainId, contributor.label);
      if (!authorityId) continue;
      const role = legacyAuthorityRole(contributor.role);
      if (!nextMetadata.authorityLinks.some((entry) => entry.authorityId === authorityId && entry.role === role)) {
        nextMetadata.authorityLinks.push({ authorityId, role });
      }
    }
  }
  if (!currentMetadata || JSON.stringify(nextMetadata) !== JSON.stringify({
    materialType: currentMetadata.materialType,
    canonicalTitle: currentMetadata.canonicalTitle,
    ...(currentMetadata.subtitle === undefined ? {} : { subtitle: currentMetadata.subtitle }),
    alternativeTitles: currentMetadata.alternativeTitles,
    ...(currentMetadata.dateStatement === undefined ? {} : { dateStatement: currentMetadata.dateStatement }),
    identifiers: currentMetadata.identifiers,
    typeFields: currentMetadata.typeFields,
    authorityLinks: currentMetadata.authorityLinks,
  })) {
    const saved = repositories.metadata.saveMetadata({
      ...nextMetadata,
      recordId,
      ownerDomainId,
      actorAccountId: actor.id,
      expectedRevision: currentMetadata?.revision ?? null,
      now,
    });
    if (!saved) throw new SuggestionError("concurrent_change");
  }

  const currentProfile = repositories.bibliography.findProfile(ownerDomainId, recordId);
  const scalar = <T>(fieldName: BibliographicFieldName, proposed: T | null, existing: T | undefined): T | undefined => {
    if (proposed === null || !aiMayWrite(authorities, fieldName, existing === undefined)) return existing;
    return proposed;
  };
  const contributorHumanAuthority = authorities.some((entry) => entry.source === "human" && entry.fieldName.startsWith("contributor."));
  const contributorAiAuthority = authorities.some((entry) => entry.source === "ai" && entry.fieldName.startsWith("contributor."));
  const contributors = currentProfile && (contributorHumanAuthority || !contributorAiAuthority)
    ? currentProfile.contributors.map((entry) => ({ ...entry }))
    : canonical.contributors.map((entry) => ({
        id: createId(),
        label: entry.label,
        role: entry.role,
        ...(entry.roleLabel === null ? {} : { roleLabel: entry.roleLabel }),
        ...(() => {
          const authorityId = exactPersonAuthorityId(repositories, ownerDomainId, entry.label);
          return authorityId === undefined ? {} : { authorityId };
        })(),
      }));
  const proposedProfile: BibliographicProfileInput = {
    materialClass: currentProfile && !aiMayWrite(authorities, "materialClass", false)
      ? currentProfile.materialClass : canonical.materialClass,
    contributors,
    publication: compact({
      publisher: scalar("publication.publisher", canonical.publication.publisher, currentProfile?.publication.publisher),
      place: scalar("publication.place", canonical.publication.place, currentProfile?.publication.place),
      publicationDate: scalar("publication.publicationDate", canonical.publication.publicationDate, currentProfile?.publication.publicationDate),
      editionNumber: scalar("publication.editionNumber", canonical.publication.editionNumber, currentProfile?.publication.editionNumber),
      printing: scalar("publication.printing", canonical.publication.printing, currentProfile?.publication.printing),
    }),
    ...compact({
      series: scalar("series", canonical.series, currentProfile?.series),
      volume: scalar("volume", canonical.volume, currentProfile?.volume),
      language: scalar("language", canonical.language, currentProfile?.language),
    }),
    carrierEdition: compact({
      editionType: scalar("carrierEdition.editionType", canonical.carrierEdition.editionType, currentProfile?.carrierEdition.editionType),
      editionStatement: scalar("carrierEdition.editionStatement", canonical.carrierEdition.editionStatement, currentProfile?.carrierEdition.editionStatement),
      facsimileStatement: scalar("carrierEdition.facsimileStatement", canonical.carrierEdition.facsimileStatement, currentProfile?.carrierEdition.facsimileStatement),
    }),
    sourceEdition: compact({
      dynasty: scalar("sourceEdition.dynasty", canonical.sourceEdition.dynasty, currentProfile?.sourceEdition.dynasty),
      reignTitle: scalar("sourceEdition.reignTitle", canonical.sourceEdition.reignTitle, currentProfile?.sourceEdition.reignTitle),
      reignYear: scalar("sourceEdition.reignYear", canonical.sourceEdition.reignYear, currentProfile?.sourceEdition.reignYear),
      absoluteYear: scalar("sourceEdition.absoluteYear", canonical.sourceEdition.absoluteYear, currentProfile?.sourceEdition.absoluteYear),
      printer: scalar("sourceEdition.printer", canonical.sourceEdition.printer, currentProfile?.sourceEdition.printer),
      imprint: scalar("sourceEdition.imprint", canonical.sourceEdition.imprint, currentProfile?.sourceEdition.imprint),
      bookshop: scalar("sourceEdition.bookshop", canonical.sourceEdition.bookshop, currentProfile?.sourceEdition.bookshop),
      institution: scalar("sourceEdition.institution", canonical.sourceEdition.institution, currentProfile?.sourceEdition.institution),
      printingPlace: scalar("sourceEdition.printingPlace", canonical.sourceEdition.printingPlace, currentProfile?.sourceEdition.printingPlace),
      editionType: scalar("sourceEdition.editionType", canonical.sourceEdition.editionType, currentProfile?.sourceEdition.editionType),
      editionStatement: scalar("sourceEdition.editionStatement", canonical.sourceEdition.editionStatement, currentProfile?.sourceEdition.editionStatement),
      holdingInformation: scalar("sourceEdition.holdingInformation", canonical.sourceEdition.holdingInformation, currentProfile?.sourceEdition.holdingInformation),
    }),
  };
  const changed = changedBibliographicFields(currentProfile, proposedProfile)
    .filter((field) => !lockedByHuman(authorities, field.fieldName, field.scopeKey));
  if (!currentProfile || changed.length > 0) {
    const saved = repositories.bibliography.saveProfile({
      ...proposedProfile,
      recordId,
      ownerDomainId,
      actorAccountId: actor.id,
      expectedRevision: currentProfile?.revision ?? null,
      now,
    });
    if (!saved) throw new SuggestionError("concurrent_change");
    for (const field of changed) mark(field.fieldName, field.scopeKey);
    if (!currentProfile && !lockedByHuman(authorities, "materialClass")) mark("materialClass");
  }
  for (const field of applied.values()) {
    repositories.bibliography.setFieldAuthority({
      recordId,
      ownerDomainId,
      fieldName: field.fieldName,
      scopeKey: field.scopeKey,
      source: "ai",
      sourceRunId: suggestionRunId,
      now,
    });
  }
  return [...applied.values()];
}

/**
 * Core authority for asynchronous bibliographic suggestion jobs. Core never
 * renders PDF pages or invokes OCR; it authorizes source access, dispatches an
 * opaque job identity, validates derived candidates, and preserves the
 * existing review/CAS metadata boundary.
 */
export class SuggestionService {
  readonly #persistence: Persistence;
  readonly #storage: StorageAdapter;
  readonly #metadata: CanonicalMetadataService;
  readonly #dispatcher: DerivedComputeDispatcher;
  readonly #coreBaseUrl: string;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #createToken: () => string;
  /**
   * Provider dispatch is an external side effect whose receipt is persisted
   * afterward. Keep one in-flight hand-off per durable job in this Core
   * process so the recovery sweep cannot issue a second provider execution
   * during that ambiguous interval.
   */
  readonly #dispatchingJobs = new Set<string>();

  constructor(options: {
    persistence: Persistence;
    storage: StorageAdapter;
    metadata: CanonicalMetadataService;
    dispatcher: DerivedComputeDispatcher;
    coreBaseUrl: string;
    now?: () => Date;
    createId?: () => string;
    createToken?: () => string;
  }) {
    this.#persistence = options.persistence;
    this.#storage = options.storage;
    this.#metadata = options.metadata;
    this.#dispatcher = options.dispatcher;
    const core = new URL(options.coreBaseUrl);
    if (core.origin !== options.coreBaseUrl) throw new Error("compute Core URL must be an exact origin");
    this.#coreBaseUrl = options.coreBaseUrl;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
    this.#createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
  }

  /**
   * Manager-only batch naming preview. Each selected holding gets the current
   * display/canonical state plus the immediate lightweight filename-derived
   * proposal with its confidence; no OCR/Compute dispatch and no persistence
   * happen here. Items that are not visible/active report `unavailable`.
   */
  previewBatchNaming(actor: AuthenticatedAccount, libraryId: string, fileIds: string[]): BatchNamingPreview {
    if (fileIds.length < 1 || fileIds.length > BATCH_NAMING_MAX_ITEMS || new Set(fileIds).size !== fileIds.length) {
      throw new SuggestionError("invalid_input");
    }
    return this.#persistence.runInTransaction((repositories) => {
      const items: BatchNamingPreviewItem[] = [];
      for (const fileId of fileIds) {
        try {
          const context = resolveHolding(actor, libraryId, fileId, repositories);
          if (context.membership.role !== "manager") {
            items.push(this.#unavailableBatchItem(fileId));
            continue;
          }
          const fingerprint = sourceFingerprint(context.file);
          const detail = this.#metadata.getDetails(actor, libraryId, fileId);
          const lightweight = extractLightweightSuggestions(context.file.displayName);
          const title = lightweight.find((candidate) => candidate.fieldPath === "canonicalTitle");
          items.push({
            fileId,
            displayName: context.file.displayName,
            canonicalTitle: context.holding.canonicalTitle,
            metadataVersion: detail.metadataVersion,
            sourceVersion: fingerprint.value,
            materialType: detail.metadata?.materialType ?? null,
            mediaType: context.file.mediaType,
            proposedTitle: title?.value ?? null,
            proposedConfidence: title ? (title.confidence === "medium" ? "medium" : "low") : null,
            proposedSource: title?.sourceType === "filename" ? "filename" : null,
            status: "available",
          });
        } catch {
          items.push(this.#unavailableBatchItem(fileId));
        }
      }
      return { items };
    });
  }

  /**
   * Manager-only batch naming application. Every item writes through the
   * existing canonical metadata authority/CAS path in its own transaction:
   * a failing item never corrupts or rolls back the other items, and every
   * per-item outcome is reported. No automatic acceptance exists here — the
   * client always confirms before calling.
   */
  applyBatchNaming(actor: AuthenticatedAccount, libraryId: string, items: BatchNamingItemInput[]): BatchNamingResultItem[] {
    if (items.length < 1 || items.length > BATCH_NAMING_MAX_ITEMS || new Set(items.map((item) => item.fileId)).size !== items.length) {
      throw new SuggestionError("invalid_input");
    }
    const results: BatchNamingResultItem[] = [];
    for (const item of items) {
      results.push(this.#applyBatchNamingItem(actor, libraryId, item));
    }
    return results;
  }

  #unavailableBatchItem(fileId: string): BatchNamingPreviewItem {
    return {
      fileId,
      displayName: "",
      canonicalTitle: null,
      metadataVersion: "",
      sourceVersion: "",
      materialType: null,
      mediaType: null,
      proposedTitle: null,
      proposedConfidence: null,
      proposedSource: null,
      status: "unavailable",
    };
  }

  #applyBatchNamingItem(actor: AuthenticatedAccount, libraryId: string, item: BatchNamingItemInput): BatchNamingResultItem {
    if (!VERSION_PATTERN.test(item.metadataVersion) || !VERSION_PATTERN.test(item.sourceVersion)
      || !SAFE_FILE_ID.test(item.fileId) || !MATERIAL_TYPES.includes(item.materialType)) {
      return { fileId: item.fileId, status: "invalid_input" };
    }
    try {
      const snapshot = this.#persistence.runInTransaction((repositories) => {
        const context = resolveHolding(actor, libraryId, item.fileId, repositories);
        if (context.membership.role !== "manager") throw new SuggestionError("not_found");
        const fingerprint = sourceFingerprint(context.file);
        if (fingerprint.value !== item.sourceVersion) throw new SuggestionError("stale");
        const current = repositories.metadata.findMetadata(context.library.ownerDomainId, context.holding.recordId);
        const input: CanonicalMetadataInput = current
          ? {
              materialType: item.materialType,
              canonicalTitle: item.canonicalTitle,
              ...(current.subtitle === null ? {} : { subtitle: current.subtitle }),
              alternativeTitles: [...current.alternativeTitles],
              ...(current.dateStatement === null ? {} : { dateStatement: current.dateStatement }),
              identifiers: current.identifiers.map((identifier) => ({ ...identifier })),
              typeFields: { ...current.typeFields },
              authorityLinks: current.authorityLinks.map((link) => ({ authorityId: link.authorityId, role: link.role })),
            }
          : {
              materialType: item.materialType,
              canonicalTitle: item.canonicalTitle,
              alternativeTitles: [],
              identifiers: [],
              typeFields: {},
              authorityLinks: [],
            };
        return { context, input };
      });
      const detail = this.#metadata.updateMetadata(actor, libraryId, item.fileId, item.metadataVersion, snapshot.input);
      return { fileId: item.fileId, status: "applied", detail };
    } catch (error: unknown) {
      if (error instanceof SuggestionError) {
        return { fileId: item.fileId, status: error.code === "stale" ? "stale" : error.code === "not_found" ? "not_found" : "conflict" };
      }
      if (error instanceof MetadataError) {
        if (error.code === "concurrent_change" || error.code === "incompatible_type_transition") {
          return { fileId: item.fileId, status: "conflict" };
        }
        if (error.code === "not_found") return { fileId: item.fileId, status: "not_found" };
        return { fileId: item.fileId, status: "invalid_input" };
      }
      throw error;
    }
  }

  getLatest(actor: AuthenticatedAccount, libraryId: string, fileId: string): SuggestionRunSummary | null {    return this.#persistence.runInTransaction((repositories) => {
      const context = resolveHolding(actor, libraryId, fileId, repositories);
      const run = repositories.suggestions.findLatestRun(context.library.ownerDomainId, libraryId, fileId);
      if (!run) return null;
      if (!sourceMatches(run, context.file) && run.status !== "stale" && run.status !== "accepted") {
        const stale = repositories.suggestions.updateStatus(
          context.library.ownerDomainId,
          run.id,
          run.status,
          "stale",
        );
        return publicRun(stale ?? { ...run, status: "stale" }, repositories);
      }
      return publicRun(run, repositories);
    });
  }

  list(actor: AuthenticatedAccount, libraryId: string, fileId: string, limit = 10): SuggestionRunSummary[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new SuggestionError("invalid_input");
    return this.#persistence.runInTransaction((repositories) => {
      const context = resolveHolding(actor, libraryId, fileId, repositories);
      return repositories.suggestions
        .listRuns(context.library.ownerDomainId, libraryId, fileId, limit)
        .map((run) => publicRun(run, repositories));
    });
  }

  expireDueJobs(): number {
    return this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.expireDue(this.#now()));
  }

  recoverExpiredLocalPullLeases(limit = 20): number {
    const now = this.#now();
    return this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      let recovered = 0;
      for (const job of repositories.derivedJobs.listExpiredLocalPullLeases(now, limit)) {
        if (!job.activeAttemptId) continue;
        const next = repositories.derivedJobs.recoverExpiredLocalLease(
          job.id,
          job.activeAttemptId,
          this.#createId(),
          now,
        );
        if (next) recovered += 1;
      }
      return recovered;
    });
  }

  /**
   * Persist the lightweight filename-derived evidence for a job if its run does
   * not exist yet. Idempotent: a repeated request reuses the exact run. The
   * run's source fingerprint makes stale sources fail closed at read/accept
   * time exactly like Compute-derived runs.
   */
  #ensureLightweightRun(
    repositories: RepositorySet,
    context: HoldingContext,
    job: DerivedJobRecord,
    now: Date,
  ): void {
    const runId = `suggestion-${job.id}`;
    const existing = repositories.suggestions.findRun(context.library.ownerDomainId, runId);
    if (existing) return;
    const merged = mergeSuggestionCandidates(
      [],
      extractLightweightSuggestions(context.file.displayName),
      "no_suggestions",
    );
    repositories.suggestions.createRun({
      id: runId,
      ownerDomainId: context.library.ownerDomainId,
      libraryId: job.scopeId,
      recordId: context.holding.recordId,
      fileId: job.resourceId,
      sourceFingerprint: sourceFingerprint(context.file),
      status: merged.status,
      window: { firstPages: 15, lastPages: 5, pageCount: null, pageIndices: [], complete: false },
      createdByAccountId: job.createdByAccountId,
      createdAt: now,
      candidates: merged.candidates.slice(0, 256).map((candidate, position) => ({ ...candidate, position })),
    });
  }

  async #dispatchJob(job: DerivedJobRecord): Promise<{ provider: string; providerJobId: string } | null> {
    const attemptId = job.activeAttemptId;
    if (!attemptId || this.#dispatchingJobs.has(job.id)) return null;
    this.#dispatchingJobs.add(job.id);
    try {
      return await this.#dispatcher.dispatch({
        id: job.id,
        kind: job.kind,
        resourceId: job.resourceId,
        attemptId,
        coreBaseUrl: this.#coreBaseUrl,
      });
    } finally {
      this.#dispatchingJobs.delete(job.id);
    }
  }

  getLatestJob(actor: AuthenticatedAccount, libraryId: string, fileId: string): DerivedJobSummary | null {
    return this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(this.#now());
      resolveHolding(actor, libraryId, fileId, repositories);
      const job = repositories.derivedJobs.findLatest("metadata_suggestion", libraryId, fileId);
      return job ? publicDerivedJob(job) : null;
    });
  }

  getLatestCataloguingStates(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileIds: string[],
  ): MetadataCataloguingSummary[] {
    if (fileIds.length < 1 || fileIds.length > METADATA_CATALOGUING_BATCH_MAX_ITEMS
      || fileIds.some((fileId) => !SAFE_FILE_ID.test(fileId))
      || new Set(fileIds).size !== fileIds.length) throw new SuggestionError("invalid_input");
    return this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(this.#now());
      if (!isActiveAccount(actor, repositories)) throw new SuggestionError("not_found");
      const library = repositories.libraries.findById(libraryId);
      const membership = library ? repositories.libraries.findMembership(libraryId, actor.id) : null;
      if (!library || !membership
        || repositories.libraries.countActiveHoldingsByFileIds(libraryId, fileIds) !== fileIds.length) {
        throw new SuggestionError("not_found");
      }
      const jobs = new Map(repositories.derivedJobs
        .findLatestMany("metadata_suggestion", libraryId, fileIds)
        .map((job) => [job.resourceId, job]));
      const runs = new Map(repositories.suggestions
        .findLatestStateEvidenceMany(library.ownerDomainId, libraryId, fileIds)
        .map((run) => [run.fileId, run]));
      return fileIds.map((fileId) => {
        const job = jobs.get(fileId) ?? null;
        const run = runs.get(fileId) ?? null;
        return {
          fileId,
          state: deriveMetadataCataloguingState(job, run),
          job: job ? publicDerivedJob(job) : null,
        };
      });
    });
  }

  getJob(actor: AuthenticatedAccount, libraryId: string, fileId: string, jobId: string): DerivedJobSummary {
    return this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(this.#now());
      resolveHolding(actor, libraryId, fileId, repositories);
      const job = repositories.derivedJobs.findById(jobId);
      if (!job || job.kind !== "metadata_suggestion" || job.scopeId !== libraryId || job.resourceId !== fileId) {
        throw new SuggestionError("not_found");
      }
      return publicDerivedJob(job);
    });
  }

  async requestGeneration(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    options: { origin?: DerivedJobOrigin; queuePriority?: DerivedJobPriority } = {},
  ): Promise<DerivedJobSummary> {
    const now = this.#now();
    const attemptId = this.#createId();
    const prepared = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      const context = resolveHolding(actor, libraryId, fileId, repositories);
      if (context.membership.role !== "manager" || context.file.mediaType?.toLowerCase() !== PDF_MEDIA_TYPE) {
        throw new SuggestionError("not_found");
      }
      const fingerprint = sourceFingerprint(context.file);
      const idempotencyKey = createHash("sha256")
        .update(JSON.stringify([
          "metadata_suggestion",
          SUGGESTION_RULESET_VERSION,
          INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION,
          libraryId,
          fileId,
          fingerprint.value,
        ]))
        .digest("hex");
      const existing = repositories.derivedJobs.findByIdempotencyKey(idempotencyKey);
      let job: DerivedJobRecord;
      let dispatch: boolean;
      if (existing && ["queued", "running", "succeeded"].includes(existing.state)) {
        job = existing;
        // An already-created queued row is owned by the durable reconciler.
        // Dispatching it again here would race a concurrent request or sweep
        // across the provider-accepted/Core-receipt boundary.
        dispatch = false;
      } else if (existing?.state === "failed" && existing.activeAttemptId) {
        // GitHub may queue a clean runner and build/verify its pinned OCR
        // runtime before claiming the source. The worker capability is minted
        // only at claim time; this durable deadline bounds the entire provider
        // journey without coupling Core availability to an event-loop timer.
        const deadlineAt = new Date(now.getTime() + JOB_DEADLINE_MILLISECONDS);
        const retried = repositories.derivedJobs.retry(existing.id, existing.activeAttemptId, attemptId, now, deadlineAt);
        if (!retried) throw new SuggestionError("concurrent_change");
        job = retried;
        // Backfill rows are deliberately persisted first. The bounded
        // reconciler dispatches them only after foreground admissions/retries
        // already present in the queue.
        dispatch = options.origin !== "backfill";
      } else {
        const deadlineAt = new Date(now.getTime() + JOB_DEADLINE_MILLISECONDS);
        const created = repositories.derivedJobs.create({
          id: this.#createId(),
          kind: "metadata_suggestion",
          scopeId: libraryId,
          resourceId: fileId,
          inputVersion: fingerprint.value,
          idempotencyKey,
          attemptId,
          createdByAccountId: actor.id,
          createdAt: now,
          deadlineAt,
          origin: options.origin ?? "interactive",
          queuePriority: options.queuePriority ?? (options.origin === "backfill" ? 100 : 10),
        });
        job = created;
        dispatch = options.origin !== "backfill";
      }
      // Fast naming: the lightweight filename-derived evidence is persisted
      // immediately and independently of the asynchronous Compute job, so a
      // usable canonical-title candidate exists within seconds of the request.
      this.#ensureLightweightRun(repositories, context, job, now);
      return {
        job,
        dispatch,
        keepQueuedOnDispatchFailure: options.origin === "admission",
      };
    });
    if (!prepared.dispatch || !prepared.job.activeAttemptId) return publicDerivedJob(prepared.job);
    try {
      const receipt = await this.#dispatchJob(prepared.job);
      if (!receipt) return publicDerivedJob(prepared.job);
      const recorded = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.recordDispatch(
        prepared.job.id,
        prepared.job.activeAttemptId!,
        receipt.provider,
        receipt.providerJobId,
        this.#now(),
      ));
      return publicDerivedJob(recorded ?? prepared.job);
    } catch {
      if (prepared.keepQueuedOnDispatchFailure) return publicDerivedJob(prepared.job);
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        prepared.job.id,
        prepared.job.activeAttemptId!,
        "compute_dispatch_failed",
        this.#now(),
      ));
      return publicDerivedJob(failed ?? prepared.job);
    }
  }

  /**
   * Resume the narrow hand-off gap between durable queue creation and provider
   * receipt persistence. This does not create historical work: it only
   * dispatches already-created queued jobs that have no provider identity.
   */
  async reconcileUndispatchedJobs(limit = 20): Promise<number> {
    const jobs = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(this.#now());
      return repositories.derivedJobs.listUndispatched(limit);
    });
    let dispatched = 0;
    for (const job of jobs) {
      if (!job.activeAttemptId) continue;
      try {
        const receipt = await this.#dispatchJob(job);
        if (!receipt) continue;
        const recorded = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.recordDispatch(
          job.id,
          job.activeAttemptId!,
          receipt.provider,
          receipt.providerJobId,
          this.#now(),
        ));
        if (recorded) dispatched += 1;
      } catch {
        // Keep the queued row durable for the next sweep. A provider outage
        // must not turn an admitted upload into a failed upload.
      }
    }
    return dispatched;
  }

  async pullLocalJob(workerId: string): Promise<SuggestionLocalPullClaim | null> {
    if (!LOCAL_PULL_WORKER_ID.test(workerId)) throw new SuggestionError("invalid_input");
    const now = this.#now();
    const candidates = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      return repositories.derivedJobs.listLocalPullCandidates(10);
    });
    for (const candidate of candidates) {
      if (!candidate.activeAttemptId) continue;
      let snapshot: { job: DerivedJobRecord; context: HoldingContext } | null;
      try {
        snapshot = this.#persistence.runInTransaction((repositories) => {
          const job = repositories.derivedJobs.findById(candidate.id);
          if (!job || job.state !== "queued" || job.provider !== "local_pull"
            || job.activeAttemptId !== candidate.activeAttemptId || job.deadlineAt <= now) return null;
          const actor = jobActor(job, repositories);
          if (!actor) throw new SuggestionError("not_found");
          const context = resolveHolding(actor, job.scopeId, job.resourceId, repositories);
          if (context.membership.role !== "manager" || sourceFingerprint(context.file).value !== job.inputVersion
            || context.file.mediaType?.toLowerCase() !== PDF_MEDIA_TYPE) throw new SuggestionError("stale");
          return { job, context };
        });
      } catch (error: unknown) {
        if (!(error instanceof SuggestionError)) throw error;
        this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
          candidate.id,
          candidate.activeAttemptId!,
          error.code === "stale" ? "compute_source_stale" : "compute_authorization_changed",
          this.#now(),
        ));
        continue;
      }
      if (!snapshot) continue;
      const metadata = await this.#storage.statObject(snapshot.context.file.objectKey);
      if (!objectMatchesFile(metadata, snapshot.context.file)) {
        this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
          snapshot!.job.id,
          snapshot!.job.activeAttemptId!,
          "compute_source_stale",
          this.#now(),
        ));
        continue;
      }
      const download = await this.#storage.createDownloadAuthorization({
        objectKey: snapshot.context.file.objectKey,
        downloadFilename: "academiccloud-compute-source.pdf",
        disposition: "inline",
        expiresInSeconds: 15 * 60,
      });
      const token = this.#createToken();
      const claimNow = this.#now();
      const capabilityExpiresAt = new Date(Math.min(snapshot.job.deadlineAt.getTime(), claimNow.getTime() + LOCAL_PULL_CAPABILITY_MILLISECONDS));
      const leaseExpiresAt = new Date(Math.min(snapshot.job.deadlineAt.getTime(), claimNow.getTime() + LOCAL_PULL_LEASE_MILLISECONDS));
      const claimed = this.#persistence.runInTransaction((repositories) => {
        const job = repositories.derivedJobs.findById(snapshot!.job.id);
        if (!job || job.state !== "queued" || job.activeAttemptId !== snapshot!.job.activeAttemptId
          || job.deadlineAt <= claimNow) return null;
        const actor = jobActor(job, repositories);
        if (!actor) return null;
        const context = resolveHolding(actor, job.scopeId, job.resourceId, repositories);
        if (context.membership.role !== "manager" || sourceFingerprint(context.file).value !== job.inputVersion) return null;
        return repositories.derivedJobs.claimLocal(
          job.id,
          job.activeAttemptId!,
          workerId,
          tokenDigest(token),
          capabilityExpiresAt,
          leaseExpiresAt,
          claimNow,
        );
      });
      if (!claimed) continue;
      return {
        job: { id: claimed.id, attemptId: claimed.activeAttemptId!, kind: "metadata_suggestion" },
        capability: { token, expiresAt: capabilityExpiresAt.toISOString() },
        source: {
          method: "GET",
          url: download.url,
          sizeBytes: metadata!.sizeBytes,
          mediaType: "application/pdf",
          expiresAt: download.expiresAt.toISOString(),
        },
        callbackUrl: `${this.#coreBaseUrl}/api/internal/compute/jobs/${encodeURIComponent(claimed.id)}/result`,
        lease: {
          expiresAt: leaseExpiresAt.toISOString(),
          heartbeatAfterMilliseconds: LOCAL_PULL_HEARTBEAT_MILLISECONDS,
        },
      };
    }
    return null;
  }

  heartbeatLocalJob(jobId: string, attemptId: string, workerId: string): { lease: { expiresAt: string; heartbeatAfterMilliseconds: number } } {
    if (!SAFE_FILE_ID.test(jobId) || !SAFE_FILE_ID.test(attemptId) || !LOCAL_PULL_WORKER_ID.test(workerId)) {
      throw new SuggestionError("invalid_input");
    }
    const now = this.#now();
    const renewed = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      const job = repositories.derivedJobs.findById(jobId);
      if (!job || job.activeAttemptId !== attemptId) return null;
      const capabilityExpiresAt = new Date(Math.min(job.deadlineAt.getTime(), now.getTime() + LOCAL_PULL_CAPABILITY_MILLISECONDS));
      const leaseExpiresAt = new Date(Math.min(job.deadlineAt.getTime(), now.getTime() + LOCAL_PULL_LEASE_MILLISECONDS));
      return repositories.derivedJobs.heartbeatLocal(
        jobId,
        attemptId,
        workerId,
        capabilityExpiresAt,
        leaseExpiresAt,
        now,
      );
    });
    if (!renewed?.leaseExpiresAt) throw new SuggestionError("not_found");
    return {
      lease: {
        expiresAt: renewed.leaseExpiresAt.toISOString(),
        heartbeatAfterMilliseconds: LOCAL_PULL_HEARTBEAT_MILLISECONDS,
      },
    };
  }

  async renewLocalSourceAuthorization(
    jobId: string,
    attemptId: string,
    workerId: string,
  ): Promise<SuggestionLocalSourceAuthorization> {
    if (!SAFE_FILE_ID.test(jobId) || !SAFE_FILE_ID.test(attemptId) || !LOCAL_PULL_WORKER_ID.test(workerId)) {
      throw new SuggestionError("invalid_input");
    }
    const snapshotAt = this.#now();
    const resolveCurrent = (repositories: RepositorySet, now: Date): { job: DerivedJobRecord; context: HoldingContext } => {
      repositories.derivedJobs.expireDue(now);
      const job = repositories.derivedJobs.findById(jobId);
      if (!job || job.state !== "running" || job.provider !== "local_pull"
        || job.activeAttemptId !== attemptId || job.computeWorkerId !== workerId
        || !job.leaseExpiresAt || job.leaseExpiresAt <= now || job.deadlineAt <= now) {
        throw new SuggestionError("not_found");
      }
      const actor = jobActor(job, repositories);
      if (!actor) throw new SuggestionError("not_found");
      const context = resolveHolding(actor, job.scopeId, job.resourceId, repositories);
      if (context.membership.role !== "manager" || context.file.mediaType?.toLowerCase() !== PDF_MEDIA_TYPE
        || sourceFingerprint(context.file).value !== job.inputVersion) throw new SuggestionError("not_found");
      return { job, context };
    };

    const snapshot = this.#persistence.runInTransaction((repositories) => resolveCurrent(repositories, snapshotAt));
    const metadata = await this.#storage.statObject(snapshot.context.file.objectKey);
    if (!objectMatchesFile(metadata, snapshot.context.file)) throw new SuggestionError("not_found");
    const download = await this.#storage.createDownloadAuthorization({
      objectKey: snapshot.context.file.objectKey,
      downloadFilename: "academiccloud-compute-source.pdf",
      disposition: "inline",
      expiresInSeconds: 15 * 60,
    });

    // Storage signing crosses an external boundary. Re-check the exact attempt,
    // lease, account authority, source fingerprint, and durable object identity
    // immediately before returning the narrow authorization.
    const verifiedAt = this.#now();
    const verified = this.#persistence.runInTransaction((repositories) => resolveCurrent(repositories, verifiedAt));
    if (verified.context.file.objectKey !== snapshot.context.file.objectKey
      || sourceFingerprint(verified.context.file).value !== sourceFingerprint(snapshot.context.file).value) {
      throw new SuggestionError("not_found");
    }
    return {
      source: {
        method: "GET",
        url: download.url,
        sizeBytes: metadata!.sizeBytes,
        mediaType: "application/pdf",
        expiresAt: download.expiresAt.toISOString(),
      },
    };
  }

  async claimJob(jobId: string, attemptId: string): Promise<SuggestionComputeClaim> {
    const now = this.#now();
    const snapshot = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      const job = repositories.derivedJobs.findById(jobId);
      if (!job || job.state !== "queued" || job.activeAttemptId !== attemptId || job.deadlineAt <= now
        || job.provider === "local_pull") {
        throw new SuggestionError("not_found");
      }
      const actor = jobActor(job, repositories);
      if (!actor) throw new SuggestionError("not_found");
      const context = resolveHolding(actor, job.scopeId, job.resourceId, repositories);
      if (context.membership.role !== "manager" || sourceFingerprint(context.file).value !== job.inputVersion
        || context.file.mediaType?.toLowerCase() !== PDF_MEDIA_TYPE) throw new SuggestionError("stale");
      return { job, context };
    });
    const metadata = await this.#storage.statObject(snapshot.context.file.objectKey);
    if (!objectMatchesFile(metadata, snapshot.context.file)) {
      this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(jobId, attemptId, "compute_source_stale", this.#now()));
      throw new SuggestionError("stale");
    }
    const download = await this.#storage.createDownloadAuthorization({
      objectKey: snapshot.context.file.objectKey,
      downloadFilename: "academiccloud-compute-source.pdf",
      disposition: "inline",
      expiresInSeconds: 300,
    });
    const token = this.#createToken();
    const capabilityExpiresAt = new Date(Math.min(snapshot.job.deadlineAt.getTime(), now.getTime() + 10 * 60_000));
    const claimed = this.#persistence.runInTransaction((repositories) => {
      const actor = jobActor(snapshot.job, repositories);
      if (!actor) return null;
      const context = resolveHolding(actor, snapshot.job.scopeId, snapshot.job.resourceId, repositories);
      if (sourceFingerprint(context.file).value !== snapshot.job.inputVersion) return null;
      return repositories.derivedJobs.claim(jobId, attemptId, tokenDigest(token), capabilityExpiresAt, now);
    });
    if (!claimed) throw new SuggestionError("concurrent_change");
    return {
      job: { id: claimed.id, attemptId, kind: "metadata_suggestion" },
      capability: { token, expiresAt: capabilityExpiresAt.toISOString() },
      source: {
        method: "GET",
        url: download.url,
        sizeBytes: metadata!.sizeBytes,
        mediaType: "application/pdf",
        expiresAt: download.expiresAt.toISOString(),
      },
      callbackUrl: `${this.#coreBaseUrl}/api/internal/compute/jobs/${encodeURIComponent(jobId)}/result`,
    };
  }

  async applyComputeResult(result: DerivedComputeResult, capabilityToken: string): Promise<DerivedJobSummary> {
    const now = this.#now();
    const snapshot = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      const job = repositories.derivedJobs.findById(result.jobId);
      if (!job || job.kind !== result.kind || job.activeAttemptId !== result.attemptId
        || !job.capabilityExpiresAt || job.capabilityExpiresAt <= now
        || (job.provider === "local_pull" && job.state === "running"
          && (!job.leaseExpiresAt || job.leaseExpiresAt <= now))
        || !sameDigest(job.capabilityTokenHash, capabilityToken)) throw new SuggestionError("not_found");
      return job;
    });
    if (result.state === "failed") {
      if (snapshot.state === "failed") {
        if (snapshot.errorCode !== result.errorCode) throw new SuggestionError("concurrent_change");
        return publicDerivedJob(snapshot);
      }
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        result.jobId, result.attemptId, result.errorCode, now,
      ));
      if (!failed) throw new SuggestionError("concurrent_change");
      return publicDerivedJob(failed);
    }
    if (result.output.bibliography === undefined) {
      // Candidate/extraction payloads from an old or invalid worker cannot
      // complete the current attempt without structured Qwen evidence.
      if (snapshot.state === "failed") {
        if (snapshot.errorCode !== "compute_invalid_result") throw new SuggestionError("concurrent_change");
        return publicDerivedJob(snapshot);
      }
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        result.jobId, result.attemptId, "compute_invalid_result", now,
      ));
      if (!failed) throw new SuggestionError("concurrent_change");
      return publicDerivedJob(failed);
    }
    const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
    if (snapshot.state === "succeeded") {
      if (snapshot.resultDigest !== digest) throw new SuggestionError("concurrent_change");
      return publicDerivedJob(snapshot);
    }
    const objectSnapshot = this.#persistence.runInTransaction((repositories) => {
      const job = repositories.derivedJobs.findById(result.jobId)!;
      const actor = jobActor(job, repositories);
      if (!actor) return null;
      const context = resolveHolding(actor, job.scopeId, job.resourceId, repositories);
      if (context.membership.role !== "manager" || sourceFingerprint(context.file).value !== job.inputVersion) return null;
      return { job, actor, context };
    });
    if (!objectSnapshot) {
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        result.jobId, result.attemptId, "compute_authorization_changed", now,
      ));
      if (!failed) throw new SuggestionError("concurrent_change");
      return publicDerivedJob(failed);
    }
    const object = await this.#storage.statObject(objectSnapshot.context.file.objectKey);
    if (!objectMatchesFile(object, objectSnapshot.context.file)) {
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        result.jobId, result.attemptId, "compute_source_stale", now,
      ));
      if (!failed) throw new SuggestionError("concurrent_change");
      return publicDerivedJob(failed);
    }
    const completed = this.#persistence.runInTransaction((repositories) => {
      const job = repositories.derivedJobs.findById(result.jobId);
      if (!job || job.state !== "running" || job.activeAttemptId !== result.attemptId) throw new SuggestionError("concurrent_change");
      const actor = jobActor(job, repositories);
      if (!actor) throw new SuggestionError("not_found");
      const context = resolveHolding(actor, job.scopeId, job.resourceId, repositories);
      const fingerprint = sourceFingerprint(context.file);
      if (context.membership.role !== "manager" || fingerprint.value !== job.inputVersion) throw new SuggestionError("stale");
      const runId = `suggestion-${job.id}`;
      const existingRun = repositories.suggestions.findRun(context.library.ownerDomainId, runId);
      const merged = mergeSuggestionCandidates(
        result.output.candidates.map(derivedCandidate),
        existingRun?.candidates.map((candidate) => ({ ...candidate })) ?? [],
        result.output.status,
      );
      const run: NewSuggestionRun = {
        // Append-only evidence: when the fast lightweight run exists, the
        // OCR/Compute evidence lands in a second immutable run that supersedes
        // it; latest-run resolution surfaces it to the UI. Jobs dispatched
        // before fast naming keep the original single-run behavior.
        id: existingRun ? `${runId}-computed` : runId,
        ownerDomainId: context.library.ownerDomainId,
        libraryId: job.scopeId,
        recordId: context.holding.recordId,
        fileId: job.resourceId,
        sourceFingerprint: fingerprint,
        status: merged.status,
        window: { ...result.output.window, pageIndices: [...result.output.window.pageIndices] },
        createdByAccountId: job.createdByAccountId,
        createdAt: now,
        candidates: merged.candidates.slice(0, 256).map((candidate, position) => ({ ...candidate, position })),
      };
      const saved = repositories.suggestions.createRun(run);
      if (result.output.bibliography) {
        const appliedFields = autoApplyIntelligentBibliography({
          repositories,
          context,
          actor,
          result: result.output.bibliography,
          suggestionRunId: saved.id,
          now,
          createId: this.#createId,
        });
        const structuredOutputJson = JSON.stringify(result.output.bibliography);
        const provenance = result.output.bibliography.provenance;
        repositories.bibliography.createAiRunEvidence({
          id: `bibliography-${job.id}`,
          ownerDomainId: context.library.ownerDomainId,
          recordId: context.holding.recordId,
          fileId: job.resourceId,
          suggestionRunId: saved.id,
          status: result.output.bibliography.status,
          overallConfidence: result.output.bibliography.overallConfidence,
          structuredOutputJson,
          structuredOutputSha256: createHash("sha256").update(structuredOutputJson, "utf8").digest("hex"),
          rulesetVersion: result.output.bibliography.rulesetVersion,
          promptVersion: provenance.promptVersion,
          ocrEngineId: !provenance.ocr.used
            ? "not_used/native_or_embedded_text"
            : provenance.ocr.legacyFallback
              ? "academiccloud-tesseract-cli-v1/emergency-legacy"
              : `${provenance.ocr.family}/${provenance.ocr.packageVersion}/${provenance.ocr.detectionModel.name}@${provenance.ocr.detectionModel.revision}/${provenance.ocr.recognitionModel.name}@${provenance.ocr.recognitionModel.revision}`,
          reasoningEngineId: `${provenance.reasoning.family}/${provenance.reasoning.name}@${provenance.reasoning.revision}/${provenance.reasoning.quantization}/${provenance.reasoning.runtimeFamily}-${provenance.reasoning.runtimeVersion}@${provenance.reasoning.runtimeRevision}`,
          selectedPages: [...provenance.selectedPages],
          autoApplied: appliedFields.length > 0,
          appliedFields,
          createdAt: now,
        });
      }
      const succeeded = repositories.derivedJobs.succeed(job.id, result.attemptId, saved.id, digest, now);
      if (!succeeded) throw new SuggestionError("concurrent_change");
      return succeeded;
    });
    return publicDerivedJob(completed);
  }

  async accept(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    runId: string,
    input: SuggestionAcceptanceInput,
  ): Promise<SuggestionAcceptanceResult> {
    if (!VERSION_PATTERN.test(input.metadataVersion)) throw new SuggestionError("invalid_input");
    const ids = safeCandidateIds(input.acceptedCandidateIds);
    const snapshot = this.#persistence.runInTransaction((repositories) => {
      const context = resolveHolding(actor, libraryId, fileId, repositories);
      if (context.membership.role !== "manager") throw new SuggestionError("not_found");
      const run = repositories.suggestions.findRun(context.library.ownerDomainId, runId);
      if (!run || run.libraryId !== libraryId || run.fileId !== fileId) throw new SuggestionError("not_found");
      if (!sourceMatches(run, context.file)) {
        if (run.status !== "stale" && run.status !== "accepted") {
          repositories.suggestions.updateStatus(context.library.ownerDomainId, run.id, run.status, "stale");
        }
        throw new SuggestionError("stale");
      }
      if (run.status !== "ready" && run.status !== "ambiguous") throw new SuggestionError("conflict");
      const selected = ids.map((id) => run.candidates.find((candidate) => candidate.id === id));
      if (selected.some((candidate): candidate is undefined => !candidate)) throw new SuggestionError("invalid_input");
      const detail = this.#metadata.getDetails(actor, libraryId, fileId);
      let metadata: unknown = input.metadata;
      if (metadata === undefined) {
        if (!detail.metadata) throw new SuggestionError("invalid_input");
        metadata = candidatePatch(detail.metadata, selected as SuggestionCandidate[]);
      } else {
        metadata = validateAcceptanceMetadata(metadata);
      }
      assertAuthorityCandidatesResolved(metadata, selected as SuggestionCandidate[], context.library.ownerDomainId, repositories);
      return { context, run, selected: selected as SuggestionCandidate[], detail, metadata };
    });

    // The database fingerprint protects against ordinary file revision/checksum
    // changes.  Re-check the provider metadata as well so an object changed
    // out-of-band (without a database write) cannot turn stale evidence into a
    // canonical acceptance.  Generation performs the same before/after check.
    let currentObject: Awaited<ReturnType<StorageAdapter["statObject"]>> = null;
    try {
      currentObject = await this.#storage.statObject(snapshot.context.file.objectKey);
    } catch {
      currentObject = null;
    }
    if (!objectMatchesFile(currentObject, snapshot.context.file)) {
      this.#persistence.runInTransaction((repositories) => {
        repositories.suggestions.updateStatus(
          snapshot.context.library.ownerDomainId,
          snapshot.run.id,
          snapshot.run.status,
          "stale",
        );
      });
      throw new SuggestionError("stale");
    }
    const sourceStillCurrent = this.#persistence.runInTransaction((repositories) => {
      const current = resolveHolding(actor, libraryId, fileId, repositories);
      return sourceMatches(snapshot.run, current.file) && objectMatchesFile(currentObject, current.file);
    });
    if (!sourceStillCurrent) {
      this.#persistence.runInTransaction((repositories) => {
        repositories.suggestions.updateStatus(
          snapshot.context.library.ownerDomainId,
          snapshot.run.id,
          snapshot.run.status,
          "stale",
        );
      });
      throw new SuggestionError("stale");
    }

    let detail: MetadataDetail;
    try {
      detail = this.#metadata.updateMetadata(actor, libraryId, fileId, input.metadataVersion, snapshot.metadata);
    } catch (error: unknown) {
      if (error instanceof MetadataError) {
        if (error.code === "concurrent_change") throw new SuggestionError("concurrent_change", { cause: error });
        if (error.code === "not_found") throw new SuggestionError("not_found", { cause: error });
        if (error.code === "incompatible_type_transition") throw new SuggestionError("conflict", { cause: error });
        throw new SuggestionError("invalid_input", { cause: error });
      }
      throw error;
    }

    const accepted = this.#persistence.runInTransaction((repositories) => {
      const updated = repositories.suggestions.updateStatus(
        snapshot.context.library.ownerDomainId,
        snapshot.run.id,
        snapshot.run.status,
        "accepted",
      );
      return updated ?? repositories.suggestions.findRun(snapshot.context.library.ownerDomainId, snapshot.run.id);
    });
    if (!accepted) throw new SuggestionError("conflict");
    return { detail, run: publicRun(accepted, this.#persistence.repositories) };
  }
}
