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

    const created = await app.inject({
      method: "POST",
      url: "/api/libraries",
      headers: { ...headers(ownerCookie), "content-type": "application/json" },
      payload: { name: "HTTP Shared Library" },
    });
    assert.equal(created.statusCode, 201);
    const libraryId = (created.json() as { library: { id: string } }).library.id;

    const added = await app.inject({
      method: "POST",
      url: `/api/libraries/${libraryId}/members`,
      headers: { ...headers(ownerCookie), "content-type": "application/json" },
      payload: { accountId: "member-http", role: "member" },
    });
    assert.equal(added.statusCode, 200);

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { accept: "application/json", origin: ORIGIN, "content-type": "application/json" },
      payload: { loginName: "member-http", password: PASSWORD },
    });
    assert.equal(memberLogin.statusCode, 200);
    const memberCookie = cookieFrom(memberLogin);

    const libraries = await app.inject({ method: "GET", url: "/api/libraries", headers: headers(memberCookie) });
    assert.equal(libraries.statusCode, 200);
    assert.equal((libraries.json() as { libraries: unknown[] }).libraries.length, 1);

    const holdings = await app.inject({ method: "GET", url: `/api/libraries/${libraryId}/holdings`, headers: headers(memberCookie) });
    assert.equal(holdings.statusCode, 200);
    assert.deepEqual(holdings.json(), { holdings: [] });

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
