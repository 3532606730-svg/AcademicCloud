# AcademicCloud Current Product Direction

**Recorded:** 2026-08-22

This file preserves the Owner-approved product direction discussed after the current HOTFIX-META-UX01 deployment. It is a durable planning/status record so later agents do not lose the intended product trajectory.

This document does **not** by itself authorize production mutation, schema migration, paid infrastructure, provider-policy changes, credential broadening, Internal Beta, or implementation of later layers. Existing task cards, ADRs, `CURRENT_STATUS.md`, `CURRENT_STATE.json`, and explicit Owner task prompts remain authoritative for execution.

## Product destination

AcademicCloud should evolve from a shared academic file library into a historian-oriented research infrastructure:

```text
Layer 0 — Storage
  upload / OSS / download / preview / resumable transfer / permissions

Layer 1 — Intelligent Library
  AI Bibliographic Intelligence
  material classification
  contributor roles
  detailed edition/version metadata
  metadata-aware Search and filters
  Citation Engine

Layer 2 — Document Intelligence
  PDF native-text extraction
  PaddleOCR-based OCR fallback
  region OCR
  page/bbox/source anchoring
  structured page/document extraction

Layer 3 — Research Workspace
  source/evidence cards
  notes
  projects/topics
  historical timeline
  historical-date representation/conversion
  people/place/event links
  infinite canvas / relationship workspace
  one-click citation from source cards

Layer 4 — AI Research
  entity/event/date suggestions
  relationship suggestions
  cross-document retrieval
  RAG and broader research assistance
```

Current near-term implementation should remain focused on Layer 1 plus the separately bounded upload-performance release. Layer 2/3/4 are roadmap directions, not part of the current implementation unless separately authorized.

## Layer 1 — AI Bibliographic Intelligence

AI naming is no longer conceived as simple filename cleanup. The intended system is automatic bibliographic cataloguing.

Normal flow:

```text
upload succeeds
→ background bibliographic analysis
→ classify material type
→ extract structured bibliography
→ validate
→ automatically apply safe canonical defaults
→ Library display/search update automatically
```

Product rule:

> AI owns the default bibliographic organization; the user owns the final override.

Once a user manually edits an authoritative field, later background AI must not silently overwrite that field unless the user explicitly requests re-AI/re-normalization.

### Material classification

Material type is a first-class organizing axis, not a decorative tag. The controlled taxonomy should reuse existing repository concepts and support, where appropriate:

- scholarly monograph;
- edited volume;
- journal article;
- book chapter;
- thesis/dissertation;
- conference paper;
- review;
- reference work/dictionary;
- modern edited primary source;
- traditional/ancient book;
- archival document;
- inscription/epigraphy;
- rubbing;
- manuscript;
- collected documents;
- bibliography/catalogue;
- other/unknown.

Material type should drive:

- display-name composition;
- relevant metadata fields;
- metadata search/filter facets;
- contributor-role expectations;
- edition/version interpretation.

### Display rules

Composed Library names are presentation only and must not be persisted as `canonicalTitle`.

Modern scholarly works:

```text
AUTHOR + TITLE
```

Historical/primary sources:

```text
TITLE + DETAILED EDITION/VERSION STATEMENT
```

Missing components are omitted cleanly. No physical OSS/object rename is implied.

## Detailed edition/version model

Historical materials need substantially more detail than a generic `editionOrVersion` string.

### Traditional/ancient books

Where supported by evidence, preserve structured information such as:

- dynasty;
- reign title;
- reign year;
- absolute year;
- printer/imprint/bookshop/institution;
- printing place;
- edition type;
- edition statement;
- source/base edition;
- holding/copy information when explicitly evidenced.

Edition types may include, when evidenced:

- 刻本;
- 重刻本;
- 翻刻本;
- 影刻本;
- 活字本;
- 套印本;
- 抄本/钞本;
- 稿本;
- 影钞本;
- 石印本;
- 铅印本;
- 影印本;
- 配补本;
- 钞补本;
- 修补本.

Desired display quality is closer to:

```text
某书 明万历二十四年金陵唐氏重刻本
```

than to vague labels such as `明刻本` when stronger evidence is available.

### Modern edited primary sources

Preserve, when available:

- editor/organizer;
- editorial role (点校、校注、校释、整理、笺证、汇校、辑校、译注、今译、标点、校勘, etc.);
- publisher;
- publication year;
- edition/printing when meaningful;
- source/base edition if explicitly stated;
- series;
- volume;
- ISBN.

A modern facsimile/carrier edition must not be conflated with the historical source/base edition it reproduces.

## AI/OCR architecture direction

Do not force one model to perform every stage.

Preferred architectural direction to benchmark before production selection:

```text
PDF
→ bounded bibliographic page selection
→ document reading / layout recognition
→ bibliographic reasoning
→ structured metadata
```

### PaddleOCR direction

PaddleOCR is now the preferred technology to evaluate for document ingestion and OCR, especially for Chinese, traditional/vertical text, scans, old books, layout-heavy pages and future region OCR.

Potential roles:

- PP-OCR for ordinary OCR;
- PaddleOCR-VL for difficult/complex document pages and old-book recognition;
- PP-Structure/document-layout capability for layout-aware extraction.

Tesseract should remain available as a legacy/emergency fallback for now, but should no longer be assumed to be the long-term primary OCR engine.

### Qwen direction

Qwen remains the preferred bibliographic reasoning/model family to evaluate.

The intended separation is conceptually:

> PaddleOCR/document model: determine what the page says and where it appears.
>
> Qwen: determine what those signals mean bibliographically.

For direct visual bibliographic reasoning, qualify a small Qwen-VL first and escalate difficult cases rather than treating one small model as infallible.

Preferred bounded model hierarchy to evaluate:

```text
normal case: small model
→ deterministic quality gate
→ difficult case: stronger Qwen-VL
→ still uncertain: preserve only supported fields / safe fallback
```

Heavy inference remains in ephemeral Compute, not persistent Thin Core. No paid AI API is part of the current direction.

## Metadata-aware Library Search

Material classification must produce a real retrieval improvement.

Layer 1 Search remains catalogue/metadata Search, not RAG and not page-content full-text search.

Search/filter should evolve to use structured metadata such as:

- title/subtitle;
- contributor;
- contributor role where useful;
- material type;
- publisher;
- publication date;
- language;
- edition/version;
- traditional edition attributes;
- modern editorial role;
- series/volume.

Examples of intended retrieval include:

- only primary sources;
- only traditional books;
- only Japanese material;
- one author/contributor;
- one publisher;
- Ming editions;
- Wanli-period editions;
- modern punctuated/collated editions.

Search/filter remains server-authoritative and must preserve deterministic pagination and existing Search/sort semantics.

## Citation Engine

Automatic citation generation belongs in Layer 1 because it is a deterministic transformation of structured bibliographic metadata and does not require RAG.

Preferred architecture:

```text
canonical structured bibliography
→ CSL-compatible item
→ citeproc / CSL style
→ citation output
```

Do not generate citation punctuation/ordering ad hoc with an LLM when a deterministic citation engine can do it reliably.

Initial style targets:

- Chicago Notes & Bibliography;
- 《历史研究》;
- 《文史哲》;
- GB/T 7714;
- extensible additional CSL styles later.

The engine should support, where the style permits:

- first/full note;
- shortened/subsequent note;
- bibliography entry;
- copy to clipboard;
- later export to CSL-JSON/RIS/BibTeX or writing integrations.

Historical citation locators should not be limited to page number. The design should allow locators such as:

- page/page range;
- volume;
- fascicle;
- chapter;
- folio;
- folio recto/verso;
- line;
- item;
- archive/call number;
- custom historical locator.

Detailed edition metadata should feed citations directly.

Before a journal-specific CSL style is treated as production-authoritative, verify the current journal/submission specification and the exact style revision rather than freezing an obsolete internet copy.

## Layer 2 — Document Intelligence roadmap

Layer 2 is intentionally deferred until separately authorized.

Preferred future ingestion flow:

```text
PDF page
→ usable native text layer?
   ├─ yes: PDF.js/native extraction
   └─ no/poor: PaddleOCR-based recognition
→ structured page blocks
→ text + page + bbox/source anchor
```

Important future feature: region/box OCR with side-by-side source image and editable recognized text.

Every extracted passage/evidence item should remain traceable back to:

```text
source file
→ page
→ bbox/region
→ original image
```

OCR/text/index outputs remain derived and rebuildable; original files remain authoritative.

## Layer 3 — Research Workspace roadmap

The longer-term research workspace should turn files into research objects.

### Source/evidence cards

A card may preserve:

- quoted/source text;
- source file;
- volume/page/folio/line;
- original image region;
- date;
- person;
- place;
- event/topic;
- tags;
- research note;
- citation locator.

Every card should remain source-grounded rather than becoming detached copied text.

### Historical timeline

Timeline dates must not be reduced to ordinary modern `YYYY-MM-DD` values.

Future historical-date representation should preserve conceptually:

- original date expression;
- calendar/era system;
- normalized/converted date where possible;
- precision (year/month/day/etc.);
- whether the conversion is inferred/uncertain;
- original evidence.

This should later support Chinese reign dates and potentially other calendar/era systems as research needs justify.

### Infinite canvas / relationship workspace

A future canvas may contain real AcademicCloud objects rather than dead visual cards:

- source/evidence cards;
- notes;
- questions;
- people;
- places;
- events;
- groups/topics.

Edges may represent supports/contradicts/same-event/related/custom relationships.

A node should resolve back to authoritative Library/research objects and ultimately to source evidence.

## Layer 4 — AI Research roadmap

Do not implement now.

Future possibilities include:

- entity suggestions;
- person/place/event extraction;
- historical-date suggestions;
- relationship suggestions between source cards;
- cross-corpus retrieval;
- RAG;
- source-grounded research assistance.

This layer must build on Layer 1 bibliographic authority, Layer 2 source anchoring and Layer 3 research objects rather than bypass them.

## Upload performance remains a separate bounded release

The previously planned upload optimization remains independent of bibliographic/AI work.

Keep:

```text
Browser → OSS directly
Core → control plane only
```

Potential improvements remain:

- move hashing off the UI thread;
- overlap hashing and network transfer where integrity contracts permit;
- bounded part pre-hashing;
- deterministic adaptive multipart sizing;
- bounded global network-slot scheduling;
- upload diagnostics;
- preserve Content-MD5, resume, pause, retry, source recovery, CAS and final activation safety.

Do not weaken checksum/integrity or broaden OSS/RAM/CORS merely for throughput.

## Sequencing/status

The intended sequencing is currently:

```text
CURRENT
  existing production + HOTFIX-META-UX01 owner acceptance boundary

NEXT OWNER-AUTHORIZED L1 PROGRAM
  preflight existing schema/authority/search/Compute contracts
  → AI Bibliographic Intelligence
  → material classification
  → detailed edition/version metadata
  → metadata-aware Search/filter
  → Citation Engine
  → Library/Activity UX refinement

SEPARATE RELEASE
  Upload Pipeline V2

LATER / NOT CURRENTLY IMPLEMENTED
  Layer 2 Document Intelligence / PaddleOCR ingestion + region OCR
  → Layer 3 Research Workspace / source cards + timeline + canvas
  → Layer 4 AI Research / RAG and broader intelligence
```

No current task should silently jump from Layer 1 into Layer 2/3/4 merely because the later direction is now documented.
