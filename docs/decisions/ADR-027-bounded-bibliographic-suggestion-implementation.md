# ADR-027 — Bounded Bibliographic Suggestion Implementation

**Date:** 2026-08-18
**Status:** Accepted through RF-METASUGGEST01; bounded local OCR amendment completed by RF-FRONTMATTEROCR01

## Context

RF-META01 supplies the canonical metadata and minimal authority destination,
but acquired academic PDFs often contain useful bilingual bibliographic facts
before a manager has catalogued them. The repository must expose those facts as
reviewable proposals without turning Core Drive into an OCR/search/AI system or
reading an entire object merely to find front matter.

## Decision

RF-METASUGGEST01 is a deterministic, local, text-layer-only suggestion layer.

### Bounded source and parser

- File authorization is resolved through the exact active Library holding
  before any storage read; business code uses the provider-neutral
  `StorageAdapter.readObject` seam and never an OSS client directly.
- A read is capped at 32 MiB. The pinned parser is `pdfjs-dist` 6.2.108 and
  never renders pages or performs OCR.
- Discovery selects exactly the deduplicated 1-based first 15 plus last 5 pages
  (at most 20 pages), caps each page at 16,384 decoded characters and the
  selected window at 262,144 characters, caps embedded Info values at 4,096
  each/16,384 total, and enforces a five-second total inspection budget.
- Malformed/encrypted/oversized/unavailable input fails closed. A valid PDF
  without meaningful text-layer letters returns `ocr_deferred`; no image bytes
  are guessed or sent elsewhere.

### Evidence and extraction

The fixed ruleset `rf-metasuggest-v1` classifies title/cover, copyright/title-
page verso, Chinese/Library-of-Congress/British CIP, colophon, series, and
ordinary pages. Chinese and English cues are parsed with conservative,
field-specific precedence:

- title, subtitle, and creator roles: title page → CIP/colophon/copyright →
  embedded Info metadata → filename;
- publisher, place, date, edition, and ISBN: copyright/verso/CIP/colophon →
  title page → embedded Info metadata → filename.

Every candidate is fixed to an RF-META01 field/authority role and records its
source type, 1-based page, page class, precedence rank, confidence, bounded
evidence excerpt, and ruleset version. Conflicting values at the same best
rank remain `ambiguous`; no global page winner, fuzzy matching, authority
merge, or invented fact is produced. Generic/noisy embedded values and generic
acquisition filenames are withheld rather than promoted as facts.

### Review and acceptance

Runs and candidates are append-only migration 019 records. They retain only a
source fingerprint, bounded window, fixed candidate/evidence fields, and
lifecycle status; they do not retain PDF bytes, raw page text, object keys, or
Personal Research Overlay data. The normal `资料详情` surface shows proposals
to Members read-only and gives only an effective Library manager generation,
field selection, evidence display, and acceptance controls.

Acceptance is explicit and manager-only. It calls the RF-META01 metadata CAS
service, rechecks the database source revision/checksum and provider object
stat, rejects stale or conflicting selections, and requires an existing
same-domain authority link when an authority candidate is selected. It never
auto-creates/merges authorities or silently rewrites canonical metadata.

Accepted metadata preserves the file ID, accepted filename, OSS object key and
bytes, checksum, uploader/contributor provenance, Record/Artifact/Version
lineage, Favorites, and all private research overlay state.

## RF-METASUGGEST01 checkpoint boundary (historical)

For the 2026-08-18 Owner checkpoint, RF-METASUGGEST01 was the only authorized
Epic and the repository stopped afterward. At that checkpoint RF-SEARCH01,
OCR/text extraction, indexing,
embeddings, retrieval/RAG, external catalogue/ISBN lookup, AI/LLM extraction,
production contact/deployment, and destructive real-data operations remained
parked or prohibited pending a new Owner decision. The amendment below records
the later, narrowly bounded OCR authorization without rewriting that history.

## Consequences

The implementation remains small and replaceable: a later authorized OCR
adapter may supply bounded page text to the same extraction contract, but no
OCR execution or whole-document processing is implied by this decision.

## RF-FRONTMATTEROCR01 amendment — 2026-08-19

The Owner subsequently authorized bounded local front-matter OCR as a fallback
inside this same suggestion pipeline. The original RF-METASUGGEST01 checkpoint
remains historically text-layer-only; this amendment applies prospectively.

### Local adapter and native-text preference

- Every selected page first uses the existing PDF.js text path. A page with
  usable native letters is never rendered or OCRed. Only a selected page with
  unusable native text may be rendered, sequentially, and passed to OCR.
- The provider-neutral adapter invokes an ephemeral local Tesseract CLI through
  argument-safe child-process APIs. The pinned deployment contract is
  Tesseract `5.5.3` plus `tessdata_fast` `4.1.0` models `chi_sim`, `chi_tra`, and
  `eng`; the adapter verifies the exact engine version and required installed
  language identifiers before recognition. The later deployment gate must
  verify the pinned trained-data package/checksums because Tesseract's runtime
  language list does not identify a model-file release. `@napi-rs/canvas`
  `1.0.7` is an exact Node
  dependency used only for bounded PDF.js rendering.
- PDF/page bytes go to Tesseract over process standard input and TSV confidence
  returns over standard output. No temp raster file, runtime model download,
  network/cloud OCR, resident service, worker daemon, upload/approval hook, or
  background queue exists. A later production gate must install the exact
  local binary/model prerequisites; this development checkpoint does not touch
  production and fails closed when they are absent or mismatched.

### Resource and trust bounds

- The existing 32 MiB object and exact deduplicated first-15/last-5 page limits
  remain. Rendering uses scale `1.5` and rejects a page before allocation above
  2,000 × 2,800 pixels, 5,600,000 pixels, 22,400,000 RGBA bytes, or an 8 MiB
  encoded PNG.
- OCR is sequential: at most one page OCR job and one OCR-bearing request are
  active per web process. Each page has a five-second OCR budget and the total
  request has a 25-second budget. Caller cancellation kills the local child.
  OCR TSV output is capped at 2 MiB, decoded page text at 16,384 characters,
  and total decoded OCR text at 65,536 characters.
- A scored result below confidence 55, empty text, or text dominated by scripts
  outside Han/Latin is unusable evidence. Even usable OCR can only yield a
  review candidate: OCR evidence caps an otherwise high bibliographic
  confidence at medium, and no OCR-specific field-precedence tier outranks the
  established page/source rules.

### Immutable provenance and migration 020

Migration 019 has no truthful field for native-versus-OCR origin, engine
identity, or OCR confidence. Append-only migration 020 therefore adds exactly
`evidence_origin`, `ocr_engine`, and `ocr_confidence` to retained candidates.
Existing rows receive a truthful `legacy_v1` storage marker and remain
reconstructable from their already explicit page/source types; public reads
normalize those historical rows to native text, embedded PDF metadata, or
filename. New candidates cannot use the legacy marker, and OCR provenance
requires a page, bounded engine identity, and integer 0–100 confidence.

Raw page text, rendered images, PDF bytes, object keys, and whole-document
derived text remain absent from persistence. Generation revalidates active
manager authority and exact Library domain/source identity after inspection,
and acceptance still uses the unchanged RF-META01 CAS boundary.
