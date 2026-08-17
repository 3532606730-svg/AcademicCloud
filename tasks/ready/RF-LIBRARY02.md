# RF-LIBRARY02 — Contribution Review and Trusted Contributor

## Task ID
RF-LIBRARY02 — Contribution Review and Trusted Contributor

## Goal
Add a Library-scoped contribution workflow in which reviewed acceptance makes a resource Library-owned independently of the contributor account while preserving private overlays.

## Scope
Implement Library contributor/Trusted Contributor authority and a `submitted | approved | rejected | withdrawn` review state for eligible active account-owned Scholarly Records/Artifacts. Define exact bypass limits, if any, for Trusted Contributor. Approval atomically transfers accepted resource/artifact/version ownership to the Library domain, preserves stable IDs/object keys/uploader/provenance/original name, clears incompatible account-folder placement, and never transfers Personal Overlay rows. The same checkpoint adds a minimal Library holdings/read surface so authorized members can immediately list, inspect, download, and preview an approved resource through existing scoped authorization before catalog enhancements arrive. Rejection/withdrawal leaves ownership unchanged. Add append-only migration(s), strict API/UI, audit events, and tests.

## Non-goals
- No public contribution, external deposit, object deletion, automatic metadata merge, Personal Tag/note/annotation/citation/evidence promotion, catalog governance, or production use.

## Acceptance Criteria
- Only active, accessible, non-pending/non-deleted/non-purging/non-purged resources can be submitted; one active submission per resource/Library is enforced.
- Approval is one transaction: validate reviewer authority/state/revision, promote canonical resource/artifact ownership to Library, preserve uploader identity/bytes/object key/stable IDs, create governance event, and commit or roll back all.
- A committed approval is a terminal ownership promotion in this task, not an automatically reversible toggle. Any future transfer/removal workflow requires its own explicit recoverability/data-retention contract; ordinary failure before commit rolls back completely.
- Immediately after approval, every currently authorized Library member can list the holding and use the existing safe metadata/download/preview paths; no green checkpoint may strand Library-owned bytes until `RF-LIBRARY03`.
- Contributor disable/removal after approval cannot orphan or revoke the Library-owned resource. Before approval it cannot let an unauthorized reviewer complete a stale request.
- Personal reading/progress/Recent/Tags/Collections/Views/notes/annotations/citations/evidence/questions never transfer or become reviewer-visible. If the contributor later lacks resource authority, that private overlay is retained but unavailable—not deleted, promoted, or exposed—until authority is legitimately restored. Canonical provenance/metadata proposals are explicitly separated.
- Trusted Contributor is Library-scoped, server-derived, least privilege, and cannot grant membership/role or bypass forbidden lifecycle/privacy gates.
- Concurrent approve/reject/withdraw/resubmit and membership/disable changes have deterministic one-winner semantics without duplicate ownership/events.
- UI/API tests cover every role/state/race, cross-Library/account disclosure, mobile/accessibility, rollback, audit redaction, migration, backup/restore, compiled acceptance.
- Independent review focuses on resource theft, stale approval, personal-data promotion, contributor-orphaning, object loss, authority escalation, and audit leakage.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-OWNERSHIP01`, `RF-LIBRARY01`, `RF-AUDIT01` decisions
- new contribution-promotion ADR required for terminal ownership transfer, rollback/non-reversal, folder detachment, immediate Library access, retained overlays, and recovery/migration consequences

## Relevant Modules / Files
- `database/migrations/`
- Library/research/ownership/audit repositories/services/HTTP
- Drive folder/file lifecycle modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- workflow/concurrency/privacy/migration/compiled acceptance tests

## Current State
Blocked on `RF-LIBRARY01`. There is no contribution/reviewer/Trusted Contributor model.

## Completed
- Planning defines approval as explicit ownership transfer, not shared-folder access or contributor custody.
- Personal Overlay non-promotion is a hard ADR-014 invariant.

## Remaining
- record the contribution-promotion ADR and define role/state/transfer/retry matrix plus audit payload;
- implement atomic workflow and UI;
- verify all races, privacy, object identity, recovery, and compiled runtime;
- independently review and checkpoint.

## Blockers
Byte deletion, public contribution, automatic private-data promotion, global role expansion, or a transfer that cannot preserve stable identity/lifecycle requires Owner/data-integrity review.

## Last Verification
2026-08-17 planning verification: no Library contribution model exists; current ownership is account-only before prerequisite migrations.

## Next Action
After `RF-LIBRARY01`, write the contribution-promotion ADR, publish the exact state/role/ownership-transfer matrix, then implement the transactional workflow.
