# ADR-034 — Metadata-Aware Catalogue Query and Display Identity

**Date:** 2026-08-22

**Status:** Accepted / Owner-amended 2026-08-28

**Task:** `L1-INTELLIGENT-LIBRARY01` Checkpoint C

## Context

RF-SEARCH01 supplied an authorization-first bounded catalogue search over
canonical metadata and filenames. Migration 023 later introduced the single
Layer-1 `materialClass` taxonomy, normalized contributors, publication facts,
and separate carrier/source-edition structures. Searching only the older
metadata projection would make those authoritative facts invisible, while
persisting a composed row label would collapse independent bibliographic facts
and create a second canonical title.

The Library also already has six server-authoritative normal sort modes with a
specific Hanyu-Pinyin/natural/numeric/Unicode policy. Metadata expansion must
not silently replace that completed contract or let a client-side React filter
become authoritative.

## Decision

1. Effective Library membership filtering remains the first operation. Only
   already-authorized holdings enter query matching, filtering, counting,
   ranking, or pagination.
2. Catalogue Search reads both the established canonical-metadata projection
   and the normalized migration-023 bibliography. Title and contributor
   matches retain stronger tiers than identifiers, other metadata, and safe
   filename fallback.
3. Material-class and restrained advanced filters are evaluated by Core over
   structured fields. The supported filter contract is material class,
   contributor, language, publisher, year/date, edition type, dynasty, reign
   title, editorial role, series, and volume.
4. Search cursors bind a digest of the normalized query, normalized filters,
   and sort mode. A cursor from a different identity is rejected. Keyset data
   follows the selected relevance or one of the existing six sort policies,
   with stable file identity as the final tie-break.
5. Relevance and normal Library sorting remain separate concepts. The existing
   six holding-list sort implementations and SQL/Pinyin policy are unchanged;
   Search may explicitly request the same ordering without redefining it.
6. Scholarly display labels are presentation-only projections. A positively
   classified modern scholarly work uses author plus canonical title. A
   positively classified historical or primary-source work uses canonical
   title plus a supported version identity assembled from distinct carrier,
   source-edition, editorial-role, and necessary publication facts. A generic
   person value never becomes a historical-source author prefix. A supported,
   stored volume/part follows the canonical title, before any version identity,
   so separate volumes remain distinguishable. Its value is displayed as stored
   without guessing a unit; an identical, delimited terminal title component is
   not repeated. For positively classified `journal_article`, `book_chapter`,
   `conference_paper`, and `review` works, volume identifies the enclosing
   container and is omitted from the composed work title. It remains an
   independent bibliographic fact. This projection does not modify the
   canonical title or volume.
7. Missing structured components are omitted. An `unknown`, `other`, or
   unprofiled work displays only its supported canonical title and any supported
   stored volume/part (or the safe original display name when no canonical title
   exists); it never borrows a legacy person field to guess the modern
   `author + title` format. No guessed
   work class, dynasty, edition precision, contributor role, or placeholder is
   introduced into the composed label.
8. The composed label may be projected into the browser attachment/download
   filename while preserving only the already-authorized safe original
   extension. It is never persisted as a physical filename or canonical fact,
   and `objectKey` never changes.

## Consequences

- Structured queries such as `明代刻本`, `万历刻本`, `武英殿本`, `影印本`,
  `现代点校本`, and `中华书局点校本` work only when their component metadata is
  present.
- Library lists, Search results, and Library-scoped Favorites receive the same
  non-persisted catalogue display projection.
- Resource Details and authorized attachment downloads consume the same
  projection, while canonical facts, the original filename, and object storage
  identity remain separate.
- The current bounded whole-accessible-corpus search remains appropriate for
  the present small corpus. A later scale-driven indexed search may replace
  its execution strategy only if it preserves this authority, ranking, filter,
  cursor, and display contract.
- Checkpoint C requires no schema migration, backfill, object mutation,
  provider/configuration change, or production action. Rollback is an
application-code rollback; migrations 023–024 remain additive and unchanged.
