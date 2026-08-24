# ADR-033 — PP-OCRv6 Small plus Qwen3 for Ephemeral Bibliographic Compute

**Date:** 2026-08-22
**Status:** Accepted

## Context

`L1-INTELLIGENT-LIBRARY01` requires automatic, bounded cataloguing of newly
admitted PDFs without moving heavy inference into the 1 GiB-class Core host.
The decision must cover modern Chinese and Japanese publications, traditional
Chinese and vertical pages, modern editions and facsimiles of historical
sources, strict structured output, cold-start and memory cost, maintainability,
and safe failure. Compute is non-authoritative; Core retains job, source,
callback, validation, CAS, and human-field authority.

Four current official options were screened:

1. PP-OCRv6 small document reading followed by a small text-only Qwen model;
2. PP-OCRv6 medium followed by the same reasoning model;
3. PaddleOCR-VL 1.6 document parsing followed by separate bibliographic
   reasoning; and
4. direct Qwen3-VL-2B visual reading and bibliographic reasoning.

The comparison is deliberately bounded. It is not a general OCR benchmark or
authorization for persistent whole-document extraction.

## Decision

Use sequential, memory-only **PP-OCRv6 small → Qwen3-1.7B Q8_0 → deterministic
Core/contract validation** for the Layer-1 production path.

- PP-OCRv6 uses exact PaddleOCR 3.7.0 and PaddlePaddle 3.3.1 wheels, the exact
  official `PP-OCRv6_small_det` and `PP-OCRv6_small_rec` revisions and payload
  hashes, and a persistent JSONL sidecar only for the lifetime of one clean
  Compute process. Page images and OCR text remain in memory.
- The Paddle process closes before Qwen starts. Qwen3-1.7B Q8_0 runs through an
  exact llama.cpp release on loopback only, at temperature zero and fixed seed,
  and must satisfy a strict JSON schema.
- Every populated fact carries field confidence and hashed page/source
  provenance. The callback retains validated structured evidence, never raw OCR
  text or rendered pages. Core alone decides whether safe defaults apply.
- `auto_apply` requires overall and per-populated-field confidence of at least
  85, zero warnings, all required evidence, valid controlled values, and all
  deterministic quality checks. Explicit unconflicted labels are parsed by the
  trusted worker and outrank the model's self-reported status; unsupported or
  model-uncertain facts without matching explicit evidence are discarded.
  Otherwise the result is `ambiguous` or `no_bibliography`; unsupported facts
  stay null.
- Human-authoritative fields are never overwritten. Contributor identity is
  never supplied by AI; Core may bind only one exact same-domain person match.
- Upload/admission completes independently. Any render, OCR, reasoner, schema,
  callback, or dispatch failure leaves the file usable and produces no false
  storage failure.

PP-OCRv6 medium is not selected initially. Its official recognition accuracy
is higher, but the small tier is already a 50-language 5.2M-parameter model and
the incremental accuracy does not yet justify the larger cold-start and working
set for a bounded title/front-matter path. A future evidence-backed revision may
change only this adapter pin without changing Core authority.

PaddleOCR-VL 1.6 is not selected for the ordinary path. It is a capable 0.9B
document parser with explicit ancient-document and rare-character strengths,
but its document-parser dependency/runtime surface overlaps with the separate
bibliographic reasoner and adds complexity that the initial bounded cases do
not require. It remains a candidate for a future hard-page escalation, not a
silent fallback.

Direct Qwen3-VL-2B is also not selected for every page or as an automatic
Layer-1 escalation. The qualification uses
its exact official GGUF revision with a Q4_K_M language model and Q8_0 vision
projector on the same representative rendered pages. These assets are
qualification-only and are absent from the production runtime. Even where the
direct path reads a page correctly, the selected pipeline keeps document
reading independently testable and uses a substantially smaller OCR component
whose official multilingual recognition evidence is stronger for this task.
The final exact comparison did not complete a direct-visual case inside its
bounded comparison window; an earlier diagnostic comparison completed two of
three but missed the traditional vertical title/class pair and took more than
twice the selected pipeline's elapsed time. Difficult pages therefore remain
reviewable instead of silently triggering a second production model.

## Evidence basis

Official evidence used for the feasibility decision:

- [PP-OCRv6 documentation](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html)
  defines small/medium tiers and unified Simplified Chinese, Traditional
  Chinese, Japanese, English, and 46 Latin-language support.
- The official
  [PP-OCRv6 small recognition model card](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec)
  reports 5.2M parameters and its own benchmark values of 77.0 for Traditional
  Chinese, 71.1 for ancient text, and 88.2 for Japanese; medium improves those
  figures to 78.6, 72.4, and 90.5 respectively.
- The official
  [PaddleOCR-VL-1.6 model card](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6)
  describes the 0.9B document parser, its ancient/rare-character improvements,
  and the additional `doc-parser`/serving paths.
- The official
  [Qwen3-VL-2B GGUF model card](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF)
  defines separate language and vision-projector assets and llama.cpp visual
  inference. Qwen's official
  [llama.cpp guide](https://github.com/QwenLM/Qwen3/blob/main/docs/source/run_locally/llama.cpp.md)
  supports the selected loopback runtime family.

Exact GitHub-hosted run `32574319098`, job `97034473517`, qualified source
`0fa04b43a80ac4d1486323c700e737850b081222` on a clean `ubuntu-24.04`
runner:

- real PP-OCRv6 recognized the rendered end-to-end sample with zero skips;
- the selected PP-OCRv6-small → Qwen3-1.7B path passed all three rendered
  modern Chinese, traditional vertical, and Japanese title/class cases in
  198,499 ms; each was a valid warning-free `auto_apply` result;
- all seven bounded bibliography cases passed. The six sufficiently evidenced
  cases produced the expected title, material class, carrier/source
  distinction, and `auto_apply` status at confidence 90 with zero warnings;
  the conflicting case remained `ambiguous` at confidence 0 with controlled
  warning codes;
- encompassing GNU `time` measured 3,396,112 KiB maximum RSS for the seven-case
  probe and 3,298,672 KiB for the visual comparison, both below 6 GiB;
- the qualification-only direct Qwen3-VL comparison timed out safely after
  182,137 ms without producing a selected result; the production pipeline is
  unaffected and contains none of its assets;
- strict contracts, failure behavior, log/output privacy scanning, and static
  production-shell safety passed. The run published zero artifacts and no
  private PDF was processed.

## Pin set

The complete production identity is enforced by source constants, build-time
hash checks, a release-local runtime manifest, and runtime verification:

- PaddleOCR `3.7.0` wheel SHA-256
  `c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338`;
- PaddlePaddle `3.3.1` CPython 3.12 Linux x86-64 wheel SHA-256
  `9016fc497213e1101261684321fbb31ef5960019ef39cb07ded27bc70e2a9858`;
- `PP-OCRv6_small_det@106c97591b235f607453300d9fc8c1cad1b25488`,
  payload SHA-256 `5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da`;
- `PP-OCRv6_small_rec@bd619643acac4b9650c040234da8d944476ee3f1`,
  payload SHA-256 `406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907`;
- `Qwen3-1.7B-GGUF@90862c4b9d2787eaed51d12237eafdfe7c5f6077`,
  `Q8_0` SHA-256
  `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a`;
- llama.cpp `b10218` / revision `de69995`, Linux x64 release-asset
  SHA-256 `78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b`;
- prompt `l1-intelligent-library01-prompt-v1` and ruleset
  `l1-intelligent-library01-v1`.

The runtime also hashes the resolved Paddle Python dependency inventory. The
qualification-only direct comparison pins
`Qwen3-VL-2B-Instruct-GGUF@52d6c8ffea26cc873ac5ad116f8631268d7eb503`
with Q4_K_M language SHA-256
`089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae`
and Q8_0 projector SHA-256
`f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82`.

## Privacy, cost, and operations

### 2026-08-24 large-PDF range-policy amendment

The production incident proved that a fixed aggregate range ceiling is not a
valid proxy for bounded front-matter work. A 62,990,004-byte approved PDF
required 61,941,428 bytes of later range access in addition to its initial
prefix merely to load the document. A 64 MiB ceiling therefore encoded one
fixture's size rather than a support or resource boundary. PDFs larger than 64
MiB are an expected product input: browser uploads retain the 5 GiB file
contract, the signed Compute source descriptor remains bounded at 4 GiB, the
large-file UX covers 50–200 MB, and the approved production corpus observed at
this checkpoint extends through 922,469,003 bytes.

Compute now derives the aggregate PDF range budget from the exact stat-verified
object length. The maximum range-request count is `ceil(object length / 1
MiB)` and the existing 1 MiB per-request provider bound remains. Initial and
later reads count toward the same exact-object allowance; the policy does not
grow a constant in response to each fixture.

PDF.js 6.2.108's range-backed `ChunkedStream` allocates a full-length
`Uint8Array` before parsing. The parser therefore has a separate 1 GiB input
buffer ceiling, selected to cover the largest approved production PDF observed
above while retaining headroom inside the already-qualified sub-6-GiB
intelligent worker. A source between that parser ceiling and the 4 GiB signed-
source ceiling fails with the stable Compute limit result before any object
read; the admitted file remains usable and canonical metadata is untouched.
This is a parser-allocation guard, not an aggregate-access allowance. The clean
worker log may record only source byte length, derived budget, range count, and
range bytes; no URL, object key, content, OCR text, candidates, or metadata is
added.

All heavy work stays in the existing ephemeral GitHub-hosted adapter, one clean
process/job and concurrency one. There is no paid API, paid GPU, second server,
Core daemon, provider mutation, private-PDF cache, rendered-image cache, or
artifact upload. Only immutable public model/runtime assets may be cached in a
future separately reviewed optimization.

Production builds the verified runtime under a staging directory, promotes it
atomically, and executes from that exact tree. The ordinary path has no direct
Qwen-VL or PaddleOCR-VL asset. Tesseract remains present only as an explicit
legacy/emergency adapter and is not selected by the production workflow.

## Rollback and consequences

Migration 024 retains strict structured AI evidence as immutable, non-canonical
history and does not persist raw page/OCR text. Canonical values remain in the
normalized migration-023 domain. A pre-migration rollback therefore requires
the standard stopped-service database backup paired with the previous exact
application release.

The decision favors a small replaceable document-reading adapter and explicit
reasoning/validation boundary. Difficult vertical, damaged, or layout-heavy
pages may remain ambiguous. That is an accepted safe failure, not permission to
guess or to add an uncontrolled escalation service.
