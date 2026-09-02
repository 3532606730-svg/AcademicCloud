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
- [ ] Local Compute creates `academiccloud-catalog-batch-001.zip` with exactly 82 valid resources; six proven corrupt sources remain separately unresolved for replacement.
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

ACTIVE. Exact pushed export baseline `d7ce125b70003dc8531ca59084244288aec495b3` produced and preserved 74 valid V1 evidence checkpoints from the frozen 88-resource selection. Read-only diagnosis of the remaining 14 proved six source PDFs truncated/malformed and requiring later source replacement; the Owner excluded only those six from this external-review batch without marking them processed. Four valid PDFs exceed the fixed 1.5x OCR viewport guards, and four valid PDFs expose a custom PDF.js range-transport settlement boundary while the same pinned PDF.js parses an identity-matched local file quickly. The generic bounded fixes now use adaptive OCR scale without increasing any guard, propagate/settle range aborts, and permit an exceptional streamed temporary-file fallback only after range timeout plus exact content checksum and PDF header/trailer validation. Compute 132/132 with two expected runtime skips, contracts 3/3, Compute/contracts typecheck, build, and diff checks are green before immutable release assembly.

## Completed

- Isolated V1 local Owner UI/export/import-preview acceptance passed without mutation.
- Read-only production inventory, SQLite integrity, and foreign-key checks passed.
- Exact first-batch selection policy is frozen at 88 opaque resource identities.
- Seventy-four checkpoint files remain byte-preserved; no successful resource was rerun.
- The 14-resource read-only diagnosis classified eight as product-fix possible and six as `SOURCE_REPLACEMENT_REQUIRED`.
- Targeted OCR/range/fallback regressions pass, including strict identity mismatch, corrupt-source, abort, cleanup, and unchanged one-GiB envelope gates.

## Remaining

- Commit/push and assemble the exact schema-free Compute exporter release.
- Retry only the eight product-fix resources and add a checkpoint only after normal V1 evidence succeeds.
- If and only if all eight pass, assemble and verify one exact 82-resource batch ZIP; keep the six corrupt IDs outside the ZIP and separately unresolved.
- Stop before import, preview apply, rename, or metadata mutation.

## Blockers

None currently. Any of the eight remaining valid resources failing the corrected pipeline blocks ZIP assembly; no partial ZIP is authorized. Any failure of exact release verification, source identity, evidence bounds, privacy checks, or temporary-file cleanup is fail-closed.

## Last Verification

2026-09-02: exact baseline `d7ce125…`; 74 preserved V1 checkpoints; 14/14 read-only diagnostics complete; six source-corrupt and eight product-fix possible. Compute 132/132 plus two expected skips, contracts 3/3, both typechecks, Compute build, and `git diff --check` pass.

## Next Action

Checkpoint/push the two bounded generic exporter fixes, assemble and verify the exact immutable Compute release, then retry only the eight product-fix resources. Assemble `academiccloud-catalog-batch-001.zip` only after all eight join the 74 preserved checkpoints.
