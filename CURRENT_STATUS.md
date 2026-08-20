# AcademicCloud Current Status

**Last reconciled:** 2026-08-21

`CURRENT_STATE.json` is the compact machine-readable pointer. ADRs and task
cards preserve the complete implementation, incident, release, and rollback
evidence without duplicating it here.

## Current situation

The first Core/Compute separation vertical slice is complete in development.
Its exact final GitHub-hosted qualification run is green, but the fixed 512 MiB
Node RSS gate was not reproducible across clean runners, so production cutover
remains technically blocked and unauthorized.

Production remains unchanged:

```text
PRODUCTION_RELEASE=08657727a17a7ea766ad0d74cc663fa40f91eee1
PREVIOUS_RELEASE=988bdbf052de1a39b47a1e22ac761c977eec72c8
SCHEMA=v21
MIGRATIONS=001-021
```

Development now has migration 022 and therefore exercises schema v22/history
001–022 only in disposable local/test databases.

## Storage incident closure

`OPS-STORAGE-INCIDENT01` is closed after the exact least-privilege RAM v2 repair,
bounded runtime/CORS/R3 application repairs, verified release `08657727…`, and
Owner-reported real-browser storage acceptance. Historical provider, artifact,
failed-closed deployment, rollback, CORS, pending-upload, and production
verification evidence remains unchanged in the completed incident,
application-repair, and hotfix cards.

No further RAM/OSS/CORS policy mutation is authorized. The incompatible
Search-bearing artifact `9405764771` / source `8d289702…` must never be selected
under the no-Search boundary.

## Separate Metadata Suggestion memory incident

The later Metadata Suggestion failure is not a reopened storage incident.
Production reached the heavy PDF/render/OCR path inside Core. With
`MemoryHigh=320MiB`, observed usage around 328 MiB, and `MemoryMax=384MiB`, cgroup
reclaim blocked the Node event loop and globally stalled the backend even though
the process stayed alive with zero OOM, OOM-kill, or restart.

The diagnosis classifies this as a single-document working-set spike against the
Core runtime limit. No repeating leak was established; concurrency amplification
was latent in the old in-process design. The exact record is
`tasks/done/OPS-METADATA-MEMORY01-DIAGNOSIS.md`.

## ARCH-COMPUTE01 development checkpoint

The Owner authorized `JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01` to
physically separate the first two heavy workloads while preserving existing OCR,
Metadata Suggestion, and canonical-authority semantics.

Delivered:

- SQLite-backed durable jobs with opaque identity, attempt correlation,
  idempotency, strict transitions, stable error codes, result digest, and durable
  deadline/stale classification;
- provider-neutral Compute contracts plus the first GitHub Actions dispatcher;
- a clean concurrency-one worker that receives only opaque routing, claims one
  short-lived exact source capability, and returns strictly validated candidates;
- the existing PDF.js/native-text/page-selection/canvas/Tesseract/extraction
  implementation and fixtures moved into the Compute workspace;
- sequential one-page render/OCR/cleanup with bounded Range reads and no retained
  page-proxy collection through the OCR pass;
- Metadata Suggestion POST changed from request-lifetime compute to HTTP 202
  durable job creation, with only queued/processing/succeeded/failed UI states;
- Core remains sole authority for Auth, Library, SQLite, source validation,
  suggestion persistence/review, and canonical metadata CAS writes;
- the Core package/artifact/CI path no longer installs, packages, imports, or
  verifies PDF.js, native canvas, Tesseract, trained data, or OCR E2E solely for
  Metadata Suggestion; the dedicated Compute workflow owns those checks.

The local vertical slice proves:

```text
Core authorization/job
→ opaque adapter dispatch identity
→ worker claim
→ bounded PDF Range read and recognition
→ authenticated candidate callback
→ Core validation and persisted reviewable suggestion
→ unchanged manager canonical acceptance path
```

Verification at this checkpoint:

```text
BACKEND=326/326 PASS
FRONTEND=247/247 PASS
COMPUTE=52 PASS / 0 FAIL / 1 EXPECTED LOCAL-RUNTIME SKIP
COMPUTE_CONTRACTS=1/1 PASS
BUILD=PASS
COMPILED_ACCEPTANCE=PASS
```

Five identical 20-page/two-rendered-page memory-probe runs, using a deterministic
OCR fixture to isolate the PDF.js/native-canvas lifecycle, recorded
248,520,704-byte clean-start RSS, 501,194,752-byte peak RSS,
476,028,928-byte final post-job RSS, and only 1,134,592 bytes of run-one to
run-five post-run drift. These local Node RSS figures do not include a Linux
Tesseract child process; the Compute workflow verifies real Tesseract, and a
whole-clean-runner peak remains mandatory production-cutover evidence. The first
PDF/native runtime load is substantial, so
clean process-per-job isolation, concurrency one, and the workflow memory
assertion remain part of the contract.

## COMPUTE-GHA02 hosted qualification

Exact base `7389fc3d5c8b94ffce8a1a2aaf3d29fbcbcaa106` was qualified through
workflow-only source `19e4d047b50263536f46d11bb5075698c479d73f` on GitHub-hosted
`ubuntu-24.04`. Final run `32403834659`, job `96538104436`, passed exact
source/ref verification, Compute contracts typecheck/test/build, Compute
typecheck/test/build, the pinned Tesseract 5.5.3 runtime build, real OCR E2E
with zero skips, the existing five-run memory assertion, and the independent
output/production-shell safety step. The protected production Compute job was
skipped, no artifact was uploaded, no production secret was supplied, and only
repository fixtures/synthetic pages were processed.

Final exact-run memory evidence was:

```text
CLEAN_START_RSS_BYTES=267780096
PEAK_RSS_BYTES=533995520
POST_JOB_RSS_BYTES=504348672
RUN1_TO_RUN5_POST_RSS_DRIFT_BYTES=4247552
GNU_TIME_MAX_RSS_KIB=521480
NODE_PEAK_GATE_BYTES=536870912
FINAL_RUN_HEADROOM_BYTES=2875392
```

This one pass is not a reproducible cutover qualification. Two immediately
preceding clean hosted probes of the unchanged Compute code peaked at
547,672,064 and 549,146,624 bytes and failed the same fixed gate. The only
change between the last failed source and the green source emits the already
collected GNU RSS line after probe completion; it cannot explain the measured
spread. No threshold, memory limit, or Compute code was changed. The durable
evidence is `tasks/done/COMPUTE-GHA02.md`.

ADR-031 is authoritative for the architecture, security, timeout, release, and
production migration consequences.

## Production cutover gate

This checkpoint did not contact or mutate production. Before even planning a
future cutover, the Owner must separately authorize a bounded investigation or
implementation repair for the non-reproducible hosted memory headroom. A later
cutover still requires a separate exact backup/migration/artifact/secrets/
protected-environment/deployment plan. The minimal new secret values remain:

1. a least-scoped GitHub workflow-dispatch token held by Core;
2. one strong bootstrap secret installed in Core and the protected GitHub
   environment.

Non-secret routing must pin the exact repository/workflow/ref and exact Core
HTTPS origin. A later cutover must verify rollback pairing, migration 022,
release identity, service and health/readiness, Auth and Library isolation,
durable async state across reload, failed/stale job classification, candidate
review, and unchanged canonical metadata authority. Because a GitHub-hosted
runner transiently processes the selected private PDF, the Owner must also
accept that provider/privacy boundary; the workflow must continue to emit no
source URL, capability, document text, or candidate payload to logs/artifacts.

## RF-SEARCH01

RF-SEARCH01 remains frozen, unchanged, and absent from production. Its exact
candidate remains `7bba7b869fd1234c1e7c67002cb93368c299209b`. No Search source,
artifact, deployment, or acceptance work was performed by ARCH-COMPUTE01.

## Next action

**STOP FOR OWNER REVIEW.** Do not infer production qualification from the one
narrow green hosted memory run. Do not deploy, restart production, change memory
limits, create/rotate/install production credentials, apply migration 022,
mutate production SQLite/OSS/RAM/CORS/pending uploads, or progress RF-SEARCH01
under the current authorization.
