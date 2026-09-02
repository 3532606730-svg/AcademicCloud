# ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP

## Task ID

`ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP`

## Goal

Make the reviewed 82-resource Batch Catalog V1 result safe to preview by excluding exact internal fixtures, filtering checksum-invalid ISBNs, and applying the Owner translator-based translated-edition filename rule; then reclaim only explicit reproducible D-drive temporary artifacts without touching protected data.

## Scope

- Preserve the original ZIP and reviewed result file byte-for-byte.
- Add source-identity-bound fixture exclusion to export, preview, and apply gates.
- Filter invalid ISBN-10/13 values with a visible preview warning while retaining other supported bibliography.
- Project supported translated CJK editions as `《书名》（译者译，年份）.pdf`.
- Produce a separately named corrected result and mutation-free production preview.
- Inventory D: and delete only explicit, inactive, reproducible, non-unique temporary artifacts.
- Run applicable Backend, Frontend, Compute, contract, typecheck, build, and diff checks; checkpoint and push normally.

## Non-goals

- No real catalog apply, metadata/resource rename, source/object mutation, schema change, database backup, LLM inference, or main Local Compute activation.
- No filename-substring authority for fixture exclusion.
- No deletion of PDFs, repositories/worktrees, databases/backups, VHDX/rescue data, models, credentials/config, evidence checkpoints, or uncertain Owner files.

## Acceptance Criteria

- [ ] Original ZIP/result hashes remain unchanged and corrected output retains all 82 exact resource/source identities and manifest identity.
- [ ] Three current E2E fixture identities are excluded and cannot apply; similarly named user content remains eligible.
- [ ] Invalid ISBN checksums are removed with a warning; valid ISBN-10/13 and non-ISBN identifiers survive.
- [ ] `《蒙古与教廷》（冯承钧译，1994）.pdf` is the previewed translated-work filename and ambiguous/missing translator responsibility does not rename.
- [ ] Corrected result and production preview remain mutation-free with exact AUTO/REVIEW/UNKNOWN counts recorded.
- [ ] D: before/after free space, safe candidates, explicit deletions, protected bytes, and Owner-decision candidates are recorded.
- [ ] Requested applicable tests/typechecks/build/diff pass; scoped commit is pushed and local/remote HEAD match.

## Relevant ADRs

- ADR-014, ADR-022, ADR-023, ADR-031, ADR-037, ADR-039.

## Relevant Modules / Files

- `backend/src/catalog-batch/`
- `backend/test/catalog-batch/`
- `frontend/src/batch-catalog.tsx`
- `frontend/src/api.ts`
- `frontend/src/i18n.ts`
- `tasks/doing/ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP.md`

## Current State

Implementation and bounded cleanup inventory are in progress on isolated branch `feature/batch-catalog-roundtrip-v1`, starting from exact pushed source `e372f3e1f425aa46ebc4b7a064e9be1af7a0e05e`. No production or protected data has changed.

D_DRIVE_CLEANUP=DEFERRED
WSL_CLEANUP=DEFERRED
REAL_CATALOG_APPLY_NOT_AUTHORIZED=true

## Completed

- Original result and ZIP hashes captured.
- Exact current batch facts recovered: 82 results; three E2E fixture identities; one invalid ISBN; seven translated-edition candidates.
- Initial implementation and focused regressions pass after correcting test-only setup defects.
- Separately named corrected document generated with 37 AUTO, 41 REVIEW, and 4 UNKNOWN.
- D: read-only major-consumer inventory and AcademicCloud staging breakdown completed.

## Remaining

- Complete full verification and diff review.
- Build/checkpoint/push exact release and run mutation-free production preview.
- Execute only the approved explicit safe cleanup set and reconcile final space evidence.
- Update durable state and close with Owner review as the next step.

## Blockers

None currently.

## Last Verification

Focused Backend catalog/ISBN/filename/fixture tests 397/397 and Frontend batch-catalog tests 2/2 pass; Backend and Frontend typecheck pass.

## Next Action

Run full requested verification, then checkpoint before any schema-free production preview deployment or D-drive deletion.
