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
The first failing production boundary is established for both representative
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

## Remaining
- Checkpoint/push the reconciler execution gate and migration-025 release.
- Create/verify the v25 rollback backup pair and deploy the automatic-admission
  release through the established runbook.
- Prove a real new-upload automatic-AI E2E separately; the existing-resource
  run satisfies only the independent PDF.js repair gate.

## Blockers
None for the bounded repository checkpoint. The migration-025 production
deployment and new-upload automatic-AI E2E remain pending their release gates.

## Last Verification
```text
BACKEND_BASELINE=364/364 PASS
FRONTEND_FOCUSED=175/175 PASS
FRONTEND_FULL=273/273 PASS
COMPUTE_CONTRACTS=2/2 PASS
COMPUTE=61/63 PASS / 2 expected local-runtime skips
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
Checkpoint the reconciler/automatic-admission release, build and verify the
immutable migration-025 artifact, deploy with the v25 rollback contract, and
then prove `NEW_UPLOAD_AI_AUTO_TRIGGER` and `NEW_UPLOAD_AI_E2E` separately from
the completed PDF.js repair gate.
