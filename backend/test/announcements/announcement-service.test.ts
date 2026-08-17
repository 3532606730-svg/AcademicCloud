import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { Announcement, NewAnnouncement } from "../../src/announcements/announcement.js";
import {
  AnnouncementAdministrationError,
  AnnouncementService,
  AnnouncementValidationError,
} from "../../src/announcements/announcement-service.js";
import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { AuthorizationDeniedError } from "../../src/auth/authorization.js";
import type { Persistence, RepositorySet } from "../../src/persistence/contracts.js";
import { createTestPersistence } from "../persistence/helpers.js";

const START = new Date("2026-08-17T10:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "owner-1", loginName: "Owner", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "member-1", loginName: "Member", role: "member" };

function fixture(context: TestContext) {
  const state = createTestPersistence(context);
  for (const account of [OWNER, MEMBER]) {
    state.persistence.repositories.accounts.create({
      id: account.id,
      loginName: account.loginName,
      passwordHash: "hash",
      role: account.role,
      state: "active",
      createdAt: START,
      updatedAt: START,
    });
  }
  let now = START;
  let id = 0;
  const service = new AnnouncementService({
    persistence: state.persistence,
    now: () => now,
    createId: () => `announcement-${++id}`,
  });
  return { ...state, service, setNow: (value: Date) => { now = value; } };
}

function row(overrides: Partial<NewAnnouncement> & Pick<NewAnnouncement, "id">): Announcement {
  return {
    id: overrides.id,
    title: overrides.title ?? "Title",
    body: overrides.body ?? "Body",
    severity: overrides.severity ?? "info",
    linkUrl: overrides.linkUrl ?? null,
    isActive: overrides.isActive ?? true,
    publishedAt: overrides.publishedAt ?? new Date("2026-08-17T09:00:00.000Z"),
    expiresAt: overrides.expiresAt ?? null,
    createdByAccountId: overrides.createdByAccountId ?? OWNER.id,
    createdAt: overrides.createdAt ?? new Date("2026-08-17T08:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-17T09:00:00.000Z"),
  };
}

function failingAuditPersistence(base: Persistence): Persistence {
  return {
    repositories: base.repositories,
    runInTransaction<T>(work: (repositories: RepositorySet) => T): T {
      return base.runInTransaction((repositories) => work({
        ...repositories,
        audit: new Proxy(repositories.audit, {
          get(target, property) {
            if (property === "create") return () => { throw new Error("injected audit failure"); };
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

test("Owner create/edit/publish/unpublish preserves identity, attribution, and content state", (context) => {
  const state = fixture(context);
  const created = state.service.create(OWNER, {
    title: "  Archive hours  ",
    body: "Reading room closes at 18:00.",
    severity: "info",
    linkUrl: "https://example.edu/archive",
    expiresAt: new Date("2026-08-18T10:00:00.000Z"),
  });
  assert.deepEqual(
    { id: created.id, title: created.title, active: created.isActive, publishedAt: created.publishedAt, creator: created.createdByAccountId },
    { id: "announcement-1", title: "Archive hours", active: false, publishedAt: null, creator: OWNER.id },
  );

  state.setNow(new Date("2026-08-17T10:01:00.000Z"));
  const edited = state.service.edit(OWNER, created.id, {
    title: "Archive schedule",
    body: "<script>plain text only</script>",
    severity: "warning",
    linkUrl: null,
    expiresAt: new Date("2026-08-18T11:00:00.000Z"),
  });
  assert.equal(edited.id, created.id);
  assert.equal(edited.createdByAccountId, created.createdByAccountId);
  assert.equal(edited.body, "<script>plain text only</script>");

  state.setNow(new Date("2026-08-17T10:02:00.000Z"));
  const published = state.service.publish(OWNER, created.id);
  assert.equal(published.isActive, true);
  assert.equal(published.publishedAt?.toISOString(), "2026-08-17T10:02:00.000Z");
  state.setNow(new Date("2026-08-17T10:03:00.000Z"));
  assert.equal(state.service.publish(OWNER, created.id).publishedAt?.toISOString(), "2026-08-17T10:02:00.000Z");
  const activeEdit = state.service.edit(OWNER, created.id, {
    title: "Archive schedule amended",
    body: published.body,
    severity: published.severity,
    linkUrl: published.linkUrl,
    expiresAt: published.expiresAt,
  });
  assert.equal(activeEdit.isActive, true);
  assert.equal(activeEdit.publishedAt?.toISOString(), "2026-08-17T10:02:00.000Z");
  assert.equal(activeEdit.createdByAccountId, OWNER.id);
  assert.deepEqual(state.service.listEffective(OWNER), state.service.listEffective(MEMBER));

  const unpublished = state.service.unpublish(OWNER, created.id);
  assert.equal(unpublished.isActive, false);
  assert.equal(unpublished.publishedAt?.toISOString(), "2026-08-17T10:02:00.000Z");
  assert.equal(state.service.unpublish(OWNER, created.id).isActive, false);
  assert.deepEqual(state.service.listEffective(MEMBER), []);
  state.setNow(new Date("2026-08-17T10:04:00.000Z"));
  const republished = state.service.publish(OWNER, created.id);
  assert.equal(republished.publishedAt?.toISOString(), "2026-08-17T10:04:00.000Z");
  assert.equal(republished.title, "Archive schedule amended");
});

test("Member and stale/disabled identities cannot administer announcements", (context) => {
  const { service, persistence } = fixture(context);
  const input = { title: "Notice", body: "Body", severity: "info" as const, linkUrl: null, expiresAt: null };
  assert.throws(() => service.create(MEMBER, input), AuthorizationDeniedError);
  assert.throws(() => service.listAll(MEMBER), AuthorizationDeniedError);
  const created = service.create(OWNER, input);
  assert.throws(() => service.edit(MEMBER, created.id, input), AuthorizationDeniedError);
  assert.throws(() => service.publish(MEMBER, created.id), AuthorizationDeniedError);
  assert.throws(() => service.unpublish(MEMBER, created.id), AuthorizationDeniedError);
  assert.throws(() => service.delete(MEMBER, created.id), AuthorizationDeniedError);

  persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", START);
  assert.throws(() => service.listEffective(MEMBER), AuthorizationDeniedError);
  persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", START);
  assert.throws(() => service.listAll(OWNER), AuthorizationDeniedError);
});

test("Owner deletion removes effective/admin reads and commits immutable audit evidence", (context) => {
  const { service, persistence } = fixture(context);
  const created = service.create(OWNER, { title: "Delete me", body: "Body", severity: "info", linkUrl: null, expiresAt: null });
  service.publish(OWNER, created.id);
  assert.equal(service.listEffective(MEMBER)[0]?.id, created.id);

  service.delete(OWNER, created.id);
  assert.equal(persistence.repositories.announcements.findById(created.id), null);
  assert.deepEqual(service.listAll(OWNER), []);
  assert.deepEqual(service.listEffective(MEMBER), []);
  assert.deepEqual(
    persistence.repositories.audit.listBefore(null, 10)
      .filter((event) => event.action === "announcements.delete")
      .map((event) => ({ actor: event.actorAccountId, target: event.targetId, outcome: event.outcome })),
    [{ actor: OWNER.id, target: created.id, outcome: "succeeded" }],
  );
  assert.throws(
    () => service.delete(OWNER, created.id),
    (error) => error instanceof AnnouncementAdministrationError && error.code === "not_found",
  );
});

test("announcement deletion rolls back when immutable audit insertion fails", (context) => {
  const { service, persistence } = fixture(context);
  const created = service.create(OWNER, { title: "Retain me", body: "Body", severity: "info", linkUrl: null, expiresAt: null });
  const failingService = new AnnouncementService({
    persistence: failingAuditPersistence(persistence),
    now: () => START,
  });

  assert.throws(() => failingService.delete(OWNER, created.id), /injected audit failure/);
  assert.equal(persistence.repositories.announcements.findById(created.id)?.title, "Retain me");
  assert.equal(
    persistence.repositories.audit.listBefore(null, 10).some((event) => event.action === "announcements.delete"),
    false,
  );
});

test("effective reads enforce exact publication/expiry boundaries and deterministic ordering", (context) => {
  const { service, persistence } = fixture(context);
  const repository = persistence.repositories.announcements;
  repository.create(row({ id: "b", createdAt: new Date("2026-08-17T09:00:00.000Z"), publishedAt: START, updatedAt: START }));
  repository.create(row({ id: "a", createdAt: new Date("2026-08-17T09:00:00.000Z"), publishedAt: START, updatedAt: START }));
  repository.create(row({ id: "older", publishedAt: new Date("2026-08-17T09:59:59.999Z"), updatedAt: START }));
  repository.create(row({ id: "inactive", isActive: false }));
  repository.create(row({ id: "future", publishedAt: new Date("2026-08-17T10:00:00.001Z"), updatedAt: new Date("2026-08-17T10:00:00.001Z") }));
  repository.create(row({ id: "expired", expiresAt: START }));

  assert.deepEqual(service.listEffective(MEMBER).map((announcement) => announcement.id), ["a", "b", "older"]);
});

test("validation permits plain text but rejects unsafe links, invalid windows, and expired publication", (context) => {
  const state = fixture(context);
  const base = { title: "Notice", body: "Body", severity: "critical" as const, linkUrl: null, expiresAt: null };
  assert.throws(() => state.service.create(OWNER, { ...base, linkUrl: "javascript:alert(1)" }), AnnouncementValidationError);
  assert.throws(() => state.service.create(OWNER, { ...base, linkUrl: "http://example.edu" }), AnnouncementValidationError);
  assert.throws(() => state.service.create(OWNER, { ...base, linkUrl: "https://user:pass@example.edu" }), AnnouncementValidationError);
  assert.throws(() => state.service.create(OWNER, { ...base, expiresAt: START }), AnnouncementValidationError);
  assert.throws(() => state.service.create(OWNER, { ...base, title: "line\nbreak" }), AnnouncementValidationError);

  const created = state.service.create(OWNER, { ...base, expiresAt: new Date("2026-08-17T10:01:00.000Z") });
  state.setNow(new Date("2026-08-17T10:01:00.000Z"));
  assert.throws(() => state.service.publish(OWNER, created.id), (error: unknown) =>
    error instanceof AnnouncementAdministrationError && error.code === "invalid_state");
});
