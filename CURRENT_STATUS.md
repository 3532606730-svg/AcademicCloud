# AcademicCloud Current Status

**Last reconciled:** 2026-09-07. This file records current project truth; CURRENT_STATE.json is the compact machine-readable pointer. Historical releases and incidents remain in task cards, ADRs and Git.

## Active work and authority

[ACADEMICCLOUD-VNEXT-REMEDIATION01](tasks/doing/ACADEMICCLOUD-VNEXT-REMEDIATION01.md) is the sole active execution task. The Owner accepted the 360 review and authorized full remediation, integration, commits/push/main merge, deployment/migrations/admissions, necessary service/Compute operations, real Catalog Apply and justified data correction. Earlier review-only, export-only and model-decision stop lines are superseded within this scope.

The objective is a coherent, trustworthy existing product on zero-added-cost infrastructure. Stable identities, source associations, original bytes unless intentionally corrected, authorization and private overlays remain protected. Internal Beta, unrelated research features, whole-document OCR/indexing and RAG remain outside scope.

## Source and worktree state

Integration source is codex/vnext-remediation-20260906 at D:/Projects/AcademicCloud-vnext, based on exact Batch Catalog commit eb03dbd2fff86d4925193e7f7de69e30336e9993. Batch Catalog is a first-class remediation target. Relevant prior review fixes and meaningful existing branch work are integrated locally.

The original codex/project-memory-reconcile-20260817 checkout retains its ten tracked dirty files and 630 untracked files; review and staging trees remain preserved. Integration changes and ignored output/vnext verification artifacts are separate. No task commit, push, main integration or deployment has occurred at this checkpoint. Local/remote synchronization is not yet claimed.

## Implementation and verification

Local implementation covers accepted R01–R16 and additional concrete defects:

- One database initializer validates runtime admissions and readiness. Migrations 035–036 add derived search state and durable contributor-collection authority.
- SQL selects/ranks/sorts/pages authorized Library search results before bounded hydration. Multilingual equivalence, authorization, dirty-state handling and 100/1,000/10,000 search comparisons pass.
- Catalog v2 exposes allowlisted set/clear/preserve changes, every proposed field and human/evidence acknowledgements. Actor/Library-bound immutable plans, per-item CAS, collision checks and retry replay keep Preview and Apply consistent. Confidence does not confer authority; UNKNOWN cannot apply without an explicit corrected proposal.
- Contributor identities/authority links survive Catalog changes, and a deliberately cleared or replaced human contributor list stays protected from later AI retries.
- Library stale-response handling, export progress isolation, filename provenance, responsive review/details/editor paths, reading/history context and translated authority labels are repaired.
- nginx limits are explicit per route; strict npm 11.19.1 installation and permanent regression CI replace fragile install/temporary-workflow assumptions.

The last complete local CI run passed backend **426/426**, frontend **321/321**, contracts **3/3**, Compute **150 passed / 1 skipped**, and operations **79/79**. A subsequent focused frontend run passed **34/34**, including the new partial-retry result preservation regression. All workspace typechecks/build pass. Compiled acceptance passes fresh schema 036, runtime v11 readiness and idempotent reinitialization (zero additional migrations/admissions). Strict clean installation passes; production dependency audit reports zero vulnerabilities.

Actual local browser evaluation uses isolated synthetic fixtures: six responsive widths, Library/search/reading/details/editor and Catalog review/acknowledgement/partial-Apply paths. It is not evidence of real production Apply. Remaining comparative benchmarks and browser coverage continue. No production-relevant finding is marked RESOLVED merely from local results.

## Last observed production

Read-only observation on 2026-09-06, before this task's deployment:

| Component | Observed state |
|---|---|
| Core/frontend release | 196c9c5ee7ed60c6a261df5eef65f32cccaff639 |
| Service / health / readiness | Active, zero restarts; healthy / ready |
| Database | Schema head 34, history 001–034; SQLite integrity OK, zero FK violations |
| Ruleset admissions | Eleven entries, including exact v11/prompt-v7 |
| Catalog Bridge | e261d11bda258da489561a4eba6155020f19301f; active in AcademicCloudComputeV2, loopback health OK |
| Main inference worker | Service absent/inactive; automatic-cataloguing acceptance remains open |
| vNext migration/release | Not deployed |

Historical NuExtract3 offline qualification and production B passed. Two distinct real multilingual C jobs failed closed at bibliographic_reasoning/canonical_schema_invalid, with no false success or canonical promotion. Current authorization permits capability repair; an unqualified worker must not be presented as accepted.

## Remaining work and blockers

Finish remaining targeted benchmarks/browser coverage and review, publish the integrated checkpoint, pass remote CI, integrate main and deploy an exact qualified release with migrations 035–036 and repository nginx. Then verify real authenticated Catalog export/import/Preview/Apply, data changes, Search, resource reading/details and any corrected Compute behavior.

The browser lacks a signed-in production session. Credential/session access is the external blocker for authenticated live verification; it does not block independent implementation, publication, deployment or public health checks. Production mutations and real-data/OSS changes performed by this task: **none yet**.

## Historical evidence

- [Final stabilization and Local Compute qualification](tasks/doing/ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE.md)
- [Batch Catalog roundtrip and bridge](tasks/doing/ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1.md)
- [Full-Library evidence export](tasks/doing/ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG.md)
- [Catalog corrections and cleanup](tasks/doing/ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP.md)
- [Completed Intelligent Library](tasks/done/L1-INTELLIGENT-LIBRARY01.md) and [storage incident closure](tasks/done/OPS-STORAGE-INCIDENT01.md)

Historical cards are evidence, not competing active-task selectors. Internal Beta is not started and current whole-product acceptance remains open.

2026-09-08 checkpoint update: signed-in production Library access and SSH readiness now pass. Local changed UI/translations 49/49 and bounded release review pass. The 10,000-holding / 500-selection Apply benchmark improved from 121,268 ms to 1,150 ms with persisted values, object identity and audit equivalence; ordinary listing is materially unchanged. Release/changed live-path acceptance is still pending.
