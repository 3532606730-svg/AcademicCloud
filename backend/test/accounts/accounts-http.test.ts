import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test, type TestContext } from "node:test";

import { AccountAdministrationService } from "../../src/accounts/account-administration-service.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { PasswordKdfOverloadedError, type PasswordHasher } from "../../src/auth/password-hasher.js";
import { createApp } from "../../src/platform/app.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T10:00:00.000Z");
const ORIGIN = "http://127.0.0.1:5173";
const RAW_TOKEN = "A".repeat(43);

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function cookieFrom(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const value = response.headers["set-cookie"];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.split(";", 1)[0] ?? "" : "";
}

async function fixture(
  context: TestContext,
  stream?: Writable,
  passwordHasher: PasswordHasher = hasher,
  registrationRateLimitMax = 100,
) {
  const { persistence } = createTestPersistence(context);
  for (const account of [
    { id: "owner-1", loginName: "Owner", passwordHash: "hash:owner-password-123", role: "owner" as const },
    { id: "member-1", loginName: "Member", passwordHash: "hash:member-password-123", role: "member" as const },
  ]) {
    persistence.repositories.accounts.create({ ...account, state: "active", createdAt: NOW, updatedAt: NOW });
  }
  const authService = new AuthService({
    persistence,
    passwordHasher,
    now: () => NOW,
  });
  let tokenUsed = false;
  let generatedId = 0;
  const accountsService = new AccountAdministrationService({
    persistence,
    passwordHasher,
    now: () => NOW,
    createInvitationToken: () => {
      if (tokenUsed) return "B".repeat(43);
      tokenUsed = true;
      return RAW_TOKEN;
    },
    createId: () => `generated-${++generatedId}`,
  });
  const app = await createApp({
    logger: stream ? { level: "info", stream } : false,
    auth: { service: authService, appOrigin: ORIGIN, environment: "development", loginRateLimitMax: 100 },
    accounts: { service: accountsService, registrationRateLimitMax },
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
    ownerCookie: await login("Owner", "owner-password-123"),
    memberCookie: await login("Member", "member-password-123"),
  };
}

test("Owner invitation HTTP flow returns raw capability once and safe lists omit token material", async (context) => {
  const { app, ownerCookie, persistence } = await fixture(context);
  const created = await app.inject({
    method: "POST", url: "/api/accounts/invitations", headers: { origin: ORIGIN, cookie: ownerCookie },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().rawToken, RAW_TOKEN);
  assert.equal("tokenDigest" in created.json().invitation, false);
  const stored = persistence.repositories.invitations.list()[0]!;
  assert.notEqual(stored.tokenDigest, RAW_TOKEN);

  const listed = await app.inject({ method: "GET", url: "/api/accounts/invitations", headers: { cookie: ownerCookie } });
  assert.equal(listed.statusCode, 200);
  assert.equal(JSON.stringify(listed.json()).includes(RAW_TOKEN), false);
  assert.equal(JSON.stringify(listed.json()).includes(stored.tokenDigest), false);

  const accounts = await app.inject({ method: "GET", url: "/api/accounts", headers: { cookie: ownerCookie } });
  assert.equal(accounts.statusCode, 200);
  assert.deepEqual(Object.keys(accounts.json().accounts[0]).sort(), ["createdAt", "id", "loginName", "role", "state"]);
  assert.equal(JSON.stringify(accounts.json()).includes("passwordHash"), false);
  assert.equal(JSON.stringify(accounts.json()).includes("authRevision"), false);
});

test("Member direct calls to every Owner surface are denied and no role/delete route exists", async (context) => {
  const { app, memberCookie, persistence } = await fixture(context);
  for (const request of [
    { method: "POST", url: "/api/accounts/invitations" },
    { method: "GET", url: "/api/accounts/invitations" },
    { method: "DELETE", url: "/api/accounts/invitations/any" },
    { method: "GET", url: "/api/accounts" },
    { method: "PATCH", url: "/api/accounts/member-1/state", payload: { state: "disabled" } },
  ] as const) {
    const response = await app.inject({
      ...request,
      headers: { cookie: memberCookie, ...(request.method === "GET" ? {} : { origin: ORIGIN }) },
    });
    assert.equal(response.statusCode, 403, `${request.method} ${request.url}`);
  }
  assert.equal((await app.inject({ method: "DELETE", url: "/api/accounts/member-1", headers: { origin: ORIGIN, cookie: memberCookie } })).statusCode, 404);
  assert.equal((await app.inject({ method: "PATCH", url: "/api/accounts/member-1/role", headers: { origin: ORIGIN, cookie: memberCookie }, payload: { role: "owner" } })).statusCode, 404);
  assert.deepEqual(
    persistence.repositories.audit.listBefore(null, 20)
      .filter((event) => event.outcome === "denied" && event.action.startsWith("accounts."))
      .map((event) => ({ action: event.action, actor: event.actorAccountId, target: event.targetId, reason: event.reason }))
      .sort((left, right) => left.action.localeCompare(right.action)),
    [
      { action: "accounts.invitation_create", actor: "member-1", target: null, reason: "authorization_denied" },
      { action: "accounts.invitation_revoke", actor: "member-1", target: null, reason: "authorization_denied" },
      { action: "accounts.member_state_change", actor: "member-1", target: null, reason: "authorization_denied" },
    ],
  );
});

test("invite-only registration creates a server-authoritative Member and rejects capability reuse", async (context) => {
  const { app, ownerCookie } = await fixture(context);
  await app.inject({ method: "POST", url: "/api/accounts/invitations", headers: { origin: ORIGIN, cookie: ownerCookie } });
  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { inviteToken: RAW_TOKEN, loginName: "Scholar", password: "scholar-password-123" },
  });
  assert.equal(registered.statusCode, 201);
  assert.deepEqual(
    { loginName: registered.json().account.loginName, role: registered.json().account.role, state: registered.json().account.state },
    { loginName: "Scholar", role: "member", state: "active" },
  );
  assert.equal("passwordHash" in registered.json().account, false);
  const reused = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { inviteToken: RAW_TOKEN, loginName: "Other", password: "scholar-password-456" },
  });
  assert.deepEqual({ status: reused.statusCode, body: reused.json() }, { status: 400, body: { error: "invalid_invitation" } });
});

test("disabling a Member revokes all sessions; enabling requires a fresh login", async (context) => {
  const { app, ownerCookie, memberCookie } = await fixture(context);
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: memberCookie } })).statusCode, 200);
  const disabled = await app.inject({
    method: "PATCH", url: "/api/accounts/member-1/state", headers: { origin: ORIGIN, cookie: ownerCookie }, payload: { state: "disabled" },
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: memberCookie } })).statusCode, 401);

  const enabled = await app.inject({
    method: "PATCH", url: "/api/accounts/member-1/state", headers: { origin: ORIGIN, cookie: ownerCookie }, payload: { state: "active" },
  });
  assert.equal(enabled.statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: memberCookie } })).statusCode, 401);
  const fresh = await app.inject({
    method: "POST", url: "/api/auth/login", headers: { origin: ORIGIN, "content-type": "application/json" }, payload: { loginName: "Member", password: "member-password-123" },
  });
  assert.equal(fresh.statusCode, 200);
});

test("unsafe account routes require exact Origin and logs never contain invite capability", async (context) => {
  let logs = "";
  const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } });
  const { app, ownerCookie } = await fixture(context, stream);
  const denied = await app.inject({ method: "POST", url: "/api/accounts/invitations", headers: { cookie: ownerCookie } });
  assert.equal(denied.statusCode, 403);
  const created = await app.inject({ method: "POST", url: "/api/accounts/invitations", headers: { origin: ORIGIN, cookie: ownerCookie } });
  assert.equal(created.statusCode, 201);
  assert.equal(logs.includes(RAW_TOKEN), false);
  assert.equal(logs.includes(created.json().rawToken), false);
});

test("registration rate limiting and KDF overload stay bounded without consuming the invitation", async (context) => {
  const overloadedHasher: PasswordHasher = {
    verify: hasher.verify,
    hash: async () => { throw new PasswordKdfOverloadedError(); },
  };
  const overloaded = await fixture(context, undefined, overloadedHasher);
  await overloaded.app.inject({ method: "POST", url: "/api/accounts/invitations", headers: { origin: ORIGIN, cookie: overloaded.ownerCookie } });
  const busy = await overloaded.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { inviteToken: RAW_TOKEN, loginName: "Busy", password: "member-password-123" },
  });
  assert.deepEqual({ status: busy.statusCode, body: busy.json(), retryAfter: busy.headers["retry-after"] }, {
    status: 429,
    body: { error: "authentication_busy" },
    retryAfter: "1",
  });
  assert.equal(overloaded.persistence.repositories.accounts.findByLoginName("Busy"), null);
  assert.equal(overloaded.persistence.repositories.invitations.findByTokenDigest(
    overloaded.persistence.repositories.invitations.list()[0]!.tokenDigest,
  )?.consumedAt, null);

  const limited = await fixture(context, undefined, hasher, 1);
  const first = await limited.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { inviteToken: "C".repeat(43), loginName: "First", password: "member-password-123" },
  });
  assert.equal(first.statusCode, 400);
  const throttled = await limited.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { inviteToken: "D".repeat(43), loginName: "Second", password: "member-password-123" },
  });
  assert.deepEqual({ status: throttled.statusCode, body: throttled.json() }, {
    status: 429,
    body: { error: "rate_limit_exceeded" },
  });
});
