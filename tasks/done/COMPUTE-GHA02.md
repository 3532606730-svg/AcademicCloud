# COMPUTE-GHA02 — GitHub-hosted Compute qualification

## State

COMPLETE — exact final hosted run green; production cutover remains blocked
because the 512 MiB Node RSS gate was not reproducible across clean runners.

## Goal

Qualify exact ARCH-COMPUTE01 base source
`7389fc3d5c8b94ffce8a1a2aaf3d29fbcbcaa106` on a real GitHub-hosted
`ubuntu-24.04` runner, using only repository fixtures and synthetic test
material.

## Authorized scope

- Verify exact source/ref and the workflow-only qualification delta.
- Typecheck, test, and build `@academiccloud/compute-contracts` and
  `@academiccloud/compute`.
- Build and verify the pinned Tesseract 5.5.3 worker runtime.
- Run the realistic OCR fixture E2E without a skip.
- Run the five-run Linux memory probe with release-local Tesseract and record
  Node RSS plus encompassing GNU `time` maximum RSS.
- Verify no production bootstrap secret is exposed to the qualification job,
  no workflow artifact is uploaded, output/logs contain no secret, signed URL,
  document text, or candidate payload, and production shell inputs remain
  non-interpolated and quoted.
- Make only the smallest workflow-only adjustment needed to separate runtime
  qualification from the protected production claim/callback step.

## Delivered workflow-only delta

The exact qualification source is
`19e4d047b50263536f46d11bb5075698c479d73f`. The hosted source/ref gate proved
that authorized base `7389fc3…` is its ancestor and that the complete delta is
only `.github/workflows/derived-compute-worker.yml`.

The workflow now has a pull-request-only qualification job with no protected
production environment and no production bootstrap secret. The existing
`workflow_dispatch` production job retains its environment, input validation,
secret, quoted environment-variable arguments, timeout, and callback step, and
is explicitly skipped for pull-request qualification.

The qualification job:

- checks out the exact pull-request head SHA and verifies the exact branch,
  authorized base ancestry, Linux/x86_64 runner, and one-file delta;
- verifies both workspaces, builds the pinned runtime under a bounded
  `output/qualification` staging tree, rejects a skipped real-OCR test, and
  executes the existing memory probe unchanged;
- records GNU `time` maximum RSS even when the unchanged memory assertion fails;
- always runs a bounded output and production-shell safety scan;
- uploads no artifact.

No application, Compute, OCR, metadata, database, storage, Search, Activity
Center, configuration, migration, or production code path changed.

## Exact final GitHub evidence

```text
QUALIFICATION_BASE_SOURCE=7389fc3d5c8b94ffce8a1a2aaf3d29fbcbcaa106
QUALIFICATION_SOURCE_COMMIT=19e4d047b50263536f46d11bb5075698c479d73f
WORKFLOW_RUN=32403834659
JOB_ID=96538104436
RUNNER_IMAGE=ubuntu-24.04
RUN_CONCLUSION=success
PRODUCTION_JOB_ID=96538106441
PRODUCTION_JOB_CONCLUSION=skipped
```

The exact final job passed:

```text
SOURCE_REF_AND_WORKFLOW_ONLY_DELTA=PASS
COMPUTE_CONTRACTS_TYPECHECK_TEST_BUILD=PASS (1/1 tests)
COMPUTE_TYPECHECK_TEST_BUILD=PASS (52 pass / 0 fail / 1 expected pre-runtime skip)
PINNED_TESSERACT_5_5_3_BUILD=PASS
REAL_TESSERACT_E2E=PASS (1/1, 0 skipped)
OUTPUT_AND_PRODUCTION_SHELL_SAFETY=PASS
ARTIFACT_COUNT=0
```

Final exact Linux memory evidence:

```text
OCR_MODE=release_local_tesseract
CLEAN_START_RSS_BYTES=267780096
PEAK_RSS_BYTES=533995520
POST_JOB_RSS_BYTES=504348672
RETAINED_GROWTH_BYTES=236568576
RUN1_TO_RUN5_POST_RSS_DRIFT_BYTES=4247552
RUNS=5
GNU_TIME_MAX_RSS_KIB=521480
GNU_TIME_MAX_RSS_BYTES=533995520
NODE_PEAK_GATE_BYTES=536870912
FINAL_RUN_HEADROOM_BYTES=2875392
FINAL_RUN_MEMORY_GATE=PASS
```

## Reproducibility finding

The final green run does not erase two immediately preceding clean hosted
measurements of the unchanged Compute code and unchanged 512 MiB assertion:

```text
RUN=32402412163 PEAK_RSS_BYTES=547672064 MEMORY_GATE=FAIL
RUN=32402994336 PEAK_RSS_BYTES=549146624 MEMORY_GATE=FAIL
RUN=32403834659 PEAK_RSS_BYTES=533995520 MEMORY_GATE=PASS
```

The only change between failed run `32402994336` and green run `32403834659`
was emitting the already-collected GNU RSS line after the probe. It cannot
explain the lower in-probe Node peak. The observed cross-run spread is therefore
real runner/runtime variability around a gate with only 2.74 MiB final-run
headroom. `ARCH-COMPUTE01` is not yet reproducibly memory-qualified for
production cutover. No threshold was raised and no Compute code was changed.

## Log, artifact, and privacy evidence

The final full run-log scan (`SHA-256
67738f39328c2e641a0a38ed33716d109ca156cf9618802470e8f96272ced903`)
recorded:

```text
UNMASKED_SECRET_MATCHES=0
SIGNED_PRIVATE_SOURCE_URL_MATCHES=0
STRUCTURED_SOURCE_CALLBACK_CANDIDATE_PAYLOAD_MATCHES=0
PRODUCTION_BOOTSTRAP_SECRET_MENTIONS=0
FIXTURE_TEXT_RUNTIME_MATCHES=0
FIXTURE_TEXT_STATIC_GUARD_LITERAL_MATCHES=3
ARTIFACT_COUNT=0
```

The three static matches are the synthetic negative-scan literals in the shell
guard itself, not OCR/runtime output. GitHub's own checkout/API token appeared
only as masked `***` platform output. No private AcademicCloud PDF was sent to
GitHub; only repository fixtures and synthetic generated pages were processed.

## Temporary trigger and unrelated workflow isolation

Temporary draft PR `#8` was used only to trigger the new same-repository
pull-request workflow. It was closed unmerged after evidence capture. The
repository's independent Linux production-build workflow also auto-triggered on
each draft-PR synchronization; every such unrelated run was cancelled, including
final run `32403834289`, and no production artifact from this task completed or
was selected. RF-SEARCH01 source and its frozen release candidate were unchanged.

## Explicit exclusions preserved

```text
PRODUCTION_CHANGED=false
MIGRATION_022_APPLIED=false
CREDENTIALS_CHANGED=false
PRIVATE_PDF_PROCESSED=false
OSS_RAM_CORS_CHANGED=false
DATABASE_CHANGED=false
SEARCH_CHANGED=false
ACTIVITY_CENTER_CHANGED=false
PRODUCTION_CALLBACK_EXECUTED=false
```

## Decision and next gate

STOP. The exact final hosted run is green, but production cutover remains
unauthorized and technically blocked by non-reproducible Node RSS headroom.
Before any backup/migration/secrets/environment/artifact/cutover task, the Owner
must separately authorize a bounded memory-reproducibility investigation or
implementation repair. That follow-up must not merely raise the gate or change
production memory limits without a new evidence-backed decision.

## Rollback

The qualification path is workflow-only and has no production effect. It can be
removed or repaired by reverting its bounded workflow commits. The protected
production job was never executed and the temporary PR was never merged.
