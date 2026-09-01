# ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG

## Task ID

`ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG`

## Goal

Process every remaining eligible production Library PDF through ADR-039 bounded evidence export and external bibliographic review, without automatically importing, renaming, or mutating any resource.

## Scope

- Reconcile the live production Library inventory read-only.
- Exclude deleted resources, unsupported file types, unstable identities, and resources already applied or currently AI-succeeded/reviewable under the established semantic-isolation contract.
- Use batches of at most 100 resources.
- Produce and verify JSON-only bounded evidence ZIPs through Batch Catalog Roundtrip V1.
- Stop after each exported batch until an external structured results document is supplied.

## Non-goals

- No automatic result import or apply.
- No production filename, canonical metadata, object key, source byte, or authority mutation.
- No main Local Compute worker activation, AI reasoning-model work, schema migration, backup generation, or external paid service.
- No whole-document OCR, page images, or unrestricted text export.

## Acceptance Criteria

- [x] Owner separately authorizes production export-only use after the isolated real-PDF roundtrip passed.
- [x] Live read-only inventory reports exact total, processed, eligible, excluded, batch-size, and batch-count values.
- [ ] Production Batch Catalog V1 entry is exact, schema-free, health-verified, and rollback-safe.
- [ ] The normal production Owner path creates an export request for the exact first-batch resource identities.
- [ ] Local Compute creates `academiccloud-catalog-batch-001.zip` with at most 100 resources.
- [ ] ZIP identities, manifest digest, bounded evidence, JSON-only contents, and absence of private access material all pass.
- [ ] No import, apply, rename, metadata mutation, object-key mutation, production job, or main-worker activation occurs.
- [ ] Task stops after batch 001 and records the required external-results handoff.

## Relevant ADRs

- ADR-014, ADR-022, ADR-023, ADR-031, ADR-037, ADR-039.

## Relevant Modules / Files

- `backend/src/catalog-batch/`
- `compute/src/catalog-batch-export.ts`
- `compute-contracts/src/catalog-batch.ts`
- `frontend/src/batch-catalog.tsx`
- `scripts/full-library-batch-catalog-readonly.cjs`

## Current State

ACTIVE. Live production remains exact `3a23a7b5679bf64d01332fc761bae0dcf1a1d572`, schema/history 34/001–034, and healthy. The isolated V1 feature checkpoint is exact `31a136619d4c74be92c3350414e632a63b6e4540`; the first local real-PDF roundtrip passed. Production read-only inventory on 2026-09-01 reports 105 total attached Library resources: 103 active and 2 deleted; active types are 94 PDF, 7 DOCX, and 2 DOC. Six PDFs are already applied or current AI-succeeded/reviewable; 88 stable PDFs remain eligible, so batch 001 contains 88 resources and is the only estimated batch.

## Completed

- Isolated V1 local Owner UI/export/import-preview acceptance passed without mutation.
- Read-only production inventory, SQLite integrity, and foreign-key checks passed.
- Exact first-batch selection policy is frozen at 88 opaque resource identities.

## Remaining

- Publish this authorization/inventory checkpoint.
- Assemble and verify the exact schema-free production Core/frontend release.
- Create the private production export request through the normal Owner path.
- Export and verify batch 001, then stop.

## Blockers

None currently. Any failure of exact release verification, production health, source identity, evidence bounds, or privacy checks is fail-closed.

## Last Verification

2026-09-01: production exact release `3a23a7b…`; migrations 001–034; inventory 105 total / 6 processed / 88 eligible; database integrity `ok`; foreign-key violations 0. Feature worktree and remote exact `31a1366…` before this reconciliation.

## Next Action

Checkpoint and push the export-only authorization and inventory tool, then perform the schema-free exact V1 production release and create `academiccloud-catalog-batch-001.zip` without importing or applying results.
