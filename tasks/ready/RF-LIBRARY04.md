# RF-LIBRARY04 — Shared Provenance Confidence and Version Grouping

## Task ID
RF-LIBRARY04 — Shared Provenance Confidence and Version Grouping

## Goal
Add reviewed Library provenance/source-confidence decisions and leak-safe duplicate/version grouping over Library-authorized artifacts.

## Scope
Extend Collaborative Overlay with bounded source-confidence states/notes, reviewer identity/time, and explicit Library grouping that reuses `RF-PROV01` fingerprints and `RF-LINEAGE01` relations. Groups reference stable Records/Artifacts/Versions and do not merge/delete identities or bytes. Implement additive persistence, strict API/UI, audit events, and tests.

## Non-goals
- No automatic deduplication, physical merge/delete, cross-Library/global fingerprint browsing, Personal Overlay notes, AI confidence, external catalog lookup, or OCR.

## Acceptance Criteria
- Confidence and grouping are Library-governed collaborative facts, not copied personal notes or claims that original provenance is certain.
- Duplicate discovery reuses the single authority-scoped service. No match and only-inaccessible match remain indistinguishable across account/Library boundaries.
- Grouping never aliases/deletes Record/Artifact/Version IDs, rewrites originals, or changes object keys; relation direction/provenance remains explicit.
- Server derives Library/actor/reviewer/authority/time; client role/confidence authority and inaccessible IDs are rejected non-disclosingly.
- Review/group mutations are revision/CAS and transaction-safe; concurrent group/ungroup/confidence/membership changes have deterministic winner/rollback behavior.
- Required governance decisions emit content-bounded audit events without source URLs, filenames, private notes, or fingerprints that enable cross-domain inference.
- UI/API tests cover roles/nonmember/disabled accounts, privacy, duplicate leakage, cycle/group ambiguity, mobile/accessibility, migration, backup/restore, compiled acceptance.
- Independent review focuses on existence leaks, false authority/confidence, identity collapse, destructive deduplication, race corruption, and private-data bleed.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-PROV01`, `RF-LINEAGE01`, `RF-LIBRARY01`–`03`

## Relevant Modules / Files
- `database/migrations/`
- Library catalog/provenance/duplicate/lineage/audit modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- grouping/privacy/concurrency/migration/compiled acceptance tests

## Current State
Blocked on `RF-LIBRARY03`, `RF-PROV01`, and `RF-LINEAGE01`. No collaborative provenance confidence/grouping exists.

## Completed
- RF-PLAN01 split this risk from the catalog/tag task.
- Accessible-scope duplicate and stable lineage contracts are explicit predecessors.

## Remaining
- define confidence/group invariants and permissions;
- implement persistence/API/UI using shared duplicate/lineage services;
- verify privacy, identity preservation, concurrency, audit, recovery;
- independently review and checkpoint.

## Blockers
Automatic/destructive deduplication, global fingerprint disclosure, external AI/catalog service, or private-note promotion requires Owner escalation.

## Last Verification
2026-08-17 planning verification: all source-confidence/grouping behavior is future to prerequisite Library/provenance tasks.

## Next Action
After `RF-LIBRARY03`, implement bounded collaborative confidence/grouping with leak and no-byte-mutation tests first.
