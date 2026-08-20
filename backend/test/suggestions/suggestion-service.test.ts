import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type {
  DerivedComputeDispatchJob,
  DerivedComputeDispatcher,
  DerivedComputeResult,
} from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { SuggestionError, SuggestionService } from "../../src/suggestions/suggestion-service.js";
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

function ids(...values: string[]): () => string {
  let position = 0;
  return () => values[position++] ?? `generated-${position}`;
}

function successfulResult(jobId: string, attemptId: string): DerivedComputeResult {
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
        rulesetVersion: "rf-frontmatterocr-v1",
      }],
    },
  };
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
  const { library, fileId, suggestions, dispatcher } = fixture(context);
  const first = await suggestions.requestGeneration(OWNER, library.id, fileId);
  assert.equal(first.id, "job-1");
  assert.equal(first.state, "queued");
  assert.equal(first.attempts, 1);
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
});

test("Compute claim and callback create reviewable candidates without canonical writes", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  assert.equal(claim.job.id, job.id);
  assert.equal(claim.source.mediaType, "application/pdf");
  assert.match(claim.source.url, /^memory:\/\/download\//u);
  assert.equal(claim.callbackUrl, `https://academiccloud.example/api/internal/compute/jobs/${job.id}/result`);
  assert.equal(suggestions.getJob(OWNER, library.id, fileId, job.id).state, "running");

  const result = successfulResult(job.id, "attempt-1");
  const completed = await suggestions.applyComputeResult(result, claim.capability.token);
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.resultRef, `suggestion-${job.id}`);
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);

  const run = suggestions.getLatest(MEMBER, library.id, fileId)!;
  assert.equal(run.status, "ready");
  assert.equal(run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value,
    "The Mongols and the West, 1221-1410");
  assert.equal(run.candidates.some((candidate) => candidate.sourceType === "filename"), false);
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 1);

  const replay = await suggestions.applyComputeResult(result, claim.capability.token);
  assert.deepEqual(replay, completed);
  assert.equal(persistence.repositories.suggestions.listRuns(library.ownerDomainId, library.id, fileId, 10).length, 1);
  await assert.rejects(
    () => suggestions.applyComputeResult({
      ...result,
      output: result.state === "succeeded" ? { ...result.output, status: "ambiguous" } : undefined,
    } as DerivedComputeResult, claim.capability.token),
    (error: unknown) => error instanceof SuggestionError && error.code === "concurrent_change",
  );
});

test("callback capability and attempt identity fail closed", async (context) => {
  const { library, fileId, suggestions } = fixture(context);
  const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
  const claim = await suggestions.claimJob(job.id, "attempt-1");
  await assert.rejects(
    () => suggestions.applyComputeResult(successfulResult(job.id, "attempt-1"), "wrong-token"),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  await assert.rejects(
    () => suggestions.applyComputeResult(successfulResult(job.id, "wrong-attempt"), claim.capability.token),
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
  await suggestions.applyComputeResult(successfulResult(job.id, "attempt-1"), claim.capability.token);
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
