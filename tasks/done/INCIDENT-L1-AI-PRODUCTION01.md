# INCIDENT-L1-AI-PRODUCTION01

## Task ID
INCIDENT-L1-AI-PRODUCTION01

## Goal
Diagnose and safely repair the confirmed Layer-1 AI bibliographic production
incident affecting both newly admitted PDFs and explicit legacy re-catalogue
jobs, while exposing Owner contribution review in the ordinary product surface.

## Scope
Production evidence, the existing Core/Compute dispatch boundary, durable AI
job state, failure UX/retry, and the existing contribution review APIs/UI.

## Non-goals
No model redesign, full-document OCR, RAG, embeddings, new provider/cost,
destructive data operation, or uncontrolled legacy wave. Migration 025 is
limited to durable admission priority/origin fields and bounded reconciliation.

## Acceptance Criteria
The first failing production boundary must be established with concrete
evidence for one new-upload job and one legacy re-catalogue job before any
backend production repair or deployment. Real production E2E must prove both
flows, and the contribution review route must remain authoritative and
non-duplicated.

## Relevant ADRs
ADR-014, ADR-022, ADR-023, ADR-031, ADR-033, ADR-034, ADR-036.

## Relevant Modules / Files
`backend/src/compute/github-actions-dispatcher.ts`,
`backend/src/suggestions/`, `backend/src/library/`,
`frontend/src/App.tsx`, `frontend/src/resource-details.tsx`,
`frontend/src/shared-library.tsx`.

## Current State
Owner real-browser production acceptance failed on 2026-08-24 and overrode all
earlier synthetic fixture, harness, CI, worker-terminal, and repository gates as
acceptance evidence. The normal signed-in Owner workflow was reproduced,
repaired at its first broken boundary, and re-tested through reviewable result
display. The incident is closed; Internal Beta readiness is restored, but no
quality cohort, Internal Beta, invitations, or unrelated work has started.

```text
PRODUCTION_USER_ACCEPTANCE=PASS
INCIDENT_L1_AI_PRODUCTION01=CLOSED
INTERNAL_BETA_READY=true
OWNER_REAL_BROWSER_PATH=PASS
```

The 2026-08-24 normal Owner-browser reproduction established the current first
failure boundary before the repair was changed:

```text
PRODUCTION_FRONTEND_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
PRODUCTION_FRONTEND_JS=index-OhtI0cc3.js
PRODUCTION_FRONTEND_JS_SHA256=5e64a5c4c34aebbb1fe8c68ab18172a8a31c0243efebe708b34a0f08d20f0689
PRODUCTION_CORE_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
SCHEMA_VERSION=v25
MIGRATION_HISTORY=001-025
FIRST_FAILURE_BOUNDARY=H. WORKER_COMPUTE
ROOT_CAUSE=32 MiB aggregate PDF range budget exhausts during document_load; the empty range leaves PDF.js pending until timeout
```

The signed-in UI opened canonical-Library resource
`ad0cc21f-dd8e-48be-b223-d2576ab0d33f` without an authentication or console
error. Its normal retry request returned `202`, authenticated polling returned
`200`, and Core persisted the durable attempt and GitHub provider receipt. The
prior real attempt was claimed and failed as `compute_timeout` after 5.606
seconds. Several other real Library PDFs show the same 5–6-second claimed-
worker failure, whereas the 60,585-byte fixture succeeds. The production
worker imported `SUGGESTION_LIMITS.timeoutMilliseconds=5_000`; therefore UI,
API contract, session, admission, job projection, and provider dispatch all
precede and pass the first broken boundary.

The first bounded repair changed only the Compute PDF inspection budget from
5,000 to 30,000 ms. Exact worker `8e687343f83706c1caa6c0e466b3494bca3d96fb`
then ran from the same UI/resource as run `32693793765`, attempt
`fcf08f10-00c1-4ca4-ae92-4c4eb918f0e6`. It advanced farther (peak RSS
222,720,000 bytes versus 185,860,096 bytes on a five-second control) but again
ended `compute_timeout` exactly 30.948 seconds after claim. This preserves the
same first failure boundary and proves 30 seconds insufficient. The next bounded
value of 120,000 ms was published as exact worker
`478098904ac23bca9d9d99f43309acdfa3221ea1` and tested from the same UI/resource
in run `32694218980`, attempt `8c262ac5-bd35-46f2-bebf-e20e2a2d16b0`. It again
ended `compute_timeout` exactly 120.646 seconds after claim. Repeated exhaustion
of every supplied aggregate deadline rules out ordinary latency headroom. A
privacy-safe diagnostic now reports only the bounded operation stage and range
request/byte counters outside the durable callback; no source URL, PDF content,
candidate content, or metadata is logged. Exact diagnostic worker
`aafb608a2e52ab2a36b679def6f0ac9e1697ce68`, run `32694721068`, attempt
`34327558-fae8-4359-af66-1c18f8507090` reported
`stage=document_load`, `rangeRequests=31`, and `rangeBytes=31,532,724`. With
the 1 MiB initial prefix, this reaches the 32 MiB aggregate ceiling; the next
request is replaced with an empty chunk and PDF.js cannot finish document load.
The smallest repair raises only the aggregate range ceiling to 64 MiB while
retaining range-only access, the 1 MiB request cap, 64-request cap, 4 GiB object
cap, 120-second parser, 180-second request, and 420-second worker ceilings. No
acceptance state advanced. Exact worker
`61692e9df22c5f063d79e98a37a065987599e5d6`, run `32695272586`, attempt
`e12ea293-1e99-4892-aa64-50813c42d1b0` then cleared `document_load`, read 60
ranges / 61,941,428 bytes, and continued past the former parser termination.
It ended `compute_timeout` exactly at the 180-second total extraction deadline.
Page load/render failures are already stage-labelled, so the only remaining
unlabelled timeout path in the source is OCR recognition. The next exact worker
labels that path and extends only the total extraction window to 300 seconds
inside the unchanged 420-second worker and 10-minute capability.

Exact worker `c9b87babb32899f01ef3162a42a0c4b52cd7437f`, run
`32695881291`, worker job `97337737363`, and attempt
`91975c39-aa9e-462a-b78d-0d55af5e34fb` then completed the same normal Owner
retry path in `succeeded` after 5m05s. Core committed the callback at
`2026-08-24T06:10:35.118Z`; the immutable computed run covers all selected
first-15/last-5 pages and the actual resource-details UI displays the
reviewable suggestion with no console error. Worker RSS was 95,444,992 bytes
at clean start, 279,941,120 peak, and 237,719,552 post-job. This proves the
current 62,990,004-byte path, but it does not close the incident: the preceding
attempt needed 61,941,428 later range bytes plus the initial prefix, nearly
saturating the 64 MiB ceiling.

Production supports PDFs above 64 MiB. Upload admission is 5 GiB, the signed
Compute source descriptor is bounded at 4 GiB, the normal large-file UX covers
50–200 MB, and approved canonical-Library PDFs observed read-only in production
range from 72,459,070 through 922,469,003 bytes above that threshold. The fixed
64 MiB byte and request ceilings are therefore a second H/Worker-Compute defect.
The bounded repair derives aggregate bytes and requests from the exact object
length at the unchanged 1 MiB provider request size. Because PDF.js allocates a
full-length range backing buffer, a distinct 1 GiB parser-allocation guard is
tied to the largest observed approved production PDF and the existing <6 GiB
intelligent-worker qualification; larger signed sources fail before object
read without affecting the admitted file. Success logs gain only bounded
source-size/range metrics, not source identity or content.

Exact size-aware worker `a0a599ebbb46fd5135d9d976b7f0254f195a27d4`
was published before the >64 MiB gate. The first 72,459,070-byte control read
2,204,478 bytes in three requests and failed later at strict reasoner result
validation; it was not counted as acceptance. The 76,097,594-byte resource
`1b36e0fc-e0ac-4cbb-a49c-ff6be1959141` then read the complete object in 73
bounded requests, proving aggregate access above 64 MiB, but reached the fixed
300-second aggregate OCR deadline after earlier pages had already completed.
That attempt (run `32698078764`, worker job `97343951589`, attempt
`51ed1724-fec7-45e5-bcb3-dd06d5a2a742`) failed closed with `ocr_timeout` and
peak RSS 377,733,120 bytes.

The smallest follow-up repair did not increase any timeout, memory, page-count,
or concurrency constant. It preserves already-completed OCR pages under the
existing `window.complete=false` contract only when the aggregate deadline is
exhausted; first-page, earlier per-page, and non-timeout failures still fail
closed. Exact source `ccde12d0f1aadff484b42841eb1136061f86cb9b`, run
`32699116627`, worker job `97346899192`, and attempt
`783309ad-12aa-48be-ae90-e9259c960531` then completed the same 76,097,594-byte
resource through the normal Owner UI. It read 76,097,594 bytes in 73 bounded
requests, peaked at 384,147,456 bytes RSS, and Core persisted `succeeded`, result
`suggestion-5bfcc701-5c79-472d-ae7a-aa6269677983-computed`, digest
`efb16937ba71a18edbacc964c50903d56537a563720ccae465e9dcede12e31f9`, an
explicit incomplete first-15/last-5 selected window, and two candidates. The
real production Activity Center displays `AI 编目 · 可审阅`; resource details
display both page-specific OCR suggestions and the incomplete-content warning
with a clean console. No suggestion was accepted and no source bytes, OSS
object identity, or human-authoritative metadata changed.

Historical pre-override evidence established the earlier PDF.js range-reader
boundary for both representative
flows. New-upload job `23b6e0dc-a79d-457e-be59-f17a56736d6f` and legacy
re-catalogue job `3967581d-effb-47c2-b13c-d5478dbdcb95` both dispatched to
GitHub Actions/Compute and failed in `compute/src/pdf-text.ts` at the PDF.js
range transport callback with `#onReceiveData - no
PDFDataTransportStreamRangeReader instance found.` before OCR/Qwen. Live legacy
job `39022af0-1079-48ff-804d-02710794333e` shows the same worker boundary and
bounded RSS evidence. Historical run #40/job `96834998685` completed on the
prior worker path. GitHub Actions evidence is available through the authorized
browser route.

The common root cause is a stale/late range response racing PDF.js reader
removal. The existing `aborted` flag only covered whole-task abort and did not
guard the callback itself or the pre-destroy lifecycle. The provisional
`COMPUTE_PROVIDER` inference change remains fully reverted and is not part of
the working tree or any release.

The independent PDF.js repair gate was then run against the already-existing
60,585-byte Library PDF `golden-202608211339-u8o6iv-suggest-ocr.pdf` (resource
`ef2899ca-3b80-4158-9d0d-eb5d1840b14a`) on the repaired production release,
without a new upload or source/object/authoritative-metadata mutation. Run
`32634435946` / worker job `97181965279` created durable job
`3874578a-3d79-425a-a48f-0ba9f689e02d`, claimed attempt
`71b7f820-a425-4a81-990a-dc04cccd377b`, reached bounded PDF range access and
downstream extraction, persisted the callback/result digest and reviewable
suggestion candidates, and ended in `succeeded`. The worker RSS evidence was
clean (95,186,944 bytes start; 151,465,984 peak; 148,635,648 post-job).

The undispatched-job ambiguous-boundary regression models provider acceptance
before Core receipt persistence and a Core restart. The fresh reconciler keeps
one durable job/attempt, and Core's atomic claim admits exactly one worker to
source/range/OCR/model execution; the duplicate worker is rejected before
source access. This is recorded separately from the migration-025 release.

## Completed
- Added Owner-visible `待审核投稿 · N` navigation entry using the existing
  contribution list/review APIs; direct entry opens the existing review panel.
- Added normalized AI failure categories and `重新 AI 整理` retry actions in the
  Activity Center and resource-details suggestion panel.
- Added focused frontend regression coverage for pending review, failure
  categories, and retry behavior.
- Preserved failed durable job evidence; no jobs/files/objects were deleted or
  retried automatically.
- Added explicit Compute range-transport disposal before PDF.js destruction,
  callback guarding, and exact stale-reader assertion handling.
- Added a deterministic stale range-response regression; it fails with the
  prior unhandled PDF.js assertion and passes with the repair.
- Completed the independent existing-resource production PDF.js gate without
  mutating source bytes, OSS object identity, or human-authoritative metadata.
- Added a restart-shaped reconciler regression proving one provider execution
  across a lost dispatch receipt, plus the same-attempt GitHub workflow
  concurrency contract.
- Verified the live frontend asset identity, exact Core release, and complete
  migration history 001–025 from production.
- Reproduced the ordinary signed-in Owner resource/retry path and isolated the
  first current failure at worker Compute after UI/API/session/job/dispatch.
- Proved a 30-second parser budget still terminates the same real PDF at the
  deadline; retained the same H/Compute diagnosis and moved the bounded parser
  budget to 120 seconds inside the existing request/worker ceilings.
- Proved the 120-second worker also exhausts that deadline and added a bounded,
  non-content stage/range diagnostic so the exact stuck operation can be
  repaired instead of increasing the aggregate timeout again.
- Proved document load exhausts the 32 MiB aggregate range budget at 31 range
  requests plus the initial 1 MiB prefix; raised only that ceiling to 64 MiB.
- Proved the 64 MiB repair clears document load and reaches downstream OCR;
  extended only the total extraction window from 180 to 300 seconds and added
  the missing bounded OCR diagnostic label.
- Proved the exact 62,990,004-byte Owner UI retry succeeds end to end on
  `c9b87ba…` and displays a reviewable result without applying it.
- Established that >64 MiB PDFs are expected and replaced the fixture-specific
  aggregate ceiling locally with an exact-object-derived range policy plus a
  separately justified 1 GiB PDF.js allocation guard.
- Proved exact aggregate range access of 76,097,594 bytes across 73 bounded
  requests, above 64 MiB, on an existing approved production PDF.
- Preserved completed bounded OCR evidence as an explicit incomplete window at
  the unchanged aggregate deadline instead of increasing timeout constants.
- Completed the same normal Owner retry path through durable callback and real
  reviewable-result display on exact Compute source `ccde12d…`.

## Remaining
None for this incident.

## Blockers
None. STOP before starting the AI quality cohort, Internal Beta, invitations,
`UPLOAD-PERF01`, or unrelated work; those actions were not started by closure.

## Last Verification
```text
PRODUCTION_USER_ACCEPTANCE=PASS
INCIDENT_L1_AI_PRODUCTION01=CLOSED
INTERNAL_BETA_READY=true
OWNER_REAL_BROWSER_PATH=PASS
PRODUCTION_FRONTEND_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
PRODUCTION_CORE_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
SCHEMA_VERSION=v25 / 001-025
FIRST_FAILURE_BOUNDARY=H. WORKER_COMPUTE
ROOT_CAUSE=fixed aggregate PDF range ceiling was sized to fixtures instead of the admitted object, and the aggregate OCR deadline discarded already-completed bounded evidence
FIX_COMMIT=ccde12d0f1aadff484b42841eb1136061f86cb9b
BACKEND_BASELINE=364/364 PASS
FRONTEND_FOCUSED=175/175 PASS
FRONTEND_FULL=273/273 PASS
COMPUTE_CONTRACTS=2/2 PASS
COMPUTE=67/69 PASS / 2 expected local-runtime skips
COMPUTE_TYPECHECK=PASS
BACKEND_TYPECHECK=PASS
FRONTEND_TYPECHECK=PASS
WORKSPACE_TYPECHECK=PASS
FRONTEND_PRODUCTION_BUILD=PASS
BACKEND_BUILD=PASS
GIT_DIFF_CHECK=PASS
COMPUTE_PROVIDER_INFERENCE=REVERTED / NOT DEPLOYED
PRODUCTION_DIAGNOSIS=PASS (new-upload + legacy both fail at PDF.js range callback)
RANGE_TRANSPORT_REGRESSION=PASS (fails pre-fix on exact PDF.js assertion)
PDFJS_REPAIRED_RELEASE_E2E=PASS (independent existing-resource gate)
PDFJS_REPAIRED_RELEASE_LEGACY_E2E=PASS
RESOURCE_ALREADY_EXISTED=true
PRE_FIX_FAILURE_BOUNDARY=PDFJS_RANGE_READER
NEW_JOB_CREATED=true
DISPATCH=PASS
WORKER_CLAIM=PASS
PDF_RANGE_ACCESS=PASS
PDFJS_STALE_READER_ERROR_ABSENT=true
OCR_OR_DOWNSTREAM_EXTRACTION_REACHED=true
CALLBACK=PASS
TERMINAL_STATE=succeeded
DUPLICATE_DURABLE_JOBS=0
DUPLICATE_PROVIDER_EXECUTIONS=0
AMBIGUOUS_DISPATCH_RECOVERY=PASS
CURRENT_62_99MB_OWNER_PATH=PASS
LARGE_PDF_OVER_64MB_PATH=PASS
REAL_BROWSER_E2E=PASS
INCIDENT_CLOSED=true
```

## Next Action
STOP. Preserve this closed incident and its independent PDF.js/large-PDF gates;
do not start the quality cohort, Internal Beta, invitations, `UPLOAD-PERF01`, or
unrelated work from this closure.
