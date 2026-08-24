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

## Relevant Modules / Files

- `frontend/src`, `backend/src`, `compute/src`, `compute-contracts/src`
- `.github/workflows`, `database/migrations`, `scripts`
- `AGENTS.md`, `CURRENT_STATE.json`, `CURRENT_STATUS.md`, `TASK_BOARD.md`,
  `ROADMAP.md`, `DECISION_LOG.md`

## Current State

Owner-authorized on 2026-08-24. Local and remote authoritative branch
`codex/project-memory-reconcile-20260817` both point to
`816f9154c58d560399e527823ea9d16ec87afa1a`. Pre-existing untracked
`%SystemDrive%/` and `scratch/` are preserved. Production is exact frontend/Core
`17fb945220c44df71e4846a0ccd5f54e98f43858`, schema v25/history 001–025,
active/running with `NRestarts=0`, health/readiness 200, SQLite integrity `ok`,
and FK violations 0. Current-generation whole-product/full-corpus acceptance
has not begun, so incident OPEN, production acceptance FAIL, performance and
corpus acceptance PENDING, and Internal Beta readiness false are authoritative.

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
- Verified local HEAD, exact remote HEAD, branch, preserved dirty roots, and
  historical task/release state.
- Verified all 12 Owner sources exist and recorded exact size/SHA-256 identity.
- Ran the established read-only production audit and a focused service probe.
- Re-established live release, service, health/readiness, schema/history,
  SQLite integrity, and foreign-key baseline facts.
- Reconciled the active program into authoritative recovery documents.

## Remaining

- Commit and publish the planning/state reconciliation, then verify local/remote
  equality without touching preserved untracked roots.
- Inventory all deployed features/routes, request/query shapes, production
  AI-eligible resources, exact duplicate identities, and GitHub cost/quota facts.
- Establish privacy-safe production performance baselines.
- Repair AI state semantics and all real-material failures.
- Implement only measured, safe, material zero-cost performance improvements.
- Qualify/deploy exact releases and retry the same affected resources.
- Freeze implementation; run whole-product regression and final full-corpus
  clean sweep; reconcile final cost and acceptance evidence.

## Blockers

None at recovery. Additional monetary cost, unavailable required permission,
irreversible real-data risk, or a proven privacy/security authority conflict
remains a mandatory hard stop if encountered.

## Last Verification

2026-08-24: local and remote HEAD both `816f915…`; 12/12 Owner PDFs available
with exact hashes; production release `17fb945…`; service active/running,
`NRestarts=0`, loopback/public health/readiness 200; schema 25/history 001–025;
SQLite integrity `ok`; FK violations 0. General readiness baseline: 37 PASS,
4 FAIL, 3 WARN, 11 UNKNOWN, 3 INFO; failures require bounded classification and
must not be misreported as final acceptance.

## Next Action

Review and checkpoint this durable reconciliation, publish it to the authorized
non-main branch, verify local/remote equality, then inventory deployed features,
the production AI corpus, exact Owner-source duplicates, and zero-cost/billing
constraints before any large hosted-compute wave.
