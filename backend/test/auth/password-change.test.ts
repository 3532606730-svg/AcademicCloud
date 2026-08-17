import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import {
  AuthService,
  InvalidCredentialsError,
  PasswordChangeError,
  digestSessionSecret,
} from "../../src/auth/auth-service.js";
import { PasswordKdfOverloadedError, type PasswordHasher } from "../../src/auth/password-hasher.js";
import type { Persistence, RepositorySet } from "../../src/persistence/contracts.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T03:00:00.000Z");
const LATER = new Date("2026-08-17T03:01:00.000Z");

class TestPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`test:${password}`);
  }

  verify(encodedHash: string, password: string): Promise<boolean> {
    return Promise.resolve(encodedHash === `test:${password}`);
  }
}

function seed(context: TestContext, hasher: PasswordHasher = new TestPasswordHasher()) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: "account-1",
    loginName: "Scholar",
    passwordHash: "test:old-password-123",
    role: "member",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const tokenDigest of ["a".repeat(64), "b".repeat(64)]) {
    persistence.repositories.sessions.create({
      tokenDigest,
      accountId: "account-1",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
      revokedAt: null,
    });
  }
  const auth = new AuthService({ persistence, passwordHasher: hasher, now: () => LATER });
  return { database, persistence, auth, actor: { id: "account-1", loginName: "Scholar", role: "member" as const } };
}

test("password change uses one CAS revision and atomically revokes every old session", async (context) => {
  const { persistence, auth, actor } = seed(context);

  await auth.changePassword(actor, "old-password-123", "new-password-456");

  const account = persistence.repositories.accounts.findById(actor.id)!;
  assert.equal(account.passwordHash, "test:new-password-456");
  assert.equal(account.authRevision, 1);
  assert.equal(account.updatedAt.toISOString(), LATER.toISOString());
  assert.equal(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt?.toISOString(), LATER.toISOString());
  assert.equal(persistence.repositories.sessions.findByTokenDigest("b".repeat(64))?.revokedAt?.toISOString(), LATER.toISOString());

  await assert.rejects(() => auth.login("Scholar", "old-password-123"), InvalidCredentialsError);
  assert.equal(persistence.repositories.accounts.updateState(actor.id, "active", "disabled", LATER), true);
  assert.equal(persistence.repositories.accounts.updateState(actor.id, "disabled", "active", LATER), true);
  assert.equal(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt?.toISOString(), LATER.toISOString());
  assert.equal(persistence.repositories.sessions.findByTokenDigest("b".repeat(64))?.revokedAt?.toISOString(), LATER.toISOString());
  const fresh = await auth.login("Scholar", "new-password-456");
  assert.equal(fresh.account.id, actor.id);
  assert.ok(persistence.repositories.sessions.findByTokenDigest(digestSessionSecret(fresh.sessionSecret)));
});

test("wrong or unchanged password preserves password, revision, and sessions", async (context) => {
  const { persistence, auth, actor } = seed(context);

  await assert.rejects(
    () => auth.changePassword(actor, "wrong-password", "new-password-456"),
    (error: unknown) => error instanceof PasswordChangeError && error.code === "invalid_current_password",
  );
  await assert.rejects(
    () => auth.changePassword(actor, "old-password-123", "old-password-123"),
    (error: unknown) => error instanceof PasswordChangeError && error.code === "password_unchanged",
  );

  const account = persistence.repositories.accounts.findById(actor.id)!;
  assert.equal(account.passwordHash, "test:old-password-123");
  assert.equal(account.authRevision, 0);
  assert.equal(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt, null);
  assert.equal(persistence.repositories.sessions.findByTokenDigest("b".repeat(64))?.revokedAt, null);
});

test("two changes captured from one old hash produce one winner and one non-revoking conflict", async (context) => {
  const verifyResolvers: Array<(value: boolean) => void> = [];
  const hasher: PasswordHasher = {
    hash: (password) => Promise.resolve(`test:${password}`),
    verify: () => new Promise<boolean>((resolve) => verifyResolvers.push(resolve)),
  };
  const { persistence, auth, actor } = seed(context, hasher);

  const first = auth.changePassword(actor, "old-password-123", "first-password-456");
  const second = auth.changePassword(actor, "old-password-123", "second-password-456");
  while (verifyResolvers.length < 2) await new Promise((resolve) => setImmediate(resolve));
  verifyResolvers.splice(0).forEach((resolve) => resolve(true));

  const outcomes = await Promise.allSettled([first, second]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
  assert.ok(rejected?.reason instanceof PasswordChangeError);
  assert.equal(rejected.reason.code, "password_change_conflict");

  const account = persistence.repositories.accounts.findById(actor.id)!;
  assert.equal(account.authRevision, 1);
  assert.ok(["test:first-password-456", "test:second-password-456"].includes(account.passwordHash));
  assert.notEqual(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt, null);
  assert.notEqual(persistence.repositories.sessions.findByTokenDigest("b".repeat(64))?.revokedAt, null);
});

test("disable and enable across KDF invalidates the captured revision even with the old hash", async (context) => {
  let releaseVerify!: (value: boolean) => void;
  const hasher: PasswordHasher = {
    hash: (password) => Promise.resolve(`test:${password}`),
    verify: () => new Promise<boolean>((resolve) => { releaseVerify = resolve; }),
  };
  const { persistence, auth, actor } = seed(context, hasher);

  const pending = auth.changePassword(actor, "old-password-123", "new-password-456");
  while (!releaseVerify) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(persistence.repositories.accounts.updateState(actor.id, "active", "disabled", LATER), true);
  assert.equal(persistence.repositories.accounts.updateState(actor.id, "disabled", "active", LATER), true);
  releaseVerify(true);

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PasswordChangeError && error.code === "password_change_conflict",
  );
  const account = persistence.repositories.accounts.findById(actor.id)!;
  assert.equal(account.passwordHash, "test:old-password-123");
  assert.equal(account.authRevision, 2);
  assert.equal(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt, null);
});

test("an old-password login pending across password change cannot publish a session", async (context) => {
  let firstVerify = true;
  let releaseLogin!: (value: boolean) => void;
  const hasher: PasswordHasher = {
    hash: (password) => Promise.resolve(`test:${password}`),
    verify: (encodedHash, password) => {
      if (firstVerify) {
        firstVerify = false;
        return new Promise<boolean>((resolve) => { releaseLogin = resolve; });
      }
      return Promise.resolve(encodedHash === `test:${password}`);
    },
  };
  const { database, auth, actor } = seed(context, hasher);

  const pendingLogin = auth.login("Scholar", "old-password-123");
  while (!releaseLogin) await new Promise((resolve) => setImmediate(resolve));
  await auth.changePassword(actor, "old-password-123", "new-password-456");
  releaseLogin(true);

  await assert.rejects(pendingLogin, InvalidCredentialsError);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM sessions WHERE revoked_at IS NULL").get()!.count, 0);
});

test("session-revocation failure rolls password, revision, and partial revocations back", async (context) => {
  const base = seed(context);
  const persistence: Persistence = {
    repositories: base.persistence.repositories,
    runInTransaction<T>(work: (repositories: RepositorySet) => T): T {
      return base.persistence.runInTransaction((repositories) => work({
        ...repositories,
        sessions: new Proxy(repositories.sessions, {
          get(target, property, receiver) {
            if (property === "revokeAllByAccountId") {
              return (accountId: string, revokedAt: Date) => {
                repositories.sessions.revokeByTokenDigest("a".repeat(64), revokedAt);
                throw new Error(`injected revoke failure for ${accountId}`);
              };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
      }));
    },
    isReady: () => base.persistence.isReady(),
    close: () => undefined,
  };
  const auth = new AuthService({ persistence, passwordHasher: new TestPasswordHasher(), now: () => LATER });

  await assert.rejects(
    () => auth.changePassword(base.actor, "old-password-123", "new-password-456"),
    /injected revoke failure/,
  );
  const account = base.persistence.repositories.accounts.findById(base.actor.id)!;
  assert.equal(account.passwordHash, "test:old-password-123");
  assert.equal(account.authRevision, 0);
  assert.equal(base.persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt, null);
  assert.equal(base.persistence.repositories.sessions.findByTokenDigest("b".repeat(64))?.revokedAt, null);
});

test("KDF overload during current-password verification preserves all durable state", async (context) => {
  const hasher: PasswordHasher = {
    hash: () => Promise.resolve("unused"),
    verify: () => Promise.reject(new PasswordKdfOverloadedError()),
  };
  const { persistence, auth, actor } = seed(context, hasher);

  await assert.rejects(
    () => auth.changePassword(actor, "old-password-123", "new-password-456"),
    PasswordKdfOverloadedError,
  );
  assert.equal(persistence.repositories.accounts.findById(actor.id)?.passwordHash, "test:old-password-123");
  assert.equal(persistence.repositories.accounts.findById(actor.id)?.authRevision, 0);
  assert.equal(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt, null);
});

test("KDF overload during new-password hashing preserves all durable state", async (context) => {
  const hasher: PasswordHasher = {
    hash: () => Promise.reject(new PasswordKdfOverloadedError()),
    verify: () => Promise.resolve(true),
  };
  const { persistence, auth, actor } = seed(context, hasher);

  await assert.rejects(
    () => auth.changePassword(actor, "old-password-123", "new-password-456"),
    PasswordKdfOverloadedError,
  );
  assert.equal(persistence.repositories.accounts.findById(actor.id)?.passwordHash, "test:old-password-123");
  assert.equal(persistence.repositories.accounts.findById(actor.id)?.authRevision, 0);
  assert.equal(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt, null);
});
