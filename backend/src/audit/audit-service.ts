import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type {
  AuditActorKind,
  AuditEvent,
  AuditEventKind,
  AuditOutcome,
  AuditReasonCode,
} from "./audit-event.js";
import { AUDIT_EVENT_KINDS, AUDIT_REASON_CODES } from "./audit-event.js";

export const AUDIT_PAGE_DEFAULT_LIMIT = 50;
export const AUDIT_PAGE_MAX_LIMIT = 100;
export const AUDIT_MAX_RETAINED_ROWS = 20_000;
export const AUDIT_RETENTION_POLICY = "latest_20000_events" as const;

const TARGET_BY_ACTION: Readonly<Record<AuditEventKind, string | null>> = {
  "auth.login": "account",
  "auth.logout": null,
  "auth.password_change": null,
  "auth.credential_reset": "credential_reset",
  "accounts.owner_bootstrap": "account",
  "accounts.register": "account",
  "accounts.invitation_create": "invitation",
  "accounts.invitation_revoke": "invitation",
  "accounts.member_state_change": "account",
  "accounts.credential_reset_issue": "credential_reset",
  "announcements.create": "announcement",
  "announcements.edit": "announcement",
  "announcements.publish": "announcement",
  "announcements.unpublish": "announcement",
  "announcements.delete": "announcement",
  "libraries.create": "library",
  "libraries.membership_add": "library",
  "libraries.membership_change": "library",
  "libraries.membership_remove": "library",
  "libraries.contribution_submit": "contribution",
  "libraries.contribution_approve": "contribution",
  "libraries.contribution_reject": "contribution",
  "libraries.contribution_withdraw": "contribution",
  "libraries.resource_admit": "contribution",
  "libraries.corpus_transition": "library",
  "drive.upload_activate": "file",
  "drive.folder_recycle": "folder",
  "drive.folder_restore": "folder",
  "drive.file_recycle": "file",
  "drive.file_restore": "file",
  "drive.file_purge_request": "file",
  "drive.file_purge_complete": "file",
};

export interface AuditRecordInput {
  action: AuditEventKind;
  outcome: AuditOutcome;
  actorKind: AuditActorKind;
  actorAccountId: string | null;
  targetId: string | null;
  reason: AuditReasonCode | null;
  occurredAt: Date;
}

export interface AuditPage {
  events: AuditEvent[];
  nextBeforeId: number | null;
  retentionPolicy: typeof AUDIT_RETENTION_POLICY;
}

function assertAuditShape(input: AuditRecordInput): void {
  if (!(AUDIT_EVENT_KINDS as readonly string[]).includes(input.action)) {
    throw new TypeError("audit action is not registered");
  }
  if (!(AUDIT_REASON_CODES as readonly string[]).includes(input.reason as string) && input.reason !== null) {
    throw new TypeError("audit reason is not registered");
  }
  if (!(input.outcome === "succeeded" || input.outcome === "denied" || input.outcome === "failed" || input.outcome === "busy")) {
    throw new TypeError("audit outcome is invalid");
  }
  if (!(input.actorKind === "account" || input.actorKind === "system" || input.actorKind === "anonymous")) {
    throw new TypeError("audit actor kind is invalid");
  }
  if (input.targetId !== null && (!/^[^\s\p{Cc}]{1,128}$/u.test(input.targetId))) {
    throw new TypeError("audit target identity is invalid");
  }
  if (!Number.isFinite(input.occurredAt.getTime())) throw new TypeError("audit timestamp must be valid");
  if ((input.actorKind === "account") !== (input.actorAccountId !== null)) {
    throw new TypeError("audit actor identity is invalid");
  }
  if ((input.outcome === "succeeded") !== (input.reason === null)) {
    throw new TypeError("audit outcome and reason are inconsistent");
  }
  const targetType = TARGET_BY_ACTION[input.action];
  if (input.outcome === "succeeded") {
    if ((targetType === null) !== (input.targetId === null)) {
      throw new TypeError("audit success target is invalid");
    }
  } else if (input.targetId !== null) {
    throw new TypeError("unsuccessful audit events cannot identify a target");
  }

  const accountActor = input.actorKind === "account";
  switch (input.action) {
    case "auth.login":
      if (!(
        (input.outcome === "succeeded" && accountActor) ||
        (input.actorKind === "anonymous" && input.outcome !== "succeeded")
      )) throw new TypeError("invalid login audit actor/outcome");
      return;
    case "auth.logout":
      if (!accountActor || input.outcome !== "succeeded") {
        throw new TypeError("invalid logout audit actor/outcome");
      }
      return;
    case "auth.password_change":
      if (!accountActor) throw new TypeError("invalid authenticated audit actor");
      return;
    case "auth.credential_reset":
      if (input.actorKind !== "anonymous") throw new TypeError("invalid credential reset audit actor");
      return;
    case "accounts.owner_bootstrap":
      if (input.actorKind !== "system" || input.outcome !== "succeeded") {
        throw new TypeError("invalid Owner bootstrap audit actor/outcome");
      }
      return;
    case "accounts.register":
      if (input.actorKind !== "anonymous") throw new TypeError("invalid registration audit actor");
      return;
    case "accounts.invitation_create":
    case "accounts.invitation_revoke":
    case "accounts.member_state_change":
    case "accounts.credential_reset_issue":
    case "announcements.create":
    case "announcements.edit":
    case "announcements.publish":
    case "announcements.unpublish":
    case "announcements.delete":
    case "libraries.resource_admit":
    case "drive.folder_recycle":
    case "drive.folder_restore":
    case "drive.file_recycle":
    case "drive.file_restore":
      if (!accountActor) {
        throw new TypeError("invalid account mutation audit actor/outcome");
      }
      return;
    case "libraries.corpus_transition":
      if (input.actorKind !== "system" || input.outcome !== "succeeded") {
        throw new TypeError("invalid corpus transition audit actor/outcome");
      }
      return;
    case "drive.upload_activate":
    case "drive.file_purge_request":
    case "drive.file_purge_complete":
      if (!(accountActor || input.actorKind === "system")) {
        throw new TypeError("invalid storage lifecycle audit actor");
      }
      return;
  }
}

export function recordAuditEvent(repositories: RepositorySet, input: AuditRecordInput): AuditEvent {
  assertAuditShape(input);
  return repositories.audit.create(input);
}

export function tryRecordAuditAttempt(persistence: Persistence, input: AuditRecordInput): boolean {
  try {
    persistence.runInTransaction((repositories) => recordAuditEvent(repositories, input));
    return true;
  } catch {
    return false;
  }
}

export class AuditService {
  constructor(private readonly persistence: Persistence) {}

  list(actor: AuthenticatedAccount, beforeId: number | null, limit = AUDIT_PAGE_DEFAULT_LIMIT): AuditPage {
    requireOwner(actor);
    if (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1)) {
      throw new RangeError("audit cursor is invalid");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > AUDIT_PAGE_MAX_LIMIT) {
      throw new RangeError("audit page limit is invalid");
    }

    const rows = this.persistence.runInTransaction((repositories) => {
      const current = repositories.accounts.findById(actor.id);
      if (!current || current.state !== "active" || current.role !== "owner") {
        throw new AuthorizationDeniedError();
      }
      return repositories.audit.listBefore(beforeId, limit + 1);
    });
    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit);
    return {
      events,
      nextBeforeId: hasMore ? events.at(-1)!.id : null,
      retentionPolicy: AUDIT_RETENTION_POLICY,
    };
  }
}
