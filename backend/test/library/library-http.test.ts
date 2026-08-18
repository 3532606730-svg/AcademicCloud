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
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../database/migrations", import.meta.url));
const ORIGIN = "http://127.0.0.1";
const PASSWORD = "library-http-password-123";

test("Shared Library HTTP routes enforce server-derived membership and non-disclosure", async () => {
  const dbPath = join(tmpdir(), `academiccloud-library-http-${Date.now()}.sqlite`);
  const provisioning = openSqliteDatabase(dbPath);
  runMigrations(provisioning, MIGRATIONS_DIRECTORY);
  const persistence = new SqlitePersistence(provisioning);
  const passwordHash = await new Argon2idPasswordHasher().hash(PASSWORD);
  persistence.repositories.accounts.create({
    id: "owner-http",
    loginName: "owner-http",
    passwordHash,
    role: "owner",
    state: "active",
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
    updatedAt: new Date("2026-08-18T12:00:00.000Z"),
  });
  persistence.repositories.accounts.create({
    id: "member-http",
    loginName: "member-http",
    passwordHash,
    role: "member",
    state: "active",
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
    updatedAt: new Date("2026-08-18T12:00:00.000Z"),
  });
  const timestamp = new Date("2026-08-18T12:00:00.000Z").toISOString();
  const objectKey = `objects/ee/${"f".repeat(62)}`;
  provisioning.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES ('http-contrib-file', 'account:member-http', 'member-http', NULL, 'http-contrib.pdf',
      'memory', ?, 'application/pdf', 12, 'md5', '1B2M2Y8AsgTpgAmY7PhCfg==', 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(objectKey, timestamp, timestamp, timestamp);
  provisioning.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES ('http-contrib-record', 'account:member-http', 'member-http', 'HTTP contribution', ?, ?)
  `).run(timestamp, timestamp);
  provisioning.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES ('http-contrib-artifact', 'account:member-http', 'http-contrib-record', 'detached', ?, ?)
  `).run(timestamp, timestamp);
  provisioning.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES ('http-contrib-version', 'account:member-http', 'http-contrib-artifact', 'http-contrib-file', ?, ?)
  `).run(timestamp, timestamp);
  provisioning.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = 'http-contrib-artifact'").run();
  provisioning.close();

  const storage = new InMemoryStorageAdapter();
  storage.putObject({ objectKey, sizeBytes: 12, etag: "etag", checksumAlgorithm: "md5", checksum: "1B2M2Y8AsgTpgAmY7PhCfg==", mediaType: "application/pdf", modifiedAt: new Date("2026-08-18T12:00:00.000Z") });
  const app = await createApplication(
    { host: "127.0.0.1", port: 0, logLevel: "silent", environment: "test", appOrigin: ORIGIN },
    { databasePath: dbPath, migrationsDirectory: MIGRATIONS_DIRECTORY },
    storage,
  );

  function headers(cookie: string) {
    return { accept: "application/json", origin: ORIGIN, cookie };
  }

  function cookieFrom(response: { headers: Record<string, unknown> }): string {
    const value = response.headers["set-cookie"];
    return (Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined)?.split(";", 1)[0] ?? "";
  }

  try {
    const ownerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { accept: "application/json", origin: ORIGIN, "content-type": "application/json" },
      payload: { loginName: "owner-http", password: PASSWORD },
    });
    assert.equal(ownerLogin.statusCode, 200);
    const ownerCookie = cookieFrom(ownerLogin);
    assert.ok(ownerCookie);

    const retiredCreation = await app.inject({
      method: "POST",
      url: "/api/libraries",
      headers: { ...headers(ownerCookie), "content-type": "application/json" },
      payload: { name: "HTTP Shared Library" },
    });
    assert.equal(retiredCreation.statusCode, 404);
    const ownerLibraries = await app.inject({ method: "GET", url: "/api/libraries", headers: headers(ownerCookie) });
    const libraryId = (ownerLibraries.json() as { libraries: Array<{ id: string; isDefault: boolean }> }).libraries
      .find((library) => library.isDefault)?.id;
    assert.ok(libraryId);

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { accept: "application/json", origin: ORIGIN, "content-type": "application/json" },
      payload: { loginName: "member-http", password: PASSWORD },
    });
    assert.equal(memberLogin.statusCode, 200);
    const memberCookie = cookieFrom(memberLogin);

    const memberLibraries = await app.inject({ method: "GET", url: "/api/libraries", headers: headers(memberCookie) });
    assert.equal(memberLibraries.statusCode, 200);
    const defaultLibrary = (memberLibraries.json() as { libraries: Array<{ id: string; isDefault: boolean }> }).libraries
      .find((library) => library.isDefault);
    assert.ok(defaultLibrary);
    const reserved = await app.inject({
      method: "POST",
      url: "/api/drive/uploads",
      headers: { ...headers(memberCookie), "content-type": "application/json" },
      payload: {
        folderId: null,
        displayName: "automatic-intake.pdf",
        mediaType: "application/pdf",
        sizeBytes: 12,
        checksum: { algorithm: "md5", value: "1B2M2Y8AsgTpgAmY7PhCfg==" },
      },
    });
    assert.equal(reserved.statusCode, 201);
    const reservation = reserved.json() as { file: { id: string }; upload: { fields: { key: string } } };
    storage.putObject({
      objectKey: reservation.upload.fields.key,
      sizeBytes: 12,
      etag: "etag",
      checksumAlgorithm: "md5",
      checksum: "1B2M2Y8AsgTpgAmY7PhCfg==",
      mediaType: "application/pdf",
      modifiedAt: new Date("2026-08-18T12:00:00.000Z"),
    });
    const completed = await app.inject({
      method: "POST",
      url: `/api/drive/uploads/${reservation.file.id}/complete`,
      headers: headers(memberCookie),
    });
    assert.equal(completed.statusCode, 200);
    const defaultPending = await app.inject({
      method: "GET",
      url: `/api/libraries/${defaultLibrary.id}/contributions`,
      headers: headers(ownerCookie),
    });
    assert.equal(defaultPending.statusCode, 200);
    const automaticContribution = (defaultPending.json() as { contributions: Array<{ id: string }> }).contributions[0];
    assert.ok(automaticContribution);
    const hiddenBeforeApproval = await app.inject({
      method: "GET",
      url: `/api/libraries/${defaultLibrary.id}/holdings`,
      headers: headers(memberCookie),
    });
    assert.equal((hiddenBeforeApproval.json() as { holdings: unknown[] }).holdings.length, 0);
    assert.equal((await app.inject({
      method: "POST",
      url: `/api/libraries/${defaultLibrary.id}/contributions/${automaticContribution.id}/approve`,
      headers: headers(ownerCookie),
    })).statusCode, 200);
    const visibleAfterApproval = await app.inject({
      method: "GET",
      url: `/api/libraries/${defaultLibrary.id}/holdings`,
      headers: headers(memberCookie),
    });
    assert.equal((visibleAfterApproval.json() as { holdings: Array<{ file: { id: string } }> }).holdings[0]?.file.id, reservation.file.id);

    const submitted = await app.inject({
      method: "POST",
      url: `/api/libraries/${libraryId}/contributions`,
      headers: { ...headers(memberCookie), "content-type": "application/json" },
      payload: { artifactId: "http-contrib-artifact" },
    });
    assert.equal(submitted.statusCode, 201);
    const contributionId = (submitted.json() as { contribution: { id: string } }).contribution.id;
    const pending = await app.inject({ method: "GET", url: `/api/libraries/${libraryId}/contributions`, headers: headers(ownerCookie) });
    assert.equal(pending.statusCode, 200);
    assert.equal((pending.json() as { contributions: unknown[] }).contributions.length, 1);
    const approved = await app.inject({ method: "POST", url: `/api/libraries/${libraryId}/contributions/${contributionId}/approve`, headers: headers(ownerCookie) });
    assert.equal(approved.statusCode, 200);

    const libraries = await app.inject({ method: "GET", url: "/api/libraries", headers: headers(memberCookie) });
    assert.equal(libraries.statusCode, 200);
    assert.equal((libraries.json() as { libraries: unknown[] }).libraries.length, 1);

    const holdings = await app.inject({ method: "GET", url: `/api/libraries/${libraryId}/holdings`, headers: headers(memberCookie) });
    assert.equal(holdings.statusCode, 200);
    assert.equal((holdings.json() as { holdings: unknown[] }).holdings.length, 2);

    const nonexistent = await app.inject({ method: "GET", url: "/api/libraries/not-a-library/holdings", headers: headers(memberCookie) });
    assert.equal(nonexistent.statusCode, 404);
    assert.deepEqual(nonexistent.json(), { error: "not_found" });

    const memberManagement = await app.inject({ method: "GET", url: `/api/libraries/${libraryId}/members`, headers: headers(memberCookie) });
    assert.equal(memberManagement.statusCode, 404);
    assert.deepEqual(memberManagement.json(), { error: "not_found" });
  } finally {
    await app.close();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
  }
});
