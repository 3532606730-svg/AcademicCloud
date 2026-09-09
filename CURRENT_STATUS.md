# AcademicCloud Current Status

**Last reconciled:** 2026-09-09. This file records current project truth; CURRENT_STATE.json is the compact machine-readable pointer. Historical releases and incidents remain in task cards, ADRs and Git.

## Active work and authority

[ACADEMICCLOUD-VNEXT-REMEDIATION01](tasks/doing/ACADEMICCLOUD-VNEXT-REMEDIATION01.md) is the sole active execution task. The Owner accepted the 360 review and authorized full remediation, integration, commits/push/main merge, deployment/migrations/admissions, necessary service/Compute operations, real Catalog Apply and justified data correction. Earlier review-only, export-only and model-decision stop lines are superseded within this scope.

The objective is a coherent, trustworthy existing product on zero-added-cost infrastructure. Stable identities, source associations, original bytes unless intentionally corrected, authorization and private overlays remain protected. Internal Beta, unrelated research features, whole-document OCR/indexing and RAG remain outside scope.

## Source and worktree state

Integration source is codex/vnext-remediation-20260906 at D:/Projects/AcademicCloud-vnext, based on exact Batch Catalog commit eb03dbd2fff86d4925193e7f7de69e30336e9993. Batch Catalog is a first-class remediation target. Relevant prior review fixes and meaningful existing branch work are integrated locally.

The original codex/project-memory-reconcile-20260817 checkout retains its ten tracked dirty files and 630 untracked files; review and staging trees remain preserved. Integration changes and ignored output/vnext verification artifacts are separate. Exact 36c4d75e6ba59b34007f096f78f20ab11ccec448 is published on integration and main. Active local HEAD and the intended remote commit were verified equal. Follow-up fixes are currently uncommitted in the integration tree. No dirty original checkout was reset or switched.

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
| Core/frontend release | 36c4d75e6ba59b34007f096f78f20ab11ccec448 |
| Service / health / readiness | Active, zero restarts; healthy / ready |
| Database | Schema head 36, history 001–036; SQLite integrity OK, zero FK violations; 132 clean projection rows before the intentional new upload |
| Ruleset admissions | Eleven entries, including exact v11/prompt-v7 |
| Catalog Bridge | ba0a74f28470a312f2e05135033f5b5a727ef093; active in AcademicCloudComputeV2, full verifier/loopback health/stability pass |
| Main inference worker | Exact36c4d75; enabled NORMAL concurrency one; temporarily stopped for exclusive offline follow-up qualification |
| vNext migration/release | Deployed; migrations035/036 applied once, no additional admissions; repository nginx limits active |

Follow-up exact36c4d75e6ba59b34007f096f78f20ab11ccec448 is now deployed in Core/frontend and the independently verified Local Compute release. No new migration/admission/nginx change accompanied this release. Integration CI34341820660 passed; main CI34342462609 exposed an overly short test-only lease deadline, under repair. The worker is enabled/active in NORMAL at concurrency one after immutable-release offline6/6 passed. Production C2 and C1 were retried through the signed-in website and succeeded with respectively19 and10 evidence fields, UNKNOWN class, exact NuExtract3 provenance, no auto-apply and unchanged canonical/source records. Runtime reuse and idle unload are observed.

Normal upload of Owner-provided Mongolia Today (15,128,023 bytes; SHA256a2353f77c418861d4c8b0fd6d479d5a5d65dce3690ded123560fbdc1c7050afc) created resource4b492f3f-bb91-49df-8ffe-767f1ce61147 and jobffc568e0-a785-463a-93e1-385f353135a3 automatically. Controlled worker loss at2026-09-09T12:26:05Z restarted the service after five seconds (one expected restart); the original lease expired naturally and attempt2 ran. It failed closed at12:31:31Z because thirteen proposed contributors lacked source role wording. No unsupported bibliography was promoted. The generic adapter fix omits only these unsupported contributor entries, retains strict type/enum/evidence validation, and passes34 focused tests plus the real PDF offline (19 fields, UNKNOWN/ambiguous). Exact release and normal-site retry are pending. Core search and PDF reading stayed available throughout recovery.

Real UI exposed same-ID retry polling and idempotent-success state regressions. Local fixes plus two regressions pass full frontend324/324; the model score label now states uncalibrated self-rating. Vitest4.1.11 fixes upstream GHSA-82fw-gwwq-j7x9; complete audit returns zero vulnerabilities. These follow-up source changes await checkpoint/release.

The exact Ubuntu24.04/Node24.19 local build reproduced archive SHA-256 0cb8e61cb946960ba65bfd3c3855470d9994c30f2b800517c69bb47ff626a218 twice. Its 4,930-file/37,108,689-byte manifest and extracted native/compiled runtime pass both locally and on Alibaba, with no production build/install. One schema034 recovery point was created through the existing backup command and encrypted with the existing public recipient; private backup commit 1a9d1c7acf7f7afc5530dc8614bcdb1a30b15c40 verifies off-host publication.

Real signed-in Catalog v2 import/Preview/Apply passed: the preserved 82-resource evidence manifest produced one reviewed correction, 78 UNKNOWN and three internal exclusions. Only resource894cce4f-38be-4f7f-9f9f-a8eb379b5aef changed: 《黑毡上的北魏皇帝》, 罗新, 海豚出版社, 2014.06, with explicit title/copyright evidence. Twelve reviewed operations preserved source bytes, object key/checksum/size and Resource/Record/Artifact/Version identities. Read-only database comparison confirms one changed file and one successful metadata audit, fourteen human field authorities plus human contributor-list authority, and zero FK violations. ISBN search, reading, details, citation and refresh context passed. Six real responsive after widths have no horizontal overflow.

The existing Windows startup helper and a hidden WSL keepalive now keep the independent Catalog Bridge reachable after CLI exit. Browser Use blocks loopback directly with ERR_BLOCKED_BY_CLIENT; fresh in-browser export remains externally unverified although Core export authorization and Windows/Linux bridge health pass. Import/Apply used preserved evidence, not a claimed fresh export.

Historical NuExtract3 production B passed; two real multilingual C jobs initially failed closed. The deployed36c4 adapter folds scalar layout whitespace, honors fact-page eligibility and applies the existing numeric evidence boundary before choosing a source line. Its immutable qualification passes A/B/B/UNKNOWN plus both real C PDFs (6/6), with unchanged v11 validator and pinned model/runtime; both C retries now pass in production. The additional Mongolia Today case is included in the next seven-case immutable qualification.

Real HTTPS request-boundary probes pass all six cases: export128KiB/Preview8MiB/Apply256KiB reach downstream validation or authentication at the limit, and one byte above each limit receives413. Benign unauthenticated requests did not execute Apply. Normal-site combined author/publisher/year/type filters, title sorting, refresh context, and reversible Favorites checks pass.

## Remaining work and blockers

Checkpoint and release the optional-contributor omission, same-ID UI state repairs, honest model-score label, safe diagnostics and deterministic lease test. Verify the exact immutable seven-case runtime and normal-site retry of the uploaded source. Finish remaining whole-product evidence and final report.

Production and GitHub signed-in sessions are available; no approval blocker remains. Fresh browser-to-loopback export is blocked by Browser Use. The new-upload defect is locally repaired and remains a release/live-verification gate, not an external blocker.

## Historical evidence

- [Final stabilization and Local Compute qualification](tasks/doing/ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE.md)
- [Batch Catalog roundtrip and bridge](tasks/doing/ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1.md)
- [Full-Library evidence export](tasks/doing/ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG.md)
- [Catalog corrections and cleanup](tasks/doing/ACADEMICCLOUD-CATALOG-BATCH-001-FIXES-AND-D-DRIVE-CLEANUP.md)
- [Completed Intelligent Library](tasks/done/L1-INTELLIGENT-LIBRARY01.md) and [storage incident closure](tasks/done/OPS-STORAGE-INCIDENT01.md)

Historical cards are evidence, not competing active-task selectors. Internal Beta is not started and current whole-product acceptance remains open.
