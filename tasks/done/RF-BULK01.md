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
- `docs/decisions/ADR-017-atomic-bulk-drive-operations.md`
- FOLDER01 recycle/restore decision record and current Drive ADRs
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- `backend/src/drive/`, `backend/src/favorites/`
- `backend/src/persistence/contracts.ts`, `backend/src/persistence/sqlite/`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- Drive/Favorites/frontend/compiled acceptance tests

## Current State
Completed from the independently green `RF-OWNERSHIP01` checkpoint `636a19e`. RF-BULK01 remains repository-only; no production host, OSS, DNS, TLS, credentials, or real data were accessed.

## Completed
- Current Drive revision, recycle-group, server-ownership, and storage-adapter boundaries exist.
- RF-PLAN01 assigned existing-lifecycle bulk behavior exactly once to this card.
- Recovered the clean ownership-domain checkpoint and the existing single-resource/FOLDER01 transaction semantics.
- ADR-017 records the operation-by-operation atomicity matrix, bounded request/expanded-subtree limits, conservative replay behavior, and no-object-byte-mutation boundary.
- Added atomic account-scoped move, recycle, restore, Favorite add, and Favorite remove service operations with opaque version preconditions, all-or-nothing SQLite transactions, cycle/overlap/provenance guards, restore metadata preflight, and rollback-safe audit behavior.
- Added `POST /api/drive/bulk`, server-derived account authority, strict bounded JSON validation, version-bearing Drive DTOs, deterministic success results, and safe error mapping.
- Added desktop/mobile multi-select UI with destructive recycle confirmation, keyboard-safe bulk move, touch-sized controls, failure retention, and stale-selection clearing on success/navigation/refresh/view changes.
- Added backend service/HTTP and frontend API/UI/mobile coverage for authorization, conflicts, replay, rollback, provenance, storage identity, and accessibility behavior.

## Remaining
- None. The implementation, independent review, durable-state reconciliation, and task checkpoint are complete.

## Blockers
Any proposal for permanent deletion, unknown-object cleanup, cross-account transfer, production use, or a bulk semantic that cannot preserve current recycle provenance must stop for Owner/data-integrity review.

## Last Verification
2026-08-17: workspace typecheck PASS; backend `214/214` PASS; frontend `149/149` PASS after repairing asynchronous checkbox test waits; production build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with `firstMigrationCount: 10` and `redeployMigrationCount: 0`; `npm audit --audit-level=low` and production-only audit report 0 vulnerabilities; `git diff --check` and staged diff check PASS. Independent read-only review PASS after the repair, with no blocker or medium-severity finding. No migration, dependency, lockfile, production, OSS, DNS, TLS, systemd, Docker, OCR, text-extraction, indexing, embedding, retrieval, RAG, or permanent-purge delta.

## Next Action
Recover from the RF-BULK01 checkpoint and select `RF-DOMAIN01` as the next approved task; do not pull forward metadata, provenance, overlays, Library, OCR, or production behavior.
