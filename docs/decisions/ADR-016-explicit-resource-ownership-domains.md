# ADR-016 — Explicit Resource Ownership Domains

**Date:** 2026-08-17
**Status:** Accepted

## Context

The existing Drive schema uses an account ID as the owner foreign key for every folder, file, and recycle group. That is sufficient while all resources are private to one account, but it cannot represent a future Library-owned resource independently of the account that created a folder, uploaded a file, or initiated a recycle operation. Using a contributor account as a stand-in would make resource validity depend on contributor lifecycle and would blur ownership authority with provenance.

RF-OWNERSHIP01 must replace that substrate without changing current account-private behavior, resource identity, object keys, lifecycle state, Favorites, recycle provenance, or any API DTO. It must not create a Library, membership model, sharing behavior, ownership transfer, or storage-provider byte operation.

## Decision

AcademicCloud uses `ownership_domains` as the single concrete foreign-key parent for domain-owned resources.

- A domain has a stable internal ID and exactly one kind: `account` or `library`.
- An account domain has exactly one account relation. Migration 010 creates one deterministic `account:<account-id>` domain for every existing account, and an account-insert trigger creates the matching domain atomically for every later account.
- The `library` kind is a reserved authority shape only. RF-OWNERSHIP01 creates no Library domain row, Library table, membership, permission, API, or UI concept.
- `folders.owner_domain_id`, `files.owner_domain_id`, and `recycle_groups.owner_domain_id` all reference the same concrete parent. There is no polymorphic `owner_type + owner_id` foreign key and no sentinel account.
- Creator/uploader/initiator provenance is separate: folders retain `created_by_account_id`, files retain `uploaded_by_account_id`, and recycle groups retain `created_by_account_id`. These account references do not confer ownership or access.
- Domain identity, resource domain assignment, and creator/uploader attribution are immutable in this checkpoint. Ownership transfer is a separate future design.

The current repository adapter remains an account-private façade. Its public repository inputs are account IDs derived from the authenticated server session; SQL resolves the matching account domain internally. The browser cannot submit or receive domain IDs, account ownership, creator/uploader identity, or role claims. A missing or foreign account-domain mapping produces no resource match.

Favorites remain private per-account overlay relations. Migration 010 preserves them byte-for-byte while the resource tables are rebuilt; it does not reinterpret Favorites as ownership or as Library state.

## Migration and Integrity

Migration 010 is append-only and runs in one immediate SQLite transaction.

1. Create and populate account ownership domains.
2. Copy Favorite relations into strict temporary preservation tables and remove their cascading foreign keys from the rebuild path.
3. rename the old file, folder, and recycle tables; create the domain-owned replacements; copy every column while adding the deterministic domain and provenance columns.
4. Drop only the transaction-local legacy tables, recreate all unique/index/trigger constraints with domain scope, and restore Favorites.
5. Commit only after foreign keys, uniqueness, lifecycle shapes, hierarchy, recycle provenance, and all migration SQL succeed.

The migration does not read, copy, rename, delete, or validate object-storage bytes. File IDs, object keys, folder hierarchy, lifecycle state, revision, every timestamp, recycle group identity/count, and Favorite timestamps are copied exactly. A failure rolls back the schema and version record atomically.

Folder parent and file-folder constraints include `owner_domain_id`. Recycle membership also uses composite `(recycle_group_id, owner_domain_id)` foreign keys and domain-scoped guards. The cycle trigger walks only within the same domain. This preserves independently recycled descendant behavior and prevents cross-domain hierarchy/provenance links even under direct database writes.

## Authorization Consequences

- Current account-private API authorization and non-disclosure remain unchanged.
- Disabling an account revokes access through the existing authentication boundary but does not remove its domain or resources.
- A future Library resource may reference a contributor/uploader account for provenance while its ownership and validity remain attached to the Library domain. Disabling that contributor therefore does not transfer, orphan, or delete the resource.
- Future Library membership/permissions must resolve effective authority to a domain server-side. This ADR does not define those permissions.

## Operational Consequences

The change adds tables/columns/indexes/triggers only inside the existing SQLite process. It adds no package, resident service, object-storage operation, production migration, or memory-sensitive runtime. Existing FULL synchronous durability, WAL behavior, transaction/CAS rules, backup, restore, and compiled migration gates remain required.

Production migration and deployment remain Owner-gated. Rollback before a production rollout is code rollback against an untouched production database. After any separately approved production migration, rollback requires restore from a verified pre-migration backup or forward repair; old binaries must not open a schema whose migration 010 has been recorded.

## Alternatives Rejected

- **Polymorphic `owner_type + owner_id`:** SQLite cannot enforce one foreign key across account and Library parents; unchecked ownership is unacceptable.
- **Nullable `account_owner_id | library_owner_id` on every resource:** duplicates authority logic throughout the schema and invites invalid mixed/empty shapes.
- **Contributor account as Library owner:** couples shared resource validity to contributor lifecycle and misstates authority.
- **Sentinel/system account:** creates hidden product authority and obscures provenance.
- **Keep account ownership until Library implementation:** would force later foundational table rebuilds after Scholarly Record and lineage data depend on the wrong parent.
