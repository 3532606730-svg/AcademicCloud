# OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Task ID
OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Goal
Repair the production-proven `ali-oss` `ListParts` runtime-shape mismatch at the narrowest correct boundary so a successful provider response is not converted into `storage_unavailable`, while preserving existing multipart, authorization, persistence, and production semantics.

## Scope
- Work on isolated branch `codex/storage-runtime-contract-repair-20260820` from authoritative base `281263be7f6248a4d18e099b59cf49028ec277ca`.
- Normalize only the exact `ali-oss@6.23.0` `ListParts` representation before it reaches the canonical `AliyunOssClientPort`: XML scalar booleans/integers remain strings and a single `<Part>` is a singleton object rather than an array.
- Canonicalize the single/multi Part container plus `PartNumber`, `Size`, `isTruncated`, and `nextPartNumberMarker`; preserve `ETag` and `LastModified` without inventing provider facts.
- Preserve the existing SDK instance and all non-`listParts` SDK method paths unchanged.
- Keep range/count/order/part-number bounds, duplicate detection, and marker-progression validation in `AliyunOssStorageAdapter`.
- Cover the real installed `ali-oss` method with deterministic no-network tests rather than relying only on a fake client.

## Non-goals
- No production deployment, service/Nginx restart, RAM/OSS policy mutation, credential change, migration, SQLite write, pending-upload mutation, manual multipart complete/abort, or metadata mutation.
- No RF-SEARCH01 modification or rebuild; its frozen artifact was used read-only only to inspect the exact packaged dependency behavior.
- No broad storage-adapter refactor, transfer-policy change, authorization change, or product-UX change.
- No normalization of unrelated OSS API responses.
- No Metadata Range/OCR/parser patch without a separate current reproduced failure boundary.

## Acceptance Criteria
- Real `ali-oss@6.23.0` single-Part and multi-Part runtime shapes canonicalize before the storage adapter sees them.
- String boolean/integer fields normalize only from bounded accepted representations; malformed values fail closed.
- A non-truncated response may omit `nextPartNumberMarker` and canonicalizes it to `0`; a truncated response without a marker fails closed.
- Existing adapter validation continues to enforce multipart semantic bounds and duplicate/marker rules.
- `signatureUrlV4`, `head`, `get`, `delete`, multipart init/complete/abort, and browser custom-domain signing remain on their existing SDK implementation paths.
- Focused real-SDK storage regression tests pass.
- Full backend/frontend tests, both typechecks, both production builds, and `git diff --check` pass on the exact verified repair source.
- No migration or production mutation occurs during source repair and verification.

## Relevant ADRs
- ADR-023 — durable decision reconciliation and local/remote synchronization.
- ADR-029 — provider-backed multipart transfer and browser-native Range resume.

## Relevant Modules / Files
- `backend/src/storage/aliyun/client.ts`
- `backend/src/storage/aliyun/aliyun-oss-adapter.ts` (existing canonical semantic-validation boundary; unchanged)
- `backend/test/storage/aliyun-client-normalization.test.ts`
- `backend/test/storage/aliyun-oss-adapter.test.ts`
- `tasks/doing/OPS-STORAGE-INCIDENT01.md`

## Current State
SOURCE REPAIR VERIFIED — production release decision pending Owner gate.

Exact repository-native verification ran on repair source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` through isolated GitHub Actions run `32365460608` / job `96413882821`. The temporary draft PR used only to trigger the isolated workflow was closed unmerged after success. Production remains release `604cb8daf310696353e99c30ce7a924dc71ef9d2`, schema v21/history 001–021, and was not contacted or changed by this source repair.

The provider-side permission gate is already green: raw production `ListParts` returns HTTP 200 after the exact least-privilege RAM v2 repair. The remaining upload failure was reproduced against the exact packaged `ali-oss@6.23.0`: one Part produced a singleton object and string scalar fields, causing the old adapter path to fail with `.map is not a function`; an empty non-truncated response with string paging fields caused the old path to reject the marker. The repaired client boundary converts only that real SDK representation into the already-declared canonical port representation.

Metadata Suggestion remains separate. Existing incident evidence ties recorded suggestion failures to the overdue-payment `UserDisableError` window at `HeadObject`; no suggestion implementation change has been made.

## Completed
- Created isolated repair branch from exact authoritative base `281263be7f6248a4d18e099b59cf49028ec277ca`.
- Inspected the exact packaged `ali-oss@6.23.0` from the frozen independently verified RF-SEARCH01 artifact without modifying that candidate.
- Proved the real `ListParts` runtime representation: singleton object for one Part; string `PartNumber`, `Size`, `isTruncated`, and marker fields.
- Reproduced the pre-fix failures against that exact dependency without network I/O.
- Implemented a narrow native-client `listParts` wrapper; all other SDK method paths remain unchanged.
- Kept the normalization helper internal to the Aliyun client module and retained semantic validation in `AliyunOssStorageAdapter`.
- Added real-SDK no-network regression tests for single-Part, multi-Part/truncated, omitted non-truncated marker, and malformed values.
- Isolated exact-dependency runtime smoke and compiled-adapter integration smoke: PASS.
- Repository-native focused Aliyun storage regressions: 20/20 PASS.
- Full backend suite: 376 PASS, 0 FAIL, 1 expected skip (release-local Tesseract E2E not configured in this source-verification job), 377 total.
- Full frontend suite: 241/241 PASS across 11 files.
- Root Tesseract runtime verifier test: 1/1 PASS.
- Backend and frontend typechecks: PASS.
- Backend and frontend production builds: PASS.
- `git diff --check` against exact authoritative base: PASS.
- Clean dependency install reported 0 vulnerabilities in 306 audited packages.
- Final read-only scope review: only Aliyun client normalization, its regression test, and incident/current-state documentation are changed; no migration, adapter business semantics, Search implementation, production config, or production state changed.

## Remaining
- Build an immutable production artifact from the verified repair source only if separately authorized as the next release-preparation gate.
- If that artifact and independent verification pass, stop again for explicit Owner production-deployment authorization.
- After any authorized deployment, run real-browser Continue upload first, then a disposable Abandon upload, then Metadata Suggestion; close `OPS-STORAGE-INCIDENT01` only if the relevant journeys pass or any remaining failure is independently proven and repaired.
- Reconcile the repair back into the authoritative working branch only through the approved release/reconciliation workflow; do not merge to `main` as part of this incident repair.

## Blockers
No source-code verification blocker remains. Production deployment is intentionally blocked on a separate Owner gate.

## Last Verification
```text
VERIFIED_SOURCE=8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
BASE=281263be7f6248a4d18e099b59cf49028ec277ca
CI_RUN=32365460608
CI_JOB=96413882821
FOCUSED_STORAGE=20/20 PASS
BACKEND=376 PASS / 0 FAIL / 1 EXPECTED SKIP (377 total)
FRONTEND=241/241 PASS
TESSERACT_RUNTIME_TEST=1/1 PASS
TYPECHECK=PASS
BUILD=PASS
GIT_DIFF_CHECK=PASS
PRODUCTION_TOUCHED=false
SCHEMA_CHANGED=false
MIGRATIONS_RUN=false
RAM_CHANGED_IN_APP_REPAIR=false
RF_SEARCH01_CHANGED=false
TEMP_CI_PR=4 CLOSED_UNMERGED
```

## Next Action
STOP FOR OWNER RELEASE-PREPARATION GATE. The safe next step is to build and independently verify an immutable Linux x64 / Node 24 production artifact from the verified repair source. Artifact construction itself must not contact or mutate production. Deployment remains a separate explicit gate after artifact verification.