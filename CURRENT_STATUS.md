# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**`L1-UX06 — Canonical Catalogue Presentation Repair` is active as the first card in the Owner-approved four-card repository round. Production remains closed and unchanged at exact release `855b63c49f12f3375972774e7bc7385088b0495e`, schema v17/history 001–017.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

Owner use after PROD-06A confirmed the live authority/data transition but exposed a catalogue presentation gap: root `资料库` stacks canonical Library holdings above the legacy Owner `EntryTable`, so the visible Name/Size/Updated header and folder rows appear after holdings; canonical holdings also lose established file-type icons, repeat migrated filename-derived labels, retain redundant descriptive copy, and lack an authority-correct recoverable lifecycle action for Library-owned resources.

ADR-025 separately records the later bilingual title/copyright/CIP/front-matter evidence model and keeps OCR gated. It is not part of L1-UX06 implementation.

## Active Task

`tasks/doing/L1-UX06.md`

Task start baseline:
- authoritative branch: `codex/project-memory-reconcile-20260817`;
- planning baseline before task opening: `0692f0f7c68d576132b17fd6001e0f4b6582a3ff`;
- active task opening begins with `5f76713866f135d0151d34c63e13f47f87812ece` and subsequent durable-state reconciliation;
- production is not an implementation target for this card.

L1-UX06 owns only:
- one coherent canonical catalogue surface;
- correct desktop header placement;
- restored PDF/image/text/generic badges;
- removal of redundant summary copy and duplicate migrated labels;
- preserved Preview/Download/Favorites;
- Owner/Manager-only recoverable `移入回收站` for eligible Library-owned resources through authority-correct lifecycle semantics;
- preserved CAS/revision, stable IDs, object keys/bytes, checksums, provenance, lineage, and private overlays.

It does **not** own metadata schemas, automatic bibliographic suggestions, search, OCR, production deployment, cleanup, or permanent deletion.

## Current Owner-Approved Round

```text
L1-UX06   ← DOING
→ RF-META01
→ RF-METASUGGEST01
→ RF-SEARCH01
→ STOP for Owner/ChatGPT review
```

The later Pre-OCR queue remains parked after RF-SEARCH01 until another explicit Owner start.

### RF-META01 — Next only after L1-UX06 is green
Canonical metadata/templates and minimal authority records surface through normal `资料详情`; original filenames remain provenance/detail rather than the only human-facing title.

### RF-METASUGGEST01 — Then
For PDFs with a usable existing text layer, bounded discovery uses title/copyright/CIP/colophon/front-matter evidence, embedded metadata and filename fallbacks. Default page discovery is first 15 pages + last 5 pages. Pure scanned PDFs return `OCR deferred`; this round does not execute OCR.

### RF-SEARCH01 — Then
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

The Owner has authorized the four-card **repository** round only. L1-UX06 does not authorize:
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

Verification is proportionate, not performative. For L1-UX06: inspect the existing shared-library/root catalogue/EntryTable path first; run affected frontend/component tests and only focused backend authorization/CAS/lifecycle tests if Library-owned recycle semantics change. One typecheck/build pass may be used as applicable. Do not replay historical production campaigns, migrations, or PROD-05A/PROD-06A acceptance.

## Next Action

Implement and independently review `L1-UX06` only. Checkpoint/push durable evidence when green. Advance to RF-META01 only after independent review; production remains closed.