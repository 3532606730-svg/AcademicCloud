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
Complete in repository development. Migration 006 and the existing folder lifecycle path now support transactional recursive recycle/restore while production remains unchanged on UX01.

## Completed
- Inspected the existing repository interfaces, `BEGIN IMMEDIATE` transaction boundary, file revision CAS, Recycle/Favorites behavior, HTTP routes, and frontend contract before implementation.
- Added migration `006_recycle_groups.sql` without editing migrations 001–005; fresh and prior-schema upgrades, replay/checksum, integrity, backup/restore, and production-startup fail-closed behavior pass.
- Added explicit same-owner recycle groups, root identity, member counts, lifecycle provenance guards, legacy one-resource-per-group backfill, and root-only Recycle queries.
- Implemented active-subtree collection, deep pending-upload rejection, one-transaction recursive recycle, exact-group/topological restore, parent/name-conflict gates, file CAS, and transactional group cleanup.
- Preserved standalone file recycle/restore/purge recovery and blocked recursive permanent purge of grouped descendants.
- Verified the complete 24-item behavioral matrix, including deep trees, independently pre-deleted resources/Favorites, zero mutation on rejects/faults, account isolation, competing calls, unchanged IDs/object keys/hierarchy, and zero storage deletion.
- Updated the bilingual folder confirmation to state that active contents move with the folder; existing APIs remain unchanged.
- Passed backend 135/135, frontend 121/121, workspace typecheck/build, acceptance tools 25/25, compiled acceptance, migration checks, diff/secret checks, and dependency delta 0.
- Independent read-only adversarial review PASS with no blocker or medium finding.

## Remaining
None.

## Blockers
None for task completion. Production migration/deployment remains separately Owner-gated and was not performed.

## Last Verification
2026-08-17 final verification: backend 135/135 and frontend 121/121 PASS; typecheck/build PASS; acceptance tools 25/25 PASS; compiled acceptance PASS with migration count 6 and restart/maintenance/backup/isolated-restore checks; diff and targeted secret scans clean; package/lockfile delta zero. Independent Reviewer PASS, no blocker or medium finding.

## Next Action
Stop L1-FOLDER01 after its coherent green Git checkpoint. Re-recover repository state and activate `L2-ACCOUNTS01`; do not implement `L2-ANNOUNCE01` before Accounts I is green.
