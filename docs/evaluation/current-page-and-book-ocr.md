# Current-page and whole-book OCR qualification

Date: 2026-09-28. Status: independent reference preparation; no measured engine output has yet been collected for this sample. This document does not authorize whole-book or corpus processing.

The existing pinned Paddle engine is a usable local computation substrate for an Owner-controlled OCR path. Its previous synthetic-image checks and its installed character inventory do not establish accuracy on academic books. The online versus own-device engine decision remains pending and is a separate qualification target; a successful Owner GPU run cannot certify either selected runtime.

## Independent reference sample

Eight complete physical pages were selected from four preserved Owner PDF sources before evaluated OCR. The verifier rendered page pixels with PyMuPDF and transcribed those images visually. No PDF text layer, prior OCR text, or evaluated model output supplied the references. These are **independent visual transcriptions by an agent, not Owner/human-verified gold labels**. Any subsequent CER is a conditional sample estimate subject to reference mistakes.

Local evidence lives under `output/vnext/ocr-qualification-20260928/`. `source-inventory.json` records full source SHA-256, size, path, and page count; `selected-pages.json` records physical page and rendered-image hash. `*.gold.txt` contains the complete visual references. `scoring-rules.json` and `score-qualification.py` specify and implement scoring. The reference manifest is frozen before inference; outputs must not be used to repair the frozen references.

Freeze: `2026-09-28T03:32:41.459546+00:00`, manifest SHA-256 `a1766ab08485fe3ea8d5d07cd312e200f3192fc345a177a28fd7322ff43cdb3b`. All four source hashes were checked again at freeze. The eight references contain 6,719 scored characters after primary normalization: Chinese 1,910; English 4,809. A second agent blindly checked two source images before freeze, correcting two visual transcription choices. Two character positions remain explicitly uncertain (one damaged classification digit and one small running-header glyph). Neither is removed from the denominator; results must include their reference-substitution sensitivity range. This is not a statistical confidence interval or a full double transcription. `reference-review-notes.json` retains the review details.

| Source ID | Source | Physical pages | Evidence type |
|---|---|---|---|
| zh-russia | 蚕食与鲸吞：俄罗斯侵华史话 | 4, 20 | Scanned copyright/CIP; Chinese body with running header, damage and small footnote |
| zh-history | 到后台看历史卸妆 | 3, 6 | Low-contrast copyright table; Chinese preface ending with dates |
| en-venice | Venice and the Mongols | 4, 20 | Title/author/translator page; dense English body with italics and line-end hyphens |
| en-mongolia | Mongolia Today | 4, 20 | Title/editors/foreword/publisher; English preface and small references |

This purposive sample has four Chinese and four English pages, and four bibliographic and four body pages. It contains no independently verified traditional vertical Mongolian, handwriting, multi-column critical edition, table-heavy page, or mathematical transcription. It is too small and too selectively chosen to estimate a corpus-wide or whole-book accuracy distribution.

The primary metric is Levenshtein character error rate after NFKC normalization and removal of Unicode whitespace, retaining case, punctuation, visible line-end hyphens, and numbers. It includes substitutions, omissions, insertions, and reading-order mistakes. A secondary alphanumeric CER is labelled separately. Every page and the language/layout strata are reported, followed by character-weighted aggregate CER. Engine confidence is not measured accuracy. No page is discarded for an unfavorable result. Whitespace layout, coordinates, word segmentation, and font fidelity are outside this metric.

## Runtime evidence already established

The read-only environment inspection found `AcademicCloudComputeV2` running, with the existing Local Compute and CatalogBridge services active. Its selected release was `7e2d1bfb42a1135d93973bcf788eae5e045bb5f6`. The installed runtime manifest identifies PaddlePaddle 3.3.1 and PaddleOCR 3.7.0, with GPU execution on an RTX 4060 Laptop GPU. Actual detection and recognition parameter files were re-hashed and matched their pinned identities:

| Asset | SHA-256 |
|---|---|
| Detection inference parameters | `5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da` |
| Recognition inference parameters | `406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907` |

The recognition character dictionary contains Han and Latin characters, including several scholarly Latin diacritics, but contains **zero U+1800–U+18AF traditional Mongolian characters**. That is a material script-support gap, independent of whether native PDF text extraction can preserve those codepoints. No traditional Mongolian OCR accuracy percentage is warranted.

The existing Mongology research assets are not a substitute for that missing profile. The inspected Latin-transcription checkpoints and local qualification evidence cover small synthetic line fixtures and a normalized validation set, not independent real vertical Mongolian pages or integrated platform performance. One normalization path collapses distinct scholarly characters. Their historical validation CER must not be presented as AcademicCloud book accuracy.

The additional read-only Mongology audit also found that its retained 2,998-line whole-book export is bound to an `ocr_text_layer.db` manifest and `text_layer_line_crops`; that workflow used a PDF with a text layer. It cannot establish that segmentation and reading order work for a scan with no text layer. Its earlier image-layout report counts different units/coverage, so the two line totals cannot be converted into a character omission rate. Metrics must also match the exact exported checkpoint: a final-epoch score and an earlier selected-best checkpoint are not interchangeable. No new Mongology inference was performed for this assessment.

An isolated GPU qualification process would run outside the production worker's concurrency-one scheduler. It therefore requires an explicitly coordinated idle window; no worker is stopped, reconfigured, or replaced for this evaluation. No new model download, paid compute, production job, or full-book processing is part of the sample.

## Reusable computation and remaining limits

The candidate `compute/src/reader-ocr-inspector.ts` selects an explicit one-based physical page and always renders it before OCR, even when the PDF has a text layer. It reuses the bounded PDF.js range transport, canvas budget, timeout/cancellation handling, pinned `PaddleOcrSidecarAdapter`, and warm persistent child process. The reader mode preserves low-confidence text and explicit truncation. Bibliographic extraction retains its existing separate behavior.

These primitives make selected-page recognition feasible. They do not, by themselves, make a good whole-book runner. Each current inspector call reopens and destroys the PDF document; repeating it for every page rereads PDF structure and repeatedly allocates the source-length buffer. The current PDF.js range implementation reserves a buffer based on complete source size despite fetching ranges, with a 1 GiB source gate. A book runner should hold one bounded document session, reuse the engine, process one page at a time, checkpoint completed pages, permit cancellation/resume, and distinguish no-text, low-confidence, truncated, unsupported, and failed pages. A single-page timing cannot be linearly advertised as whole-book throughput.

September29 candidate adds explicitly requested line geometry to the unconnected local Reader path. It takes recognition-aligned `rec_polys`/`rec_boxes`, never detection boxes, and returns at most512 normalized image rectangles with UTF-16 offsets into the final cleaned text. Text normalization crossing a box boundary invalidates layout; truncation drops the affected partial-line box. Missing or malformed geometry retains useful text with an explicit unavailable/invalid status. The actual integer bitmap dimensions, float PDF.js viewport dimensions, rotation and PDF-to-image transform accompany opt-in inspector results. These image rectangles are not PDF coordinates and are not word/character boxes. No geometry is added to default bibliographic requests.

Local synthetic verification passed44 TypeScript tests across geometry/Paddle/Reader/PDF paths,7 pure Python sidecar tests, Compute typecheck and build on2026-09-29. This includes non-BMP/NFC/CRLF offsets, filtering, limits, malformed frames and an actually rendered90-degree PDF fixture. Root completed the final diff review; the independent Astra ultra reviewer supplied invariants but its final review was interrupted by the account usage limit. No new model inference, GPU process or accuracy measurement occurred. The line shape reuses the internal adapter contract, but the legacy16,384-unit text path is not claimed as the full16,000-unit OcrEnginePageResult contract. Production assembly still needs an explicit candidate-sidecar inclusion/verification at its later release gate.

Returned line order remains the engine's order. Reader overlay mapping, side-by-side correction, columns, footnotes, and evidence anchors still need real-page layout qualification and stable source/page provenance. Search indexing, embeddings, RAG, and corpus processing are not implied.

For bibliographic reliability, OCR is only the evidence acquisition stage. The front-matter pipeline samples a fixed bounded window and can choose native text instead of OCR. The reasoning input is separately limited, including a per-page evidence slice. Better OCR does not guarantee that an editor, publication date, original edition, translator, or imprint reaches the reasoner. Follow-up verification should score required bibliographic fields against their actual page evidence, record omitted/truncated evidence, and retain canonical/human authority guards. It should not weaken validation or introduce book-specific title rules.

## Results and next evidence

No CER or book-level accuracy claim is available yet for the frozen real-page sample. After the target engine is confirmed, record exact code/model/runtime identities, effective render dimensions/scale, status, truncation, cold-start and per-page time, and peak resource usage. Run the eight pages sequentially once and retain every result. Compare selected online or member-device engines using the same frozen references only within the authorized data-disclosure scope; distinguish a full-pipeline comparison from a same-pixel engine comparison.

After this exploratory sample, a decision to add whole-book OCR needs independently reviewed references from previously unseen books, stratified by language, scan quality, layout and scholarly notation, plus bounded multi-page resource/recovery evidence. Traditional Mongolian additionally needs a compatible model, direction/segmentation support, and expert-reviewed real-page references. Until those exist, its accuracy remains unmeasured.
