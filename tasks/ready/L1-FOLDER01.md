# L1-FOLDER01 — Transactional Recursive Folder Recycle/Restore

## Task ID
L1-FOLDER01 — Transactional Recursive Folder Recycle/Restore

## Goal
Allow non-empty folders to be recycled/restored as one safe metadata operation while preserving existing file bytes, hierarchy, account isolation, Favorites, and independently deleted descendants.

## Scope
- Add explicit recycle-operation provenance for recursively recycled folder trees using a model equivalent to `recycle_root_id` or deletion-group identity.
- Recursively recycle the active target root plus active descendant folders/files in one SQLite transaction.
- Leave descendants that were already deleted before the parent operation untouched and outside the new recycle group.
- Reject the entire recursive recycle if any active `pending_upload` exists anywhere in the active subtree.
- Restore only the exact root/group members created by that recycle operation.
- Preserve IDs, hierarchy, parent relationships, object keys, metadata, and Favorite relations.
- Keep recursive recycle/restore metadata-only: no OSS byte deletion.
- Show operation roots in Recycle rather than flooding top-level Recycle with every grouped descendant.
- Preserve existing conservative permanent-delete semantics; do not add recursive permanent folder purge.
- Evolve existing folder recycle/restore actions where practical rather than creating parallel duplicate APIs.

Critical invariant:

> A descendant that was independently deleted before its parent was later recycled must never be resurrected when the parent is restored.

Example:

```text
A/
├── old-deleted.pdf   (deleted before A)
└── B/
    └── active.pdf
```

Recycle A, then restore A:
- A active;
- B active;
- active.pdf active;
- old-deleted.pdf remains deleted.

Additional restore rules:
- if the original parent is active, restore to that exact parent;
- if root-level, restore root-level;
- if original parent is unavailable/incompatibly deleted, fail explicitly—never silently relocate to root;
- if an active sibling name conflicts, fail without overwrite/merge/auto-rename and keep the group deleted.

Favorites rules:
- Favorite relation survives recycle;
- grouped favorite is hidden while deleted and visible after same-group restore;
- independently pre-deleted favorite remains deleted/hidden after parent restore.

## Non-goals
- No recursive permanent deletion/purge.
- No batch OSS delete due to recursive recycle/restore.
- No auto-cancel of pending uploads.
- No partial-subtree recycle.
- No auto-rename/overwrite on restore conflict.
- No Shared Library/account-role work.
- No production migration/deployment.
- No new dependency.

## Acceptance Criteria
Schema/migration:
- add the actual next migration after current migration 005; never edit 001–005;
- fresh database → latest works;
- prior schema → latest works;
- migration checksums/replay/current-schema behavior remains correct;
- production startup remains fail-closed and no production migration is run.

Behavioral matrix must cover at minimum:
1. one folder + active file recycle/restore;
2. deep A/B/C tree with files;
3. independently pre-deleted child remains deleted after parent recycle/restore (critical);
4. independently pre-deleted nested folder remains deleted;
5. direct pending upload rejects whole operation with zero mutation;
6. deep pending upload rejects whole operation with zero mutation;
7. wrong-account recycle rejected/not-found with zero mutation;
8. wrong-account restore rejected/not-found;
9. original active parent restored exactly;
10. unavailable original parent causes failure/no relocation;
11. active sibling name conflict causes failure/group remains deleted;
12. grouped Favorite hidden then visible after restore;
13. pre-deleted Favorite remains hidden;
14. double recycle safe;
15. double restore safe;
16. concurrent recycle attempts safe;
17. injected mid-recycle failure rolls back all;
18. injected mid-restore failure rolls back all;
19. object keys unchanged;
20. IDs unchanged;
21. no OSS deletion during recycle/restore;
22. Recycle top-level shows root without grouped descendant duplication;
23. Favorites remain account scoped;
24. legacy records survive migration.

Full canonical tests/typecheck/build/acceptance/diff/secret checks must pass; dependency delta remains zero; dedicated adversarial review must attack transaction, provenance, stale state, account isolation, Favorites, and rollback semantics.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- next database migration after 005
- folder/file domain and repository contracts
- SQLite folder/file repositories and transaction boundary
- `backend/src/drive/drive-service.ts`
- `backend/src/drive/http.ts`
- recycle/list/restore backend tests
- frontend folder recycle/Recycle integration and tests
- Favorites integration tests

## Current State
Ready, not started. Production UX01 and current development baseline can recycle empty folders but intentionally do not safely support recursive non-empty-folder recycle/restore.

## Completed
None.

## Remaining
- inspect current lifecycle/repository/CAS conventions;
- select explicit recycle provenance model;
- add migration and transaction-safe subtree operations;
- integrate service/API/frontend;
- implement mandatory matrix and failure injection;
- adversarial review/repair;
- full gates, state reconciliation, checkpoint.

## Blockers
None known. Stop only if actual repository constraints make the central invariant impossible without a broader product-model change, or if an irreversible/production migration would be required.

## Last Verification
2026-08-17 planning reconciliation: FOLDER01 is approved after PERF01. Current committed migration count is 5; current production/UX01 limitation on non-empty-folder recycle is explicitly recorded as an existing product limitation.

## Next Action
After PERF01 is green and checkpointed, move this task to `tasks/doing/`, recover current drive lifecycle code/tests, and design the recycle provenance/transaction model before implementation.
