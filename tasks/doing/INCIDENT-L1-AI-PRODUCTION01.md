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
Owner real-browser production acceptance failed on 2026-08-24 and overrides all
earlier synthetic fixture, harness, CI, worker-terminal, and repository gates as
acceptance evidence. The incident is currently open and Internal Beta readiness
is revoked. The active task is to reproduce the normal signed-in Owner workflow
on the deployed website, identify the first broken boundary with live browser,
Core, schema, and durable-state evidence, then make and deploy only the smallest
repair before re-testing that same path.

```text
PRODUCTION_USER_ACCEPTANCE=FAIL
INCIDENT_L1_AI_PRODUCTION01=CURRENTLY_OPEN
INTERNAL_BETA_READY=false
OWNER_REAL_BROWSER_PATH=FAIL
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
ROOT_CAUSE=real production PDFs exceed the inherited 5,000 ms PDF.js inspection budget
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

The smallest repair changes only the Compute PDF inspection budget from 5,000
to 30,000 ms, preserving the 180,000 ms request and 12-minute workflow ceilings.
Compute typecheck and all 64 runnable focused tests pass; two release-local
runtime E2Es remain expected local skips. Publication and the same-resource
Owner-browser retest are pending, so no acceptance state has been advanced.

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
- Raised only the PDF parser budget to 30 seconds and passed focused Compute
  typecheck plus 64/64 runnable tests.

## Remaining
- Publish the exact repair commit used by the protected Compute workflow.
- Re-trigger the same real Library resource through the normal Owner UI and
  prove terminal success plus reviewable result display without applying any
  candidate or mutating source/metadata.

## Blockers
None for live diagnosis. Incident closure, the AI quality cohort, Internal Beta,
and unrelated work are blocked on `OWNER_REAL_BROWSER_PATH=PASS`.

## Last Verification
```text
PRODUCTION_USER_ACCEPTANCE=FAIL
INCIDENT_L1_AI_PRODUCTION01=CURRENTLY_OPEN
INTERNAL_BETA_READY=false
OWNER_REAL_BROWSER_PATH=FAIL
PRODUCTION_FRONTEND_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
PRODUCTION_CORE_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
SCHEMA_VERSION=v25 / 001-025
FIRST_FAILURE_BOUNDARY=H. WORKER_COMPUTE
ROOT_CAUSE=5,000 ms PDF inspection budget is too short for real production PDFs
BACKEND_BASELINE=364/364 PASS
FRONTEND_FOCUSED=175/175 PASS
FRONTEND_FULL=273/273 PASS
COMPUTE_CONTRACTS=2/2 PASS
COMPUTE=64/66 PASS / 2 expected local-runtime skips
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
```

## Next Action
Checkpoint and publish the exact parser-budget repair, then retry the same real
resource through the normal signed-in Owner UI and follow it through result
display. Do not accept candidates or mutate the source/authoritative metadata.
