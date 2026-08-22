# ADR-035 — Deterministic CSL Citation Projection and Style Pinning

**Date:** 2026-08-22

**Status:** Accepted

**Task:** `L1-INTELLIGENT-LIBRARY01` Checkpoint D

## Context

Migration 023 separates canonical bibliographic facts from physical filenames,
private research state, and AI-run evidence. Citation output now needs to use
those facts without introducing a second metadata authority, silently changing
with a remote style update, or flattening Chinese historical locators into an
ambiguous page string.

Public guidance and maintained CSL sources also move independently. Chicago's
public Notes and Bibliography guide is now aligned to the 18th edition, while
GB/T 7714—2025 replaced the 2015 edition on 2026-07-01. 《历史研究》 and
《文史哲》 require Chinese note conventions and historical-resource locators
that are not completely represented by a modern-book-only example set.

## Decision

1. Core authorizes the Library holding first and then reads its canonical
   metadata through the existing metadata-details service. Citation generation
   never accepts client-supplied owner, membership, canonical metadata, or
   contributor authority.
2. Canonical structured metadata is projected into one style-neutral,
   CSL-compatible item. Current carrier edition, historical source/base
   edition, precise contributor roles, archive/fonds/reference facts, and
   material class remain distinct in this projection.
3. The release exact-pins `citeproc-js` package `citeproc@2.4.63`. Processing is
   local and deterministic: no runtime network call, AI model, remote style
   fetch, or user-authored template execution occurs.
4. The first release supports exactly Chicago Notes & Bibliography,
   《历史研究》, 《文史哲》, and GB/T 7714—2025. Each generated CSL definition
   exposes a revision, reviewed source, review date, processor version, and
   expected SHA-256. Startup/request processing fails closed if a definition's
   bytes drift without an explicit hash update.
5. The four definitions are explicitly labelled `production_subset`. This is
   a tested, release-owned implementation of the program's supported material
   and locator contract, not a claim that every edge case of an external style
   or standard is already implemented. Upstream CSL files are not vendored;
   their source links and rights remain attributed.
6. Locators use a strict typed structure. Page, page range, volume, fascicle,
   chapter, 卷, 叶面, line, item, document number, archive call number, and a
   labelled custom locator are represented separately, normalized in a stable
   order, and rendered with style-appropriate labels. An unlabeled custom
   locator is rejected.
7. Generation is per request and stores no citation history or private
   research overlay. The later personal citation workspace/export queue is not
   pulled into Layer 1.

## Consequences

- Full note, subsequent short note where supported, bibliography, normalized
  CSL item, structured locators, completeness, and style provenance are
  returned together for UI copy/display.
- A Member with effective access may cite the shared holding; guessed Library
  or holding identities remain non-disclosing because metadata loading occurs
  only after the established authority check.
- Missing metadata produces a bounded partial citation with explicit
  completeness rather than invented edition, date, contributor, archive, or
  publication facts.
- Style changes require an intentional code/revision/hash change and regression
  evidence. Updating a remote CSL source cannot change a deployed release.
- Checkpoint D adds no schema migration, backfill, object mutation, provider or
  production configuration change. Rollback removes the citation route and
  exact processor dependency; migrations 023–024 remain additive and
  unchanged.
