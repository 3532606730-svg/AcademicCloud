import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createApplication } from "../../src/platform/application.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

test("application composition migrates and closes its SQLite database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-application-"));
  const databasePath = join(directory, "application.sqlite");
  const app = await createApplication(
    {
      host: "127.0.0.1",
      port: 3000,
      logLevel: "silent",
      environment: "test",
      appOrigin: "http://127.0.0.1:5173",
    },
    { databasePath, migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY },
    new InMemoryStorageAdapter(),
  );

  try {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(response.statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/api/ready" })).statusCode, 200);
    assert.equal(existsSync(databasePath), true);
  } finally {
    await app.close();
  }

  rmSync(directory, { recursive: true, force: true });
  assert.equal(existsSync(directory), false);
});
