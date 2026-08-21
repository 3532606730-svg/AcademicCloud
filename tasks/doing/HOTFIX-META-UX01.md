# HOTFIX-META-UX01 — Library Sorting + Fast Naming + Batch Naming

## Task ID
HOTFIX-META-UX01

## Goal
One bounded same-schema product-usability hotfix: lightweight canonical-title
suggestions independent of OCR/Compute (fast naming), a manager-only batch
naming review/apply workflow, and server-authoritative Library sorting. The
production baseline is `c741455d7aa631d5b8c37149e8643a6a75b1cae8` / schema v22.
## Scope

### A. Fast naming
- After an eligible Library PDF becomes available or a suggestion is requested,
  generate and persist/expose the lightweight filename-derived candidate
  immediately; target user-visible latency ≤ 2 s under ordinary Core
  conditions.
- OCR/Compute remains an asynchronous enhancement; later OCR candidates may
  supersede/improve lightweight candidates without silently overwriting
  accepted canonical metadata.
- Preserve source fingerprint, stale protection, authorization, and CAS
  semantics. Do not auto-accept metadata. Do not rename the OSS object or the
  physical download filename. Canonical scholarly metadata remains
  authoritative for Library display.

### B. Batch naming
- Manager-only bulk naming for selected Library holdings: preview before
  mutation (current display name, proposed canonical title, source/confidence,
  per-item selection), edit/select/deselect, "select reliable suggestions"
  action, unresolved/low-confidence items unchanged by default.
- Apply uses the existing canonical metadata authority/CAS semantics; preflight
  stale/conflict conditions; partial item failure is reported per item without
  corrupting or rolling back unrelated successful items; no automatic bulk
  acceptance without explicit confirmation; OCR completion is not required.
- No physical batch file rename.

### C. Library sorting
- Server-authoritative sorting with stable pagination: newest (default, current
  behavior), oldest, title (canonicalTitle where available with the existing
  display-name fallback), size. Cursor semantics stay stable and deterministic
  per sort with a stable unique tie-breaker. Search relevance/ranking must not
  change. Sorting state stays coherent while loading more results.

## Non-goals
- No schema migration (STOP and report if one becomes necessary).
- No OSS/RAM/CORS/provider mutation; no paid infrastructure; no new broad
  credentials; no full-text OCR/RAG/embeddings; no physical-file automatic
  rename; no authority/person auto-merge; no upload-performance changes; no
  Compute-progress-bar work; no unrelated refactor.
- No internal-beta start or user invites.

## Acceptance Criteria
- Fast naming: lightweight suggestion available before Compute completes;
  meaningful filename cleaning cases; junk filename stays no/low-confidence
  rather than a fabricated title; accepted metadata never silently replaced by
  later OCR; stale source fails closed; repeated requests are idempotent.
- Batch naming: mixed selected/unselected items; high/low-confidence preview;
  user-edited candidate; stale item; conflicting/concurrent metadata version;
  one-item failure with other items succeeding safely; reload confirms accepted
  canonical metadata persisted.
- Sorting: newest; oldest; canonical title + fallback; size; tie-break
  determinism; multi-page pagination under each order; changing sort safely
  invalidates/restarts an incompatible cursor; Search ranking unchanged.
- Final gate (OWNER OVERRIDE 2026-08-21): no browser automation/golden
  journey/synthetic fixtures. The Owner performs manual product acceptance in
  production after deployment; pre-deploy safety is limited to backend/frontend
  typecheck, production build, `git diff --check`, no migration, no
  OSS/RAM/CORS/provider/credential/cost change, and a rollback pointer.

## Relevant ADRs
- ADR-014 privacy/ownership; ADR-022 canonical shared corpus; ADR-023 durable
  state reconciliation; ADR-025/027 bounded bibliographic suggestions; ADR-031
  Core/Compute boundary.

## Relevant Modules / Files
- `backend/src/suggestions/suggestion-service.ts`
- `backend/src/suggestions/lightweight-extractor.ts`
- `backend/src/suggestions/http.ts`
- `backend/src/suggestions/repositories.ts`
- `backend/src/persistence/sqlite/suggestion-repository.ts`
- `backend/src/library/library-service.ts`, `backend/src/library/library.ts`,
  `backend/src/library/repositories.ts`, `backend/src/library/holding-sort.ts`,
  `backend/src/library/pinyin.ts`, `backend/src/library/http.ts`
- `backend/src/persistence/sqlite/library-repository.ts`
- `backend/src/metadata/metadata-service.ts` (unchanged; CAS authority reused)
- `frontend/src/resource-details.tsx`, `frontend/src/App.tsx`,
  `frontend/src/shared-library.tsx`, `frontend/src/batch-naming.tsx`,
  `frontend/src/api.ts`, `frontend/src/i18n.ts`
- `backend/test/library/holding-sort.test.ts` (6 sorting tests)
- `backend/test/suggestions/suggestion-service.test.ts` (fast/batch tests)

## Current State
Implementation complete on branch `codex/project-memory-reconcile-20260817`;
pre-deploy verification green; production deployment pending (Owner-authorized
direct same-schema app-only deploy once minimum checks pass); Owner manual
product acceptance pending after deployment.

## Completed

### A. Fast naming
- `requestGeneration` persists the lightweight filename-derived run
  (`suggestion-<jobId>`) synchronously inside the request transaction —
  visible in ≤2 s independent of Compute/OCR; idempotent across re-requests.
- Junk filenames (scan123, IMG_…, DSC_…, document001, file12345, unknown.pdf,
  …) are rejected by the extended `plausible()` guard → `no_suggestions` with
  zero candidates instead of a fabricated title.
- Deliberate `《题名》（出版项）` filenames yield a `medium`-confidence title;
  bare plausible stems stay `low`.
- Compute completion persists a SECOND immutable run (`suggestion-<jobId>-computed`)
  with full window evidence; latest-run resolution surfaces it to the UI.
  This preserves the migration-019 append-only evidence model exactly: no
  trigger change, no migration, no candidate delete/update, runs/candidates
  remain immutable except status → accepted/stale.
- An accepted run is frozen: a later Compute callback succeeds the job against
  the accepted run without persisting anything new; canonical metadata is never
  silently rewritten.
- No auto-accept; no OSS filename/object rename; source fingerprint, stale
  fail-closed, authorization, and CAS semantics unchanged.

### B. Batch naming
- `GET /api/libraries/:libraryId/holdings/batch-naming?fileIds=…` (manager,
  ≤50) returns per-item preview: current display name, canonical title,
  metadata/source versions, material type, proposed title/confidence/source,
  available|unavailable. No OCR/Compute and no persistence.
- `POST …/batch-naming` applies only selected items through the existing
  canonical metadata authority/CAS per item in its own transaction: one
  stale/conflict/invalid item never rolls back the others; per-item result
  statuses applied|stale|conflict|invalid_input|not_found.
- Frontend dialog: preview with per-row checkbox/title edit/material type,
  "select reliable suggestions" (medium confidence), default selection = medium
  + no existing canonical title, explicit `window.confirm` before apply,
  per-item results list stays visible; low-confidence/unavailable unchanged by
  default; no physical batch rename.

### C. Library sorting
- `GET /api/libraries/:libraryId/holdings?sort=…&cursor=…` — six sorts:
  newest (default), oldest, title_asc, title_desc, size_desc, size_asc.
- Chinese Han sorts by normalized tone/case-insensitive Hanyu Pinyin
  (`pinyin-pro` deterministic SQLite function `pinyin_key` registered before
  statement preparation); punctuation/brackets/spacing dropped so they never
  dominate; Latin A–Z and digits inside the same normalized key system; one
  explicit deterministic numeric policy (plain ASCII digit order, "2" < "10");
  unsupported scripts fall back to NFC-normalized Unicode.
- Effective title = canonical title when non-empty, else display name
  (SQL `COALESCE(NULLIF(…), display_name)` mirrors the JS key generator).
- Stable keyset cursor (base64url JSON: sort/primary/secondary/fileId) with
  opaque bounds sized for long CJK pinyin keys; a cursor from another sort is
  rejected (`invalid_cursor`) so the client restarts pagination; identical keys
  tie-break by effective title then stable file identity; limit+1 fetch with
  `nextCursor` only when more rows exist.
- Search ranking path untouched.

## Remaining
- Build the exact artifact (`gh workflow run production-build.yml`), verify it
  on the host, deploy app-only same-schema, verify health/readiness/process/
  schema v22/001–022/SQLite integrity/FK/absence of immediate errors.
- Update durable docs with the production release identity; commit/push;
  synchronize the local checkout; STOP.
- Owner manual product acceptance (fast naming, batch naming, sorting,
  regression surfaces) — pending after deployment.

## Blockers
None. The earlier "suggestion run evidence is immutable" callback failure was
resolved by the superseding-run design (two immutable runs per job, latest wins)
instead of an in-place refresh; `replaceRun` machinery was removed.

## Last Verification
```text
BACKEND_SUITE=343/343 PASS (includes 6 sorting + fast/batch naming tests)
FRONTEND_SUITE=259/259 PASS
WORKSPACE_TYPECHECK=PASS (backend, frontend app+node, compute-contracts, compute)
PRODUCTION_BUILD=PASS (backend tsc, frontend typecheck+vite, compute)
GIT_DIFF_CHECK=PASS
MIGRATION_CHANGE=none (schema v22 / 001-022 untouched)
OSS_RAM_CORS_PROVIDER_CREDENTIAL_COST_CHANGE=none
CONFIG_CHANGE=none (.env/.yml/.yaml/.github/docker/nginx untouched)
```

## Next Action
Exact-artifact build + host verification + app-only same-schema deployment,
post-deploy health verification, durable-docs release update, commit/push/sync,
then STOP for Owner manual acceptance.
