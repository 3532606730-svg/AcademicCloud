# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**`L1-UX06 — Canonical Catalogue Presentation Repair` is complete and independently green after its bounded Owner-review closure repair. Repository execution is stopped for Owner/ChatGPT review. Production remained closed and unchanged at exact release `855b63c49f12f3375972774e7bc7385088b0495e`, schema v17/history 001–017.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

L1-UX06 now renders canonical Library holdings and Owner-managed folder/account rows through one existing catalogue table, restores established file-type badges and compact row actions, suppresses duplicate filename-derived labels and redundant descriptive copy, and supplies a complete manager-only Library-domain recycle → normal Recycle list → CAS restore lifecycle. Account-private and Library governance recycle authority remain distinct internally.

ADR-025 separately records the later bilingual title/copyright/CIP/front-matter evidence model and keeps OCR gated. It is not part of L1-UX06 implementation.

## Completed Task

`tasks/done/L1-UX06.md`

Completed result:
- one coherent root catalogue with its desktop header above Owner folders/account rows and canonical holdings;
- existing PDF/image/text/generic badges, `RowMenu`, `StarButton`, responsive rows, and fullscreen Preview behavior reused;
- one visible filename-derived title until RF-META01, with `recordLabel` residue omitted from compact rows and provenance retained in data;
- manager-only `POST /api/libraries/:libraryId/holdings/:fileId/recycle`, with active membership, exact-Library holding resolution, Library ownership-domain resolution, opaque `driveEntryVersion` CAS, transactional recycle-group provenance, and non-disclosing Member/wrong-Library/guessed-ID denial;
- manager-only `GET /api/libraries/:libraryId/recycle` and `POST /api/libraries/:libraryId/recycle/:fileId/restore`, with exact deleted scholarly holding/domain resolution, read-only object metadata verification, post-stat authority/version/group revalidation, atomic restore/group consumption/audit, and no account-path fallback;
- one top-level Recycle product surface combining separately held account and Library rows; Library rows expose Restore only and never enter account bulk/permanent-delete controls;
- no permanent delete, storage-byte mutation, schema change, production contact, or private-overlay exposure.

## Current Execution Boundary

```text
L1-UX06   ← DONE
→ STOP for Owner/ChatGPT review
```

`RF-META01`, `RF-METASUGGEST01`, and `RF-SEARCH01` remain preserved Ready cards but were not started in this run. The later Pre-OCR queue remains parked.

### RF-META01 — Preserved, not started
Canonical metadata/templates and minimal authority records surface through normal `资料详情`; original filenames remain provenance/detail rather than the only human-facing title.

### RF-METASUGGEST01 — Preserved, not started
For PDFs with a usable existing text layer, bounded discovery uses title/copyright/CIP/colophon/front-matter evidence, embedded metadata and filename fallbacks. Default page discovery is first 15 pages + last 5 pages. Pure scanned PDFs return `OCR deferred`; this round does not execute OCR.

### RF-SEARCH01 — Preserved, not started
One authority-scoped catalogue metadata/name search field on `资料库`, with authority filtering before ranking/serialization and no persisted query history or OCR/full-text claim.

## Production Truth

Production remains:
- exact release `855b63c49f12f3375972774e7bc7385088b0495e`;
- previous release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema/history v17 / migrations 001–017 with exact checksums;
- PROD-06A live transition applied exactly migrations 016–017 once; rollback was not used;
- GitHub Actions artifact run `32111496535`;
- integrity `ok`;
- foreign-key violations zero;
- health/readiness green;
- API loopback-only; autostart policy unchanged;
- canonical Library/membership/transition/backfill counts 1 / 3 / 28 / 28;
- stable IDs, object keys/bytes, checksums, uploader/contributor provenance, Scholarly Record/Artifact/Version lineage, Favorites/private-overlay state, and non-active residue preserved.

Current rollback pair remains inseparable:
- release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`;
- age ciphertext SHA-256 `8349ef5e90e72ff763d7730aadd98df56600e091f431a2c07d2b5a432eda8bf6`;
- off-host private backup checkpoint `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

Do not rerun PROD-05A or PROD-06A.

## Safety Boundaries

The consumed L1-UX06 repository authorization did not authorize:
- production contact, mutation, deployment, or cleanup;
- direct DB cleanup or permanent deletion / `PROD-03C2`;
- deletion of visible historical production residue;
- main merge;
- reboot/autostart, DNS/TLS/Nginx/systemd/firewall/certificate changes;
- credentials or paid infrastructure changes;
- OCR execution or whole-book text extraction;
- full-text indexing, embeddings, retrieval, RAG;
- external metadata/catalogue services, ISBN APIs, web lookup, or AI/LLM extraction.

Any later production release remains a separate Owner gate.

## Verification Policy

The bounded closure repair is green: focused backend Library service/HTTP 6/6; focused frontend App/API 113/113; backend/frontend typechecks and `git diff --check` pass (line-ending notices only). Independent review found one active-Recycle re-click loading defect, the repair and regression test are green, and follow-up review found no material findings. No broad historical/production suite, production build, PROD-05A/PROD-06A acceptance, or migration rehearsal was replayed.

## Next Action

STOP for independent Owner/ChatGPT review. Do not start RF-META01 or contact production without new Owner direction.
