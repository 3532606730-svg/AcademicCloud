# PROD-03C2 — Remaining First-Usable Production Gates

## Task ID
PROD-03C2 — Remaining First-Usable Production Gates

## Goal
Preserve the remaining Owner-gated production decisions from the original First-Usable Production track without allowing them to masquerade as an active repository-development task.

## Scope
Only when the Owner explicitly opens a production operations window:
- decide and verify the exact disposable-object permanent-delete gate using only a pre-registered non-academic test object;
- decide and verify the production reboot/autostart policy, or explicitly retain an accepted manual-start policy;
- reconcile the associated production runbook/evidence after those decisions.

Historical authenticated/live disposable-object acceptance, the accepted UX01 generation, the PROD-04A routine multi-user release, and the PROD-05A first-use polish + Shared Library release remain recorded in Git/runbooks and are not to be replayed merely because this card exists.

## Non-goals
- No activation under the current Pre-OCR repository/local objective.
- No production SSH/contact without explicit Owner authorization.
- No touching existing academic files or arbitrary production objects.
- No production DB/OSS/DNS/TLS/Nginx/systemd mutation beyond the exact separately authorized gate.
- No certificate renewal, another deployment, main merge, paid infrastructure, OCR, or RAG.
- No permanent deletion except the exact disposable object under a fresh explicit Owner confirmation.

## Acceptance Criteria
If and only if the Owner explicitly activates this production task:
- preflight proves the target object/action is disposable and bounded;
- the exact permanent-delete confirmation identifies the disposable target before deletion;
- no existing academic/production material is touched;
- autostart/reboot policy is explicitly chosen and verified or explicitly deferred/manual;
- applicable read-only verification and independent review pass;
- durable runbook/task/current-state records match the live result;
- no unrelated production change is bundled into the window.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- production deployment/recovery runbooks.

## Relevant Modules / Files
- `docs/deployment/*`
- `deployment/systemd/academiccloud.service`
- production acceptance tooling retained in `scripts/`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`.

## Current State
**Parked / Owner-gated, not active.** Production is live on exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15 after accepted PROD-05A. Historical live authenticated/disposable-object, multi-user, and isolated Shared Library/contribution acceptance is recorded. The remaining policy gates are the exact disposable permanent-delete confirmation and the reboot/autostart decision; neither was authorized or consumed by PROD-04A or PROD-05A.

## Completed
- historical production preflight/authentication/disposable-object acceptance plus UX01, PROD-04A, and PROD-05A production acceptance are preserved in Git/runbooks;
- this card has been removed from `tasks/doing/` so repository recovery cannot mistake a parked production boundary for the active development task.

## Remaining
- exact Owner-gated disposable permanent-delete decision/verification;
- exact Owner-gated reboot/autostart decision/verification;
- final production-record reconciliation if/when those gates are opened.

## Blockers
Explicit Owner authorization for a production operations window is mandatory. Without it, this card must remain parked and must not be selected by autonomous repository development.

## Last Verification
2026-08-18 PROD-05A reconciliation: production is exact `25cdab1…`, schema v15/history 1–15, with health/integrity/authorization evidence green; parked Pre-OCR work remains stopped; permanent-delete and autostart/reboot remain separately Owner-gated and unexecuted.

## Next Action
None under the current continuous objective. Resume only after an explicit Owner instruction that opens this production task and defines the permitted production window.
