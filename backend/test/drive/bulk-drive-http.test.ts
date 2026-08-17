import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { driveEntryVersion } from "../../src/drive/bulk.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { createApp } from "../../src/platform/app.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const NOW = new Date("2026-08-17T12:00:00.000Z");

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
  const authService = new AuthService({ persistence, passwordHasher: hasher, now: () => NOW });
  const driveService = new DriveService(persistence, new InMemoryStorageAdapter(() => NOW), () => NOW);
  const app = await createApp({
    logger: false,
    auth: { service: authService, appOrigin: ORIGIN, environment: "test" },
    drive: { service: driveService },
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

  return { app, persistence, driveService, login };
}

test("bulk HTTP is session-scoped for Owner and Member and returns deterministic atomic results", async (context) => {
  const { app, driveService, login } = await fixture(context);
  const ownerFolder = driveService.createFolder("owner-a", "Owner folder", null);
  const memberFolder = driveService.createFolder("member-b", "Member folder", null);
  const ownerCookie = await login("owner-a");
  const memberCookie = await login("member-b");

  for (const [cookie, folder] of [[ownerCookie, ownerFolder], [memberCookie, memberFolder]] as const) {
    const response = await app.inject({
      method: "POST",
      url: "/api/drive/bulk",
      headers: { cookie, origin: ORIGIN },
      payload: {
        action: "favorite_add",
        items: [{ kind: "folder", id: folder.id, version: driveEntryVersion(folder) }],
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      action: "favorite_add",
      atomic: true,
      items: [{
        kind: "folder",
        id: folder.id,
        outcome: "succeeded",
        version: driveEntryVersion(folder),
      }],
    });
  }
});

test("bulk HTTP hides foreign and missing IDs and rejects authority, duplicate, and destination attacks", async (context) => {
  const { app, driveService, login } = await fixture(context);
  const ownerFolder = driveService.createFolder("owner-a", "Owner folder", null);
  const memberFolder = driveService.createFolder("member-b", "Member folder", null);
  const ownerCookie = await login("owner-a");

  for (const selected of [
    { kind: "folder", id: memberFolder.id, version: driveEntryVersion(memberFolder) },
    { kind: "folder", id: "missing-folder", version: "a".repeat(43) },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/drive/bulk",
      headers: { cookie: ownerCookie, origin: ORIGIN },
      payload: { action: "favorite_add", items: [selected] },
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "not_found" });
  }

  const authorityAttack = await app.inject({
    method: "POST",
    url: "/api/drive/bulk",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      action: "move",
      items: [{
        kind: "folder",
        id: ownerFolder.id,
        version: driveEntryVersion(ownerFolder),
        ownerId: "member-b",
        ownerDomainId: "account:member-b",
        role: "owner",
      }],
      destinationFolderId: null,
      creatorAccountId: "member-b",
    },
  });
  assert.equal(authorityAttack.statusCode, 400);

  const duplicate = await app.inject({
    method: "POST",
    url: "/api/drive/bulk",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      action: "favorite_add",
      items: [
        { kind: "folder", id: ownerFolder.id, version: driveEntryVersion(ownerFolder) },
        { kind: "folder", id: ownerFolder.id, version: driveEntryVersion(ownerFolder) },
      ],
    },
  });
  assert.equal(duplicate.statusCode, 400);
  assert.deepEqual(duplicate.json(), { error: "invalid_request" });

  const missingDestination = await app.inject({
    method: "POST",
    url: "/api/drive/bulk",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      action: "move",
      items: [{ kind: "folder", id: ownerFolder.id, version: driveEntryVersion(ownerFolder) }],
    },
  });
  assert.equal(missingDestination.statusCode, 400);
  assert.deepEqual(missingDestination.json(), { error: "invalid_request" });
});

test("bulk HTTP requires exact origin and a still-active account", async (context) => {
  const { app, persistence, driveService, login } = await fixture(context);
  const folder = driveService.createFolder("member-b", "Member folder", null);
  const cookie = await login("member-b");
  const body = {
    action: "favorite_add",
    items: [{ kind: "folder", id: folder.id, version: driveEntryVersion(folder) }],
  };

  const badOrigin = await app.inject({
    method: "POST",
    url: "/api/drive/bulk",
    headers: { cookie, origin: "https://evil.example" },
    payload: body,
  });
  assert.equal(badOrigin.statusCode, 403);

  assert.equal(persistence.repositories.accounts.updateState("member-b", "active", "disabled", NOW), true);
  const disabled = await app.inject({
    method: "POST",
    url: "/api/drive/bulk",
    headers: { cookie, origin: ORIGIN },
    payload: body,
  });
  assert.equal(disabled.statusCode, 401);
});
