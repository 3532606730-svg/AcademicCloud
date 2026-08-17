# RF-AUDIT01 — Governance Security Audit Foundation

## Task ID
RF-AUDIT01 — Governance Security Audit Foundation

## Goal
Add a bounded, server-authored governance/security audit trail for administrative and security mutations without turning AcademicCloud into a record of private research behavior.

## Scope
Implement the Governance/Operations audit plane across persistence, service/API integration, Owner-only review UI, and tests. Use the fixed event/target/reason registries and immutable columns defined by ADR-015 for authentication/account/invitation/password/announcement administration plus current Drive upload activation, recycle, restore, and permanent-purge decisions. Retain at most 20,000 newest rows with ID-keyset pagination (default 50/max 100); no edit/delete/search/export API. Later Library cards must add membership/permission/contribution-review audit events through this same contract. Personal overlay/search/annotation/citation/evidence actions emit no administrative research-activity events. Store only server-authored action, outcome, actor kind/ID, safe opaque target ID, closed reason, and UTC time; never store credentials, session material, URLs with capabilities, filenames, private overlay content, search terms, reading/page activity, annotation/citation/evidence/question content, or raw request bodies. Add only a new append-only migration after the current head.

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
- Audit rows are immutable, fixed-column, reason-code constrained, and capped at 20,000; no application update/delete/search/target-resolution endpoint exists.
- Migration is additive after the current head; migration, restart, backup/restore, compiled acceptance, and redeploy-with-zero-new-migrations pass.
- Backend authorization/integration tests cover Owner, Member, disabled account, authority-field injection, secret redaction, concurrency, rollback, and exact time/order boundaries.
- Frontend tests cover accessible Owner review, responsive/mobile presentation, empty/error/loading states, and no new primary navigation item unless independently justified.
- Independent review focuses on research-surveillance creep, secret leakage, actor spoofing, transaction gaps, unbounded queries, and accidental access to private overlays.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-011-accounts-and-invitation-security-model.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- `docs/decisions/ADR-015-governance-audit-event-model.md`

## Relevant Modules / Files
- `database/migrations/`
- `backend/src/persistence/contracts.ts`
- `backend/src/platform/application.ts`
- `backend/src/auth/`, `backend/src/accounts/`, `backend/src/announcements/`
- new `backend/src/audit/` and SQLite repository modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- backend/frontend/compiled acceptance and backup tests

## Current State
**Complete from RF-PLAN01 checkpoint `9e02165b3f4b9e99d0906f4a15e8a4620c87cf71`; repository-only and not deployed.** Migration 009 is the current schema head. Governance/security events are fixed-column, transaction-coupled for successful mutations, target-free for unsuccessful attempts, bounded to the newest 20,000 rows, and exposed only through an Owner-authorized keyset page/dialog.

## Completed
- ADR-014 classifies audit as Governance/Operations and explicitly forbids research surveillance.
- RF-PLAN01 assigned this capability exactly once to this card.
- ADR-015 records the fixed-column, bounded-retention, transaction-coupled audit decision.
- Added migration 009 with immutable audit rows and append-only event/target/reason registries; no historical migration was edited.
- Integrated login/logout/password, Owner bootstrap/registration/invitation/member state, announcement mutations, Drive upload activation/recycle/restore, and two-phase purge evidence.
- Added target-free denied/busy/failed event paths, including deterministic login-race, rate-limit, cross-account, and provider-failure coverage.
- Added Owner-only bounded API and responsive localized dialog without search/export/target resolution or a fifth primary navigation destination.
- Verified backup/restore of synthetic audit evidence, production startup migration gates, compiled runtime/redeploy acceptance, and independent adversarial review.

## Remaining
None inside RF-AUDIT01. Production rollout remains separately Owner-gated.

## Blockers
None.

## Last Verification
2026-08-17 final Writer verification: backend `196/196` PASS; frontend `142/142` PASS; workspace typecheck and production build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with `firstMigrationCount: 9`, health/readiness, restart/session/password behavior, maintenance dry-run, verified backup receipt, isolated restore, restored readiness/session/announcement, and `redeployMigrationCount: 0`; full and production dependency audits report 0 vulnerabilities; `git diff --check` PASS; no package/lockfile delta; high-confidence credential scan found only pre-existing explicit scanner fixtures. Independent read-only adversarial Reviewer PASS after repair of transaction-race denial evidence, append-only registry guards, complete target-free denied/busy/failed coverage, and audit-dialog loading/error/empty/mobile/focus behavior. No blocker or medium finding remains.

## Next Action
Create the RF-AUDIT01 Git checkpoint, run exact-commit Linux production-artifact CI, then select `RF-OWNERSHIP01` without pulling forward Library implementation.
