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
Development complete and green at the RF-SEARCH01 development checkpoint on `codex/project-memory-reconcile-20260817` (base `7b975e0…`). Backend `backend/src/library/search.ts` implements a deterministic bounded contract, `LibraryService.searchHoldings` reuses the canonical `#requireMember` effective-authority path before any matching/ranking/counting/pagination, and `GET /api/libraries/:libraryId/holdings/search` serves it. Frontend `frontend/src/library-search.tsx` adds a quiet debounced, race-safe search field to the ordinary `资料库`; results stay in the same shell and open the existing `资料详情`. No production was touched, no migration/index/dependency was added.

## Query Contract (implemented)
- min 1 / max 100 characters (NFC); whitespace collapsed to single spaces; Latin case-insensitive; punctuation/whitespace ignored for matching; no query language, no regex, no fuzzy library.
- Result limit 1–100 (default 50); stable cursor pagination (opaque `rank:fileId`); deterministic tie-break by `(rank asc, fileId asc)`; corpus scan bounded at 5,000 holdings per request (no migration).

## Ranking Contract (implemented, deterministic)
1 exact canonical title → 2 title prefix/strong title → 3 exact authority label → 4 author+title → 5 exact identifier → 6 other canonical metadata → 7 original filename. Ties break on fileId.

## Completed
- Backend: pure search module (`search.ts`), service integration with authority-first filtering, HTTP route, and focused tests (unit 8, service 3, HTTP 1).
- Frontend: `searchLibraryHoldings` API method, `LibrarySearchField` with debounce/AbortController/request-identity race protection, clear-restores-folder behavior, localized copy, keyboard/Escape, mobile CSS, and 9 component tests plus 3 App integration tests.
- Verified: backend 371 (370 pass + 1 release-local E2E skip), frontend 233, both typechecks, both production builds, `git diff --check` clean. Query text is never logged (route-template logging only) and never persisted.

## Remaining
- Owner review; then (only with new explicit production authorization) any deployment.

## Blockers
None for development. Production deployment, migrations, index servers, full-text/OCR search, query history, or external lookup require new Owner authorization.

## Last Verification
- Backend `tsc --noEmit` green; backend suite 371 (370 pass, 1 skip); frontend `tsc --noEmit` green; frontend suite 233/233; both production builds green; `git diff --check` clean.

## Next Action
Reconcile task/status/board, create the exact development checkpoint, push, prove `LOCAL_HEAD == TRACKING_HEAD == REMOTE_HEAD` with a clean worktree, then STOP FOR OWNER REVIEW before any RF-SEARCH01 production.

## Final Development Report

```text
TASK=RF-SEARCH01
VERDICT=PASS/READY_FOR_OWNER_REVIEW

BASE_CHECKPOINT=7b975e0 (post RF-METASUGGEST-HARDEN01 closure)
FINAL_DEVELOPMENT_COMMIT=06e0072

SEARCH_SCOPE=entire accessible Library corpus
CURRENT_FOLDER_ONLY=false

FIELDS_SEARCHED=canonicalTitle, subtitle, alternativeTitles, author/editor/translator/compiler person authority labels, publisher/institution/place authority labels, dateStatement, identifiers (ISBN), type-specific canonical metadata, canonical display title, original filename
FULL_TEXT_SEARCH=false
OCR_BODY_SEARCH=false
QUERY_HISTORY_PERSISTED=false
NEW_DEPENDENCY=none
MIGRATION_CHANGED=false

AUTHORITY_FILTER_BEFORE_RANKING=true
INACCESSIBLE_MATCH_LEAK=false
DISABLED_ACCOUNT_DENIED=true

QUERY_MAX_LENGTH=100 (NFC, whitespace-collapsed)
RESULT_LIMIT=1..100 (default 50)
PAGINATION=opaque cursor (rank:fileId), deterministic
RANKING_CONTRACT=exact title > title prefix/strong > exact authority > author+title > exact identifier > other canonical metadata > original filename; ties on fileId

TITLE_SEARCH=yes
AUTHOR_SEARCH=yes
PUBLISHER_SEARCH=yes
IDENTIFIER_SEARCH=yes
ORIGINAL_FILENAME_FALLBACK=yes

CLEAR_QUERY_RESTORES_FOLDER=true
STALE_REQUEST_PROTECTION=true
KEYBOARD_UX=yes (Escape clears; result buttons keyboard-reachable)
MOBILE_UX=yes (narrow-layout CSS)
BROWSER_ACCEPTANCE=NOT_RUN_DEV_ENV (no browser automation present; interactions covered by jsdom/Testing Library tests)

BACKEND_TESTS=371 (370 pass + 1 release-local E2E skip)
FRONTEND_TESTS=233
BACKEND_TYPECHECK=PASS
FRONTEND_TYPECHECK=PASS
BACKEND_BUILD=PASS
FRONTEND_BUILD=PASS
GIT_DIFF_CHECK=PASS

PRODUCTION_TOUCHED=false
LOCAL_HEAD=06e0072 (development commit; final synchronized head recorded after this checkpoint)
TRACKING_HEAD=06e0072
REMOTE_HEAD=06e0072
WORKTREE_CLEAN=true

NEXT=STOP FOR OWNER REVIEW BEFORE RF-SEARCH01 PRODUCTION
```