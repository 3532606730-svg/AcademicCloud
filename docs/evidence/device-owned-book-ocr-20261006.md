# Device-owned private book OCR — local candidate evidence

Date: 2026-10-06. Status: local candidate, **not deployed**. Authority: [ADR-051](../decisions/ADR-051-device-owned-private-book-jobs-and-bounded-warm-ocr.md). The recorded production runtime remains Core/frontend9840e7b, native662 and schema40. This candidate appends041; neither its production migration nor normal signed-in background-book acceptance has passed at this checkpoint. The earlier313-page browser-owned trial and actual TXT/JSONL files remain separate accepted history in [private book OCR evidence](private-book-ocr-20261006.md).

## Implemented candidate

The account's own paired connector can claim a durable private book job, obtain a short-lived source grant, render the PDF locally and save page receipts. The browser starts, observes and explicitly pauses/resumes/cancels; hiding the website or leaving the Reader does not cancel a device-owned job. An old connector with transportFeatures[] retains its Reader-required sequential path. The device and connector must stay running; restart requires normal re-pairing and explicit resume. No persisted plaintext device token or automatic startup is added.

Schema041 adds device transport features, private book jobs and immutable page receipts. Existing machine results/corrections are retained. Limits remain500 physical pages and500 retained results per account, with one active account request/eight globally; the accepted new retained-job limit is100. Exact create replay and resume reuse the same job. Core checks account/source/device authority, confirms decoded page count before accepting a page, commits result and receipt atomically, and grants no Owner exception over another account's private activity.

The local connector uses bounded PDF rendering and warm Paddle slices of at most8 completed pages, with a45-second condition for starting another page. The existing90-second page deadline remains. It holds the common native guard until confirmed child closure, then yields2seconds. This warm policy updates only the independent Member connector kit; root has independently confirmed that the existing native662 selectors/models remain selected. The model, Python sidecar hash and guard protocol remain unchanged. These are implemented/tested boundaries, not a measured native speedup or a completed live background run.

The Reader restores jobs and saved-page metadata by GET, retains a stable request key across an uncertain start response, and creates/retries only after an explicit action. Queued/running book work blocks current-page OCR; paused work releases capacity. History selection and unsaved private correction drafts survive progress refresh. Processed/review-needed/no-text counts remain separate, and existing authenticated TXT/JSONL exports remain available. Searchable-PDF generation, shared OCR publication, indexing/RAG and cloud OCR are not implemented by this candidate.

## Local verification

The existing green root receipts cover **217 distinct scoped tests**, counted once. The current candidate gate remains open: a newly added Compute P2 slice-boundary regression awaits root verification; an expected50-test Compute count is pending, not a pass claim.

| Scope | Latest result | Receipt under ignored output/vnext/device-book-ocr-20261006/ |
| --- | --- | --- |
| Backend HTTP/SQLite/privacy/lifecycle/migrations/deployment bounds |95/95|backend-focused.log|
| Frontend OCR/Reader,7 unique files |72/72:56 plus31 minus15 repeated UI tests|frontend-focused.log; frontend-remaining.log|
| Connector/source/PDF/warm-session/native lifecycle/kit |Existing49/49; new P2 regression/current rerun pending|compute-final-node.log|

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

Root's current full-workspace typecheck passes in typecheck.log. The frontend agent's earlier77/8-file pass consisted of these72 OCR cases plus the5 general Reader cases in pdf-reader.test.tsx, which is absent from the latest root union. Its frontend typecheck/production build also passed at that prior checkpoint. These older results are not added to the latest root count. Earlier backend or compute suite counts are likewise not added to216. The legacy Vite configuration-loader warning remains informational in the frontend receipts.

The focused coverage includes cross-account/Owner non-disclosure, CSRF, source/member/account/device invalidation, persisted lease expiry/restart, explicit re-pair resume, idempotent create/page acknowledgements, retained-job/quota/capacity limits, unchanged historical correction rows, post-signing authority checks, strict frame/provenance validation, bounded worker rendering, native close-before-release, and unknown-network outcome fencing. React acceptance covers background hidden/unmount persistence, legacy pause, explicit controls, refresh/re-pair recovery, current-page mutual exclusion, selected history and draft retention. These are synthetic/local checks; no new production academic data was used for them.

Independent read-only backend/contracts041 review found no material issue. It verified account-scoped lookup/projection,500-result and missing-page quota gates, the100-retained-job gate after exact idempotency lookup, immediate result/receipt transactions, stale-attempt rejection for new writes, and reauthentication/source checks after asynchronous source signing. Replaying an already accepted immutable receipt after lease expiry or pause acknowledges existing saved metadata; it does not create another result. Global no-store response headers cover private controls.

## Exact rollback qualification history and remaining gates

The schema041-compatible rollback is separate from the new application candidate. It retains9840 application/frontend behavior and adds the exact041 SQL plus the compiled acceptance's expected migration count; it must pass exact artifact/runtime verification before production use.

The first rollback source4cbd5f124e77506a683bb0486ed17c3051bf95b4 packaged, but Linux compiled acceptance failed at the obsolete migration assertion: actual41 versus expected40. The revised3499940efe8320eb5250a5b0c5ff47b274bfdbad packaged5181 files/42,980,467bytes (archive SHA256 a87b410aa5c74f5f51759d3252f3e5351ec8180e5063809cd656d8afc63c7170), then failed compiled API acceptance with HTTP500 at POST /api/auth/register. These initial failures remain history. Logs: core-linux-qualification-4cbd5f124e77506a683bb0486ed17c3051bf95b4.log, core-linux-release-3499940efe8320eb5250a5b0c5ff47b274bfdbad.log and core-linux-qualification-3499940efe8320eb5250a5b0c5ff47b274bfdbad.log.

Root's disposable WSL diagnostic subsequently passed complete instrumented compiled acceptance with schema41, ready health/readiness, retained identities/private notes/restarts and isolated recovery checks. Twenty bounded invitation probes and the first five registration probes returned201; the sixth registration returned the existing429 rate limit. The original500 cause remains unverified: no deterministic041/old-application incompatibility was reproduced, so it cannot be attributed to041. The release artifact files were unmodified, but final qualification must run through the ordinary unmodified archive verifier and remains pending. Receipt: rollback-diagnostic-summary.json. Its backup/recovery fields describe isolated synthetic qualification, not a new production backup or restore. Packaging and diagnostic success do not establish final artifact qualification or deployment.

The041 migration guard script exists locally; a passing frozen reference/qualification receipt is not yet recorded here. Exact candidate/rollback runtime qualification, coordinated root deployment, append-only production preservation, and normal signed-in start→website closure→reopen→explicit pause/resume/re-pair acceptance remain outstanding. No new production backup, live migration, native selection or production OCR action was performed for this evidence draft. No whole-book speedup, machine accuracy, searchable-PDF output or shared publication is claimed.

Final ordinary unmodified3499940 Linux artifact qualifier now passes (Node24.19.0/npm11.19.1,5181 files, schema41 compiled acceptance, archive a87b410aa5c74f5f51759d3252f3e5351ec8180e5063809cd656d8afc63c7170; manifest d96663644b5a251ffc58d9d7805d8ad81f606f2cbfee3ad69ce879a909be7fb7). Original register500 remains historical and unexplained; no migration/startup guard or artifact was relaxed. Final Node/tsx Compute50/50 includes heartbeat-after45s and repeat-attempt fencing; an erroneous Vitest invocation on node:test files is a harness failure, superseded by the correct compute-final-node.log.
