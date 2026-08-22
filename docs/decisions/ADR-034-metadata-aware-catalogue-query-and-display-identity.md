# ADR-034 — Metadata-Aware Catalogue Query and Display Identity

**Date:** 2026-08-22

**Status:** Accepted

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
6. Scholarly display labels are presentation-only projections:
   modern scholarly works use contributor plus canonical title; historical or
   primary-source works use canonical title plus a supported carrier/source
   edition statement. Current carrier and historical source facts remain
   distinct. The composed label is returned in DTOs but is never written to
   `canonicalTitle`, storage keys, or filenames and is not the sole search
   identity.
7. Missing structured facts fall back through existing canonical metadata to
   the safe display name. No guessed dynasty, edition precision, contributor,
   or placeholder is introduced.

## Consequences

- Structured queries such as `明代刻本`, `万历刻本`, `武英殿本`, `影印本`,
  `现代点校本`, and `中华书局点校本` work only when their component metadata is
  present.
- Library lists, Search results, and Library-scoped Favorites receive the same
  non-persisted catalogue display projection.
- The current bounded whole-accessible-corpus search remains appropriate for
  the present small corpus. A later scale-driven indexed search may replace
  its execution strategy only if it preserves this authority, ranking, filter,
  cursor, and display contract.
- Checkpoint C requires no schema migration, backfill, object mutation,
  provider/configuration change, or production action. Rollback is an
application-code rollback; migrations 023–024 remain additive and unchanged.
