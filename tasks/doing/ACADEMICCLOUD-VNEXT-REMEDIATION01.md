## Task ID

ACADEMICCLOUD-VNEXT-REMEDIATION01

## Goal

Complete the Owner-accepted 360 review remediation on one integrated source line, deploy the corrected existing product, correct demonstrably wrong data, and verify normal live user workflows.

## Scope

The 2026-09-06 Owner instruction accepts R01–R16 and authorizes implementation, architecture/product decisions, commits/push/main integration, production release, migrations/admissions, nginx/systemd, necessary Compute activation, real Catalog Apply and justified data/OSS corrections without repeated approval. It supersedes earlier no-write/no-deploy/no-Apply/model-decision stop lines. Use existing zero-additional-cost infrastructure. Preserve original bytes unless correction is intended, stable identities, source association, authorization and private overlays.

## Non-goals

Unrequested research/social/RAG features, unnecessary infrastructure or paid services, secret exposure, history rewriting, disposal of unknown local work, and invented bibliography.

## Acceptance Criteria

- Integrated tested source incorporates meaningful W, B and review changes; verified main and active-local synchronization.
- R01–R16 and real newly found defects resolved or proved inapplicable; external impossibility precisely scoped.
- Field preserve/set/clear/human-conflict semantics match Preview/Apply; evidence, confidence and human decisions stay separate.
- Bounded transport and approximately O(batch + selected) planning; isolated complete Apply tests and verified live Apply.
- Multilingual search matching, authorization, ordering/cursors preserved; 100/1,000/10,000 normal-list, search, Preview and Apply-planning comparisons.
- Mature Library/details/Batch/read flow, refresh context, responsive widths 1600/1440/1366/1024/768/390, accessibility and actual screenshots.
- Applicable deterministic suites, build, dependency audit and CI pass; exact production deployment/migration/admission and real product smoke pass.
- Current-source/production/schema/admission/worker/release documents match evidence.
- Owner-required 29-section final report distinguishes local, deployed and normal real-data/product verification.

## Relevant ADRs

ADR-014, ADR-022, ADR-023, ADR-031–040 and [ADR-041 — vNext review plans and search projection](../../docs/decisions/ADR-041-vnext-review-plans-and-search-projection.md).

## Relevant Modules / Files

Backend catalog/library/metadata/suggestions/persistence; frontend Library/details/Batch/view context; Compute contracts/export/runtime; migrations 035–036; deployment/release scripts; regression CI; current-state documents.

## Current State

ACTIVE, reconciled 2026-09-07. Integration branch codex/vnext-remediation-20260906 at D:/Projects/AcademicCloud-vnext, based on exact remote B eb03dbd2fff86d4925193e7f7de69e30336e9993. Local remediation is implemented with verification below. Implementation checkpoint 09b6587198da947408f63fc41a929eba22766ab0 is committed locally; push, main merge and deployment are pending.

Work is explicitly separated:
- **PREEXISTING_DIRTY_FILES:** original W retains ten tracked dirty files and 630 untracked files; review/staging trees are preserved. W NuExtract work already in B was not replaced by stale code.
- **FILES_CHANGED_BY_THIS_REVIEW:** prior safe fixes and remediation are integrated only in the vNext worktree; Git diff/status is the exact inventory.
- **REVIEW_ONLY_TEMPORARY_FILES:** ignored output/vnext contains local fixtures, logs, benchmarks and screenshots, not production data or release authority.

Last production observation (2026-09-06, read-only): Core 196c9c5ee7ed60c6a261df5eef65f32cccaff639, schema/history 34/001–034, eleven admissions, healthy/ready/active with zero restarts; Catalog Bridge e261d11bda258da489561a4eba6155020f19301f active in V2; main inference service absent/inactive. No task production/data/OSS mutation yet.

## Completed

| Finding / area | Local implementation and evidence |
|---|---|
| R01 | Unified migration/admission/projection initializer; invalid admissions fail before writes; v11 readiness and fresh/repeated/compiled tests pass |
| R02 | SQL search projection, transactional dirty markers, authorized candidate selection before hydration; multilingual rank/filter/sort/cursor equivalence and 100/1,000/10,000 search measurements |
| R03/R04/R05/R06/R13 | Explicit v2 patches, complete field Preview, external evidence/UNKNOWN guards, bounded immutable plans, per-item CAS/retry, source-edition filename derivation, independent 8 MiB Preview / 256 KiB Apply |
| R07/R08/R09/R10/R11 | Prior fixes retained: stale Library response protection, independent export progress, nginx export 128 KiB, translated authority labels and muted-text contrast |
| R12/R14 | Responsive review with zero preselection/explicit acknowledgements; reading/history/search context; grouped details/editor; reading titles and lazy AI details |
| R15 | Current source/runtime/authority/queue reconciled; historical release dumps replaced with existing evidence links |
| R16 | npm 11.19.1 strict lifecycle policy, reproducible clean install, zero production advisories, permanent CI and deterministic Compute unit entry point |
| Additional defects | Contributor identity/link preservation; same-folder collision scope; durable human list replacement/clear against later AI retry (036); source-page bounds and v2 corrections; partial retries retain completed results |

Normal bibliography editing marks the submitted contributor collection as human. Catalog marks only an explicit list operation and includes authority-only adoption in Preview. Seven cross-service tests cover replacement/removal/reorder/empty/no-resurrection and unowned AI fill. Source identities, object keys and immutable evidence remain protected.

The runbook selects candidate migration/admission paths after protected environment loading, avoiding old-current initialization. Repository nginx carries route-specific limits.

## Remaining

- Complete the remaining live browser matrix after deployment. Local normal-list/Catalog comparisons and error/empty/loading screenshots are complete; bounded release review found no material blocker.
- Checkpoint/publish integration, pass remote CI, integrate main, verify active local/remote identity without discarding work.
- Assemble/verify/deploy an exact release, run append-only migrations 035–036/initialization, reconcile nginx/services, verify runtime/readiness/integrity.
- Execute real signed-in export/import/Preview/Apply and check data, filenames, Search and reading/details; report exact mutations/outcomes.
- Resolve and qualify necessary Compute capability repair. Historical NuExtract3 B passed, two C resources failed closed at canonical_schema_invalid; automatic-cataloguing acceptance remains open.
- Close production-relevant findings only after deployment/live evidence; deliver the complete final report.

## Blockers

2026-09-08: normal signed-in production Library access is now available. SSH readiness passes; intermittent connection resets require bounded retries. No current external blocker. No further approval for deployment, migration, main integration, Apply or necessary Compute repair is required.

The Windows native-install problem is resolved by the pinned strict npm policy.

## Last Verification

2026-09-08 checkpoint: final changed UI/translations 49/49; metadata authority-reset tests 6/6. Catalog Apply at 100/1,000/10,000 total holdings (100/500/500 selected): baseline 545/23,757/121,268 ms; candidate 96/592/1,150 ms. Full persistence/object-key/audit assertions passed. Preview median 9/73/471 ms baseline versus 33/247/617 ms candidate. Normal list DTO/cursor equality passes; latency remains materially unchanged. These are Windows in-process synthetic service measurements, not production latency.

2026-09-07, local vNext tree:
- Complete npm run test:ci: backend 426/426; frontend 321/321; contracts 3/3; Compute 150 passed / 1 skipped; operations 79/79.
- Subsequent frontend focused run 34/34, including partial-retry result preservation and completed-row protection.
- All workspace typechecks/build pass. Compiled acceptance: schema 036, v11 ready, session/metadata/recovery persistence; repeat initialization applies zero migrations/admissions.
- npm 11.19.1 strict clean install passes; production dependency audit reports zero vulnerabilities.
- Search tests cover 20 multilingual queries/filters, seven sorts, pagination, authority/rollback/dirty state and 100/1,000/10,000 corpora.
- Actual six-width browser evaluation used isolated synthetic fixtures. Library/search/PDF/details/editor and review/acknowledgement/partial-Apply checked; this is not production Apply or real-data evidence.
- Logs/screenshots/fixtures: ignored output/vnext. Tests and release contracts remain durable source evidence.

## Next Action

Finish remaining targeted benchmarks/browser evidence, then checkpoint/publish, remote CI, main integration and exact deployment. Continue independent work while production login is unavailable. Do not mark production-relevant findings RESOLVED before deployment and appropriate verification.
