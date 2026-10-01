# Bounded page-aware full-text evaluation

**Date:** 2026-09-23
**Status:** design/evaluation only; no extraction, index, retrieval, embedding,
or RAG rollout is authorized by this document.

## Question

Would a small, page-aware derived-text foundation provide enough research value
to justify its storage, invalidation, authorization, and local-compute cost?
The answer must be based on a bounded sample and stable source identity, not on
a whole-corpus OCR launch.

## Evaluation boundary

Use only a small set of already authorized sources in an isolated local fixture
or a separately approved offline copy. Do not read production objects merely to
fill a benchmark. No raw OCR page text or rendered image is persisted by this
evaluation. Existing front-matter OCR evidence remains governed by its current
bounded Compute contract.

The evaluation record for each candidate page contains only:

- `artifactVersionId` and immutable `sourceId`;
- one-based physical PDF page number for product locations;
- the existing one-based physical page number in Compute/Reader contracts; any lower-level renderer index remains an internal implementation detail;
- source/evidence origin and a digest of the bounded test input;
- measured bytes, peak memory, elapsed time, and whether the page was skipped.

## Questions and pass conditions

| Area | Evaluation question | Pass condition for a future proposal |
|---|---|---|
| Value | Does a researcher need page-level text for a concrete task that metadata and notes cannot serve? | At least one repeatable, source-grounded task with a reviewer-visible benefit |
| Identity | Can a result be attached to one immutable source generation and physical page without guessing? | `artifactVersionId + sourceId + page` is stable; no filename-only links |
| Authorization | Does every read inherit the current resource/Library and private-overlay authority? | Unauthorized resource, source, page, and private state are indistinguishable from absence |
| Invalidation | What happens after byte replacement, recycle, restore, or source loss? | Old derived rows become unavailable/stale by source identity; authored notes never silently rebind |
| Resource budget | Can the sample stay within the existing small host and outbound-only Compute limits? | Bounded bytes/RAM/time with concurrency one and no resident service |
| Cost | Is the value worth local disk/CPU/GPU and maintenance cost? | Zero added infrastructure/monthly cost and an explicit replace/delete plan |
| Privacy | Can derived text leak a private overlay or inaccessible source? | Cross-account and Owner-without-product-authority checks pass |

## Existing foundations to reuse

- ADR-043 defines `DocumentLocation` as resource/source plus a one-based physical
  page and keeps source generations immutable.
- The current Compute and Reader contracts use one-based physical pages, as
  corrected in ADR-043; adapters must verify page identity and test any internal
  renderer conversion explicitly.
- Source replacement and recycle preserve authored notes but make a linked
  source unavailable; no automatic reattachment is allowed.
- `pre-ocr-execution-plan.md` and ADR-031/037 keep heavy derived processing
  outside Core and prohibit full-document OCR/index/RAG expansion without a
  separate Owner decision.

## Decision matrix

| Horizon | Decision | Rationale |
|---|---|---|
| NOW | Keep stable source/page identity, private Workspace anchors, metadata search, and bounded front-matter evidence | Already implemented and directly useful; no new derived corpus |
| NEXT | Run the bounded value/identity/ACL/invalidation/resource evaluation described here | Produces evidence without writing OCR or index state |
| LATER | Consider an isolated derived-text adapter only after a passing evaluation and explicit Owner authorization | Requires a new contract, storage lineage, rebuild/invalidation policy, and release gate |
| EXPERIMENTAL | Offline prototype over disposable copies, with no product endpoint or persistent result | Allows value testing without changing Core or privacy semantics |
| DO NOT PRIORITIZE | Whole-corpus OCR, full-text index/search, embeddings, retrieval, RAG, or a resident OCR service in this remediation | Outside current scope, cost gate, and pre-OCR boundary |

## Acceptance record

The future evaluation report must include the source identities, sample/page
selection, task value observations, per-page byte/RAM/time measurements,
authorization and invalidation checks, and an explicit decision. Until that
record exists, this capability remains **NEXT / design-only** and is not a
product feature or a reason to alter the current release.
