# RF-OWNERSHIP01 — Explicit Resource Ownership Domains

## Task ID
RF-OWNERSHIP01 — Explicit Resource Ownership Domains

## Goal
Replace the current account-only Drive ownership substrate with a concrete ownership-domain parent that preserves all existing behavior and can later own Library resources independently of any contributor account.

## Scope
Record an ADR and implement an additive, deterministic migration that introduces `account` and future `library` ownership-domain kinds, creates exactly one account domain per existing account, and moves folder/file/recycle authority to stable domain IDs. Rebuild current account-keyed tables where SQLite constraints require it, preserving every existing folder/file/recycle/Favorite ID, object key, state, revision, timestamp, hierarchy, and recycle group. Separate creator/uploader identity from ownership authority. Application/API behavior remains account-private in this task; no Library domain row, membership, sharing, or new user-facing product feature is created.

## Non-goals
- No Scholarly Record, Library creation/membership, ownership transfer UI, cross-account sharing, byte copy/delete, account deletion, or production migration.
- No polymorphic unchecked foreign key, sentinel/system account, contributor-owned substitute for Library ownership, or edit to migrations 001–008.
- No automatic merging/reparenting of existing resources.

## Acceptance Criteria
- A concrete ownership-domain table is the single foreign-key parent for domain-owned folders, files, and recycle provenance; account and later Library domains use the same authority substrate.
- Migration from every supported historical schema creates one account domain per account and preserves exact resource IDs, object keys, parent hierarchy, lifecycle/recycle state, revisions, Favorites, and timestamps with no byte operation.
- Existing account APIs remain behaviorally identical and server-derived. Clients cannot submit owner-domain, account, uploader, creator, or role authority.
- Disabled accounts retain their domain/data without gaining access; later Library-owned resources can remain valid when a contributor is disabled because ownership is distinct from uploader identity.
- Pending upload cancellation and active/deleted/purging/purged rows preserve their exact lifecycle semantics. FOLDER01 cycle and independently-recycled-descendant invariants remain enforced by domain-scoped constraints/triggers.
- Concurrency/CAS and repository transaction behavior remain intact; migration and repository failures roll back atomically.
- Migration 0/1/>1 historical upgrades, foreign-key/integrity checks, restart, backup/isolated restore, compiled acceptance, redeploy count zero, and exact before/after fixture identity pass.
- Frontend behavior and API DTOs do not expose internal domain IDs or acquire new Library concepts.
- Independent review focuses on migration loss, orphaned objects, composite-FK/trigger mistakes, authority regression, contributor/owner confusion, and hidden production assumptions.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- new ownership-domain ADR required by this task

## Relevant Modules / Files
- `database/migrations/`
- `backend/src/drive/`, `backend/src/favorites/`, `backend/src/maintenance/`
- `backend/src/persistence/contracts.ts`, `backend/src/persistence/sqlite/`
- `backend/src/platform/application.ts`
- all Drive/Favorites/recycle/migration/backup/compiled acceptance tests

## Current State
Blocked only by `RF-AUDIT01`. Current `folders.owner_id`, `files.owner_id`, and `recycle_groups.owner_id` are account foreign keys; this cannot safely represent a Library-owned resource independent of its uploader.

## Completed
- ADR-014 and PROJECT_SPEC distinguish resource ownership from uploader/contributor identity.
- RF-PLAN01 identified the account-only substrate as a prerequisite that must be migrated before Scholarly Record and Library work.

## Remaining
- write and accept the exact ownership-domain/migration ADR;
- implement deterministic schema/repository migration with no behavior change;
- verify every lifecycle/history/concurrency/backup path and exact data identity;
- independently review and checkpoint.

## Blockers
Any design that needs destructive production migration, changes object keys/bytes, uses a sentinel account, cannot preserve recycle/Favorite history, or silently grants Library/account access must stop for architecture/data-integrity review.

## Last Verification
2026-08-17 schema inspection: migration 001 makes folder/file owner an account FK and migration 006 makes recycle provenance account-scoped. There is no owner-domain parent or distinct uploader field.

## Next Action
After `RF-AUDIT01`, recover all account-keyed schema/triggers/repositories, write the ownership-domain ADR and deterministic migration fixtures, then implement the behavior-preserving substrate change.
