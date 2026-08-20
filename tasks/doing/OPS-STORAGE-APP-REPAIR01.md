# OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Task ID
OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Goal
Repair the production-proven `ali-oss` `ListParts` runtime-shape mismatch at the narrowest correct boundary so a successful provider response is not converted into `storage_unavailable`, while preserving all existing multipart, authorization, persistence, and production semantics.

## Scope
- Work only on `codex/storage-runtime-contract-repair-20260820` until verification is complete.
- Normalize only the exact `ali-oss@6.23.0` `ListParts` response shape before the native OSS client is exposed through `AliyunOssClientPort`: XML boolean/integer scalars remain strings, and a single `<Part>` is returned as one object rather than an array.
- Canonicalize `isTruncated`, `nextPartNumberMarker`, each part's `PartNumber`/`Size`, and the single-Part container; preserve `ETag`/`LastModified` content without inventing provider facts.
- Preserve the existing OSS SDK instance and every non-`listParts` method unchanged.
- Keep range/count/order/part-number bounds and duplicate validation in `AliyunOssStorageAdapter`; the client boundary only converts the provider's runtime representation into the already-declared canonical port representation.
- Add deterministic regression coverage for single-Part and multi-Part raw SDK shapes, `"false"` / `"0"`, truncated string markers, an omitted non-truncated marker, and malformed value rejection.
- Exercise the real installed `ali-oss` `listParts` method without network I/O so the regression test verifies that the wrapper is actually attached at the SDK boundary.
- Run repository-native focused/full tests, typechecks, and builds before any release decision.
- Keep Metadata Suggestion diagnosis separate unless a current post-billing browser failure is independently reproduced and proven.

## Non-goals
- No production deployment, service/Nginx restart, RAM/OSS mutation, credential change, migration, SQLite write, pending-upload mutation, manual multipart complete/abort, or metadata mutation.
- No RF-SEARCH01 modification or rebuild; its verified artifact is used read-only only to inspect the exact packaged dependency behavior.
- No broad storage-adapter refactor.
- No upload part-size, retry-policy, CAS, object-key, authorization-scope, Library-authority, or product-UX changes.
- No normalization of unrelated OSS API responses.
- No Metadata Range/OCR/parser patch without separate current failure evidence.

## Acceptance Criteria
- Exact `ali-oss@6.23.0` single-Part shape (`parts` object, string `PartNumber`/`Size`, string `isTruncated`/marker) canonicalizes to an array with numeric part fields plus boolean/numeric paging fields before `AliyunOssStorageAdapter` sees it.
- Multi-Part arrays with string numeric fields canonicalize without changing order or `ETag`/`LastModified` values.
- A truncated response canonicalizes to `true` plus a safe integer marker.
- A non-truncated response may omit `nextPartNumberMarker` and canonicalizes it to `0`; a truncated response without a marker fails closed.
- Malformed boolean/marker/part-number/part-size values and invalid part containers fail closed rather than being guessed.
- Existing adapter validation still enforces part-number/size bounds, duplicate detection, requested page bounds, and next-marker progression.
- `signatureUrlV4`, `head`, `get`, `delete`, multipart init/complete/abort, and browser custom-domain signing retain their previous implementation path on the original SDK instance.
- The real installed `ali-oss` `listParts` method can be driven with a deterministic no-network response and returns the canonical port shape through the wrapper.
- Focused storage tests, full backend/frontend tests, both typechecks, both production builds, and `git diff --check` pass before the task can be considered complete.
- No migration or production mutation occurs during source repair and verification.

## Relevant ADRs
- ADR-023 — durable decision reconciliation and local/remote synchronization.
- ADR-029 — provider-backed multipart transfer and browser-native Range resume.

## Relevant Modules / Files
- `backend/src/storage/aliyun/client.ts`
- `backend/src/storage/aliyun/aliyun-oss-adapter.ts` (canonical validation boundary; no planned source change)
- `backend/test/storage/aliyun-client-normalization.test.ts`
- `backend/test/storage/aliyun-oss-adapter.test.ts`
- `tasks/doing/OPS-STORAGE-INCIDENT01.md`

## Current State
ACTIVE on isolated branch `codex/storage-runtime-contract-repair-20260820`, based exactly on authoritative branch commit `281263be7f6248a4d18e099b59cf49028ec277ca`. Production remains declared release `604cb8daf310696353e99c30ce7a924dc71ef9d2`, schema v21/history 001–021, and has not been touched by this repair.

The provider permission repair is already complete: raw production `ListParts` now returns HTTP 200. Initial runtime evidence proved string `isTruncated`/marker fields. A read-only inspection of the already-verified frozen RF-SEARCH01 artifact then established the complete packaged `ali-oss@6.23.0` behavior: `listParts` forwards XML scalar values directly; the XML parser uses non-array singletons; therefore a single `Part` is an object and `PartNumber`/`Size` are strings as well. This changed the repair from two-field normalization to normalization of the complete proven `ListParts` representation only; no other OSS API entered scope.

The old production adapter path was reproduced locally against the exact packaged SDK without network I/O: a one-part response fails with `TypeError: (result.parts ?? []).map is not a function`, while an empty non-truncated response with string marker fields fails with `OSS returned an invalid multipart part marker`. The new normalization path makes both canonical before the existing adapter validation.

Metadata Suggestion remains separate. Incident evidence ties the recorded suggestion failures to the overdue-payment disabled window at `HeadObject` and shows zero suggestion-generation failures after 13:00, so no suggestion implementation change is justified without a new current reproduction.

## Completed
- Created isolated repair branch from the exact authoritative branch head.
- Inspected the exact packaged `ali-oss@6.23.0` from the frozen, independently verified RF-SEARCH01 artifact without modifying that candidate.
- Proved from exact dependency source/runtime that `listParts` returns string paging fields, string `PartNumber`/`Size`, and an object rather than an array for one `<Part>`.
- Reproduced the pre-fix adapter failures against the exact packaged SDK without network I/O.
- Implemented a native-client `listParts` wrapper in `backend/src/storage/aliyun/client.ts`; every other SDK method remains on the original client instance and unchanged.
- Kept the normalization helper internal to the Aliyun client module so the repair does not create a new public module API.
- Added bounded normalization for the exact provider representation: singleton/array part container, integer string fields, boolean string field, and safe marker handling.
- Kept canonical range/count/order/duplicate validation in the existing `AliyunOssStorageAdapter`.
- Added focused regression tests in `backend/test/storage/aliyun-client-normalization.test.ts`; all cases drive the real installed `ali-oss` `listParts` method through `createAliyunOssClient` with deterministic no-network responses.
- Strict TypeScript compile of the changed boundary with local stubs: PASS.
- Exact-dependency no-network runtime smoke: PASS for single-Part and multi-Part XML shapes plus malformed-value fail-closed matrix.
- Existing compiled `AliyunOssStorageAdapter` + exact `ali-oss@6.23.0` + new normalization logic: PASS for both single-Part non-truncated and multi-Part truncated results.
- Current implementation checkpoint: `cc1bb44`; current focused-test checkpoint: `367332d`.

## Remaining
- Run repository-native focused storage tests on the exact branch.
- Run full repository tests, both typechecks, both production builds, and `git diff --check`.
- Perform a read-only final diff review against `codex/project-memory-reconcile-20260817`.
- Reconcile final task/status evidence only after repository-native verification establishes the branch as a valid repair candidate.
- Decide separately whether an immutable production artifact should be built; deployment remains a separate Owner gate.

## Blockers
The current environment can read/write GitHub and inspect the already-built artifact, but it cannot clone the repository from GitHub or dispatch the repository workflow. Repository-native CI therefore has not yet run on this branch. This is a verification blocker, not a reason to weaken the gate or deploy from partial evidence.

## Last Verification
- Base commit: `281263be7f6248a4d18e099b59cf49028ec277ca`.
- Exact dependency: packaged `ali-oss@6.23.0` from the frozen verified RF-SEARCH01 artifact.
- Exact-dependency raw ListParts shape: PROVEN (singleton object + string boolean/integer fields).
- Exact pre-fix failure reproduction: PASS (one-part `.map` TypeError; empty non-truncated invalid marker).
- Local strict TypeScript check of changed boundary: PASS.
- Exact ali-oss single-Part wrapper smoke: PASS.
- Exact ali-oss multi-Part wrapper smoke: PASS.
- Exact ali-oss malformed-value matrix: PASS.
- Existing compiled adapter consuming normalized single/multi results: PASS.
- Production touched: false.
- Schema/migrations changed: false.
- Search candidate changed/rebuilt: false.
- Repository-native tests/typecheck/build: PENDING.

## Next Action
Run the repository's native verification on exact branch `codex/storage-runtime-contract-repair-20260820`. If and only if all required gates pass, perform the final diff review and prepare a separate Owner-gated release decision. Do not deploy or mutate production as part of this source-repair step.
