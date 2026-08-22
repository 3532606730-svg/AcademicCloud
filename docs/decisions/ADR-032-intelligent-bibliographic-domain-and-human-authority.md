# ADR-032 — Intelligent Bibliographic Domain and Human Field Authority

**Date:** 2026-08-22
**Status:** Accepted by Owner through `L1-INTELLIGENT-LIBRARY01`

## Context

The completed RF-META01 contract intentionally covered five small metadata
templates. It cannot truthfully represent the material distinctions, scholarly
contributor roles, or carrier/source-edition relationship required by the
Intelligent Library. Migration 018 also fixes its discriminator with an
immutable SQLite `CHECK`; rewriting that table would create an unnecessary and
destructive migration.

AI-derived metadata must become useful by default without acquiring authority
over later human corrections. Contributor text recognition is not person
identity resolution, and a modern facsimile must not be catalogued as the
historical physical source it reproduces.

## Decision

### One authoritative Layer-1 classification

Layer 1 uses one controlled `materialClass` taxonomy:

```text
scholarly_monograph | edited_volume | journal_article | book_chapter
thesis_dissertation | conference_paper | review | reference_work
dictionary_lexicon | primary_source_modern_edition | traditional_book
archival_document | inscription_epigraphy | rubbing | manuscript
collected_documents | catalogue_bibliography | other | unknown
```

The older migration-018 `material_type` remains a compatibility field for its
five historical templates. It is not a second product taxonomy and must not be
used for new classification, Search filters, display composition, or citation
mapping once the integrated Layer-1 surfaces are active.

### Additive normalized persistence

Migration 023 adds, without rewriting existing rows:

- `scholarly_bibliographic_profiles` for classification, publication, series,
  volume/language, and current carrier-edition data;
- `scholarly_bibliographic_contributors` for stable ordered contributors,
  controlled conceptual role, preserved evidence role label, and optional safe
  Authority binding;
- `scholarly_bibliographic_source_editions` for nullable evidence-based
  dynasty/reign/year/imprint/edition/holding facts about the historical source;
- `scholarly_bibliographic_field_authority` for current field-level
  `human | ai` authority and its actor or immutable suggestion-run provenance.

Historical data stays absent unless already provable. There is no guessed
classification or full-Library AI migration backfill. Migration-019/020 evidence
and immutability triggers remain byte-for-byte unchanged.

### Contributors and identity

Controlled contributor roles are `author`, `editor`, `compiler`, `translator`,
`annotator`, `collator`, `punctuator`, `commentator`, `reviser`, `selector`,
`organizer`, and `other`. Evidence labels such as `主编`, `点校`, `校注`,
`整理`, or `今译` are preserved separately from the conceptual role.

Automatic person Authority binding is allowed only when the extracted label
has exactly one same-Library person match by exact canonical label or exact
alias. Fuzzy matching, invented Authorities, and ambiguous automatic binding
are prohibited. A manager may explicitly choose an existing exactly matching
Authority.

### Carrier and source editions

The current carrier/publication edition and the historical source/base edition
are distinct structures. A modern publisher facsimile may reference a Qing or
Ming source edition without asserting that the uploaded artifact is that
historical physical copy. Edition fields are nullable and evidence-based;
`unknown` is preferable to false precision.

### Human field authority

Canonical AI output is default metadata. A manager edit establishes durable
human authority only for the fields actually populated or changed, including
individual contributor fields. Unfilled fields remain available for later AI
enrichment. A later AI run may create new immutable evidence but must not
automatically replace a human-authoritative field.

Relinquishing human authority requires an explicit field-scoped action such as
“恢复 AI 数据” or “重新自动识别”. The action clears current authority; it does
not delete evidence or itself fabricate replacement values. Existing manager
edits to canonical title/subtitle/alternative titles/date/identifiers also
establish the corresponding field authority.

## Safety and authorization

All reads and writes continue through server-derived Library membership and
manager authority. Profile identity is Library-domain bound, CAS-versioned,
audited through the existing metadata event, and independent of physical object
identity and private research overlays. Original bytes and acquisition filename
provenance remain unchanged.

## Migration and rollback

Migration 023 is additive: no table/column drop, destructive rename, historical
reinterpretation, or speculative backfill. Production application of 023 must
follow the standard stopped-service verified backup and off-host evidence
procedure. Rollback after migration uses the exact previous application release
paired with the verified pre-023 database backup; the old application must not
be started against schema 023 because production startup requires exact schema
history.

## Consequences

- Compute, Search, display, citation, and frontend work share the same domain
  contract rather than inventing parallel schemas.
- Existing records remain safely usable with filename/canonical-title fallback.
- The model is more explicit than a generic JSON blob and supports indexed
  material/contributor/publication/source queries.
- The migration adds normalized write coordination, which remains isolated
  behind repository/service transactions.
