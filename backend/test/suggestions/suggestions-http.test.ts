import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { DerivedComputeDispatchJob, DerivedComputeDispatcher } from "@academiccloud/compute-contracts";
import { runComputeWorker } from "../../../compute/src/worker.js";
import type { BoundedPdfTextSource } from "../../../compute/src/suggestion.js";

import { Argon2idPasswordHasher } from "../../src/auth/password-hasher.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { createApplication } from "../../src/platform/application.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import type { BrowserDownloadAuthorization, CreateDownloadAuthorizationInput } from "../../src/storage/storage-adapter.js";
import { INITIAL_MIGRATIONS_DIRECTORY, RULESET_ADMISSIONS_DIRECTORY } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1";
const PASSWORD = "suggestions-http-password-123";
const NOW = new Date("2026-08-18T12:00:00.000Z");
const BOOTSTRAP_SECRET = "test-compute-bootstrap-secret-long-enough";

class CapturingDispatcher implements DerivedComputeDispatcher {
  readonly jobs: DerivedComputeDispatchJob[] = [];

  async dispatch(job: DerivedComputeDispatchJob): Promise<{ provider: string; providerJobId: string }> {
    this.jobs.push({ ...job });
    return { provider: "test", providerJobId: `provider-${job.attemptId}` };
  }
}

class WorkerTestStorage extends InMemoryStorageAdapter {
  override async createDownloadAuthorization(_input: CreateDownloadAuthorizationInput): Promise<BrowserDownloadAuthorization> {
    return {
      method: "GET",
      url: "https://storage.example/opaque-signed-source",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    };
  }
}

function makePdf(title: string, author: string): Uint8Array {
  const pageObject = 3;
  const contentObject = 4;
  const fontObject = 5;
  const text = `${title}\\nby\\n${author}`;
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}

test("suggestion HTTP routes enforce manager generation/acceptance and Member read-only access", async () => {
  const databasePath = join(tmpdir(), `academiccloud-suggestions-http-${Date.now()}.sqlite`);
  const database = openSqliteDatabase(databasePath);
  runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  const persistence = new SqlitePersistence(database);
  const passwordHash = await new Argon2idPasswordHasher().hash(PASSWORD);
  for (const account of [
    { id: "suggest-http-owner", loginName: "suggest-http-owner", role: "owner" as const },
    { id: "suggest-http-member", loginName: "suggest-http-member", role: "member" as const },
  ]) {
    persistence.repositories.accounts.create({
      ...account,
      passwordHash,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const library = persistence.repositories.libraries.findDefault()!;
  const fileId = "suggest-http-file";
  const objectKey = "objects/aa/" + "d".repeat(62);
  const bytes = makePdf("HTTP suggestion title", "Peter Jackson");
  const checksum = "1B2M2Y8AsgTpgAmY7PhCfg==";
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, library.ownerDomainId, "suggest-http-member", "HTTP acquisition.pdf", objectKey, bytes.byteLength, checksum, timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, 'legacy', ?, ?)
  `).run("suggest-http-record", library.ownerDomainId, "suggest-http-member", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run("suggest-http-artifact", library.ownerDomainId, "suggest-http-record", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("suggest-http-version", library.ownerDomainId, "suggest-http-artifact", fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run("suggest-http-artifact");
  persistence.close();

  const storage = new WorkerTestStorage(() => NOW);
  storage.putObject({ objectKey, sizeBytes: bytes.byteLength, etag: null, checksumAlgorithm: "md5", checksum, mediaType: "application/pdf", modifiedAt: NOW }, bytes);
  const dispatcher = new CapturingDispatcher();
  const app = await createApplication(
    { host: "127.0.0.1", port: 0, logLevel: "silent", environment: "test", appOrigin: ORIGIN },
    { databasePath, migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY, rulesetAdmissionsDirectory: RULESET_ADMISSIONS_DIRECTORY },
    storage,
    { dispatcher, bootstrapSecret: BOOTSTRAP_SECRET, coreBaseUrl: ORIGIN },
  );

  function cookieFrom(response: { headers: Record<string, unknown> }): string {
    const value = response.headers["set-cookie"];
    return (Array.isArray(value) ? value[0] : typeof value === "string" ? value : "").split(";", 1)[0] ?? "";
  }
  async function login(loginName: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { accept: "application/json", origin: ORIGIN, "content-type": "application/json" },
      payload: { loginName, password: PASSWORD },
    });
    assert.equal(response.statusCode, 200);
    return cookieFrom(response);
  }
  const headers = (cookie: string) => ({ accept: "application/json", origin: ORIGIN, cookie });
  const base = "/api/libraries/canonical-library/holdings/suggest-http-file/metadata/suggestions";

  try {
    const ownerCookie = await login("suggest-http-owner");
    const memberCookie = await login("suggest-http-member");
    const memberGenerate = await app.inject({ method: "POST", url: base, headers: { ...headers(memberCookie), "content-type": "application/json" }, payload: {} });
    assert.equal(memberGenerate.statusCode, 404);

    const generated = await app.inject({ method: "POST", url: base, headers: { ...headers(ownerCookie), "content-type": "application/json" }, payload: {} });
    assert.equal(generated.statusCode, 202);
    const job = (generated.json() as { job: { id: string; state: string } }).job;
    assert.equal(job.state, "queued");
    assert.equal(dispatcher.jobs.length, 1);
    const dispatched = dispatcher.jobs[0]!;

    const unauthorizedPull = await app.inject({
      method: "POST",
      url: "/api/internal/compute/pull",
      headers: { "content-type": "application/json" },
      payload: { workerId: "owner-laptop.wsl2", waitMilliseconds: 0 },
    });
    assert.equal(unauthorizedPull.statusCode, 401);
    const idlePull = await app.inject({
      method: "POST",
      url: "/api/internal/compute/pull",
      headers: { authorization: `Bearer ${BOOTSTRAP_SECRET}`, "content-type": "application/json" },
      payload: { workerId: "owner-laptop.wsl2", waitMilliseconds: 0 },
    });
    assert.equal(idlePull.statusCode, 204);
    const staleHeartbeat = await app.inject({
      method: "POST",
      url: `/api/internal/compute/jobs/${job.id}/heartbeat`,
      headers: { authorization: `Bearer ${BOOTSTRAP_SECRET}`, "content-type": "application/json" },
      payload: { attemptId: dispatched.attemptId, workerId: "owner-laptop.wsl2" },
    });
    assert.equal(staleHeartbeat.statusCode, 404);

    const queuedStates = await app.inject({
      method: "GET",
      url: "/api/libraries/canonical-library/metadata/suggestion-states?fileIds=suggest-http-file",
      headers: headers(ownerCookie),
    });
    assert.equal(queuedStates.statusCode, 200);
    assert.equal((queuedStates.json() as { states: Array<{ state: string }> }).states[0]?.state, "queued");

    const memberJob = await app.inject({
      method: "GET",
      url: `${base.replace(/\/suggestions$/u, "/suggestion-jobs")}/${job.id}`,
      headers: headers(memberCookie),
    });
    assert.equal(memberJob.statusCode, 200);
    assert.equal((memberJob.json() as { job: { state: string } }).job.state, "queued");

    const inspector: BoundedPdfTextSource = {
      async inspect() { throw new Error("whole-object worker reads are forbidden"); },
      async inspectRange(source) {
        assert.equal(new TextDecoder("ascii").decode(await source.read(0, 5)), "%PDF-");
        return {
          pageCount: 2,
          pageIndices: [1, 2],
          pages: [{ pageIndex: 1, text: "HTTP suggestion title\nby\nPeter Jackson", evidenceOrigin: "native_text" }, {
            pageIndex: 2,
            text: "This preface explains that the book presents sustained scholarly analysis, compares historical evidence and interpretations, and develops an independent argument beyond its title, publisher, date, identifier, edition, or contributor lines.",
            evidenceOrigin: "native_text",
          }],
          embeddedMetadata: {},
          complete: true,
          hasUsableTextLayer: true,
        };
      },
    };
    const workerFetch: typeof fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.origin === "https://storage.example") {
        const range = new Headers(init.headers).get("range")?.match(/^bytes=(\d+)-(\d+)$/u);
        if (!range) return new Response(null, { status: 400 });
        const begin = Number(range[1]);
        const end = Number(range[2]) + 1;
        return new Response(bytes.subarray(begin, end), { status: 206 });
      }
      if (url.origin !== ORIGIN) return new Response(null, { status: 404 });
      const response = await app.inject({
        method: (init.method ?? "GET") as "GET" | "POST",
        url: `${url.pathname}${url.search}`,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(typeof init.body === "string" ? { payload: init.body } : {}),
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: { "content-type": response.headers["content-type"] ?? "application/json" },
      });
    };
    const worker = await runComputeWorker({
      coreBaseUrl: ORIGIN,
      jobId: job.id,
      attemptId: dispatched.attemptId,
      bootstrapSecret: BOOTSTRAP_SECRET,
    }, {
      fetchImplementation: workerFetch,
      inspector,
      reasoner: {
        async infer() {
          const evidenceText = "HTTP suggestion title by Peter Jackson";
          const classEvidenceText = "This preface explains that the book presents sustained scholarly analysis, compares historical evidence and interpretations, and develops an independent argument beyond its title, publisher, date, identifier, edition, or contributor lines.";
          return {
            status: "ambiguous",
            overallConfidence: 80,
            canonical: {
              materialClass: "scholarly_monograph",
              canonicalTitle: "HTTP suggestion title",
              subtitle: null,
              alternativeTitles: [],
              dateStatement: null,
              identifiers: [],
              contributors: [{ label: "Peter Jackson", role: "author", roleLabel: "by" }],
              publication: { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null },
              series: null,
              volume: null,
              language: null,
              carrierEdition: { editionType: null, editionStatement: null, facsimileStatement: null },
              sourceEdition: { dynasty: null, reignTitle: null, reignYear: null, absoluteYear: null, printer: null, imprint: null, bookshop: null, institution: null, printingPlace: null, editionType: null, editionStatement: null, holdingInformation: null },
            },
            classSupport: [{
              signal: "scholarly_analysis",
              confidence: 80,
              sourcePageIndex: 2,
              evidenceOrigin: "native_text",
              evidenceText: classEvidenceText,
            }],
            fields: [
              { fieldName: "canonicalTitle", scopeKey: "", confidence: 80, sourcePageIndex: 1, evidenceOrigin: "native_text", evidenceText },
              { fieldName: "contributor.label", scopeKey: "contributor:0", confidence: 80, sourcePageIndex: 1, evidenceOrigin: "native_text", evidenceText },
              { fieldName: "contributor.role", scopeKey: "contributor:0", confidence: 80, sourcePageIndex: 1, evidenceOrigin: "native_text", evidenceText },
              { fieldName: "contributor.roleLabel", scopeKey: "contributor:0", confidence: 80, sourcePageIndex: 1, evidenceOrigin: "native_text", evidenceText },
            ],
            warnings: [],
          };
        },
      },
    });
    assert.equal(worker.result.state, "succeeded");

    const latest = await app.inject({ method: "GET", url: base, headers: headers(ownerCookie) });
    assert.equal(latest.statusCode, 200);
    const run = (latest.json() as { run: {
      id: string;
      status: string;
      candidates: Array<Record<string, unknown>>;
      aiBibliography: {
        displayTitle: string;
        canonical: { materialClass: string; canonicalTitle: string; contributors: Array<{ label: string; role: string }> };
        fields: Array<{ fieldName: string; confidence: number }>;
        autoApplied: boolean;
      };
    } }).run;
    assert.equal(run.status, "ready");
    assert.equal(run.candidates.some((candidate) => "objectKey" in candidate || "checksum" in candidate || "favorites" in candidate), false);
    assert.equal(run.aiBibliography.displayTitle, "Peter Jackson HTTP suggestion title");
    assert.equal(run.aiBibliography.canonical.materialClass, "scholarly_monograph");
    assert.equal(run.aiBibliography.canonical.canonicalTitle, "HTTP suggestion title");
    assert.deepEqual(run.aiBibliography.canonical.contributors, [{ label: "Peter Jackson", role: "author", roleLabel: "by" }]);
    assert.equal(run.aiBibliography.fields.some((field) => field.fieldName === "canonicalTitle" && field.confidence === 80), true);
    assert.equal(run.aiBibliography.autoApplied, false);

    const succeededStates = await app.inject({
      method: "GET",
      url: "/api/libraries/canonical-library/metadata/suggestion-states?fileIds=suggest-http-file",
      headers: headers(ownerCookie),
    });
    assert.equal(succeededStates.statusCode, 200);
    assert.equal(
      (succeededStates.json() as { states: Array<{ state: string }> }).states[0]?.state,
      "ai_succeeded_reviewable",
    );

    const memberLatest = await app.inject({ method: "GET", url: base, headers: headers(memberCookie) });
    assert.equal(memberLatest.statusCode, 200);
    assert.equal((memberLatest.json() as { run: { id: string } }).run.id, run.id);

    const detailUrl = "/api/libraries/canonical-library/holdings/suggest-http-file/details";
    const detail = await app.inject({ method: "GET", url: detailUrl, headers: headers(ownerCookie) });
    assert.equal(detail.statusCode, 200);
    const detailBody = detail.json() as { metadataVersion: string };
    const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")! as { id: string };
    const memberAccept = await app.inject({
      method: "POST", url: `${base}/${run.id}/accept`, headers: { ...headers(memberCookie), "content-type": "application/json" },
      payload: { acceptedCandidateIds: [title.id], metadataVersion: detailBody.metadataVersion },
    });
    assert.equal(memberAccept.statusCode, 404);
    const wrongContentType = await app.inject({
      method: "POST", url: `${base}/${run.id}/accept`, headers: { ...headers(ownerCookie), "content-type": "text/plain" },
      payload: JSON.stringify({ acceptedCandidateIds: [title.id], metadataVersion: detailBody.metadataVersion }),
    });
    assert.equal(wrongContentType.statusCode, 415);

    const accepted = await app.inject({
      method: "POST", url: `${base}/${run.id}/accept`, headers: { ...headers(ownerCookie), "content-type": "application/json" },
      payload: {
        acceptedCandidateIds: [title.id],
        metadataVersion: detailBody.metadataVersion,
        metadata: {
          materialType: "book",
          canonicalTitle: "HTTP suggestion title",
          subtitle: null,
          alternativeTitles: [],
          dateStatement: null,
          identifiers: [],
          typeFields: {},
          authorityLinks: [],
        },
      },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal((accepted.json() as { detail: { metadata: { canonicalTitle: string } } }).detail.metadata.canonicalTitle, "HTTP suggestion title");
  } finally {
    await app.close();
    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
  }
});
