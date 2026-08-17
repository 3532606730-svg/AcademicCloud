# ADR-017 — Atomic Bounded Bulk Drive Operations

**Date:** 2026-08-17
**Status:** Accepted

## Context

AcademicCloud needs multi-select operations over the existing account-private Drive without weakening file revision CAS, FOLDER01 recycle provenance, ownership-domain authorization, Favorites privacy, or recoverable deletion. A batch API that commits earlier items and fails later ones would make the UI and durable state disagree and could strand only part of a selected folder/file set.

Bulk restore has one additional boundary: standalone file restore currently verifies the exact stored object metadata before restoring its database state. Object-provider reads cannot participate in a SQLite transaction, but no object-provider write is needed for restore.

## Decision

RF-BULK01 provides five bounded actions over existing folders/files:

| Action | Allowed input | Commit rule | External-byte behavior |
|---|---|---|---|
| Move | active files/folders plus one active destination or root | one all-or-nothing SQLite transaction | none |
| Recycle | active files/folders with disjoint selected roots | one all-or-nothing SQLite transaction; one existing-style recycle group per selected root | none |
| Restore | recoverable recycle roots only | all standalone file object checks finish first, then one all-or-nothing SQLite transaction | metadata/stat reads only; no copy/delete/write |
| Favorite add | active files/folders | one all-or-nothing SQLite transaction | none |
| Favorite remove | active files/folders | one all-or-nothing SQLite transaction | none |

There is no deliberately partial action in this checkpoint. A success response contains one deterministic success result per input item in input order. Any invalid, missing, foreign, duplicate, stale, conflicting, or otherwise rejected member returns one global error and commits zero batch mutations.

Every request contains 1–100 distinct resource IDs. The request body is bounded to 32 KiB. Duplicate IDs are rejected even if they claim different resource kinds. Move/recycle selections may not contain overlapping folder ancestors/descendants or a selected file already contained by a selected folder root. A destination may not be a selected folder or its descendant.

The browser receives an opaque `version` derived from the server's current mutable resource identity. It is a concurrency token, not an authority claim. The server re-reads every item through the account-scoped repository inside the write transaction and rejects a stale version before mutation. File repository writes retain their revision CAS; folder state is protected by the immediate SQLite transaction plus the opaque version precondition.

Exact replay semantics are conservative:

- Favorite add/remove remains idempotent because relation insertion/removal is idempotent and does not change the resource version.
- A current move to the already-selected destination is a successful no-op.
- Replaying a mutating recycle/restore/move request with an old version fails as a concurrent change and commits nothing; it never repeats or guesses a transition.

Current server-owned account scope remains the only authority input. The API does not accept account ID, ownership-domain ID, creator/uploader identity, role, Library membership, or visibility claims. Cross-account and missing IDs remain indistinguishable.

## Recycle and Restore Consequences

Bulk recycle reuses FOLDER01 semantics. Each selected folder root receives its own recycle group containing exactly its active subtree; independently pre-deleted descendants stay outside that group. Pending uploads anywhere in a selected active subtree reject the whole batch. Selecting overlapping roots is rejected rather than silently deduplicated.

Bulk restore accepts only recycle roots. Every selected root's original parent must already be active at transaction start; one selected restore may not make another otherwise-invalid selected root restorable. Folder groups restore only their exact members in parent-first order. Standalone file groups retain exact one-file provenance and storage-metadata verification. Any name conflict or provenance mismatch rolls the whole batch back.

Bulk permanent purge is not implemented. No bulk action invokes object deletion.

## UI Consequences

Selection is explicit through labeled checkboxes and is cleared on successful completion, navigation, view change, or refreshed data. It is retained after a failed atomic request so the user can understand and retry the same selection. Destructive recycle requires one confirmation naming the bounded selected count. Controls are disabled while the request is active and remain keyboard/touch accessible on desktop and mobile.

## Operational Consequences

No schema migration, package, worker, queue, resident service, or production configuration is added. The existing single-process SQLite `BEGIN IMMEDIATE` transaction remains the serialization boundary. Production deployment remains separately Owner-gated.

## Alternatives Rejected

- **Per-item partial commits:** creates ambiguous success and requires compensation/retry state.
- **Calling single-item APIs sequentially:** cannot roll back earlier items when a later item fails.
- **Bulk permanent delete:** crosses the irreversible object-provider boundary and is outside RF-BULK01.
- **Unbounded selection:** permits excessive tree walks, provider reads, and request memory.
- **Client-supplied account/domain scope:** violates server authority and ownership-domain isolation.
- **Durable idempotency table:** unnecessary for conservative versioned replay semantics in this bounded metadata workflow.
