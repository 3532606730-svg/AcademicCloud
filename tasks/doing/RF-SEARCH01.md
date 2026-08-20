# RF-SEARCH01 — Authority-Scoped Catalogue Search

## Goal
Add one quiet metadata/name search path to the normal `资料库`, preserving effective authority before ranking/counting/serialization and keeping folder navigation as the normal cleared-query view.

## Current State
Development is complete and green, including Owner-review repairs and frontend pagination completeness. Exact immutable Linux x64 / Node 24 artifact is built and independently verified.

RF-SEARCH01 is not currently in production. The 2026-08-20 `OPS-STORAGE-APP-REPAIR01` deployment attempt nevertheless proved that repair source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` descends from this frozen candidate and ships its Search UI/API. That incompatible repair artifact briefly exposed Search before an application-only rollback restored release `604cb8daf310696353e99c30ce7a924dc71ef9d2`. The later compatible storage-only hotfix deployed exact `988bdbf052de1a39b47a1e22ac761c977eec72c8` and explicitly excluded Search. No RF-SEARCH01 source or artifact was modified or rebuilt, but durable state must not describe the failed attempt as untouched.

```text
FINAL_SEARCH_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b
ARTIFACT_WORKFLOW=32331172274
ARTIFACT_ID=9393280984
ARTIFACT_SHA256=4b72062734fa941ea4bd48019713a4fbb8951a7793a04f625a3680d7c8e1a15b
MANIFEST_SHA256=beb15507b20c99679fb48cfe772c29d1d92a930b2adcd337202d88f0cff49458
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
FRONTEND_FULL_TESTS=241
BACKEND_FULL_TESTS=373 (372 pass + 1 release-local E2E skip)
MIGRATION_CHANGED=false
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

## Production Blockers

RF-SEARCH01 is frozen; do not modify/rebuild without a concrete defect.

Production cutover is blocked by:

1. `OPS-STORAGE-INCIDENT01` — current storage/API incident must be resolved and core storage-backed journeys proven healthy;
2. mandatory real-browser pre-cutover acceptance — not performed or authorized during the failed storage-repair deployment.

The existing artifact remains valid through docs/planning-only commits.

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

STOP search work. Resolve `OPS-STORAGE-INCIDENT01` first. Then satisfy the real-browser gate against the exact release candidate and proceed only under explicit production authorization.
