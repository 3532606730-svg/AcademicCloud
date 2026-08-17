# RF-OVERLAY01 — Private Reading State and Recent

## Task ID
RF-OVERLAY01 — Private Reading State and Recent

## Goal
Create the first Personal Research Overlay slice: private reading state/progress/flags, Recent, and acquisition-research notes per account.

## Scope
Add per-account overlay rows for `unread | queued | reading | finished`, optional Artifact-Version plus positive page ordinal progress, `last_opened_at`, Important, To Cite, bounded private acquisition/research note, and bounded Recent ordering. Integrate persistence/service/API and responsive UI. Page ordinal is pre-OCR and version-scoped; `RF-ANNOTATE01` later provides stable Page identities without rewriting this history. Add append-only migration(s).

## Non-goals
- No Personal Tags, Collections, Saved Views, annotations, citations, sharing, canonical provenance, search-history persistence, analytics, or admin research dashboard.
- No Owner/Admin override to read another account's overlay.

## Acceptance Criteria
- Overlay identity is `(account, resource)` and is private even when the underlying resource is later shared. Owner and infrastructure roles have no product/API bypass.
- Reading state/progress/flags/note/Recent are server-scoped to the authenticated account; owner/account/privacy fields are not accepted from clients.
- Explicit resource open updates Recent/progress with bounded deterministic order; administrative audit/logs do not record page, progress, note, or private access history.
- Page ordinals are positive and tied to an accessible Artifact Version; unknown page count remains explicit and does not fabricate pages. `(artifactVersionId, ordinal)` is the immutable natural Page key that `RF-ANNOTATE01` must map to one stable opaque Page ID, so existing progress resolves without rewrite or history loss.
- Updates use revision/CAS or one transaction; concurrent opens/edits have deterministic last-write/conflict semantics and cannot revive deleted overlay state.
- Cross-account/inaccessible and nonexistent resources are non-disclosing. Disabled account/session behavior remains enforced.
- UI supports Owner/Member identically for their own data, responsive/mobile accessibility, empty/error/conflict states, and memory-safe note handling.
- Migration, restart, backup/restore, compiled acceptance, and independent privacy/concurrency review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-DOMAIN01` identity and `RF-PROV01` provenance decisions

## Relevant Modules / Files
- `database/migrations/`
- new personal-overlay domain/repository/service/HTTP modules
- scholarly resource modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- overlay/privacy/migration/backup/compiled acceptance tests

## Current State
Blocked on `RF-PROV01` and queue order through `RF-STATS01`. No Personal Research Overlay persistence exists.

## Completed
- ADR-014 classifies every field in this card as private per-account research state.
- Recent and the private acquisition note are assigned exactly once here.

## Remaining
- define bounded overlay/recent update semantics;
- implement persistence/API/UI;
- prove cross-account and Owner non-access, concurrency, recovery, and no audit leakage;
- independently review and checkpoint.

## Blockers
Any Owner research-activity view, collaborative sharing, behavioral analytics, or production data migration requires explicit Owner authorization and a new privacy decision.

## Last Verification
2026-08-17 baseline has per-account Favorites but no reading/progress/recent/note model; current audit planning explicitly excludes these fields.

## Next Action
After `RF-STATS01`, implement the private overlay vertical slice with non-disclosure and no-surveillance tests first.
