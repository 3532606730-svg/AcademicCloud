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
The incident is not diagnosed. Repository records describe the last release as
healthy, while the pasted incident reports production-wide AI failure. The
existing `academiccloud-prod` SSH route has since been restored through the
approved execution path. A bounded read-only probe confirmed the exact release,
active service, zero restarts, and green loopback/public health and readiness.
The earlier alias failure was caused by the restricted sandbox not seeing the
user SSH configuration, not by DNS or host unavailability. GitHub API access is
blocked by the restricted CLI/keyring path and the in-app browser request was
denied by browser security policy.

The possible `COMPUTE_PROVIDER` inference repair was reverted and is not part of
the working tree or any release. Missing `COMPUTE_PROVIDER` remains a hypothesis,
not an established root cause. Explicit production configuration is preferred.

## Completed
- Added Owner-visible `待审核投稿 · N` navigation entry using the existing
  contribution list/review APIs; direct entry opens the existing review panel.
- Added normalized AI failure categories and `重新 AI 整理` retry actions in the
  Activity Center and resource-details suggestion panel.
- Added focused frontend regression coverage for pending review, failure
  categories, and retry behavior.
- Preserved failed durable job evidence; no jobs/files/objects were deleted or
  retried automatically.

## Remaining
- Establish production first-failure evidence for new upload and legacy
  re-catalogue.
- Determine whether any repair belongs in application code or deployment
  configuration.
- Deploy one coherent hotfix and run real production E2E only after evidence.

## Blockers
GitHub Actions API and browser inspection remain unavailable through the
restricted CLI/keyring and browser-security paths. Git index writes are also
blocked by the sandbox and the escalated Git probe was rejected by the execution
broker. Without durable job/Actions evidence, the common root cause and the two
required E2E outcomes cannot be proven.

## Last Verification
```text
BACKEND_BASELINE=364/364 PASS
FRONTEND_FOCUSED=175/175 PASS
FRONTEND_FULL=273/273 PASS
COMPUTE_CONTRACTS=2/2 PASS
COMPUTE=60/62 PASS / 2 expected local-runtime skips
BACKEND_TYPECHECK=PASS
FRONTEND_TYPECHECK=PASS
WORKSPACE_TYPECHECK=PASS
FRONTEND_PRODUCTION_BUILD=PASS
BACKEND_BUILD=PASS
GIT_DIFF_CHECK=PASS
COMPUTE_PROVIDER_INFERENCE=REVERTED / NOT DEPLOYED
PRODUCTION_DIAGNOSIS=BLOCKED (no production or Actions evidence path)
```

## Next Action
Complete `ACADEMICCLOUD-EXECUTION-ACCESS-RECOVERY01`; then trace both
representative jobs to the first failing boundary and only then implement/deploy
the smallest evidence-supported repair and perform real E2E acceptance.
