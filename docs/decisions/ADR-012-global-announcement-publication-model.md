# ADR-012 — Global Announcement Publication Model

**Date:** 2026-08-17
**Status:** Accepted

## Context

AcademicCloud needs a small Owner-governed homepage announcement surface after the Accounts I authorization foundation. The feature must remain global without weakening private-drive ownership, must not add a notification subsystem or worker, and must prevent stored content or links from becoming an executable-content channel.

Publication and expiry also need one authoritative interpretation. Relying on browser clocks, cleanup jobs, or hard-coded frontend content would produce inconsistent results and unnecessary resident infrastructure.

## Decision

### 1. Announcements reuse Owner authority without adding a role

Accounts continue to have exactly `owner | member`. Only a currently active Owner may create, edit, publish, unpublish, or list all announcement records. Every currently active authenticated account may read the same effective global set.

Announcement authority is additive only. It does not grant the Owner access to a Member's private drive and does not change any file, folder, Favorite, upload, recycle, Preview, or Download ownership rule.

### 2. Publication state and time are server-authoritative

Migration 008 stores announcement content, severity, nullable HTTPS link, publication state, effective timestamps, immutable creator attribution, and server timestamps in SQLite.

An announcement is effective exactly when:

- `is_active = true`;
- `published_at` is non-null and less than or equal to the server's current time; and
- `expires_at` is null or strictly greater than the server's current time.

Publication includes the exact boundary; expiry excludes the exact boundary. No cleanup job is needed for display correctness. Effective results are ordered by `published_at DESC`, then `created_at DESC`, then opaque identifier ascending, so equal-time reads remain deterministic.

Create and edit inputs cannot supply identifiers, creator identity, role, publication state, or authoritative timestamps. Publish and unpublish are explicit idempotent actions. Editing content does not silently publish it, and repeated publication-state actions do not rewrite content.

### 3. Content is plain text and links are HTTPS-only

Titles and bodies are stored and returned as bounded plain text. The frontend renders them through normal React text nodes and never through HTML injection APIs.

An optional link must be an absolute normalized `https:` URL with a hostname and without embedded username or password. The browser opens it with `noopener noreferrer`. HTTP, `javascript:`, `data:`, credential-bearing, malformed, control-character, and oversized links are rejected before persistence. Database checks provide a second lower-level HTTPS/control-character boundary.

### 4. The feature stays inside the existing process

Announcements use the existing Fastify process, persistence transaction boundary, SQLite backup/restore path, authentication guard, exact-origin policy, React application, and responsive shell. There is no mail/push delivery, read receipt, acknowledgement, per-user dismissal, polling worker, queue, new resident service, attachment, or OSS object.

### 5. Owner deletion is explicit, immediate, and audited

L2-ADMINPOLISH01 permits a currently active Owner to delete an announcement after a target-identifying confirmation. Deletion removes the announcement from both effective reads and the Owner administration list; there is no announcement archive or tombstone state. The database deletion and immutable `announcements.delete` governance event commit in the same transaction, so audit failure rolls the deletion back. Members cannot call the deletion route.

This bounded deletion applies only to announcement content. Invitation records and their creator/consumer relationships remain durable and have no deletion API.

## Consequences

- Global announcement reads are intentionally identical for Owner and Member accounts while drive data remains account-scoped.
- Naturally expired records may remain stored for Owner administration; display correctness does not depend on deletion.
- An Owner may explicitly delete an announcement, but expiry never deletes one automatically.
- Re-publishing an inactive record establishes a new server publication time. Repeating publish while already active or unpublish while already inactive is idempotent.
- Links are deliberately narrower than arbitrary web URLs. Supporting another scheme or rich content requires a new security review.
- Schema 008 must be migrated through the existing backup, explicit migration, startup fail-closed, and rollback gates before any future deployment.

## Revisit Criteria

Revisit this decision if:

- a third global administration role is approved;
- announcements gain rich text, attachments, delivery channels, acknowledgements, or per-user state;
- scheduled future publication becomes an Owner input rather than an internal time-boundary invariant;
- global content moves to a separate service or database;
- link schemes beyond HTTPS are required.
