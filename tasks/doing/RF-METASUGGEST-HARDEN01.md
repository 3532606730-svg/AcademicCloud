# RF-METASUGGEST-HARDEN01 — Real-World PDF Metadata-Suggestion Hardening

## Task ID
RF-METASUGGEST-HARDEN01 — End-to-End Real-World PDF Hardening and Release

## Goal
Complete one structural hardening pass of the bounded metadata-suggestion pipeline so real academic PDFs produce safe, reviewable bibliographic candidates without whole-document download/OCR, cross-source suppression, automatic metadata mutation, or raw internal-error exposure; release the exact independently green artifact only after committed-fixture and private realistic smoke gates pass.

## Scope
- Audit the complete `ResourceDetailsDialog` → API → service → storage/range → PDF.js/native/OCR/embedded/filename → extractor/ranking/authority/CAS → UI pipeline before implementation.
- Replace the 32 MiB whole-object size gate with bounded random-access PDF reading: exact object stat, Range-backed PDF.js access, fixed request/byte/memory/time budgets, and no buffering proportional to complete-book size.
- Make filename, embedded PDF metadata, native text, and OCR independent evidence branches; preserve safe candidates across recoverable document/page/branch failures.
- Add deterministic native-text quality, explicit-label extraction anywhere in the exact deduplicated first-15/last-5 window, conservative structured filename parsing, bounded PDF Info/XMP handling, and measured OCR/parser budgets and strategy.
- Align authority-candidate acceptance semantics and ordinary zh-CN/en product copy so the UI does not offer inevitably rejected acceptance or expose unnecessary parser terminology.
- Add a permanent tiny redistributable/self-generated realistic regression corpus and a no-persistence exact-artifact harness for at most five Owner-authorized production PDFs identified only as `REAL-01` … `REAL-05` in durable evidence.
- Build and independently verify the exact immutable Linux x64 / Node 24 artifact; run private realistic smoke before cutover; deploy and perform post-cutover non-mutating realistic acceptance only if every gate passes.
- Reconcile and publish task evidence, synchronize the accessible local checkout, and stop before RF-SEARCH01.

## Non-goals
- Any schema migration without a new explicit Owner approval; whole-document download/OCR/extraction; background/automatic OCR; cloud OCR; new OCR languages; full-text search/indexing; embeddings/retrieval/RAG; external catalogue/ISBN/web lookup; AI extraction.
- Automatic canonical metadata writes; automatic authority creation/merge; candidate acceptance during private smoke; file rename/move/delete; private-overlay inspection or mutation; corpus-wide production scanning.
- Main merge, credentials, paid infrastructure, DNS/TLS/firewall/autostart/infrastructure-policy changes, real permanent deletion, unrelated OSS/database inspection, RF-SEARCH01, other parked tasks, or unrelated cleanup.

## Acceptance Criteria
- Large valid PDFs are not rejected only because total object size exceeds 32 MiB; PDF inspection uses bounded Range reads with explicit aggregate byte/request/memory/time limits and never downloads the whole document.
- The only document evidence window remains the exact deduplicated first 15 plus last 5 pages; pages outside it are never read, rendered, or OCRed for suggestions.
- Filename, embedded metadata, native text, and OCR are independent: a failed or absent branch cannot suppress safe candidates from another branch, and recoverable page failures preserve already-safe evidence.
- Native-text quality deterministically distinguishes useful text from empty, page-number-only, tiny, garbled, or broken/hidden OCR layers; useful native text bypasses OCR and unusable native text permits bounded OCR.
- Explicit bibliographic labels may be used conservatively anywhere in the selected window; unlabeled inference remains stricter. A title page after page 4 is covered.
- Conservative structured filename parsing handles `张帆《元代宰相制度研究》（北京大学出版社1997）.pdf` and punctuation/spacing variants as separate author/title/publisher/date candidates without inventing facts or concatenating author into title.
- Safe PDF Info and bounded PDF.js-accessible XMP metadata are considered independently; generic/tool placeholders are rejected and multiple authors are handled conservatively without automatic authority creation.
- PDF compatibility covers truthful byte-signature/MIME handling, recoverable warnings, encrypted/malformed/degraded PDFs, unusual safely parseable headers, and large scans without trusting extension alone.
- Parser and OCR budgets/scale/PSM/retry/prioritization are selected from measured representative Chinese/English native, scan, and mixed fixtures; execution stays bounded and manual UI progress/errors remain truthful.
- The UI uses ordinary localized product concepts, surfaces partial inspection without raw implementation errors, and requires explicit same-domain authority resolution before authority candidates can be accepted through RF-META CAS.
- The committed A–L realistic fixture matrix, actual Tesseract E2E, storage range, parser, extractor, orchestration, HTTP, frontend, authority, typecheck/build/compiled acceptance, deterministic artifact, extracted runtime, independent runner, and `git diff --check` gates pass.
- Exact-artifact pre-cutover smoke on at most five private PDFs retains only the authorized anonymized metrics and proves `metadata_mutated=false`, `crash=false`, and `raw_error=false`; a failed gate prevents cutover.
- If deployed, production remains schema v21/history 001–021, uses the exact independently green artifact, retains exact same-schema rollback, passes health/runtime/assets and post-deploy realistic non-mutating acceptance, and leaves no task-owned staging.
- PROD-09A receiver/error redaction, RF-TRANSFER01/Range downloads, Library authorization, private overlay isolation, deterministic ranking, and all no-automatic-mutation invariants remain intact.

## Relevant ADRs
- ADR-014 — privacy/ownership/research-activity boundaries.
- ADR-022 — canonical shared Library and private overlays.
- ADR-023 — durable decision reconciliation and local/remote synchronization.
- ADR-025 — bounded front-matter evidence and OCR boundary.
- ADR-026 — canonical metadata/minimal-authority destination and CAS.
- ADR-027 — bounded suggestion implementation, evidence, persistence, and OCR limits.

## Relevant Modules / Files
- `backend/src/suggestions/` parser, OCR, extractor, orchestration, HTTP, persistence, and tests.
- `backend/src/storage/` interface, in-memory implementation, Aliyun adapter/client seam, Range support, and tests.
- `frontend/src/api.ts`, `frontend/src/resource-details.tsx`, localized copy/styles, and focused tests.
- exact artifact/runtime/acceptance scripts and release workflow.
- `AGENTS.md`, `CURRENT_STATUS.md`, `TASK_BOARD.md`, `ROADMAP.md`, and this task card.

## Current State
Active at clean authoritative checkpoint `a163018e5df778ea78614caf964318fbb0a76751` on `codex/project-memory-reconcile-20260817`, tracking the identical remote head. Production remains exact `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`, schema v21/history 001–021. The Owner authorized this task end-to-end, including bounded private read-only smoke and conditional same-schema production release; RF-SEARCH01 remains parked.

## Completed
- Recovered the clean branch/upstream/checkpoint and prior PROD-09A production truth.
- Reconciled the new bounded task boundary into the authoritative recovery path.
- Started read-only whole-pipeline audits; no implementation or production contact has occurred.

## Remaining
- Complete and record the structural pipeline audit and representative runtime measurements.
- Implement the bounded hardening and committed A–L regression corpus.
- Pass changed-risk, build, artifact, independent-runner, and private pre-cutover smoke gates.
- Conditionally deploy the exact artifact, complete post-cutover acceptance, reconcile/publish/synchronize, and stop.

## Blockers
None. A necessary schema migration or any failed exact-artifact/private-smoke gate is a mandatory stop before production.

## Last Verification
- 2026-08-19: local HEAD, tracking head, and remote-tracking head all equal `a163018e5df778ea78614caf964318fbb0a76751`; the working tree was clean before task-boundary reconciliation.
- Production was not contacted during task selection/recovery.

## Next Action
Finish the complete structural audit and measurements before applying implementation changes.
