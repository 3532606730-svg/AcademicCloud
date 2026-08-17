# ADR-018 — Scholarly Resource, Artifact, and Version Identity

**Date:** 2026-08-17
**Status:** Accepted

## Context

AcademicCloud's Drive file is authoritative physical metadata for one stored byte representation. A scholarly object must remain a stable logical identity even when a file is recycled, restored, detached from a record, or permanently purged after an explicit detach. Treating the file ID as the Scholarly Record would prevent one record from holding several artifacts or versions and would silently reinterpret every legacy file as a scholarly claim.

RF-DOMAIN01 must add the smallest account-private identity slice on the concrete ownership-domain substrate from ADR-016. It must not backfill legacy files, add canonical metadata/provenance, create a Library, mutate object bytes, or grant the global Owner role access to another account's records.

## Decision

AcademicCloud stores three explicit identities:

1. `scholarly_records.id` is the stable logical Scholarly Resource ID.
2. `scholarly_artifacts.id` is a stable artifact identity contained by exactly one Record.
3. `scholarly_artifact_versions.id` is a stable version identity with exactly one retained stored-file representation.

Every identity is owned by one concrete `ownership_domains` row. RF-DOMAIN01 exposes only account-domain rows resolved from the authenticated account. `created_by_account_id` records Record provenance but does not grant ownership or access. Artifact membership in its Record and every Record/Artifact/Version ownership domain are immutable. No identity row has a delete API, and database triggers prevent accidental deletion.

The Record's bounded `label` is only the minimum private display handle required to create and select a Record. It is not a canonical title, material template, authority record, provenance statement, or shared catalog field; those remain later tasks.

## Attachment and Identity Retention

An Artifact has an explicit `attached | detached` relationship state. Attaching an active same-domain file for the first time creates one Artifact and one Artifact Version in the same immediate SQLite transaction. The stored-file relation is unique across all Artifact Versions, so the same physical file cannot alias several Records or Versions.

Detach changes only the Artifact relationship state. It does not delete the Artifact, Version, file metadata, or object bytes. Reattaching the same still-active file to the same Record changes the retained Artifact back to `attached` and preserves all three IDs. Trying to attach that file to another Record is an explicit conflict; reassignment requires a later separately designed workflow.

Attach and detach are idempotent for the already-requested state. The service re-reads the Record, Artifact, Version, and file inside one `BEGIN IMMEDIATE` transaction. A competing attachment therefore has one winner, and uniqueness/compare-state guards prevent partial or duplicate identity creation.

## File Lifecycle Consequences

Only an `active` file can be newly attached or reattached. Pending-upload, deleted, purging, purged, missing, and foreign files are rejected without distinguishing inaccessible from nonexistent identity.

Recycling an attached file does not delete or detach scholarly identity. The Version remains linked to the retained file metadata and reports `unavailable`; restoring the file makes it `available` again. This follows the existing Drive recycle provenance and performs no object write.

Permanent purge is blocked while the Artifact is `attached`. The service checks inside the purge transaction, and migration 011 adds a database trigger as defense in depth. After explicit detach, the existing purge workflow may remove bytes and mark the file metadata `purged`; the Version remains as a tombstoned scholarly identity and reports no available bytes. The file ID, Artifact ID, Version ID, and Record containment remain durable evidence.

## Migration and Authorization

Migration 011 is append-only and creates only empty identity tables, indexes, foreign keys, and guards. It performs no legacy-file backfill and does not read or modify provider bytes. Existing file IDs, object keys, lifecycle state, hierarchy, Favorites, and recycle groups remain unchanged.

HTTP routes are under `/api/research/records`. Create, attach, and detach accept only bounded labels or opaque resource IDs. They reject client-supplied account ID, domain ID, creator ID, role, Library authority, visibility, and other additional properties. Response DTOs omit owner/domain/creator fields, object keys, storage-provider details, and lifecycle revisions.

Record lists and per-Record Artifact details are separate keyset-paginated reads with a default page of 25 and a hard maximum of 100. Record list pages return lightweight summaries plus a server-computed Artifact count; Artifact/Version/file detail is loaded only for the selected Record. Cursors are resolved inside the authenticated account and Record boundary, so inaccessible and missing cursors remain indistinguishable. Mutation routes reject all query parameters, and detach rejects every request body.

The current API joins only account domains. A future Library task may create Library-owned Records and Artifacts through a separately authorized domain-aware service; it must not reuse contributor-account authority or expose Personal Research Overlay state.

## Operational and Rollback Consequences

The change uses the existing SQLite process and adds no package, worker, resident service, storage write, production action, or paid service. Existing FULL synchronous durability, WAL, backup, isolated restore, compiled acceptance, and migration fail-closed startup remain required.

Compiled acceptance creates one disposable active-file metadata fixture only inside its task-owned temporary SQLite database, then exercises create, attach, detach, same-Record reattach, restart, backup, and isolated restore through the compiled production HTTP runtime. It never contacts the configured storage provider.

Production migration/deployment remains Owner-gated. Before any production rollout, rollback is code rollback against an untouched production database. After a separately approved migration 011 rollout, old binaries must not open the newer schema; rollback requires a verified pre-migration backup or forward repair.

## Alternatives Rejected

- **Use file ID as Record ID:** conflates logical scholarship with one byte representation and prevents several artifacts/versions.
- **Automatically backfill every legacy file:** fabricates scholarly meaning and violates migration safety.
- **Delete Artifact/Version rows on detach:** destroys stable identity and cannot support safe reattachment or tombstones.
- **Allow file reassignment between Records:** creates ambiguous scholarly identity and requires an explicit future workflow.
- **Copy or rename object bytes during attachment:** unnecessary; attachment is a metadata relation.
- **Client-supplied ownership/domain:** violates server authority and cross-account non-disclosure.
