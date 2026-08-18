# ADR-025 — Front-Matter Bibliographic Suggestions and OCR Boundary

**Date:** 2026-08-18  
**Status:** Accepted by Owner; bounded local OCR amendment completed by RF-FRONTMATTEROCR01

## Context

Owner first-use review after PROD-06A showed that the shared-corpus authority model is correct but the visible catalogue still exposes noisy acquisition filenames as human-facing titles. Simple filename cleanup is useful but insufficient for scholarly books: reliable bibliographic facts are often already present in title pages, copyright/title-page verso pages, Chinese CIP/版权 pages, Library of Congress/British Library CIP data, colophons, and embedded PDF metadata.

The same need applies to Chinese and English/Latin-script books. Modern English books often separate identity facts on the title page from edition/ISBN/publication facts on the copyright page; older books may have no modern copyright page and place publisher/place/year directly on the title page. Chinese books frequently expose structured publication facts on copyright/CIP pages.

The repository remains STOP-before-OCR. This decision therefore distinguishes **existing text-layer front-matter analysis** from **future OCR of image-only scans**.

## Decision

### 1. Original sequencing proposal and current authorization

ADR-025 originally recorded this intended near-term sequence:

```text
L1-UX06
→ RF-META01
→ RF-METASUGGEST01
→ RF-SEARCH01
→ STOP for Owner/ChatGPT review
```

The subsequent Owner checkpoint authorized **RF-METASUGGEST01 only** for that
historical repository run and stopped after the Epic. On 2026-08-19 the Owner
separately authorized RF-FRONTMATTEROCR01; ADR-027 records its bounded local
fallback, provenance, and resource limits. RF-SEARCH01 remains parked and is
not implied by the OCR authorization.

The remaining Pre-OCR cards stay parked until a later explicit Owner restart.

### 2. Front-matter evidence is the primary suggestion source

After RF-META01 defined canonical fields, the completed RF-METASUGGEST01 implementation inspects a bounded local page window for PDFs that already contain usable text. Default discovery is limited to the first 15 pages plus the last 5 pages; it never scans an entire book merely to identify bibliography.

The classifier may recognize:
- cover;
- half-title;
- title page;
- copyright / title-page verso;
- Chinese 版权/CIP page;
- Library of Congress / British Library CIP;
- colophon;
- series page;
- contents/preface;
- ordinary body text.

### 3. Field-specific evidence precedence

Evidence precedence is per field, not global.

For title/subtitle and primary creator roles:

```text
title page
→ CIP / colophon / copyright evidence
→ embedded PDF metadata
→ original/display filename
```

For publisher/place/year/edition/ISBN and equivalent publication facts:

```text
copyright/title-page verso or CIP/colophon
→ title page
→ embedded PDF metadata
→ original/display filename
```

Older books without a modern copyright page may legitimately use title-page publication statements as the strongest available source.

### 4. Chinese and English cues are first-class

Bounded deterministic classifiers/parsers may use cues such as:

Chinese:
- 图书在版编目（CIP）数据;
- ISBN;
- 出版社 / 出版发行;
- 版次 / 印次;
- 责任编辑;
- 定价;
- equivalent tested publication labels.

English/Latin-script:
- Copyright;
- All rights reserved;
- Published by;
- First published;
- Edition;
- Library of Congress Cataloging-in-Publication Data;
- British Library Cataloguing in Publication Data;
- ISBN patterns;
- equivalent tested publication labels.

### 5. Suggestions remain evidence-backed proposals

Every suggested canonical field records:
- source type;
- source page index when applicable;
- page classification;
- ruleset version;
- confidence class.

`资料详情` should be able to show the evidence behind a suggestion. Canonical metadata changes only through the authorized metadata update path and explicit confirmation. Ambiguous evidence must be surfaced or ignored; the system must not invent facts.

### 6. Physical identity and provenance do not change

Accepting a cleaner title or metadata proposal does not rename the OSS object key, rewrite bytes, change checksum, erase uploader/contributor provenance, or discard the original filename. The original filename remains retrievable as provenance/detail data.

### 7. OCR remains bounded and separately gated from whole-document intelligence

The historical RF-METASUGGEST01 checkpoint did **not** execute OCR. Completed
RF-FRONTMATTEROCR01 now permits only local/offline OCR fallback for unusable
pages inside the same exact first-15/last-5 window. Usable native text still
bypasses OCR, and all results remain reviewable evidence rather than canonical
metadata writes.

The stable provider-neutral page-text/OCR adapter feeds only selected
front/back-matter evidence into the existing classifier and manager-review
contract without redesigning the bibliographic model.

No whole-book OCR is implied by metadata discovery. A later OCR design should prefer bounded candidate pages rather than processing hundreds of pages merely to find title/copyright information.

## Non-goals

This decision does not authorize:
- OCR outside the completed bounded local front-matter fallback;
- full-text indexing/search;
- LLM/AI metadata extraction;
- external catalogue/ISBN/network lookup;
- fuzzy identity merge;
- automatic authority merge;
- silent production bulk rewrites;
- production deployment;
- permanent deletion;
- object-key or stored-byte renaming.

## Relationship to existing work

- ADR-022 remains authoritative for the shared-corpus/private-overlay product model.
- RF-META01 owns canonical metadata contracts and `资料详情`.
- RF-METASUGGEST01 completed the bounded deterministic evidence/suggestion layer defined here.
- RF-SEARCH01 remains a separately parked future card and is not authorized by
  the current RF-METASUGGEST01 checkpoint; if later opened, it may search
  authorized names/canonical metadata only, while OCR/full-text search remains
  separately gated.
- RF-FRONTMATTEROCR01 completed the later explicit bounded OCR authorization;
  RF-SEARCH01, whole-document extraction, indexing, retrieval, and RAG remain
  separately gated.
