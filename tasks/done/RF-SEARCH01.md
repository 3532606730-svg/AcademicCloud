# RF-SEARCH01 — Authority-Scoped Catalogue Search

## Goal
Add one quiet metadata/name search path to the normal `资料库`, preserving effective authority before ranking/counting/serialization and keeping folder navigation as the normal cleared-query view.

## Current State
Complete in production. Owner-review repairs, pagination completeness, authority/
ranking tests, desktop and 390×844 production-browser journeys, new exact
artifact verification, and deployment are green. The historical artifact was
never reused.

Post-Compute ancestry verification proved frozen candidate `7bba7b8…` was
already an ancestor of Phase 2 source `1c3bb10…`; Search-specific files remained
byte-identical and the newer shared frontend retained the contract. Phase 3
therefore required no cherry-pick or redesign, but it did correct the earlier
absence claim and re-established the required browser-before-final-release
sequence on new exact source `b19f9dc5…`.

```text
FINAL_SEARCH_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b
HISTORICAL_ARTIFACT_WORKFLOW=32331172274
HISTORICAL_ARTIFACT_ID=9393280984
HISTORICAL_ARTIFACT_SHA256=4b72062734fa941ea4bd48019713a4fbb8951a7793a04f625a3680d7c8e1a15b
HISTORICAL_MANIFEST_SHA256=beb15507b20c99679fb48cfe772c29d1d92a930b2adcd337202d88f0cff49458
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
FRONTEND_FULL_TESTS=241
BACKEND_FULL_TESTS=373 (372 pass + 1 release-local E2E skip)
MIGRATION_CHANGED=false
PRODUCTION_SOURCE=b19f9dc5b48e1976127704712e08a8655b1fadd5
PRODUCTION_ARTIFACT_ID=9424397852
PRODUCTION_ARTIFACT_RUN=32417182890
PRODUCTION=PASS
```

## Implemented Contract

- Non-empty query searches the entire accessible Library corpus, not the current folder.
- Effective Library authority is established before matching/ranking/counting/pagination.
- Fields are bounded to canonical metadata/authority/display/original filename; no PDF/OCR body/private overlay/audit/query history.
- Ranking remains deterministic: exact title > strong title > exact authority > author+title > exact identifier > other canonical metadata > original filename.
- Entire accessible corpus is enumerated with keyset pagination; defensive guard fails closed rather than silently returning a truncated result.
- Frontend uses debounce + AbortController/request identity.
- Clearing restores the exact ordinary current-folder catalogue.
- Search results open the existing `资料详情`.
- Frontend consumes `nextCursor` using `加载更多` / `Load more`, appends pages, dedupes by `fileId`, clears pagination on query change/clear, rejects stale load-more responses, and preserves loaded rows on pagination error.

## GOAL-BETA-PREP01 Phase 3 authorization

Search production closure is now explicitly authorized **only after** GOAL-BETA-PREP01 Phase 1 and Phase 2 are green and Core/Compute production cutover is stable.

Do not deploy the historical Search artifact directly.

Required Phase 3 procedure:

1. recover the exact latest post-Compute production/source baseline;
2. compose/cherry-pick/reapply only the already-green RF-SEARCH01 behavior needed on that baseline, preserving the implemented contract above;
3. resolve only concrete merge/integration conflicts caused by newer baseline work; do not redesign Search;
4. run changed-risk backend/frontend tests plus the mandatory real-browser Search journey;
5. build and independently verify a **new exact artifact** from the integrated source;
6. deploy only after the exact browser gate passes;
7. verify release identity and confirm no regression to Compute, upload/download, Library, or metadata behavior.

## Browser Journey Required Before Cutover

At minimum:

- normal Library browse;
- Chinese title;
- author;
- explicit author+title (`张帆 元代宰相制度研究` or a safe equivalent fixture);
- original filename fallback;
- no result;
- clear restores folder state;
- result opens existing details;
- rapid query changes do not show stale results;
- keyboard/Escape;
- narrow/mobile;
- pagination with >50 safe fixture matches where available;
- Member path where safely available.

Do not manufacture or mutate production metadata just to satisfy acceptance.

## Non-goals

No migration, full-text/OCR search, embeddings, RAG, query history, external lookup, fuzzy dependency, index server, infrastructure rewrite or unrelated cleanup.

## Next Action

Complete. Preserve the behavior and historical-artifact prohibition. Continue
GOAL-BETA-PREP01 Phase 4 with L1-UX08 only.

## Phase 3 production evidence

- Focused backend Search tests: 14/14 pass.
- Focused frontend Search/App tests: 137/137 pass; all-workspace typecheck pass.
- Pre-cutover production browser: Library browse, Chinese title, author,
  author+title, original filename fallback, no result, rapid-query stale safety,
  Escape/clear restoration, and details open pass.
- 390×844 real-browser viewport: mobile breakpoint, fixed bottom navigation,
  workspace clearance, Search result, and clear restoration pass; viewport reset.
- Production corpus has fewer than 50 safe rows and no safely available Member
  session. No metadata/account was manufactured; frozen deterministic tests
  cover pagination and Member non-disclosure.
- Exact source: `b19f9dc5b48e1976127704712e08a8655b1fadd5`.
- Build run/jobs: `32417182890` / `96580888945` / `96581600694`.
- Artifact `9424397852`; GitHub SHA-256
  `594dea1b1f6743ca0ead3558215e7ea26ab057336475ae1908a373f24f9af26b`;
  archive SHA-256
  `e75f0f1c53e1f0861692db2d58c262d8772232e52610d8fc4bdb98d4dacca6a8`;
  manifest SHA-256
  `e152e01b8cd4e9ecd4c4ef1a058c4b555e97a21d3404b0687c7d6ca70d8d8a4a`.
- Deterministic rebuild, independent runner, local hash, and production-host
  verifier pass; 4,789 files / 34,151,198 bytes.
- Runtime tree is byte-identical to previous `1c3bb10…` except manifest source
  identity. Production now selects `b19f9dc5…`; previous `1c3bb10…` is the
  same-schema application-only rollback.
- Exact process CWD, active service/zero restarts, one loopback listener,
  loopback/public health/readiness, unchanged schema v22/history 001–022,
  unchanged SQLite counts, integrity `ok`, zero foreign-key violations, and the
  post-deploy Search journey pass.
- No migration, database/source-object/metadata, credential, Compute,
  OSS/RAM/CORS, Nginx, memory-limit, or cost mutation; rollback not required.
