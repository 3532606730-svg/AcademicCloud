# ADR-027 — Bounded Bibliographic Suggestion Implementation

**Date:** 2026-08-18
**Status:** Accepted through the RF-METASUGGEST01 Owner checkpoint

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

## Current authorization boundary

For this Owner checkpoint, RF-METASUGGEST01 is the only authorized Epic and the
repository stops afterward. RF-SEARCH01, OCR/text extraction, indexing,
embeddings, retrieval/RAG, external catalogue/ISBN lookup, AI/LLM extraction,
production contact/deployment, and destructive real-data operations remain
parked or prohibited pending a new Owner decision.

## Consequences

The implementation remains small and replaceable: a later authorized OCR
adapter may supply bounded page text to the same extraction contract, but no
OCR execution or whole-document processing is implied by this decision.
