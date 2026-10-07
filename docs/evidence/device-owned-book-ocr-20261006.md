# Device-owned private book OCR — deployment evidence

Date: 2026-10-06. Status: **Core/frontend deployed; background/resume behavior verified; raster quality repair qualified locally**. Authority: [ADR-051](../decisions/ADR-051-device-owned-private-book-jobs-and-bounded-warm-ocr.md). Exact Core/frontend05bbfb641e31e22f6d9161988f411a442afda25b is deployed at schema41/history001–041/11 admissions, with native662 retained. The earlier313-page browser-owned trial and actual TXT/JSONL files remain separate accepted history in [private book OCR evidence](private-book-ocr-20261006.md). The41-page Fletcher trial passed website-closure persistence but failed body-render quality.

## Deployed private book path

The account's own paired connector can claim a durable private book job, obtain a short-lived source grant, render the PDF locally and save page receipts. The browser starts, observes and explicitly pauses/resumes/cancels; hiding the website or leaving the Reader does not cancel a device-owned job. An old connector with transportFeatures[] retains its Reader-required sequential path. The device and connector must stay running; restart requires normal re-pairing and explicit resume. No persisted plaintext device token or automatic startup is added.

Schema041 adds device transport features, private book jobs and immutable page receipts. Existing machine results/corrections are retained. Limits remain500 physical pages and500 retained results per account, with one active account request/eight globally; the accepted new retained-job limit is100. Exact create replay and resume reuse the same job. Core checks account/source/device authority, confirms decoded page count before accepting a page, commits result and receipt atomically, and grants no Owner exception over another account's private activity.

The local connector uses bounded PDF rendering and warm Paddle slices of at most8 completed pages, with a45-second condition for starting another page. The existing90-second page deadline remains. It holds the common native guard until confirmed child closure, then yields2seconds. This warm policy updates only the independent Member connector kit; root has independently confirmed that the existing native662 selectors/models remain selected. The model, Python sidecar hash and guard protocol remain unchanged. These are implemented/tested boundaries, not a measured native speedup or a completed live background run.

The Reader restores jobs and saved-page metadata by GET, retains a stable request key across an uncertain start response, and creates/retries only after an explicit action. Queued/running book work blocks current-page OCR; paused work releases capacity. History selection and unsaved private correction drafts survive progress refresh. Processed/review-needed/no-text counts remain separate, and existing authenticated TXT/JSONL exports remain available. Searchable-PDF generation, shared OCR publication, indexing/RAG and cloud OCR are not implemented by this candidate.

## Local verification

The green root receipts cover **217 distinct scoped tests**:95 backend,72 frontend and50 Compute, counted once. The final Node/tsx Compute run includes the P2 heartbeat-crossing45-second slice-boundary regression and repeated-attempt fencing. An earlier erroneous Vitest invocation on node:test files found no suites; that is a runner-selection failure, superseded by the correct50/50 run, not an OCR implementation failure.

| Scope | Latest result | Receipt under ignored output/vnext/device-book-ocr-20261006/ |
| --- | --- | --- |
| Backend HTTP/SQLite/privacy/lifecycle/migrations/deployment bounds |95/95|backend-focused.log|
| Frontend OCR/Reader,7 unique files |72/72:56 plus31 minus15 repeated UI tests|frontend-focused.log; frontend-remaining.log|
| Connector/source/PDF/warm-session/native lifecycle/kit |50/50|compute-final-node.log|

Source inspection, including expansion of it.each cases, confirms the frontend union below. The first56-test run covered API, book controller, book UI, current-page UI and Reader OCR; the second31-test run covered frame, current-page controller and current-page UI. local-ocr-ui.test.tsx and its15 cases appear in both runs. The earlier87/231 distinct-count statements were incorrect and are corrected here without rerunning those suites.

| Unique frontend file | Cases |
| --- | ---: |
| local-ocr-api.test.ts |4|
| local-ocr-book-controller.test.ts |13|
| local-ocr-book-ui.test.tsx |16|
| local-ocr-ui.test.tsx |15|
| pdf-reader-ocr.test.tsx |8|
| local-ocr-frame.test.ts |11|
| local-ocr-controller.test.ts |5|

Root's full-workspace typecheck passes in typecheck.log. The frontend agent's earlier77/8-file pass consisted of these72 OCR cases plus the5 general Reader cases in pdf-reader.test.tsx, which is absent from the latest root union. Its frontend typecheck/production build also passed at that prior checkpoint. These older results are not added to the latest root count. Earlier backend or compute suite counts are likewise not added to217. The legacy Vite configuration-loader warning remains informational in the frontend receipts.

The focused coverage includes cross-account/Owner non-disclosure, CSRF, source/member/account/device invalidation, persisted lease expiry/restart, explicit re-pair resume, idempotent create/page acknowledgements, retained-job/quota/capacity limits, unchanged historical correction rows, post-signing authority checks, strict frame/provenance validation, bounded worker rendering, native close-before-release, and unknown-network outcome fencing. React acceptance covers background hidden/unmount persistence, legacy pause, explicit controls, refresh/re-pair recovery, current-page mutual exclusion, selected history and draft retention. These are synthetic/local checks; no new production academic data was used for them.

Independent read-only backend/contracts041 review found no material issue. It verified account-scoped lookup/projection,500-result and missing-page quota gates, the100-retained-job gate after exact idempotency lookup, immediate result/receipt transactions, stale-attempt rejection for new writes, and reauthentication/source checks after asynchronous source signing. Replaying an already accepted immutable receipt after lease expiry or pause acknowledges existing saved metadata; it does not create another result. Global no-store response headers cover private controls.

## Exact artifact and rollback qualification

The schema041-compatible rollback is separate from the new application release. It retains9840 application/frontend behavior and adds the exact041 SQL plus the compiled acceptance's expected migration count. The final ordinary unmodified3499940efe8320eb5250a5b0c5ff47b274bfdbad artifact/runtime qualifier passes at5181 files/42,980,467bytes, Node24.19.0/npm11.19.1 and compiled schema41 acceptance. Its archive SHA256 is a87b410aa5c74f5f51759d3252f3e5351ec8180e5063809cd656d8afc63c7170; manifest SHA256 d96663644b5a251ffc58d9d7805d8ad81f606f2cbfee3ad69ce879a909be7fb7. Receipt: core-linux-qualification-3499940efe8320eb5250a5b0c5ff47b274bfdbad.log. No production rollback or downmigration occurred.

The first rollback source4cbd5f124e77506a683bb0486ed17c3051bf95b4 packaged, but Linux compiled acceptance failed at the obsolete migration assertion: actual41 versus expected40. The first3499940 qualification then failed compiled API acceptance with HTTP500 at POST /api/auth/register. These initial failures remain history in core-linux-qualification-4cbd5f124e77506a683bb0486ed17c3051bf95b4.log and rollback-qualified-console.log.

Root's disposable WSL diagnostic subsequently passed complete instrumented compiled acceptance with schema41, ready health/readiness, retained identities/private notes/restarts and isolated recovery checks. Twenty bounded invitation probes and the first five registration probes returned201; the sixth registration returned the existing429 rate limit. The original500 cause remains unverified: no deterministic041/old-application incompatibility was reproduced, so it cannot be attributed to041. The release artifact files were unmodified; the subsequent ordinary archive qualifier passed as recorded above, without relaxing migration/startup guards. Receipt: rollback-diagnostic-summary.json. Its backup/recovery fields describe isolated synthetic qualification, not a new production backup or restore.

Exact05bbfb641e31e22f6d9161988f411a442afda25b Linux artifact/runtime qualification passes:5185 files/43,081,912bytes, Node24.19.0/npm11.19.1, compiled schema41 acceptance and Core free of OCR/PDF-render runtimes. Archive SHA256322ccc86193c8952fdba5b0d26e9e6984053e12e26c0a765b72127e322b532e6; manifest SHA256e43a60cdf33e9c1678a4f9bfe4b55fefd402eafed8094f9e609d2a73477adecb. Receipt: core-linux-qualification-05bbfb641e31e22f6d9161988f411a442afda25b.log. Host preparation and exact activation pass in host-prepare-console.log and host-activate-console.log; their qualification/recovery checks do not represent a production backup or restore.

## Production migration and activation

Root applied only append-only migration041. The frozen pre/post guard passes exact schema41/history001–041/11 admissions, SQLite integrity ok and zero foreign-key violations. It compares typed row multiset hashes across every old column in all55 pre-existing tables, preserves the exact first40 migration-history rows, verifies old device transport features default to[] and requires both new book tables to be empty at the cutover. The later readiness guard checks structural invariants without comparing mutable business rows. These are content-free preservation checks, not a production data backup.

The migration guard's initial review identified two coverage gaps, which were repaired. A subsequent synthetic DDL mismatch produced a false alarm; the fixture was corrected to the actual migration-runner DDL rather than weakening validation. Final migration-guard-synthetic-review.json has runnerDdlExact=true, positive compare/readiness passes, and seven passing rejection cases: changed old row, omitted table, omitted column, empty table reference, history DDL drift, history checksum change and application DDL drift. The same real cutover preservation/readiness checks pass in host-activate-console.log.

Core activation records PID1514555, active/running, Result=success, NRestarts0 and80,683,008bytes memory. Memory is a cutover snapshot. The scoped nginx addition passes syntax and preserves prior configuration. Models, Compute/Bridge selectors, environment and units remain unchanged. No new production backup, restore or downmigration occurred.

## Member connector and remaining live gate

The independently installed Member kit is exactly118,813bytes, SHA256 baccd267a1646bd15bca82901e63375a292bb094a93b5fd57163cb8ff7e7ce95, source05bbfb641e31e22f6d9161988f411a442afda25b. Linux CPU smoke passes with Node24.16.0 using retained native662 dependencies/runtime: one synthetic PDF page with intrinsic90-degree rotation renders a bounded2000×1333,12,789-byte PNG, and worker closure is awaited. Inference=false: this does not claim a live Paddle or real-book result. Receipt: member-kit-install.json. The existing662 selectors, models and Python sidecar remain retained.

Root stopped the old connector3415, paired375346 normally, and submitted Fletcher through the signed-in Reader. After16/41 pages saved, the initiating website tab closed; reopening showed40/41 then41/41. Actual exports preserve all41 page/source identities. Their6,026 raw UTF-16 units and107 boxes revealed missing body content on40 CCITT pages: only a footer rendered. Export structure and background continuation pass, while render quality fails and the apparent112.726-second span is not a qualified speedup. Old private results remain intact.

A separate9-page Chinese document paused at8/9, retained those results after connector375346 closed, and required explicit resume after normal re-pairing to383913. Final9/9 export deep comparison confirms every field of the first8 rows is unchanged and only page9 is new. The connector was no longer running at October7 recovery; Local Pull338 and Bridge336 were active with zero restarts. Computer/connector restart still requires normal pairing; automatic startup is not implemented.

## October7 shared PDF decoder repair

Member, Catalog fallback and explicit-page inspectors now resolve wasm/font/cMap assets from the existing pinned PDF.js6.2.108 installation. A synthetic CCITT body plus separate footer regression catches the original false success; relocated standalone-kit tests verify package-relative resolution and missing-asset rejection.63 distinct checks pass (57 plus6 kit), as do Compute typecheck/build and independent review. The initial kit harness failed because inherited --input-type was incompatible with its child; the final isolated runner passed without application relaxation. Missing assets now fail early; this does not certify arbitrary corrupt-image decoding upstream.

Actual compiled worker Fletcher page2 CPU rendering is1811×2800,475,087 PNGbytes and311,498 darkbodypixels, matching the successful local-assets diagnostic; original source hash is unchanged. Candidate kit119,617bytes SHA256 7bdd23ff46206d5a9f5df21f010c0c5fdd4e73c015e499b60736806776d56908. Exact new release and real native OCR quality acceptance remain pending at this source checkpoint. Receipts: pdf-assets-focused-initial.log, pdf-assets-kit-final.log, pdf-assets-typecheck.log, pdf-assets-build.log, pdf-assets-actual-fletcher.json and pdf-assets-fixed-kit.json under the existing ignored evidence directory.

Fresh read-only October7 inventory contains192 distinct active PDF holdings:94 latest jobs succeeded,67 failed,31 absent. Semantic states are44 reviewable AI results,1 applied,52 extraction-only,5 filename-only,23 not run and67 failed. Normal website enumeration contains205 total holdings; first100 recovery preview protects78 successes, identifies14 failures requiring individual review,4 safe transport retries and4 non-PDFs. These are inventory/eligibility counts, not completed cataloguing. Root proceeds in small normal-UI batches after the shared decoder release, preserving six known damaged sources, fixtures, human authority and history.
