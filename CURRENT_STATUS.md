# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**`PROD-06A` is complete. Production runs exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017. The bounded First-Use Correction objective is exhausted; no task is active and execution is stopped for independent Owner/ChatGPT review.**

`RF-SHAREDDEFAULT01` is complete and synchronized at `51c3d7b82d05574e53849c6ef1b5eec0e9ceabc5`. `L2-CREDENTIALRESET01` is complete and synchronized at `836d78636ef7aab41b03e00321167efed0a94d9d`. `L1-UX05` is complete, independently green, and synchronized at `f7b9ef0475964f60f28a56450c6ef5e22a0df4c5`. Exact candidate `855b63c…` contains those consecutive checkpoints plus only two artifact-verification repairs and is now the installed production release.

The requested code-bearing checkpoint `f7b9ef0…` exposed two stale verification-only boundaries in exact Linux workflow runs `32110757279` and `32111110773`; neither run packaged an artifact. Candidate `855b63c…` differs from `f7b9ef0…` only in `frontend/src/App.test.tsx` readiness synchronization and `backend/scripts/compiled-acceptance.mjs` schema-17/Owner-assisted-reset acceptance. Successful run `32111496535` built and independently re-downloaded/verified the exact Linux x64 / Node 24 artifact; artifact ID `9315081408`, GitHub artifact SHA-256 `4ba3592680daea05a27e43a08f57f135c70deb75917f1574a3db67a6c84ae413`, release archive SHA-256 `360397616cc3767181737650c45608df6232cf77d71b3c6fcc48a67c940ee375`, and manifest SHA-256 `d9122eb97329834f8d2bf1909c87ffa426eaf8b1c59ecf2d1c53edb9d1970a62` are bound to production.

First-use review established that the existing “account-private Drive + optional Shared Library” presentation is not the intended AcademicCloud product. ADR-022 now defines the durable correction:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

For a normal Member, upload means pending contribution/review, not creation of a permanent private corpus. Approval admits the resource into the single canonical `资料库`, where all active authorized members may browse/preview/download it. Favorites, Recent, reading state/progress, Personal Tags, Collections, notes, annotations, citations, evidence, Research Questions, and equivalent research activity remain private per account.

## Production Truth

Production release:
- exact commit: `855b63c49f12f3375972774e7bc7385088b0495e`;
- previous commit: `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema/history: v17 / migrations 001–017 with exact file checksums;
- live transition: one invocation applied exactly migrations 016–017; rollback not used;
- GitHub Actions run: `32111496535`;
- integrity: `ok`;
- foreign-key violations: zero;
- health/readiness: green;
- service active with zero restarts/errors/OOM findings, autostart still disabled, API loopback-only;
- canonical Library/membership/transition/backfill counts: 1 / 3 / 28 / 28;
- live contribution and credential-reset rows: zero; focused acceptance used disposable synthetic state and in-memory storage only.

Preexisting production aggregates after migration remain accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1. Opaque before/after verification proved stable IDs, object keys/bytes, checksums, uploader/contributor provenance, Scholarly Record/Artifact/Version lineage, Favorites/private-overlay state, and non-active residue were preserved without exposing private research rows.

Rollback is the inseparable pair:
- previous release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`.

The receipt SHA-256 is `cc1af93dfce4a19f8a82ab8e3f0a90690af3a2f50ae47f7b3435d7e52e7b92d4`; age ciphertext SHA-256 is `8349ef5e90e72ff763d7730aadd98df56600e091f431a2c07d2b5a432eda8bf6`. Byte-identical ciphertext, receipt, and manifest are verified off-host at private backup repository commit `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

Do not rerun PROD-05A or PROD-06A. The production card is complete at `tasks/done/PROD-06A.md`; it does not reopen any other production or development work.

## Repository Baseline

Authoritative development branch:
- `codex/project-memory-reconcile-20260817`.

Historical migrations 001–017 are immutable. Development and production schema head is v17; new persistent work must use append-only versions after it.

Important completed foundations:
- `RF-AUDIT01` — bounded governance/security audit without private research surveillance;
- `RF-OWNERSHIP01` — explicit account/library ownership-domain substrate and separate provenance;
- `RF-DOMAIN01` — stable Scholarly Record / Artifact / Artifact Version identity;
- `RF-LIBRARY01` — explicit Library ownership/membership/holdings foundation;
- `RF-LIBRARY02` — guarded contribution review and ownership promotion;
- `RF-SHAREDDEFAULT01` — deterministic canonical `资料库`, automatic active-account membership, Member pending intake, Owner direct admission, private Favorite preservation, and append-only v15→v16 corpus transition;
- `L2-CREDENTIALRESET01` — Owner-issued 30-minute one-time reset, digest-only capability persistence, deterministic reissue supersession, Member-chosen final password, atomic auth-revision/session revocation, and retired self-service HTTP/UI in append-only migration 017;
- `L1-UX03` — dedicated mobile experience, fullscreen mobile Preview, and zero-descriptive-copy cleanup; this is a completed baseline to preserve, not pending UX05 scope;
- `L1-UX04`, `L2-ACCOUNTARCHIVE01`, `L2-ADMINPOLISH01` — completed first-use polish;
- `PROD-05A` — prior production release `25cdab1…` at schema v15;
- `PROD-06A` — exact production release `855b63c…` at schema v17 with the completed First-Use Correction.

These foundations remain useful. The current correction changes the **default product authority and information architecture**, not the existence of those internal primitives.

## Owner-Approved Product Model

### Canonical corpus

There is one ordinary end-user `资料库`. Approved academic resources are shared corpus resources. There is no ordinary product concept of “my private Drive” alongside a separate “Shared Library”.

For Members:

```text
upload
  → 待审核
  → Owner review
      → approve → shared 资料库
      → reject  → not admitted
```

Owner-originated uploads may enter the shared corpus directly because the Owner already holds review authority.

Pending submissions are visible only as required for contributor/reviewer workflow. They are not a general-purpose private storage product.

### Private research layer

Shared-resource visibility does not expose another member's research activity. Personal Research Overlay remains private per account, including Favorites, reading state/progress, Personal Tags, Collections, Saved Views, notes, annotations, Citation Workspace, Evidence, Research Questions, and similar state.

### Governance

Ordinary Members may browse/download and submit contributions. Shared folder hierarchy, destructive shared-resource lifecycle, canonical metadata governance, and other corpus-wide structural mutations remain Owner/Manager-authorized unless a later explicit decision changes them.

### Internal entities

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit rows remain internal domain concepts. They must not be promoted into primary navigation merely because they exist in the backend.

The UI should surface resource metadata through normal `资料详情`; the standalone `学术记录` button is to be removed.

The governance audit remains technically required but moves under Owner administration as plain-language `操作记录`; it is not a top-level scholarly destination.

## Completed First-Use Correction Queue

Completed in this bounded order:

```text
RF-SHAREDDEFAULT01
        ↓
L2-CREDENTIALRESET01
        ↓
L1-UX05
        ↓
STOP for Owner review
```

### RF-SHAREDDEFAULT01 — Complete
Migration 016 establishes the deterministic canonical Library and a transactional, restart-safe transition for eligible active account-owned corpus records while preserving stable resource/file identities, object keys, checksums, uploader provenance, and account-private Favorites. Runtime upload completion now creates one pending Member contribution or directly admits an Owner upload through the guarded promotion transaction. Disabled/archived identities remain denied. No production access or migration occurred.

### L2-CREDENTIALRESET01 — Complete
Migration 017 adds immutable digest-only reset capability/audit state. Only the active Owner may issue a 30-minute link for an active or disabled Member; reissue supersedes the prior outstanding link. The Member chooses the final password on a dedicated anonymous same-origin surface. Redemption is single-winner and atomically consumes the link, advances `auth_revision`, revokes every session, and rejects stale old-password login publication. Disabled state remains disabled; archived accounts are ineligible. The authenticated self-service route and UI/navigation are removed. No email/SMS/OAuth infrastructure was introduced and production was not contacted.

### L1-UX05 — Complete
The normal `资料库` now renders the canonical RF-SHAREDDEFAULT01 holdings directly; the duplicate `共享资料库` destination and standalone `学术记录` shell action are removed. The compact account menu exposes one Owner-only `管理后台` containing `成员管理 / 投稿审核 / 公告 / 操作记录`, while Members receive no administration or shared-structure control. `上传资料` is the only strong page action and Owner folder organization is subordinate. Warm-neutral/deep-green identity, mobile navigation, Preview behavior, and zero-descriptive-copy foundations remain intact.

Single-folder recycle now uses the existing revision-bearing atomic bulk lifecycle. An `invalid_state` or `concurrent_change` response reloads the visible Library/Favorites state; retry then carries the refreshed opaque version. CAS and recycle provenance remain enforced, with no direct deletion or production cleanup.

## Parked Work

The remaining Pre-OCR program stays intact and parked at this STOP. `RF-LIBRARY01` and `RF-LIBRARY02` remain completed and must not be redone.

Next research task after Owner reopens the queue will be `RF-META01`, now explicitly gated on `RF-SHAREDDEFAULT01`. Metadata must surface through normal `资料详情`, not a standalone engineering-entity browser.

The remaining sequence after that is preserved as:

`RF-META01 → RF-PROV01 → RF-LINEAGE01 → RF-STATS01 → RF-OVERLAY01 → RF-ORGANIZE01 → RF-SEARCH01 → RF-VIEWS01 → RF-INTAKE01 → RF-ANNOTATE01 → RF-CITE01 → RF-EVIDENCE01 → RF-EXPORT01 → RF-LIBRARY03 → RF-LIBRARY04 → RF-INTEGRITY01 → RF-RECOVERY01 → RF-AUTHMATRIX01 → RF-DERIVED01 → STOP BEFORE OCR`.

## Safety Boundaries

The consumed `PROD-06A` window authorized only the reviewed production release procedure in its task card: exact-artifact verification, read-only preflight, protective backup/off-host evidence, isolated rehearsal, the exact append-only 016–017 live transition, and bounded non-destructive acceptance. It did **not** authorize and does not leave continuing authority for:
- any production change outside that exact release/database transition;
- direct database cleanup or permanent deletion of visible test/synthetic folders/files;
- `PROD-03C2`;
- reboot/autostart, DNS/TLS/Nginx/systemd/firewall/certificate changes;
- main merge;
- real credentials or paid infrastructure changes;
- OCR/text extraction, full-text indexing, embeddings, retrieval, or RAG.

The visible synthetic/test folders should become removable through the normal safe lifecycle after `L1-UX05` fixes the stale-state mutation path. Production cleanup, if desired, remains explicit and Owner-controlled.

## Verification Policy

Use proportionate verification tied to changed risk. Shared-default ownership/intake work requires focused migration/authorization/privacy/concurrency review. Credential reset requires focused authentication/capability/session-revocation review. UI repair requires focused frontend and stale-state lifecycle tests. Once relevant evidence is green, record/checkpoint instead of replaying historical production campaigns.

## Next Action

STOP for independent Owner/ChatGPT review. Do not resume `RF-META01`, select another task, contact/mutate production, merge main, run `PROD-03C2`, permanently delete data, change infrastructure/autostart, or begin OCR/RAG without new explicit Owner authorization.
