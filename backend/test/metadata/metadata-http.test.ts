import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Argon2idPasswordHasher } from "../../src/auth/password-hasher.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { createApplication } from "../../src/platform/application.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1";
const PASSWORD = "metadata-http-password-123";
const NOW = new Date("2026-08-18T12:00:00.000Z");

test("metadata HTTP is exact-holding scoped, manager-only for writes, CAS guarded, strict, and overlay-free", async () => {
  const databasePath = join(tmpdir(), `academiccloud-metadata-http-${Date.now()}.sqlite`);
  const database = openSqliteDatabase(databasePath);
  runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  const persistence = new SqlitePersistence(database);
  const passwordHash = await new Argon2idPasswordHasher().hash(PASSWORD);
  for (const account of [
    { id: "owner-http", loginName: "owner-http", role: "owner" as const },
    { id: "member-http", loginName: "member-http", role: "member" as const },
  ]) {
    persistence.repositories.accounts.create({
      ...account,
      passwordHash,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (
      'metadata-http-file', 'library:canonical-library', 'member-http', NULL,
      'accepted -- source.pdf', 'memory', ?, 'application/pdf', 12, 'md5',
      '1B2M2Y8AsgTpgAmY7PhCfg==', 'active', 0, ?, ?, ?, NULL, NULL, NULL
    )
  `).run(`objects/http/${"c".repeat(60)}`, timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES ('metadata-http-record', 'library:canonical-library', 'member-http', 'legacy label', ?, ?)
  `).run(timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES ('metadata-http-artifact', 'library:canonical-library', 'metadata-http-record', 'detached', ?, ?)
  `).run(timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES ('metadata-http-version', 'library:canonical-library', 'metadata-http-artifact', 'metadata-http-file', ?, ?)
  `).run(timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = 'metadata-http-artifact'").run();
  persistence.repositories.favorites.addFile("member-http", "metadata-http-file", NOW);
  persistence.close();

  const app = await createApplication(
    { host: "127.0.0.1", port: 0, logLevel: "silent", environment: "test", appOrigin: ORIGIN },
    { databasePath, migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY },
    new InMemoryStorageAdapter(),
  );

  function baseHeaders(cookie: string) {
    return { accept: "application/json", origin: ORIGIN, cookie };
  }
  function cookieFrom(response: { headers: Record<string, unknown> }) {
    const value = response.headers["set-cookie"];
    return (Array.isArray(value) ? value[0] : typeof value === "string" ? value : "").split(";", 1)[0] ?? "";
  }
  async function login(loginName: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { accept: "application/json", origin: ORIGIN, "content-type": "application/json" },
      payload: { loginName, password: PASSWORD },
    });
    assert.equal(response.statusCode, 200);
    return cookieFrom(response);
  }

  try {
    const ownerCookie = await login("owner-http");
    const memberCookie = await login("member-http");
    const libraryId = "canonical-library";
    const detailUrl = `/api/libraries/${libraryId}/holdings/metadata-http-file/details`;
    const updateUrl = `/api/libraries/${libraryId}/holdings/metadata-http-file/metadata`;

    const memberDetail = await app.inject({ method: "GET", url: detailUrl, headers: baseHeaders(memberCookie) });
    assert.equal(memberDetail.statusCode, 200);
    const initial = memberDetail.json() as Record<string, unknown> & {
      metadataVersion: string; bibliographyVersion: string; originalFilename: string;
      metadata: null; bibliography: null; fieldAuthorities: unknown[]; canEditMetadata: boolean;
    };
    assert.equal(initial.originalFilename, "accepted -- source.pdf");
    assert.equal(initial.metadata, null);
    assert.equal(initial.bibliography, null);
    assert.deepEqual(initial.fieldAuthorities, []);
    assert.equal(initial.canEditMetadata, false);
    assert.equal(initial.metadataVersion.length, 43);
    assert.equal(initial.bibliographyVersion.length, 43);
    for (const forbidden of ["ownerDomainId", "recordId", "artifactId", "versionId", "objectKey", "checksum", "uploadedByAccountId", "favorites", "notes", "readingState"]) {
      assert.equal(forbidden in initial, false);
    }

    const body = {
      metadataVersion: initial.metadataVersion,
      materialType: "book",
      canonicalTitle: "Canonical title",
      subtitle: null,
      alternativeTitles: [],
      dateStatement: "2008",
      identifiers: [],
      typeFields: { editionStatement: "First edition" },
      authorityLinks: [],
    };
    const memberWrite = await app.inject({
      method: "PUT",
      url: updateUrl,
      headers: { ...baseHeaders(memberCookie), "content-type": "application/json" },
      payload: body,
    });
    assert.equal(memberWrite.statusCode, 404);

    const injected = await app.inject({
      method: "PUT",
      url: updateUrl,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: { ...body, ownerDomainId: "library:guessed", actorAccountId: "owner-http" },
    });
    assert.equal(injected.statusCode, 400);

    const authorityResponse = await app.inject({
      method: "POST",
      url: `/api/libraries/${libraryId}/authorities`,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: { type: "person", canonicalLabel: "陈垣", aliases: ["援庵"] },
    });
    assert.equal(authorityResponse.statusCode, 200);
    const authority = (authorityResponse.json() as { authority: { id: string } }).authority;

    const bibliographyUrl = `/api/libraries/${libraryId}/holdings/metadata-http-file/bibliography`;
    const bibliographyBody = {
      bibliographyVersion: initial.bibliographyVersion,
      materialClass: "primary_source_modern_edition",
      contributors: [{ label: "陈垣", role: "collator", roleLabel: "点校", authorityId: authority.id }],
      publication: { publisher: "中华书局", publicationDate: "1976" },
      language: "中文",
      carrierEdition: { editionType: "punctuated_edition", editionStatement: "1976年点校本" },
      sourceEdition: {},
    };
    assert.equal((await app.inject({
      method: "PUT", url: bibliographyUrl,
      headers: { ...baseHeaders(memberCookie), "content-type": "application/json" }, payload: bibliographyBody,
    })).statusCode, 404);
    const bibliographyWrite = await app.inject({
      method: "PUT", url: bibliographyUrl,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" }, payload: bibliographyBody,
    });
    assert.equal(bibliographyWrite.statusCode, 200);
    const bibliographySaved = bibliographyWrite.json() as {
      bibliographyVersion: string;
      bibliography: { materialClass: string; contributors: Array<{ id: string; label: string; role: string; roleLabel: string; authorityId: string }> };
      fieldAuthorities: Array<{ fieldName: string; source: string }>;
    };
    assert.equal(bibliographySaved.bibliography.materialClass, "primary_source_modern_edition");
    assert.deepEqual(bibliographySaved.bibliography.contributors[0], {
      id: bibliographySaved.bibliography.contributors[0]?.id,
      label: "陈垣", role: "collator", roleLabel: "点校", authorityId: authority.id,
    });
    assert.equal(bibliographySaved.fieldAuthorities.some((entry) => entry.fieldName === "materialClass" && entry.source === "human"), true);
    assert.equal((await app.inject({
      method: "PUT", url: bibliographyUrl,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" }, payload: bibliographyBody,
    })).statusCode, 409);
    const restore = await app.inject({
      method: "POST", url: `${bibliographyUrl}/restore-ai`,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: { bibliographyVersion: bibliographySaved.bibliographyVersion, fields: [{ fieldName: "materialClass", scopeKey: "" }] },
    });
    assert.equal(restore.statusCode, 200);
    assert.equal((restore.json() as { fieldAuthorities: Array<{ fieldName: string }> }).fieldAuthorities.some((entry) => entry.fieldName === "materialClass"), false);

    const ownerWrite = await app.inject({
      method: "PUT",
      url: updateUrl,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: { ...body, authorityLinks: [{ authorityId: authority.id, role: "author" }] },
    });
    assert.equal(ownerWrite.statusCode, 200);
    const saved = ownerWrite.json() as { displayTitle: string; originalFilename: string; metadataVersion: string; metadata: { authorityLinks: Array<{ canonicalLabel: string }> } };
    assert.equal(saved.displayTitle, "Canonical title 中华书局1976年点校本");
    assert.equal(saved.originalFilename, "accepted -- source.pdf");
    assert.equal(saved.metadata.authorityLinks[0]?.canonicalLabel, "陈垣");

    const citationUrl = `/api/libraries/${libraryId}/holdings/metadata-http-file/citation`;
    const citation = await app.inject({
      method: "POST",
      url: citationUrl,
      headers: { ...baseHeaders(memberCookie), "content-type": "application/json" },
      payload: {
        style: "lishi-yanjiu",
        locators: [
          { type: "juan", value: "三" },
          { type: "folio", value: "8", side: "verso" },
          { type: "archive_call_number", value: "甲-12" },
        ],
      },
    });
    assert.equal(citation.statusCode, 200);
    const citationBody = citation.json() as {
      style: { id: string; revision: string; sha256: string; source: string };
      cslItem: { title: string; note: string; edition: string };
      outputs: { fullNote: string; shortNote: string; bibliography: string };
    };
    assert.equal(citationBody.style.id, "lishi-yanjiu");
    assert.equal(citationBody.style.sha256.length, 64);
    assert.equal(citationBody.cslItem.title, "Canonical title");
    assert.equal(citationBody.cslItem.note, "陈垣点校");
    assert.match(citationBody.outputs.fullNote, /卷三，第8b叶，档号甲-12/u);
    assert.match(citationBody.outputs.bibliography, /中华书局/u);
    const invalidCitation = await app.inject({
      method: "POST", url: citationUrl,
      headers: { ...baseHeaders(memberCookie), "content-type": "application/json" },
      payload: { style: "lishi-yanjiu", locators: [{ type: "page", value: "1", side: "recto" }] },
    });
    assert.equal(invalidCitation.statusCode, 400);
    const guessedCitation = await app.inject({
      method: "POST", url: `/api/libraries/guessed/holdings/metadata-http-file/citation`,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: { style: "lishi-yanjiu", locators: [] },
    });
    assert.equal(guessedCitation.statusCode, 404);
    const wrongContentType = await app.inject({
      method: "POST", url: citationUrl,
      headers: { ...baseHeaders(memberCookie), "content-type": "text/plain" },
      payload: "not-json",
    });
    assert.equal(wrongContentType.statusCode, 415);

    const stale = await app.inject({
      method: "PUT",
      url: updateUrl,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: body,
    });
    assert.equal(stale.statusCode, 409);
    assert.deepEqual(stale.json(), { error: "concurrent_change" });

    const inaccessibleAuthority = await app.inject({
      method: "PUT",
      url: updateUrl,
      headers: { ...baseHeaders(ownerCookie), "content-type": "application/json" },
      payload: { ...body, metadataVersion: saved.metadataVersion, canonicalTitle: "must not commit", authorityLinks: [{ authorityId: "guessed-authority", role: "author" }] },
    });
    assert.equal(inaccessibleAuthority.statusCode, 404);
    const after = await app.inject({ method: "GET", url: detailUrl, headers: baseHeaders(memberCookie) });
    assert.equal((after.json() as { displayTitle: string }).displayTitle, "Canonical title 中华书局1976年点校本");

    assert.equal((await app.inject({ method: "GET", url: `/api/libraries/guessed/holdings/metadata-http-file/details`, headers: baseHeaders(ownerCookie) })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: `/api/libraries/${libraryId}/holdings/guessed/details`, headers: baseHeaders(ownerCookie) })).statusCode, 404);
  } finally {
    await app.close();
    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
  }
});
