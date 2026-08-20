# OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Task ID
OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Goal
Repair the production-proven `ali-oss` `ListParts` runtime-shape mismatch at the narrowest correct boundary so a successful provider response is not converted into `storage_unavailable`, while preserving all existing multipart, authorization, persistence, and production semantics.

## Scope
- Work only on `codex/storage-runtime-contract-repair-20260820` until verification is complete.
- Normalize only the production-observed `ListParts` top-level XML scalars `isTruncated` and `nextPartNumberMarker` before the native OSS client is exposed through `AliyunOssClientPort`.
- Preserve the existing OSS SDK instance and every non-`listParts` method unchanged.
- Leave multipart part-row validation in `AliyunOssStorageAdapter`; do not add a second part-metadata parser.
- Add deterministic regression coverage for `"false"` / `"0"`, truncated string markers, an omitted non-truncated marker, and malformed scalar rejection.
- Run repository-native focused/full tests, typechecks, and builds before any release decision.
- Keep Metadata Suggestion diagnosis separate unless a current post-billing browser failure is independently reproduced and proven.

## Non-goals
- No production deployment, service/Nginx restart, RAM/OSS mutation, credential change, migration, SQLite write, pending-upload mutation, manual multipart complete/abort, or metadata mutation.
- No RF-SEARCH01 modification or rebuild.
- No broad storage-adapter refactor.
- No upload part-size, retry-policy, CAS, object-key, authorization-scope, Library-authority, or product-UX changes.
- No speculative normalization of unrelated provider response fields.
- No Metadata Range patch without separate failure evidence.

## Acceptance Criteria
- The exact production-observed raw shape `{ isTruncated: "false", nextPartNumberMarker: "0" }` normalizes to canonical `false` / `0` before `AliyunOssStorageAdapter` sees it.
- A truncated string response normalizes to `true` plus a safe integer marker.
- A non-truncated response may omit `nextPartNumberMarker` and canonicalizes it to `0`; a truncated response without a marker fails closed.
- Malformed boolean/marker values and non-array `parts` fail closed rather than being guessed.
- Part rows still pass through the pre-existing adapter validation unchanged.
- `signatureUrlV4`, `head`, `get`, `delete`, multipart init/complete/abort, and browser custom-domain signing retain their previous implementation path.
- Focused storage tests, full backend/frontend tests, both typechecks, both production builds, and `git diff --check` pass before the task can be considered complete.
- No migration or production mutation occurs during source repair and verification.

## Relevant ADRs
- ADR-023 — durable decision reconciliation and local/remote synchronization.
- ADR-029 — provider-backed multipart transfer and browser-native Range resume.

## Relevant Modules / Files
- `backend/src/storage/aliyun/client.ts`
- `backend/src/storage/aliyun/aliyun-oss-adapter.ts` (validation boundary; no planned source change)
- `backend/test/storage/aliyun-client-normalization.test.ts`
- `backend/test/storage/aliyun-oss-adapter.test.ts`
- `tasks/doing/OPS-STORAGE-INCIDENT01.md`

## Current State
ACTIVE on isolated branch `codex/storage-runtime-contract-repair-20260820`, based exactly on authoritative branch commit `281263be7f6248a4d18e099b59cf49028ec277ca`. Production remains declared release `604cb8daf310696353e99c30ce7a924dc71ef9d2`, schema v21/history 001–021, and has not been touched by this repair.

The provider permission repair is already complete: raw production `ListParts` now returns HTTP 200. The remaining proven application defect is that the exact runtime supplies `isTruncated` and `nextPartNumberMarker` as strings while the current port assumes boolean/numeric values. The old adapter therefore treats `"false"` as truthy and later rejects `"0"` as an invalid integer marker.

## Completed
- Created isolated repair branch from the exact authoritative branch head.
- Implemented a narrow native-client `listParts` wrapper in `backend/src/storage/aliyun/client.ts`; every other SDK method remains on the original client instance and unchanged.
- Added bounded scalar normalization for boolean/string boolean and safe integer/digit-string markers.
- Kept multipart part-row validation exclusively in the existing `AliyunOssStorageAdapter`.
- Added focused regression tests in `backend/test/storage/aliyun-client-normalization.test.ts` for the exact production-observed shape and fail-closed cases.
- Isolated strict TypeScript compile of the changed client boundary with local stubs: PASS.
- Isolated runtime smoke with a fake SDK returning `{ isTruncated: "false", nextPartNumberMarker: "0" }`: PASS.
- Current narrowed implementation checkpoint: `94429d6`; current focused-test checkpoint: `5466a2a`.

## Remaining
- Run repository-native focused storage tests.
- Run full repository tests, both typechecks, both production builds, and `git diff --check`.
- Perform a read-only diff review against `codex/project-memory-reconcile-20260817`.
- Reconcile task/status/board only after verification establishes the branch as a valid repair candidate.
- Decide separately whether an artifact build is warranted; deployment is not authorized by this task.

## Blockers
The current environment can read/write GitHub but cannot clone the repository from GitHub or dispatch the repository workflow, so repository-native CI has not yet run on this branch. This is a verification blocker, not a reason to weaken the gate.

## Last Verification
- Base commit: `281263be7f6248a4d18e099b59cf49028ec277ca`.
- Production touched: false.
- Schema/migrations changed: false.
- Search candidate changed/rebuilt: false.
- Local stub strict compile: PASS.
- Local fake-SDK runtime normalization smoke: PASS.
- Repository-native tests/typecheck/build: PENDING.

## Next Action
Run the repository's native verification on exact branch `codex/storage-runtime-contract-repair-20260820`. If and only if all required gates pass, review the final diff and prepare a separate Owner-gated release decision. Do not deploy or mutate production as part of this source-repair step.
