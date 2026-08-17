import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { createApp } from "../../src/platform/app.js";
import { ScholarlyRecordService } from "../../src/research/service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const NOW = new Date("2026-08-17T12:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

const hasher: PasswordHasher = {
  hash: (value) => Promise.resolve(`test:${value}`),
  verify: (encoded, value) => Promise.resolve(encoded === `test:${value}`),
};

function cookieFrom(headers: OutgoingHttpHeaders): string {
  const header = headers["set-cookie"];
  assert.ok(header);
  return (Array.isArray(header) ? header[0]! : String(header)).split(";", 1)[0]!;
}

async function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  for (const [id, role] of [["owner-a", "owner"], ["member-b", "member"]] as const) {
    persistence.repositories.accounts.create({
      id,
      loginName: id,
      passwordHash: "test:password",
      role,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const storage = new InMemoryStorageAdapter(() => NOW);
  const driveService = new DriveService(persistence, storage, () => NOW);
  const researchService = new ScholarlyRecordService(persistence, () => NOW);
  const authService = new AuthService({ persistence, passwordHasher: hasher, now: () => NOW });
  const app = await createApp({
    logger: false,
    auth: { service: authService, appOrigin: ORIGIN, environment: "test" },
    research: { service: researchService },
  });
  context.after(() => app.close());

  async function login(loginName: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { loginName, password: "password" },
    });
    assert.equal(response.statusCode, 200);
    return cookieFrom(response.headers);
  }

  async function activeFile(ownerId: string, displayName: string) {
    const reserved = await driveService.createUpload(ownerId, {
      folderId: null,
      displayName,
      mediaType: "application/pdf",
      sizeBytes: 8,
      checksum: { algorithm: "md5", value: MD5 },
    });
    storage.putObject({
      objectKey: reserved.file.objectKey,
      sizeBytes: 8,
      etag: "etag",
      checksumAlgorithm: "md5",
      checksum: MD5,
      mediaType: "application/pdf",
      modifiedAt: NOW,
    });
    return driveService.completeUpload(ownerId, reserved.file.id);
  }

  return { app, persistence, login, activeFile };
}

test("Owner and Member create private records, attach active files, and detach without authority fields", async (context) => {
  const { app, login, activeFile } = await fixture(context);
  for (const loginName of ["owner-a", "member-b"] as const) {
    const cookie = await login(loginName);
    const file = await activeFile(loginName, `${loginName}.pdf`);
    const created = await app.inject({
      method: "POST",
      url: "/api/research/records",
      headers: { cookie, origin: ORIGIN },
      payload: { label: `${loginName} record` },
    });
    assert.equal(created.statusCode, 201);
    const recordId = created.json().record.id as string;
    const attachQueryAttack = await app.inject({
      method: "POST",
      url: `/api/research/records/${recordId}/artifacts?ownerId=${loginName}`,
      headers: { cookie, origin: ORIGIN },
      payload: { fileId: file.id },
    });
    assert.equal(attachQueryAttack.statusCode, 400);
    const attached = await app.inject({
      method: "POST",
      url: `/api/research/records/${recordId}/artifacts`,
      headers: { cookie, origin: ORIGIN },
      payload: { fileId: file.id },
    });
    assert.equal(attached.statusCode, 200);
    const record = attached.json().record;
    assert.equal(record.artifacts[0].version.file.displayName, `${loginName}.pdf`);
    assert.equal(record.artifacts[0].version.file.availability, "available");
    assert.equal(JSON.stringify(record).includes("ownerDomainId"), false);
    assert.equal(JSON.stringify(record).includes("objectKey"), false);

    const detachAuthorityAttack = await app.inject({
      method: "DELETE",
      url: `/api/research/records/${recordId}/artifacts/${record.artifacts[0].id}`,
      headers: { cookie, origin: ORIGIN },
      payload: { ownerId: "owner-a", ownerDomainId: "account:owner-a", role: "owner" },
    });
    assert.equal(detachAuthorityAttack.statusCode, 400);
    assert.deepEqual(detachAuthorityAttack.json(), { error: "invalid_request" });
    const detachQueryAttack = await app.inject({
      method: "DELETE",
      url: `/api/research/records/${recordId}/artifacts/${record.artifacts[0].id}?role=owner`,
      headers: { cookie, origin: ORIGIN },
    });
    assert.equal(detachQueryAttack.statusCode, 400);

    const detached = await app.inject({
      method: "DELETE",
      url: `/api/research/records/${recordId}/artifacts/${record.artifacts[0].id}`,
      headers: { cookie, origin: ORIGIN },
    });
    assert.equal(detached.statusCode, 200);
    assert.equal(detached.json().record.artifacts[0].attachmentState, "detached");
  }
});

test("research HTTP hides foreign and missing identities and rejects authority injection", async (context) => {
  const { app, login, activeFile } = await fixture(context);
  const ownerCookie = await login("owner-a");
  const memberCookie = await login("member-b");
  const foreignFile = await activeFile("member-b", "foreign.pdf");
  const created = await app.inject({
    method: "POST",
    url: "/api/research/records",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { label: "Owner record" },
  });
  const recordId = created.json().record.id as string;

  for (const id of [recordId, "missing-record"]) {
    const hidden = await app.inject({ method: "GET", url: `/api/research/records/${id}`, headers: { cookie: memberCookie } });
    assert.equal(hidden.statusCode, 404);
    assert.deepEqual(hidden.json(), { error: "not_found" });
  }
  const attachForeign = await app.inject({
    method: "POST",
    url: `/api/research/records/${recordId}/artifacts`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { fileId: foreignFile.id },
  });
  assert.equal(attachForeign.statusCode, 404);

  const authorityAttack = await app.inject({
    method: "POST",
    url: "/api/research/records",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { label: "Attack", ownerId: "member-b", ownerDomainId: "account:member-b", role: "owner" },
  });
  assert.equal(authorityAttack.statusCode, 400);
  assert.deepEqual(authorityAttack.json(), { error: "invalid_request" });

  const queryAuthorityAttack = await app.inject({
    method: "POST",
    url: "/api/research/records?ownerId=member-b&role=owner",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { label: "Attack" },
  });
  assert.equal(queryAuthorityAttack.statusCode, 400);
  assert.deepEqual(queryAuthorityAttack.json(), { error: "invalid_request" });
  const unboundedList = await app.inject({
    method: "GET",
    url: "/api/research/records?limit=101",
    headers: { cookie: ownerCookie },
  });
  assert.equal(unboundedList.statusCode, 400);
});

test("research unsafe routes require exact origin and a still-active account", async (context) => {
  const { app, persistence, login } = await fixture(context);
  const cookie = await login("member-b");
  const badOrigin = await app.inject({
    method: "POST",
    url: "/api/research/records",
    headers: { cookie, origin: "https://evil.example" },
    payload: { label: "Blocked" },
  });
  assert.equal(badOrigin.statusCode, 403);

  assert.equal(persistence.repositories.accounts.updateState("member-b", "active", "disabled", NOW), true);
  const disabled = await app.inject({
    method: "POST",
    url: "/api/research/records",
    headers: { cookie, origin: ORIGIN },
    payload: { label: "Blocked" },
  });
  assert.equal(disabled.statusCode, 401);

  const unauthenticated = await app.inject({ method: "GET", url: "/api/research/records" });
  assert.equal(unauthenticated.statusCode, 401);
});
