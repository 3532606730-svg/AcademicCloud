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
Complete; independently reviewed and green. Migration 010 replaces account foreign keys on folders, files, and recycle groups with one concrete ownership-domain parent while the account-private application façade remains behaviorally unchanged.

## Completed
- ADR-014 and PROJECT_SPEC distinguish resource ownership from uploader/contributor identity.
- RF-PLAN01 identified the account-only substrate as a prerequisite that must be migrated before Scholarly Record and Library work.
- recovered the clean `87aef22` RF-AUDIT01 durable checkpoint and activated this card.
- Added ADR-016 with one `account | library` ownership-domain authority parent, deterministic account-domain creation, server-only account-domain resolution, immutable creator/uploader provenance, and explicit production rollback consequences.
- Added append-only migration 010 with exact account-domain backfill, atomic recycle/folder/file table rebuilds, transaction-local Favorite preservation, domain-scoped composite foreign keys, cycle/recycle guards, and no object-provider operation.
- Migrated folder creator, file uploader, and recycle initiator identity separately from ownership authority; disabled contributor state does not invalidate a differently owned resource.
- Kept all current Drive/Favorites repository and HTTP behavior account-private; client authority fields are rejected and internal domain/provenance fields remain absent from DTOs.
- Added deterministic 0/1/>1-account, mixed lifecycle, exact identity, rollback, cross-domain, disabled-contributor, HTTP non-exposure, backup/restore, restart, and compiled acceptance evidence.
- Received independent read-only adversarial Reviewer PASS with no blocker or medium-severity finding.

## Remaining
None.

## Blockers
None. Production migration/deployment remains separately Owner-gated.

## Last Verification
2026-08-17 final Writer verification: backend `201/201` PASS; frontend `142/142` PASS; workspace typecheck and production build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with `firstMigrationCount: 10`, health/readiness, restart/session/password behavior, maintenance dry-run, verified backup receipt, operations and isolated restore drills, restored state, and `redeployMigrationCount: 0`; full and production dependency audits report 0 vulnerabilities; `git diff --check` PASS; package/lockfile delta none. Focused migration fixtures cover 0/1/>1 accounts, exact mixed-lifecycle identity, Favorites, foreign-key/integrity checks, and atomic rollback. Independent read-only Reviewer PASS with no blocker or medium finding.

## Next Action
Create the RF-OWNERSHIP01 Git checkpoint, push it through the established SSH origin, then recover `tasks/ready/RF-BULK01.md` as the next authorized Epic.
