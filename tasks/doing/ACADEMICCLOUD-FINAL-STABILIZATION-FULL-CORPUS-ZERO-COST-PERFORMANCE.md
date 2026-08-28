# AcademicCloud Final Stabilization / Full Corpus / Zero-Cost Performance

## Task ID

`ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE`

## Goal

Make every currently implemented AcademicCloud path correct and stable; make
all available Owner-supplied relevant materials and all AI-eligible production
Library materials pass the real product AI path; remove every material safe
zero-cost structural performance bottleneck; and finish with a frozen
full-corpus clean sweep plus whole-product production regression without routine
Owner interaction.

## Scope

- Reopen `INCIDENT-L1-AI-PRODUCTION01` and revoke stale whole-product acceptance
  and Internal Beta readiness until the final contract passes.
- Inventory deployed user-visible functions, request/query shapes, privacy-safe
  stage timings, production AI-eligible resources, and all 12 available Owner
  PDF sources.
- Repair unambiguous current-generation AI state in Resource Details and
  Activity Center while preserving normal human-over-AI field authority.
- Diagnose each real-material failure at its first boundary and repair the
  smallest shared cause through the normal domain path.
- Optimize existing Activity, refresh/invalidation, SQLite Search, upload
  hashing/multipart, frontend delivery/rendering, citation, Compute
  qualification/identity/runtime, PDF range access, page selection, bounded OCR
  concurrency, and worker lifecycle only where measured benefit justifies risk.
- Build exact artifacts, qualify, deploy, retry, benchmark, and record evidence
  autonomously within existing credentials, providers, and cost.

## Non-goals

- Internal Beta, invitations, or account onboarding.
- New Layer 2/3/4 capabilities, whole-document OCR/indexing/search, embeddings,
  retrieval, RAG, or unrelated broad refactors.
- PostgreSQL, Redis, Elastic, new servers, GPU instances, paid OCR/LLM/API/CDN,
  new object-storage products, new monitoring services, or billable GitHub use.
- Weakening checksums, SQLite integrity/durability, server authority, privacy,
  CSP/security policy, human metadata authority, or Core/Compute isolation.
- Direct SQL fabrication of Library resources/jobs, mutation of source objects,
  or deployment of artifact `9405764771` / source `8d289702…`.

## Acceptance Criteria

- All current critical user-visible paths are inventoried and production
  regression ends with zero functional/security/authority/storage regressions.
- AI UI state distinguishes not-run, queued, running, failed, filename-only,
  extraction-only, genuine reviewable success, and applied success; stale or
  filename suggestions never hide current generation state.
- The authoritative manifest contains all available Owner sources plus every
  AI-eligible production Library resource, deduplicated only by exact durable or
  immutable source identity.
- After the last implementation change, the frozen final sweep has total equal
  to succeeded, with zero failed, stuck, false-reviewable, state mismatch, or
  duplicate active/effective/result application.
- Every materially changed performance path has comparable before/after
  measurements, zero functional/security/authority/data/stability regression,
  and explicit remaining-bottleneck disposition.
- Exact frontend/Core/Compute identity, release qualification, bounded provider
  concurrency, schema/history, integrity/FK, rollback, health/readiness, and UI
  projection gates pass.
- Source bytes and OSS identity remain unchanged; human-authoritative fields
  have zero silent overwrite.
- New monthly and one-time infrastructure cost are RMB 0; no paid service,
  external paid AI, or new billable GitHub usage is used.
- Only after all gates pass may the incident close, production user acceptance
  return to PASS, and Internal Beta readiness return to true.

## Relevant ADRs

- ADR-014, ADR-022: shared Library and private research boundaries.
- ADR-023: durable decision reconciliation and local/remote synchronization.
- ADR-031: Core/Compute authority, isolation, job, and callback boundaries.
- ADR-032: bibliographic domain and human field authority.
- ADR-033: exact ephemeral PP-OCRv6-small → Qwen3-1.7B Compute pipeline.
- ADR-034: authorization-first catalogue Search/filter/display.
- ADR-035: deterministic exact-pinned citation projection.
- ADR-036: automatic admission jobs, generation priority, and exactly-once
  effective claim.
- ADR-037: Local Pull worker as the normal production Compute control plane.

## Relevant Modules / Files

- `frontend/src`, `backend/src`, `compute/src`, `compute-contracts/src`
- `.github/workflows`, `database/migrations`, `scripts`
- `AGENTS.md`, `CURRENT_STATE.json`, `CURRENT_STATUS.md`, `TASK_BOARD.md`,
  `ROADMAP.md`, `DECISION_LOG.md`

## Current State

Owner-authorized on 2026-08-24 and continued by the
`ACADEMICCLOUD-FINAL-STABILIZATION-LOCAL-COMPUTE-PIVOT` Owner override. This is
not a new task: it changes only the next Compute architecture/execution
strategy. The authoritative branch is
`codex/project-memory-reconcile-20260817`. The shared fixes, privacy-safe
inventory tool, ADR-037, reboot gate, and WSL-on-D foundation were pushed and
independently verified at local/remote HEAD
`e8285cdb585ccf2953e2d259ac199bfd2d66dc71`. The runtime/protocol checkpoint
`71a30e6` and the Owner-review repair checkpoint
`d1bddb6d7bd6e66d0ed52586c17dd51afd358d99` are now pushed and remotely
verified. Local Pull production cutover and a real structured Qwen canary then
passed. The evidence-quality v2 checkpoint
`6c71ac94c60d49e65e7eca59305b59ba6e461167` is pushed, deployed, and remotely
verified at schema v27. Canonical-bibliography UI, work-versus-manifestation
classification, and migration 028 are deployed at exact
`5d4fddd542d352b2570d01feebda14c871be1d04` after the fresh encrypted/off-host
schema-v27 backup gate passed. The first post-deploy real UI attempt proved the
record projection but did not create an actual v3 inference because a prior v2
succeeded job shared the same durable idempotency identity. Exact pushed repair
`cee8decbf45d13e13818368323b12b01e3de04d3` binds admission to the bibliography
pipeline generation; its new immutable releases and real v3 canary remain pending.
Pre-existing untracked `%SystemDrive%/` and `scratch/` remain untouched.
Production is exact frontend/Core
`5d4fddd542d352b2570d01feebda14c871be1d04`, schema v28/history 001–028 with
`local_pull`; the exact current Compute symlink is also `5d4fddd…`. Its systemd
service is `disabled`/`inactive`, the environment is `PAUSED`, and no job was
claimed during the UI diagnosis. No new
GitHub-hosted production Compute probe was launched after the override.

Current acceptance inventory is 12 Owner PDFs plus 93 production-eligible PDFs,
with zero exact production duplicate among the 12 and a current unique manifest
of 105. The baseline raw job projection is 41 not run, 43 failed, and 9
succeeded. These are pre-cutover inventory facts, not acceptance. GitHub Actions
has used 1,701 of 2,000 included hosted minutes; Actions budget is USD 0 with
stop-usage enabled. Remaining minutes are not authorized for routine production
documents or the final corpus.

ADR-037 makes `CORE_PULL_WORKER` the target production control plane and Local
Pull the primary provider. GitHub Actions remains a provider-neutral CI,
qualification, and separately authorized emergency implementation, but is
disabled for normal production AI. The local Windows machine remains a
disposable outbound-only Compute executor; its absence must leave AI jobs
queued/recoverable and every non-AI Core path available. WSL2/CUDA/Paddle/Qwen
and the Local Pull protocol now pass in production. Migration 028 and the
encrypted off-host schema-v27 backup gate have passed. No worker NORMAL
transition occurs until a new exact `cee8dec…` release and isolated one-shot
actual-v3 canonical UI canary pass.

Pre-WSL/reboot recovery gates at this checkpoint:

```text
CURRENT_WORK_CHECKPOINTED=true
CURRENT_WORK_PUSHED=true
REMOTE_HEAD_CONFIRMED=true
DURABLE_NEXT_STEP_RECORDED=true
OWNER_SOURCES_STAGED_ON_D=true
OWNER_SOURCE_COPY_SHA256_VERIFIED=true
```

The 12 exact files were copied without renaming to
`D:\AcademicCloudCompute\staging\acceptance-sources`. The target contains 12
files and 199,835,281 bytes; every target length and SHA-256 matches the locked
manifest below. The source files remain untouched.

Owner source inventory (all available; `OWNER_SOURCE_UNAVAILABLE=0`):

| Bytes | SHA-256 | Source |
|---:|---|---|
| 7,593,279 | `8e2bde628318482794b8d2ed20557193d5771615cceec83de334fe3a46166cd4` | 蚕食与鲸吞 俄罗斯侵华史话…pdf |
| 25,350,928 | `c1fb9bb6fde505bf278febfb8605f56d62f272b544c9c647e85fc13a7118d8b9` | Mongolia：A Country Study (1).pdf |
| 8,067,824 | `e70115ac11b8ccef2b519ad707d6c915c967262b9475d77d4301aab5ff22836c` | Mongolia：politics, economics and society .pdf |
| 4,227,867 | `d4cb1b38c5e7a6bee20a8be8a15c2ec59f74839c2dc049e75641496258a8a09e` | Mongolia Between China and the USSR .pdf |
| 11,277,265 | `92501ffe66fc1dfe8c487eb68fc25c472b2a142f8753756e6ee18fc1778fcb62` | Mongolia：Unknown Land .pdf |
| 66,260,708 | `8625080f8f86586be2e78b76e2979b282dfd9cb87bbaca4cdb467dc1d12f5a45` | 葛兆光：到后台看历史卸妆 .pdf |
| 15,128,023 | `a2353f77c418861d4c8b0fd6d479d5a5d65dce3690ded123560fbdc1c7050afc` | Mongolia Today：Science, Culture, Environment and Development .pdf |
| 7,160,477 | `3aeee91ca2c983dadc9e142a9fa671cacf64433f08cbd49723f0122be9b5e63c` | Venice and the Mongols：The Eurasian Exchange That Transformed the Medieval World .pdf |
| 15,973,028 | `ae92f085e38fa86dd8e8e48d69ca65183992542f6c2c9c05c3468fadaf8d2c64` | От средневековых татар к татарам нового времени .pdf |
| 13,581,854 | `0c617e1392b80818e658da704845fbc640338501702567e0d47eb1dec4e6022b` | Ярмарки в Западной Сибири…pdf |
| 9,401,249 | `27076422443490783b2753780a53b614166734167fc8cf5d87d9ce8720f3ee95` | Географические открытия Земли - история и перспективы .pdf |
| 15,812,779 | `f5ee3b1b8628a189f1b06cfd23edc3f0bc34621c793996c4fb9f23c4449a8bf1` | Тангутско-Тибетская окраина Китая…1884-1886…pdf |

## Completed

- Fully read the Owner execution contract and repository workflow.
- Fully read and reconciled the Local Compute pivot without restarting or
  discarding the existing investigation.
- Verified local HEAD, exact remote HEAD, branch, preserved dirty roots, and
  historical task/release state.
- Verified all 12 Owner sources exist and recorded exact size/SHA-256 identity.
- Ran the established read-only production audit and a focused service probe.
- Re-established live release, service, health/readiness, schema/history,
  SQLite integrity, and foreign-key baseline facts.
- Reconciled the active program into authoritative recovery documents.
- Completed three reviewable local code checkpoints:
  - `a4a1c4b`: eight-state current-generation AI semantics, exact immutable AI
    evidence binding, batch latest-state API, and Activity/Details N+1 removal;
  - `1497bec`: bounded SQLite batch metadata/bibliography/authority hydration
    for Library listing and Search; and
  - `c9ab369`: privacy-safe Compute stage/error classification and fact-level
    invalid-result handling without source/model text disclosure.
- Passed backend typecheck and 371/371 tests, frontend typecheck and 283/283
  tests, Compute typecheck and 68 passing plus 2 expected runtime skips, full
  workspace build, and `git diff --check` for those checkpoints.
- Retained a privacy-safe read-only production inventory script and aligned its
  reviewable-AI projection with exact immutable `scholarly_bibliographic_ai_runs`
  evidence rather than candidate-source inference.
- Pushed the three code checkpoints, inventory tool, and ADR-037 reconciliation;
  independently verified local and remote HEAD equality at `5911954…`.
- Preserved all 12 exact Owner sources on D outside Git and passed 12/12 target
  length/SHA-256 verification with no rename or source mutation.
- Completed read-only host preflight: Windows 11 Home x64 build 26200, Ryzen 9
  7945HX 16C/32T, 16.84 GB RAM, firmware virtualization enabled, Hypervisor
  present, RTX 4060 Laptop GPU 8,188 MiB / driver 572.83, C free 15.55 GB, D
  free 113.55 GB, Windows Node v24.16.0, and Git 2.55.0.
- Confirmed WSL is absent and both feature inspection and installation require
  elevation. No Windows optional feature, default distribution, or C-drive WSL
  state was created.
- Recovered after the Owner's UAC/reboot action and reverified repository HEAD,
  12/12 files, 199,835,281 bytes, and every staging SHA-256.
- Installed the sole `AcademicCloudCompute` Ubuntu 24.04.4 distribution as WSL2
  at `D:\AcademicCloudCompute\wsl\AcademicCloudCompute`; registry BasePath and
  the 80 GB sparse `ext4.vhdx` are on D and registered C-drive distros are zero.
- Provisioned reproducible base scripts, systemd, the non-root `academiccloud`
  user, and secure worker state/temp/log directories. The Normal envelope is
  8 processors, about 8 GB RAM, and 4 GB sparse swap explicitly on D; no default
  C-drive swap exists.
- Passed initial GPU visibility: `/dev/dxg`, WSL `libcuda.so.1`, and RTX 4060
  driver 572.83 / 8,188 MiB / compute capability 8.9 are visible. This was the
  visibility-only gate before the execution qualifications below.
- Installed exact Linux Node 24.16.0 in the D-drive distro and preserved its
  official archive SHA-256 `d804845d…de6c9`.
- Installed CUDA toolkit 12.8.2 without a Linux display driver and passed an
  actual `sm_89` kernel; the package inventory SHA-256 is `b74a97dc…33696e`.
- Qualified Paddle 3.3.1/PaddleOCR 3.7.0 and exact PP-OCRv6 small models on CPU
  and GPU. Generated-page OCR was exact at confidence 100; CPU requests were
  820/782/750 ms at 648 MiB peak RSS, while GPU requests were 645/41/36 ms at
  1,658 MiB peak RSS and 318 MiB VRAM delta. A sanitized production-child
  repeat passed at 690/47 ms and 1,850 MiB peak RSS.
- Downloaded and hash-verified Qwen3-1.7B Q8_0 (`061b54da…cb1a`) and exact
  llama.cpp source `b10218` / `de699957b92f490efebad149665b0dccf127eaff`.
  Rejected the first otherwise correct binary because its build downloaded an
  unpinned Web UI; rebuilt with curl/NCCL/UI downloads disabled. The accepted
  CUDA `sm_89` llama-server SHA-256 is `ddfde527…c5c30`.
- Qualified Qwen CPU versus CUDA on the same generated bibliographic contract.
  CPU startup was 1,823 ms and requests 944/766 ms at about 23.75 predicted
  tokens/s and 3,000 MiB peak RSS. CUDA startup was 1,016 ms and requests
  174/154 ms at 115–121 tokens/s, 2,060 MiB peak RSS, and 4,387 MiB peak total
  VRAM. The representative bibliographic gate passed 7/7; the selected release
  setting is `BIBLIOGRAPHY_LLAMA_GPU_LAYERS=999`.
- Implemented migration 026 and the outbound-only Local Pull worker: durable
  provider receipt, atomic one-worker claim, 90-second renewable lease,
  30-second heartbeat, attempt-generation recovery, late-result rejection,
  idempotent duplicate success, separate machine/result credentials, and
  NORMAL/PAUSED/BURST concurrency-one controls. The legacy claim endpoint
  cannot bypass a Local lease.
- Added the immutable local release assembler, inventory verifier, guarded
  atomic activation, protected systemd unit, and secret-free environment
  template. Backend typecheck and 373/373 tests pass; Compute focused Local
  Pull/worker tests, full Compute 71 passing plus 2 expected local-runtime
  skips, Compute contracts 2/2, all-workspace typecheck/build, and diff check
  pass.
- Closed the Owner's pre-corpus code-review gates at exact pushed checkpoint
  `d1bddb6`: script-neutral native PDF text with multilingual and real
  Russian/Mongolistic PDF coverage; exact-attempt source authorization renewal;
  bounded/cancellable pull, heartbeat, source, renewal, and callback I/O;
  concurrency-one lazy warm Paddle/Qwen reuse with failure invalidation,
  five-minute idle unload, PAUSED cold state, and shutdown cleanup; and a
  rollback-capable 15-second structured systemd activation stability gate.
- Independently reviewed the repaired boundaries and further capped stuck
  heartbeat I/O by the remaining lease. The exact tree passes Backend 374/374,
  Frontend 283/283, Compute 81/81 plus 2 expected Windows runtime skips,
  Compute contracts 2/2, all-workspace typecheck/build, migration-v26 coverage,
  compiled acceptance with 26 first-run migrations and zero redeploy migrations,
  WSL Bash syntax, `CURRENT_STATE.json` parsing, and `git diff --check`.
- Deployed exact Core `f658fdc2835a4ac63fb02ab7b005aa9f108f5292`
  at schema v26 with `local_pull`; activated exact Local Compute release
  `120ae02adbd8a6c53771f0bab22d09c49c247add` and kept the main worker PAUSED.
  A normal-product 40,421,440-byte canary completed Qwen structured inference,
  callback, and current-attempt persistence under the strict AI-success gate.
- Repaired the newly observed corrupt-evidence path at exact pushed checkpoint
  `6c71ac94c60d49e65e7eca59305b59ba6e461167`: script-neutral evidence
  usability, low-confidence short OCR protection, embedded-metadata sanity and
  corroboration, raw bounded provenance retention, v2 candidate/Qwen versions,
  version-bound job idempotency, and append-only migration 027. Regression
  fixtures withhold OCR `ず之` and embedded author `亦郊真` while admitting
  legitimate Japanese, Mongolian, Cyrillic, Arabic/Persian, Tibetan, and Poppe
  transliteration. Backend 376/376, Frontend 283/283, Compute 93/93 plus two
  expected release-runtime skips, contracts 2/2, typecheck/build, compiled
  acceptance (27 initial migrations, zero redeploy), OSS contract, integrity,
  foreign keys, v1 preservation, and v2 admission pass.
- Deployed exact Core/frontend `6c71ac9…` at schema v27 and exact Compute
  `fdc0c2d…`; the real quality canary completed Paddle/Qwen, structured-result
  validation, callback, and current-attempt persistence without the reported
  corrupt OCR/embedded-metadata candidates. The worker service is now
  intentionally inactive after a WSL cold start and has not claimed the three
  queued benchmark jobs.
- Audited the Qwen structured result → bibliography run → canonical projection
  → Resource Details chain. Implemented a primary `AI 建议书目记录`, complete
  sparse Book fields with explicit unrecognized values, secondary expandable
  field provenance, and collapsed candidate/conflict review while preserving
  human authority.
- Amended the shared catalogue projection so positively classified modern
  scholarship renders `author + title`, historical/primary sources render
  `title + supported version`, and unknown/other/unprofiled records never use a
  person field to guess authorship. Authorized download filenames reuse that
  projection plus only the safe original extension; original filename and
  `objectKey` remain unchanged.
- Added work-versus-manifestation Qwen ruleset/prompt v3 and append-only
  migration 028. Modern publisher/date/ISBN/person presence no longer implies
  a modern scholarly work or author role; unknown classification cannot
  auto-apply. Migration tests preserve immutable v1/v2 evidence and admit only
  exact v3 provenance.
- Current local verification passes Backend 379/379, Frontend 284/284, Compute
  96/96 plus two expected release-runtime skips, Compute contracts 2/2, full
  workspace typecheck/build, compiled acceptance with 28 first-run migrations
  and zero redeploy migrations, SQLite integrity/FK, and `git diff --check`.
- Published and independently re-read the exact four-item encrypted schema-v27
  backup set to the private off-host repository at commit `c750648…`, with
  exact parent preservation, non-force CAS, per-blob size/SHA-256 verification,
  and `plaintextPublished=false`; only then migrated production to schema v28.
- Deployed and verified exact Core/frontend `5d4fddd…` at schema/history 28 and
  selected exact Compute `5d4fddd…` while preserving `disabled`/`inactive` and
  `PAUSED`. Core health/readiness, SQLite integrity, and foreign keys passed.
- The first real post-deploy 《元朝秘史》 UI attempt proved the complete AI
  record projection but reused the old v2 success, so it could not qualify v3
  material classification. Root cause was a durable idempotency key that bound
  extraction v2 but not the Qwen bibliography pipeline generation.
- Repaired that boundary at exact pushed checkpoint `cee8decbf45d13e13818368323b12b01e3de04d3`.
  A same-source previous-generation success now creates a new v3 job. Linux
  verification passes Backend 380/380, Compute 96/96 plus two expected runtime
  skips, contracts 2/2, workspace typecheck/build, compiled acceptance with 28
  initial migrations and zero redeploy migrations, and diff checks.
- Deployed exact Core/Compute `2c0ebd26377ceb98a13a320753796451fc7e503e`
  at schema/history 28 with the main worker still disabled/inactive/PAUSED.
  After the queue became target-only, one hardened isolated iteration claimed
  only job `2cbd2690-26cf-4924-a254-64bec2fd4484` attempt
  `6edae59d-e421-45aa-8d0d-c8ae6c4d60c8`. It completed Qwen structured
  inference, callback, and current-attempt persistence in 61,581 ms; the main
  worker remained stopped. The browser UI proved the primary structured record
  and strict AI-success semantics, then exposed a real classification failure:
  modern scholarly monograph 《明朝佛教史论稿》 was labeled modern primary-source
  edition and displayed as `明朝佛教史论稿 宗教文化出版社2016.11`.
- Repaired that bounded defect at exact pushed checkpoint
  `cdb99869607231ebb39c1b47d234100077ced5b8`. Ruleset v4 deterministically
  classifies an evidenced modern publication with a clearly analytical title as
  scholarly, after higher-priority explicit primary/traditional edition gates;
  it does not infer a missing author from the filename. Append-only migration
  029 admits v4 while preserving immutable v1-v3 evidence and prompt v1-v3.
  Verification passes contracts 3/3, Compute 99/99 plus two expected
  release-runtime skips, Backend 380/380, Frontend 284/284, workspace
  typecheck/build, compiled acceptance with 29 initial migrations and zero
  redeploy migrations, and diff checks.
- Deployed subsequent exact v4/v5/v6 releases through schema/history 29–31
  after fresh encrypted off-host gates. Live read-only reconciliation confirms
  exact Core/frontend and selected Compute `fd97542…`, Core health/readiness
  green, SQLite integrity `ok`, foreign keys zero, Local Compute
  disabled/inactive/PAUSED, and no active Local Pull job. No v6 final product
  canary was executed.
- Owner FINAL ARCHITECTURE CORRECTION accepted ADR-038 after all four reported
  blockers were reproduced in current code: second-classifier title/inspection
  heuristics, false single-page fact provenance, blocked first contributor
  enrichment on empty unowned profiles, and repeated evidence-table rebuilds
  for ruleset admission.

## Remaining

- Implement final ruleset v7/prompt-v4: Qwen-proposed class with positive,
  page-bound trusted-runtime validation; exact value-supported per-field
  provenance with no one-page synthesis; and fail-closed omission/ambiguity for
  unsupported facts.
- Repair existing-profile contributor enrichment without weakening any human
  contributor authority or exact AI authority/provenance binding.
- Add the one final append-only schema32 migration with an immutable composite
  ruleset registry preserving v1–v6 and admitting v7 without future evidence-
  table rebuilds; keep unknown/unregistered identities fail-closed.
- Pass full backend/frontend/Compute/contracts tests, typecheck/build/compiled
  acceptance, assemble exact immutable Core/Compute releases, and complete a
  fresh encrypted/off-host schema31 gate before schema32 cutover.
- Keep the main worker disabled/inactive and `PAUSED` through three isolated
  real canaries: modern scholarly monograph, historical/primary-source modern
  edition, and OCR-needed multilingual resource. Verify class support, every
  fact's provenance, no hallucination, display, human authority, callback,
  current attempt, API, and UI.
- After the three canaries pass, prove forced-loss/lease recovery, then place
  the exact worker in NORMAL, enabled/active, concurrency one.
- Pass the ordinary signed-in Owner website gate for both new-upload automatic
  cataloguing and existing-resource retry, including queue/running/success,
  refresh/relogin persistence, failure/retry UX, object-key preservation, and
  display/download projection. No SSH/manual job/DB/internal/one-shot path may
  satisfy this gate; offline Local Compute must remain visibly queued and
  resume automatically.
- Classify the root-disk, CSP, and systemd-metric audit findings by evidence.
- Implement only measured, safe, material zero-cost performance improvements.
- Qualify/deploy exact Core/frontend/Local Compute releases, retry the same
  affected resources, and compare local versus historical hosted stage timings.
- Freeze implementation; run whole-product regression and final full-corpus
  clean sweep; reconcile final cost and acceptance evidence.

## Blockers

None. The one UAC/reboot boundary is complete. Additional monetary cost,
irreversible real-data risk, or a proven privacy/security authority conflict
remains a mandatory hard stop.

## Last Verification

2026-08-28 live reconciliation: production Core/frontend and selected Compute
are exact `fd97542…` at schema/history 31. Core service, health/readiness,
SQLite integrity, and foreign keys are green. Local Compute is exact
`fd97542…`, `PAUSED`, disabled, inactive, and the Local Pull active queue is
empty. P0-A, P0-B, P1-C, and P1-D all reproduce from current source/migrations;
ADR-038 is accepted. No v6 final canary, NORMAL transition, forced-loss, corpus
run, GitHub-hosted production Compute, or paid service was used.

## Next Action

Implement ADR-038 final v7/prompt-v4 plus schema32 registry with failure-first
regressions for class support, single-page value provenance, hallucinated
author/edition/language, first contributor enrichment, immutable history, and
unknown ruleset rejection. Keep production fd97542/schema31 healthy and the
main worker PAUSED/disabled/inactive. Do not run v6 canary, NORMAL, forced-loss,
or corpus execution before the corrected exact release and three isolated
canaries pass.
