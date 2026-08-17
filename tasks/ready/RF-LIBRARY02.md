# RF-LIBRARY02 — Contribution Review

## Task ID
RF-LIBRARY02 — Contribution Review

## Goal
Add the minimum real Library-scoped contribution workflow so a Member can explicitly submit an eligible private resource for review and an authorized reviewer can approve or reject it without gaining access to the Member's unrelated private Drive or Personal Research Overlay.

## Scope
Implement a `submitted | approved | rejected | withdrawn` review state for eligible active account-owned Scholarly Records/Artifacts. Approval atomically promotes the accepted resource/artifact/version into the Library ownership domain, preserves stable IDs/object keys/uploader/provenance/original-name information already available, clears incompatible account-folder placement where required, and never transfers Personal Research Overlay rows. Rejection/withdrawal leaves ownership unchanged. Add the minimal Member submission UI and an authorized `投稿审核 / Contribution review` surface that can list, preview/download, approve, and reject only explicitly submitted resources. Add append-only migration(s) after the actual current development schema head if required.

This checkpoint is intentionally accelerated immediately after `RF-LIBRARY01` by Owner direction. Trusted Contributor bypass/auto-approval semantics are deferred unless they are strictly required for correctness of the minimum review workflow.

## Non-goals
- No public contribution, external deposit, object deletion, automatic metadata merge, Personal Tag/note/annotation/citation/evidence promotion, catalog governance, or production use.
- No browse-all-Member-files Owner capability.
- No Trusted Contributor expansion in this accelerated slice unless necessary for the base authority model.

## Acceptance Criteria
- Only active, accessible, non-pending/non-deleted/non-purging/non-purged eligible resources can be submitted; one active submission per resource/Library is enforced.
- Submission is explicit; reviewer authority applies only to submitted resources and never to the rest of the contributor's private Drive.
- Reviewer listing exposes only minimal review metadata such as resource/file name, submitter, size/type, submission time, and state.
- Reviewer can safely preview/download the explicitly submitted resource through scoped authorization.
- Approval is one authoritative transaction: validate reviewer authority/state/revision, promote canonical resource/artifact ownership to Library, preserve uploader identity/bytes/object key/stable IDs, record the governance result where applicable, and commit or roll back all.
- A committed approval is terminal ownership promotion for this task; no hidden reverse-transfer toggle is introduced.
- Immediately after approval, currently authorized Library members can list, preview, and download the holding.
- Rejection and withdrawal leave contributor ownership and stored bytes unchanged.
- Contributor disable/removal after approval cannot orphan or revoke the Library-owned resource; before approval it cannot allow stale unauthorized review completion.
- Personal reading/progress/Recent/Tags/Collections/Views/notes/annotations/citations/evidence/questions never transfer or become reviewer-visible.
- Concurrent approve/reject/withdraw has deterministic one-winner semantics without duplicate ownership/events.
- Nonreviewers/nonmembers cannot enumerate submissions; clients cannot forge reviewer identity, Library authority, or owner domain.
- Focused backend/persistence/frontend tests cover submit, review listing/preview, approve, reject, withdraw, ownership promotion, disabled-account behavior, cross-account non-disclosure, one important concurrency race, migration persistence, and responsive UI.
- Verification is intentionally bounded: relevant suites, one workspace typecheck/build pass, then one focused independent review. Repair concrete findings and rerun only affected verification; do not repeatedly run unrelated broad acceptance/artifact/backup/benchmark audits once relevant evidence is green.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-OWNERSHIP01`, `RF-LIBRARY01`, `RF-AUDIT01` decisions
- concise contribution-promotion decision/ADR required for terminal ownership transfer, folder detachment, immediate Library access, retained overlays, and failure semantics

## Relevant Modules / Files
- `database/migrations/`
- Library/research/ownership/audit repositories/services/HTTP
- Drive folder/file lifecycle modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- focused workflow/concurrency/privacy/migration/UI tests

## Current State
Owner-accelerated and Ready after `RF-LIBRARY01`. There is currently no contribution/reviewer model; unrelated Pre-OCR tasks remain parked.

## Completed
- Planning defines approval as explicit ownership promotion, not shared-folder access or contributor custody.
- Personal Overlay non-promotion is a hard ADR-014 invariant.
- Owner explicitly prioritized real Member submission/review ahead of RF-META01 and the rest of the parked queue.

## Remaining
- record the concise contribution-promotion authority/state decision;
- implement submission/review persistence, API, and UI;
- verify focused authorization, privacy, ownership, persistence, and concurrency cases;
- independently review once and checkpoint.

## Blockers
Byte deletion, public contribution, automatic private-data promotion, global browse-all content authority, production migration/deployment, or a transfer that cannot preserve stable identity/lifecycle requires Owner/data-integrity review.

## Last Verification
2026-08-17: no Library contribution model exists yet; the accelerated prerequisite is `RF-LIBRARY01` only.

## Next Action
After `RF-LIBRARY01` is green, implement the minimum Member submit → reviewer approve/reject/withdraw workflow, checkpoint it, reconcile durable state, and STOP before any production rollout.
