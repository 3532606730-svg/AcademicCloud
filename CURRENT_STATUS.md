# AcademicCloud Current Status

**Last reconciled:** 2026-09-09. This file records current project truth; CURRENT_STATE.json is the compact machine-readable pointer. Historical releases and incidents remain in task cards, ADRs and Git.

## Active work and authority

[ACADEMICCLOUD-VNEXT-REMEDIATION01](tasks/doing/ACADEMICCLOUD-VNEXT-REMEDIATION01.md) is the sole active execution task. The Owner accepted the 360 review and authorized full remediation, integration, commits/push/main merge, deployment/migrations/admissions, necessary service/Compute operations, real Catalog Apply and justified data correction. Earlier review-only, export-only and model-decision stop lines are superseded within this scope.

The objective is a coherent, trustworthy existing product on zero-added-cost infrastructure. Stable identities, source associations, original bytes unless intentionally corrected, authorization and private overlays remain protected. Internal Beta, unrelated research features, whole-document OCR/indexing and RAG remain outside scope.

## Source and worktree state

Integration source is codex/vnext-remediation-20260906 at D:/Projects/AcademicCloud-vnext, based on exact Batch Catalog commit eb03dbd2fff86d4925193e7f7de69e30336e9993. Batch Catalog is a first-class remediation target. Relevant prior review fixes and meaningful existing branch work are integrated locally.

The original codex/project-memory-reconcile-20260817 checkout retains its ten tracked dirty files and 630 untracked files; review and staging trees remain preserved. Integration changes and ignored output/vnext verification artifacts are separate. Exact 6972b212975bf15ce8221ec47ab5d03924cadf41 is published on integration and main, fast-forwarding main from 0aae160. Active local HEAD and the intended remote commit were verified equal. No dirty original checkout was reset or switched.

## Implementation and verification

Local implementation covers accepted R01–R16 and additional concrete defects:

- One database initializer validates runtime admissions and readiness. Migrations 035–036 add derived search state and durable contributor-collection authority.
- SQL selects/ranks/sorts/pages authorized Library search results before bounded hydration. Multilingual equivalence, authorization, dirty-state handling and 100/1,000/10,000 search comparisons pass.
- Catalog v2 exposes allowlisted set/clear/preserve changes, every proposed field and human/evidence acknowledgements. Actor/Library-bound immutable plans, per-item CAS, collision checks and retry replay keep Preview and Apply consistent. Confidence does not confer authority; UNKNOWN cannot apply without an explicit corrected proposal.
- Contributor identities/authority links survive Catalog changes, and a deliberately cleared or replaced human contributor list stays protected from later AI retries.
- Library stale-response handling, export progress isolation, filename provenance, responsive review/details/editor paths, reading/history context and translated authority labels are repaired.
- nginx limits are explicit per route; strict npm 11.19.1 installation and permanent regression CI replace fragile install/temporary-workflow assumptions.

The complete Linux qualification passed backend **426/426**, frontend **322/322**, contracts **3/3**, Compute **150 passed / 1 skipped**, and operations **79/79**. All workspace typechecks/build and compiled schema036/v11/idempotent initialization acceptance pass. Three old error-copy assertions were corrected. The isolated source archive needed its exact Git bundle for repository-presence tests. Strict npm11.19.1 installation and audits pass with zero vulnerabilities. Remote integration CI 34256916482 and main CI 34257616163 both pass, including Windows native installation.

Synthetic browser evaluation covers six responsive widths and Library/search/reading/details/editor/Catalog review/retry paths. Production before screenshots are recorded at six widths; changed live-path verification continues after deployment. No finding is closed merely from synthetic evidence. At 10,000 holdings / 500 selections, actual isolated Apply improved from 121,268 ms to 1,150 ms with persistence/object/audit equivalence; ordinary listing is materially unchanged.

## Last observed production

Verified after deployment on 2026-09-09:

| Component | Observed state |
|---|---|
| Core/frontend release | 6972b212975bf15ce8221ec47ab5d03924cadf41 |
| Service / health / readiness | Active, zero restarts; healthy / ready |
| Database | Schema head 36, history 001–036; SQLite integrity OK, zero FK violations; 132 projection rows, zero dirty rows |
| Ruleset admissions | Eleven entries, including exact v11/prompt-v7 |
| Catalog Bridge | ba0a74f28470a312f2e05135033f5b5a727ef093; active in AcademicCloudComputeV2, full verifier/loopback health/stability pass |
| Main inference worker | Service absent/inactive; automatic-cataloguing acceptance remains open |
| vNext migration/release | Deployed; migrations035/036 applied once, no additional admissions; repository nginx limits active |

The exact Ubuntu24.04/Node24.19 local build reproduced archive SHA-256 0cb8e61cb946960ba65bfd3c3855470d9994c30f2b800517c69bb47ff626a218 twice. Its 4,930-file/37,108,689-byte manifest and extracted native/compiled runtime pass both locally and on Alibaba, with no production build/install. One schema034 recovery point was created through the existing backup command and encrypted with the existing public recipient; private backup commit 1a9d1c7acf7f7afc5530dc8614bcdb1a30b15c40 verifies off-host publication. No source bytes or canonical business metadata have been changed by this task yet.

Historical NuExtract3 offline qualification and production B passed. Two distinct real multilingual C jobs failed closed at bibliographic_reasoning/canonical_schema_invalid, with no false success or canonical promotion. Current authorization permits capability repair; an unqualified worker must not be presented as accepted.

## Remaining work and blockers

Finish real authenticated Catalog export/import/Preview/Apply, data/filename/Search/reading/details verification and the six-width after matrix. Diagnose and qualify the necessary NuExtract repair before main inference activation and normal automatic-cataloguing acceptance.

Production and GitHub signed-in sessions are available. GitHub workflow authorization is complete; there is no remaining approval blocker. Intermittent network failures receive bounded retries. Main inference remains unqualified; the two preserved C PDFs still fail at the canonical adapter boundary in offline diagnostics.

## Historical evidence

- [Final stabilization and Local Compute qualification](tasks/doing/ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE.md)
- [Batch Catalog roundtrip and bridge](tasks/doing/ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1.md)
- [Full-Library evidence export](tasks/doing/ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG.md)
- [Catalog corrections and cleanup](tasks/doing/ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP.md)
- [Completed Intelligent Library](tasks/done/L1-INTELLIGENT-LIBRARY01.md) and [storage incident closure](tasks/done/OPS-STORAGE-INCIDENT01.md)

Historical cards are evidence, not competing active-task selectors. Internal Beta is not started and current whole-product acceptance remains open.
