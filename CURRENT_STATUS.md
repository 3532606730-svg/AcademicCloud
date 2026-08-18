# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**`RF-META01 — Canonical Metadata, Templates, and Minimal Authorities` and the Owner-authorized `RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions` are complete and independently green. No repository Epic is active; the boundary is STOP for independent Owner/ChatGPT review. Development schema is v19/history 001–019. Production remains closed and unchanged at exact release `855b63c49f12f3375972774e7bc7385088b0495e`, schema v17/history 001–017.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

L1-UX06 now renders canonical Library holdings and Owner-managed folder/account rows through one existing catalogue table, restores established file-type badges and compact row actions, suppresses duplicate filename-derived labels and redundant descriptive copy, and supplies a complete manager-only Library-domain recycle → normal Recycle list → CAS restore lifecycle. Account-private and Library governance recycle authority remain distinct internally.

ADR-026 records the implemented canonical metadata, minimal authority, CAS, non-lossy type-transition, privacy, and filename-separation contract. ADR-025 and ADR-027 record the completed bounded local text-layer suggestion/evidence model; they keep OCR, whole-document extraction, and external/AI enrichment outside this checkpoint.

## Latest Completed Epic

`tasks/done/RF-METASUGGEST01.md`

`RF-META01` remains complete. RF-METASUGGEST01 generates deterministic, reviewable Chinese/English bibliographic suggestions from bounded local existing text-layer evidence and conservative embedded/filename fallbacks. Suggestions remain proposals; only explicit effective-manager acceptance through the RF-META01 CAS path may write canonical metadata. Pure image-only PDFs return `OCR deferred`; no OCR, network, AI, or production action was authorized.

Completed result:
- append-only migration 019 advances development from schema v18 to v19 and stores only immutable suggestion-run/candidate evidence; no PDF bytes, raw page text, object keys, or private overlay state are persisted;
- a provider-neutral storage read seam and pinned PDF.js 6.2.108 inspector enforce a 32 MiB object cap, first-15/last-5 page window, per-page/total text limits, embedded metadata limits, and a five-second budget without rendering/OCR;
- deterministic bilingual page classification and extraction support title/CIP/copyright/colophon evidence, older title-page publication statements, field-specific precedence, source/page/class/confidence, conservative filename cleanup, ambiguity, and OCR-deferred/unsupported states;
- normal `资料详情` shows reviewable candidates to Members read-only and gives effective Library managers explicit generate/select/use/accept controls; acceptance rechecks source/database CAS, rejects conflicts and unresolved authorities, and calls RF-META01 rather than writing canonical SQL directly;
- focused tests cover Chinese/English/CIP/older books/body-noise/metadata placeholders, exact page bounds, malformed/image-only PDFs, authority/privacy/identity preservation, stale/provider changes, HTTP authorization, and frontend evidence behavior;
- production was not contacted, migrated, deployed, or otherwise changed.

## Completed Dependency

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
→ RF-META01   ← DONE
→ RF-METASUGGEST01   ← DONE
→ STOP
```

RF-SEARCH01 and the later Pre-OCR queue remain parked and require new explicit Owner authorization.

### RF-META01 — Complete
ADR-026 is implemented through append-only repository schema v18, exact holding-scoped APIs, and normal `资料详情`; no production migration was performed or authorized.

### RF-METASUGGEST01 — Complete
ADR-025/027 are implemented through migration 019, bounded provider-neutral text-layer inspection, deterministic Chinese/English evidence extraction, reviewable normal `资料详情` suggestions, and explicit manager-only RF-META01 CAS acceptance. Default discovery is first 15 pages + last 5 pages; pure scanned PDFs return `OCR deferred`; this Epic did not execute OCR or contact production.

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

The current RF-METASUGGEST01 repository authorization does not authorize:
- production contact, mutation, deployment, or cleanup;
- direct DB cleanup or permanent deletion / `PROD-03C2`;
- deletion of visible historical production residue;
- main merge;
- reboot/autostart, DNS/TLS/Nginx/systemd/firewall/certificate changes;
- credentials or paid infrastructure changes;
- OCR execution, whole-book/whole-document text extraction, or image processing;
- full-text indexing, embeddings, retrieval, RAG;
- external metadata/catalogue services, ISBN APIs, web search, or AI/LLM extraction;
- RF-SEARCH01, persisted query history, full-text indexing, embeddings, retrieval, or RAG.

Any later production release remains a separate Owner gate.

## Verification Policy

RF-META01 remains green at checkpoint `2322169bc33415734d025010c465900c7fbc6bd9`. RF-METASUGGEST01 is complete at the checkpoint reported in its done card; changed-risk tests, full backend/frontend suites, builds, and independent review are the relevant evidence. Do not replay unrelated historical production acceptance or contact production.

## Next Action

STOP for independent Owner/ChatGPT review. Do not start RF-SEARCH01, OCR/RAG work, or contact production without a new explicit authorization.
