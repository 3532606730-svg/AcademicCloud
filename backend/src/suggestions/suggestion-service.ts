import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type {
  DerivedComputeDispatcher,
  DerivedComputeResult,
  DerivedMetadataCandidate,
} from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { StoredFile } from "../drive/file.js";
import type { Library, LibraryHolding, LibraryMembership } from "../library/library.js";
import { publicDerivedJob, type DerivedJobRecord, type DerivedJobSummary } from "../jobs/job.js";
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
import type { StorageAdapter } from "../storage/storage-adapter.js";
import { extractLightweightSuggestions, mergeSuggestionCandidates } from "./lightweight-extractor.js";
import {
  type NewSuggestionRun,
  type SuggestionCandidate,
  type SuggestionRunRecord,
  type SuggestionRunSummary,
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
const JOB_DEADLINE_MILLISECONDS = 2 * 60 * 60_000;

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

  expireDueJobs(): number {
    return this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.expireDue(this.#now()));
  }

  getLatestJob(actor: AuthenticatedAccount, libraryId: string, fileId: string): DerivedJobSummary | null {
    return this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(this.#now());
      resolveHolding(actor, libraryId, fileId, repositories);
      const job = repositories.derivedJobs.findLatest("metadata_suggestion", libraryId, fileId);
      return job ? publicDerivedJob(job) : null;
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
        .update(JSON.stringify(["metadata_suggestion", libraryId, fileId, fingerprint.value]))
        .digest("hex");
      const existing = repositories.derivedJobs.findByIdempotencyKey(idempotencyKey);
      if (existing && ["queued", "running", "succeeded"].includes(existing.state)) {
        return { job: existing, dispatch: false };
      }
      // GitHub may queue a clean runner and build/verify its pinned OCR
      // runtime before claiming the source. The worker capability is minted
      // only at claim time; this durable deadline bounds the entire provider
      // journey without coupling Core availability to an event-loop timer.
      const deadlineAt = new Date(now.getTime() + JOB_DEADLINE_MILLISECONDS);
      if (existing?.state === "failed" && existing.activeAttemptId) {
        const retried = repositories.derivedJobs.retry(existing.id, existing.activeAttemptId, attemptId, now, deadlineAt);
        if (!retried) throw new SuggestionError("concurrent_change");
        return { job: retried, dispatch: true };
      }
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
      });
      return { job: created, dispatch: true };
    });
    if (!prepared.dispatch || !prepared.job.activeAttemptId) return publicDerivedJob(prepared.job);
    try {
      const receipt = await this.#dispatcher.dispatch({
        id: prepared.job.id,
        kind: prepared.job.kind,
        resourceId: prepared.job.resourceId,
        attemptId: prepared.job.activeAttemptId,
        coreBaseUrl: this.#coreBaseUrl,
      });
      const recorded = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.recordDispatch(
        prepared.job.id,
        prepared.job.activeAttemptId!,
        receipt.provider,
        receipt.providerJobId,
        this.#now(),
      ));
      return publicDerivedJob(recorded ?? prepared.job);
    } catch {
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        prepared.job.id,
        prepared.job.activeAttemptId!,
        "compute_dispatch_failed",
        this.#now(),
      ));
      return publicDerivedJob(failed ?? prepared.job);
    }
  }

  async claimJob(jobId: string, attemptId: string): Promise<SuggestionComputeClaim> {
    const now = this.#now();
    const snapshot = this.#persistence.runInTransaction((repositories) => {
      repositories.derivedJobs.expireDue(now);
      const job = repositories.derivedJobs.findById(jobId);
      if (!job || job.state !== "queued" || job.activeAttemptId !== attemptId || job.deadlineAt <= now) {
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
        || !sameDigest(job.capabilityTokenHash, capabilityToken)) throw new SuggestionError("not_found");
      return job;
    });
    if (result.state === "failed") {
      const failed = this.#persistence.runInTransaction((repositories) => repositories.derivedJobs.fail(
        result.jobId, result.attemptId, result.errorCode, now,
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
      const merged = mergeSuggestionCandidates(
        result.output.candidates.map(derivedCandidate),
        extractLightweightSuggestions(context.file.displayName),
        result.output.status,
      );
      const runId = `suggestion-${job.id}`;
      const run: NewSuggestionRun = {
        id: runId,
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
    return { detail, run: publicRun(accepted) };
  }
}
