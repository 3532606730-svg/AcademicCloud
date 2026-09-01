# ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1

- Status: Implemented and verified in isolated feature branch; Owner local acceptance pending
- Branch: `feature/batch-catalog-roundtrip-v1`
- Source: pushed clean checkpoint `cbe3d33c39abe031984a428bd8cfb3d71dfef61c`
- Production touched: no
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

## Explicit exclusions

No OpenAI/DeepSeek/local reasoning integration, production deployment, production job, main worker activation, production data mutation, database migration, or deletion of existing NuExtract/Qwen work.
