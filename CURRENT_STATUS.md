# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**`PROD-06A` is complete. Production runs exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017. No implementation task is active. Owner first-use review has approved a new repository-only catalogue-usability queue; production remains closed.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

The live authority/data transition is correct. Actual Owner use after deployment exposed a narrower presentation/usability issue: root `资料库` currently renders canonical Library holdings through `SharedLibraryPanel` and then renders the legacy Owner `EntryTable` below it. This causes the visible Name/Size/Updated header and folder rows to appear after the holdings, removes established file-type icons from the holdings rows, repeats migrated filename-derived labels, leaves redundant descriptive copy, and lacks an authority-correct recoverable lifecycle action for Library-owned holdings.

This review also established that basic catalogue search and cleaner scholarly titles must arrive earlier than previously sequenced.

## Production Truth

Production release:
- exact commit: `855b63c49f12f3375972774e7bc7385088b0495e`;
- previous commit: `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema/history: v17 / migrations 001–017 with exact checksums;
- live transition: one invocation applied exactly migrations 016–017; rollback not used;
- GitHub Actions run: `32111496535`;
- integrity: `ok`;
- foreign-key violations: zero;
- health/readiness: green;
- service loopback-only; autostart policy unchanged;
- canonical Library/membership/transition/backfill counts: 1 / 3 / 28 / 28;
- live contribution and credential-reset rows: zero after release acceptance.

Preexisting aggregates remain accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1. Opaque migration verification preserved stable IDs, object keys/bytes, checksums, uploader/contributor provenance, Scholarly Record/Artifact/Version lineage, Favorites/private-overlay state, and non-active residue without exposing private research rows.

Rollback is the inseparable pair:
- release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`;
- age ciphertext SHA-256 `8349ef5e90e72ff763d7730aadd98df56600e091f431a2c07d2b5a432eda8bf6`;
- off-host private backup checkpoint `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

Do not rerun PROD-05A or PROD-06A.

## Repository Baseline

Authoritative development branch: `codex/project-memory-reconcile-20260817`.

Historical migrations 001–017 are immutable. Development and production schema head is v17; future persistent work must append after 017.

Important completed foundations remain green: RF-AUDIT01, RF-OWNERSHIP01, RF-DOMAIN01, RF-LIBRARY01, RF-LIBRARY02, RF-SHAREDDEFAULT01, L2-CREDENTIALRESET01, L1-UX03/04/05, PROD-05A and PROD-06A.

## Owner-Approved Near-Term Repository Queue

No card is currently Doing. The approved planning order is:

```text
L1-UX06
→ RF-META01
→ RF-METASUGGEST01
→ RF-SEARCH01
→ RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
→ RF-VIEWS01
→ RF-INTAKE01
→ RF-ANNOTATE01
→ RF-CITE01
→ RF-EVIDENCE01
→ RF-EXPORT01
→ RF-LIBRARY03
→ RF-LIBRARY04
→ RF-INTEGRITY01
→ RF-RECOVERY01
→ RF-AUTHMATRIX01
→ RF-DERIVED01
→ STOP BEFORE OCR
```

### L1-UX06 — Ready
`tasks/ready/L1-UX06.md` owns the concrete catalogue regression: one unified catalogue, correct header placement, restored PDF/image/text/generic icons, removal of redundant summary copy and duplicate migrated labels, and Owner/Manager recoverable `移入回收站` semantics for eligible Library-owned resources without giving Members destructive authority. This is not permanent deletion and not a broad redesign.

### RF-META01 — Ready after L1-UX06
Canonical metadata/templates and minimal authority records surface through normal `资料详情`. Original filenames remain preserved as provenance/detail rather than serving as the only human-facing title.

### RF-METASUGGEST01 — New / Ready after RF-META01
`tasks/ready/RF-METASUGGEST01.md` owns deterministic, reviewable title/metadata suggestions from already-authorized local signals such as filenames and safe embedded metadata. It may conservatively remove tested acquisition noise but cannot silently rewrite canonical facts, object keys, bytes or provenance. No OCR, AI/LLM extraction, network catalogue lookup or fuzzy merge.

### RF-SEARCH01 — Priority moved forward
Basic authority-scoped catalogue metadata/name search now follows RF-METASUGGEST01 instead of waiting for RF-ORGANIZE01. The first UI is a quiet search field on `资料库`; original/display names and canonical metadata are searchable, with authority filtering before ranking/serialization and no persisted query history. No OCR/full-text claim.

## Safety Boundaries

This planning update authorizes repository planning only. It does **not** authorize:
- production deployment/contact/mutation;
- direct DB cleanup or permanent deletion / `PROD-03C2`;
- deletion of visible historical synthetic/test production residue;
- main merge;
- reboot/autostart, DNS/TLS/Nginx/systemd/firewall/certificate changes;
- credentials or paid infrastructure changes;
- OCR/text extraction, full-text indexing, embeddings, retrieval, RAG;
- external metadata/catalogue services or AI extraction.

Any later production release remains separately Owner-gated.

## Verification Policy

Verification is proportionate, not performative. `L1-UX06` should run affected frontend/component tests and only the focused backend authorization/lifecycle tests required by an authority-correct Library recycle path. RF-META/METASUGGEST/SEARCH verification should focus on schema/data-loss, authorization/non-disclosure, deterministic parsing/search, unsafe rendering, and concurrency boundaries. Do not replay historical production campaigns when unchanged.

## Next Action

Repository planning is reconciled. When the Owner explicitly starts development, select `L1-UX06` as the next bounded card, implement and independently review it, then STOP before any production deployment.