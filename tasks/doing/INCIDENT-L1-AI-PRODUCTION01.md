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
destructive data operation, schema migration, or uncontrolled legacy wave.

## Acceptance Criteria
The first failing production boundary must be established with concrete
evidence for one new-upload job and one legacy re-catalogue job before any
backend production repair or deployment. Real production E2E must prove both
flows, and the contribution review route must remain authoritative and
non-duplicated.

## Relevant ADRs
ADR-014, ADR-022, ADR-023, ADR-031, ADR-033, ADR-034.

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

## Remaining
- Commit/push the bounded Compute repair and build an immutable Linux artifact.
- Create/verify the v24 rollback backup pair and deploy the application-only
  hotfix through the established runbook.
- Run one real new-upload and one explicit legacy re-catalogue production E2E,
  then verify contribution review and duplicate/authority/privacy invariants.

## Blockers
None for diagnosis or implementation. Production deployment remains pending
the bounded checkpoint, artifact, backup, and changed-risk E2E gates below.

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
```

## Next Action
Checkpoint/push the Compute repair, build and verify the immutable v24
application artifact, deploy with the existing same-schema rollback contract,
and complete both mandatory real production AI E2Es before closing the incident.
