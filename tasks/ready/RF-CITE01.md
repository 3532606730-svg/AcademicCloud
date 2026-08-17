# RF-CITE01 — Citation Workspace and Page Evidence

## Task ID
RF-CITE01 — Citation Workspace and Page Evidence

## Goal
Add a private Citation Workspace with stable page-level Evidence references grounded in accessible Scholarly Records and Artifact Versions.

## Scope
Implement per-account citation entries referencing canonical Record metadata and optional stable Page anchors, with bounded locator/quote/transcription-as-user-note fields, citation style/input metadata, revision, and timestamps. Provide strict APIs and responsive workspace UI. Citation data is private overlay state; canonical metadata remains referenced rather than silently copied as authority. Add append-only migration(s).

## Non-goals
- No automatic citation extraction, OCR, shared bibliography, external citation network/API, full CSL engine dependency unless separately justified, or Owner visibility into another account's citations.

## Acceptance Criteria
- Citation/evidence identity is private per account and references accessible Record/Artifact-Version/Page IDs; inaccessible and nonexistent sources are non-disclosing.
- User-entered quote/transcription is clearly personal evidence text, not OCR/canonical source content, and is bounded/safe-rendered/excluded from audit/logs.
- Source metadata changes retain stable citation source identity and expose deterministic stale/snapshot semantics without silently rewriting user work.
- Client account/owner/creator/authority fields are rejected.
- Mutations use revision/CAS and transaction rollback; concurrent edits/relinks/deletes are deterministic and cannot orphan evidence silently.
- UI covers create/edit/source navigation/unavailable source, mobile/keyboard accessibility, and no localStorage/URL leakage of private content.
- Migration, restart, backup/restore, compiled acceptance, and independent privacy/referential-integrity review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-META01` and `RF-ANNOTATE01` contracts

## Relevant Modules / Files
- `database/migrations/`
- citation/evidence repository/service/HTTP modules
- metadata/page/annotation modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- citation/privacy/migration/compiled acceptance tests

## Current State
Blocked on `RF-ANNOTATE01` and `RF-META01`. No citation/evidence model exists.

## Completed
- Approved Citation Workspace and stable page Evidence boundary are recorded.
- RF-PLAN01 keeps citations in Personal Research Overlay.

## Remaining
- define citation/source snapshot and stale behavior;
- implement persistence/API/UI;
- verify privacy, referential integrity, concurrency, recovery, and accessibility;
- independently review and checkpoint.

## Blockers
External services/dependencies with cost, automatic extraction/OCR, collaborative citation sharing, or destructive source relinking requires a new decision.

## Last Verification
2026-08-17 baseline has canonical metadata only as a planned predecessor and no citation workspace.

## Next Action
After `RF-ANNOTATE01`, define source snapshot/stale semantics and implement the private citation vertical slice.
