import { createHash, randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { StoredFile } from "../drive/file.js";
import type { Library, LibraryHolding, LibraryMembership } from "../library/library.js";
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
import {
  StorageObjectContentUnavailableError,
  StorageObjectReadLimitError,
  type StorageAdapter,
} from "../storage/storage-adapter.js";
import {
  PdfJsFrontMatterInspector,
  PdfTextInspectionError,
} from "./pdf-text.js";
import type { BoundedPdfTextSource, PdfRangeSource } from "./suggestion.js";
import { extractBibliographicSuggestions } from "./extractor.js";
import type { SuggestionRepository } from "./repositories.js";
import {
  SUGGESTION_LIMITS,
  SUGGESTION_RULESET_VERSION,
  SUGGESTION_WINDOW,
  type NewSuggestionRun,
  type SuggestionCandidate,
  type SuggestionRunRecord,
  type SuggestionRunSummary,
  type SuggestionStatus,
  type SuggestionWindow,
} from "./suggestion.js";

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

const VERSION_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const PDF_MEDIA_TYPE = "application/pdf";

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

function emptyWindow(): SuggestionWindow {
  return {
    firstPages: SUGGESTION_WINDOW.firstPages,
    lastPages: SUGGESTION_WINDOW.lastPages,
    pageCount: null,
    pageIndices: [],
    complete: false,
  };
}

function publicRun(run: SuggestionRunRecord): SuggestionRunSummary {
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

function sameSourceFingerprint(
  left: ReturnType<typeof sourceFingerprint>,
  right: ReturnType<typeof sourceFingerprint>,
): boolean {
  return left.value === right.value
    && left.fileRevision === right.fileRevision
    && left.checksumAlgorithm === right.checksumAlgorithm
    && left.checksum === right.checksum;
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

/**
 * Bounded, local-only bibliographic suggestion service.  Storage bytes are
 * read only after Library/holding authorization, and the service never writes
 * canonical metadata during generation or review.
 */
export class SuggestionService {
  readonly #persistence: Persistence;
  readonly #storage: StorageAdapter;
  readonly #metadata: CanonicalMetadataService;
  readonly #inspector: BoundedPdfTextSource;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: {
    persistence: Persistence;
    storage: StorageAdapter;
    metadata: CanonicalMetadataService;
    inspector?: BoundedPdfTextSource;
    now?: () => Date;
    createId?: () => string;
  }) {
    this.#persistence = options.persistence;
    this.#storage = options.storage;
    this.#metadata = options.metadata;
    this.#inspector = options.inspector ?? new PdfJsFrontMatterInspector();
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  getLatest(actor: AuthenticatedAccount, libraryId: string, fileId: string): SuggestionRunSummary | null {
    return this.#persistence.runInTransaction((repositories) => {
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
        return publicRun(stale ?? { ...run, status: "stale" });
      }
      return publicRun(run);
    });
  }

  list(actor: AuthenticatedAccount, libraryId: string, fileId: string, limit = 10): SuggestionRunSummary[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new SuggestionError("invalid_input");
    return this.#persistence.runInTransaction((repositories) => {
      const context = resolveHolding(actor, libraryId, fileId, repositories);
      return repositories.suggestions
        .listRuns(context.library.ownerDomainId, libraryId, fileId, limit)
        .map((run) => publicRun(run));
    });
  }

  async generate(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<SuggestionRunSummary> {
    const context = this.#persistence.runInTransaction((repositories) => resolveHolding(actor, libraryId, fileId, repositories));
    if (context.membership.role !== "manager") throw new SuggestionError("not_found");

    const fingerprint = sourceFingerprint(context.file);
    const now = this.#now();
    let status: SuggestionStatus = "unsupported";
    let window = emptyWindow();
    let candidates: Omit<SuggestionCandidate, "id">[] = [];
    let observedObject: Awaited<ReturnType<StorageAdapter["statObject"]>> = null;

    if (context.file.mediaType?.toLowerCase() === PDF_MEDIA_TYPE) {
      try {
        const metadata = await this.#storage.statObject(context.file.objectKey);
        observedObject = metadata;
        if (!metadata || !objectMatchesFile(metadata, context.file)) {
          status = "stale";
        } else {
          let pdfHeader: Uint8Array | null = null;
          if (this.#storage.readObjectRange) {
            const header = await this.#storage.readObjectRange(context.file.objectKey, 0, Math.min(5, metadata.sizeBytes));
            pdfHeader = header?.bytes ?? null;
          } else if (metadata.sizeBytes <= SUGGESTION_LIMITS.maxObjectBytes) {
            const bytes = await this.#storage.readObject(context.file.objectKey, SUGGESTION_LIMITS.maxObjectBytes);
            pdfHeader = bytes?.subarray(0, 5) ?? null;
          }
          if (!pdfHeader || new TextDecoder("ascii").decode(pdfHeader) !== "%PDF-") {
            status = "unsupported";
          } else {
            let inspection: Awaited<ReturnType<NonNullable<BoundedPdfTextSource["inspect"]>>> | null = null;
            if (metadata && this.#inspector.inspectRange && this.#storage.readObjectRange) {
              const source: PdfRangeSource = {
                length: metadata.sizeBytes,
                read: async (begin, end, rangeSignal) => {
                  const result = await this.#storage.readObjectRange!(context.file.objectKey, begin, end);
                  if (!result || result.end < end) throw new StorageObjectContentUnavailableError(context.file.objectKey);
                  if (rangeSignal?.aborted) throw new PdfTextInspectionError("aborted");
                  return result.bytes;
                },
              };
              inspection = await this.#inspector.inspectRange(source, SUGGESTION_LIMITS, signal);
            } else {
              const bytes = await this.#storage.readObject(context.file.objectKey, SUGGESTION_LIMITS.maxObjectBytes);
              if (bytes) inspection = await this.#inspector.inspect(bytes, SUGGESTION_LIMITS, signal);
            }
            if (inspection) {
              window = {
                firstPages: SUGGESTION_WINDOW.firstPages,
                lastPages: SUGGESTION_WINDOW.lastPages,
                pageCount: inspection.pageCount,
                pageIndices: [...inspection.pageIndices],
                complete: inspection.complete,
              };
              const extracted = extractBibliographicSuggestions({
                pages: inspection.pages,
                embeddedMetadata: inspection.embeddedMetadata,
                filename: context.file.displayName,
                hasUsableTextLayer: inspection.hasUsableTextLayer,
              });
              status = extracted.status;
              candidates = extracted.candidates;
              if (candidates.length === 0 && !inspection.complete && status === "ocr_deferred") status = "unsupported";
            } else {
              const extracted = extractBibliographicSuggestions({ pages: [], embeddedMetadata: {}, filename: context.file.displayName });
              status = extracted.status === "ocr_deferred" ? "unsupported" : extracted.status;
              candidates = extracted.candidates;
            }
          }
        }
        if (status !== "stale" && observedObject) {
          const afterRead = await this.#storage.statObject(context.file.objectKey);
          if (!objectMatchesFile(afterRead, context.file)
            || afterRead?.sizeBytes !== observedObject.sizeBytes
            || afterRead?.checksum !== observedObject.checksum
            || afterRead?.checksumAlgorithm !== observedObject.checksumAlgorithm) {
            status = "stale";
            window = emptyWindow();
            candidates = [];
          }
        }
      } catch (error: unknown) {
        if (error instanceof PdfTextInspectionError && error.code === "aborted") {
          throw new SuggestionError("unsupported", { cause: error });
        }
        if (error instanceof StorageObjectReadLimitError
          || error instanceof StorageObjectContentUnavailableError
          || error instanceof PdfTextInspectionError) {
          window = emptyWindow();
          const extracted = extractBibliographicSuggestions({ pages: [], embeddedMetadata: {}, filename: context.file.displayName });
          status = extracted.status === "ocr_deferred" ? "unsupported" : extracted.status;
          candidates = extracted.candidates;
        } else {
          // Unexpected failures belong to the suggestion-specific HTTP
          // diagnostic boundary. Do not persist a misleading unsupported run.
          throw error;
        }
      }
    }

    const currentContext = this.#persistence.runInTransaction((repositories) => {
      const current = resolveHolding(actor, libraryId, fileId, repositories);
      if (current.membership.role !== "manager") throw new SuggestionError("not_found");
      return { fingerprint: sourceFingerprint(current.file), ownerDomainId: current.library.ownerDomainId };
    });
    if (currentContext.ownerDomainId !== context.library.ownerDomainId
      || !sameSourceFingerprint(fingerprint, currentContext.fingerprint)) {
      status = "stale";
      window = emptyWindow();
      candidates = [];
    }

    const run: NewSuggestionRun = {
      id: this.#createId(),
      ownerDomainId: context.library.ownerDomainId,
      libraryId,
      recordId: context.holding.recordId,
      fileId,
      sourceFingerprint: fingerprint,
      status,
      window,
      createdByAccountId: actor.id,
      createdAt: now,
      candidates: candidates.slice(0, 256).map((candidate, position) => ({ ...candidate, position })),
    };
    const saved = this.#persistence.runInTransaction((repositories) => repositories.suggestions.createRun(run));
    return publicRun(saved);
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
    return { detail, run: publicRun(accepted) };
  }
}
