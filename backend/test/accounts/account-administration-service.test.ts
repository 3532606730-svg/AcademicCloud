import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import {
  AccountAdministrationError,
  AccountAdministrationService,
  AccountConflictError,
  InvalidInvitationError,
  digestInvitationToken,
} from "../../src/accounts/account-administration-service.js";
import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { AuthService, InvalidCredentialsError } from "../../src/auth/auth-service.js";
import { AuthorizationDeniedError } from "../../src/auth/authorization.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import type { Persistence, RepositorySet } from "../../src/persistence/contracts.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T10:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "owner-1", loginName: "Owner", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "member-1", loginName: "Member", role: "member" };
const TOKENS = ["A".repeat(43), "B".repeat(43), "C".repeat(43), "D".repeat(43)];

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function fixture(context: TestContext, options: { now?: () => Date; passwordHasher?: PasswordHasher; persistence?: Persistence } = {}) {
  const testPersistence = createTestPersistence(context);
  const persistence = options.persistence ?? testPersistence.persistence;
  testPersistence.persistence.repositories.accounts.create({
    id: OWNER.id,
    loginName: OWNER.loginName,
    passwordHash: "hash:owner-password",
    role: "owner",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  let tokenIndex = 0;
  let idIndex = 0;
  const service = new AccountAdministrationService({
    persistence,
    passwordHasher: options.passwordHasher ?? hasher,
    now: options.now ?? (() => NOW),
    createInvitationToken: () => TOKENS[tokenIndex++]!,
    createId: () => `generated-${++idIndex}`,
  });
  return { ...testPersistence, service };
}

test("Owner invitation creation returns a raw token once while persistence and lists stay digest-only", (context) => {
  const { service, persistence, database } = fixture(context);
  const created = service.createInvitation(OWNER);
  assert.equal(created.rawToken, TOKENS[0]);
  assert.equal(created.invitation.status, "available");
  assert.equal(persistence.repositories.invitations.findById(created.invitation.id)?.tokenDigest, digestInvitationToken(TOKENS[0]!));
  assert.equal(JSON.stringify(service.listInvitations(OWNER)).includes(TOKENS[0]!), false);
  assert.equal(JSON.stringify(database.prepare("SELECT * FROM invitations").all()).includes(TOKENS[0]!), false);
  assert.equal("tokenDigest" in created.invitation, false);
});

test("Member cannot create, list, revoke invitations, or list accounts", (context) => {
  const { service, persistence } = fixture(context);
  persistence.repositories.accounts.create({
    id: MEMBER.id, loginName: MEMBER.loginName, passwordHash: "hash", role: "member", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  assert.throws(() => service.createInvitation(MEMBER), AuthorizationDeniedError);
  assert.throws(() => service.listInvitations(MEMBER), AuthorizationDeniedError);
  assert.throws(() => service.listAccounts(MEMBER), AuthorizationDeniedError);
  assert.throws(() => service.listAccounts(MEMBER, true), AuthorizationDeniedError);
});

test("valid invitation creates exactly one Member and consumes the digest-only capability", async (context) => {
  const { service, persistence } = fixture(context);
  const created = service.createInvitation(OWNER);
  const member = await service.registerMember(created.rawToken, "Scholar", "member-password-123");
  assert.deepEqual({ loginName: member.loginName, role: member.role, state: member.state }, { loginName: "Scholar", role: "member", state: "active" });
  assert.equal("passwordHash" in member, false);
  const invitation = persistence.repositories.invitations.findById(created.invitation.id)!;
  assert.equal(invitation.consumedByAccountId, member.id);
  assert.equal(invitation.consumedAt?.toISOString(), NOW.toISOString());
  await assert.rejects(service.registerMember(created.rawToken, "Other", "member-password-456"), InvalidInvitationError);
  assert.equal(persistence.repositories.accounts.count(), 2);
});

test("revoked and expired invitations share the same registration rejection", async (context) => {
  let now = NOW;
  const state = fixture(context, { now: () => now });
  const revoked = state.service.createInvitation(OWNER);
  state.service.revokeInvitation(OWNER, revoked.invitation.id);
  await assert.rejects(state.service.registerMember(revoked.rawToken, "Revoked", "member-password-123"), InvalidInvitationError);

  const expired = state.service.createInvitation(OWNER);
  now = new Date(expired.invitation.expiresAt.getTime());
  await assert.rejects(state.service.registerMember(expired.rawToken, "Expired", "member-password-123"), InvalidInvitationError);
});

test("duplicate login rolls back cleanly and leaves the invitation usable", async (context) => {
  const { service, persistence } = fixture(context);
  persistence.repositories.accounts.create({
    id: "existing", loginName: "Taken", passwordHash: "hash", role: "member", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  const created = service.createInvitation(OWNER);
  await assert.rejects(service.registerMember(created.rawToken, "taken", "member-password-123"), AccountConflictError);
  assert.equal(persistence.repositories.invitations.findById(created.invitation.id)?.consumedAt, null);
  const result = await service.registerMember(created.rawToken, "Available", "member-password-123");
  assert.equal(result.loginName, "Available");
});

test("revocation or expiry during password hashing is revalidated inside the write transaction", async (context) => {
  let now = NOW;
  const pending: Array<(value: string) => void> = [];
  const delayedHasher: PasswordHasher = {
    hash: (password) => new Promise((resolve) => pending.push(() => resolve(`hash:${password}`))),
    verify: async () => false,
  };
  const state = fixture(context, { now: () => now, passwordHasher: delayedHasher });

  const revoked = state.service.createInvitation(OWNER);
  const revokedRegistration = state.service.registerMember(revoked.rawToken, "RevokedRace", "member-password-123");
  await Promise.resolve();
  state.service.revokeInvitation(OWNER, revoked.invitation.id);
  pending.shift()!(`hash:member-password-123`);
  await assert.rejects(revokedRegistration, InvalidInvitationError);

  const expired = state.service.createInvitation(OWNER);
  const expiredRegistration = state.service.registerMember(expired.rawToken, "ExpiredRace", "member-password-123");
  await Promise.resolve();
  now = new Date(expired.invitation.expiresAt.getTime());
  pending.shift()!(`hash:member-password-123`);
  await assert.rejects(expiredRegistration, InvalidInvitationError);
  assert.equal(state.persistence.repositories.accounts.findByLoginName("RevokedRace"), null);
  assert.equal(state.persistence.repositories.accounts.findByLoginName("ExpiredRace"), null);
});

test("concurrent redemption attempts produce exactly one Member and one consume", async (context) => {
  const pending: Array<() => void> = [];
  const delayedHasher: PasswordHasher = {
    hash: (password) => new Promise((resolve) => pending.push(() => resolve(`hash:${password}`))),
    verify: async () => false,
  };
  const state = fixture(context, { passwordHasher: delayedHasher });
  const created = state.service.createInvitation(OWNER);
  const attempts = [
    state.service.registerMember(created.rawToken, "First", "member-password-123"),
    state.service.registerMember(created.rawToken, "Second", "member-password-456"),
  ];
  await Promise.resolve();
  for (const release of pending.splice(0)) release();
  const results = await Promise.allSettled(attempts);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(state.persistence.repositories.accounts.count(), 2);
  assert.ok(state.persistence.repositories.invitations.findById(created.invitation.id)?.consumedByAccountId);
});

function failingConsumePersistence(base: Persistence): Persistence {
  return {
    repositories: base.repositories,
    runInTransaction<T>(work: (repositories: RepositorySet) => T): T {
      return base.runInTransaction((repositories) => work({
        ...repositories,
        invitations: new Proxy(repositories.invitations, {
          get(target, property) {
            if (property === "consume") return () => { throw new Error("injected consume failure"); };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
      }));
    },
    isReady: () => base.isReady(),
    close: () => undefined,
  };
}

function failingSessionRevocationPersistence(base: Persistence): Persistence {
  return {
    repositories: base.repositories,
    runInTransaction<T>(work: (repositories: RepositorySet) => T): T {
      return base.runInTransaction((repositories) => work({
        ...repositories,
        sessions: new Proxy(repositories.sessions, {
          get(target, property) {
            if (property === "revokeAllByAccountId") return () => { throw new Error("injected session revocation failure"); };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
      }));
    },
    isReady: () => base.isReady(),
    close: () => undefined,
  };
}

test("failure after account insert and before invitation consume rolls back both", async (context) => {
  const base = fixture(context);
  const created = base.service.createInvitation(OWNER);
  const service = new AccountAdministrationService({
    persistence: failingConsumePersistence(base.persistence),
    passwordHasher: hasher,
    now: () => NOW,
    createId: () => "injected-member",
  });
  await assert.rejects(service.registerMember(created.rawToken, "Injected", "member-password-123"), /injected consume failure/);
  assert.equal(base.persistence.repositories.accounts.findById("injected-member"), null);
  assert.equal(base.persistence.repositories.invitations.findById(created.invitation.id)?.consumedAt, null);
});

test("Owner disable revokes every Member session; enable never revives them", (context) => {
  const { service, persistence } = fixture(context);
  persistence.repositories.accounts.create({
    id: MEMBER.id, loginName: MEMBER.loginName, passwordHash: "hash", role: "member", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  for (const tokenDigest of ["a".repeat(64), "b".repeat(64)]) {
    persistence.repositories.sessions.create({
      tokenDigest, accountId: MEMBER.id, createdAt: NOW, expiresAt: new Date(NOW.getTime() + 60_000), revokedAt: null,
    });
  }
  assert.equal(service.setMemberState(OWNER, MEMBER.id, "disabled").state, "disabled");
  assert.ok(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt);
  assert.ok(persistence.repositories.sessions.findByTokenDigest("b".repeat(64))?.revokedAt);
  assert.equal(service.setMemberState(OWNER, MEMBER.id, "active").state, "active");
  assert.ok(persistence.repositories.sessions.findByTokenDigest("a".repeat(64))?.revokedAt);
  assert.throws(
    () => service.setMemberState(OWNER, OWNER.id, "disabled"),
    (error) => error instanceof AccountAdministrationError && error.code === "invalid_target",
  );
});

test("Member archival is disabled-only, hidden by default, session-invalid, and unarchives to disabled", async (context) => {
  const { service, persistence } = fixture(context);
  persistence.repositories.accounts.create({
    id: MEMBER.id,
    loginName: MEMBER.loginName,
    passwordHash: "hash:member-password-123",
    role: "member",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.throws(
    () => service.setMemberState(OWNER, MEMBER.id, "archived"),
    (error) => error instanceof AccountAdministrationError && error.code === "invalid_state",
  );
  assert.throws(() => service.setMemberState(MEMBER, MEMBER.id, "disabled"), AuthorizationDeniedError);

  assert.equal(service.setMemberState(OWNER, MEMBER.id, "disabled").state, "disabled");
  persistence.repositories.sessions.create({
    tokenDigest: "d".repeat(64),
    accountId: MEMBER.id,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
  });
  const archived = service.setMemberState(OWNER, MEMBER.id, "archived");
  assert.deepEqual({ id: archived.id, loginName: archived.loginName, state: archived.state }, {
    id: MEMBER.id,
    loginName: MEMBER.loginName,
    state: "archived",
  });
  assert.ok(persistence.repositories.sessions.findByTokenDigest("d".repeat(64))?.revokedAt);
  assert.equal(service.listAccounts(OWNER).some((account) => account.id === MEMBER.id), false);
  assert.equal(service.listAccounts(OWNER, true).find((account) => account.id === MEMBER.id)?.state, "archived");

  const auth = new AuthService({ persistence, passwordHasher: hasher, now: () => NOW });
  await assert.rejects(auth.login(MEMBER.loginName, "member-password-123"), InvalidCredentialsError);
  assert.throws(
    () => service.setMemberState(OWNER, MEMBER.id, "active"),
    (error) => error instanceof AccountAdministrationError && error.code === "invalid_state",
  );
  assert.equal(service.setMemberState(OWNER, MEMBER.id, "disabled").state, "disabled");
  await assert.rejects(auth.login(MEMBER.loginName, "member-password-123"), InvalidCredentialsError);
  assert.equal(service.setMemberState(OWNER, MEMBER.id, "active").state, "active");
  assert.equal((await auth.login(MEMBER.loginName, "member-password-123")).account.id, MEMBER.id);
  assert.equal(persistence.repositories.accounts.findById(MEMBER.id)?.authRevision, 4);
  assert.throws(
    () => service.setMemberState(OWNER, OWNER.id, "archived"),
    (error) => error instanceof AccountAdministrationError && error.code === "invalid_target",
  );
  persistence.repositories.accounts.create({
    id: "owner-2", loginName: "OtherOwner", passwordHash: "hash", role: "owner", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  assert.throws(
    () => service.setMemberState(OWNER, "owner-2", "archived"),
    (error) => error instanceof AccountAdministrationError && error.code === "invalid_target",
  );
});

test("a login hashing across disable and re-enable cannot create a revived pre-disable session", async (context) => {
  const { service, persistence, database } = fixture(context);
  persistence.repositories.accounts.create({
    id: MEMBER.id,
    loginName: MEMBER.loginName,
    passwordHash: "hash:member-password-123",
    role: "member",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });

  let releaseVerification!: (matches: boolean) => void;
  let markVerificationStarted!: () => void;
  const verificationStarted = new Promise<void>((resolve) => { markVerificationStarted = resolve; });
  let firstVerification = true;
  const delayedHasher: PasswordHasher = {
    hash: hasher.hash,
    verify: async (encodedHash, password) => {
      if (!firstVerification) return encodedHash === `hash:${password}`;
      firstVerification = false;
      markVerificationStarted();
      return new Promise<boolean>((resolve) => { releaseVerification = resolve; });
    },
  };
  let secretIndex = 0;
  const auth = new AuthService({
    persistence,
    passwordHasher: delayedHasher,
    now: () => NOW,
    createSessionSecret: () => ["S".repeat(43), "T".repeat(43)][secretIndex++]!,
  });

  const pendingLogin = auth.login(MEMBER.loginName, "member-password-123");
  await verificationStarted;
  assert.equal(service.setMemberState(OWNER, MEMBER.id, "disabled").state, "disabled");
  assert.equal(service.setMemberState(OWNER, MEMBER.id, "active").state, "active");
  assert.equal(persistence.repositories.accounts.findById(MEMBER.id)?.authRevision, 2);
  releaseVerification(true);

  await assert.rejects(pendingLogin, InvalidCredentialsError);
  assert.equal(database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM sessions WHERE account_id = ?").get(MEMBER.id)!.count, 0);

  const fresh = await auth.login(MEMBER.loginName, "member-password-123");
  assert.equal(fresh.account.role, "member");
  assert.deepEqual(auth.resolveSession(fresh.sessionSecret), fresh.account);
});

test("a session-revocation failure rolls back the Member state and auth revision", (context) => {
  const { persistence } = fixture(context);
  persistence.repositories.accounts.create({
    id: MEMBER.id,
    loginName: MEMBER.loginName,
    passwordHash: "hash:member-password-123",
    role: "member",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  persistence.repositories.sessions.create({
    tokenDigest: "c".repeat(64),
    accountId: MEMBER.id,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
  });
  const failingService = new AccountAdministrationService({
    persistence: failingSessionRevocationPersistence(persistence),
    passwordHasher: hasher,
    now: () => NOW,
  });

  assert.throws(() => failingService.setMemberState(OWNER, MEMBER.id, "disabled"), /injected session revocation failure/);
  assert.deepEqual(
    {
      state: persistence.repositories.accounts.findById(MEMBER.id)?.state,
      authRevision: persistence.repositories.accounts.findById(MEMBER.id)?.authRevision,
      revokedAt: persistence.repositories.sessions.findByTokenDigest("c".repeat(64))?.revokedAt,
    },
    { state: "active", authRevision: 0, revokedAt: null },
  );

  assert.equal(persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW), true);
  persistence.repositories.sessions.create({
    tokenDigest: "e".repeat(64),
    accountId: MEMBER.id,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
  });
  assert.throws(() => failingService.setMemberState(OWNER, MEMBER.id, "archived"), /injected session revocation failure/);
  assert.deepEqual(
    {
      state: persistence.repositories.accounts.findById(MEMBER.id)?.state,
      authRevision: persistence.repositories.accounts.findById(MEMBER.id)?.authRevision,
      revokedAt: persistence.repositories.sessions.findByTokenDigest("e".repeat(64))?.revokedAt,
    },
    { state: "disabled", authRevision: 1, revokedAt: null },
  );
});
