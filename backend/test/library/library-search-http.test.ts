import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Argon2idPasswordHasher } from "../../src/auth/password-hasher.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { createApplication } from "../../src/platform/application.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../database/migrations", import.meta.url));
const ORIGIN = "http://127.0.0.1";
const PASSWORD = "search-http-password-123";

test("catalogue search HTTP route is authority-safe and query-bounded", async () => {
  const dbPath = join(tmpdir(), `academiccloud-search-http-${Date.now()}.sqlite`);
  const provisioning = openSqliteDatabase(dbPath);
  runMigrations(provisioning, MIGRATIONS_DIRECTORY);
  const passwordHash = await new Argon2idPasswordHasher().hash(PASSWORD);
  for (const account of [
    { id: "owner-search", loginName: "owner-search", role: "owner" as const },
    { id: "member-search", loginName: "member-search", role: "member" as const },
    { id: "outsider-search", loginName: "outsider-search", role: "member" as const },
  ]) {
    provisioning.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(account.id, account.loginName, passwordHash, account.role, new Date("2026-08-18T12:00:00.000Z").toISOString(), new Date("2026-08-18T12:00:00.000Z").toISOString());
  }
  const defaultLibrary = provisioning.prepare("SELECT id, owner_domain_id FROM libraries WHERE is_default = 1 LIMIT 1").get() as { id: string; owner_domain_id: string };
  assert.ok(defaultLibrary);

  const timestamp = new Date("2026-08-18T12:00:00.000Z").toISOString();
  const fileId = "search-http-file";
  const recordId = "search-http-record";
  provisioning.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at, deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, 'owner-search', NULL, 'scan-001.pdf', 'memory', ?, 'application/pdf', 12, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, defaultLibrary.owner_domain_id, `objects/ff/${"d".repeat(62)}`, "YWNhZGVtaWNjb3Vk", timestamp, timestamp, timestamp);
  provisioning.prepare("INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at) VALUES (?, ?, 'owner-search', 'Search book', ?, ?)")
    .run(recordId, defaultLibrary.owner_domain_id, timestamp, timestamp);
  provisioning.prepare("INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at) VALUES (?, ?, ?, 'detached', ?, ?)")
    .run("search-http-artifact", defaultLibrary.owner_domain_id, recordId, timestamp, timestamp);
  provisioning.prepare("INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("search-http-version", defaultLibrary.owner_domain_id, "search-http-artifact", fileId, timestamp, timestamp);
  provisioning.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run("search-http-artifact");
  provisioning.prepare(`
    INSERT INTO scholarly_record_metadata (
      record_id, owner_domain_id, contract_version, material_type, canonical_title,
      subtitle, date_statement, revision, created_by_account_id, updated_by_account_id, created_at, updated_at
    ) VALUES (?, ?, 1, 'book', '元代宰相制度研究', NULL, '1997', 1, 'owner-search', 'owner-search', ?, ?)
  `).run(recordId, defaultLibrary.owner_domain_id, timestamp, timestamp);
  provisioning.prepare(`
    INSERT INTO scholarly_authorities (id, owner_domain_id, authority_type, canonical_label, revision, created_by_account_id, updated_by_account_id, created_at, updated_at)
    VALUES ('search-http-author', ?, 'person', '张帆', 1, 'owner-search', 'owner-search', ?, ?)
  `).run(defaultLibrary.owner_domain_id, timestamp, timestamp);
  provisioning.prepare("INSERT INTO scholarly_record_authority_links (record_id, owner_domain_id, position, authority_id, role) VALUES (?, ?, 0, 'search-http-author', 'author')")
    .run(recordId, defaultLibrary.owner_domain_id);
  provisioning.prepare(`
    INSERT INTO scholarly_bibliographic_profiles (
      record_id, owner_domain_id, material_class, publication_publisher, publication_place,
      publication_date, series_title, volume_part, language_label, carrier_edition_type,
      revision, created_by_account_id, updated_by_account_id, created_at, updated_at
    ) VALUES (?, ?, 'primary_source_modern_edition', '中华书局', '北京', '1976',
      '二十四史', '第一册', '汉语', 'annotated_edition', 1, 'owner-search', 'owner-search', ?, ?)
  `).run(recordId, defaultLibrary.owner_domain_id, timestamp, timestamp);
  provisioning.prepare(`
    INSERT INTO scholarly_bibliographic_contributors (
      id, record_id, owner_domain_id, position, label, role, role_label, authority_id
    ) VALUES ('search-http-contributor', ?, ?, 0, '顾颉刚', 'annotator', '点校', NULL)
  `).run(recordId, defaultLibrary.owner_domain_id);
  provisioning.prepare(`
    INSERT INTO scholarly_bibliographic_source_editions (
      record_id, owner_domain_id, dynasty, reign_title, edition_type
    ) VALUES (?, ?, '元', '至正', 'engraved')
  `).run(recordId, defaultLibrary.owner_domain_id);
  provisioning.close();

  const app = await createApplication(
    { host: "127.0.0.1", port: 0, logLevel: "silent", environment: "test", appOrigin: ORIGIN },
    { databasePath: dbPath, migrationsDirectory: MIGRATIONS_DIRECTORY },
    new InMemoryStorageAdapter(),
  );

  function headers(cookie: string) {
    return { accept: "application/json", origin: ORIGIN, cookie };
  }
  function cookieFrom(response: { headers: Record<string, unknown> }): string {
    const value = response.headers["set-cookie"];
    return (Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined)?.split(";", 1)[0] ?? "";
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

  try {
    const memberCookie = await login("member-search");
    const found = await app.inject({ method: "GET", url: `/api/libraries/${defaultLibrary.id}/holdings/search?q=${encodeURIComponent("元代宰相")}`, headers: headers(memberCookie) });
    assert.equal(found.statusCode, 200);
    const body = found.json() as { results: Array<{ fileId: string; canonicalTitle: string | null }>; nextCursor: string | null };
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0]?.fileId, fileId);
    assert.equal(body.results[0]?.canonicalTitle, "元代宰相制度研究");

    const filtered = await app.inject({
      method: "GET",
      url: `/api/libraries/${defaultLibrary.id}/holdings/search?materialClass=primary_source_modern_edition&publisher=${encodeURIComponent("中华书局")}&year=1976&editorialRole=annotator&sort=title_asc`,
      headers: headers(memberCookie),
    });
    assert.equal(filtered.statusCode, 200);
    assert.deepEqual((filtered.json() as { results: Array<{ fileId: string; materialClass: string; catalogueDisplayTitle: string }> }).results, [{
      fileId,
      materialClass: "primary_source_modern_edition",
      catalogueDisplayTitle: "元代宰相制度研究 中华书局1976点校本",
      canonicalTitle: "元代宰相制度研究",
      authorLabels: ["张帆"],
      contributorLabels: ["顾颉刚"],
      date: "1976",
      publisher: "中华书局",
      materialType: "book",
      language: "汉语",
      editionStatement: "中华书局1976点校本",
      displayName: "scan-001.pdf",
    }]);

    const noMatch = await app.inject({ method: "GET", url: `/api/libraries/${defaultLibrary.id}/holdings/search?q=${encodeURIComponent("不存在")}`, headers: headers(memberCookie) });
    assert.equal(noMatch.statusCode, 200);
    assert.equal((noMatch.json() as { results: unknown[] }).results.length, 0);

    // A guessed/non-existent library fails closed as not_found, identical to
    // the caller being unable to access any matching resource.
    const denied = await app.inject({ method: "GET", url: `/api/libraries/does-not-exist/holdings/search?q=${encodeURIComponent("元代宰相")}`, headers: headers(memberCookie) });
    assert.equal(denied.statusCode, 404);

    const empty = await app.inject({ method: "GET", url: `/api/libraries/${defaultLibrary.id}/holdings/search?q=${encodeURIComponent("   ")}`, headers: headers(memberCookie) });
    assert.equal(empty.statusCode, 400);

    const tooLong = await app.inject({ method: "GET", url: `/api/libraries/${defaultLibrary.id}/holdings/search?q=${encodeURIComponent("a".repeat(101))}`, headers: headers(memberCookie) });
    assert.equal(tooLong.statusCode, 400);

    const invalidMaterial = await app.inject({ method: "GET", url: `/api/libraries/${defaultLibrary.id}/holdings/search?materialClass=book`, headers: headers(memberCookie) });
    assert.equal(invalidMaterial.statusCode, 400);
  } finally {
    await app.close();
    rmSync(dbPath, { force: true });
  }
});
