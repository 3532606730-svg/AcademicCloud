# RF-ANNOTATE01 — Sidecar Annotations and Stable Page Anchors

## Task ID
RF-ANNOTATE01 — Sidecar Annotations and Stable Page Anchors

## Goal
Add private sidecar annotations, highlights, and page notes without rewriting original artifacts, anchored to stable Page identity under an Artifact Version.

## Scope
Define stable Page identity as `(artifactVersionId, one-based ordinal)` with an opaque Page ID, created/validated without OCR. Page count may be unknown; anchors must represent that uncertainty and never fabricate extracted content. Add per-account annotations with bounded plain-text note, optional normalized page geometry/text-selection descriptor that contains no extracted corpus, revision, and timestamps. Implement additive persistence, strict API, Preview integration, responsive UI, and tests.

## Non-goals
- No PDF rewriting, OCR/text extraction, collaborative annotations, image processing, full document text storage, freehand binary layer, or Owner access to another account's annotations.

## Acceptance Criteria
- `(artifactVersionId, one-based ordinal)` is the immutable unique natural key for one stable opaque Page ID. Materialization is deterministic or idempotent get-or-create; concurrent attempts yield one identity. Existing `RF-OVERLAY01` progress resolves to that ID without rewriting or losing its version/ordinal history.
- Page identity is reused by reading progress, citations, evidence, and derived contracts. Unknown page count remains explicit; invalid/zero/negative/unbounded ordinals fail.
- Original object bytes/checksum remain unchanged across every annotation operation.
- Annotation content is Personal Research Overlay data; same shared resource can have mutually invisible annotations. Owner has no product/API bypass.
- Client owner/account/creator/privacy/artifact authority is rejected; inaccessible and nonexistent anchors are non-disclosing.
- Create/update/delete use revision/CAS and transactions with deterministic replay/conflict/rollback semantics.
- Notes/descriptors are bounded, safe-rendered, excluded from audit/logs, and cannot inject HTML/script or reference another version.
- Preview/UI supports keyboard/touch/mobile, unavailable/recycled artifact state, and failure recovery without local persistence leaks.
- Migration, restart, backup/restore, compiled acceptance, source-hash proof, and independent privacy/anchor/concurrency review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- Preview decisions plus `RF-DOMAIN01`, `RF-LINEAGE01`, `RF-OVERLAY01`

## Relevant Modules / Files
- `database/migrations/`
- new page/annotation domain/repository/service/HTTP modules
- Drive Preview and scholarly identity modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- anchor/privacy/source-integrity/compiled acceptance tests

## Current State
Blocked on `RF-LINEAGE01` and `RF-OVERLAY01`, sequenced after Intake. Preview exists, but no stable Page or annotation model exists.

## Completed
- ADR-014 requires sidecar/private annotations and original preservation.
- RF-PLAN01 assigns stable Page identity primarily to this card.

## Remaining
- define Page/anchor descriptor limits and uncertainty semantics;
- implement persistence/API/Preview UI;
- prove original hash unchanged, privacy, concurrency, and recovery;
- independently review and checkpoint.

## Blockers
Rewriting originals, OCR/extracted content, collaborative sharing, or a page model that cannot remain stable across restart/restore requires Owner/architecture review.

## Last Verification
2026-08-17 baseline Preview is file-based and has no Page identity or annotation persistence.

## Next Action
After `RF-INTAKE01`, implement stable pre-OCR Page anchors and private sidecar annotation behavior with source-hash tests first.
