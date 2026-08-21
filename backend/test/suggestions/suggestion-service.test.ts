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
  // Fast naming persists the lightweight run first, so the callback lands in a
  // second immutable run that supersedes it.
  assert.equal(completed.resultRef, `suggestion-${job.id}-computed`);
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);

  const run = suggestions.getLatest(MEMBER, library.id, fileId)!;
  assert.equal(run.status, "ready");
  assert.equal(run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value,
    "The Mongols and the West, 1221-1410");
  assert.equal(run.candidates.some((candidate) => candidate.sourceType === "filename"), false);
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
  const result = successfulResult(job.id, "attempt-1");
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
  const { library, fileId, suggestions, metadata } = fixture(context);
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
  const completed = await suggestions.applyComputeResult(successfulResult(job.id, "attempt-1"), claim.capability.token);
  assert.equal(completed.state, "succeeded");
  const after = suggestions.getLatest(OWNER, library.id, fileId)!;
  assert.equal(after.status, "accepted", "accepted evidence stays frozen");
  assert.deepEqual(after.candidates.map((candidate) => candidate.id).sort(), candidateIdsBefore);
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
