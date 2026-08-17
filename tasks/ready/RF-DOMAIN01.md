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
- a new ADR is required if implementation chooses a durable ownership-domain schema not already resolved by ADR-014.

## Relevant Modules / Files
- `database/migrations/`
- new `backend/src/research/` domain/repository/service/HTTP modules
- `backend/src/drive/`, `backend/src/persistence/contracts.ts`, `backend/src/persistence/sqlite/`
- `backend/src/platform/application.ts`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- migration, API, frontend, backup/restore, compiled acceptance tests

## Current State
Blocked by `RF-OWNERSHIP01` and queue order through `RF-BULK01`. The repository has stored files/folders but no Scholarly Record, retained record-artifact/version link, or scholarly identity.

## Completed
- ADR-014 defines Physical Artifact versus Scholarly Record and future Collaborative Overlay boundaries.
- RF-PLAN01 made this the identity prerequisite for metadata, provenance, overlays, intake, annotations, Library, and derived contracts.

## Remaining
- resolve and record the exact future-safe ownership/identity schema;
- implement additive persistence and minimal vertical UI/API;
- verify legacy, concurrency, backup/restore, privacy, and artifact invariants;
- independently review and checkpoint.

## Blockers
Any design that grants Owner implicit private-record access, treats a folder as Library/Collection, rewrites existing object identity, or requires destructive production migration must stop for architecture/Owner review.

## Last Verification
2026-08-17 architecture recovery confirmed `StoredFile` is account-owned physical metadata and schema 008 has no scholarly-resource tables or generalized ownership domain.

## Next Action
Start after `RF-BULK01`; inspect the new ownership-domain and current Drive lifecycle contracts, record any remaining identity decision in an ADR, then implement the smallest private record/artifact identity slice.
