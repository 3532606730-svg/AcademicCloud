# RF-INTAKE01 — Research Inbox and Intake API

## Task ID
RF-INTAKE01 — Research Inbox and Intake API

## Goal
Add a recoverable Research Inbox and stable Save-to-AcademicCloud boundary for duplicate-aware scholarly acquisition and explicit user triage.

## Scope
Implement an account-private intake state machine from discover/upload/save to Inbox, fingerprint check, deterministic non-AI metadata-suggestion contract, provenance capture, and user triage: attach to accessible existing Record, create a Record, archive as ordinary file, or discard recoverably. Expose a stable authenticated intake API suitable for future tooling, plus responsive UI. Reuse the single duplicate/search/identity contracts. Add append-only migration(s).

## Non-goals
- No browser extension, external deposit link, public upload, OCR/AI metadata extraction, external catalog lookup, inaccessible duplicate disclosure, automatic merge, or permanent byte deletion.

## Acceptance Criteria
- Inbox entries are private to the authenticated account/domain; Owner cannot browse another account's intake activity.
- The API derives account/domain/uploader/creator/state/time. Capabilities, owner/record authority, metadata confidence, and provenance authority cannot be client-forged.
- Duplicate lookup reuses `RF-PROV01`; no-match and inaccessible-only match are indistinguishable and no cross-account count/ID leaks.
- The suggestion boundary is deterministic/manual or test-fixture-only, labels provenance/confidence, performs no OCR/network/AI, and never becomes authoritative without user confirmation.
- Attach/create/archive/discard transitions are explicit, transactional, idempotent/conflict-safe, and bounded. Discard cancels task-owned pending state or uses existing recoverable recycle semantics; it never permanently deletes bytes.
- Accepted contribution to a Record preserves original Artifact identity/provenance and does not copy bytes unnecessarily.
- UI/API tests cover every state transition, replay/race/rollback, Owner/Member, cross-account denial, disabled account, duplicate privacy, mobile/accessibility, and interruption recovery.
- Migration, restart, backup/restore, compiled acceptance, and independent data-loss/privacy review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- storage/direct-upload decisions plus `RF-DOMAIN01`, `RF-PROV01`, `RF-SEARCH01`

## Relevant Modules / Files
- `database/migrations/`
- new intake domain/repository/service/HTTP modules
- Drive/upload, research identity/provenance/search modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- state-machine/privacy/concurrency/compiled acceptance tests

## Current State
Blocked on `RF-PROV01` and `RF-SEARCH01`, sequenced after Saved Views. Upload currently creates ordinary Drive files directly; no Inbox/triage contract exists.

## Completed
- Approved intake stages/outcomes and browser-extension non-blocker are recorded.
- RF-PLAN01 assigns the deterministic suggestion boundary and stable API here.

## Remaining
- define state machine/API/idempotency/recoverable discard semantics;
- implement persistence/backend/UI reusing shared authority services;
- verify every transition, privacy, failure recovery, and compiled runtime;
- independently review and checkpoint.

## Blockers
Public/external upload, OCR/AI suggestion, permanent deletion, external service/cost, or an intake path that bypasses storage/duplicate authority requires Owner escalation.

## Last Verification
2026-08-17 baseline has direct upload and pending/active lifecycle but no intake persistence or API.

## Next Action
After `RF-VIEWS01`, publish the transition/idempotency table and implement the recoverable, private intake slice.
