# vNext latency ledger

**Date:** 2026-09-23
**Scope:** local evidence for `ACADEMICCLOUD-VNEXT-REMEDIATION01`; no production
reads, object-storage benchmark, new service, or billable CI run.

This ledger separates measurements from observations and from work that needs a
normal signed-in production browser. A route is not marked measured because a
request returned `200`, an iframe emitted `load`, or a synthetic fixture looked
fast. All values below are wall-clock milliseconds unless stated otherwise.

## Evidence contract

- Synthetic service measurements use temporary SQLite databases, monotonic
  `performance.now()`, warm-up calls, paired samples, and DTO/cursor or
  persistence equivalence assertions.
- Browser observations are usability evidence only. The in-app browser did not
  paint the native cross-origin PDF, so it cannot supply a PDF first-paint mark.
- A production-network metric requires a normal signed-in browser path and must
  record at least `navigationStart`, request start, response headers, first
  usable content, and completion. No production timing is inferred from the
  local fixture.

## Current ledger

| Path | Evidence | Result | Status / limitation |
|---|---|---:|---|
| App/static delivery | Inherited exact public-asset check: startup JavaScript 511,320 → 425,585 bytes; initial JS+CSS 575,746 → 132,478 bytes. Current visual build is 435.00 kB JS (123.40 kB gzip), 68.67 kB CSS (12.59 kB gzip). The older public probe recorded one current gzip fetch at 2,313 ms for the 120,019-byte JS and 458 ms for the 12,459-byte CSS; the same probe recorded `/api/health` 409 ms, `/api/ready` 407 ms and anonymous session 404 ms. | bytes plus one-request elapsed | **Measured as transport probes only**; no current production TTFB, FCP, LCP, or app navigation timing |
| Normal Library list | `output/vnext/normal-list-benchmark.json`; 50-row page, identical DTO/cursor digests. Candidate medians at 100/1,000/10,000 holdings are sparse/newest 0.708 / 2.020 / 18.762 ms, sparse/title 1.113 / 3.913 / 40.003 ms, rich/newest 1.881 / 3.186 / 25.458 ms, and rich/title 2.935 / 6.408 / 57.016 ms. | see source artifact | **Measured synthetic service**; excludes HTTP, network, browser rendering |
| Metadata/search | `output/vnext/search-benchmark.json` and `metadata-only-search-benchmark.json`; 100/1,000/10,000 holdings, sparse/rich, all equivalence checks green. Candidate rich relevance medians: 2.49 / 23.48 / 324.96 ms; metadata-only rich author: 2.38 / 22.284 / 329.847 ms. | see source artifacts | **Measured synthetic service**; not a production SLA |
| Catalog Preview | `output/vnext/batch-list-benchmark.json`; candidate medians for 100 / 1,000 / 10,000 holdings (500 selected cap): 32.708 / 247.151 / 616.811 ms. Complete field plans and source snapshots are included. | 32.708 / 247.151 / 616.811 | **Measured synthetic service**; the completeness work adds cost and remains bounded |
| Catalog Apply | Same artifact; candidate actual transactions: 96.306 / 592.454 / 1,149.913 ms for 100 / 500 / 500 selected rows. Object keys, canonical values, audit rows, and integrity checks matched. | 96.306 / 592.454 / 1,149.913 | **Measured synthetic service**; this is the demonstrated bottleneck improvement |
| PDF first usable page | Native cross-origin iframe URL and source/page continuity were observed. The in-app browser did not paint the PDF page. | — | **Unmeasured**; do not claim first-paint or page-render latency |
| Details / editor | Details, Citation, and editor interactions were visually exercised at six widths; no route-level marks or controlled completion timestamps exist. | — | **Unmeasured**; add marks only in a future normal-path browser run |
| Download signing / TTFB / completion | A signed-in DOCX route returned Core authorization and a 13,639-byte file completed in an earlier live check. Browser automation later blocked file navigation with `ERR_BLOCKED_BY_CLIENT`. | — | **Partially observed, no TTFB**; blocked external browser step prevents a complete timing claim |
| Upload stages | SparkMD5-only local benchmark: 250 MiB ≈ 0.65–0.71 s on Node v24.16.0; checksum throughput is roughly 353–387 MiB/s for 10–250 MiB fixtures. | 0.65–0.71 s checksum | **Measured local stage only**; reserve, direct transfer, storage verification, and activation need a real network path |
| Workspace / Collections / Notes | Normal synthetic-backend browser flows passed save/reopen/reload, collection membership, reading flags, recovery, guarded Back, and isolated export. No timing instrumentation was installed. | — | **Unmeasured**; functional evidence does not imply latency evidence |

## Decisions from the ledger

1. Keep the SQLite search projection and one-plan Catalog Apply path. These are
   the only material service bottlenecks demonstrated by a controlled workload.
2. Keep complete Catalog Preview semantics despite the candidate Preview increase;
   it is bounded, preserves evidence/authority information, and is required for a
   safe human review. Do not trade away fields to chase a synthetic number.
3. Do not move checksum work to a Worker, retune chunk sizes, or increase upload
   concurrency without a browser/network measurement showing checksum or queue
   time dominates. The current local checksum stage is already small.
4. Do not add a resident telemetry service or a new dependency for this ledger.
   The remaining rows are evidence gaps, not permission to redesign the system.

## Required next evidence

Before calling the charter complete, one normal signed-in browser run should
capture, for a bounded synthetic or Owner-approved target, the following marks:

1. app navigation → first Library rows and warm list refresh;
2. Preview open → first usable PDF page (in a browser that can actually paint it);
3. Details open → metadata ready and editor save response;
4. download click → signing response headers → first byte → completion;
5. upload checksum → reserve → first transfer progress → storage verify → active;
6. Workspace note open → save acknowledgement → reload-visible state.

Each run must record browser, viewport, target identity, whether the path was
synthetic or real, and the exact source/runtime commit. Until then, the rows
remain explicitly unmeasured and are not silently converted into estimates.

## Source artifacts

- `docs/performance/L1-PERF01-transfer-performance.md`
- `output/vnext/normal-list-benchmark.json`
- `output/vnext/search-benchmark.json`
- `output/vnext/metadata-only-search-benchmark.json`
- `output/vnext/batch-list-benchmark.json`
- `frontend/scripts/checksum-benchmark.ts`
