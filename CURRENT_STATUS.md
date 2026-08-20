# AcademicCloud Current Status

**Last reconciled:** 2026-08-21

`CURRENT_STATE.json` is the compact machine-readable pointer. ADRs and task
cards preserve the complete implementation, incident, release, and rollback
evidence without duplicating it here.

## Current situation

The first Core/Compute separation vertical slice and COMPUTE-PRECUTOVER01 are
complete. Exact hosted run `32407660640` qualified source `1c3bb10…` with real
pinned Tesseract OCR, a 547,860,480-byte peak under the explicit GitHub-hosted
`<768 MiB` contract, only 225,280 bytes of five-run post-RSS drift under the
unchanged `<64 MiB` drift contract, a passing privacy/output scan, zero
artifacts, and no protected production execution. The local-development peak
gate remains `<512 MiB`. The protected runtime now builds under
`output/worker-stage`, is verified, and is atomically promoted to
`output/worker`; static deployment tests prevent those paths from diverging.

GOAL-BETA-PREP01 Phase 2 is now active: exact Core/Compute production cutover
with verified rollback/backup evidence, migration 022, only minimum
least-privilege Compute routing/secret material, one exact deployment, and one
bounded canary. Goal Mode continues through the remaining bounded beta-prep
sequence and stops only at `INTERNAL_BETA_READY` or an explicit hard-stop
condition, before actually starting/inviting users into internal beta.

Production is still unchanged at the start of this program:

```text
PRODUCTION_RELEASE=08657727a17a7ea766ad0d74cc663fa40f91eee1
PREVIOUS_RELEASE=988bdbf052de1a39b47a1e22ac761c977eec72c8
SCHEMA=v21
MIGRATIONS=001-021
INTERNAL_BETA_READY=false
```

Development has migration 022 and therefore exercises schema v22/history
001–022 only in disposable local/test databases until the authorized production
cutover phase actually begins.

## Storage incident closure

`OPS-STORAGE-INCIDENT01` is closed after the exact least-privilege RAM v2 repair,
bounded runtime/CORS/R3 application repairs, verified release `08657727…`, and
Owner-reported real-browser storage acceptance. Historical provider, artifact,
failed-closed deployment, rollback, CORS, pending-upload, and production
verification evidence remains unchanged in the completed incident,
application-repair, and hotfix cards.

No further RAM/OSS/CORS policy mutation is part of GOAL-BETA-PREP01. The
incompatible Search-bearing artifact `9405764771` / source `8d289702…` must never
be selected.

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

Final exact-run memory evidence:

```text
CLEAN_START_RSS_BYTES=267780096
PEAK_RSS_BYTES=533995520
POST_JOB_RSS_BYTES=504348672
RUN1_TO_RUN5_POST_RSS_DRIFT_BYTES=4247552
GNU_TIME_MAX_RSS_KIB=521480
NODE_PEAK_GATE_BYTES=536870912
FINAL_RUN_HEADROOM_BYTES=2875392
```

This one pass is not a reproducible 512 MiB qualification. Two immediately
preceding clean hosted probes of the unchanged Compute code peaked at
547,672,064 and 549,146,624 bytes and failed the same fixed gate. No threshold,
memory limit, or Compute code was changed. The durable evidence is
`tasks/done/COMPUTE-GHA02.md`.

The first hosted failure also exposed the protected production-workflow staging
mismatch: the builder rejects targets outside repository `output/`, while the
protected production job still requests `runtime/tesseract`. The qualification
job uses a valid `output/qualification` staging path. That protected path was
never executed or repaired during qualification.

COMPUTE-PRECUTOVER01 has now superseded those two blockers without rewriting
their history. ADR-031 records the provider-specific `<768 MiB` GitHub-hosted
decision and first-use high-water classification. The protected job now uses
verified `output/` staging/promotion, and exact run `32407660640` passed the
real-runtime, memory, drift, privacy, output, and zero-artifact gates. Full
evidence is in `tasks/done/COMPUTE-PRECUTOVER01.md`.

ADR-031 remains authoritative for the architecture/security/callback model.

## Active Owner-authorized program — GOAL-BETA-PREP01

Codex Goal Mode is authorized to proceed in this exact order:

1. **COMPUTE-PRECUTOVER01 — COMPLETE** — provider-specific GitHub-hosted memory contract and protected Tesseract staging repair passed without production mutation;
2. **Core/Compute production cutover — ACTIVE NEXT** — exact artifact/rollback pair, verified production SQLite backup, migration 022, minimum least-privilege Compute credential/environment setup, deployment/restart, and one bounded production canary proving Core remains responsive while Compute runs;
3. **RF-SEARCH01 production closure** — do not deploy the historical artifact; compose the already-green Search behavior onto the latest post-Compute baseline, run its mandatory browser gate, build/verify a new artifact, then deploy;
4. **L1-UX08 beta-minimum Activity Center v0.1 + Source Recovery** — upload live states/recovery plus durable Metadata/Compute queued/processing/succeeded/failed and reliable download preparing/started/failed states; no broad notification/history platform;
5. **QA-GOLDEN01** — exact-build real-browser journey covering login → Library → Search → upload/activity → details → preview/download → asynchronous GitHub Compute metadata suggestion → candidate visibility while Core stays healthy → favorite → recycle/restore, plus a controlled resumable-upload path where practical.

When all are green, set `INTERNAL_BETA_READY=true`, reconcile exact release,
schema, rollback pointer and durable repository state, then STOP for the Owner's
actual internal-beta decision.

## Credential/privacy/cost boundaries

- Codex may generate/install one strong bootstrap secret without printing or logging it.
- A least-scoped workflow-dispatch credential may be used if already available/provisionable without broad account privilege. Do not repurpose/store a broad personal GitHub token on production. If a compliant dispatch credential requires Owner interaction, STOP only at that exact credential gate.
- The Owner accepts one bounded production canary PDF being transiently processed by a GitHub-hosted runner through the ADR-031 short-lived single-object capability model, with no raw PDF/text/candidates/source URL/capability in logs or workflow artifacts.
- No paid infrastructure, second server, cost-bearing object-backup work, broad provider-policy mutation, or unrelated roadmap work is authorized.
- Do not change production `MemoryHigh`/`MemoryMax` merely to hide a Compute defect.

## RF-SEARCH01

RF-SEARCH01 remains frozen in behavior and absent from production until its
GOAL-BETA-PREP01 Phase 3. Its exact historical candidate is
`7bba7b869fd1234c1e7c67002cb93368c299209b`; that old artifact must not be
deployed directly because production has advanced. Search must be recomposed on
the latest post-Compute baseline with a new exact artifact and browser gate.

## Next action

**CONTINUE IN GOAL MODE.** Recover `tasks/doing/GOAL-BETA-PREP01.md`, execute
Phase 2, and continue autonomously across green checkpoints. Stop early only for
the explicit hard boundaries in that card; otherwise stop only when
`INTERNAL_BETA_READY=true`, before starting/inviting users into internal beta.
