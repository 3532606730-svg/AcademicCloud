# vNext latency ledger

**Date:** 2026-09-24
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
- A local browser probe with intercepted, in-memory API responses is a frontend
  diagnostic only. It does not include Fastify, SQLite, storage, or network
  latency and cannot close a normal-path measurement row.
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
| PDF first usable page | Native cross-origin iframe URL and source/page continuity were observed. The in-app browser did not paint the PDF page. A separate local Chromium probe visually displayed a one-page synthetic PDF but did not capture its first painted frame. | — | **Unmeasured**; iframe insertion and `load` are not page paint |
| Details / editor | Details, Citation, and editor interactions were visually exercised at six widths. A response-mocked local browser probe measured the warm Details panel only (below); no normal-path metadata or editor-save timestamps exist. | — | **Unmeasured normal path** |
| Download signing / TTFB / completion | A signed-in DOCX route returned Core authorization and a 13,639-byte file completed in an earlier live check. Browser automation later blocked file navigation with `ERR_BLOCKED_BY_CLIENT`. | — | **Partially observed, no TTFB**; blocked external browser step prevents a complete timing claim |
| Upload stages | SparkMD5-only local benchmark: 250 MiB ≈ 0.65–0.71 s on Node v24.16.0; checksum throughput is roughly 353–387 MiB/s for 10–250 MiB fixtures. | 0.65–0.71 s checksum | **Measured local stage only**; reserve, direct transfer, storage verification, and activation need a real network path |
| Workspace / Collections / Notes | Normal synthetic-backend browser flows passed save/reopen/reload, collection membership, reading flags, recovery, guarded Back, and isolated export. A response-mocked local browser probe measured the warm empty Research Desk only (below); no normal-path note-save timestamps exist. | — | **Unmeasured normal path** |

## Local browser diagnostic: response-mocked UI

On September 23, Playwright Chromium 153.0.8010.53 at 1280 × 720 opened the
actual Vite frontend at `http://127.0.0.1:4319/`. The API port was not running;
Playwright supplied in-memory responses for one synthetic PDF holding, its
Details record, and empty private Workspace lists. After warm-up, five repeated
open/close actions used a capture-phase click mark, a DOM-ready
`MutationObserver` mark, and two `requestAnimationFrame` callbacks for the next
paint opportunity. Values include React rendering and the mocked response path,
but exclude real backend and network work. Source HEAD was
`292d6591d89517fa6a29de0c9623e2b6c7ec3fd6` with concurrent uncommitted
frontend edits; this is a diagnostic snapshot, not a frozen candidate baseline.

| Warm interaction | Click → DOM ready (five samples, ms) | Click → two animation frames (five samples, ms) | What the mark proves |
|---|---|---|---|
| Open empty Research Desk | 12.9, 12.3, 11.7, 13.2, 11.8 | 30.7, 30.6, 31.1, 30.5, 31.3 | Empty note state appeared; no note save or reload was timed |
| Open Details | 17.9, 18.3, 18.0, 17.6, 17.5 | 47.1, 47.4, 47.1, 47.2, 47.2 | Bibliographic identity panel appeared; no metadata fetch from Core or editor save was timed |
| Open Reader shell | 10.9, 11.0, 10.5, 10.7, 11.0 to toolbar; 24.8, 24.7, 21.0, 24.0, 21.0 to authorized iframe insertion | 47.5, 47.8, 33.3, 47.7, 36.5 after iframe insertion | Reader controls and iframe appeared; the PDF page's first usable paint was not timed |

The one-page synthetic PDF was visible in a later Chromium screenshot. Its
viewer is a separate Chrome extension frame, so React's iframe event and the
two-frame mark cannot establish when the PDF page itself became usable. Repeat
these paths against a frozen source and the normal signed-in backend before
using any number as a product latency result.

## Signed-in local browser with real HTTP and SQLite

On September 24, headed Chromium 153.0.8010.53 at 1440 × 900 exercised the
compiled candidate through the existing isolated backend at port 4321. The
source was `103810b` plus the inherited responsive CSS and the existing-note
Reader authorization repair. The fixture used eight synthetic holdings,
temporary SQLite, real Auth/metadata/Workspace services and an in-memory
storage adapter. No browser API response interception or production writes
were used. These values include local HTTP and persistence, but not public
network, OSS or production-host latency.

Capture-phase clicks set the start mark; a MutationObserver recorded the
returned identity panel or reloaded note, with two animation frames as a
separate rendering-opportunity mark. Resource Timing records request start,
response headers and completion. The latter mark is not PDF paint.

| Interaction | Click to ready DOM, ms | Click to rendering opportunity, ms | HTTP evidence |
|---|---|---|---|
| First Details open in this document session | 318.7 | 346.9 | Request started at315.4; headers316.3; complete316.5. The delay preceded the API request; no server bottleneck is inferred |
| Four warm Details opens | 17.8 / 18.1 / 18.2 / 17.6 | 47.2 / 47.3 / 47.4 / 47.1 | Request start3.6–4.1; headers4.5–5.1; complete4.7–5.4 |
| Three metadata edits/saves | 21.6 / 5.2 / 17.5 | 46.2 / 32.1 / 47.2 | Save headers2.5–3.3; complete2.8–3.5; Library refreshes also completed |
| Three private note edits/saves, including re-fetch | 20.5 / 20.0 / 19.9 | 47.3 / 47.4 / 47.4 | Save headers2.3–3.4; complete2.5–3.7; notes re-fetch complete19.1–19.6. The last text also survived a full browser reload |

Artifacts: `output/playwright/roadmap-{details,research}-timing.log` and their
adjacent capture scripts. Four-width Reader checks at1440/1024/768/390 show no
document overflow. At768/390 the original and notes alternate instead of
competing for a narrow split panel; an existing note opens physical page3.
Screenshots show actual native PDF page content in this independent Chromium,
but its first painted frame was not timed. Production browser access was later
restored in the same continuation; the following baseline supersedes the
earlier access limitation.

## Signed-in production baseline before the combined release

On September 24, Chromium 153.0.8010.53 at1440×900 used the normal signed-in
website on exact deployed Core/frontend `7e2d1bf`. Three repeated Details opens
took4285.2 /471.8 /918.3ms from click to ready DOM, with separate rendering
opportunity marks4313.7 /496.4 /929.3ms. The first request did not start until
2886.6ms and returned headers at4283.4ms; subsequent request starts were17.5
and21.9ms, with headers at470.0 and916.4ms. These are public-path observations
including browser scheduling and network, not a server processing benchmark.
The first observation is not treated as a steady-state warm result. A screenshot
confirms Mongolia Today page1 actually painted; first paint time remains
unmeasured. No metadata, private research or source bytes were changed.

Evidence: `output/playwright/production-7e-details-timing.log` and
`output/playwright/production-7e-reader.png`. Candidate release measurements,
editing/save, transfer stages and live private Workspace remain separate gates.

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
