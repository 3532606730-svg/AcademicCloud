# RF-AUDIT01 — Governance Security Audit Foundation

## Task ID
RF-AUDIT01 — Governance Security Audit Foundation

## Goal
Add a bounded, server-authored governance/security audit trail for administrative and security mutations without turning AcademicCloud into a record of private research behavior.

## Scope
Implement the Governance/Operations audit plane across persistence, service/API integration, Owner-only review UI, and tests. Use an allowlisted event taxonomy and allowlisted payload fields for authentication/account/invitation/password/announcement administration plus current Drive upload activation, recycle, restore, and permanent-purge decisions. Later Library cards must add membership/permission/contribution-review audit events through this same contract. Personal overlay/search/annotation/citation/evidence actions emit no administrative research-activity events. Store actor, action, safe opaque target type/identifier, result, and server time; never store credentials, session material, URLs with capabilities, filenames, private overlay content, search terms, reading/page activity, annotation/citation/evidence/question content, or raw request bodies. Add only a new append-only migration after the current head.

## Non-goals
- No behavioral analytics, research-activity timeline, telemetry service, SIEM integration, or production log ingestion.
- No recording of file contents, private notes, reading progress, search queries, annotations, citations, evidence, or future AI prompts.
- No production access/deployment, dependency addition unless independently justified, or edit to historical migrations.

## Acceptance Criteria
- Audit events are server-derived; clients cannot choose actor, authority, target owner, event type, timestamp, or result.
- Owner can inspect governance/security events; Member cannot access the audit surface. Owner authority still does not grant access to Personal Research Overlay content.
- Failed and successful security-relevant mutations have a stable, credential-free event contract without logging passwords, invitation tokens, cookies, signed URLs, AccessKeys, or request bodies.
- Event persistence is atomic with the governed mutation where rollback consistency matters; injected audit/mutation failures cannot create a false success record or commit a mutation without its required event.
- Event kinds/payload fields are strict allowlists. Pagination/order and the bounded retention/query policy are deterministic; event identifiers are stable and no cross-account existence leak is introduced.
- Tests prove that filenames, search terms, private notes, page/progress state, annotations, citations, Evidence Bundles, and Research Questions never enter the audit store, application logs, or Owner UI.
- Migration is additive after the current head; migration, restart, backup/restore, compiled acceptance, and redeploy-with-zero-new-migrations pass.
- Backend authorization/integration tests cover Owner, Member, disabled account, authority-field injection, secret redaction, concurrency, rollback, and exact time/order boundaries.
- Frontend tests cover accessible Owner review, responsive/mobile presentation, empty/error/loading states, and no new primary navigation item unless independently justified.
- Independent review focuses on research-surveillance creep, secret leakage, actor spoofing, transaction gaps, unbounded queries, and accidental access to private overlays.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-011-accounts-and-invitation-security-model.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- `database/migrations/`
- `backend/src/persistence/contracts.ts`
- `backend/src/platform/application.ts`
- `backend/src/auth/`, `backend/src/accounts/`, `backend/src/announcements/`
- new `backend/src/audit/` and SQLite repository modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- backend/frontend/compiled acceptance and backup tests

## Current State
Ready first. Accounts, invitations, password change, and announcements are server-authorized, but there is no repository-owned governance audit model. Current schema head is migration 008.

## Completed
- ADR-014 classifies audit as Governance/Operations and explicitly forbids research surveillance.
- RF-PLAN01 assigned this capability exactly once to this card.

## Remaining
- design the minimal event taxonomy and safe payload;
- implement additive persistence and atomic integration;
- add bounded Owner review API/UI;
- verify migration/runtime/backup/restore and adversarial privacy/security cases;
- independently review, reconcile durable state, and checkpoint.

## Blockers
Any requirement to record private research activity/content, introduce a paid/resident logging service, contact production, or broaden Owner product authority over Personal Research Overlays requires Owner escalation.

## Last Verification
2026-08-17 RF-PLAN01 architecture recovery: current persistence has no audit repository/table; the task is dependency-safe against the existing Accounts/Drive baseline and must allocate only a new append-only migration.

## Next Action
After RF-PLAN01 is checkpointed, select this first card, recover current code/tests, design the exact non-surveillance event contract, then implement and independently review it locally.
