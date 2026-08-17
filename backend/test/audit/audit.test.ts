import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService, digestSessionSecret } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { AuditService, recordAuditEvent, AUDIT_MAX_RETAINED_ROWS } from "../../src/audit/audit-service.js";
import { createApp } from "../../src/platform/app.js";
import { createTestPersistence } from "../persistence/helpers.js";

const START = new Date("2026-08-17T08:00:00.000Z");
const ORIGIN = "http://127.0.0.1:5173";

class TestPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> { return Promise.resolve(`test:${password}`); }
  verify(hash: string, password: string): Promise<boolean> { return Promise.resolve(hash === `test:${password}`); }
}

function cookieFrom(response: { headers: OutgoingHttpHeaders }): string {
  const value = response.headers["set-cookie"];
  assert.ok(value);
  const cookie = Array.isArray(value) ? value[0] : value;
  assert.ok(cookie);
  return cookie.split(";", 1)[0]!;
}

function addOwner(persistence: ReturnType<typeof createTestPersistence>["persistence"], id = "owner-1", role: "owner" | "member" = "owner") {
  persistence.repositories.accounts.create({
    id,
    loginName: id,
    passwordHash: "test:password-123",
    role,
    state: "active",
    createdAt: START,
    updatedAt: START,
  });
}

test("migration 009 exposes fixed registries and immutable audit rows", (context) => {
  const { database, persistence } = createTestPersistence(context);
  addOwner(persistence);

  const kinds = database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_event_kinds").get();
  const reasons = database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_reason_codes").get();
  assert.equal(kinds?.count, 28);
  assert.equal(reasons?.count, 18);

  const event = persistence.runInTransaction((repositories) => recordAuditEvent(repositories, {
    action: "auth.login", outcome: "succeeded", actorKind: "account", actorAccountId: "owner-1",
    targetId: "owner-1", reason: null, occurredAt: START,
  }));
  assert.equal(event.targetType, "account");
  assert.throws(() => database.prepare("UPDATE governance_audit_events SET outcome = 'denied' WHERE id = ?").run(event.id), /immutable/);
  assert.throws(
    () => database.prepare("UPDATE governance_audit_event_kinds SET target_type = NULL WHERE kind = 'auth.login'").run(),
    /append-only/,
  );
  assert.throws(
    () => database.prepare("DELETE FROM governance_audit_reason_codes WHERE reason = 'concurrent_change'").run(),
    /append-only/,
  );
});

test("audit repository enforces bounded retention and exclusive ID pagination", (context) => {
  const { database, persistence } = createTestPersistence(context);
  addOwner(persistence);
  const insert = database.prepare(`INSERT INTO governance_audit_events
    (occurred_at, action, outcome, actor_kind, actor_account_id, target_id, reason)
    VALUES (?, 'auth.login', 'succeeded', 'account', 'owner-1', 'owner-1', NULL)`);
  database.transaction(() => {
    for (let index = 0; index < AUDIT_MAX_RETAINED_ROWS + 2; index += 1) {
      insert.run(new Date(START.getTime() + index).toISOString());
    }
  })();
  persistence.runInTransaction((repositories) => repositories.audit.create({
    action: "auth.login", outcome: "succeeded", actorKind: "account", actorAccountId: "owner-1",
    targetId: "owner-1", reason: null, occurredAt: START,
  }));
  const count = database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get();
  assert.equal(count?.count, AUDIT_MAX_RETAINED_ROWS);
  const page = persistence.repositories.audit.listBefore(null, 3);
  assert.equal(page.length, 3);
  assert.ok(page[0]!.id > page[1]!.id);
  assert.equal(persistence.repositories.audit.listBefore(page[2]!.id, 10).some((row) => row.id === page[2]!.id), false);
});

test("audit API is Owner-only, keyset bounded, and rejects authority fields", async (context) => {
  const { persistence } = createTestPersistence(context);
  addOwner(persistence);
  addOwner(persistence, "member-1", "member");
  const auth = new AuthService({ persistence, passwordHasher: new TestPasswordHasher(), now: () => START });
  const app = await createApp({ logger: false, auth: { service: auth, appOrigin: ORIGIN, environment: "test" }, audit: { service: new AuditService(persistence) } });
  context.after(() => app.close());

  const ownerLogin = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: ORIGIN }, payload: { loginName: "owner-1", password: "password-123" } });
  assert.equal(ownerLogin.statusCode, 200);
  const ownerEvents = await app.inject({ method: "GET", url: "/api/audit/events?limit=1", headers: { cookie: cookieFrom(ownerLogin) } });
  assert.equal(ownerEvents.statusCode, 200);
  assert.equal(ownerEvents.json().events.length, 1);
  assert.equal(ownerEvents.json().events[0].action, "auth.login");
  assert.equal(ownerEvents.json().events[0].targetId, "owner-1");

  const injected = await app.inject({ method: "GET", url: "/api/audit/events?role=owner", headers: { cookie: cookieFrom(ownerLogin) } });
  assert.equal(injected.statusCode, 400);

  const memberLogin = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: ORIGIN }, payload: { loginName: "member-1", password: "password-123" } });
  const memberEvents = await app.inject({ method: "GET", url: "/api/audit/events", headers: { cookie: cookieFrom(memberLogin) } });
  assert.equal(memberEvents.statusCode, 403);
});

test("disabled Owner sessions fail closed and event shapes reject spoofed fields", async (context) => {
  const { persistence, database } = createTestPersistence(context);
  addOwner(persistence);
  const auth = new AuthService({ persistence, passwordHasher: new TestPasswordHasher(), now: () => START });
  const app = await createApp({ logger: false, auth: { service: auth, appOrigin: ORIGIN, environment: "test" }, audit: { service: new AuditService(persistence) } });
  context.after(() => app.close());
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: ORIGIN }, payload: { loginName: "owner-1", password: "password-123" } });
  const cookie = cookieFrom(login);
  persistence.repositories.accounts.updateState("owner-1", "active", "disabled", START);
  const denied = await app.inject({ method: "GET", url: "/api/audit/events", headers: { cookie } });
  assert.equal(denied.statusCode, 401);

  assert.throws(() => persistence.runInTransaction((repositories) => recordAuditEvent(repositories, {
    action: "auth.login", outcome: "succeeded", actorKind: "anonymous", actorAccountId: null,
    targetId: "owner-1", reason: null, occurredAt: START,
  })), /invalid login audit actor\/outcome/);
  assert.throws(() => persistence.runInTransaction((repositories) => recordAuditEvent(repositories, {
    action: "auth.login", outcome: "succeeded", actorKind: "account", actorAccountId: "owner-1",
    targetId: "bad\nidentifier", reason: null, occurredAt: START,
  })), /target identity is invalid/);
  assert.throws(() => recordAuditEvent(persistence.repositories, {
    action: "future.unknown" as never, outcome: "succeeded", actorKind: "account", actorAccountId: "owner-1",
    targetId: "owner-1", reason: null, occurredAt: START,
  }), /action is not registered/);
  assert.throws(() => database.prepare(`INSERT INTO governance_audit_events
    (occurred_at, action, outcome, actor_kind, actor_account_id, target_id, reason)
    VALUES (?, 'auth.login', 'denied', 'anonymous', NULL, 'owner-1', 'invalid_credentials')`).run(START.toISOString()), /invalid governance audit event shape/);
});

test("successful login and denied login store no credentials or request content", async (context) => {
  const { persistence, database } = createTestPersistence(context);
  addOwner(persistence);
  const auth = new AuthService({ persistence, passwordHasher: new TestPasswordHasher(), now: () => START, createSessionSecret: () => "session-secret" });
  await auth.login("owner-1", "password-123");
  await assert.rejects(() => auth.login("missing-login-name", "wrong-password"));
  const rows = database.prepare<[], Record<string, unknown>>("SELECT action, outcome, actor_kind, actor_account_id, target_id, reason FROM governance_audit_events ORDER BY id").all();
  assert.deepEqual(rows.map((row) => ({ action: row.action, outcome: row.outcome, actor_kind: row.actor_kind, actor_account_id: row.actor_account_id, target_id: row.target_id, reason: row.reason })), [
    { action: "auth.login", outcome: "succeeded", actor_kind: "account", actor_account_id: "owner-1", target_id: "owner-1", reason: null },
    { action: "auth.login", outcome: "denied", actor_kind: "anonymous", actor_account_id: null, target_id: null, reason: "invalid_credentials" },
  ]);
  const serialized = JSON.stringify(rows);
  for (const secret of ["password-123", "wrong-password", "missing-login-name", "session-secret", digestSessionSecret("session-secret")]) assert.equal(serialized.includes(secret), false);
});

test("audit insertion failure rolls back login session publication", async (context) => {
  const { persistence, database } = createTestPersistence(context);
  addOwner(persistence);
  database.exec("CREATE TRIGGER test_audit_failure BEFORE INSERT ON governance_audit_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
  const auth = new AuthService({ persistence, passwordHasher: new TestPasswordHasher(), now: () => START });
  await assert.rejects(() => auth.login("owner-1", "password-123"), /audit unavailable/);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM sessions").get()?.count, 0);
});
