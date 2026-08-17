# RF-EVIDENCE01 — Evidence Bundles and Research Questions

## Task ID
RF-EVIDENCE01 — Evidence Bundles and Research Questions

## Goal
Let each account organize citations/page evidence into private Evidence Bundles and Research Questions with explicit typed links and no byte duplication.

## Scope
Add per-account Research Questions, Evidence Bundles, and typed question↔bundle↔citation/resource links with bounded plain-text labels/notes, deterministic order, revision, and timestamps. References point to existing identities and never duplicate object bytes. Implement additive persistence, strict API, responsive UI, and tests.

## Non-goals
- No collaborative sharing, project-management system, knowledge graph/RDF, AI answer generation, OCR, automatic inference, or Owner research dashboard.

## Acceptance Criteria
- All content and links are Personal Research Overlay data; Owner has no implicit read authority and shared resources do not share bundles/questions.
- Links require effective source access at creation/read time and never reveal inaccessible/nonexistent targets.
- Client account/owner/creator/privacy/authority fields are rejected; labels/notes are bounded and safe-rendered, not audited/logged.
- Mutations are transactional with revision/CAS, deterministic order, idempotent relation creation, rollback on partial failure, and explicit behavior when a source becomes unavailable.
- Deleting a bundle/question is recoverable or confirmably metadata-only and never deletes citations, resources, artifacts, or bytes.
- UI supports composition/navigation, unavailable references, keyboard/touch/mobile, and interruption/conflict recovery.
- Migration, restart, backup/restore, compiled acceptance, and independent privacy/referential-integrity review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-CITE01` identity/privacy contract

## Relevant Modules / Files
- `database/migrations/`
- evidence/question repositories/services/HTTP
- citation/resource modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- relationship/privacy/migration/compiled acceptance tests

## Current State
Blocked on `RF-CITE01`. No Evidence Bundle or Research Question model exists.

## Completed
- ADR-014 assigns bundles/questions and relationships to the private overlay.
- RF-PLAN01 makes this the sole primary grouping/question workstream.

## Remaining
- define relation/deletion/unavailable-source semantics;
- implement persistence/API/UI;
- verify privacy, concurrency, rollback, recovery, and accessibility;
- independently review and checkpoint.

## Blockers
Collaborative sharing, AI inference/answers, object duplication/deletion, or graph-platform expansion requires separate Owner approval.

## Last Verification
2026-08-17 baseline has no evidence/question persistence; stable citation/source identities are predecessor work.

## Next Action
After `RF-CITE01`, implement private bundles/questions with typed-link and no-byte-mutation tests.
