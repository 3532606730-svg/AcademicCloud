# ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1

- Status: Implemented, verified, and passed first real local Owner roundtrip; production export-only continuation separately authorized; bounded selection UX correction in review
- Branch: `feature/batch-catalog-roundtrip-v1`
- Source: pushed exact feature checkpoint `4f37c54eaed913771c20dc00995884c1cc8264e9`
- Production touched: no by this UX correction
- Schema migration: none

## Objective

Implement the ADR-039 human-mediated Library cataloguing roundtrip: bounded local native-text/selective-PaddleOCR evidence ZIP, strict external results contract, side-effect-free preview, explicit Owner selection, and identity/collision/authority-safe canonical metadata plus display-filename apply.

## Acceptance

- [x] Match only by durable resource ID and existing immutable source fingerprint.
- [x] JSON-only evidence ZIP; no PDF/image bytes; bounded 15+5 selective extraction.
- [x] Strict results schema, size/enumeration/path/duplicate checks, and full manifest digest verification.
- [x] `academiccloud.filename.v1` exact Owner-approved formats; no placeholder or numeric suffix invention.
- [x] Preview is mutation-free; AUTO remains visible; REVIEW needs explicit selection; UNKNOWN cannot apply.
- [x] Same-content duplicate and different-content collision fail closed without overwrite.
- [x] Apply revalidates preview/source state, preserves object key, records normal audit, and establishes Owner-confirmed human authority.
- [x] Minimal bilingual Library UI and Local Compute exporter without main-worker dependency.
- [x] Eight-class deterministic local roundtrip fixture.
- [x] Full Backend 393/393, Frontend 287/287, Compute 123/123 plus two expected runtime skips, contracts 3/3, typecheck, build, CORS contract, and diff review.
- [x] Exact feature checkpoint prepared for normal non-force publication on the isolated feature branch.
- [x] First real local Owner UI roundtrip passed on `Mongolia Between China and the USSR .pdf`: 88 pages, bounded 20-page evidence, 18 native-text pages, 2 PaddleOCR pages, JSON-only/privacy/identity gates green, and UNKNOWN import preview mutation-disabled.
- [ ] Batch Catalog dialog remains bounded to the PDFs explicitly selected before opening; background Library hydration must not expand the visible/export candidate list.
- [ ] Redundant operator-facing export/privacy prose is removed from the dialog while the explicit apply confirmation remains intact.

## Current State

Owner browser evidence on 2026-09-02 exposed a UI regression: opening Batch Catalog with two selected PDFs initially showed those two, then the dialog asynchronously loaded the wider Library PDF set (94 in the observed production state). The export ID set was separate, but the UI expansion was misleading and had already contributed to an incorrect large-batch workflow. The correction removes that background Library hydration and keeps the dialog list/export scope fixed to the initial explicit selection. The two long explanatory paragraphs above/below export are also removed as redundant UI copy. No backend, schema, catalog authority, source identity, apply semantics, or production data behavior changes.

## Explicit exclusions

No OpenAI/DeepSeek/local reasoning integration, production job, main worker activation, production data mutation, database migration, or deletion of existing NuExtract/Qwen work. Production deployment of this UX correction remains a separate Owner gate.
