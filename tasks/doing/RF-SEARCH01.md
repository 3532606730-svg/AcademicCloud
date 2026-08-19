# RF-SEARCH01 — Authority-Scoped Metadata and Name Search

## Task ID
RF-SEARCH01 — Authority-Scoped Metadata and Name Search

## Goal
Provide one bounded metadata/name search path across the canonical Library and other accessible resource surfaces without OCR full text or inaccessible-resource leaks.

## Scope
Implement a single search service/query contract with an explicit effective-authority predicate. Search authoritative display/original names and canonical metadata only, with bounded normalized query, result limit, stable ranking/tie-breaks, strict API, and responsive UI. The canonical Library membership/authority model from ADR-022/RF-SHAREDDEFAULT01 is the primary shared-corpus authority; do not create a second search path. No query history is persisted.

The first UI surface should be a quiet search field on the normal `资料库` catalogue, with results remaining inside the same scholarly product shell. Search must work before OCR/full-text exists and must not imply content search.

## Non-goals
- No PDF/text-content search, OCR, index/search server, embeddings, fuzzy external service, private-note/annotation search, suggestions based on inaccessible data, or production search analytics.
- No dependency on Personal Tags/Collections/Saved Views merely to make basic catalogue search available.

## Acceptance Criteria
- Every candidate is filtered by effective authority before ranking/counting/serialization; response totals, timing class, suggestions, duplicate markers, logs, and errors reveal no inaccessible row.
- No-match and only-inaccessible-match behavior are externally indistinguishable.
- Client owner/domain/role/member filters cannot expand authority; disabled accounts/sessions remain denied.
- Search terms are not written to governance audit, logs, analytics, local storage, or another account's state.
- Ranking and pagination are deterministic, bounded, Unicode/case behavior documented, and query complexity protected.
- Canonical Library and any account-scoped eligible surfaces reuse the same tested authority resolver; no alternate catalogue search may bypass it.
- UI supports keyboard/mobile, empty/loading/error states, safe highlighting/plain text, and no OCR/full-text claim.
- Migration is zero unless a separately reviewed local metadata index is required; dependency remains zero where feasible; focused compiled and independent leak/performance review pass.

## Relevant ADRs / Tasks
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `RF-OWNERSHIP01`, `RF-DOMAIN01`, `RF-SHAREDDEFAULT01`, `RF-META01`, `RF-METASUGGEST01`

## Relevant Modules / Files
- Library/research/Drive repositories and services
- new search service/HTTP module and effective-authority resolver
- `frontend/src/api.ts`, catalogue UI/components, `frontend/src/styles.css`
- authorization/non-disclosure/performance/frontend tests

## Current State
Development complete and green, including the Owner-review bounded repair pass, on `codex/project-memory-reconcile-20260817`. Backend `backend/src/library/search.ts` implements a deterministic bounded contract, `LibraryService.searchHoldings` reuses the canonical `#requireMember` effective-authority path before any matching/ranking/counting/pagination, and `GET /api/libraries/:libraryId/holdings/search` serves it. The accessible corpus is enumerated to exhaustion via keyset pagination (no silent truncation). Frontend `frontend/src/library-search.tsx` adds a quiet debounced, race-safe search field to the ordinary `资料库`; results stay in the same shell and open the existing `资料详情`. No production was touched, no migration/index/dependency was added.

## Query Contract (implemented)
- min 1 / max 100 characters (NFC); whitespace collapsed to single spaces; Latin case-insensitive; punctuation/whitespace ignored for matching; no query language, no regex, no fuzzy library.
- Result limit 1–100 (default 50); stable cursor pagination (opaque `rank:fileId`); deterministic tie-break by `(rank asc, fileId asc)`.
- The accessible corpus is collected page-by-page (keyset `listHoldingsPage`, page size 200) until exhausted, so search always covers the ENTIRE corpus; a defensive 500-page guard fails closed instead of silently returning a truncated result.

## Ranking Contract (implemented, deterministic)
1 exact canonical title → 2 title prefix/strong title → 3 exact authority label → 4 author+title → 5 exact identifier → 6 other canonical metadata → 7 original filename. Ties break on fileId. The author+title tier matches an explicitly whitespace-separated query where every part matches a person authority label or the canonical title and at least one part matches each; an unseparated string is never segmented into invented words.

## Completed
- Backend: pure search module (`search.ts`), service integration with authority-first filtering, HTTP route, and focused tests (unit 8, service 3, HTTP 1).
- Frontend: `searchLibraryHoldings` API method, `LibrarySearchField` with debounce/AbortController/request-identity race protection, clear-restores-folder behavior, localized copy, keyboard/Escape, mobile CSS, and 9 component tests plus 3 App integration tests.
- Owner-review repair: removed the silent 5,000-holding truncation (keyset pagination + fail-closed guard), repaired the author+title ranking tier (whitespace-separated part matching, no segmentation of unseparated strings), and removed the search error dismiss button (error stays until the query changes). Added regression tests for all three.
- Verified: backend 373 (372 pass + 1 release-local E2E skip), frontend 233, both typechecks, both production builds, `git diff --check` clean. Query text is never logged (route-template logging only) and never persisted.

## Remaining
- Owner review; then (only with new explicit production authorization) any deployment, and a real-browser production-before-cutover acceptance journey.

## Blockers
None for development. Production deployment, migrations, index servers, full-text/OCR search, query history, or external lookup require new Owner authorization.

## Last Verification
- Backend `tsc --noEmit` green; backend suite 373 (372 pass, 1 skip); frontend `tsc --noEmit` green; frontend suite 233/233; both production builds green; `git diff --check` clean.

## Next Action
Reconcile task/status/board, create the exact development + evidence checkpoints, push, prove `LOCAL_HEAD == TRACKING_HEAD == REMOTE_HEAD` with a clean worktree, then STOP FOR OWNER REVIEW before any RF-SEARCH01 production.

## Final Development Report

```text
TASK=RF-SEARCH01-OWNER-REVIEW-FIX
VERDICT=PASS/READY_FOR_OWNER_REVIEW

SILENT_CORPUS_TRUNCATION_FIXED=true
CORPUS_BOUNDARY_SEMANTICS=entire accessible corpus via keyset pagination; defensive 500-page guard fails closed (no silent truncation)
MIGRATION_CHANGED=false

AUTHOR_TITLE_QUERY_FIXED=true
AUTHOR_TITLE_EXAMPLE_RESULT=张帆 元代宰相制度研究 → author+title tier (rank 3)
RANKING_CONTRACT=exact title > title prefix/strong > exact authority > author+title (whitespace-separated parts) > exact identifier > other canonical metadata > original filename

ERROR_DISMISS_UX=error persists until query changes; dismiss affordance removed (no ghost error state)

BROWSER_ACCEPTANCE=NOT_RUN_DEV_ENV (preserved as a production-before-cutover gate)

BACKEND_FOCUSED_TESTS=14 (search unit/service/HTTP)
FRONTEND_FOCUSED_TESTS=9 (library-search)
BACKEND_FULL_TESTS=373 (372 pass + 1 release-local E2E skip)
FRONTEND_FULL_TESTS=233
BACKEND_TYPECHECK=PASS
FRONTEND_TYPECHECK=PASS
BACKEND_BUILD=PASS
FRONTEND_BUILD=PASS
GIT_DIFF_CHECK=PASS

FINAL_DEVELOPMENT_COMMIT=a8ce832 (code + search repair)
EVIDENCE_COMMIT=<docs-only reconciliation commit; recorded in the final synchronized report>

PRODUCTION_TOUCHED=false
LOCAL_HEAD=<final synchronized head; recorded in the final report>
TRACKING_HEAD=<final synchronized head>
REMOTE_HEAD=<final synchronized head>
WORKTREE_CLEAN=true

NEXT=STOP FOR OWNER REVIEW BEFORE RF-SEARCH01 PRODUCTION
```