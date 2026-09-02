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
- [x] Production Batch Catalog V1 entry is exact, schema-free, health-verified, and rollback-safe.
- [x] The normal production Owner path creates an export request for the exact first-batch resource identities.
- [x] Local Compute creates `academiccloud-catalog-batch-001.zip` with exactly 82 valid resources; six proven corrupt sources remain separately unresolved for replacement.
- [x] ZIP identities, manifest digest, bounded evidence, JSON-only contents, and absence of private access material all pass.
- [x] No import, apply, rename, metadata mutation, object-key mutation, production job, or main-worker activation occurs.
- [x] Task stops after batch 001 and records the required external-results handoff.

## Relevant ADRs

- ADR-014, ADR-022, ADR-023, ADR-031, ADR-037, ADR-039.

## Relevant Modules / Files

- `backend/src/catalog-batch/`
- `compute/src/catalog-batch-export.ts`
- `compute-contracts/src/catalog-batch.ts`
- `frontend/src/batch-catalog.tsx`
- `scripts/full-library-batch-catalog-readonly.cjs`

## Current State

EXPORT PASS / WAITING EXTERNAL REVIEW. Exact pushed `171970b4be1782af1e6244a263559834a5cd7017` passed Compute 132/132 with two expected runtime skips, contracts 3/3, typecheck/build/diff gates, immutable release assembly, and complete verifier. The 74 prior V1 checkpoints were reused byte-for-byte; all four adaptive-OCR and all four range/fallback resources then passed, producing 82/82 valid checkpoints. The single D-drive package is 459,985 bytes with SHA-256 `cf39b61298ea2d8babdaf7110cb8da64fcda454c2fba0e38e18a45d83d2406fa`. Independent JSON/manifest/content-identity/privacy and Python ZIP CRC checks pass. The six corrupt-source IDs remain separately unresolved and absent. No source, metadata, filename, object key, schema, Core, or worker state changed; main Local Compute remains inactive/not-found.

## Completed

- Isolated V1 local Owner UI/export/import-preview acceptance passed without mutation.
- Read-only production inventory, SQLite integrity, and foreign-key checks passed.
- Exact first-batch selection policy is frozen at 88 opaque resource identities.
- Seventy-four checkpoint files remain byte-preserved; no successful resource was rerun.
- The 14-resource read-only diagnosis classified eight as product-fix possible and six as `SOURCE_REPLACEMENT_REQUIRED`.
- Targeted OCR/range/fallback regressions pass, including strict identity mismatch, corrupt-source, abort, cleanup, and unchanged one-GiB envelope gates.
- Exact immutable `171970b…` release assembly and full-file/shared-model verifier passed.
- Real retry recovered all eight valid resources: four range-primary adaptive OCR and four staged-file fallback, including the 922,469,003-byte source.
- Final 82-resource/84-entry JSON-only ZIP passed 82/82 identity, privacy, missing/duplicate, excluded-source, SHA-256, and CRC verification.

## Remaining

- Upload the verified 82-resource package for external bibliographic review.
- Wait for a separately supplied structured results document and explicit Owner authority before any import/apply operation.

## Blockers

The export has no blocker. Six source-corrupt PDFs remain outside this batch and require future source replacement; they are not processed/catalogued. Import/apply remains intentionally unauthorized pending external review and Owner confirmation.

## Last Verification

2026-09-02: exact pushed/release source `171970b…`; 74 reused + 8 recovered = 82 checkpoints; six source replacements excluded. Package 459,985 bytes / SHA-256 `cf39b612…406fa`; 82/82 identity; JSON-only/privacy/missing/duplicate/CRC checks pass; fallback temp directories 0; main worker inactive/not-found.

## Next Action

Upload `academiccloud-catalog-batch-001.zip` for external review, then stop until structured results and explicit import/apply approval are supplied.
