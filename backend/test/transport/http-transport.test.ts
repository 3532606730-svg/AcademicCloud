// http-transport.test.ts
//
// Real-loopback HTTP transport regression for the bodyless-action contract.
// app.inject() bypasses the real HTTP content-type parser; this test starts
// the actual Fastify app on localhost and drives it with real fetch, proving:
//   1. a correct bodyless action (no Content-Type, no body) reaches the handler
//   2. the known bad boundary (Content-Type: application/json + empty body)
//      is rejected by the JSON parser with 400 before any handler runs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Argon2idPasswordHasher } from "../../src/auth/password-hasher.js";
import { provisionAccount } from "../../src/operations/account-provision.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createApplication } from "../../src/platform/application.js";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../database/migrations", import.meta.url));
const ORIGIN = "http://127.0.0.1";

test("bodyless actions reach the handler over real HTTP; JSON-header-empty-body is rejected with 400", async () => {
  const dbPath = join(tmpdir(), `http-transport-${Date.now()}.sqlite`);
  const provisioning = openSqliteDatabase(dbPath);
  runMigrations(provisioning, MIGRATIONS_DIRECTORY);
  const persistence = new SqlitePersistence(provisioning);
  await provisionAccount(persistence, new Argon2idPasswordHasher(), "transport", "transport-password-123456");
  provisioning.close();

  const app = await createApplication(
    { host: "127.0.0.1", port: 0, logLevel: "silent", environment: "test", appOrigin: ORIGIN },
    { databasePath: dbPath, migrationsDirectory: MIGRATIONS_DIRECTORY },
    new InMemoryStorageAdapter(),
  );

  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: ORIGIN },
      body: JSON.stringify({ loginName: "transport", password: "transport-password-123456" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0]?.trim() ?? "";
    assert.ok(cookie.length > 0);

    const folder = await fetch(`${base}/api/drive/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify({ name: "transport-folder", parentId: null }),
    });
    assert.equal(folder.status, 201);
    const folderId = ((await folder.json()) as { folder: { id: string } }).folder.id;

    const payload = Buffer.alloc(4096, 0x62);
    const reservation = await fetch(`${base}/api/drive/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify({
        folderId,
        displayName: "transport.bin",
        mediaType: "application/octet-stream",
        sizeBytes: payload.length,
        checksum: { algorithm: "md5", value: createHash("md5").update(payload).digest("base64") },
      }),
    });
    assert.equal(reservation.status, 201);
    const fileId = ((await reservation.json()) as { file: { id: string } }).file.id;

    // 1. Correct bodyless action (NO Content-Type, NO body) reaches the handler:
    //    the in-memory store has no object, so the handler answers
    //    409 upload_incomplete — proving the parser accepted the request.
    const complete = await fetch(`${base}/api/drive/uploads/${encodeURIComponent(fileId)}/complete`, {
      method: "POST",
      headers: { Accept: "application/json", Origin: ORIGIN, Cookie: cookie },
    });
    assert.equal(complete.status, 409);
    assert.deepEqual(await complete.json(), { error: "upload_incomplete" });

    // 2. Bad boundary: Content-Type application/json with an EMPTY body is
    //    rejected by the JSON parser with 400 before the handler runs.
    const badShape = await fetch(`${base}/api/drive/uploads/${encodeURIComponent(fileId)}/complete`, {
      method: "POST",
      headers: { Accept: "application/json", Origin: ORIGIN, Cookie: cookie, "Content-Type": "application/json" },
    });
    assert.equal(badShape.status, 400);
    assert.deepEqual(await badShape.json(), { error: "invalid_request" });

    // 3. Bodyless logout over real HTTP still works (204) and revokes the session.
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Accept: "application/json", Origin: ORIGIN, Cookie: cookie },
    });
    assert.equal(logout.status, 204);
    const revoked = await fetch(`${base}/api/auth/session`, {
      headers: { Accept: "application/json", Cookie: cookie },
    });
    assert.equal(revoked.status, 401);
  } finally {
    await app.close();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
  }
});
