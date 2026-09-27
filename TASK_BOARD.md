# AcademicCloud Task Board

**Last reconciled:** 2026-09-27. This board selects executable work; runtime identities live in CURRENT_STATUS.md and CURRENT_STATE.json.

## Current focus — reliable book intake

Continue the same active vNext task with the [reliable book intake plan](docs/architecture/reliable-book-intake.md). The source-error retry correction is locally verified (31 focused tests and Compute types); production Bridge is unchanged. Next establish durable upload-to-job handoff and resumable resource results, with an ADR and migration/rollback plan before implementation. Field-quality comparison follows an independent truth set. Do not introduce paid API calls or source disclosure while their scope remains unconfirmed. The reader milestone below is completed history, not a competing next task.

## Reader usability hotfix — deployed

Reader usability hotfix deployed 2026-09-25: exact Core/frontend 57b8723934446706440f7625fd02cd2262b4d712, schema/history39/001–039, no migrations/admissions/nginx/Compute changes. Core active/running PID1275345, zero restarts, readiness PASS; memory97,255,424 bytes is a cutover snapshot. Linux Node24.19.0/npm11.19.1 build/package PASS, 5164 manifest files, archive081338faae953d0f29e3de1946a93885a65ea2efd29075f80c680ec45e530068. Main/integration fast-forward published. Signed-in Codex IAB painted Mongolia Today page23/313 via new range transport; arrows23→24→23, focused reading, local-file controls and collapsed Library announcement visible. Library→Research restores active document. Local synthetic IAB additionally confirms ordinary local-file selection/render and390px no-overflow, PDF viewport top332px versus439px. Native directory picker/save/reuse was covered by tests but not end-to-end IAB; normal on-device permission is still user-selected. Authorization-renewal retention and progress CAS recovery have targeted tests; natural five-minute expiry is not claimed as live benchmark. No production note/highlight created for acceptance.

## Active task

Current reader milestone: ADR045 exactd58ef44 Core/frontend is deployed at schema39; one local Codex IAB smoke plus normal signed-in live PDF/Research paths passed. Compute7e unchanged. Additional prelaunch suites, separate artifact verification, migration backup and rollback preparation were skipped by explicit Owner instruction.


| Order | Task | State / next gate |
|---:|---|---|
| 1 | [ACADEMICCLOUD-VNEXT-REMEDIATION01](tasks/doing/ACADEMICCLOUD-VNEXT-REMEDIATION01.md) | PHASE B — owned-reader d58ef44 deployed/schema39 and normal signed-in IAB changed paths PASS. Reader checkpoint complete; remaining corpus/report work stays open, six damaged sources require replacement; OCR deferred |

The current reassessment charter and Owner's2026-09-09 start instruction supersede the earlier read-only gate and narrow review scope. The active task contains the ordered Phase B milestones. Necessary production/data/service changes and main integration remain authorized. No finding is production RESOLVED before deployment and appropriate live verification. Zero added infrastructure cost and zero new billable GitHub usage remain required.

Integration work continues in D:/Projects/AcademicCloud-vnext on codex/vnext-remediation-20260906. Preserved dirty original/review/staging trees are not replacement targets.

## Incorporated work and historical cards

These cards retain scope history and evidence. Old next-task, export-only or model-decision STOP text does not override active vNext remediation.

| Card | Current relationship |
|---|---|
| [Final stabilization / full corpus / zero-cost performance](tasks/doing/ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE.md) | Prior program incorporated into existing-product remediation; unresolved acceptance remains evidence |
| [Batch Catalog roundtrip V1](tasks/doing/ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1.md) | Integrated first-class implementation; ADR-041 evolves review/import/Apply |
| [Full-Library Batch Catalog](tasks/doing/ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG.md) | Historical 82-resource export and six source-replacement cases; recompute current data facts when needed |
| [Catalog corrections / D-drive cleanup](tasks/doing/ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP.md) | Prior fixes/evidence preserved; no broad cleanup implied |
| [GOAL-BETA-PREP01](tasks/doing/GOAL-BETA-PREP01.md) | Historical acceptance sequence; Internal Beta unstarted |

Completed substrate includes [L1-INTELLIGENT-LIBRARY01](tasks/done/L1-INTELLIGENT-LIBRARY01.md), [OPS-STORAGE-INCIDENT01](tasks/done/OPS-STORAGE-INCIDENT01.md), [COMPUTE-PRECUTOVER01](tasks/done/COMPUTE-PRECUTOVER01.md), [RF-SEARCH01](tasks/done/RF-SEARCH01.md), [L1-UX08](tasks/done/L1-UX08.md), and [QA-GOLDEN01](tasks/done/QA-GOLDEN01.md). Historical release success does not close current vNext acceptance.

## Parked reliability cards

| Task | Future purpose |
|---|---|
| [OPS-DEPENDENCY01](tasks/ready/OPS-DEPENDENCY01.md) | Dependency health and safe diagnostics |
| [ERR-BOUNDARY01](tasks/ready/ERR-BOUNDARY01.md) | Stable user errors and correlation |
| [DOC-TRUTH01](tasks/ready/DOC-TRUTH01.md) | Ongoing authoritative-state drift prevention |
| [RF-INTEGRITY01](tasks/ready/RF-INTEGRITY01.md) | Bounded integrity/reconciliation |
| [OPS-OBJECTBACKUP01](tasks/ready/OPS-OBJECTBACKUP01.md) | Object-byte recovery; separate cost/provider decision |
| [FE-DECOMP01](tasks/ready/FE-DECOMP01.md) | Behavior-preserving decomposition where justified |
| [CONTRACT-CORE01](tasks/ready/CONTRACT-CORE01.md) | Shared contracts where justified |

Concrete current defects in these areas can be repaired inside vNext. These cards do not authorize broad unrelated refactors or paid infrastructure.

## Parked scholarly sequence

RF-PROV01 → RF-LINEAGE01 → RF-STATS01 → RF-OVERLAY01 → RF-ORGANIZE01 → RF-VIEWS01 → RF-INTAKE01 → RF-ANNOTATE01 → RF-CITE01 → RF-EVIDENCE01 → RF-EXPORT01 → RF-LIBRARY03 → RF-LIBRARY04 → RF-RECOVERY01 → RF-AUTHMATRIX01 → RF-DERIVED01.

Detailed cards remain under tasks/ready as an inventory. The active Phase B milestones and [ROADMAP.md](ROADMAP.md) supersede this strict historical sequence, allowing source-safe private Workspace/Collections/Page Notes without first implementing every RF card. Internal Beta/invitations, paid infrastructure and premature whole-corpus OCR/RAG remain excluded.

## Completion rule

Finish actual product and engineering acceptance, reconcile exact source/runtime/data facts, and deliver the Owner-required final result. Missing authenticated browser access blocks only dependent live workflows; continue independent work. Synthetic fixtures, SSH or direct database writes do not substitute for normal signed-in acceptance.
