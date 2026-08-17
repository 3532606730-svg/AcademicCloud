# RF-DOMAIN01 — Scholarly Resource and Artifact Identity Foundation

## Task ID
RF-DOMAIN01 — Scholarly Resource and Artifact Identity Foundation

## Goal
Establish Scholarly Record as a logical academic resource distinct from stored file bytes, with stable Resource/Artifact/Artifact-Version identity and a future-safe explicit ownership-domain contract.

## Scope
Introduce additive persistence/domain/repository/service/API foundations for ownership-domain-owned private Scholarly Records and explicit attachment of existing accessible stored files as Artifacts/Versions. Preserve current file IDs/object keys/lifecycle as the Physical Artifact source of truth; do not silently reinterpret or backfill any legacy file. Use these identity semantics: Record ID is the stable logical Resource ID; Artifact ID is a stable record-contained artifact identity; Artifact Version ID is a stable version identity with exactly one stored-file representation, and a stored file may represent at most one Artifact Version. Attachment/detachment changes a retained relationship state rather than deleting/reminting identity; reattachment to the same Record restores the same IDs, while reassignment to another Record is a conflict until a later explicit workflow exists. Provide the smallest usable UI/API for creating/viewing a private record and attaching/detaching an authorized active file. Add only new migration(s) after the then-current head.

## Non-goals
- No canonical material-specific metadata, provenance, duplicate detection, reading overlay, intake workflow, Library, annotations, OCR, or byte mutation.
- No shared-folder shortcut, implicit backfill guess, cross-account attachment, or polymorphic client authority.
- No production migration/deployment or historical migration edit.

## Acceptance Criteria
- Scholarly Record, Physical Artifact, and Artifact Version are explicit separate identities; attaching/detaching never copies, overwrites, purges, or changes an object's storage key.
- Existing files remain valid ordinary Drive resources when unattached. Any deterministic migration/backfill state is non-destructive, reversible at the metadata transaction boundary, and does not fabricate scholarly facts.
- No automatic legacy backfill occurs. Pending-upload, deleted, purging, and purged files cannot be newly attached. Cancelling a pending upload remains unchanged.
- Recycling an attached active file may make its retained Artifact Version unavailable without deleting scholarly identity; restore returns availability. Permanent purge is blocked while the relationship is attached. After an explicit detach, purge may proceed while the tombstoned identity/lineage remains and cannot falsely imply available bytes.
- Attach→detach→reattach to the same Record preserves Record/Artifact/Version IDs; the same stored file cannot alias multiple Artifact Versions or Records, and concurrent attempts have one deterministic winner.
- The server derives the account ownership domain. Client-supplied owner/domain/account/role is rejected; same-ID/inaccessible-ID responses do not leak cross-account existence.
- Ownership uses the `RF-OWNERSHIP01` domain substrate. This task exposes only account-private records, grants Owner no implicit access to another account's records/overlays, and ensures a later Library-approved artifact lifecycle is owned by the Library domain rather than contributor-account authority.
- Create/attach/detach operations are transactional, idempotent or conflict-explicit, unique against duplicate attachments, and safe under concurrent file lifecycle/record updates.
- APIs are bounded and strict; UI supports Owner and Member, responsive/mobile behavior, empty/error/conflict states, and does not conflate Folder with Record.
- Migration is append-only; migration 0/1/>1 upgrade, restart persistence, backup/isolated restore, compiled acceptance, and redeploy count zero pass.
- Independent review focuses on ownership spoofing, legacy-data safety, identity collision, double attachment, lifecycle races, future Library extensibility, and object-byte mutation.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- `docs/decisions/ADR-018-scholarly-resource-artifact-version-identity.md`

## Relevant Modules / Files
- `database/migrations/`
- new `backend/src/research/` domain/repository/service/HTTP modules
- `backend/src/drive/`, `backend/src/persistence/contracts.ts`, `backend/src/persistence/sqlite/`
- `backend/src/platform/application.ts`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- migration, API, frontend, backup/restore, compiled acceptance tests

## Current State
Complete in repository development after the independently green RF-BULK01 checkpoint `fc30aed2eeb4536ec3747869bb5b99b22fbf94e8`. Migration 011, ADR-018, the private Record/Artifact/Version vertical slice, lifecycle/purge guards, bounded API/UI, and compiled restart/backup/restore evidence are independently green. Production remains unchanged on schema v4.

## Completed
- ADR-014 defines Physical Artifact versus Scholarly Record and future Collaborative Overlay boundaries.
- RF-PLAN01 made this the identity prerequisite for metadata, provenance, overlays, intake, annotations, Library, and derived contracts.
- Added append-only migration 011 with zero legacy backfill; explicit ownership-domain-owned Record, Artifact, and Version identities; immutable Record containment and stored-file identity; globally unique file representation; same-domain active-file guards; retained identity rows; and attached-purge prevention.
- Added ADR-018 and the account-private repository/service/HTTP slice. Attach/detach is one immediate SQLite transaction, same-Record reattach preserves every ID, cross-Record reuse conflicts, and no storage adapter is called.
- Added strict `1..100` keyset pagination with lightweight Record summaries and separately bounded Artifact detail. Mutation bodies/query strings reject authority injection, and foreign/missing IDs/cursors do not disclose cross-account existence.
- Integrated attached-file recycle/restore availability and a service/transaction/trigger permanent-purge boundary. Explicit detach permits the existing purge path while Record/Artifact/Version/file metadata remains a tombstone.
- Added responsive Owner/Member UI with empty/loading/error/conflict states, stable focus/inert behavior, current-folder attachment, detach/reattach, and paginated loading without treating Folder as Record.
- Extended migration/startup/backup/recovery and compiled acceptance to schema head 011. The compiled production runtime proves create→attach→detach→reattach stable IDs, restart persistence, verified backup/isolated restore, available stored-file identity, and zero redeploy migrations without provider network access.
- Independent read-only Reviewer final verdict PASS with no blocker, medium, or required nit after repairing stored-file nullability, unbounded reads, compiled identity coverage, authority query injection, and a stale pagination-selection race.

## Remaining
None. The remaining Pre-OCR queue is deliberately parked Ready; RF-META01 was not started.

## Blockers
None for repository closure. External independent predeployment review is now the active Owner gate; no production target, migration, or rollout is authorized.

## Last Verification
2026-08-17 final Writer verification: backend `227/227` PASS; frontend `154/154` PASS; workspace typecheck PASS; production build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with `firstMigrationCount: 11`, `scholarlyDetachReattachStable: true`, exact identity survival across restart and restored backup, and `redeployMigrationCount: 0`; dependency and production-only audits reported 0 vulnerabilities; `git diff --check` PASS. Independent read-only Reviewer final verdict PASS with no blocker/medium finding. No production or object-provider action occurred.

## Next Action
Stop feature development at the external independent predeployment review gate. Preserve RF-META01 and every later Pre-OCR card in Ready/backlog. The eventual production target may be this RF-DOMAIN01 checkpoint or an earlier exact green checkpoint; repository HEAD is not automatically production HEAD. Wait for Owner direction.
