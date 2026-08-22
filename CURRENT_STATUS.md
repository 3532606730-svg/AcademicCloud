# AcademicCloud Current Status

**Last reconciled:** 2026-08-22

`CURRENT_STATE.json` is the compact machine-readable pointer. ADRs and task
cards preserve the complete implementation, incident, release, and rollback
evidence without duplicating it here.

## Current situation

Owner-authorized `L1-INTELLIGENT-LIBRARY01` is active in its mandatory A–F
sequence. Checkpoints A, B, C, D, and E are complete. A implemented the ADR-032 domain
and additive development migration 023. B accepted ADR-033 and added migration
024 plus an exact-pinned, ephemeral, sequential PP-OCRv6-small → Qwen3-1.7B
Q8_0 bibliographic pipeline. C accepted ADR-034 and added authorization-first
metadata-aware Search, the exact 19-class and restrained advanced filters,
query/filter/sort-bound keyset cursors, and non-persisted modern/historical/
facsimile display composition while retaining the existing six normal Library
sort contracts. D accepted ADR-035 and added an exact-pinned, offline,
authorization-first CSL citation projection for Chicago Notes & Bibliography,
《历史研究》, 《文史哲》, and current GB/T 7714—2025. Its typed modern and
historical locators, explicit partial completeness, style provenance, and exact
style hashes keep output deterministic without creating citation history or a
second metadata authority. E completed the compact responsive Library control
row, collapsed-by-default account-local Activity Center preference, ordinary
details-to-citation flow, direct structured bibliography editing, and explicit
field-scoped human-to-AI restoration. Frontend 270/270, full workspace
typecheck, and the production frontend build are green. Core remains authoritative; explicit labels and
strict deterministic checks govern auto-application, human fields are never
silently replaced, and AI failure never invalidates an admitted file.

Exact hosted source `0fa04b43…`, run `32574319098`, passed real PaddleOCR,
selected-path 3/3 rendered multilingual/vertical cases, seven-case 7/7
qualification, 3,396,112-KiB and 3,298,672-KiB encompassing RSS gates, privacy
and production-shell safety, and zero artifacts. Direct Qwen3-VL did not
complete inside the bounded final comparison and is not a Layer-1 production
dependency or automatic escalation.

No partial Layer‑1 production change has occurred. Production remains exact
`53317bb0156589baa21bc69c22e199d200c49840` at schema v22/history 001–022.
Development migration head is v24/history 001–024. Continue automatically
through F; production migration/deployment is authorized only at integrated
Checkpoint F after its bounded gates. Internal Beta remains unstarted.

The first Core/Compute separation vertical slice, COMPUTE-PRECUTOVER01, and
GOAL-BETA-PREP01 Phase 2 production cutover are complete. Production now runs
exact immutable Core source `1c3bb10a48082995924a2d9ec41a48d6d3d34acd`
at schema v22/history 001–022. It was installed only after exact artifact
verification, a stopped-service SQLite backup, off-host encrypted publication
and independent rehash, and application-plus-database rollback pairing.

Owner email verification and exact-scope approval enabled one 30-day
fine-grained token limited to only `3532606730-svg/AcademicCloud` with
repository Actions write plus GitHub-required read-only metadata. Production
and the protected `academiccloud-compute-production` Environment received only
the minimum ADR-031 routing/bootstrap values; no credential value is present in
Git, durable evidence, workflow artifacts, or the checked logs.

One logical production canary job
`2cb8a0b6-fb37-4b51-bd3b-f9330dbbbde7` completed on its second attempt in
final GitHub run `32415058752`. Two bounded workflow defects were repaired at
their first failing boundaries: runner ownership of the promoted output tree,
then execution from the same staged release tree as the verified release-local
Tesseract runtime. Final OCR/memory, callback, privacy, zero-artifact, and
candidate-review gates passed. Core stayed responsive, the reviewable filename
candidate was not accepted, and canonical metadata, source bytes, OSS/RAM/CORS,
Nginx, and production memory limits remained unchanged. Phase 3 RF-SEARCH01
subsequently closed on its own exact release; Phase 4 Activity Center v0.1
plus Source Recovery is now active.

Current production:

```text
PRODUCTION_RELEASE=53317bb0156589baa21bc69c22e199d200c49840
PREVIOUS_RELEASE=c741455d7aa631d5b8c37149e8643a6a75b1cae8
SCHEMA=v22
MIGRATIONS=001-022
INTERNAL_BETA_READY=true
HOTFIX_META_UX01=DEPLOYED (Owner manual acceptance pending)
```

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

## Metadata Suggestion memory incident closure

The Metadata Suggestion failure was not a reopened storage incident. Before the
Compute cutover, production reached the heavy PDF/render/OCR path inside Core. With
`MemoryHigh=320MiB`, observed usage around 328 MiB, and `MemoryMax=384MiB`, cgroup
reclaim blocked the Node event loop and globally stalled the backend even though
the process stayed alive with zero OOM, OOM-kill, or restart.

The diagnosis classified this as a single-document working-set spike against the
Core runtime limit. No repeating leak was established; concurrency amplification
was latent in the old in-process design. Phase 2 removed that heavy path from
Core and the real canary proved fault isolation, so the incident is closed. The
diagnostic record remains `tasks/done/OPS-METADATA-MEMORY01-DIAGNOSIS.md`.

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
2. **Core/Compute production cutover — COMPLETE** — exact artifact, verified backup/off-host copy, migration 022, least-scoped credentials/environment, exact deployment, Core invariants, and one bounded real canary passed;
3. **RF-SEARCH01 production closure — COMPLETE** — ancestry-backed composition, focused tests, production browser gate, new exact artifact `9424397852`, independent/local/host verification, and same-schema application cutover passed; historical artifact was not used;
4. **L1-UX08 beta-minimum Activity Center v0.1 + Source Recovery — COMPLETE** — shipped through same-schema app-only releases `156660d…` → `01747d9…` → `c741455…`; the replacement-release browser journey exposed and `c741455…` repaired a canonical duplicate-name completion defect (early `name_conflict` pre-flight, clean status mapping, orphan-object discard on abandon); the exact-release 46/46 browser journey passed multipart resume, real GitHub Compute suggestion, wrong-file fail-closed, mobile, and the stub-picker path with zero residue;
5. **QA-GOLDEN01 — COMPLETE** — the exact-release golden journey `golden-202608211339-u8o6iv` passed 32/32 on production `c741455…`: authenticated session → Library → Search (no-result, stale-safety, clear-restores, live filename fallback) → immediate Activity Center state → controlled 64 MiB pause/continue → stable duplicate-name failure → details/preview/byte-verified download → Metadata Suggestion 202 → queued → processing → real GitHub Compute run `32488192994` → succeeded with reviewable candidates while canonical metadata stayed unchanged and Core stayed healthy → favorite → recycle/restore → 390×844 mobile smoke → zero residue.

When all are green, set `INTERNAL_BETA_READY=true`, reconcile exact release,
schema, rollback pointer and durable repository state, then STOP for the Owner's
actual internal-beta decision.

## Credential/privacy/cost boundaries

Phase 2 cutover evidence:

```text
REPOSITORY_HEAD=a3af736e36b3830f728e60e92cfb483e26a0b28f
ARTIFACT_SOURCE=1c3bb10a48082995924a2d9ec41a48d6d3d34acd
PRODUCTION_BUILD_RUN=32407660568
ARTIFACT_ID=9421010643
ARTIFACT_DIGEST_SHA256=48abdc8b2ebfb5484358d6983f83d2f7c7dcb7956d9a2b028d484f668a9e7836
ARCHIVE_SHA256=1b78cf47ea1938cbed5e1247f27dc5be392596287ae02eb0f4ec0475c5b78e1c
MANIFEST_SHA256=7dfed78239ef60f012b0865715eb78a9a5e0553c7dee6017b68fbd1fa445df7e
PRODUCTION_RELEASE=1c3bb10a48082995924a2d9ec41a48d6d3d34acd
PREVIOUS_RELEASE=08657727a17a7ea766ad0d74cc663fa40f91eee1
PRODUCTION_SCHEMA=v22 / 001-022
SQLITE_INTEGRITY=ok
FOREIGN_KEY_VIOLATIONS=0
BACKUP_SHA256=1c00b6bcb9fe7e5aaf30a28c9e0b797753626d0ec99f79d2ebe799d097a8609a
OFF_HOST_BACKUP_COMMIT=22b05321febe6bfceb7d1bd609b30b499937b7d2
COMPUTE_ENV_KEYS=seven root-only minimum keys
GITHUB_PROTECTED_ENVIRONMENT=academiccloud-compute-production
FINE_GRAINED_PAT=single repository / Actions write / 30 days
CANARY_RUN=32415058752 / PASS / ZERO ARTIFACTS
CANONICAL_METADATA_CHANGED=false
OSS_RAM_CORS_MEMORY_LIMIT_CHANGED=false
COST_CHANGED=false
```

- Codex may generate/install one strong bootstrap secret without printing or logging it.
- A least-scoped workflow-dispatch credential may be used if already available/provisionable without broad account privilege. Do not repurpose/store a broad personal GitHub token on production. If a compliant dispatch credential requires Owner interaction, STOP only at that exact credential gate.
- The Owner accepts one bounded production canary PDF being transiently processed by a GitHub-hosted runner through the ADR-031 short-lived single-object capability model, with no raw PDF/text/candidates/source URL/capability in logs or workflow artifacts.
- No paid infrastructure, second server, cost-bearing object-backup work, broad provider-policy mutation, or unrelated roadmap work is authorized.
- Do not change production `MemoryHigh`/`MemoryMax` merely to hide a Compute defect.

## RF-SEARCH01

RF-SEARCH01 is complete and remains frozen in behavior. Its exact historical candidate is
`7bba7b869fd1234c1e7c67002cb93368c299209b`. Post-checkpoint ancestry
verification proved that Phase 2 source `1c3bb10…` already descends that
candidate, and the production UI exposes Search. The historical artifact was
not reused, but the prior durable claim that Search was absent was wrong and the
required Phase 3 browser-before-final-release sequence therefore had to be
re-established on a new release.

All Search-specific backend service/HTTP files and the dedicated frontend
component/tests are byte-identical to the frozen candidate; newer shared
`App`/API/i18n changes retain that behavior. Focused checks pass 14/14 backend
and 137/137 frontend, plus all-workspace typecheck. The production desktop
browser gate passes Chinese title, author, author+title, original-filename
fallback, no result, Escape/clear folder restoration, rapid-query stale safety,
and opening the existing details surface. Exact integrated source `b19f9dc5…`
then produced artifact `9424397852` in run `32417182890`; its build and
independent jobs, local hashes, and host verifier passed. The 4,789-file runtime
tree is byte-identical to previous release `1c3bb10…` except artifact-manifest
identity. Production now selects `b19f9dc5…`; health/readiness, process identity,
schema v22, SQLite counts/integrity/FK, and the post-deploy browser journey pass.
The historical artifact remains permanently forbidden.

## INTERNAL_BETA_READY — reached; STOP for the Owner

All five GOAL-BETA-PREP01 phases are green on the exact production release
`c741455…`:

```text
CORE_COMPUTE_CUTOVER=COMPLETE (schema v22 / 001-022)
REAL_GITHUB_COMPUTE=PASS (canary 32415058752; golden 32488192994; Core responsive)
SEARCH_PRODUCTION=PASS (browser gate green on the composed baseline)
ACTIVITY_CENTER_V0_1=PASS (46/46 exact-release browser journey)
GOLDEN_JOURNEY=PASS (32/32 exact-release browser journey, zero residue)
UNRESOLVED_BLOCKERS=none
PRODUCTION_RELEASE=c741455d7aa631d5b8c37149e8643a6a75b1cae8
ROLLBACK_POINTER=01747d929cb42e4c107d47c10ad66047377f6bcd (same-schema app-only)
INTERNAL_BETA_READY=true
NEXT=OWNER_INTERNAL_BETA_DECISION
```

Internal beta itself is NOT started and no users are invited. Starting/inviting
remains exclusively the Owner's decision.

## HOTFIX-META-UX01 — Owner-authorized product-usability hotfix

Owner-authorized on 2026-08-21 as one bounded same-schema hotfix on production
`c741455…` / schema v22: (A) fast lightweight canonical-title suggestions
available ≤2 s independent of GitHub Compute/OCR (idempotent, stale/CAS-safe,
no auto-accept, junk filenames rejected, no OSS rename); (B) manager-only batch
naming for selected Library holdings (preview → edit/select/deselect →
"select reliable suggestions" → explicit confirm → per-item results; one
stale/conflict item never rolls back others; existing canonical metadata
authority/CAS; OCR not required; no physical rename); (C) server-authoritative
Library sorting (newest/oldest/title/size) with Chinese Han ordered by
normalized Hanyu Pinyin, punctuation/brackets/spacing never dominant, Latin A–Z
in the same key system, one deterministic numeric policy, Unicode fallback,
title-then-file-identity tie-breaks, and stable keyset cursor pagination;
Search ranking unchanged.

Key design decision: the migration-019 append-only evidence model is preserved
exactly. Fast naming persists one immutable run per job; the OCR/Compute
callback persists a second immutable superseding run (`suggestion-<jobId>-computed`),
latest-run resolution surfaces it, and an accepted run stays frozen. No trigger
change, no migration, no candidate delete/update.

Verification and deployment:

```text
BACKEND_SUITE=343/343 PASS (6 sorting + fast/batch naming tests)
FRONTEND_SUITE=259/259 PASS
WORKSPACE_TYPECHECK=PASS
PRODUCTION_BUILD=PASS
GIT_DIFF_CHECK=PASS
MIGRATION_CHANGE=none (schema v22 / 001-022)
OSS_RAM_CORS_PROVIDER_CREDENTIAL_COST_CHANGE=none
PRODUCTION_BUILD_RUN=32500123948
ARTIFACT_ID=9453231114
ARCHIVE_SHA256=620f2c95185e5764ce0f050fc54ba737e45860b1a314e93960f6c954bc70c14f
MANIFEST_SHA256=dee1539139ccdfbc26baf4d8392534ebde7f07dedb6befa4618844fc0044da57
HOST_VERIFIER=PASS (archive/manifest/checksum, tree match, release policy,
native ELF64, compiled acceptance; evidence at
/root/academiccloud-verify-53317bb/output/53317bb-stage/host-evidence.json)
RUNTIME_DELTA=exactly the bounded feature surface (39 added / 1 removed / 16
changed; no database/deployment/scripts/compute change)
DEPLOYED_RELEASE=53317bb0156589baa21bc69c22e199d200c49840 (same-schema app-only)
PREVIOUS_RELEASE=c741455d7aa631d5b8c37149e8643a6a75b1cae8 (rollback pointer)
MIGRATION_RUNNER={"appliedVersions":[],"currentVersion":22}
SERVICE=active / NRestarts=0 / one loopback listener
HEALTH_READINESS=ok/ready loopback and public
SCHEMA_AFTER=v22 / 001-022
SQLITE_INTEGRITY=ok
FOREIGN_KEY_VIOLATIONS=0
PROTECTED_CONFIG_HASHES=unchanged (env, systemd unit, nginx site, security headers)
JOURNAL_SCAN=clean (zero error/fatal/unhandled/exception since restart)
PENDING_FIXTURES=unchanged durable state (6 pending_upload files, 5 multipart rows)
DATABASE_MUTATED=false
OWNER_MANUAL_ACCEPTANCE=PENDING (Owner performs manual product acceptance
in production after deployment; no browser automation was run per Owner override)
```

## Next action

STOP for the Owner's manual product acceptance of HOTFIX-META-UX01 (fast
naming, batch naming, sorting, regression surfaces) and the internal-beta
decision. Do not begin internal beta or invite users.
