import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { OutgoingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { test, type TestContext } from "node:test";
import type { FastifyServerOptions } from "fastify";

import { AuthService, digestSessionSecret, SESSION_DURATION_MILLISECONDS } from "../../src/auth/auth-service.js";
import { getSessionCookiePolicy } from "../../src/auth/http.js";
import { PasswordKdfOverloadedError, type PasswordHasher } from "../../src/auth/password-hasher.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { createApp } from "../../src/platform/app.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const START = new Date("2026-08-12T08:00:00.000Z");

class TestPasswordHasher implements PasswordHasher {
  verificationCount = 0;

  hash(password: string): Promise<string> {
    return Promise.resolve(`test:${password}`);
  }

  verify(encodedHash: string, password: string): Promise<boolean> {
    this.verificationCount += 1;
    return Promise.resolve(encodedHash === `test:${password}`);
  }
}

function getSetCookie(response: { headers: OutgoingHttpHeaders }): string {
  const header = response.headers["set-cookie"];
  assert.ok(header);
  assert.notEqual(typeof header, "number");
  return Array.isArray(header) ? header[0]! : header;
}

function cookieHeader(setCookie: string): string {
  return setCookie.split(";", 1)[0]!;
}

async function createFixture(
  context: TestContext,
  options: {
    disabled?: boolean;
    production?: boolean;
    rateLimitMax?: number;
    logger?: FastifyServerOptions["logger"];
  } = {},
) {
  const { database, persistence } = createTestPersistence(context);
  const hasher = new TestPasswordHasher();
  let now = START;
  persistence.repositories.accounts.create({
    id: "account-1",
    loginName: "Scholar",
    passwordHash: "test:valid-password",
    role: "owner",
    state: options.disabled ? "disabled" : "active",
    createdAt: START,
    updatedAt: START,
  });
  const authService = new AuthService({
    persistence,
    passwordHasher: hasher,
    now: () => now,
  });
  const production = options.production ?? false;
  const app = await createApp({
    logger: options.logger ?? false,
    auth: {
      service: authService,
      appOrigin: production ? "https://cloud.example" : ORIGIN,
      environment: production ? "production" : "test",
      ...(options.rateLimitMax === undefined ? {} : { loginRateLimitMax: options.rateLimitMax }),
    },
  });
  context.after(() => app.close());

  return {
    app,
    database,
    hasher,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

test("login stores only a digest and the guard supplies server-derived account identity", async (context) => {
  const { app, database } = await createFixture(context);
  app.get("/api/test/protected", { preHandler: app.authenticate }, async (request) => ({
    accountId: request.authAccount?.id,
  }));

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "scholar", password: "valid-password" },
  });

  assert.equal(login.statusCode, 200);
  assert.deepEqual(login.json(), { account: { id: "account-1", loginName: "Scholar", role: "owner" } });
  const setCookie = getSetCookie(login);
  assert.match(setCookie, /^ac_session=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /Max-Age=604800/);
  assert.match(setCookie, /Path=\/api/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Secure/);

  const secret = cookieHeader(setCookie).slice("ac_session=".length);
  assert.equal(Buffer.from(secret, "base64url").length, 32);
  const stored = database.prepare<[], { token_digest: string }>("SELECT token_digest FROM sessions").get();
  assert.equal(stored?.token_digest, digestSessionSecret(secret));
  assert.equal(JSON.stringify(stored).includes(secret), false);

  const protectedResponse = await app.inject({
    method: "GET",
    url: "/api/test/protected",
    headers: { cookie: cookieHeader(setCookie) },
  });
  assert.equal(protectedResponse.statusCode, 200);
  assert.deepEqual(protectedResponse.json(), { accountId: "account-1" });

  const currentSession = await app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: { cookie: cookieHeader(setCookie) },
  });
  assert.equal(currentSession.statusCode, 200);
  assert.deepEqual(currentSession.json(), {
    account: { id: "account-1", loginName: "Scholar", role: "owner" },
  });
});

test("wrong, unknown, and disabled accounts return the same generic failure", async (context) => {
  const active = await createFixture(context);
  const disabled = await createFixture(context, { disabled: true });

  const request = (app: typeof active.app, loginName: string, password: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { loginName, password },
    });

  const responses = await Promise.all([
    request(active.app, "Scholar", "wrong"),
    request(active.app, "Missing", "wrong"),
    request(disabled.app, "Scholar", "valid-password"),
  ]);

  for (const response of responses) {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "invalid_credentials" });
  }
  assert.equal(active.hasher.verificationCount, 2);
  assert.equal(disabled.hasher.verificationCount, 1);
});

test("absolute expiry and logout revocation invalidate sessions", async (context) => {
  const expiryFixture = await createFixture(context);
  const expiryLogin = await expiryFixture.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Scholar", password: "valid-password" },
  });
  const expiryCookie = cookieHeader(getSetCookie(expiryLogin));
  expiryFixture.advance(SESSION_DURATION_MILLISECONDS);

  const expired = await expiryFixture.app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: { cookie: expiryCookie },
  });
  assert.equal(expired.statusCode, 401);

  const logoutFixture = await createFixture(context);
  const logoutLogin = await logoutFixture.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Scholar", password: "valid-password" },
  });
  const logoutCookie = cookieHeader(getSetCookie(logoutLogin));
  const logout = await logoutFixture.app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { origin: ORIGIN, cookie: logoutCookie },
  });

  assert.equal(logout.statusCode, 204);
  assert.match(getSetCookie(logout), /Max-Age=0/);
  const revoked = await logoutFixture.app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: { cookie: logoutCookie },
  });
  assert.equal(revoked.statusCode, 401);
});

test("reauthentication rotates and revokes the previously presented session", async (context) => {
  const { app } = await createFixture(context);
  const firstLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Scholar", password: "valid-password" },
  });
  const firstCookie = cookieHeader(getSetCookie(firstLogin));
  const secondLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN, cookie: firstCookie },
    payload: { loginName: "Scholar", password: "valid-password" },
  });
  const secondCookie = cookieHeader(getSetCookie(secondLogin));

  assert.notEqual(secondCookie, firstCookie);
  const oldSession = await app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: { cookie: firstCookie },
  });
  const currentSession = await app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: { cookie: secondCookie },
  });

  assert.equal(oldSession.statusCode, 401);
  assert.equal(currentSession.statusCode, 200);
});

test("unsafe API requests require the exact configured origin", async (context) => {
  const { app } = await createFixture(context);
  const payload = { loginName: "Scholar", password: "wrong" };

  for (const headers of [
    {},
    { origin: "http://127.0.0.1:5173.evil.example" },
    { origin: ORIGIN, "sec-fetch-site": "cross-site" },
  ]) {
    const response = await app.inject({ method: "POST", url: "/api/auth/login", headers, payload });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "invalid_origin" });
  }

  const allowed = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload,
  });
  assert.equal(allowed.statusCode, 401);
});

test("authentication and origin outcomes emit stable secret-free audit events", async (context) => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const { app } = await createFixture(context, { logger: { level: "info", stream } });

  const anonymous = await app.inject({ method: "GET", url: "/api/auth/session" });
  assert.equal(anonymous.statusCode, 401);

  const rejectedOrigin = await app.inject({
    method: "POST",
    url: "/api/auth/login?password=query-secret",
    headers: { origin: "https://evil.example" },
    payload: { loginName: "Scholar", password: "origin-password-secret" },
  });
  assert.equal(rejectedOrigin.statusCode, 403);

  const invalid = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "MissingUser", password: "invalid-password-secret" },
  });
  assert.equal(invalid.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Scholar", password: "valid-password" },
  });
  assert.equal(login.statusCode, 200);
  const cookie = cookieHeader(getSetCookie(login));

  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { origin: ORIGIN, cookie },
  });
  assert.equal(logout.statusCode, 204);

  for (const secret of [
    "query-secret",
    "origin-password-secret",
    "invalid-password-secret",
    "valid-password",
    "MissingUser",
    "https://evil.example",
    cookie.slice("ac_session=".length),
  ]) {
    assert.equal(output.includes(secret), false, `audit log contained ${secret}`);
  }

  const audits = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { audit?: Record<string, unknown> })
    .flatMap((entry) => entry.audit ? [entry.audit] : []);
  assert.deepEqual(
    audits.map((audit) => ({
      event: audit.event,
      outcome: audit.outcome,
      reason: audit.reason,
      accountId: audit.accountId,
    })),
    [
      {
        event: "auth.session_check",
        outcome: "denied",
        reason: "authentication_required",
        accountId: undefined,
      },
      {
        event: "auth.origin_check",
        outcome: "denied",
        reason: "invalid_origin",
        accountId: undefined,
      },
      {
        event: "auth.login",
        outcome: "denied",
        reason: "invalid_credentials",
        accountId: undefined,
      },
      {
        event: "auth.login",
        outcome: "succeeded",
        reason: undefined,
        accountId: "account-1",
      },
      {
        event: "auth.logout",
        outcome: "succeeded",
        reason: undefined,
        accountId: "account-1",
      },
    ],
  );
});

test("login validates JSON and throttles repeated attempts", async (context) => {
  const validation = await createFixture(context);
  const throttled = await createFixture(context, { rateLimitMax: 1 });
  const headers = { origin: ORIGIN };

  const nonJson = await validation.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { ...headers, "content-type": "text/plain" },
    payload: "not-json",
  });
  assert.equal(nonJson.statusCode, 415);

  const invalid = await validation.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { loginName: " Scholar ", password: "valid-password" },
  });
  assert.equal(invalid.statusCode, 400);

  const rejectedOrigin = await throttled.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "https://evil.example" },
    payload: { loginName: "Scholar", password: "wrong" },
  });
  const first = await throttled.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { loginName: "Scholar", password: "wrong" },
  });
  const limited = await throttled.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { loginName: "Scholar", password: "wrong" },
  });
  assert.equal(rejectedOrigin.statusCode, 403);
  assert.equal(first.statusCode, 401);
  assert.equal(limited.statusCode, 429);
});

test("login rate-limit denial emits a stable audit event", async (context) => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const { app } = await createFixture(context, {
    rateLimitMax: 1,
    logger: { level: "info", stream },
  });
  const request = () => app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Scholar", password: "wrong" },
  });

  assert.equal((await request()).statusCode, 401);
  assert.equal((await request()).statusCode, 429);
  assert.match(output, /rate_limit_exceeded/);
  assert.doesNotMatch(output, /Scholar|wrong/);
});

test("production uses a host-prefixed secure cookie with root scope", async (context) => {
  const { app } = await createFixture(context, { production: true });
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "https://cloud.example" },
    payload: { loginName: "Scholar", password: "valid-password" },
  });
  const setCookie = getSetCookie(response);

  assert.match(setCookie, /^__Host-ac_session=/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Domain=/);
  assert.equal(getSessionCookiePolicy("production").options.path, "/");
});

test("password KDF queue saturation fails login with a retryable 429", async (context) => {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: "busy-account",
    loginName: "Busy",
    passwordHash: "test:anything",
    role: "owner",
    state: "active",
    createdAt: START,
    updatedAt: START,
  });
  const busyHasher: PasswordHasher = {
    hash: () => Promise.reject(new PasswordKdfOverloadedError()),
    verify: () => Promise.reject(new PasswordKdfOverloadedError()),
  };
  const service = new AuthService({
    persistence,
    passwordHasher: busyHasher,
  });
  const app = await createApp({
    logger: false,
    auth: { service, appOrigin: ORIGIN, environment: "test" },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Busy", password: "anything" },
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "1");
  assert.deepEqual(response.json(), { error: "authentication_busy" });
});

test("SQLite sessions survive a persistence restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-auth-restart-"));
  const filename = join(directory, "restart.sqlite");
  const hasher = new TestPasswordHasher();
  let secret = "";

  try {
    const firstDatabase = openSqliteDatabase(filename);
    runMigrations(firstDatabase, INITIAL_MIGRATIONS_DIRECTORY);
    const first = new SqlitePersistence(firstDatabase);
    first.repositories.accounts.create({
      id: "persistent-account",
      loginName: "Persistent",
      passwordHash: "test:valid-password",
      role: "owner",
      state: "active",
      createdAt: START,
      updatedAt: START,
    });
    const firstAuth = new AuthService({
      persistence: first,
      passwordHasher: hasher,
      now: () => START,
    });
    secret = (await firstAuth.login("Persistent", "valid-password")).sessionSecret;
    first.close();

    const secondDatabase = openSqliteDatabase(filename);
    runMigrations(secondDatabase, INITIAL_MIGRATIONS_DIRECTORY);
    const second = new SqlitePersistence(secondDatabase);
    try {
      const secondAuth = new AuthService({
        persistence: second,
        passwordHasher: hasher,
        now: () => START,
      });
      assert.deepEqual(secondAuth.resolveSession(secret), {
        id: "persistent-account",
        loginName: "Persistent",
        role: "owner",
      });
    } finally {
      second.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
