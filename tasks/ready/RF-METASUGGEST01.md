# RF-METASUGGEST01 — Deterministic Title and Metadata Suggestions

## Task ID
RF-METASUGGEST01 — Deterministic Title and Metadata Suggestions

## Goal
Turn noisy acquisition filenames into safe, reviewable scholarly title/metadata suggestions after canonical metadata exists, without silently rewriting authoritative metadata or physical object identity.

## Scope
- Build on `RF-META01` canonical metadata contracts.
- Derive bounded suggestions from already-authorized local signals only: original/display filename and embedded document metadata when safely available without OCR.
- Normalize obvious acquisition noise conservatively, including file extensions, duplicate punctuation/spacing, archive/source suffixes such as Z-Library/Anna's Archive, opaque hashes, ISBN-like acquisition tails, and other explicitly tested patterns.
- Produce a proposed human-facing title and, where deterministic evidence supports it, bounded candidate author/publication fields allowed by `RF-META01`.
- Preserve the original filename permanently as provenance/detail data; do not rename OSS object keys or rewrite stored bytes.
- Suggestions remain proposals with source/confidence/provenance and require explicit Owner/authorized metadata confirmation before becoming canonical shared facts.
- Low-confidence or ambiguous inputs must fall back to the original visible title instead of inventing metadata.

## Non-goals
- No OCR, LLM/AI extraction, embeddings, RAG, external catalogue/ISBN API, web lookup, fuzzy identity merge, or automatic authority-record merge.
- No silent bulk canonical rewrite of existing production holdings.
- No physical file/object rename requirement.
- No production deployment in this repository task.

## Acceptance Criteria
- Suggestion output is deterministic for the same authorized input and versioned ruleset.
- Every suggested field records its source and confidence class; canonical data changes only through the normal authorized metadata update path.
- Original filename/object key/checksum/uploader provenance remain unchanged and retrievable in `资料详情`.
- Common noisy historical filenames produce materially cleaner proposed titles without deleting uncertain meaningful text.
- Ambiguous or low-confidence cases make no destructive assumption and remain editable/manual.
- No inaccessible/private data is used to derive another account's suggestion, and Personal Research Overlay is never consulted.
- Parser limits prevent pathological filenames/embedded metadata from causing unbounded work or unsafe rendering.
- Focused fixtures cover Chinese/Latin-script titles, punctuation, archive suffixes, hashes, ISBN-like tails, already-clean names, ambiguous names, and malicious/plain-text rendering cases.

## Dependencies
- `L1-UX06` should first repair the catalogue presentation so title display has one coherent surface.
- `RF-META01` must define the canonical fields and authorized update contract before suggestions can target them.

## Current State
Not implemented. Existing migrated holdings often have a Scholarly Record label derived directly from the historical filename, so the current UI can only display noisy acquisition names. `RF-META01` deliberately excludes automatic extraction/suggestion; this card now owns the bounded deterministic suggestion layer.

## Next Action
After `RF-META01`, define a small versioned normalization/suggestion contract and fixture corpus before implementing persistence/API/UI integration. STOP rather than adding OCR, network lookup, or AI extraction.