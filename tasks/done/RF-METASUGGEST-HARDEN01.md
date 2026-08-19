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
PASS/CLOSED. The recovered first slice (`9e0414e…`), the A–L realistic corpus + parser hardening (`604cb8d…`), and the private smoke harness (`c6d3101…`) are committed, published, and synchronized on `codex/project-memory-reconcile-20260817`. Production now runs exact immutable release `604cb8daf310696353e99c30ce7a924dc71ef9d2` (previous `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`) at unchanged schema v21/history 001–021; no migration ran and rollback was not used. RF-SEARCH01 remains parked.

## Completed
- Recovered the existing uncommitted first slice (storage range contract, in-memory + Aliyun range reads, PDF.js range transport, evidence independence, native-text quality, structured filename, embedded authors, authority UX, product copy) and repaired its task-caused regressions.
- Backend typecheck green; frontend typecheck green.
- Focused suggestion/storage suites (78) and the full backend suite (342) pass; frontend suite (221) passes.
- Repaired: OCR fail-closed budget/limit behavior, non-PDF media-type gate, extractor `no_suggestions` vs `ocr_deferred` truthfulness, service-level filename survival on failed inspection, and a synchronous aggregate range-byte budget.
- Added `filename evidence survives a failed PDF inspection` service test.
- Committed and pushed `RECOVERED_FIRST_SLICE_CHECKPOINT = 9e0414e…`; local == tracking == remote, clean worktree.
- Completed and recorded the structural pipeline audit: bounded random-access PDF reading uses exact object stat plus a 5-byte signature Range probe, a PDF.js range transport with a synchronous aggregate byte budget (`maxRangeBytes` 32 MiB / `maxRangeRequests` 64 / `rangeChunkBytes` 1 MiB), no whole-object buffering above the 32 MiB ceiling (`maxObjectSizeBytes` 4 GiB), and fail-closed `too_large`/`limit_exceeded`/`encrypted_pdf`/`invalid_pdf` mapping; filename, embedded Info/XMP, native text, and OCR remain independent branches so a failed branch cannot suppress safe candidates from another.
- Added the committed A–L realistic regression corpus (`backend/test/fixtures/realistic-pdf.ts` + `realistic-fixtures.ts`): Chinese/English native books, Chinese image-only scan, mixed native+scan, >32 MiB range path, structured filename fallback, embedded-only, encrypted, malformed, multi-author embedded, explicit-label title page after page 4, and binary-comment header. A deterministic full-pipeline test runs all twelve through inspect+extract, and a real-Tesseract E2E (`realistic-ocr-e2e.test.ts`) drives the release-local engine when present and skips otherwise; the production workflow runs it against `output/release/runtime/tesseract`.
- Fixed three real parser defects the corpus exposed: (1) explicit bibliographic labels on a title page after page 4 were dropped — now classified as `title_page` anywhere in the exact window while unlabeled inference stays limited to the first four pages; (2) the `出版发行：北京：…出版社` shape emitted a spurious `publication_place` of `出版发行` — now suppressed; (3) embedded multi-author split was silently truncating authors because `.map(clean)` bound the array index to `clean`'s `max` argument — fixed, and multiple person authorities no longer mark a run `ambiguous`.
- Measured OCR/parser budget decisions are recorded in `SUGGESTION_LIMITS` and exercised by the corpus: per-page and total text/OCR character caps, per-page OCR timeout (5 s), total request timeout (25 s), one concurrent OCR request, render pixel/bitmap/image caps, and `minimumOcrConfidence` 55. The oversized fixture proves the whole object is never buffered and every range read stays ≤ 1 MiB.
- Added the no-persistence pre-cutover smoke harness (`scripts/private-suggestion-smoke.mjs`): it reads at most five Owner-authorized object keys through the exact staged release's compiled pipeline and reports only `metadata_mutated`/`crash`/`raw_error` plus per-object size/status/candidate counts, without opening SQLite, persisting runs, accepting candidates, or emitting titles/excerpts/keys.
- Passed all local gates: backend 358/358 (+1 real-Tesseract E2E skip), frontend 221/221, both typechecks, both production builds, compiled acceptance (`firstMigrationCount=21`, `redeployMigrationCount=0`), and `git diff --check` clean.
- Built the exact immutable Linux x64 / Node 24 artifact via workflow `32286643640` on source `604cb8d…`; both the primary job (including the new release-local Tesseract E2E step) and the independent fresh-runner download/verify job passed. GitHub artifact digest `sha256:859182edf9dd26d9f88f453357b6396e1fed8c62cb47d5f0f641470e011d95a1`; archive SHA-256 `2e90ab225c234826a1dd471dcfb8673f3003dcd9f449b699536fb54fa822df13`; manifest/runtime evidence verified locally and on-host (5,384 files / 125,846,980 bytes).
- Ran the no-persistence private pre-cutover smoke on five anonymized Owner-authorized production PDFs (`REAL-01`…`REAL-05`) against the staged release: `metadata_mutated=false`, `crash=false`, `raw_error=false`; two real scanned PDFs produced `ready` suggestions with bounded OCR evidence, and three larger scans (76–240 MiB) failed closed inside the 25 s bounded budget (`timeout`) without whole-object download, crash, mutation, or raw-error exposure.
- Staged the verified artifact as root-owned read-only `/opt/academiccloud/releases/604cb8d…`, completed the guarded same-schema cutover, and passed post-cutover acceptance: exact release/process CWD, schema v21/history 001–021/checksums, integrity `ok`, zero FK violations, active service with `NRestarts=0` and one loopback listener, byte-identical public assets, release-local Tesseract 5.5.3, unauthenticated suggestion probes denied, and zero new service errors. Task-owned staging/diagnostic files were removed.

## Remaining
None.

## Blockers
None.

## Last Verification
- Backend `tsc --noEmit` green; full backend suite 358/358 pass plus one release-local-Tesseract E2E skip; frontend suite 221/221 pass; both production builds pass; compiled acceptance green; `git diff --check` clean.
- Artifact workflow `32286643640` green (primary + independent runner); archive/manifest/runtime evidence and SHA-256 verified locally and on the host.
- Private pre-cutover smoke on `REAL-01`…`REAL-05`: `metadata_mutated=false`, `crash=false`, `raw_error=false`.
- Production release `604cb8d…`, previous `a5e2bc21…`; schema v21/history 001–021 unchanged; no migration; rollback not used.
- Post-cutover: health `ok`, readiness `ready`, exact public assets, release-local Tesseract 5.5.3, authorization guards fail closed, no new service errors.

## Next Action
Reconcile and publish the final evidence checkpoint, synchronize the accessible local checkout, then STOP. Resume RF-SEARCH01 only after Owner review and new explicit authorization.

## Closure Evidence

```text
TASK=RF-METASUGGEST-HARDEN01
VERDICT=PASS/CLOSED
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PREVIOUS_RELEASE=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
SCHEMA=v21 / migrations 001–021
MIGRATIONS=none (same-schema application-only)
REALISTIC_MATRIX=PASS (A–L, 12 fixtures + full-pipeline test)
PRIVATE_REALISTIC_SMOKE=PASS (REAL-01…REAL-05; metadata_mutated=false; crash=false; raw_error=false)
BROWSER_ACCEPTANCE=PASS (post-cutover health/readiness/assets/guard/tesseract/no-errors)
RAW_INTERNAL_ERROR_EXPOSED=false
AUTO_METADATA_MUTATION=false
ROLLBACK_USED=false
ARTIFACT_WORKFLOW=32286643640
ARTIFACT_DIGEST=sha256:859182edf9dd26d9f88f453357b6396e1fed8c62cb47d5f0f641470e011d95a1
ARCHIVE_SHA256=2e90ab225c234826a1dd471dcfb8673f3003dcd9f449b699536fb54fa822df13
EVIDENCE_COMMIT=604cb8d (artifact source) + c6d3101 (smoke harness)
LOCAL_HEAD=
TRACKING_HEAD=
REMOTE_HEAD=
WORKTREE_CLEAN=true
```
