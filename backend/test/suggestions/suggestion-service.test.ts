import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, type TestContext } from "node:test";

import type {
  DerivedComputeDispatchJob,
  DerivedComputeDispatcher,
  DerivedComputeResult,
  IntelligentBibliographyResult,
} from "@academiccloud/compute-contracts";
import { INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION } from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { LocalPullComputeDispatcher } from "../../src/compute/local-pull-dispatcher.js";
import { SuggestionError, SuggestionService } from "../../src/suggestions/suggestion-service.js";
import { SUGGESTION_RULESET_VERSION } from "../../src/suggestions/suggestion.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "suggest-owner", loginName: "suggest-owner", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "suggest-member", loginName: "suggest-member", role: "member" };

class CapturingDispatcher implements DerivedComputeDispatcher {
  readonly jobs: DerivedComputeDispatchJob[] = [];

  async dispatch(job: DerivedComputeDispatchJob): Promise<{ provider: string; providerJobId: string }> {
    this.jobs.push({ ...job });
    return { provider: "test", providerJobId: `provider-${job.attemptId}` };
  }
}

class DeferredDispatcher implements DerivedComputeDispatcher {
  readonly jobs: DerivedComputeDispatchJob[] = [];
  #resolve: ((receipt: { provider: string; providerJobId: string }) => void) | undefined;

  async dispatch(job: DerivedComputeDispatchJob): Promise<{ provider: string; providerJobId: string }> {
    this.jobs.push({ ...job });
    return new Promise((resolve) => { this.#resolve = resolve; });
  }

  resolve(): void {
    if (!this.#resolve) throw new Error("dispatch is not pending");
    this.#resolve({ provider: "test", providerJobId: "provider-deferred" });
    this.#resolve = undefined;
  }
}

/**
 * Models the only unsafe external boundary: the provider accepts the first
 * dispatch, then Core loses the receipt before it can persist it. A restarted
 * Core instance must be able to reconcile the durable row without allowing
 * both accepted workers to claim/execute the same attempt.
 */
class AmbiguousRestartDispatcher implements DerivedComputeDispatcher {
  readonly jobs: DerivedComputeDispatchJob[] = [];
  #calls = 0;
  providerExecutions = 0;

  async dispatch(job: DerivedComputeDispatchJob): Promise<{ provider: string; providerJobId: string }> {
    this.#calls += 1;
    this.jobs.push({ ...job });
    if (this.#calls === 1) {
      this.providerExecutions += 1;
      throw new Error("Core crashed after provider acceptance");
    }
    // Provider-side idempotency resolves the same stable attempt identity to
    // the accepted execution; the adapter does not start a second workload.
    return { provider: "test", providerJobId: `provider-${job.attemptId}` };
  }
}

function ids(...values: string[]): () => string {
  let position = 0;
  return () => values[position++] ?? `generated-${position}`;
}

function extractionOnlyResult(jobId: string, attemptId: string): DerivedComputeResult {
  return {
    jobId,
    attemptId,
    kind: "metadata_suggestion",
    state: "succeeded",
    output: {
      status: "ready",
      window: { firstPages: 15, lastPages: 5, pageCount: 2, pageIndices: [1, 2], complete: true },
      candidates: [{
        position: 0,
        fieldPath: "canonicalTitle",
        typeFieldName: null,
        authorityType: null,
        authorityRole: null,
        identifierScheme: null,
        value: "The Mongols and the West, 1221-1410",
        sourceType: "title_page",
        sourcePageIndex: 1,
        pageClass: "title_page",
        confidence: "high",
        precedenceRank: 10,
        evidenceExcerpt: "The Mongols and the West, 1221-1410",
        evidenceOrigin: "native_text",
        ocrEngine: null,
        ocrConfidence: null,
        rulesetVersion: "rf-frontmatterocr-v2",
      }],
    },
  };
}

function intelligentResult(jobId: string, attemptId: string, options: {
  title?: string;
  materialClass?: NonNullable<IntelligentBibliographyResult["canonical"]>["materialClass"];
  contributor?: string;
  contributorRole?: NonNullable<IntelligentBibliographyResult["canonical"]>["contributors"][number]["role"];
  publisher?: string | null;
  sourceEditionStatement?: string | null;
  status?: "auto_apply" | "ambiguous";
} = {}): DerivedComputeResult {
  const title = options.title ?? "近代中国史研究";
  const materialClass = options.materialClass ?? "scholarly_monograph";
  const contributor = options.contributor ?? "王明";
  const contributorRole = options.contributorRole ?? "author";
  const publisher = options.publisher ?? null;
  const sourceEditionStatement = options.sourceEditionStatement ?? null;
  const evidence = (fieldName: IntelligentBibliographyResult["fields"][number]["fieldName"], scopeKey = "") => ({
    fieldName,
    scopeKey,
    confidence: 96,
    sourceType: "title_page" as const,
    sourcePageIndex: 1,
    pageClass: "title_page" as const,
    evidenceOrigin: "native_text" as const,
    evidenceSha256: "a".repeat(64),
  });
  const bibliography: IntelligentBibliographyResult = {
    contractVersion: 1,
    rulesetVersion: "l1-intelligent-library01-v3",
    status: options.status ?? "auto_apply",
    overallConfidence: 96,
    canonical: {
      materialClass,
      canonicalTitle: title,
      subtitle: null,
      alternativeTitles: [],
      dateStatement: null,
      identifiers: [],
      contributors: [{ label: contributor, role: contributorRole, roleLabel: null }],
      publication: { publisher, place: null, publicationDate: null, editionNumber: null, printing: null },
      series: null,
      volume: null,
      language: null,
      carrierEdition: { editionType: null, editionStatement: null, facsimileStatement: null },
      sourceEdition: { dynasty: null, reignTitle: null, reignYear: null, absoluteYear: null, printer: null, imprint: null, bookshop: null, institution: null, printingPlace: null, editionType: null, editionStatement: sourceEditionStatement, holdingInformation: null },
    },
    fields: [
      evidence("materialClass"),
      evidence("canonicalTitle"),
      evidence("contributor.label", "contributor:0"),
      evidence("contributor.role", "contributor:0"),
      ...(publisher === null ? [] : [evidence("publication.publisher")]),
      ...(sourceEditionStatement === null ? [] : [evidence("sourceEdition.editionStatement")]),
    ],
    warnings: [],
    provenance: {
      ocr: {
        used: false,
        family: "PaddleOCR", packageVersion: "3.7.0", runtimeFamily: "PaddlePaddle", runtimeVersion: "3.3.1",
        detectionModel: { name: "PP-OCRv6_small_det", revision: "106c97591b235f607453300d9fc8c1cad1b25488", sha256: "5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da" },
        recognitionModel: { name: "PP-OCRv6_small_rec", revision: "bd619643acac4b9650c040234da8d944476ee3f1", sha256: "406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907" },
        legacyFallback: false,
      },
      reasoning: {
        family: "Qwen3", name: "Qwen3-1.7B-GGUF", revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
        sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a", quantization: "Q8_0",
        runtimeFamily: "llama.cpp", runtimeVersion: "b10218", runtimeRevision: "de69995",
        runtimeSha256: "78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b",
      },
      selectedPages: [1, 2],
      promptVersion: "l1-intelligent-library01-prompt-v3",
    },
  };
  const legacy = extractionOnlyResult(jobId, attemptId);
  if (legacy.state !== "succeeded") throw new Error("test fixture is invalid");
  return { ...legacy, output: { ...legacy.output, bibliography } };
}

function fixture(context: TestContext, options: { now?: () => Date; dispatcher?: DerivedComputeDispatcher } = {}) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: OWNER.id,
    loginName: OWNER.loginName,
    passwordHash: "test",
    role: "owner",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  persistence.repositories.accounts.create({
    id: MEMBER.id,
    loginName: MEMBER.loginName,
    passwordHash: "test",
    role: "member",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const library = persistence.repositories.libraries.findDefault()!;
  const fileId = "suggestion-file";
  const objectKey = `objects/aa/${"b".repeat(62)}`;
  const bytes = new TextEncoder().encode("%PDF-1.4\n% durable compute source\n");
  const checksum = "1B2M2Y8AsgTpgAmY7PhCfg==";
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(
    fileId,
    library.ownerDomainId,
    MEMBER.id,
    "Mongols -- acquisition.pdf",
    objectKey,
    bytes.byteLength,
    checksum,
    timestamp,
    timestamp,
    timestamp,
  );
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("suggestion-record", library.ownerDomainId, MEMBER.id, "legacy", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run("suggestion-artifact", library.ownerDomainId, "suggestion-record", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("suggestion-version", library.ownerDomainId, "suggestion-artifact", fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run("suggestion-artifact");
  persistence.repositories.favorites.addFile(MEMBER.id, fileId, NOW);

  const storage = new InMemoryStorageAdapter(options.now ?? (() => NOW));
  storage.putObject({
    objectKey,
    sizeBytes: bytes.byteLength,
    etag: null,
    checksumAlgorithm: "md5",
    checksum,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  }, bytes);
  const metadata = new CanonicalMetadataService(persistence, options.now ?? (() => NOW), () => "suggest-authority");
  const dispatcher = options.dispatcher ?? new CapturingDispatcher();
  const suggestions = new SuggestionService({
    persistence,
    storage,
    metadata,
    dispatcher,
    coreBaseUrl: "https://academiccloud.example",
    now: options.now ?? (() => NOW),
    createId: ids("attempt-1", "job-1", "attempt-2", "job-2"),
    createToken: () => "job-capability-token",
  });
  return { database, persistence, library, fileId, objectKey, bytes, storage, metadata, suggestions, dispatcher };
}

test("request returns a durable queued identity promptly and is idempotent", async (context) => {
  const { database, library, fileId, suggestions, dispatcher } = fixture(context);
  const first = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(first.id, "job-1");
  assert.equal(first.state, "queued");
  assert.equal(first.attempts, 1);
  assert.equal(first.origin, "interactive");
  assert.equal(first.queuePriority, 10);
  assert.deepEqual((dispatcher as CapturingDispatcher).jobs, [{
    id: "job-1",
    kind: "metadata_suggestion",
    resourceId: fileId,
    attemptId: "attempt-1",
    coreBaseUrl: "https://academiccloud.example",
  }]);

  const duplicate = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.deepEqual(duplicate, first);
  assert.equal((dispatcher as CapturingDispatcher).jobs.length, 1);
  assert.equal(suggestions.getLatestJob(MEMBER, library.id, fileId)?.id, first.id);
  assert.equal(suggestions.getJob(MEMBER, library.id, fileId, first.id).state, "queued");

  const fingerprint = database.prepare("SELECT input_version, idempotency_key FROM derived_compute_jobs WHERE id = ?")
    .get(first.id) as { input_version: string; idempotency_key: string };
  const v3Key = createHash("sha256").update(JSON.stringify([
    "metadata_suggestion", SUGGESTION_RULESET_VERSION, INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION,
    library.id, fileId, fingerprint.input_version,
  ])).digest("hex");
  const previousPipelineKey = createHash("sha256").update(JSON.stringify([
    "metadata_suggestion", SUGGESTION_RULESET_VERSION, library.id, fileId, fingerprint.input_version,
  ])).digest("hex");
  const historicalV1Key = createHash("sha256").update(JSON.stringify([
    "metadata_suggestion", library.id, fileId, fingerprint.input_version,
  ])).digest("hex");
  assert.equal(fingerprint.idempotency_key, v3Key);
  assert.notEqual(v3Key, previousPipelineKey, "a v2 bibliography success must not suppress the v3 reasoning run");
  assert.notEqual(v3Key, historicalV1Key, "a v1 success must not suppress the current quality-gate run");
});

test("a same-source succeeded job from the previous bibliography pipeline cannot suppress v3 inference", async (context) => {
  const { database, library, fileId, suggestions, dispatcher } = fixture(context);
  const previous = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(previous.id, "attempt-1");
  await suggestions.applyComputeResult(intelligentResult(previous.id, "attempt-1", { status: "ambiguous" }), claim.capability.token);

  const row = database.prepare("SELECT input_version FROM derived_compute_jobs WHERE id = ?")
    .get(previous.id) as { input_version: string };
  const previousPipelineKey = createHash("sha256").update(JSON.stringify([
    "metadata_suggestion", SUGGESTION_RULESET_VERSION, library.id, fileId, row.input_version,
  ])).digest("hex");
  database.prepare("UPDATE derived_compute_jobs SET idempotency_key = ? WHERE id = ?")
    .run(previousPipelineKey, previous.id);

  const current = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(previous.state, "queued");
  assert.equal(current.id, "job-2");
  assert.equal(current.state, "queued");
  assert.notEqual(current.id, previous.id);
  assert.equal((dispatcher as CapturingDispatcher).jobs.length, 2);
  assert.equal(suggestions.getLatestJob(OWNER, library.id, fileId)?.id, current.id);
});

test("Local Pull claim, heartbeat, lease recovery, and stale-attempt rejection are atomic", async (context) => {
  let now = NOW;
  const { persistence, library, fileId, suggestions } = fixture(context, {
    now: () => now,
    dispatcher: new LocalPullComputeDispatcher(),
  });
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const routed = persistence.repositories.derivedJobs.findById(job.id)!;
  assert.equal(routed.provider, "local_pull");
  assert.equal(routed.providerJobId, "local-pull:attempt-1");
  await assert.rejects(
    () => suggestions.claimJob(job.id, "attempt-1"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );

  const first = await suggestions.pullLocalJob("owner-laptop.wsl2");
  assert.equal(first?.job.attemptId, "attempt-1");
  assert.equal(first?.lease.heartbeatAfterMilliseconds, 30_000);
  const renewedSource = await suggestions.renewLocalSourceAuthorization(job.id, "attempt-1", "owner-laptop.wsl2");
  assert.equal(renewedSource.source.sizeBytes, first?.source.sizeBytes);
  assert.equal(renewedSource.source.url, first?.source.url);
  assert.deepEqual(Object.keys(renewedSource.source).sort(), ["expiresAt", "mediaType", "method", "sizeBytes", "url"]);
  await assert.rejects(
    () => suggestions.renewLocalSourceAuthorization(job.id, "wrong-attempt", "owner-laptop.wsl2"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  await assert.rejects(
    () => suggestions.renewLocalSourceAuthorization(job.id, "attempt-1", "second-worker"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  assert.equal(await suggestions.pullLocalJob("second-worker"), null);
  assert.throws(
    () => suggestions.heartbeatLocalJob(job.id, "attempt-1", "second-worker"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );

  now = new Date(NOW.getTime() + 30_000);
  const heartbeat = suggestions.heartbeatLocalJob(job.id, "attempt-1", "owner-laptop.wsl2");
  assert.equal(heartbeat.lease.expiresAt, new Date(NOW.getTime() + 120_000).toISOString());
  now = new Date(NOW.getTime() + 100_000);
  assert.equal(suggestions.recoverExpiredLocalPullLeases(), 0);

  now = new Date(NOW.getTime() + 121_000);
  await assert.rejects(
    () => suggestions.renewLocalSourceAuthorization(job.id, "attempt-1", "owner-laptop.wsl2"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  await assert.rejects(
    () => suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", { status: "ambiguous" }), first!.capability.token),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  assert.equal(persistence.repositories.derivedJobs.findById(job.id)?.state, "running");
  assert.equal(suggestions.recoverExpiredLocalPullLeases(), 1);
  assert.equal(await suggestions.reconcileUndispatchedJobs(), 1);
  const recovered = persistence.repositories.derivedJobs.findById(job.id)!;
  assert.equal(recovered.state, "queued");
  assert.equal(recovered.activeAttemptId, "attempt-2");
  assert.equal(recovered.attempts, 2);
  assert.throws(
    () => suggestions.heartbeatLocalJob(job.id, "attempt-1", "owner-laptop.wsl2"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );

  const second = await suggestions.pullLocalJob("owner-laptop.wsl2");
  assert.equal(second?.job.attemptId, "attempt-2");
  await assert.rejects(
    () => suggestions.renewLocalSourceAuthorization(job.id, "attempt-1", "owner-laptop.wsl2"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  await assert.rejects(
    () => suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", { status: "ambiguous" }), first!.capability.token),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  const secondResult = intelligentResult(job.id, "attempt-2", { status: "ambiguous" });
  const completed = await suggestions.applyComputeResult(secondResult, second!.capability.token);
  assert.equal(completed.state, "succeeded");
  assert.deepEqual(await suggestions.applyComputeResult(secondResult, second!.capability.token), completed);
});

test("Local Pull source renewal rechecks source fingerprint and requesting-account authority", async (context) => {
  const stale = fixture(context, { dispatcher: new LocalPullComputeDispatcher() });
  const staleJob = await stale.suggestions.requestGeneration(OWNER, stale.library.id, stale.fileId);
  await stale.suggestions.pullLocalJob("owner-laptop.wsl2");
  stale.database.prepare("UPDATE files SET revision = revision + 1 WHERE id = ?").run(stale.fileId);
  await assert.rejects(
    () => stale.suggestions.renewLocalSourceAuthorization(staleJob.id, "attempt-1", "owner-laptop.wsl2"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );

  const unauthorized = fixture(context, { dispatcher: new LocalPullComputeDispatcher() });
  const unauthorizedJob = await unauthorized.suggestions.requestGeneration(OWNER, unauthorized.library.id, unauthorized.fileId);
  await unauthorized.suggestions.pullLocalJob("owner-laptop.wsl2");
  assert.equal(unauthorized.persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", NOW), true);
  await assert.rejects(
    () => unauthorized.suggestions.renewLocalSourceAuthorization(unauthorizedJob.id, "attempt-1", "owner-laptop.wsl2"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
});

test("admission dispatch failure stays durable and the reconciler records one provider receipt", async (context) => {
  let calls = 0;
  const dispatcher: DerivedComputeDispatcher = {
    dispatch: async () => {
      calls += 1;
      if (calls === 1) throw new Error("provider hand-off unavailable");
      return { provider: "test", providerJobId: "provider-recovered" };
    },
  };
  const { persistence, library, fileId, suggestions } = fixture(context, { dispatcher });
  const queued = await suggestions.requestGeneration(OWNER, library.id, fileId, { origin: "admission" });
  assert.equal(queued.state, "queued");
  assert.equal(queued.origin, "admission");
  assert.equal(queued.queuePriority, 10);
  assert.equal(await suggestions.reconcileUndispatchedJobs(), 1);
  const recovered = persistence.repositories.derivedJobs.findById(queued.id)!;
  assert.equal(recovered.state, "queued");
  assert.equal(recovered.providerJobId, "provider-recovered");
  assert.equal(calls, 2);
});

test("ambiguous provider acceptance does not create a duplicate provider execution", async (context) => {
  const dispatcher = new DeferredDispatcher();
  const { persistence, library, fileId, suggestions } = fixture(context, { dispatcher });
  const request = suggestions.requestGeneration(OWNER, library.id, fileId, { origin: "admission" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(dispatcher.jobs.length, 1);
  assert.equal(await suggestions.reconcileUndispatchedJobs(), 0);
  dispatcher.resolve();
  const job = await request;
  assert.equal(persistence.repositories.derivedJobs.findById(job.id)?.providerJobId, "provider-deferred");
  assert.equal(dispatcher.jobs.length, 1);
  assert.equal(persistence.repositories.derivedJobs.findByIdempotencyKey(
    persistence.repositories.derivedJobs.findById(job.id)!.idempotencyKey,
  )?.id, job.id);
});

test("restart reconciliation preserves one provider execution across an accepted-dispatch receipt gap", async (context) => {
  const dispatcher = new AmbiguousRestartDispatcher();
  const first = fixture(context, { dispatcher });
  const queued = await first.suggestions.requestGeneration(OWNER, first.library.id, first.fileId, { origin: "admission" });
  assert.equal(queued.state, "queued");
  assert.equal(dispatcher.jobs.length, 1, "the first provider dispatch was accepted before receipt persistence");

  // A fresh service instance represents a Core restart: its in-process
  // dispatch guard is empty, but it shares the same durable SQLite state.
  const restarted = new SuggestionService({
    persistence: first.persistence,
    storage: first.storage,
    metadata: first.metadata,
    dispatcher,
    coreBaseUrl: "https://academiccloud.example",
    now: () => NOW,
    createId: ids("unused"),
    createToken: () => "job-capability-token",
  });
  assert.equal(await restarted.reconcileUndispatchedJobs(), 1);
  assert.equal(dispatcher.jobs.length, 2, "the restarted reconciler issued one recovery dispatch");
  assert.equal(dispatcher.providerExecutions, 1, "provider idempotency keeps the recovery at one execution");
  assert.equal(first.persistence.repositories.derivedJobs.findById(queued.id)?.providerJobId, "provider-attempt-1");

  // Both provider runs carry the same attempt identity. Core's conditional
  // queued -> running transition is the durable provider-execution gate.
  const claims = await Promise.allSettled([
    restarted.claimJob(queued.id, "attempt-1"),
    restarted.claimJob(queued.id, "attempt-1"),
  ]);
  assert.equal(claims.filter((claim) => claim.status === "fulfilled").length, 1);
  assert.equal(claims.filter((claim) => claim.status === "rejected").length, 1);
  assert.equal(first.persistence.repositories.derivedJobs.findById(queued.id)?.state, "running");
});

test("validated structured Qwen callback creates reviewable candidates without canonical writes", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  assert.equal(claim.job.id, job.id);
  assert.equal(claim.source.mediaType, "application/pdf");
  assert.match(claim.source.url, /^memory:\/\/download\//u);
  assert.equal(claim.callbackUrl, `https://academiccloud.example/api/internal/compute/jobs/${job.id}/result`);
  assert.equal(suggestions.getJob(OWNER, library.id, fileId, job.id).state, "running");

  const result = intelligentResult(job.id, "attempt-1", { status: "ambiguous" });
  const completed = await suggestions.applyComputeResult(result, claim.capability.token);
  assert.equal(completed.state, "succeeded");
  // Fast naming persists the lightweight run first, so the callback lands in a
  // second immutable run that supersedes it.
  assert.equal(completed.resultRef, `suggestion-${job.id}-computed`);
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);

  const run = suggestions.getLatest(MEMBER, library.id, fileId)!;
  assert.equal(run.status, "ready");
  assert.equal(run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value,
    "The Mongols and the West, 1221-1410");
  assert.equal(run.candidates.some((candidate) => candidate.sourceType === "filename"), false);
  assert.equal(run.aiBibliography?.displayTitle, "王明 近代中国史研究");
  assert.equal(run.aiBibliography?.canonical?.canonicalTitle, "近代中国史研究");
  assert.equal(run.aiBibliography?.canonical?.contributors[0]?.role, "author");
  assert.equal(run.aiBibliography?.fields.some((field) => field.fieldName === "canonicalTitle"), true);
  assert.equal(run.aiBibliography?.autoApplied, false);
  assert.equal(suggestions.getLatestCataloguingStates(OWNER, library.id, [fileId])[0]?.state, "ai_succeeded_reviewable");
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 2);

  const replay = await suggestions.applyComputeResult(result, claim.capability.token);
  assert.deepEqual(replay, completed);
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 2);
  await assert.rejects(
    () => suggestions.applyComputeResult({
      ...result,
      output: result.state === "succeeded" ? { ...result.output, status: "ambiguous" } : undefined,
    } as DerivedComputeResult, claim.capability.token),
    (error: unknown) => error instanceof SuggestionError && error.code === "concurrent_change",
  );
});

test("AI bibliography projection applies historical title-plus-version identity without person-prefix guessing", async (context) => {
  const { library, fileId, suggestions } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", {
    status: "ambiguous",
    title: "元朝秘史",
    materialClass: "primary_source_modern_edition",
    contributor: "亦邻真",
    contributorRole: "author",
    sourceEditionStatement: "明万历刻本",
  }), claim.capability.token);

  const run = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.equal(run.aiBibliography?.canonical?.materialClass, "primary_source_modern_edition");
  assert.equal(run.aiBibliography?.displayTitle, "元朝秘史 明万历刻本");
  assert.equal(run.aiBibliography?.editionStatement, "明万历刻本");
  assert.equal(run.aiBibliography?.displayTitle?.includes("亦邻真"), false);
});

test("filename candidates and extraction-only output cannot mark the AI pipeline succeeded", async (context) => {
  const { persistence, library, fileId, suggestions } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const fastRun = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.equal(fastRun.candidates.some((candidate) => candidate.sourceType === "filename"), true);
  const claim = await suggestions.claimJob(job.id, "attempt-1");

  const failed = await suggestions.applyComputeResult(
    extractionOnlyResult(job.id, "attempt-1"),
    claim.capability.token,
  );
  assert.equal(failed.state, "failed");
  assert.equal(failed.errorCode, "compute_invalid_result");
  assert.equal(failed.resultRef, null);
  assert.equal(suggestions.getLatestCataloguingStates(OWNER, library.id, [fileId])[0]?.state, "failed");
  assert.equal(suggestions.getLatest(OWNER, library.id, fileId)?.id, fastRun.id);
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 1);

  const replay = await suggestions.applyComputeResult(extractionOnlyResult(job.id, "attempt-1"), claim.capability.token);
  assert.deepEqual(replay, failed);
  const retry = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(retry.state, "queued");
  assert.equal(retry.attempts, 2);
});

test("safe intelligent callback auto-applies canonical defaults, exact-binds one person, and retains immutable provenance", async (context) => {
  const { database, persistence, library, fileId, suggestions, metadata } = fixture(context);
  const authority = metadata.createAuthority(OWNER, library.id, { type: "person", canonicalLabel: "王明", aliases: [] });
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  const completed = await suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1"), claim.capability.token);
  assert.equal(completed.state, "succeeded");

  const detail = metadata.getDetails(OWNER, library.id, fileId);
  assert.equal(detail.metadata?.canonicalTitle, "近代中国史研究");
  assert.equal(detail.bibliography?.materialClass, "scholarly_monograph");
  assert.deepEqual(detail.bibliography?.contributors, [{ id: "attempt-2", label: "王明", role: "author", authorityId: authority.id }]);
  assert.ok(detail.fieldAuthorities.every((field) => field.source === "ai"));
  assert.equal(suggestions.getLatestCataloguingStates(OWNER, library.id, [fileId])[0]?.state, "applied");
  const evidence = persistence.repositories.bibliography.findAiRunEvidence(library.ownerDomainId, `bibliography-${job.id}`)!;
  assert.equal(evidence.status, "auto_apply");
  assert.equal(evidence.rulesetVersion, "l1-intelligent-library01-v3");
  assert.equal(evidence.promptVersion, "l1-intelligent-library01-prompt-v3");
  assert.equal(evidence.autoApplied, true);
  assert.ok(evidence.appliedFields.some((field) => field.fieldName === "canonicalTitle"));
  assert.equal(evidence.structuredOutputJson.includes("近代中国史研究"), true);
  assert.equal(evidence.structuredOutputJson.includes("rawText"), false);
  assert.throws(
    () => database.prepare("UPDATE scholarly_bibliographic_ai_runs SET overall_confidence = 99 WHERE id = ?").run(evidence.id),
    /bibliographic AI evidence is immutable/,
  );
  assert.throws(
    () => database.prepare("DELETE FROM scholarly_bibliographic_ai_runs WHERE id = ?").run(evidence.id),
    /bibliographic AI evidence is retained/,
  );
});

test("structured ambiguous AI evidence is reviewable while extraction alone is not", async (context) => {
  const { library, fileId, suggestions } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await suggestions.applyComputeResult(
    intelligentResult(job.id, "attempt-1", { status: "ambiguous" }),
    claim.capability.token,
  );
  const state = suggestions.getLatestCataloguingStates(OWNER, library.id, [fileId])[0];
  assert.equal(state?.job?.resultRef, `suggestion-${job.id}-computed`);
  assert.equal(state?.state, "ai_succeeded_reviewable");
});

test("intelligent callback preserves human fields while filling only unprotected defaults", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  const withTitle = metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, {
    materialType: "book",
    canonicalTitle: "人工题名",
    alternativeTitles: [],
    identifiers: [],
    typeFields: {},
    authorityLinks: [],
  });
  metadata.updateBibliography(OWNER, library.id, fileId, withTitle.bibliographyVersion, {
    materialClass: "edited_volume",
    contributors: [{ label: "人工编者", role: "editor" }],
    publication: {},
    carrierEdition: {},
    sourceEdition: {},
  });
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", {
    title: "AI 题名",
    materialClass: "scholarly_monograph",
    contributor: "AI 作者",
    publisher: "学术出版社",
  }), claim.capability.token);

  const detail = metadata.getDetails(OWNER, library.id, fileId);
  assert.equal(detail.metadata?.canonicalTitle, "人工题名");
  assert.equal(detail.bibliography?.materialClass, "edited_volume");
  assert.deepEqual(detail.bibliography?.contributors.map((entry) => [entry.label, entry.role]), [["人工编者", "editor"]]);
  assert.equal(detail.bibliography?.publication.publisher, "学术出版社");
  const authorities = persistence.repositories.bibliography.listFieldAuthorities(library.ownerDomainId, "suggestion-record");
  assert.equal(authorities.find((entry) => entry.fieldName === "canonicalTitle")?.source, "human");
  assert.equal(authorities.find((entry) => entry.fieldName === "materialClass")?.source, "human");
  assert.equal(authorities.find((entry) => entry.fieldName === "publication.publisher")?.source, "ai");
});

test("AI treats pre-authority canonical metadata as preserved legacy truth instead of permission to overwrite", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const saved = persistence.repositories.metadata.saveMetadata({
    recordId: "suggestion-record",
    ownerDomainId: library.ownerDomainId,
    actorAccountId: OWNER.id,
    expectedRevision: null,
    now: NOW,
    materialType: "article",
    canonicalTitle: "迁移前既有题名",
    alternativeTitles: ["既有异名"],
    identifiers: [],
    typeFields: {},
    authorityLinks: [],
  });
  assert.ok(saved);
  assert.deepEqual(persistence.repositories.bibliography.listFieldAuthorities(library.ownerDomainId, "suggestion-record"), []);

  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", {
    title: "AI 新题名",
    materialClass: "scholarly_monograph",
    publisher: "学术出版社",
  }), claim.capability.token);

  const detail = metadata.getDetails(OWNER, library.id, fileId);
  assert.equal(detail.metadata?.canonicalTitle, "迁移前既有题名");
  assert.equal(detail.metadata?.materialType, "article");
  assert.deepEqual(detail.metadata?.alternativeTitles, ["既有异名"]);
  assert.equal(detail.bibliography?.publication.publisher, "学术出版社");
  const authorities = persistence.repositories.bibliography.listFieldAuthorities(library.ownerDomainId, "suggestion-record");
  assert.equal(authorities.some((entry) => entry.fieldName === "canonicalTitle"), false);
  assert.equal(authorities.find((entry) => entry.fieldName === "publication.publisher")?.source, "ai");
});

test("callback capability and attempt identity fail closed", async (context) => {
  const { library, fileId, suggestions } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await assert.rejects(
    () => suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", { status: "ambiguous" }), "wrong-token"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  await assert.rejects(
    () => suggestions.applyComputeResult(intelligentResult(job.id, "wrong-attempt", { status: "ambiguous" }), claim.capability.token),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
});

test("stable Compute failures and durable deadlines terminate the job safely", async (context) => {
  let current = new Date(NOW);
  const { library, fileId, suggestions } = fixture(context, { now: () => current });
  const first = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(first.id, "attempt-1");
  const failed = await suggestions.applyComputeResult({
    jobId: first.id,
    attemptId: "attempt-1",
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_invalid_pdf",
  }, claim.capability.token);
  assert.equal(failed.state, "failed");
  assert.equal(failed.errorCode, "compute_invalid_pdf");
  assert.deepEqual(await suggestions.applyComputeResult({
    jobId: first.id,
    attemptId: "attempt-1",
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_invalid_pdf",
  }, claim.capability.token), failed);
  await assert.rejects(() => suggestions.applyComputeResult({
    jobId: first.id,
    attemptId: "attempt-1",
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_internal_error",
  }, claim.capability.token), (error: unknown) => error instanceof SuggestionError && error.code === "concurrent_change");

  const retried = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(retried.id, first.id);
  assert.equal(retried.attempts, 2);
  assert.equal(retried.state, "queued");
  current = new Date(NOW.getTime() + 121 * 60_000);
  assert.equal(suggestions.expireDueJobs(), 1);
  const timedOut = suggestions.getJob(OWNER, library.id, fileId, first.id);
  assert.equal(timedOut.state, "failed");
  assert.equal(timedOut.errorCode, "compute_timeout");
});

test("manager acceptance preserves RF-META01 authority and private overlays", async (context) => {
  const { database, library, fileId, suggestions, metadata } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", { status: "ambiguous" }), claim.capability.token);
  const run = suggestions.getLatest(OWNER, library.id, fileId)!;
  const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")!;
  const detail = metadata.getDetails(OWNER, library.id, fileId);

  await assert.rejects(
    () => suggestions.accept(MEMBER, library.id, fileId, run.id, {
      acceptedCandidateIds: [title.id],
      metadataVersion: detail.metadataVersion,
      metadata: {
        materialType: "book",
        canonicalTitle: title.value,
        alternativeTitles: [],
        identifiers: [],
        typeFields: {},
        authorityLinks: [],
      },
    }),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );

  const favoriteBefore = database.prepare<[string, string], { account_id: string }>(
    "SELECT account_id FROM favorite_files WHERE account_id = ? AND file_id = ?",
  ).get(MEMBER.id, fileId);
  const accepted = await suggestions.accept(OWNER, library.id, fileId, run.id, {
    acceptedCandidateIds: [title.id],
    metadataVersion: detail.metadataVersion,
    metadata: {
      materialType: "book",
      canonicalTitle: title.value,
      alternativeTitles: [],
      identifiers: [],
      typeFields: {},
      authorityLinks: [],
    },
  });
  assert.equal(accepted.detail.metadata?.canonicalTitle, title.value);
  assert.equal(accepted.run.status, "accepted");
  assert.deepEqual(database.prepare<[string, string], { account_id: string }>(
    "SELECT account_id FROM favorite_files WHERE account_id = ? AND file_id = ?",
  ).get(MEMBER.id, fileId), favoriteBefore);
});

test("dispatch failure is bounded and reported as a stable job failure", async (context) => {
  const dispatcher: DerivedComputeDispatcher = {
    dispatch: async () => { throw new Error("provider unavailable"); },
  };
  const { library, fileId, suggestions } = fixture(context, { dispatcher });
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(job.state, "failed");
  assert.equal(job.errorCode, "compute_dispatch_failed");
});

test("fast naming persists the lightweight run before Compute completes and is idempotent", async (context) => {
  const { persistence, library, fileId, suggestions } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(job.state, "queued");
  const run = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.ok(run, "lightweight run exists before any Compute claim");
  assert.equal(run.id, `suggestion-${job.id}`);
  assert.equal(run.status, "ready");
  const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle");
  assert.ok(title, "filename-derived title candidate is immediately reviewable");
  assert.equal(title!.sourceType, "filename");
  assert.equal(title!.confidence, "low");
  // Repeated request stays idempotent: same job, same run, no duplicates.
  const duplicate = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.deepEqual(duplicate, job);
  assert.equal(suggestions.getLatest(OWNER, library.id, fileId)!.id, run.id);
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 1);
});

test("fast naming keeps junk filenames low/no-confidence instead of fabricating titles", async (context) => {
  const { database, library, suggestions } = fixture(context);
  // A second file with an explicit junk name.
  const junkId = "suggestion-junk-file";
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(junkId, library.ownerDomainId, MEMBER.id, "unknown.pdf", `objects/aa/${"c".repeat(62)}`, 4, "1B2M2Y8AsgTpgAmY7PhCfg==", timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("suggestion-junk-record", library.ownerDomainId, MEMBER.id, "junk", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run("suggestion-junk-artifact", library.ownerDomainId, "suggestion-junk-record", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("suggestion-junk-version", library.ownerDomainId, "suggestion-junk-artifact", junkId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run("suggestion-junk-artifact");
  const job = await suggestions.requestGeneration(OWNER, library.id, junkId);
  const run = suggestions.getLatest(OWNER, library.id, junkId)!;
  assert.equal(run.status, "no_suggestions");
  assert.equal(run.candidates.length, 0);
  void job;
});

test("later OCR candidates supersede the fast run with a second immutable evidence run", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const fastRun = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.ok(fastRun.candidates.some((candidate) => candidate.sourceType === "filename"));

  const claim = await suggestions.claimJob(job.id, "attempt-1");
  const result = intelligentResult(job.id, "attempt-1", { status: "ambiguous" });
  await suggestions.applyComputeResult(result, claim.capability.token);

  const latest = suggestions.getLatest(MEMBER, library.id, fileId)!;
  assert.equal(latest.id, `suggestion-${job.id}-computed`, "the callback persists a second immutable run that supersedes the fast run");
  assert.notEqual(latest.id, fastRun.id);
  assert.equal(latest.status, "ready");
  assert.equal(latest.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value,
    "The Mongols and the West, 1221-1410");
  assert.equal(latest.candidates.some((candidate) => candidate.sourceType === "filename"), false);
  assert.equal(latest.window.complete, true);
  // Both runs remain as append-only evidence; the fast run is untouched.
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 2);
  const fastRunAfter = persistence.repositories.suggestions.findRun(library.ownerDomainId, fastRun.id)!;
  assert.equal(fastRunAfter.status, "ready");
  assert.equal(fastRunAfter.window.complete, false);
  assert.equal(fastRunAfter.candidates.length, fastRun.candidates.length);
  // Nothing was silently written to canonical metadata.
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);
});

test("an accepted fast run is frozen and later OCR cannot silently rewrite it", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const fastRun = suggestions.getLatest(OWNER, library.id, fileId)!;
  const title = fastRun.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")!;
  const detail = metadata.getDetails(OWNER, library.id, fileId);
  await suggestions.accept(OWNER, library.id, fileId, fastRun.id, {
    acceptedCandidateIds: [title.id],
    metadataVersion: detail.metadataVersion,
    metadata: {
      materialType: "book",
      canonicalTitle: title.value,
      alternativeTitles: [],
      identifiers: [],
      typeFields: {},
      authorityLinks: [],
    },
  });
  const accepted = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.equal(accepted.status, "accepted");
  const candidateIdsBefore = accepted.candidates.map((candidate) => candidate.id).sort();

  const claim = await suggestions.claimJob(job.id, "attempt-1");
  const completed = await suggestions.applyComputeResult(intelligentResult(job.id, "attempt-1", { status: "ambiguous" }), claim.capability.token);
  assert.equal(completed.state, "succeeded");
  const after = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.equal(after.id, `suggestion-${job.id}-computed`);
  assert.equal(after.status, "ready");
  const acceptedAfter = persistence.repositories.suggestions.findRun(library.ownerDomainId, accepted.id)!;
  assert.equal(acceptedAfter.status, "accepted", "accepted evidence stays frozen");
  assert.deepEqual(acceptedAfter.candidates.map((candidate) => candidate.id).sort(), candidateIdsBefore);
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata?.canonicalTitle, title.value);
});

test("a changed source marks the fast run stale and fails closed", async (context) => {
  const { database, library, fileId, suggestions } = fixture(context);
  await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(suggestions.getLatest(OWNER, library.id, fileId)!.status, "ready");
  database.prepare("UPDATE files SET revision = 1 WHERE id = ?").run(fileId);
  assert.equal(suggestions.getLatest(OWNER, library.id, fileId)!.status, "stale");
});

function seedAdditionalHolding(
  database: ReturnType<typeof fixture>["database"],
  libraryDomainId: string,
  fileId: string,
  displayName: string,
  sizeBytes: number,
  prefix: string,
): void {
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, libraryDomainId, MEMBER.id, displayName, `objects/bb/${prefix.padEnd(62, "x")}`, sizeBytes, "1B2M2Y8AsgTpgAmY7PhCfg==", timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`${fileId}-record`, libraryDomainId, MEMBER.id, displayName, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(`${fileId}-artifact`, libraryDomainId, `${fileId}-record`, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`${fileId}-version`, libraryDomainId, `${fileId}-artifact`, fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(`${fileId}-artifact`);
}

test("batch naming preview reports proposals, confidence, and unavailable items", async (context) => {
  const { database, library, suggestions } = fixture(context);
  seedAdditionalHolding(database, library.ownerDomainId, "batch-structured", "张帆《元代宰相制度研究》（北京大学出版社1997）.pdf", 10, "batch-structured");
  seedAdditionalHolding(database, library.ownerDomainId, "batch-bare", "历史研究西域论文辑.pdf", 12, "batch-bare");
  const preview = suggestions.previewBatchNaming(OWNER, library.id, ["batch-structured", "batch-bare", "missing-file"]);
  assert.equal(preview.items.length, 3);
  const structured = preview.items.find((item) => item.fileId === "batch-structured")!;
  assert.equal(structured.status, "available");
  assert.equal(structured.proposedTitle, "元代宰相制度研究");
  assert.equal(structured.proposedConfidence, "medium");
  const bare = preview.items.find((item) => item.fileId === "batch-bare")!;
  assert.equal(bare.status, "available");
  assert.equal(bare.proposedTitle, "历史研究西域论文辑");
  assert.equal(bare.proposedConfidence, "low");
  assert.equal(preview.items.find((item) => item.fileId === "missing-file")!.status, "unavailable");
  // OCR is never required for the preview.
  assert.equal(suggestions.getLatest(OWNER, library.id, "batch-structured"), null);
});

test("batch naming applies a mixed subset with per-item isolation and reload persistence", async (context) => {
  const { database, library, suggestions, metadata } = fixture(context);
  seedAdditionalHolding(database, library.ownerDomainId, "batch-ok", "《学术云合成测试文献》.pdf", 10, "batch-ok");
  seedAdditionalHolding(database, library.ownerDomainId, "batch-stale", "《圣武亲征录》.pdf", 12, "batch-stale");
  const preview = suggestions.previewBatchNaming(OWNER, library.id, ["batch-ok", "batch-stale"]);
  const ok = preview.items.find((item) => item.fileId === "batch-ok")!;
  const stale = preview.items.find((item) => item.fileId === "batch-stale")!;
  // A conflicting version plus a stale source must not corrupt the applied item.
  const results = suggestions.applyBatchNaming(OWNER, library.id, [
    { fileId: ok.fileId, metadataVersion: ok.metadataVersion, sourceVersion: ok.sourceVersion, canonicalTitle: "学术云合成测试文献", materialType: "book" },
    { fileId: stale.fileId, metadataVersion: "b".repeat(43), sourceVersion: stale.sourceVersion, canonicalTitle: "圣武亲征录", materialType: "book" },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0]!.status, "applied");
  assert.equal(results[1]!.status, "conflict");
  // The applied title is durable: a fresh details read sees the canonical title.
  const detail = metadata.getDetails(OWNER, library.id, ok.fileId);
  assert.equal(detail.metadata?.canonicalTitle, "学术云合成测试文献");
  assert.equal(detail.metadata?.materialType, "book");
  // The stale item remains untouched.
  assert.equal(metadata.getDetails(OWNER, library.id, stale.fileId).metadata, null);
});

test("batch naming fails closed for a stale source and non-managers", async (context) => {
  const { database, library, suggestions } = fixture(context);
  seedAdditionalHolding(database, library.ownerDomainId, "batch-stale2", "《测试文献》.pdf", 10, "batch-stale2");
  const preview = suggestions.previewBatchNaming(OWNER, library.id, ["batch-stale2"]);
  const item = preview.items[0]!;
  const results = suggestions.applyBatchNaming(OWNER, library.id, [
    { fileId: item.fileId, metadataVersion: item.metadataVersion, sourceVersion: "a".repeat(43), canonicalTitle: "测试文献", materialType: "book" },
  ]);
  assert.equal(results[0]!.status, "stale");
  const memberResults = suggestions.applyBatchNaming(MEMBER, library.id, [
    { fileId: item.fileId, metadataVersion: item.metadataVersion, sourceVersion: item.sourceVersion, canonicalTitle: "测试文献", materialType: "book" },
  ]);
  assert.equal(memberResults[0]!.status, "not_found");
});
