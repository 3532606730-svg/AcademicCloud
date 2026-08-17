# RF-LINEAGE01 — Artifact Relationships and Derived Lineage

## Task ID
RF-LINEAGE01 — Artifact Relationships and Derived Lineage

## Goal
Represent edition, scan, translation, transcription, and derived-artifact relationships explicitly while preserving original evidence and stable identity.

## Scope
Add a typed relationship model over Scholarly Records, Artifacts, and Artifact Versions. Distinguish directed lineage relations from bounded symmetric scholarly relations; enforce allowed endpoint types, uniqueness, provenance, and cycle rules for directed derivation. Provide server-authorized API/UI and tests. Add only append-only migration(s).

## Non-goals
- No OCR/transcription/translation execution, byte generation/copy, mature research graph, automatic relation inference, Library grouping, or destructive replacement of originals.
- No Personal Overlay relationship or external graph database.

## Acceptance Criteria
- Original and derived identities remain distinct; creating a relation never rewrites, deletes, supersedes, or hides original bytes.
- Directed derivation is acyclic and records source/target/type/server time; symmetric relation types are normalized so replay/order cannot create duplicates.
- Only resources in the requester's effective domain are linkable/viewable; inaccessible endpoint and nonexistent endpoint responses are non-disclosing.
- Client owner/domain/creator/provenance authority is rejected; later tasks consume the same relation service.
- Create/remove operations are transactionally idempotent or conflict-explicit and safe under concurrent inverse/cycle attempts.
- UI renders relation direction/type/accessibility without unsafe content and remains responsive/mobile.
- Migration, historical upgrade, restart, backup/restore, compiled acceptance, and adversarial authorization/concurrency tests pass.
- Independent review focuses on cycle bypass, identity aliasing, original loss, cross-domain graph leaks, race duplicates, and accidental execution scope.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-DOMAIN01` and `RF-PROV01` decision records

## Relevant Modules / Files
- `database/migrations/`
- research domain/repository/service/HTTP modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- relation/migration/backup/compiled acceptance tests

## Current State
Blocked on `RF-PROV01`. Stable Resource/Artifact/Version identities are planned earlier; no relationship graph exists.

## Completed
- Approved relation categories and original-preservation invariant are recorded.
- RF-PLAN01 separated relationship/lineage risk from provenance and duplicate lookup.

## Remaining
- define relation taxonomy, endpoints, cycle and uniqueness rules;
- implement additive persistence/API/UI;
- verify privacy, concurrency, restart, and recovery;
- independently review and checkpoint.

## Blockers
Any engine that generates derived content, automatic destructive supersession, external graph service, or relation semantics that cannot preserve source evidence requires Owner review.

## Last Verification
2026-08-17 planning verification: current schema has no scholarly relation/lineage tables; this card depends on identity and provenance checkpoints.

## Next Action
After `RF-PROV01`, publish the exact typed relation/cycle matrix, implement the bounded graph, and verify originals remain unchanged.
