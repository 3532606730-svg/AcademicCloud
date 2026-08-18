# RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions

## Task ID
RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions

## Goal
Generate safe, reviewable bibliographic suggestions for Chinese and non-Chinese scholarly PDFs by combining bounded front/back-matter page classification with already-authorized local metadata and filename evidence, without silently rewriting canonical facts or physical object identity.

## Scope
- Build on `RF-META01` canonical metadata contracts and normal `资料详情` flows.
- For PDFs with an existing text layer, inspect a bounded default window of the first 15 pages plus the last 5 pages; never scan the whole document merely to identify bibliographic metadata.
- Classify likely front/back-matter page types using deterministic local text/layout cues where available: cover, half-title, title page, copyright/title-page verso, Chinese CIP/版权页, Library of Congress/British Library CIP, colophon, series page, contents/preface, and ordinary body text.
- Support both modern and older book patterns. Older works without a modern copyright page may legitimately derive publisher/place/year from the title page.
- Extract only fields defined by `RF-META01`, including bounded candidate title/subtitle, creator role(s), publisher/imprint, place, year/date, edition, ISBN/identifier, and equivalent template fields when deterministic evidence supports them.
- Use field-specific evidence precedence rather than one global source order:
  - title/subtitle and primary creator: title page → CIP/colophon/copyright evidence → embedded PDF metadata → filename;
  - publisher/place/year/edition/ISBN: copyright/title-page verso or CIP/colophon → title page → embedded PDF metadata → filename.
- Recognize deterministic Chinese cues such as `图书在版编目（CIP）数据`, `ISBN`, `出版社`, `出版发行`, `版次`, `印次`, `责任编辑`, `定价`, and equivalent bounded patterns.
- Recognize deterministic English/Latin-script cues such as `Copyright`, `All rights reserved`, `Published by`, `First published`, `Edition`, `Library of Congress Cataloging-in-Publication Data`, `British Library Cataloguing in Publication Data`, and ISBN patterns.
- Continue conservative filename cleanup as the lowest-confidence fallback: remove extensions, duplicate punctuation/spacing, tested acquisition/archive suffixes such as Z-Library/Anna's Archive, opaque hashes, and explicitly tested acquisition tails without deleting uncertain meaningful text.
- Preserve the original filename permanently as provenance/detail data; never rename OSS object keys or rewrite stored bytes/checksums merely because a bibliographic suggestion is accepted.
- Every proposed field records source type, source page index when applicable, page classification, ruleset version, and confidence class. `资料详情` should be able to show the evidence behind a suggestion.
- Suggestions require explicit Owner/authorized metadata confirmation before becoming canonical shared facts. Low-confidence/ambiguous cases must fall back rather than invent metadata.
- Define a stable future page-text/OCR adapter boundary so the same classifier/extractor can later consume authorized OCR output without redesigning the suggestion contract.

## Non-goals
- No OCR execution in this card. Pure-image/scanned PDFs with no usable text layer must report `OCR deferred`/equivalent and remain reviewable manually.
- No whole-book OCR, OCR service deployment, LLM/AI extraction, embeddings, RAG, external catalogue/ISBN API, web lookup, fuzzy identity merge, or automatic authority-record merge.
- No silent bulk canonical rewrite of existing production holdings.
- No physical file/object rename requirement.
- No production deployment in this repository task.

## Acceptance Criteria
- Suggestion output is deterministic for the same authorized input and versioned ruleset.
- The bounded page window is enforced; pathological PDFs cannot trigger unbounded page/text processing for metadata discovery.
- Page classification fixtures cover Chinese title/版权/CIP pages, modern English title/copyright/CIP pages, older English title pages without copyright pages, already-clean documents, ambiguous pages, and ordinary body pages.
- Field-level evidence precedence is deterministic and independently testable; conflicting evidence is surfaced rather than silently overwritten.
- Every suggested field records source, source page when applicable, page class, and confidence; canonical data changes only through the normal authorized metadata update path.
- Original filename/object key/checksum/uploader provenance remain unchanged and retrievable in `资料详情`.
- Common noisy historical filenames produce materially cleaner fallback titles without deleting uncertain meaningful text.
- Chinese and Latin-script fixtures cover punctuation, archive suffixes, hashes, ISBN-like tails, already-clean names, malicious/plain-text rendering cases, and mixed-language metadata.
- A text-layer PDF can produce a structured bibliographic proposal from title/copyright/CIP evidence without OCR or network access.
- A pure scanned PDF does not guess: it returns the bounded `OCR deferred` state and preserves manual metadata entry.
- No inaccessible/private data is used to derive another account's suggestion, and Personal Research Overlay is never consulted.
- Parser/text limits prevent pathological filenames, embedded metadata, or front-matter text from causing unbounded work or unsafe rendering.

## Dependencies
- `L1-UX06` first repairs the catalogue presentation so canonical title display has one coherent surface.
- `RF-META01` defines the canonical fields, creator roles, validation, provenance/detail presentation, and authorized update contract before suggestions target them.

## Current State
Not implemented. Existing migrated holdings often have a Scholarly Record label derived directly from the historical filename. Owner review established that filename cleanup alone is insufficient: English and Chinese books should preferentially derive bibliographic proposals from title pages, copyright/title-page verso, CIP/colophon evidence, and embedded PDF metadata when a text layer already exists. Pure scanned documents remain outside this card's OCR boundary.

## Next Action
After `RF-META01`, define the page-classification/evidence-precedence contract and a compact bilingual fixture corpus first; then implement bounded text-layer extraction, deterministic suggestions, evidence presentation, and confirmation UI. STOP rather than starting OCR, network lookup, AI extraction, or production deployment.