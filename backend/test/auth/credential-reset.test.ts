import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { AuthService, InvalidCredentialsError, digestSessionSecret } from "../../src/auth/auth-service.js";
import {
  CredentialResetError,
  CredentialResetService,
  CREDENTIAL_RESET_DURATION_MILLISECONDS,
  digestCredentialResetToken,
} from "../../src/auth/credential-reset-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { AccountAdministrationService } from "../../src/accounts/account-administration-service.js";
import { createApp } from "../../src/platform/app.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const NOW = new Date("2026-08-18T15:00:00.000Z");
const FIRST_TOKEN = "A".repeat(43);
const SECOND_TOKEN = "B".repeat(43);

class TestPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`test:${password}`);
  }

  verify(encodedHash: string, password: string): Promise<boolean> {
    return Promise.resolve(encodedHash === `test:${password}`);
  }
}

function seed(
  context: TestContext,
  passwordHasher: PasswordHasher = new TestPasswordHasher(),
) {
  const { database, persistence } = createTestPersistence(context);
  const hasher = passwordHasher;
  let now = NOW;
  for (const account of [
    { id: "owner-1", loginName: "Owner", role: "owner" as const, state: "active" as const },
    { id: "member-1", loginName: "Member", role: "member" as const, state: "active" as const },
    { id: "disabled-1", loginName: "Disabled", role: "member" as const, state: "disabled" as const },
    { id: "archived-1", loginName: "Archived", role: "member" as const, state: "disabled" as const },
  ]) {
    persistence.repositories.accounts.create({
      ...account,
      passwordHash: `test:${account.loginName.toLowerCase()}-password-123`,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  assert.equal(persistence.repositories.accounts.updateState("archived-1", "disabled", "archived", NOW), true);
  persistence.repositories.sessions.create({
    tokenDigest: "c".repeat(64),
    accountId: "member-1",
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
  });
  let tokenIndex = 0;
  let idIndex = 0;
  const reset = new CredentialResetService({
    persistence,
    passwordHasher: hasher,
    now: () => now,
    createToken: () => [FIRST_TOKEN, SECOND_TOKEN][tokenIndex++] ?? "C".repeat(43),
    createId: () => `reset-${++idIndex}`,
  });
  const auth = new AuthService({ persistence, passwordHasher: hasher, now: () => now });
  const owner = { id: "owner-1", loginName: "Owner", role: "owner" as const };
  return {
    database,
    persistence,
    hasher,
    reset,
    auth,
    owner,
    advance(milliseconds: number) { now = new Date(now.getTime() + milliseconds); },
  };
}

test("Owner issue stores only a digest and reissue atomically supersedes the prior capability", (context) => {
  const { database, reset, owner } = seed(context);
  const first = reset.issue(owner, "member-1");
  const second = reset.issue(owner, "member-1");

  assert.equal(first.rawToken, FIRST_TOKEN);
  assert.equal(second.rawToken, SECOND_TOKEN);
  assert.equal(JSON.stringify(database.prepare("SELECT * FROM credential_resets ORDER BY id").all()).includes(FIRST_TOKEN), false);
  assert.deepEqual(
    database.prepare<[], { token_digest: string; consumed_at: string | null; superseded_at: string | null }>(
      "SELECT token_digest, consumed_at, superseded_at FROM credential_resets ORDER BY id",
    ).all(),
    [
      { token_digest: digestCredentialResetToken(FIRST_TOKEN), consumed_at: null, superseded_at: NOW.toISOString() },
      { token_digest: digestCredentialResetToken(SECOND_TOKEN), consumed_at: null, superseded_at: null },
    ],
  );
});

test("redeeming once changes the Member password and atomically revokes all sessions", async (context) => {
  const { persistence, reset, auth, owner } = seed(context);
  reset.issue(owner, "member-1");

  await reset.redeem(FIRST_TOKEN, "new-member-password-456");

  const member = persistence.repositories.accounts.findById("member-1")!;
  assert.equal(member.passwordHash, "test:new-member-password-456");
  assert.equal(member.authRevision, 1);
  assert.equal(member.state, "active");
  assert.equal(persistence.repositories.sessions.findByTokenDigest("c".repeat(64))?.revokedAt?.toISOString(), NOW.toISOString());
  await assert.rejects(() => auth.login("Member", "member-password-123"), InvalidCredentialsError);
  assert.equal((await auth.login("Member", "new-member-password-456")).account.id, "member-1");
  await assert.rejects(
    () => reset.redeem(FIRST_TOKEN, "another-password-789"),
    (error: unknown) => error instanceof CredentialResetError && error.code === "invalid_credential_reset",
  );
});

test("only one concurrent redemption wins and the loser cannot alter the winner", async (context) => {
  const { persistence, reset, owner } = seed(context);
  reset.issue(owner, "member-1");

  const outcomes = await Promise.allSettled([
    reset.redeem(FIRST_TOKEN, "first-winner-password-456"),
    reset.redeem(FIRST_TOKEN, "second-winner-password-789"),
  ]);

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal(persistence.repositories.accounts.findById("member-1")?.authRevision, 1);
  assert.ok([
    "test:first-winner-password-456",
    "test:second-winner-password-789",
  ].includes(persistence.repositories.accounts.findById("member-1")!.passwordHash));
});

test("expiry is exact and an old-password login pending across redemption cannot publish", async (context) => {
  let releaseLogin!: (matches: boolean) => void;
  const hasher: PasswordHasher = {
    hash: (password) => Promise.resolve(`test:${password}`),
    verify: () => new Promise<boolean>((resolve) => { releaseLogin = resolve; }),
  };
  const { reset, auth, owner, persistence, advance } = seed(context, hasher);
  reset.issue(owner, "member-1");
  const pendingLogin = auth.login("Member", "member-password-123");
  while (!releaseLogin) await new Promise((resolve) => setImmediate(resolve));
  await reset.redeem(FIRST_TOKEN, "new-member-password-456");
  releaseLogin(true);
  await assert.rejects(pendingLogin, InvalidCredentialsError);
  assert.equal(persistence.repositories.accounts.findById("member-1")?.authRevision, 1);

  reset.issue(owner, "member-1");
  advance(CREDENTIAL_RESET_DURATION_MILLISECONDS);
  await assert.rejects(
    () => reset.redeem(SECOND_TOKEN, "expired-member-password-789"),
    (error: unknown) => error instanceof CredentialResetError && error.code === "invalid_credential_reset",
  );
  assert.equal(persistence.repositories.accounts.findById("member-1")?.passwordHash, "test:new-member-password-456");
});

test("disabled Members may reset without being enabled; archived Members and Owner targets remain ineligible", async (context) => {
  const { reset, persistence, auth, owner } = seed(context);
  reset.issue(owner, "disabled-1");
  await reset.redeem(FIRST_TOKEN, "disabled-new-password-456");

  assert.equal(persistence.repositories.accounts.findById("disabled-1")?.state, "disabled");
  assert.equal(persistence.repositories.accounts.findById("disabled-1")?.passwordHash, "test:disabled-new-password-456");
  await assert.rejects(() => auth.login("Disabled", "disabled-new-password-456"), InvalidCredentialsError);
  assert.throws(() => reset.issue(owner, "archived-1"), (error: unknown) =>
    error instanceof CredentialResetError && error.code === "invalid_state");
  assert.throws(() => reset.issue(owner, "owner-1"), (error: unknown) =>
    error instanceof CredentialResetError && error.code === "invalid_target");
});

test("HTTP exposes only Owner issue and anonymous redemption with generic capability failures", async (context) => {
  const { persistence, hasher, reset, auth } = seed(context);
  const accounts = new AccountAdministrationService({ persistence, passwordHasher: hasher, now: () => NOW });
  const app = await createApp({
    logger: false,
    auth: { service: auth, appOrigin: ORIGIN, environment: "test", loginRateLimitMax: 100 },
    accounts: { service: accounts },
    credentialReset: { service: reset, redemptionRateLimitMax: 100 },
  });
  context.after(() => app.close());
  const ownerLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { loginName: "Owner", password: "owner-password-123" },
  });
  const memberLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { loginName: "Member", password: "member-password-123" },
  });
  const ownerCookie = String(ownerLogin.headers["set-cookie"]).split(";", 1)[0]!;
  const memberCookie = String(memberLogin.headers["set-cookie"]).split(";", 1)[0]!;

  const denied = await app.inject({
    method: "POST",
    url: "/api/accounts/member-1/credential-reset",
    headers: { origin: ORIGIN, cookie: memberCookie },
  });
  assert.equal(denied.statusCode, 403);
  const issued = await app.inject({
    method: "POST",
    url: "/api/accounts/member-1/credential-reset",
    headers: { origin: ORIGIN, cookie: ownerCookie },
  });
  assert.equal(issued.statusCode, 201);
  assert.equal(issued.json().rawToken, FIRST_TOKEN);
  assert.equal("tokenDigest" in issued.json().reset, false);

  for (const token of ["malformed", "Z".repeat(43)]) {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/auth/credential-reset",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      payload: { token, newPassword: "new-member-password-456" },
    });
    assert.deepEqual({ status: invalid.statusCode, body: invalid.json() }, {
      status: 400,
      body: { error: "invalid_credential_reset" },
    });
  }

  const redeemed = await app.inject({
    method: "POST",
    url: "/api/auth/credential-reset",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { token: FIRST_TOKEN, newPassword: "new-member-password-456" },
  });
  assert.equal(redeemed.statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: memberCookie } })).statusCode, 401);
  assert.equal((await app.inject({
    method: "POST",
    url: "/api/auth/credential-reset",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { token: FIRST_TOKEN, newPassword: "reused-member-password-789" },
  })).statusCode, 400);
  assert.equal((await app.inject({
    method: "POST",
    url: "/api/auth/password",
    headers: { origin: ORIGIN, cookie: ownerCookie },
    payload: { currentPassword: "owner-password-123", newPassword: "owner-new-password-456" },
  })).statusCode, 404);

  assert.deepEqual(
    persistence.repositories.audit.listBefore(null, 20)
      .filter((event) => event.action === "accounts.credential_reset_issue" || event.action === "auth.credential_reset")
      .map((event) => ({ action: event.action, outcome: event.outcome, actor: event.actorAccountId, target: event.targetId, reason: event.reason }))
      .reverse(),
    [
      { action: "accounts.credential_reset_issue", outcome: "denied", actor: "member-1", target: null, reason: "authorization_denied" },
      { action: "accounts.credential_reset_issue", outcome: "succeeded", actor: "owner-1", target: "reset-1", reason: null },
      { action: "auth.credential_reset", outcome: "denied", actor: null, target: null, reason: "invalid_credential_reset" },
      { action: "auth.credential_reset", outcome: "denied", actor: null, target: null, reason: "invalid_credential_reset" },
      { action: "auth.credential_reset", outcome: "succeeded", actor: null, target: "reset-1", reason: null },
      { action: "auth.credential_reset", outcome: "denied", actor: null, target: null, reason: "invalid_credential_reset" },
    ],
  );
  assert.equal(persistence.repositories.sessions.findByTokenDigest(digestSessionSecret("not-a-session")), null);
});
