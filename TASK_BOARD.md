# AcademicCloud Task Board

**Last reconciled:** 2026-08-24

The board is the executable priority view. `CURRENT_STATE.json` holds compact
current pointers; task cards and ADRs preserve complete contracts and evidence.

## Current Owner authorization / continuous objective

`INCIDENT-L1-AI-PRODUCTION01` is **CURRENTLY OPEN / PRODUCTION USER ACCEPTANCE
FAIL**. The Owner's real-browser observation overrides the earlier fixture,
harness, worker, CI, and repository gates. Diagnose the first broken boundary
through the signed-in production UI, make only the smallest repair, deploy its
exact artifact, and re-test the same real browser path. Do not start the AI
quality cohort, Internal Beta, `UPLOAD-PERF01`, or unrelated work.

`ACADEMICCLOUD-EXECUTION-ACCESS-RECOVERY01` has its access gates resolved:
SSH read-only evidence, Git write/push, and authorized GitHub Actions browser
read are available. Reconcile the card at the incident checkpoint.

| Task | State | Next authority |
|---|---|---|
| L1-INTELLIGENT-LIBRARY01 | COMPLETE / DEPLOYED — A–F green; exact `017a47d…`, schema v24/history 001–024 | STOP — durable release evidence is in `tasks/done/L1-INTELLIGENT-LIBRARY01.md` |
| UPLOAD-PERF01 | NEXT APPROVED / NOT STARTED | Separate independently rollbackable release; do not start from this completed program |
| GOAL-BETA-PREP01 | HISTORICAL GATES PRESERVED / INTERNAL_BETA_READY=false | STOP — production Owner-path acceptance failed; no internal beta or invitations |
| HOTFIX-META-UX01 | HISTORICAL RELEASE `53317bb…`, now the immediate app+v22 backup rollback pair for `017a47d…` | Owner manual acceptance remains pending; no action started here |
| COMPUTE-GHA02 | HOSTED VERIFICATION COMPLETE / HISTORICAL FINDINGS PRESERVED | Superseded by COMPUTE-PRECUTOVER01, which resolved its memory/staging findings on exact hosted run `32407660640` |
| ARCH-COMPUTE01 (`JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01`) | PRODUCTION CUTOVER COMPLETE | Exact artifact `9421010643`, stopped-service backup, migration 022, minimum credentials/environment, deployment, invariants, and canary passed |
| OPS-METADATA-MEMORY01 | CLOSED BY COMPUTE CUTOVER | Real production canary proved heavy work outside Core and Core responsiveness throughout |

Independent incident gates:

```text
PDFJS_REPAIRED_RELEASE_E2E=PASS
RESOURCE_ALREADY_EXISTED=true
PRE_FIX_FAILURE_BOUNDARY=PDFJS_RANGE_READER
NEW_JOB_CREATED=true
DISPATCH=PASS
WORKER_CLAIM=PASS
PDF_RANGE_ACCESS=PASS
PDFJS_STALE_READER_ERROR_ABSENT=true
OCR_OR_DOWNSTREAM_EXTRACTION_REACHED=true
CALLBACK=PASS
TERMINAL_STATE=succeeded
DUPLICATE_DURABLE_JOBS=0
DUPLICATE_PROVIDER_EXECUTIONS=0
AMBIGUOUS_DISPATCH_RECOVERY=PASS
```

The completed A–F contract, credential/privacy boundaries, production evidence,
and rollback record are authoritative in
`tasks/done/L1-INTELLIGENT-LIBRARY01.md`. Historical beta-prep and hotfix
contracts remain preserved in their existing cards.

## Completed Intelligent Library sequence

| Order | Checkpoint | State |
|---:|---|---|
| A | Domain + persistence architecture | COMPLETE / PUSHED / SYNCED — `fff33c7…`; additive migration 023 and ADR-032; production unchanged |
| B | AI bibliographic Compute | COMPLETE / PUSHED / SYNCED — `9d8a3a0…`; run `32574319098`, 3/3 + 7/7, sub-6-GiB, zero artifacts |
| C | Search + filters + display | COMPLETE / PUSHED / SYNCED — ADR-034; backend 357/357, frontend 262/262, typecheck/build green; production unchanged |
| D | Citation engine | COMPLETE / PUSHED / SYNCED — `015738c…`; ADR-035; four exact-hashed styles including 《历史研究》; backend 364/364, focused 8/8, build/typecheck green; production unchanged |
| E | Library UX + Activity Center | COMPLETE / PUSHED / SYNCED — `017a47d…`; quiet responsive Search/type/sort/filter row, collapsed local-preference Activity Center, direct bibliography/field-authority editing, four-style citation dialog; frontend 270/270, typecheck/build green |
| F | Integration + migration + exact production deployment | COMPLETE / DEPLOYED / VERIFIED — artifact `9477785607`; stopped-service encrypted/off-host rollback generation; migrations 023–024; exact `017a47d…`; health/schema/integrity/FK/journal/memory/no-wave green |

## Active Goal Mode sequence

| Order | Task / phase | Task card | State |
|---:|---|---|---|
| 1 | COMPUTE-PRECUTOVER01 | `tasks/done/COMPUTE-PRECUTOVER01.md` | COMPLETE — exact source `1c3bb10…`, run `32407660640`; real OCR, provider-specific memory/drift, staging, privacy/output, and zero-artifact gates passed; production unchanged |
| 2 | ARCH-COMPUTE01 production cutover | `tasks/doing/GOAL-BETA-PREP01.md` Phase 2 | COMPLETE — production `1c3bb10…`, schema v22/history 001–022, rollback `08657727…` + verified pre-migration DB, final canary run `32415058752` green |
| 3 | RF-SEARCH01 production closure | `tasks/done/RF-SEARCH01.md` + Goal Phase 3 | COMPLETE — source `b19f9dc5…`, artifact `9424397852`, browser/build/independent/local/host/deploy gates green; historical artifact never used |
| 4 | L1-UX08 beta-minimum unified Activity Center | `tasks/done/L1-UX08.md` + Goal Phase 4 | COMPLETE — production `c741455…`; Activity Center v0.1 + Source Recovery live; 46/46 real-browser journey green including multipart resume, real GitHub Compute suggestion, wrong-file fail-closed, mobile, stub-picker path, and zero residue |
| 5 | QA-GOLDEN01 | `tasks/done/QA-GOLDEN01.md` + Goal Phase 5 | COMPLETE — 32/32 exact-release golden journey on production `c741455…` with zero residue |
| 6 | INTERNAL_BETA_READY | `tasks/doing/GOAL-BETA-PREP01.md` | READY — STOP; the Owner decides whether/when to start or invite users into internal beta |

Goal Mode should move between these checkpoints autonomously when the changed-risk evidence is green. Routine implementation choices do not require another Owner round-trip. Early STOP conditions remain exactly those in GOAL-BETA-PREP01.

## RF-SEARCH01 preserved implementation state

RF-SEARCH01 remains behavior-frozen at exact candidate `7bba7b869fd1234c1e7c67002cb93368c299209b`. Ancestry verification corrected the earlier absence claim: Phase 2 source `1c3bb10…` already descended the candidate, so Search was visible even though the historical artifact was never reused. Phase 3 closed the sequence on exact source `b19f9dc5…` / new artifact `9424397852`; focused authority/ranking/pagination and pre/post-deploy production-browser gates are green.

## Completed operational and Compute work

| Task | Card | Result |
|---|---|---|
| OPS-STORAGE-INCIDENT01 | `tasks/done/OPS-STORAGE-INCIDENT01.md` | CLOSED after exact least-privilege/R3 repair and Owner-reported browser storage acceptance |
| OPS-STORAGE-APP-REPAIR01 | `tasks/done/OPS-STORAGE-APP-REPAIR01.md` | Historical runtime-contract repair and failed-closed artifact/rollback evidence preserved |
| OPS-STORAGE-HOTFIX01 | `tasks/done/OPS-STORAGE-HOTFIX01.md` | Historical production-baseline prerequisite; superseded live by R3 |
| OPS-METADATA-MEMORY01-DIAGNOSIS | `tasks/done/OPS-METADATA-MEMORY01-DIAGNOSIS.md` | Core stall classified as cgroup reclaim from in-process PDF/render/OCR working set |
| JOB-CORE01 | `tasks/done/JOB-CORE01.md` | Development migration 022 and durable job authority complete |
| COMPUTE-GHA01 | `tasks/done/COMPUTE-GHA01.md` | Provider-neutral boundary plus GitHub Actions adapter complete in development |
| OCR-METADATA-GHA01 | `tasks/done/OCR-METADATA-GHA01.md` | Existing bounded OCR/Metadata Suggestion migrated to asynchronous Compute in development |
| COMPUTE-GHA02 | `tasks/done/COMPUTE-GHA02.md` | Exact final Ubuntu run passed contracts, Compute, pinned Tesseract, real OCR, memory, leak, quoting, and zero-artifact gates; its two pre-cutover findings are preserved historically and resolved by COMPUTE-PRECUTOVER01 |

ADR-031 remains the authoritative combined architecture/security/cutover record. COMPUTE-PRECUTOVER01 reconciled the explicit GitHub-hosted `<768 MiB` peak contract while retaining local `<512 MiB`, `<64 MiB` drift, concurrency one, and clean-process isolation. GOAL-BETA-PREP01 Phase 2 consumed its bounded production authority successfully; one logical canary passed with zero workflow artifacts, unchanged canonical metadata, and no OSS/RAM/CORS/memory-limit/cost change.

## Reliability / usability queue — outside the beta-prep critical path unless explicitly used by Goal Mode

| Order | Task | Task card | Objective |
|---:|---|---|---|
| 1 | OPS-DEPENDENCY01 | `tasks/ready/OPS-DEPENDENCY01.md` | Owner-visible OSS/Core dependency health and safe diagnostics |
| 2 | ERR-BOUNDARY01 | `tasks/ready/ERR-BOUNDARY01.md` | Stable user errors + request correlation; no raw browser/provider exceptions |
| 3 | DOC-TRUTH01 | `tasks/ready/DOC-TRUTH01.md` | Prevent authoritative-state drift |
| 4 | RF-INTEGRITY01 | `tasks/ready/RF-INTEGRITY01.md` | DB↔storage inventory reconciliation and rolling fixity evidence |
| 5 | OPS-OBJECTBACKUP01 | `tasks/ready/OPS-OBJECTBACKUP01.md` | Independent second copy of authoritative object bytes; cost/provider gate |
| 6 | FE-DECOMP01 | `tasks/ready/FE-DECOMP01.md` | Behavior-preserving frontend orchestration decomposition |
| 7 | CONTRACT-CORE01 | `tasks/ready/CONTRACT-CORE01.md` | Shared API/error contract source without framework churn |

These cards are not implicitly authorized by GOAL-BETA-PREP01. In particular, paid/cost-bearing object backup, broad frontend decomposition, contract refactors, and unrelated reliability cleanup must not be pulled into the beta-prep program.

## Preserved personal research / pre-intelligence queue

```text
RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
→ RF-VIEWS01
→ RF-INTAKE01
→ RF-ANNOTATE01
→ RF-CITE01
→ RF-EVIDENCE01
→ RF-EXPORT01
→ RF-LIBRARY03
→ RF-LIBRARY04
→ RF-RECOVERY01
→ RF-AUTHMATRIX01
→ RF-DERIVED01
→ STOP BEFORE broader OCR/full-text/retrieval/RAG
```

None of this queue is authorized by GOAL-BETA-PREP01.

## Current release boundary

```text
DECLARED_PRODUCTION=17fb945220c44df71e4846a0ccd5f54e98f43858
PREVIOUS_PRODUCTION=3a88cfef7a4083ebe2a0277bd50b356e5fb86f46
PRODUCTION_SCHEMA=v25 / 001-025
MIGRATION_025_PRODUCTION_APPLIED=true
AUTOMATIC_ADMISSION_RELEASE_PENDING=false
DEVELOPMENT_SCHEMA=v25 / 001-025
MIGRATION_022_PRODUCTION_APPLIED=true
MIGRATION_023_PRODUCTION_APPLIED=true
MIGRATION_024_PRODUCTION_APPLIED=true

ARCH_COMPUTE01_PRODUCTION_CHANGED=true
ARCH_COMPUTE01_PRODUCTION_CREDENTIALS_CHANGED=true_least_scoped
ARCH_COMPUTE01_OSS_CHANGED=false
ARCH_COMPUTE01_SEARCH_INCLUDED_BY_ANCESTRY=true

SEARCH_HISTORICAL_SOURCE=7bba7b869fd1234c1e7c67002cb93368c299209b
SEARCH_PRODUCTION_SOURCE=b19f9dc5b48e1976127704712e08a8655b1fadd5
SEARCH_PRODUCTION=PASS
ACTIVITY_CENTER_V0_1=PASS
QA_GOLDEN01=PASS
INTERNAL_BETA_READY=false
INTERNAL_BETA_STARTED=false
LAYER1_COMPLETE=true
NEXT_ACTION=INCIDENT_L1_AI_PRODUCTION01_REAL_BROWSER_REPAIR

HOTFIX_META_UX01_STATE=SUPERSEDED_BY_017a47d_RETAINED_AS_ROLLBACK
HOTFIX_META_UX01_MIGRATION_CHANGE=none
HOTFIX_META_UX01_OSS_RAM_CORS_CREDENTIAL_COST_CHANGE=none
HOTFIX_META_UX01_OWNER_MANUAL_ACCEPTANCE=PENDING
```

The full storage hotfix/R3 artifact identities and hashes remain in `CURRENT_STATE.json` and the completed storage task cards.

## Goal Mode hard boundaries / early-stop rules

- Preserve historical COMPUTE-GHA02 evidence. Do not merely hide the 512 MiB variability; make any new GitHub-hosted memory contract provider-specific and evidence-backed.
- Preserve the builder's repository-`output/` safety boundary while repairing the protected job staging path.
- Production migration/deploy/canary is authorized only after Phase 1 green and only within the exact GOAL-BETA-PREP01 cutover contract.
- Do not repurpose a broad personal GitHub token for production. If a compliant least-scoped dispatch credential cannot be provisioned without Owner interaction, STOP at that exact credential gate.
- No paid infrastructure, no second server, and no cost-bearing object-backup work.
- Do not change `MemoryHigh`/`MemoryMax` merely to mask a Compute defect.
- Do not mutate OSS RAM/CORS/bucket policy unless a newly proven regression makes it strictly necessary; if so STOP for Owner review.
- Do not destructively/manual-edit existing pending uploads or object/part state.
- The worker returns candidates only; Core remains sole authority for result identity, persistence, Library scope, and canonical metadata application.
- Search must be recomposed on the latest baseline; do not deploy the historical Search artifact directly.
- Activity Center scope is beta-minimum only; do not turn it into a broad notification/task-history platform.
- Do not begin whole-document OCR product expansion, full-text indexing/search, embeddings, retrieval, RAG, Personal Research Workspace, or unrelated roadmap work.
- If production becomes unhealthy, stop new work and use the already-defined rollback path when rollback is clearly required for service/data safety.
- When all beta-prep gates are green, set `INTERNAL_BETA_READY=true`, reconcile durable state, checkpoint/push/synchronize where actually possible, then STOP before starting internal beta.
