import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { DERIVED_COMPUTE_ERROR_CODES, type DerivedComputeDispatchJob, type DerivedComputeDispatcher, type DerivedComputeErrorCode } from "@academiccloud/compute-contracts";
import { catalogSourceIdentity } from "../../src/drive/source-identity.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { SuggestionError, SuggestionService } from "../../src/suggestions/suggestion-service.js";
import type { NewSuggestionRun } from "../../src/suggestions/suggestion.js";
import { RECOVERY_SOURCE_EXCLUSIONS } from "../../src/suggestions/recovery-source-exclusions.js";
import { fixture as workspaceFixture, MEMBER, NOW, OTHER, OWNER } from "../workspace/helpers.js";

function fixture(context: TestContext) {
  const f = workspaceFixture(context);
  for (const name of ["001_l1_intelligent_library01_v10.sql", "002_l1_intelligent_library01_v11.sql"]) {
    f.database.exec(readFileSync(new URL(`../../../database/ruleset-admissions/${name}`, import.meta.url), "utf8"));
  }
  const library = f.persistence.repositories.libraries.findDefault()!;
  const metadata = new CanonicalMetadataService(f.persistence);
  const dispatches: DerivedComputeDispatchJob[] = [];
  const dispatcher: DerivedComputeDispatcher = {
    async dispatch(job) { dispatches.push(job); return { provider: "test", providerJobId: `test-${job.attemptId}` }; },
  };
  const suggestions = new SuggestionService({ persistence: f.persistence, storage: f.storage, metadata, dispatcher,
    coreBaseUrl: "http://127.0.0.1", now: () => NOW });
  function add(fileId: string, mediaType = "application/pdf") { return f.file(fileId, OWNER.id, mediaType, library.id); }
  async function inputs(fileIds: string[]) {
    return (await suggestions.previewRecovery(OWNER, library.id, fileIds)).map((item) => ({
      fileId: item.fileId, sourceVersion: item.sourceVersion,
      expectedJobId: item.job?.id ?? null, expectedAttempts: item.job?.attempts ?? null,
    }));
  }
  async function failed(fileId: string, code: DerivedComputeErrorCode = "compute_source_unavailable") {
    const job = await suggestions.requestGeneration(OWNER, library.id, fileId);
    const row = f.persistence.repositories.derivedJobs.findById(job.id)!;
    return f.persistence.repositories.derivedJobs.fail(row.id, row.activeAttemptId!, code, NOW)!;
  }
  function jobs() { return f.database.prepare("SELECT * FROM derived_compute_jobs ORDER BY id").all(); }
  return { ...f, library, metadata, suggestions, dispatches, dispatcher, add, inputs, failed, jobs };
}

test("recovery preview is read-only and missing work commits one durable queue identity without dispatch or extraction", async (context) => {
  const f = fixture(context);
  f.add("missing");
  const before = f.jobs();
  const preview = await f.suggestions.previewRecovery(OWNER, f.library.id, ["missing"]);
  assert.equal(preview[0]?.status, "missing");
  assert.equal(preview[0]?.job, null);
  assert.deepEqual(f.jobs(), before);
  const selected = await f.inputs(["missing"]);
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, selected);
  assert.equal(results[0]?.status, "queued");
  assert.equal(results[0]?.job?.state, "queued");
  assert.equal(results[0]?.job?.origin, "backfill");
  assert.equal(results[0]?.job?.queuePriority, 100);
  assert.equal(f.jobs().length, 1);
  assert.equal(f.dispatches.length, 0);
  assert.equal(f.suggestions.getLatest(OWNER, f.library.id, "missing"), null);
  const replay = await f.suggestions.recoverSelected(OWNER, f.library.id, selected);
  assert.equal(replay[0]?.status, "stale");
  assert.equal(f.jobs().length, 1);
  assert.equal(f.persistence.repositories.derivedJobs.findById(results[0]!.job!.id)?.attempts, 1);
});

test("a lost missing-work response cannot replay a fast failure into a second attempt", async (context) => {
  const f = fixture(context);
  f.add("missing");
  const selected = await f.inputs(["missing"]);
  const first = (await f.suggestions.recoverSelected(OWNER, f.library.id, selected))[0]!;
  const row = f.persistence.repositories.derivedJobs.findById(first.job!.id)!;
  f.persistence.repositories.derivedJobs.fail(row.id, row.activeAttemptId!, "compute_source_unavailable", NOW);
  const replay = await f.suggestions.recoverSelected(OWNER, f.library.id, selected);
  assert.equal(replay[0]?.status, "stale");
  assert.equal(f.persistence.repositories.derivedJobs.findById(row.id)?.attempts, 1);
  assert.equal(f.jobs().length, 1);
});

test("retry snapshot increments exactly once, preserves priority, and rejects old attempt authority after a quick failure", async (context) => {
  const f = fixture(context);
  f.add("retry");
  const old = await f.failed("retry");
  const selected = await f.inputs(["retry"]);
  assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, ["retry"]))[0]?.status, "retryable");
  const calls = f.dispatches.length;
  const first = (await f.suggestions.recoverSelected(OWNER, f.library.id, selected))[0]!;
  assert.equal(first.status, "retried");
  assert.equal(first.job?.id, old.id);
  assert.equal(first.job?.attempts, 2);
  assert.equal(first.job?.queuePriority, old.queuePriority);
  assert.equal(f.dispatches.length, calls);
  const current = f.persistence.repositories.derivedJobs.findById(old.id)!;
  assert.notEqual(current.activeAttemptId, old.activeAttemptId);
  await assert.rejects(() => f.suggestions.claimJob(old.id, old.activeAttemptId!), SuggestionError);
  f.persistence.repositories.derivedJobs.fail(current.id, current.activeAttemptId!, "compute_source_unavailable", NOW);
  assert.equal((await f.suggestions.recoverSelected(OWNER, f.library.id, selected))[0]?.status, "stale");
  assert.equal(f.persistence.repositories.derivedJobs.findById(old.id)?.attempts, 2);
});

test("two concurrent submissions of one snapshot produce only one queued job", async (context) => {
  const f = fixture(context);
  f.add("concurrent");
  const selected = await f.inputs(["concurrent"]);
  const outcomes = await Promise.all([
    Promise.resolve().then(() => f.suggestions.recoverSelected(OWNER, f.library.id, selected)),
    Promise.resolve().then(() => f.suggestions.recoverSelected(OWNER, f.library.id, selected)),
  ]);
  assert.deepEqual(outcomes.map((items) => items[0]?.status).sort(), ["queued", "stale"]);
  assert.equal(f.jobs().length, 1);
});

test("recovery only retries the two explicit transport or dispatch failure codes", async (context) => {
  const f = fixture(context);
  for (const code of DERIVED_COMPUTE_ERROR_CODES) { f.add(code); await f.failed(code, code); }
  const ids = [...DERIVED_COMPUTE_ERROR_CODES];
  const preview = await f.suggestions.previewRecovery(OWNER, f.library.id, ids);
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(ids));
  for (const [index, code] of ids.entries()) {
    const allowed = code === "compute_dispatch_failed" || code === "compute_source_unavailable";
    assert.equal(preview[index]?.status, allowed ? "retryable" : "not_retryable", code);
    assert.equal(results[index]?.status, allowed ? "retried" : "not_retryable", code);
    assert.equal(results[index]?.job?.attempts, allowed ? 2 : 1, code);
  }
});

test("an exhausted hundredth attempt is skipped without rolling back an eligible missing resource", async (context) => {
  const f = fixture(context);
  f.add("exhausted"); f.add("missing");
  const exhausted = await f.failed("exhausted");
  f.database.prepare("UPDATE derived_compute_jobs SET attempts = 100 WHERE id = ?").run(exhausted.id);
  const before = f.persistence.repositories.derivedJobs.findById(exhausted.id);
  const ids = ["exhausted", "missing"];
  assert.deepEqual((await f.suggestions.previewRecovery(OWNER, f.library.id, ids)).map((item) => item.status),
    ["not_retryable", "missing"]);
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(ids));
  assert.deepEqual(results.map((item) => item.status), ["not_retryable", "queued"]);
  assert.equal(results[0]?.job?.attempts, 100);
  assert.equal(results[1]?.job?.attempts, 1);
  assert.deepEqual(f.persistence.repositories.derivedJobs.findById(exhausted.id), before);
  assert.equal(f.jobs().length, 2);
  assert.equal(f.dispatches.length, 1, "recovery must not dispatch either selected item");
});

test("queued, running and succeeded jobs remain unchanged even when their pipeline key is historical", async (context) => {
  const f = fixture(context);
  for (const state of ["queued", "running", "succeeded"] as const) {
    f.add(state);
    const job = await f.suggestions.requestGeneration(OWNER, f.library.id, state);
    const row = f.persistence.repositories.derivedJobs.findById(job.id)!;
    if (state !== "queued") {
      f.persistence.repositories.derivedJobs.claim(row.id, row.activeAttemptId!, "a".repeat(64), new Date(NOW.getTime() + 60_000), NOW);
      if (state === "succeeded") f.persistence.repositories.derivedJobs.succeed(row.id, row.activeAttemptId!,
        f.suggestions.getLatest(OWNER, f.library.id, state)!.id, "b".repeat(64), NOW);
    }
    f.database.prepare("UPDATE derived_compute_jobs SET idempotency_key = ? WHERE id = ?")
      .run(`historical-${state}`.padEnd(64, "0"), job.id);
  }
  const ids = ["queued", "running", "succeeded"];
  const before = f.jobs();
  const preview = await f.suggestions.previewRecovery(OWNER, f.library.id, ids);
  assert.deepEqual(preview.map((item) => item.status), ["active", "active", "succeeded"]);
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(ids));
  assert.deepEqual(results.map((item) => item.status), ["active", "active", "succeeded"]);
  assert.deepEqual(f.jobs(), before);
});

test("an older success remains protected when a newer failed job is the current projection", async (context) => {
  const f = fixture(context);
  f.add("history");
  const previous = await f.suggestions.requestGeneration(OWNER, f.library.id, "history");
  const old = f.persistence.repositories.derivedJobs.findById(previous.id)!;
  f.persistence.repositories.derivedJobs.claim(old.id, old.activeAttemptId!, "a".repeat(64), new Date(NOW.getTime() + 60_000), NOW);
  f.persistence.repositories.derivedJobs.succeed(old.id, old.activeAttemptId!,
    f.suggestions.getLatest(OWNER, f.library.id, "history")!.id, "b".repeat(64), NOW);
  f.database.prepare("UPDATE derived_compute_jobs SET idempotency_key = ? WHERE id = ?")
    .run("previous-pipeline".padEnd(64, "0"), old.id);
  const latest = await f.failed("history");
  f.database.prepare("UPDATE derived_compute_jobs SET created_at = ?, updated_at = ? WHERE id = ?")
    .run(new Date(NOW.getTime() + 1).toISOString(), new Date(NOW.getTime() + 1).toISOString(), latest.id);
  assert.equal(f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", f.library.id, "history")?.id, latest.id);
  const before = f.jobs();
  assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, ["history"]))[0]?.status, "review_available");
  assert.equal((await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(["history"])))[0]?.status, "review_available");
  assert.deepEqual(f.jobs(), before);
});

test("changed source snapshots, old pipeline failures and different requesters cannot be recovered", async (context) => {
  const f = fixture(context);
  for (const id of ["renamed", "pipeline", "requester"]) { f.add(id); await f.failed(id); }
  const selected = await f.inputs(["renamed", "pipeline", "requester"]);
  f.database.prepare("UPDATE files SET display_name = 'changed.pdf', revision = revision + 1 WHERE id = 'renamed'").run();
  f.database.prepare("UPDATE derived_compute_jobs SET idempotency_key = ? WHERE resource_id = 'pipeline'").run("old-pipeline".padEnd(64, "0"));
  f.database.prepare("UPDATE derived_compute_jobs SET created_by_account_id = ? WHERE resource_id = 'requester'").run(OTHER.id);
  const before = f.jobs();
  const preview = await f.suggestions.previewRecovery(OWNER, f.library.id, ["renamed", "pipeline", "requester"]);
  assert.deepEqual(preview.map((item) => item.status), ["source_changed", "source_changed", "requester_changed"]);
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, selected);
  assert.equal(results[0]?.status, "stale");
  assert.equal(results[1]?.status, "source_changed");
  assert.equal(results[2]?.status, "requester_changed");
  assert.deepEqual(f.jobs(), before);
});

test("fresh metadata, an explicit empty human contributor list and private reading state survive recovery selection", async (context) => {
  const f = fixture(context);
  const source = f.add("human");
  f.add("missing");
  const before = f.metadata.getDetails(OWNER, f.library.id, "human");
  f.metadata.updateBibliography(OWNER, f.library.id, "human", before.bibliographyVersion, {
    materialClass: "unknown", contributors: [], publication: {}, carrierEdition: {}, sourceEdition: {},
  });
  f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "reading", important: true, toCite: true, revision: 0 });
  f.workspace.createNote(MEMBER.id, { ...source, physicalPage: 1, locator: null, body: "private-recovery-sentinel" });
  const detail = f.metadata.getDetails(OWNER, f.library.id, "human");
  const reading = f.workspace.reading(MEMBER.id);
  const notes = f.workspace.notes(MEMBER.id, {});
  assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, ["human"]))[0]?.status, "review_available");
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(["missing", "human"]));
  assert.deepEqual(results.map((item) => item.status), ["queued", "review_available"]);
  assert.deepEqual(f.metadata.getDetails(OWNER, f.library.id, "human"), detail);
  assert.deepEqual(f.workspace.reading(MEMBER.id), reading);
  assert.deepEqual(f.workspace.notes(MEMBER.id, {}), notes);
  assert.equal(f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", f.library.id, "human"), null);
});

test("accepted or extracted existing evidence is reviewable while filename-only evidence permits missing-job recovery", async (context) => {
  const f = fixture(context);
  for (const id of ["accepted", "extracted", "filename"]) {
    f.add(id);
    const file = f.persistence.repositories.files.findByDomainId(`library:${f.library.id}`, id)!;
    const source = catalogSourceIdentity(file);
    f.persistence.repositories.suggestions.createRun({
      id: `evidence-${id}`, ownerDomainId: f.library.ownerDomainId, libraryId: f.library.id,
      recordId: `record-${id}`, fileId: id,
      sourceFingerprint: { value: source.sourceFingerprint, fileRevision: source.fileRevision,
        checksumAlgorithm: source.checksumAlgorithm, checksum: source.checksum },
      status: id === "accepted" ? "accepted" : "ready",
      window: { firstPages: 15, lastPages: 5, pageCount: id === "extracted" ? 2 : null,
        pageIndices: id === "extracted" ? [1, 2] : [], complete: id === "extracted" },
      createdByAccountId: OWNER.id, createdAt: NOW, candidates: id === "filename" ? [{
        position: 0, fieldPath: "canonicalTitle", typeFieldName: null, authorityType: null, authorityRole: null,
        identifierScheme: null, value: "Historical filename inference", sourceType: "filename", sourcePageIndex: null,
        pageClass: null, confidence: "low", precedenceRank: 100, evidenceExcerpt: null, evidenceOrigin: "filename",
        ocrEngine: null, ocrConfidence: null, rulesetVersion: "rf-frontmatterocr-v2",
      }] : [],
    });
  }
  const ids = ["accepted", "extracted", "filename"];
  assert.deepEqual((await f.suggestions.previewRecovery(OWNER, f.library.id, ids)).map((item) => item.status),
    ["review_available", "review_available", "missing"]);
  assert.deepEqual((await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(ids))).map((item) => item.status),
    ["review_available", "review_available", "queued"]);
});

for (const historicalEvidence of ["accepted", "extracted", "ai_reviewable"] as const) {
  test(`older ${historicalEvidence} evidence hidden by a newer filename-only run blocks missing-job recovery`, async (context) => {
    const f = fixture(context);
    const fileId = `history-${historicalEvidence}`;
    f.add(fileId);
    const file = f.persistence.repositories.files.findByDomainId(f.library.ownerDomainId, fileId)!;
    const identity = catalogSourceIdentity(file);
    const historical: NewSuggestionRun = {
      id: `old-${historicalEvidence}`, ownerDomainId: f.library.ownerDomainId, libraryId: f.library.id,
      recordId: `record-${fileId}`, fileId,
      sourceFingerprint: { value: identity.sourceFingerprint, fileRevision: identity.fileRevision,
        checksumAlgorithm: identity.checksumAlgorithm, checksum: identity.checksum },
      status: historicalEvidence === "accepted" ? "accepted" : "ready",
      window: { firstPages: 15, lastPages: 5, pageCount: null, pageIndices: [], complete: false },
      createdByAccountId: OWNER.id, createdAt: NOW,
      candidates: historicalEvidence === "extracted" ? [{
        position: 0, fieldPath: "canonicalTitle", typeFieldName: null, authorityType: null, authorityRole: null,
        identifierScheme: null, value: "Earlier extracted title", sourceType: "title_page", sourcePageIndex: 1,
        pageClass: "title_page", confidence: "medium", precedenceRank: 10, evidenceExcerpt: "Earlier extracted title",
        evidenceOrigin: "native_text", ocrEngine: null, ocrConfidence: null, rulesetVersion: "rf-frontmatterocr-v2",
      }] : [],
    };
    f.persistence.repositories.suggestions.createRun(historical);
    if (historicalEvidence === "ai_reviewable") {
      // A stored, unapplied AI-review marker is independently sufficient; this
      // projection test neither executes a model nor accepts bibliographic data.
      const structuredOutputJson = JSON.stringify({ synthetic: "retained historical evidence" });
      f.persistence.repositories.bibliography.createAiRunEvidence({
        id: `ai-${fileId}`, ownerDomainId: f.library.ownerDomainId, recordId: historical.recordId,
        fileId, suggestionRunId: historical.id, status: "ambiguous", overallConfidence: 0,
        structuredOutputJson, structuredOutputSha256: createHash("sha256").update(structuredOutputJson).digest("hex"),
        rulesetVersion: "l1-intelligent-library01-v11", promptVersion: "l1-intelligent-library01-prompt-v7",
        ocrEngineId: "synthetic-no-ocr", reasoningEngineId: "synthetic-no-model", selectedPages: [],
        autoApplied: false, appliedFields: [], createdAt: NOW,
      });
    }
    const newerId = `new-filename-${historicalEvidence}`;
    f.persistence.repositories.suggestions.createRun({
      ...historical, id: newerId, status: "ready", createdAt: new Date(NOW.getTime() + 1_000),
      candidates: [{
        position: 0, fieldPath: "canonicalTitle", typeFieldName: null, authorityType: null, authorityRole: null,
        identifierScheme: null, value: "Later filename hint", sourceType: "filename", sourcePageIndex: null,
        pageClass: null, confidence: "low", precedenceRank: 100, evidenceExcerpt: null, evidenceOrigin: "filename",
        ocrEngine: null, ocrConfidence: null, rulesetVersion: "rf-frontmatterocr-v2",
      }],
    });
    const latest = f.persistence.repositories.suggestions.findLatestStateEvidenceMany(f.library.ownerDomainId, f.library.id, [fileId])[0]!;
    assert.equal(latest.id, newerId);
    assert.equal(latest.candidateCount, 1);
    assert.equal(latest.nonFilenameCandidateCount, 0);
    assert.equal(latest.aiReviewable, false);
    assert.equal(latest.applied, false);
    assert.equal(f.persistence.repositories.metadata.findMetadata(f.library.ownerDomainId, historical.recordId), null);
    assert.equal(f.persistence.repositories.bibliography.findProfile(f.library.ownerDomainId, historical.recordId), null);
    assert.deepEqual(f.persistence.repositories.bibliography.listFieldAuthorities(f.library.ownerDomainId, historical.recordId), []);
    assert.deepEqual(f.jobs(), []);
    const evidenceBefore = f.persistence.repositories.suggestions.listRuns(f.library.ownerDomainId, f.library.id, fileId, 10);
    assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, [fileId]))[0]?.status, "review_available");
    assert.equal((await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs([fileId])))[0]?.status, "review_available");
    assert.deepEqual(f.jobs(), []);
    assert.equal(f.dispatches.length, 0);
    assert.deepEqual(f.persistence.repositories.suggestions.listRuns(f.library.ownerDomainId, f.library.id, fileId, 10), evidenceBefore);
  });
}

test("non-PDF holdings are skipped and all selected identities are authorized before any queue or expiry writes", async (context) => {
  const f = fixture(context);
  f.add("good"); f.add("text", "text/plain"); f.add("expired");
  await f.suggestions.requestGeneration(OWNER, f.library.id, "expired");
  f.database.prepare("UPDATE derived_compute_jobs SET deadline_at = '2020-01-01T00:00:00.000Z'").run();
  f.file("private", OTHER.id);
  const selected = await f.inputs(["good", "text"]);
  assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, ["text"]))[0]?.status, "unsupported");
  const before = f.jobs();
  for (const actor of [MEMBER, { ...OWNER, id: OTHER.id }]) {
    await assert.rejects(async () => f.suggestions.previewRecovery(actor, f.library.id, ["good"]), { code: "not_found" });
    await assert.rejects(async () => f.suggestions.recoverSelected(actor, f.library.id, selected), { code: "not_found" });
  }
  await assert.rejects(async () => f.suggestions.previewRecovery(OWNER, f.library.id, ["good", "private"]), { code: "not_found" });
  await assert.rejects(async () => f.suggestions.recoverSelected(OWNER, f.library.id,
    [selected[0]!, { ...selected[0]!, fileId: "private" }]), { code: "not_found" });
  assert.deepEqual(f.jobs(), before);
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, selected);
  assert.deepEqual(results.map((item) => item.status), ["queued", "unsupported"]);
});

test("inactive actor and revoked manager membership invalidate a previously authorized snapshot", async (context) => {
  const f = fixture(context);
  const library = f.libraries.createLibrary(OWNER, "Revocation fixture");
  f.libraries.addMember(OWNER, library.id, OTHER.id, "manager");
  f.file("good", OWNER.id, "application/pdf", library.id);
  const preview = (await f.suggestions.previewRecovery(OWNER, library.id, ["good"]))[0]!;
  const selected = [{ fileId: "good", sourceVersion: preview.sourceVersion, expectedJobId: null, expectedAttempts: null }];
  f.database.prepare("UPDATE accounts SET state = 'disabled', auth_revision = auth_revision + 1 WHERE id = ?").run(OWNER.id);
  await assert.rejects(async () => f.suggestions.recoverSelected(OWNER, library.id, selected), { code: "not_found" });
  f.database.prepare("UPDATE accounts SET state = 'active', auth_revision = auth_revision + 1 WHERE id = ?").run(OWNER.id);
  f.database.prepare("UPDATE library_memberships SET role = 'member' WHERE account_id = ? AND library_id = ?").run(OWNER.id, library.id);
  await assert.rejects(async () => f.suggestions.recoverSelected(OWNER, library.id, selected), { code: "not_found" });
  assert.equal(f.jobs().length, 0);
});

test("all six diagnosed bad sources stay excluded without jobs and after renaming, while replacement bytes can be recovered", async (context) => {
  const f = fixture(context);
  for (const source of RECOVERY_SOURCE_EXCLUSIONS) {
    f.add(source.resourceId);
    f.database.prepare("UPDATE files SET size_bytes = ?, checksum_algorithm = ?, checksum = ? WHERE id = ?")
      .run(source.sizeBytes, source.checksumAlgorithm, source.checksum, source.resourceId);
  }
  const ids = RECOVERY_SOURCE_EXCLUSIONS.map((source) => source.resourceId);
  assert.deepEqual((await f.suggestions.previewRecovery(OWNER, f.library.id, ids)).map((item) => item.status), ids.map(() => "excluded"));
  const results = await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(ids));
  assert.deepEqual(results.map((item) => item.status), ids.map(() => "excluded"));
  assert.equal(f.jobs().length, 0);
  f.database.prepare("UPDATE files SET display_name = 'renamed.pdf', revision = revision + 1 WHERE id = ?").run(ids[0]);
  assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, [ids[0]!]))[0]?.status, "excluded");
  f.database.prepare("UPDATE files SET checksum = 'AAAAAAAAAAAAAAAAAAAAAA==', revision = revision + 1 WHERE id = ?").run(ids[0]);
  assert.equal((await f.suggestions.previewRecovery(OWNER, f.library.id, [ids[0]!]))[0]?.status, "missing");
  assert.equal((await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs([ids[0]!])))[0]?.status, "queued");
  assert.equal(f.jobs().length, 1);
});

test("empty duplicate oversized and malformed recovery batches fail without mutation", async (context) => {
  const f = fixture(context);
  f.add("good");
  const selected = await f.inputs(["good"]);
  for (const ids of [[], ["good", "good"], ["../private"], Array.from({ length: 101 }, (_, index) => `file-${index}`)]) {
    await assert.rejects(async () => f.suggestions.previewRecovery(OWNER, f.library.id, ids), { code: "invalid_input" });
  }
  for (const items of [[], [selected[0]!, selected[0]!], [{ ...selected[0]!, sourceVersion: "bad" }],
    [{ ...selected[0]!, expectedJobId: "unexpected", expectedAttempts: null }],
    Array.from({ length: 101 }, (_, index) => ({ ...selected[0]!, fileId: `file-${index}` }))]) {
    await assert.rejects(async () => f.suggestions.recoverSelected(OWNER, f.library.id, items), { code: "invalid_input" });
  }
  assert.equal(f.jobs().length, 0);
});

test("a failed second insert rolls back every new recovery job", async (context) => {
  const f = fixture(context);
  f.add("first"); f.add("second");
  const selected = await f.inputs(["first", "second"]);
  f.database.exec("CREATE TEMP TRIGGER abort_second BEFORE INSERT ON derived_compute_jobs WHEN NEW.resource_id = 'second' BEGIN SELECT RAISE(ABORT, 'synthetic insertion failure'); END");
  await assert.rejects(async () => f.suggestions.recoverSelected(OWNER, f.library.id, selected), /synthetic insertion failure/u);
  assert.equal(f.jobs().length, 0);
  assert.equal(f.dispatches.length, 0);
});

test("an insertion failure after a retry restores the original failed attempt and its capability evidence", async (context) => {
  const f = fixture(context);
  f.add("retry"); f.add("missing");
  const queued = await f.suggestions.requestGeneration(OWNER, f.library.id, "retry");
  const row = f.persistence.repositories.derivedJobs.findById(queued.id)!;
  f.persistence.repositories.derivedJobs.claim(row.id, row.activeAttemptId!, "a".repeat(64), new Date(NOW.getTime() + 60_000), NOW);
  f.persistence.repositories.derivedJobs.fail(row.id, row.activeAttemptId!, "compute_source_unavailable", NOW);
  const selected = await f.inputs(["retry", "missing"]);
  const before = f.jobs();
  f.database.exec("CREATE TEMP TRIGGER abort_missing BEFORE INSERT ON derived_compute_jobs WHEN NEW.resource_id = 'missing' BEGIN SELECT RAISE(ABORT, 'synthetic insertion failure'); END");
  await assert.rejects(async () => f.suggestions.recoverSelected(OWNER, f.library.id, selected), /synthetic insertion failure/u);
  assert.deepEqual(f.jobs(), before);
});

test("a reconstructed service reconciles the exact committed recovery attempt without browser participation", async (context) => {
  const f = fixture(context);
  f.add("restart");
  const result = (await f.suggestions.recoverSelected(OWNER, f.library.id, await f.inputs(["restart"])))[0]!;
  const committed = f.persistence.repositories.derivedJobs.findById(result.job!.id)!;
  const reopened = new SqlitePersistence(openSqliteDatabase(join(f.temporaryDirectory, "test.sqlite")));
  try {
    const restored = new SuggestionService({ persistence: reopened, storage: f.storage,
      metadata: new CanonicalMetadataService(reopened), dispatcher: f.dispatcher,
      coreBaseUrl: "http://127.0.0.1", now: () => NOW });
    assert.equal(await restored.reconcileUndispatchedJobs(), 1);
    assert.equal(await restored.reconcileUndispatchedJobs(), 0);
    assert.equal(f.dispatches.length, 1);
    assert.equal(f.dispatches[0]?.id, committed.id);
    assert.equal(f.dispatches[0]?.attemptId, committed.activeAttemptId);
    assert.equal(reopened.repositories.derivedJobs.findById(committed.id)?.attempts, 1);
  } finally { reopened.close(); }
});
