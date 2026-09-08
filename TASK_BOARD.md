# AcademicCloud Task Board

**Last reconciled:** 2026-09-09. This board selects executable work; runtime identities live in CURRENT_STATUS.md and CURRENT_STATE.json.

## Active task

| Order | Task | State / next gate |
|---:|---|---|
| 1 | [ACADEMICCLOUD-VNEXT-REMEDIATION01](tasks/doing/ACADEMICCLOUD-VNEXT-REMEDIATION01.md) | ACTIVE — Core6972b21 and Bridgeba0a deployed; schema036, main integration and CI green; finish real Catalog Apply, whole-product browser verification and necessary Compute qualification |

The Owner's 2026-09-06 instruction authorizes remediation of the accepted review and real newly found defects, including necessary production/data/service changes and main integration. Use existing authority without repeated approval requests. No finding is production RESOLVED before deployment and appropriate live verification. Zero added infrastructure cost and zero new billable GitHub usage remain required.

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

Detailed cards remain under tasks/ready; [ROADMAP.md](ROADMAP.md) defines durable sequencing. Do not start Internal Beta/invitations, this feature queue, whole-document OCR, full-text indexing, embeddings or RAG from remediation.

## Completion rule

Finish actual product and engineering acceptance, reconcile exact source/runtime/data facts, and deliver the Owner-required final result. Missing authenticated browser access blocks only dependent live workflows; continue independent work. Synthetic fixtures, SSH or direct database writes do not substitute for normal signed-in acceptance.
