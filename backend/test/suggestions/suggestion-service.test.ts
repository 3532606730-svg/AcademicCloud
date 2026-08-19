import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, type TestContext } from "node:test";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { PdfTextInspectionError } from "../../src/suggestions/pdf-text.js";
import { SuggestionError, SuggestionService } from "../../src/suggestions/suggestion-service.js";
import { SUGGESTION_LIMITS, type BoundedPdfTextSource, type PdfTextPage } from "../../src/suggestions/suggestion.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "suggest-owner", loginName: "suggest-owner", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "suggest-member", loginName: "suggest-member", role: "member" };

function pdfWithText(pages: string[], info: { Title?: string; Author?: string } = {}): Uint8Array {
  const objects: string[] = [];
  const kids: string[] = [];
  const fontObject = 3 + pages.length * 2;
  objects.push(`<< /Type /Catalog /Pages 2 0 R${Object.keys(info).length ? " /Info " + (fontObject + 1) + " 0 R" : ""} >>`);
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  for (const [index, pageText] of pages.entries()) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const escaped = pageText.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  if (Object.keys(info).length) {
    const title = (info.Title ?? "").replaceAll("(", "\\(").replaceAll(")", "\\)");
    const author = (info.Author ?? "").replaceAll("(", "\\(").replaceAll(")", "\\)");
    objects.push(`<<${title ? ` /Title (${title})` : ""}${author ? ` /Author (${author})` : ""} >>`);
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${Object.keys(info).length ? ` /Info ${fontObject + 1} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({ id: OWNER.id, loginName: OWNER.loginName, passwordHash: "test", role: "owner", state: "active", createdAt: NOW, updatedAt: NOW });
  persistence.repositories.accounts.create({ id: MEMBER.id, loginName: MEMBER.loginName, passwordHash: "test", role: "member", state: "active", createdAt: NOW, updatedAt: NOW });
  const library = persistence.repositories.libraries.findDefault()!;
  const fileId = "suggestion-file";
  const objectKey = "objects/aa/" + "b".repeat(62);
  const bytes = pdfWithText([
    "The Mongols and the West, 1221-1410\nby\nPeter Jackson",
    "Copyright 2018 Routledge\nISBN 978-0-415-15271-6",
  ], { Title: "The Mongols and the West, 1221-1410", Author: "Peter Jackson" });
  const checksum = "1B2M2Y8AsgTpgAmY7PhCfg==";
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, library.ownerDomainId, MEMBER.id, "Mongols -- acquisition.pdf", objectKey, bytes.byteLength, checksum, timestamp, timestamp, timestamp);
  database.prepare(`INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("suggestion-record", library.ownerDomainId, MEMBER.id, "legacy", timestamp, timestamp);
  database.prepare(`INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at) VALUES (?, ?, ?, 'detached', ?, ?)`)
    .run("suggestion-artifact", library.ownerDomainId, "suggestion-record", timestamp, timestamp);
  database.prepare(`INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("suggestion-version", library.ownerDomainId, "suggestion-artifact", fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run("suggestion-artifact");
  // Seed one private overlay row so acceptance can prove that the suggestion
  // path changes only canonical metadata, never a user's private research
  // state.
  persistence.repositories.favorites.addFile(MEMBER.id, fileId, NOW);
  const storage = new InMemoryStorageAdapter(() => NOW);
  storage.putObject({ objectKey, sizeBytes: bytes.byteLength, etag: null, checksumAlgorithm: "md5", checksum, mediaType: "application/pdf", modifiedAt: NOW }, bytes);
  const metadata = new CanonicalMetadataService(persistence, () => NOW, () => "suggest-authority");
  const suggestions = new SuggestionService({ persistence, storage, metadata, now: () => NOW, createId: () => "run-1" });
  return { database, persistence, library, fileId, bytes, storage, metadata, suggestions };
}

test("deterministic bilingual text-layer suggestions preserve evidence and never write canonical metadata", async (context) => {
  const { persistence, library, fileId, suggestions, metadata } = fixture(context);
  const run = await suggestions.generate(OWNER, library.id, fileId);
  assert.equal(run.status, "ready");
  assert.deepEqual(run.window.pageIndices, [1, 2]);
  assert.equal(run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "The Mongols and the West, 1221-1410");
  assert.equal(run.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "Peter Jackson");
  assert.equal(run.candidates.find((candidate) => candidate.fieldPath === "identifier")?.value, "9780415152716");
  assert.equal(run.candidates.find((candidate) => candidate.authorityRole === "publisher")?.sourceType, "copyright_page");
  for (const candidate of run.candidates) {
    assert.ok(candidate.rulesetVersion);
    assert.ok(candidate.evidenceExcerpt);
    assert.ok(candidate.sourcePageIndex === null || candidate.sourcePageIndex >= 1);
    assert.equal(candidate.ocrEngine, null);
    assert.equal(candidate.ocrConfidence, null);
    assert.ok(["native_text", "embedded_pdf_metadata", "filename"].includes(candidate.evidenceOrigin));
  }
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);
  const persisted = suggestions.getLatest(MEMBER, library.id, fileId);
  assert.deepEqual(persisted, run);
  assert.equal(persistence.repositories.suggestions.findLatestRun(library.ownerDomainId, library.id, fileId)?.sourceFingerprint.checksum, "1B2M2Y8AsgTpgAmY7PhCfg==");
});

test("manager acceptance uses RF-META01 CAS; Member acceptance and stale source fail closed", async (context) => {
  const { database, library, fileId, suggestions, metadata, storage } = fixture(context);
  const run = await suggestions.generate(OWNER, library.id, fileId);
  const detail = metadata.getDetails(OWNER, library.id, fileId);
  const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")!;
  await assert.rejects(
    () => suggestions.accept(MEMBER, library.id, fileId, run.id, {
      acceptedCandidateIds: [title.id],
      metadataVersion: detail.metadataVersion,
      metadata: { materialType: "book", canonicalTitle: title.value, subtitle: null, alternativeTitles: [], dateStatement: null, identifiers: [], typeFields: {}, authorityLinks: [] },
    }),
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  const beforeIdentity = database.prepare<[string], {
    display_name: string;
    object_key: string;
    checksum: string | null;
    uploaded_by_account_id: string;
  }>("SELECT display_name, object_key, checksum, uploaded_by_account_id FROM files WHERE id = ?").get(fileId)!;
  const beforeLineage = database.prepare<[string], { record_id: string; artifact_id: string }>(`
    SELECT v.artifact_id, a.record_id
    FROM scholarly_artifact_versions v
    JOIN scholarly_artifacts a ON a.id = v.artifact_id
    WHERE v.stored_file_id = ?
  `).get(fileId)!;
  const beforeFavorite = database.prepare<[string, string], { account_id: string }>(
    "SELECT account_id FROM favorite_files WHERE account_id = ? AND file_id = ?",
  ).get(MEMBER.id, fileId);
  const accepted = await suggestions.accept(OWNER, library.id, fileId, run.id, {
    acceptedCandidateIds: [title.id],
    metadataVersion: detail.metadataVersion,
    metadata: { materialType: "book", canonicalTitle: title.value, subtitle: null, alternativeTitles: [], dateStatement: null, identifiers: [], typeFields: {}, authorityLinks: [] },
  });
  assert.equal(accepted.detail.metadata?.canonicalTitle, title.value);
  assert.equal(accepted.run.status, "accepted");
  const afterIdentity = database.prepare<[string], {
    display_name: string;
    object_key: string;
    checksum: string | null;
    uploaded_by_account_id: string;
  }>("SELECT display_name, object_key, checksum, uploaded_by_account_id FROM files WHERE id = ?").get(fileId)!;
  assert.deepEqual(afterIdentity, beforeIdentity);
  assert.deepEqual(database.prepare<[string], { record_id: string; artifact_id: string }>(`
    SELECT v.artifact_id, a.record_id
    FROM scholarly_artifact_versions v
    JOIN scholarly_artifacts a ON a.id = v.artifact_id
    WHERE v.stored_file_id = ?
  `).get(fileId), beforeLineage);
  assert.deepEqual(database.prepare<[string, string], { account_id: string }>(
    "SELECT account_id FROM favorite_files WHERE account_id = ? AND file_id = ?",
  ).get(MEMBER.id, fileId), beforeFavorite);
  const latest = metadata.getDetails(OWNER, library.id, fileId);
  await assert.rejects(
    () => suggestions.accept(OWNER, library.id, fileId, run.id, { acceptedCandidateIds: [title.id], metadataVersion: latest.metadataVersion, metadata: { materialType: "book", canonicalTitle: "stale replay", subtitle: null, alternativeTitles: [], dateStatement: null, identifiers: [], typeFields: {}, authorityLinks: [] } }),
    (error: unknown) => error instanceof SuggestionError && error.code === "conflict",
  );
  // A changed source is stale even if its object bytes remain otherwise valid.
  storage.putObject({ objectKey: "objects/aa/" + "b".repeat(62), sizeBytes: 1, etag: null, checksumAlgorithm: "md5", checksum: "different", mediaType: "application/pdf", modifiedAt: NOW }, new Uint8Array([1]));
  database.prepare("UPDATE files SET revision = revision + 1 WHERE id = ?").run(fileId);
  assert.equal(suggestions.getLatest(OWNER, library.id, fileId)?.status, "accepted");
});

test("image-only PDF evidence reaches the existing extractor with truthful OCR provenance", async (context) => {
  const { database, persistence, library, fileId, storage, metadata } = fixture(context);
  const imageBytes = pdfWithText([""]);
  const objectKey = "objects/aa/" + "b".repeat(62);
  storage.putObject({ objectKey, sizeBytes: imageBytes.byteLength, etag: null, checksumAlgorithm: "md5", checksum: "other", mediaType: "application/pdf", modifiedAt: NOW }, imageBytes);
  database.prepare("UPDATE files SET size_bytes = ?, checksum = ? WHERE id = ?").run(imageBytes.byteLength, "other", fileId);
  let runNumber = 0;
  const service = new SuggestionService({
    persistence,
    storage,
    metadata,
    inspector: fixedInspector([{
      pageIndex: 1,
      text: "书名：元史西域人华化考\n作者：陈垣\n出版社：中华书局\n出版时间：2008",
      evidenceOrigin: "ocr",
      ocrEngine: "test-local-ocr",
      ocrConfidence: 86,
    }]),
    now: () => NOW,
    createId: () => `run-image-${++runNumber}`,
  });
  const image = await service.generate(OWNER, library.id, fileId);
  assert.equal(image.status, "ready");
  assert.equal(image.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "元史西域人华化考");
  assert.equal(image.candidates.every((candidate) => candidate.evidenceOrigin === "ocr"), true);
  assert.equal(image.candidates.every((candidate) => candidate.ocrEngine === "test-local-ocr"), true);
  assert.equal(image.candidates.every((candidate) => candidate.ocrConfidence === 86), true);
  assert.equal(image.candidates.some((candidate) => candidate.confidence === "high"), false);
  assert.deepEqual(service.getLatest(MEMBER, library.id, fileId), image);
  const candidateColumns = database.prepare<[], { name: string }>(
    "PRAGMA table_info(scholarly_metadata_suggestion_candidates)",
  ).all().map((column) => column.name);
  assert.equal(candidateColumns.includes("evidence_origin"), true);
  assert.equal(candidateColumns.includes("ocr_engine"), true);
  assert.equal(candidateColumns.includes("ocr_confidence"), true);
  assert.equal(candidateColumns.some((name) => /page_text|raw_text|image|bitmap|pdf_bytes/u.test(name)), false);
  database.prepare("UPDATE files SET media_type = 'text/plain', revision = revision + 1 WHERE id = ?").run(fileId);
  const nonPdf = await service.generate(OWNER, library.id, fileId);
  assert.equal(nonPdf.status, "unsupported");
});

test("same-domain run trigger rejects mismatched Record/file evidence", (context) => {
  const { database, library } = fixture(context);
  assert.throws(() => database.prepare(`
    INSERT INTO scholarly_metadata_suggestion_runs (
      id, owner_domain_id, library_id, record_id, file_id, status,
      ruleset_version, source_version, source_file_revision, first_pages, last_pages,
      page_count, page_indices, window_complete, created_by_account_id, created_at
    ) VALUES ('bad-run', ?, ?, 'missing-record', 'suggestion-file', 'unsupported',
      'rf-metasuggest-v1', ?, 0, 15, 5, NULL, '[]', 0, ?, ?)
  `).run(library.ownerDomainId, library.id, createHash("sha256").update("bad").digest("base64url"), OWNER.id, NOW.toISOString()), /suggestion run requires/);
});

function fixedInspector(pages: PdfTextPage[]): BoundedPdfTextSource {
  return {
    async inspect() {
      return {
        pageCount: pages.length,
        pageIndices: pages.map((page) => page.pageIndex),
        pages,
        embeddedMetadata: {},
        complete: true,
        hasUsableTextLayer: true,
        hasUsableEvidence: true,
        nativePageCount: pages.filter((page) => page.evidenceOrigin !== "ocr").length,
        ocrPageCount: pages.filter((page) => page.evidenceOrigin === "ocr").length,
      };
    },
  };
}

test("unexpected inspection failures escape without persisting a partial suggestion run", async (context) => {
  const { database, persistence, library, fileId, storage, metadata } = fixture(context);
  const inspector: BoundedPdfTextSource = {
    async inspect() {
      throw new TypeError("unexpected dependency failure");
    },
  };
  const service = new SuggestionService({
    persistence,
    storage,
    metadata,
    inspector,
    now: () => NOW,
    createId: () => "run-unexpected",
  });

  await assert.rejects(
    () => service.generate(OWNER, library.id, fileId),
    (error: unknown) => error instanceof TypeError && error.message === "unexpected dependency failure",
  );
  assert.equal(database.prepare<[], { count: number }>(
    "SELECT count(*) AS count FROM scholarly_metadata_suggestion_runs",
  ).get()?.count, 0);
});

test("filename evidence survives a failed PDF inspection instead of forcing unsupported", async (context) => {
  const { persistence, library, fileId, storage, metadata } = fixture(context);
  const service = new SuggestionService({
    persistence,
    storage,
    metadata,
    inspector: {
      async inspect() {
        throw new PdfTextInspectionError("invalid_pdf");
      },
    },
    now: () => NOW,
    createId: () => "run-filename-survival",
  });
  const run = await service.generate(OWNER, library.id, fileId);
  assert.equal(run.status, "ready");
  assert.equal(run.window.complete, false);
  assert.equal(run.candidates.some((candidate) => candidate.sourceType === "filename"), true);
  assert.equal(run.candidates.every((candidate) => candidate.evidenceOrigin === "filename"), true);
});

test("English OCR evidence reaches the existing classifier/extractor without canonical writes", async (context) => {
  const { persistence, library, fileId, storage, metadata } = fixture(context);
  const service = new SuggestionService({
    persistence,
    storage,
    metadata,
    inspector: fixedInspector([{
      pageIndex: 3,
      text: "Title: The Mongols and the West, 1221-1410\nAuthor: Peter Jackson",
      evidenceOrigin: "ocr",
      ocrEngine: "test-local-ocr",
      ocrConfidence: 91,
    }]),
    now: () => NOW,
    createId: () => "run-english-ocr",
  });
  const run = await service.generate(OWNER, library.id, fileId);
  const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle");
  assert.equal(title?.value, "The Mongols and the West, 1221-1410");
  assert.equal(title?.evidenceOrigin, "ocr");
  assert.equal(title?.ocrConfidence, 91);
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);
});

test("authorization changed during OCR is revalidated before any run is persisted", async (context) => {
  const { database, persistence, library, fileId, storage, metadata } = fixture(context);
  let continueInspection!: () => void;
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const release = new Promise<void>((resolve) => { continueInspection = resolve; });
  const inspector: BoundedPdfTextSource = {
    async inspect() {
      markEntered();
      await release;
      return fixedInspector([{
        pageIndex: 1,
        text: "Title: Bounded OCR",
        evidenceOrigin: "ocr",
        ocrEngine: "test-local-ocr",
        ocrConfidence: 90,
      }]).inspect(new Uint8Array(), SUGGESTION_LIMITS);
    },
  };
  const service = new SuggestionService({ persistence, storage, metadata, inspector, now: () => NOW, createId: () => "run-revoked" });
  const pending = service.generate(OWNER, library.id, fileId);
  await entered;
  assert.equal(persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", new Date(NOW.getTime() + 1_000)), true);
  continueInspection();
  await assert.rejects(
    () => pending,
    (error: unknown) => error instanceof SuggestionError && error.code === "not_found",
  );
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM scholarly_metadata_suggestion_runs").get()?.count, 0);
});

test("manager can explicitly accept a selected candidate through the RF-META01 CAS path", async (context) => {
  const { library, fileId, suggestions, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, {
    materialType: "book",
    canonicalTitle: "Existing canonical title",
    subtitle: null,
    alternativeTitles: [],
    dateStatement: null,
    identifiers: [],
    typeFields: {},
    authorityLinks: [],
  });
  const run = await suggestions.generate(OWNER, library.id, fileId);
  const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")!;
  const current = metadata.getDetails(OWNER, library.id, fileId);
  const accepted = await suggestions.accept(OWNER, library.id, fileId, run.id, {
    acceptedCandidateIds: [title.id],
    metadataVersion: current.metadataVersion,
  });
  assert.equal(accepted.detail.metadata?.canonicalTitle, title.value);
});

test("same-rank conflicting selections fail closed instead of applying request order", async (context) => {
  const { library, fileId, persistence, storage, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, {
    materialType: "book",
    canonicalTitle: "Existing canonical title",
    subtitle: null,
    alternativeTitles: [],
    dateStatement: null,
    identifiers: [],
    typeFields: {},
    authorityLinks: [],
  });
  const service = new SuggestionService({
    persistence,
    storage,
    metadata,
    inspector: fixedInspector([
      { pageIndex: 1, text: "First candidate title" },
      { pageIndex: 2, text: "Second candidate title" },
    ]),
    now: () => NOW,
    createId: () => "run-conflict",
  });
  const run = await service.generate(OWNER, library.id, fileId);
  assert.equal(run.status, "ambiguous");
  const titles = run.candidates.filter((candidate) => candidate.fieldPath === "canonicalTitle");
  assert.equal(titles.length, 2);
  const current = metadata.getDetails(OWNER, library.id, fileId);
  await assert.rejects(
    () => service.accept(OWNER, library.id, fileId, run.id, {
      acceptedCandidateIds: titles.map((candidate) => candidate.id),
      metadataVersion: current.metadataVersion,
    }),
    (error: unknown) => error instanceof SuggestionError && error.code === "conflict",
  );
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata?.canonicalTitle, "Existing canonical title");
});

test("acceptance rejects an object changed behind an unchanged database fingerprint", async (context) => {
  const { library, fileId, suggestions, metadata, storage } = fixture(context);
  const run = await suggestions.generate(OWNER, library.id, fileId);
  const title = run.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")!;
  const detail = metadata.getDetails(OWNER, library.id, fileId);
  storage.putObject({
    objectKey: "objects/aa/" + "b".repeat(62),
    sizeBytes: 1,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: "provider-changed",
    mediaType: "application/pdf",
    modifiedAt: NOW,
  }, new Uint8Array([7]));
  await assert.rejects(
    () => suggestions.accept(OWNER, library.id, fileId, run.id, {
      acceptedCandidateIds: [title.id],
      metadataVersion: detail.metadataVersion,
      metadata: {
        materialType: "book",
        canonicalTitle: title.value,
        subtitle: null,
        alternativeTitles: [],
        dateStatement: null,
        identifiers: [],
        typeFields: {},
        authorityLinks: [],
      },
    }),
    (error: unknown) => error instanceof SuggestionError && error.code === "stale",
  );
  assert.equal(suggestions.getLatest(OWNER, library.id, fileId)?.status, "stale");
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata, null);
});

test("authority suggestions require an existing same-domain authority and never auto-create or merge", async (context) => {
  const first = fixture(context);
  const authorityCountBefore = first.database.prepare("SELECT COUNT(*) AS count FROM scholarly_authorities").get() as { count: number };
  const run = await first.suggestions.generate(OWNER, first.library.id, first.fileId);
  const author = run.candidates.find((candidate) => candidate.authorityRole === "author")!;
  const missing = first.metadata.getDetails(OWNER, first.library.id, first.fileId);
  await assert.rejects(
    () => first.suggestions.accept(OWNER, first.library.id, first.fileId, run.id, {
      acceptedCandidateIds: [author.id],
      metadataVersion: missing.metadataVersion,
      metadata: {
        materialType: "book",
        canonicalTitle: "The Mongols and the West, 1221-1410",
        subtitle: null,
        alternativeTitles: [],
        dateStatement: null,
        identifiers: [],
        typeFields: {},
        authorityLinks: [],
      },
    }),
    (error: unknown) => error instanceof SuggestionError && error.code === "invalid_input",
  );
  assert.equal((first.database.prepare("SELECT COUNT(*) AS count FROM scholarly_authorities").get() as { count: number }).count, authorityCountBefore.count);

  const authority = first.metadata.createAuthority(OWNER, first.library.id, { type: "person", canonicalLabel: author.value, aliases: [] });
  const current = first.metadata.getDetails(OWNER, first.library.id, first.fileId);
  const accepted = await first.suggestions.accept(OWNER, first.library.id, first.fileId, run.id, {
    acceptedCandidateIds: [author.id],
    metadataVersion: current.metadataVersion,
    metadata: {
      materialType: "book",
      canonicalTitle: "The Mongols and the West, 1221-1410",
      subtitle: null,
      alternativeTitles: [],
      dateStatement: null,
      identifiers: [],
      typeFields: {},
      authorityLinks: [{ authorityId: authority.id, role: "author" }],
    },
  });
  assert.equal(accepted.detail.metadata?.canonicalTitle, "The Mongols and the West, 1221-1410");
  assert.equal(accepted.detail.metadata?.authorityLinks[0]?.canonicalLabel, author.value);
  assert.notEqual(
    accepted.detail.metadata?.canonicalTitle,
    `${author.value} · The Mongols and the West, 1221-1410`,
    "suggestion acceptance must keep the author out of canonicalTitle",
  );
});
