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
- `docs/decisions/ADR-021-library-contribution-promotion.md`
- `RF-OWNERSHIP01`, `RF-LIBRARY01`, `RF-AUDIT01` decisions
- concise contribution-promotion decision/ADR required for terminal ownership transfer, folder detachment, immediate Library access, retained overlays, and failure semantics

## Relevant Modules / Files
- `database/migrations/`
- Library/research/ownership/audit repositories/services/HTTP
- Drive folder/file lifecycle modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- focused workflow/concurrency/privacy/migration/UI tests

## Current State
Complete and independently green after the pushed `RF-LIBRARY01` checkpoint. The contribution/reviewer model, append-only migration 015, authorization repairs, and responsive UI are verified; the approved accelerated queue is exhausted and unrelated Pre-OCR tasks remain parked.

## Completed
- Planning defines approval as explicit ownership promotion, not shared-folder access or contributor custody.
- Personal Overlay non-promotion is a hard ADR-014 invariant.
- Owner explicitly prioritized real Member submission/review ahead of RF-META01 and the rest of the parked queue.
- ADR-021 records the explicit `submitted → approved | rejected | withdrawn` authority and terminal promotion boundary, including the single-Artifact accelerated safety constraint.
- Migration 015 adds immutable contribution state, one-active-submission uniqueness, guarded promotion intents, and append-only contribution audit vocabulary.
- Repository/service/HTTP/UI support explicit submit, scoped list/preview/download, approve/reject/withdraw, immediate Library holdings, and Member status/withdrawal presentation.
- Approval transactionally preserves stable Record/Artifact/Version/File IDs, object key, uploader provenance, Favorite/Overlay rows, and clears only incompatible account-folder placement.
- State-aware candidate reads keep submitted/rejected/withdrawn bytes in the contributor account domain and approved bytes in the target Library domain; approval in one Library makes any other Library's concurrent stale submission inert and non-disclosing.
- Database insert/update guards and submitted-only repository types prevent terminal-state creation and require approved state to be coupled to the active promotion intent plus the complete Library-owned resource chain.
- Library-scoped UI rows clear on selection, and Library selection is disabled until an in-flight scoped mutation and refresh finish.
- The independent read-only Reviewer returned final PASS after the original cross-Library authorization Blocker and all follow-up Medium/Low findings were repaired and retested.

## Remaining
None. Record the exact task checkpoint, push the synchronized branch, and STOP.

## Blockers
None within RF-LIBRARY02. Production rollout and every parked product task remain separately Owner-gated.

## Last Verification
2026-08-18: final independent read-only review PASS with no remaining Blocker/Medium/Low finding. Final repair-focused contribution service + migration checks PASS (10/10); the prior combined backend/persistence/account/audit/research/preview/platform baseline remains PASS (74/74); frontend Vitest PASS (165/165); backend/frontend typecheck and production build PASS; `git diff --check` PASS. Coverage includes cross-Library stale-submission non-disclosure, direct terminal INSERT and unguarded approval rejection, normal transactional promotion, duplicate submission, scoped preview/download, approve/reject/withdraw, stable-ID/object-key/uploader/Favorite preservation, folder detachment, disabled/removed submitter behavior, immediate Library holdings, one-winner concurrency, audit-failure rollback, append-only migration 015, and Library selection/mutation races. No production or external system was contacted.

## Next Action
Create and push the exact RF-LIBRARY02 checkpoint, verify local HEAD equals origin, and STOP before all parked work.
