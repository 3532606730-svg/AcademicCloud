# OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Task ID
OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## Closure reconciliation (2026-08-21)

HISTORICAL REPAIR RECORD COMPLETE. The later production-baseline hotfix and R3
release superseded the blocked source/artifact described below; R3 production
and Owner-reported browser storage acceptance passed. The failed-closed attempt,
rollback, and incompatible artifact evidence remain preserved rather than
rewritten. No further action belongs to this card.

## Goal
Repair the production-proven `ali-oss` `ListParts` runtime-shape mismatch at the narrowest correct boundary so a successful provider response is not converted into `storage_unavailable`, while preserving existing multipart, authorization, persistence, and production semantics.

## Scope
- Work on isolated branch `codex/storage-runtime-contract-repair-20260820` from authoritative base `281263be7f6248a4d18e099b59cf49028ec277ca`.
- Normalize only the exact `ali-oss@6.23.0` `ListParts` representation before it reaches the canonical `AliyunOssClientPort`: XML scalar booleans/integers remain strings and a single `<Part>` is a singleton object rather than an array.
- Canonicalize the single/multi Part container plus `PartNumber`, `Size`, `isTruncated`, and `nextPartNumberMarker`; preserve `ETag` and `LastModified` without inventing provider facts.
- Preserve the existing SDK instance and all non-`listParts` SDK method paths unchanged.
- Keep range/count/order/part-number bounds, duplicate detection, and marker-progression validation in `AliyunOssStorageAdapter`.
- Cover the real installed `ali-oss` method with deterministic no-network tests rather than relying only on a fake client.
- Build and independently verify one immutable Linux x64 / Node 24 production artifact from the exact verified repair source without contacting production.

## Non-goals
- No production deployment, release-symlink change, service/Nginx restart, RAM/OSS policy mutation, credential change, migration, SQLite write, pending-upload mutation, manual multipart complete/abort, or metadata mutation.
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
- The immutable production artifact passes compiled acceptance, dependency audits, release-local Tesseract/OCR verification, deterministic rebuild, manifest/archive verification, and fresh-runner independent verification.
- No migration or production mutation occurs during source repair, verification, or artifact construction.

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
PRODUCTION DEPLOYMENT FAILED CLOSED — RELEASE-SCOPE MISMATCH; APPLICATION-ONLY ROLLBACK PASS; STOP FOR OWNER REVIEW.

Exact repository-native source verification ran on repair source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` through isolated GitHub Actions run `32365460608` / job `96413882821`. The temporary draft PR used only to trigger that source-verification workflow was closed unmerged after success.

An immutable production artifact was then built from exactly the same source commit through isolated Actions run `32366397645`. Build job `96416730271` passed every production-artifact gate; fresh-runner job `96419650061` independently downloaded and verified the uploaded bundle. The artifact is `academiccloud-linux-x64-node24-8d28970209c2e7b41b5d9486bea570a2a8e6c7e6`, artifact ID `9405764771`, GitHub artifact digest `sha256:24858d7eab8003606a78a440d474ca549cca9904d984f04d777f60daf414b3ea`, release archive SHA-256 `03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4`, and manifest SHA-256 `76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4`.

Production remains release `604cb8daf310696353e99c30ce7a924dc71ef9d2`, schema v21/history 001–021. Artifact construction and verification did not contact or mutate production.

The provider-side permission gate is already green: raw production `ListParts` returns HTTP 200 after the exact least-privilege RAM v2 repair. The remaining upload failure was reproduced against the exact packaged `ali-oss@6.23.0`: one Part produced a singleton object and string scalar fields, causing the old adapter path to fail with `.map is not a function`; an empty non-truncated response with string paging fields caused the old path to reject the marker. The repaired client boundary converts only that real SDK representation into the already-declared canonical port representation.

Metadata Suggestion remains separate. Existing incident evidence ties recorded suggestion failures to the overdue-payment `UserDisableError` window at `HeadObject`; no suggestion implementation change has been made.

The Owner-authorized 2026-08-20 deployment verified and installed the exact artifact, switched the live pointer to `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6`, restarted only AcademicCloud, and passed exact process identity plus loopback/public health/readiness. The required final `RF_SEARCH01_TOUCHED=false` scope audit then proved an incompatible fact: `8d289702…` descends from frozen Search candidate `7bba7b869fd1234c1e7c67002cb93368c299209b`, and its shipped frontend imports/exposes `LibrarySearchField` while its backend contains the Search implementation. This conflicts with the same authorization's explicit prohibition on Search deployment.

The attempt therefore failed closed. The same-schema application-only rollback restored exact release `604cb8daf310696353e99c30ce7a924dc71ef9d2`. Post-rollback verification passed: exact process CWD; active/running service; `NRestarts=0`; one `127.0.0.1:3000` listener; loopback/public health/readiness 200; schema v21/history 001–021 with migration fingerprint `573fe6fb8b16cd644a41e48e12b8e1dfa416a9e551762849ae1864393b46ef63`; old release tree SHA-256 `6fd8fd7d431d1ef38e2700a0c9fd5c66f5869af3008912ba837fbf5f50a38d31`; five `uploading` multipart rows and six `pending_upload` file rows preserved. Environment, systemd, Nginx, RAM v2, credentials, SQLite content, metadata, and pending uploads were not changed. The verified `8d289702…` immutable directory remains installed but inactive; it must not be selected again under the no-Search boundary.

## Completed
- Created isolated repair branch from exact authoritative base `281263be7f6248a4d18e099b59cf49028ec277ca`.
- Inspected the exact packaged `ali-oss@6.23.0` from the frozen independently verified RF-SEARCH01 artifact without modifying that candidate.
- Proved the real `ListParts` runtime representation: singleton object for one Part; string `PartNumber`, `Size`, `isTruncated`, and marker fields.
- Reproduced the pre-fix failures against that exact dependency without network I/O.
- Implemented a narrow native-client `listParts` wrapper; all other SDK method paths remain unchanged.
- Kept the normalization helper internal to the Aliyun client module and retained semantic validation in `AliyunOssStorageAdapter`.
- Added real-SDK no-network regression tests for single-Part, multi-Part/truncated, omitted non-truncated marker, and malformed values.
- Repository-native focused Aliyun storage regressions: 20/20 PASS.
- Full backend suite: 376 PASS, 0 FAIL, 1 expected skip (377 total).
- Full frontend suite: 241/241 PASS across 11 files.
- Root Tesseract runtime verifier: 1/1 PASS.
- Backend and frontend typechecks: PASS.
- Backend and frontend production builds: PASS.
- `git diff --check` against exact authoritative base: PASS.
- Production artifact workflow: PASS, including clean install, full tests, typechecks/builds, compiled acceptance, full/production dependency audits, Argon2 benchmark, pinned release-local Tesseract construction, realistic OCR E2E, deterministic archive reproduction, manifest/runtime verification, and immutable upload.
- Fresh-runner independent artifact verification: PASS for exact source commit, downloaded artifact digest, release archive checksum, manifest, native modules, PDF.js/canvas, release-local Tesseract closure/models/synthetic OCR, and compiled acceptance.
- Direct post-workflow artifact download independently re-hashed the release archive and manifest and matched the workflow verification evidence.
- Production, schema, migrations, RAM, credentials, configuration, pending uploads, metadata, and RF-SEARCH01 remained untouched by the application-repair/artifact pass.
- Owner-authorized production artifact preflight, installation, and manifest verification: PASS.
- Initial `8d289702…` release switch, exact process identity, service, and loopback/public health/readiness: PASS.
- Final release-scope audit: FAIL — exact source contains and exposes frozen RF-SEARCH01 despite the explicit no-Search deployment boundary.
- Same-schema application-only rollback to `604cb8d…`: PASS; all rollback invariants green.

## Remaining
- Owner must reconcile the contradictory release contract before any new deployment: authorize a repair-only source/artifact that excludes RF-SEARCH01, or explicitly revise the no-Search boundary and its acceptance sequence.
- Do not redeploy artifact ID `9405764771` / source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` while the no-Search boundary remains in force.
- After a compatible authorized deployment, verify release identity/health/readiness and let the Owner run real-browser Continue upload first, then a disposable Abandon upload, then Metadata Suggestion.
- Close `OPS-STORAGE-INCIDENT01` only if the relevant journeys pass or any remaining failure is independently proven and repaired.
- Reconcile the accepted repair into the authoritative working branch through the approved release/reconciliation workflow; do not merge to `main` merely to close this incident.

## Blockers
The exact authorized artifact is incompatible with its deployment scope because it contains the frozen Search candidate. New Owner direction and new exact-source artifact evidence are required; no further production attempt is authorized.

## Last Verification
```text
VERIFIED_SOURCE=8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
BASE=281263be7f6248a4d18e099b59cf49028ec277ca
SOURCE_CI_RUN=32365460608
SOURCE_CI_JOB=96413882821
FOCUSED_STORAGE=20/20 PASS
BACKEND=376 PASS / 0 FAIL / 1 EXPECTED SKIP (377 total)
FRONTEND=241/241 PASS
TESSERACT_RUNTIME_TEST=1/1 PASS
TYPECHECK=PASS
BUILD=PASS
GIT_DIFF_CHECK=PASS
ARTIFACT_WORKFLOW=32366397645
ARTIFACT_BUILD_JOB=96416730271 PASS
ARTIFACT_INDEPENDENT_VERIFY_JOB=96419650061 PASS
ARTIFACT_ID=9405764771
ARTIFACT_NAME=academiccloud-linux-x64-node24-8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
GITHUB_ARTIFACT_SHA256=24858d7eab8003606a78a440d474ca549cca9904d984f04d777f60daf414b3ea
RELEASE_ARCHIVE_SHA256=03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4
MANIFEST_SHA256=76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4
COMPILED_ACCEPTANCE=PASS
DEPENDENCY_AUDIT=PASS
DETERMINISTIC_REBUILD=PASS
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
PRODUCTION_DEPLOYMENT_ATTEMPTED=true
FIRST_FAILED_GATE=AUTHORIZED_RELEASE_SCOPE_CONTAINS_FORBIDDEN_RF_SEARCH01_DEPLOYMENT
ROLLBACK=PASS
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PRODUCTION_RELEASE_CHANGED=false
SCHEMA_CHANGED=false
MIGRATIONS_RUN=false
RAM_CHANGED_IN_APP_REPAIR=false
CREDENTIALS_CHANGED=false
CONFIG_CHANGED=false
DATABASE_MUTATED=false
PENDING_UPLOADS_MUTATED=false
RF_SEARCH01_SOURCE_CHANGED=false
RF_SEARCH01_CURRENTLY_LIVE=false
RF_SEARCH01_BRIEFLY_EXPOSED_DURING_ROLLED_BACK_ATTEMPT=true
```

## Next Action
STOP FOR OWNER REVIEW. Do not redeploy the incompatible artifact or perform Owner browser storage acceptance. No further source change, rebuild, provider-policy change, migration, data mutation, or deployment is authorized by this task state.
