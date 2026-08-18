export const AUDIT_EVENT_KINDS = [
  "auth.login",
  "auth.logout",
  "auth.password_change",
  "accounts.owner_bootstrap",
  "accounts.register",
  "accounts.invitation_create",
  "accounts.invitation_revoke",
  "accounts.member_state_change",
  "announcements.create",
  "announcements.edit",
  "announcements.publish",
  "announcements.unpublish",
  "announcements.delete",
  "libraries.create",
  "libraries.membership_add",
  "libraries.membership_change",
  "libraries.membership_remove",
  "libraries.contribution_submit",
  "libraries.contribution_approve",
  "libraries.contribution_reject",
  "libraries.contribution_withdraw",
  "libraries.resource_admit",
  "libraries.corpus_transition",
  "drive.upload_activate",
  "drive.folder_recycle",
  "drive.folder_restore",
  "drive.file_recycle",
  "drive.file_restore",
  "drive.file_purge_request",
  "drive.file_purge_complete",
] as const;

export const AUDIT_REASON_CODES = [
  "invalid_credentials",
  "invalid_current_password",
  "password_change_conflict",
  "password_unchanged",
  "invalid_invitation",
  "login_unavailable",
  "authorization_denied",
  "not_found",
  "invalid_target",
  "invalid_state",
  "invalid_input",
  "rate_limit_exceeded",
  "kdf_overloaded",
  "storage_unavailable",
  "upload_incomplete",
  "upload_metadata_mismatch",
  "name_conflict",
  "concurrent_change",
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];
export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[number];
export type AuditActorKind = "account" | "system" | "anonymous";
export type AuditTargetType = "account" | "invitation" | "announcement" | "library" | "contribution" | "file" | "folder";
export type AuditOutcome = "succeeded" | "denied" | "failed" | "busy";

export interface AuditEvent {
  id: number;
  occurredAt: Date;
  action: AuditEventKind;
  outcome: AuditOutcome;
  actorKind: AuditActorKind;
  actorAccountId: string | null;
  targetType: AuditTargetType | null;
  targetId: string | null;
  reason: AuditReasonCode | null;
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "targetType">;
