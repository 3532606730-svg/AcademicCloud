# RF-BULK01 — Safe Bulk Drive Operations

## Task ID
RF-BULK01 — Safe Bulk Drive Operations

## Goal
Add safe multi-select operations for the existing Drive lifecycle with explicit atomicity, conflict, and partial-failure semantics.

## Scope
Implement account-authorized bulk move, recycle, restore where current provenance rules permit, and Favorite add/remove over existing files/folders. Use stable IDs and server-owned account scope. Define per-operation all-or-nothing versus explicit item-result behavior before coding; favor a single SQLite transaction for metadata-only batches and bounded item counts. Integrate backend, API, desktop/mobile UI, and tests. No migration is expected; if durable idempotency state becomes necessary, add only a new migration after the then-current head.

## Non-goals
- No bulk permanent purge, object-byte copy/delete, cross-account move, Library operation, metadata editing, OCR, or production action.
- No weakening of FOLDER01 recursive recycle/restore provenance.
- No editing historical migrations or introducing a general workflow engine.

## Acceptance Criteria
- The server derives account ownership and rejects mixed-owner, missing, deleted, stale-revision, duplicate-ID, parent/descendant cycle, and authority-field attacks without existence leaks.
- Atomic operations roll back every metadata/Favorite mutation on any rejected member; any deliberately partial operation returns deterministic per-item results and never reports false global success.
- Replay/idempotency and concurrent rename/move/recycle/restore/Favorite races preserve current revision and recycle-group invariants.
- No object bytes are copied, overwritten, or deleted by metadata-only bulk actions; original storage keys remain stable.
- Batch size/input complexity are bounded and validation avoids quadratic or unbounded work.
- Backend tests cover Owner and Member same-account success, cross-account denial, disabled account, cycles, independently recycled descendants, conflict/replay, and injected rollback failure.
- Frontend tests cover selection state, destructive confirmation where applicable, partial/error messaging, cancellation-safe state, keyboard/touch accessibility, and responsive/mobile layout.
- Migration delta is zero unless a separately reviewed additive migration is proven necessary; full test/typecheck/build/compiled acceptance remains green.
- Independent review focuses on data loss, partial commits, stale selection, cycle/provenance corruption, cross-account leaks, and accidental permanent deletion.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- FOLDER01 recycle/restore decision record and current Drive ADRs
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- `backend/src/drive/`, `backend/src/favorites/`
- `backend/src/persistence/contracts.ts`, `backend/src/persistence/sqlite/`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- Drive/Favorites/frontend/compiled acceptance tests

## Current State
Blocked by `RF-OWNERSHIP01` after `RF-AUDIT01`. Existing APIs operate primarily one resource at a time; transactional recursive folder lifecycle and per-account Favorites are already green.

## Completed
- Current Drive revision, recycle-group, server-ownership, and storage-adapter boundaries exist.
- RF-PLAN01 assigned existing-lifecycle bulk behavior exactly once to this card.

## Remaining
- define the operation-by-operation atomicity table and size limits;
- implement server/API/UI behavior without byte mutation;
- test races, rollback, provenance, authorization, and mobile interaction;
- independently review and checkpoint.

## Blockers
Any proposal for permanent deletion, unknown-object cleanup, cross-account transfer, production use, or a bulk semantic that cannot preserve current recycle provenance must stop for Owner/data-integrity review.

## Last Verification
2026-08-17 planning recovery confirmed current Drive/Favorites repositories, revision CAS, and FOLDER01 provenance are the authoritative baseline; no bulk persistence model exists.

## Next Action
Start only after `RF-OWNERSHIP01` is green; recover the current Drive/domain concurrency rules, publish the atomicity matrix in the task diff, and implement the bounded vertical slice.
