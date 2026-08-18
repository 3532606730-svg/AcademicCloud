# PROD-03C2 — Remaining First-Usable Production Gates

## Task ID
PROD-03C2 — Remaining First-Usable Production Gates

## Goal
Preserve the remaining Owner-gated real production confirmations and operations decisions from the original First-Usable Production track without allowing them to masquerade as an active repository-development task or as ownership of the already-implemented product lifecycle.

## Scope
Only when the Owner explicitly opens a production operations window:
- confirm the existing global-Owner-only permanent-delete lifecycle against one exact pre-registered non-academic disposable object, if the Owner separately authorizes that real destructive production action;
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
- `docs/decisions/ADR-028-permanent-delete-authority-and-domain-safety.md`
- production deployment/recovery runbooks.

## Relevant Modules / Files
- `docs/deployment/*`
- `deployment/systemd/academiccloud.service`
- production acceptance tooling retained in `scripts/`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`.

## Current State
**Parked / Owner-gated, not active.** Production is live on exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at schema v18/history 001–018 after completed PROD-07A/PROD-07B; rollback was not used. PROD-07B consumed the product-authority and implementation decision for global-Owner-only account/Library permanent deletion, including Library exclusivity proof and destructive-boundary revalidation, but deliberately performed no real resource purge. This card therefore owns only any later separately authorized real disposable-object confirmation plus the reboot/autostart decision; it does not reopen or supersede ADR-028.

## Completed
- historical production preflight/authentication/disposable-object acceptance plus UX01, PROD-04A, and PROD-05A production acceptance are preserved in Git/runbooks;
- PROD-07B implemented and deployed the product lifecycle without executing a real purge; L1-UX07 forward-ported that behavior into the v19 development line;
- this card has been removed from `tasks/doing/` so repository recovery cannot mistake a parked production boundary for the active development task.

## Remaining
- exact Owner-gated real disposable-object permanent-delete confirmation/verification, only if explicitly reopened;
- exact Owner-gated reboot/autostart decision/verification;
- final production-record reconciliation if/when those gates are opened.

## Blockers
Explicit Owner authorization for a production operations window is mandatory. Without it, this card must remain parked and must not be selected by autonomous repository development.

## Last Verification
2026-08-19 L1-UX07 reconciliation: production remains exact `bc578863…`, schema v18/history 001–018 after PROD-07B, rollback unused; the product permanent-delete lifecycle is implemented, while a real disposable-object confirmation, autostart/reboot, infrastructure-policy repair, and all other production mutations remain separately Owner-gated and unexecuted. Development is v19/history 001–019 with RF-METASUGGEST01 undeployed.

## Next Action
None under the current continuous objective. Resume only after an explicit Owner instruction that opens this production task and defines the permitted production window.
