# ADR-026 — Canonical Scholarly Metadata and Minimal Authorities

**Date:** 2026-08-18
**Status:** Accepted by Owner through RF-META01 authorization

## Context

AcademicCloud has retained Scholarly Record / Artifact / Version identities and one canonical shared Library, but a catalogue holding still uses its accepted acquisition/display filename as its only human-facing title. Canonical scholarly facts must be editable without renaming the physical file, weakening Library governance, or mixing another account's private research activity into shared metadata.

ADR-025 defines a later evidence-backed suggestion layer. It deliberately does not define the canonical destination contract. RF-META01 therefore needs a small, durable destination model that later suggestion, search, provenance, and export work can consume without creating a dynamic ontology system.

## Decision

### 1. Canonical metadata belongs to the retained Library Record

A canonical Library Record may have no metadata or one complete version-1 metadata snapshot. Absence preserves the existing catalogue fallback. Metadata never replaces or updates:

- `scholarly_records.label`, which remains a retained internal/legacy handle;
- `files.display_name`, which remains the accepted acquisition/display filename exposed separately as `原始文件名`;
- the storage provider/object key, stored bytes, checksum, uploader/contributor provenance, or Record/Artifact/Version identities;
- Favorites or any other Personal Research Overlay state.

The catalogue displays `canonicalTitle` when metadata exists and otherwise displays `file.displayName`. It does not present both as competing compact-row titles.

### 2. Exact metadata contract v1

The fixed discriminator is one of:

```text
book | article | manuscript | inscription | archival_document
```

Every metadata snapshot has these common fields:

| Field | Cardinality | Contract |
|---|---:|---|
| `canonicalTitle` | 1 | required; 1–512 Unicode code points |
| `subtitle` | 0–1 | 1–512 code points |
| `alternativeTitles` | 0–8 | ordered; each 1–512; exact normalized duplicates rejected |
| `dateStatement` | 0–1 | 1–128; a plain scholarly display statement, not a claimed precise date |
| `identifiers` | 0–8 | ordered `{scheme,value}`; scheme matches `[a-z][a-z0-9._-]{0,31}` and value is 1–128 |

Type-specific fields are all optional and unknown fields are rejected:

| Material type | Exact type-specific fields |
|---|---|
| Book | `editionStatement` (1–128), `volumeStatement` (1–128) |
| Article | `volumeStatement` (1–64), `issueStatement` (1–64), `locator` (1–128) |
| Manuscript | `shelfmark`, `supportStatement`, `extentStatement`, `scriptStatement` (each 1–128) |
| Inscription | `objectType`, `materialStatement`, `dimensionsStatement`, `scriptStatement` (each 1–128) |
| Archival Document | `documentType` (1–128), `fondsOrCollection` (1–255), `seriesStatement` (1–255), `referenceCode` (1–128) |

Human-readable strings are normalized to NFC and trimmed. Empty values, NUL/C0/C1/DEL controls, tabs, and line breaks are rejected. Internal punctuation, case, characters, and spacing are not transliterated, modernized, or guessed. Identifier schemes are lower-case ASCII; identifier values remain faithful normalized text. Plain text is rendered only as text.

### 3. Minimal domain-scoped authorities

An authority contains only a server-generated stable ID, one type, canonical label, up to eight ordered aliases, and an opaque version. Types are exactly:

```text
person | place | language | work | institution
```

Canonical labels and aliases are normalized one-line plain text of 1–255 code points. Exact `(Library ownership domain, type, canonical label)` collisions conflict only inside that domain. Aliases do not merge identities. There is no fuzzy/global match, cross-domain merge, external lookup, RDF/OWL model, general graph edge, or automatic identity resolution.

Record links are ordered, limited to 32 per Record, unique by `(authorityId, role)`, and constrained by authority type:

```text
Person:      author | editor | translator | compiler | scribe |
             sender | recipient | creator | contributor
Place:       publication_place | creation_place | discovery_place
Language:    content_language | original_language
Work:        container_work | series_work | source_work
Institution: publisher | holding_institution | issuing_body | creator
```

The Record and authority must share the exact Library ownership domain. Roles are not artificially restricted by material type so legitimate exceptional facts and safe material-type corrections retain links.

### 4. Authority and API boundary

Normal product routes are scoped by exact Library and holding file. The server resolves the active account, effective Library membership, Library ownership domain, active holding, Record, Artifact, Version, file, and audit actor. The client cannot set a Record/domain/owner, role, uploader/contributor identity, or audit actor.

Effective Members may read details and available authorities. Only an effective Library manager may mutate metadata or authorities. Global Owner status is not a substitute for effective membership/role in the exact Library. Wrong-Library, guessed-holding, disabled/archived actor, and inaccessible authority cases fail non-disclosingly.

The canonical detail response is structurally separate from Personal Research Overlay repositories and does not serialize Favorites, notes, annotations, reading state, private tags, collections, citations, history, or equivalent private activity.

### 5. Optimistic concurrency and non-lossy transitions

Metadata and authorities use opaque CAS tokens separate from the file/recycle version. A no-metadata Record also receives a record-specific token so competing first writes conflict correctly.

One metadata mutation replaces the validated common fields, exact type-specific fields, identifiers, alternative titles, and complete authority-link set in one immediate transaction. A stale token returns `concurrent_change`; any invalid or inaccessible link rolls back the entire mutation.

A material-type change is allowed only when every source-template-specific field is already absent. Otherwise the server returns `incompatible_type_transition` without mutation. The manager must first make a visible same-type CAS edit that clears those fields, then submit the type change using the new version. There is no force/discard flag and no automatic field mapping or deletion.

### 6. Persistence shape

Migration 018 adds one metadata root, normalized ordered common-value tables, fixed discriminator-specific storage, domain-scoped authority/alias/link tables, same-domain composite foreign keys, and immutability/type guards. It performs no metadata or authority backfill and does not edit migrations 001–017.

The implementation may use a migration-fixed type-field registry instead of five nullable union columns/tables only when the accepted field names and material compatibility are enforced by both database guards and server validation. It must not become client-defined EAV or a runtime schema builder.

## Consequences

- Existing holdings remain valid and retain filename fallback until explicitly catalogued.
- Later RF-METASUGGEST01 may propose values into this exact contract but cannot write them silently.
- Later search/export/provenance work has stable canonical fields and authority roles without depending on private overlays.
- Correcting a material type may require two explicit saves when source-specific facts exist; this is intentional evidence-preserving friction.
- The current `files.display_name` is the accepted Library acquisition/display filename. Reconstructing every pre-admission rename is a later provenance concern and is not invented by RF-META01.

## Non-goals

No automatic extraction or filename cleanup, PDF/front-matter parsing, OCR, catalogue/ISBN/network lookup, AI/LLM extraction, search/indexing, embeddings/retrieval/RAG, mature authority control, standalone Scholarly Record browser, production migration/deployment, or permanent deletion is authorized by this decision.

## Relationship to existing decisions

- ADR-014 remains authoritative for shared facts versus private research activity.
- ADR-016 remains authoritative for ownership domains.
- ADR-018 remains authoritative for retained Record/Artifact/Version identities.
- ADR-020 and ADR-022 remain authoritative for effective Library authority and the canonical shared corpus.
- ADR-025 remains authoritative for the later suggestion/evidence and OCR boundary.
