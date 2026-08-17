import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { AnnouncementService } from "../../src/announcements/announcement-service.js";
import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { createApp } from "../../src/platform/app.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const START = new Date("2026-08-17T10:00:00.000Z");
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function cookieFrom(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const value = response.headers["set-cookie"];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.split(";", 1)[0] ?? "" : "";
}

async function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  for (const account of [
    { id: "owner-1", loginName: "Owner", passwordHash: "hash:owner-password-123", role: "owner" as const },
    { id: "member-1", loginName: "Member", passwordHash: "hash:member-password-123", role: "member" as const },
  ]) {
    persistence.repositories.accounts.create({ ...account, state: "active", createdAt: START, updatedAt: START });
  }
  let now = START;
  let id = 0;
  const authService = new AuthService({ persistence, passwordHasher: hasher, now: () => now });
  const announcementService = new AnnouncementService({
    persistence,
    now: () => now,
    createId: () => `announcement-${++id}`,
  });
  const app = await createApp({
    logger: false,
    auth: { service: authService, appOrigin: ORIGIN, environment: "development", loginRateLimitMax: 100 },
    announcements: { service: announcementService },
  });
  context.after(() => app.close());

  async function login(loginName: string, password: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      payload: { loginName, password },
    });
    assert.equal(response.statusCode, 200);
    return cookieFrom(response);
  }

  return {
    app,
    persistence,
    setNow: (value: Date) => { now = value; },
    ownerCookie: await login("Owner", "owner-password-123"),
    memberCookie: await login("Member", "member-password-123"),
  };
}

const validBody = {
  title: "Archive hours",
  body: "The reading room closes at 18:00.",
  severity: "info",
  linkUrl: "https://example.edu/archive",
  expiresAt: "2026-08-18T10:00:00.000Z",
};

test("Owner creates, edits, publishes, and unpublishes safe announcement DTOs", async (context) => {
  const { app, ownerCookie, memberCookie, setNow } = await fixture(context);
  const created = await app.inject({
    method: "POST",
    url: "/api/announcements",
    headers: { origin: ORIGIN, cookie: ownerCookie },
    payload: validBody,
  });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.json().announcement, {
    id: "announcement-1",
    ...validBody,
    isActive: false,
    publishedAt: null,
    createdByAccountId: "owner-1",
    createdAt: START.toISOString(),
    updatedAt: START.toISOString(),
  });

  setNow(new Date("2026-08-17T10:01:00.000Z"));
  const edited = await app.inject({
    method: "PATCH",
    url: "/api/announcements/announcement-1",
    headers: { origin: ORIGIN, cookie: ownerCookie },
    payload: { ...validBody, title: "Updated", body: "<img src=x onerror=alert(1)>", severity: "warning", linkUrl: null },
  });
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.json().announcement.id, "announcement-1");
  assert.equal(edited.json().announcement.createdByAccountId, "owner-1");

  setNow(new Date("2026-08-17T10:02:00.000Z"));
  const published = await app.inject({
    method: "POST",
    url: "/api/announcements/announcement-1/publish",
    headers: { origin: ORIGIN, cookie: ownerCookie },
  });
  assert.equal(published.statusCode, 200);
  assert.equal(published.json().announcement.publishedAt, "2026-08-17T10:02:00.000Z");

  const ownerRead = await app.inject({ method: "GET", url: "/api/announcements", headers: { cookie: ownerCookie } });
  const memberRead = await app.inject({ method: "GET", url: "/api/announcements", headers: { cookie: memberCookie } });
  assert.equal(ownerRead.statusCode, 200);
  assert.deepEqual(memberRead.json(), ownerRead.json());
  assert.equal(ownerRead.json().announcements[0].body, "<img src=x onerror=alert(1)>");

  const unpublished = await app.inject({
    method: "POST",
    url: "/api/announcements/announcement-1/unpublish",
    headers: { origin: ORIGIN, cookie: ownerCookie },
  });
  assert.equal(unpublished.statusCode, 200);
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/announcements", headers: { cookie: memberCookie } })).json(), { announcements: [] });
});

test("unauthenticated reads fail and Members are denied on every administration route", async (context) => {
  const { app, memberCookie, persistence } = await fixture(context);
  assert.deepEqual(
    { status: (await app.inject({ method: "GET", url: "/api/announcements" })).statusCode },
    { status: 401 },
  );
  for (const request of [
    { method: "GET", url: "/api/announcements/admin" },
    { method: "POST", url: "/api/announcements", payload: validBody },
    { method: "PATCH", url: "/api/announcements/any", payload: validBody },
    { method: "POST", url: "/api/announcements/any/publish" },
    { method: "POST", url: "/api/announcements/any/unpublish" },
  ] as const) {
    const response = await app.inject({
      ...request,
      headers: { cookie: memberCookie, ...(request.method === "GET" ? {} : { origin: ORIGIN }) },
    });
    assert.equal(response.statusCode, 403, `${request.method} ${request.url}`);
  }
  assert.deepEqual(
    persistence.repositories.audit.listBefore(null, 20)
      .filter((event) => event.outcome === "denied" && event.action.startsWith("announcements."))
      .map((event) => ({ action: event.action, actor: event.actorAccountId, target: event.targetId, reason: event.reason }))
      .sort((left, right) => left.action.localeCompare(right.action)),
    [
      { action: "announcements.create", actor: "member-1", target: null, reason: "authorization_denied" },
      { action: "announcements.edit", actor: "member-1", target: null, reason: "authorization_denied" },
      { action: "announcements.publish", actor: "member-1", target: null, reason: "authorization_denied" },
      { action: "announcements.unpublish", actor: "member-1", target: null, reason: "authorization_denied" },
    ],
  );
});

test("announcement inputs cannot override authority/timestamps and unsafe links are rejected", async (context) => {
  const { app, ownerCookie } = await fixture(context);
  for (const extra of [
    { createdByAccountId: "member-1" },
    { isActive: true },
    { publishedAt: START.toISOString() },
    { createdAt: START.toISOString() },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/announcements",
      headers: { origin: ORIGIN, cookie: ownerCookie },
      payload: { ...validBody, ...extra },
    });
    assert.equal(response.statusCode, 400);
  }
  for (const linkUrl of ["javascript:alert(1)", "http://example.edu", "https://user:pass@example.edu"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/announcements",
      headers: { origin: ORIGIN, cookie: ownerCookie },
      payload: { ...validBody, linkUrl },
    });
    assert.deepEqual({ status: response.statusCode, body: response.json() }, {
      status: 400,
      body: { error: "invalid_announcement" },
    });
  }
  assert.equal((await app.inject({
    method: "POST", url: "/api/announcements", headers: { cookie: ownerCookie }, payload: validBody,
  })).statusCode, 403);
});
