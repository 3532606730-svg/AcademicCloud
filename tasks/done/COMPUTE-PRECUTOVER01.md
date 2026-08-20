# COMPUTE-PRECUTOVER01 — Compute production pre-cutover contracts

## Task ID

COMPUTE-PRECUTOVER01

## Goal

Resolve the two proven Core/Compute production-cutover blockers without
touching production: adopt an evidence-backed GitHub-hosted memory contract and
repair the protected Tesseract staging path while preserving the builder's
repository-`output/` safety boundary.

## Scope

- Preserve the historical 512 MiB hosted measurements.
- Keep the local-development peak gate at 512 MiB.
- Add the explicit `github-hosted-ubuntu-24.04` peak gate at less than 768 MiB.
- Preserve five repeat runs, less-than-64-MiB drift, concurrency one, and one
  clean process per job.
- Build the protected runtime under `output/worker-stage`, verify it, promote it
  atomically to `output/worker`, and execute only from that verified tree.
- Add a static deployment contract test tying the build, verification, runtime,
  memory-profile, peak, and drift paths together.
- Run a real hosted Tesseract/OCR qualification without production secrets,
  callbacks, private PDFs, or workflow artifacts.

## Non-goals

- No production deployment, migration, credential, environment, callback,
  database, OSS/RAM/CORS, Search, Activity Center, or product change.
- No OCR algorithm rewrite or production Core memory-limit change.
- No weakening of the output-only builder boundary.

## Acceptance Criteria

- [x] The historical 512 MiB evidence remains recorded.
- [x] The new GitHub-hosted limit is provider-specific, reproducible, and below
      768 MiB rather than a silent global threshold increase.
- [x] Real Tesseract OCR passes with zero skip.
- [x] Five-run drift remains below 64 MiB.
- [x] Protected staging builds only under repository `output/`, verifies before
      promotion, and uses the promoted verified path.
- [x] Static contract tests fail if build, verify, runtime, peak, or drift
      contracts diverge.
- [x] Privacy/output scan passes, artifact count is zero, and the protected
      production job remains skipped.
- [x] Production is unchanged.

## Relevant ADRs

- `docs/decisions/ADR-030-release-local-tesseract-runtime.md`
- `docs/decisions/ADR-031-core-derived-compute-boundary.md`

## Relevant Modules / Files

- `.github/workflows/derived-compute-worker.yml`
- `compute/scripts/memory-probe.ts`
- `backend/test/deployment/artifacts.test.ts`

## Current State

COMPLETE. Exact qualified source:
`1c3bb10a48082995924a2d9ec41a48d6d3d34acd`.

The three immediately relevant unchanged-Code hosted observations are now
classified as bounded first-use high-water, not repeating growth:

```text
RUN=32402412163 PEAK_RSS_BYTES=547672064 HISTORICAL_512_MIB_GATE=FAIL
RUN=32402994336 PEAK_RSS_BYTES=549146624 HISTORICAL_512_MIB_GATE=FAIL
RUN=32403834659 PEAK_RSS_BYTES=533995520 HISTORICAL_512_MIB_GATE=PASS
```

All are below the explicit GitHub-hosted 768 MiB contract. The exact new
qualification passed with:

```text
WORKFLOW_RUN=32407660640
QUALIFICATION_JOB=96550455191
RUNNER_IMAGE=ubuntu-24.04
RUNNER_IMAGE_VERSION=20260816.277.1
CLEAN_START_RSS_BYTES=271077376
PEAK_RSS_BYTES=547860480
POST_JOB_RSS_BYTES=538947584
RUN1_TO_RUN5_POST_RSS_DRIFT_BYTES=225280
GITHUB_HOSTED_PEAK_GATE_BYTES=805306368
REPEAT_DRIFT_GATE_BYTES=67108864
GNU_TIME_MAX_RSS_KIB=535796
REAL_TESSERACT_E2E=PASS (1/1, 0 skipped)
ARTIFACT_COUNT=0
PROTECTED_PRODUCTION_JOB=SKIPPED
```

The first trigger, run `32407554017`, failed before installation because the
qualification baseline constant contained an incorrect expanded SHA. No build,
OCR, secret, protected environment, callback, artifact, or production path was
reached. The constant was corrected to exact repository commit
`decfde4d06d359f0cb9873682293ff828bac5ab9`; the subsequent exact run above
passed.

Temporary Draft PR `#9` triggered the same-repository qualification and was
closed unmerged after evidence capture.

## Completed

- Added explicit local and GitHub-hosted memory profiles.
- Preserved the 512 MiB local-development gate.
- Adopted `<768 MiB` only for `github-hosted-ubuntu-24.04`.
- Preserved `<64 MiB` repeat drift and the existing clean-process worker model.
- Repaired protected runtime staging through verified `output/` stage/promote.
- Added the static workflow/deployment contract.
- Passed local changed-risk and exact hosted real-runtime verification.
- Verified zero workflow artifacts and no protected production execution.

## Remaining

None in this task.

## Blockers

None. GOAL-BETA-PREP01 Phase 2 production preflight is now the active next
boundary.

## Last Verification

```text
LOCAL_COMPUTE_TYPECHECK=PASS
LOCAL_COMPUTE=52 PASS / 0 FAIL / 1 EXPECTED PRE-RUNTIME SKIP
LOCAL_BACKEND=326/326 PASS
LOCAL_REPOSITORY_TYPECHECK=PASS
LOCAL_STATIC_DEPLOYMENT_CONTRACT=6/6 PASS
LOCAL_512_MIB_PROBE=PASS
LOCAL_GITHUB_PROFILE_PROBE=PASS
HOSTED_CONTRACTS=1/1 PASS
HOSTED_COMPUTE=52 PASS / 0 FAIL / 1 EXPECTED PRE-RUNTIME SKIP
HOSTED_REAL_TESSERACT=1/1 PASS / 0 SKIPPED
HOSTED_MEMORY=PASS
HOSTED_PRIVACY_OUTPUT_SCAN=PASS
HOSTED_ARTIFACT_COUNT=0
PRODUCTION_MUTATION=false
```

## Next Action

Recover the exact clean/synchronized repository state and execute
GOAL-BETA-PREP01 Phase 2: build/verify an exact Core artifact, prove the
rollback/backup pair, apply only migration 022, provision only minimum
least-privilege Compute routing/secret material, deploy, and run one bounded
production canary.
