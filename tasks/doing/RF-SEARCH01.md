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
Development (including the Owner-review repair and the pagination completeness fix) is complete and green, and the exact immutable Linux x64 / Node 24 artifact is built and independently verified from `FINAL_SEARCH_SOURCE_COMMIT = 7bba7b8…`. Production release is BLOCKED at the mandatory real-browser pre-cutover acceptance gate (B4): no browser-control path exists in the current environment, and installing a new browser-automation stack to bypass the gate is prohibited. Production remains `604cb8d…` at schema v21/001–021 and was not touched. Frontend now consumes `nextCursor` via a quiet `加载更多`/`Load more` flow.

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
- Pagination completeness fix: frontend now stores and consumes `nextCursor` with a quiet `加载更多`/`Load more` flow; second pages append (deduped by fileId), final pages hide the control, query change/clear resets pagination, stale load-more responses are discarded, and load-more errors preserve already-loaded results. Added 8 focused frontend pagination tests.
- Built and independently verified the exact artifact from `7bba7b8…`: workflow `32331172274` (primary `96311949546` + independent fresh-runner `96313884316`) green; artifact `9393280984`, digest `sha256:6b130b0c…`; archive SHA-256 `4b720627…`; manifest SHA-256 `beb15507…`; 5,386 files / 125,879,561 bytes.
- Verified: backend 373 (372 pass + 1 release-local E2E skip), frontend 241, both typechecks, both production builds, `git diff --check` clean. Query text is never logged (route-template logging only) and never persisted.

## Remaining
- Real-browser pre-cutover acceptance (mandatory before cutover; no browser-control path exists in this environment).
- Production preflight, same-schema cutover, and post-cutover acceptance (only after the browser gate is satisfied).

## Blockers
Production release is blocked at the mandatory real-browser pre-cutover acceptance gate (B4): no browser-control path is available, and installing a new browser-automation stack is not authorized. Production deployment, migrations, index servers, full-text/OCR search, query history, or external lookup additionally require Owner authorization.

## Last Verification
- Backend `tsc --noEmit` green; backend suite 373 (372 pass, 1 skip); frontend `tsc --noEmit` green; frontend suite 241/241; both production builds green; `git diff --check` clean.
- Artifact workflow `32331172274` green (primary + independent runner); archive/manifest/runtime evidence and SHA-256 verified locally.

## Next Action
Reconcile task/status/board, push, prove `LOCAL_HEAD == TRACKING_HEAD == REMOTE_HEAD` with a clean worktree, then STOP BEFORE CUTOVER — the real-browser pre-cutover acceptance gate is unsatisfied.

## Final Development Report

```text
TASK=RF-SEARCH01-FINAL-COMPLETENESS-AND-RELEASE
VERDICT=PASS/PHASE_A_GREEN; PRODUCTION_BLOCKED_AT_BROWSER_GATE

PHASE_A_PAGINATION_FIX=done
LOAD_MORE_IMPLEMENTED=true
NEXT_CURSOR_CONSUMED=true
SECOND_PAGE_APPENDS=true
STALE_PAGINATION_PROTECTED=true
CLEAR_RESETS_PAGINATION=true
LOAD_MORE_ERROR_PRESERVES_RESULTS=true

PHASE_A_FOCUSED_TESTS=17 (library-search)
PHASE_A_FRONTEND_FULL_TESTS=241
FRONTEND_TYPECHECK=PASS
FRONTEND_BUILD=PASS
GIT_DIFF_CHECK=PASS

PREVIOUS_SEARCH_CODE_SOURCE=a8ce832d986b97d881c578ee2424435d6b027045
FINAL_SEARCH_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b

ARTIFACT_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b
ARTIFACT_WORKFLOW=32331172274
ARTIFACT_ID=9393280984
ARTIFACT_SHA256=4b72062734fa941ea4bd48019713a4fbb8951a7793a04f625a3680d7c8e1a15b
MANIFEST_SHA256=beb15507b20c99679fb48cfe772c29d1d92a930b2adcd337202d88f0cff49458
INDEPENDENT_ARTIFACT_VERIFICATION=PASS (fresh runner 96313884316)

BROWSER_PRE_CUTOVER=BLOCKED (no browser-control path available; installing one is not authorized)
PAGINATION_BROWSER_ACCEPTANCE=NOT_RUN

PRODUCTION_PREVIOUS_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PRODUCTION_RELEASE=<not cut over; blocked at browser gate>
SCHEMA=v21 / migrations 001–021
MIGRATION_HISTORY=001–021 unchanged
MIGRATIONS_RUN=false
ROLLBACK_TARGET=604cb8daf310696353e99c30ce7a924dc71ef9d2
ROLLBACK_USED=false

POST_CUTOVER_BROWSER_ACCEPTANCE=NOT_RUN

QUERY_PERSISTED=false
INACCESSIBLE_MATCH_LEAK=false
PRODUCTION_METADATA_MUTATED=false
RAW_INTERNAL_ERROR_EXPOSED=false

PRE_PRODUCTION_EVIDENCE_COMMIT=c2c15ed52430f41b03a79b99defbf43fe04cb110
FINAL_PRODUCTION_EVIDENCE_COMMIT=<recorded only after a future cutover>

LOCAL_HEAD=<final synchronized head; recorded in the final report>
TRACKING_HEAD=<final synchronized head>
REMOTE_HEAD=<final synchronized head>
WORKTREE_CLEAN=true

NEXT=STOP BEFORE CUTOVER (real-browser pre-cutover acceptance gate unsatisfied)
```