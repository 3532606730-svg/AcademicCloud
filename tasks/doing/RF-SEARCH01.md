# RF-SEARCH01 — Authority-Scoped Catalogue Search

## Goal
Add one quiet metadata/name search path to the normal `资料库`, preserving effective authority before ranking/counting/serialization and keeping folder navigation as the normal cleared-query view.

## Current State
Development is complete and green, including Owner-review repairs and frontend pagination completeness. Exact historical immutable Linux x64 / Node 24 artifact is built and independently verified.

RF-SEARCH01 is not currently in production. The 2026-08-20 `OPS-STORAGE-APP-REPAIR01` deployment attempt nevertheless proved that repair source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` descends from this frozen candidate and ships its Search UI/API. That incompatible repair artifact briefly exposed Search before an application-only rollback restored release `604cb8daf310696353e99c30ce7a924dc71ef9d2`. The later compatible storage-only hotfix deployed exact `988bdbf052de1a39b47a1e22ac761c977eec72c8`, and final R3 deployed exact `08657727a17a7ea766ad0d74cc663fa40f91eee1`; both explicitly exclude Search. No RF-SEARCH01 behavior changed during those repairs, but the historical artifact is no longer a deployable production candidate because the baseline has advanced through storage and Core/Compute work.

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
PRODUCTION=ABSENT
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

Remain behavior-frozen until GOAL-BETA-PREP01 Phase 3. Then integrate the existing Search behavior onto the latest post-Compute baseline, satisfy the browser gate, build/verify a new exact artifact, deploy, reconcile durable state, and continue to L1-UX08 only if the changed-risk evidence is green.
