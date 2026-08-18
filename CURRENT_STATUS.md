# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**`PROD-06A` is the sole active task: one Owner-authorized bounded production release of the completed First-Use Correction. Production currently runs exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15; the exact independently verified candidate is `855b63c49f12f3375972774e7bc7385088b0495e` at repository schema head v17.**

`RF-SHAREDDEFAULT01` is complete and synchronized at `51c3d7b82d05574e53849c6ef1b5eec0e9ceabc5`. `L2-CREDENTIALRESET01` is complete and synchronized at `836d78636ef7aab41b03e00321167efed0a94d9d`. `L1-UX05` is complete, independently green, and synchronized at `f7b9ef0475964f60f28a56450c6ef5e22a0df4c5`. These exact consecutive checkpoints satisfy the PROD-06A repository precondition. No production connection or mutation has occurred in PROD-06A yet.

The requested code-bearing checkpoint `f7b9ef0…` exposed two stale verification-only boundaries in exact Linux workflow runs `32110757279` and `32111110773`; neither run packaged an artifact. Candidate `855b63c…` differs from `f7b9ef0…` only in `frontend/src/App.test.tsx` readiness synchronization and `backend/scripts/compiled-acceptance.mjs` schema-17/Owner-assisted-reset acceptance. Successful run `32111496535` built and independently re-downloaded/verified the exact Linux x64 / Node 24 artifact; artifact ID `9315081408`, GitHub artifact SHA-256 `4ba3592680daea05a27e43a08f57f135c70deb75917f1574a3db67a6c84ae413`, and release archive SHA-256 `360397616cc3767181737650c45608df6232cf77d71b3c6fcc48a67c940ee375` are bound to the candidate.

First-use review established that the existing “account-private Drive + optional Shared Library” presentation is not the intended AcademicCloud product. ADR-022 now defines the durable correction:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

For a normal Member, upload means pending contribution/review, not creation of a permanent private corpus. Approval admits the resource into the single canonical `资料库`, where all active authorized members may browse/preview/download it. Favorites, Recent, reading state/progress, Personal Tags, Collections, notes, annotations, citations, evidence, Research Questions, and equivalent research activity remain private per account.

## Production Truth

Production release:
- exact commit: `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema/history: v15 / migrations 001–015;
- GitHub Actions run: `32098001755`;
- integrity: `ok`;
- foreign-key violations: zero;
- production migration 009–015 applied exactly once;
- health/readiness: green;
- service active, autostart still disabled, API loopback-only;
- no production Library/membership/contribution rows were created by PROD-05A acceptance.

Preexisting production aggregates after migration remained accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1.

Rollback is the inseparable pair:
- previous release `34a2eada158dcf08783dc9538d853f9361425e8a`;
- schema-v8 backup `academiccloud-pre-prod05a-20260818T041406Z.sqlite`, SHA-256 `873374176280848ae9cd6747a01dcdf19f0423ce32c8fea7f30c042ba1199b17`.

Off-host encrypted rollback evidence is recorded at private backup repository commit `b0238baa8bb5e5f44c5ceaf1d37ca3a80e0f9420`.

Do not rerun PROD-05A. PROD-06A authorizes only the exact bounded v15→v17 correction release recorded in `tasks/doing/PROD-06A.md`; it does not reopen any other production or development work.

## Repository Baseline

Authoritative development branch:
- `codex/project-memory-reconcile-20260817`.

Historical migrations 001–017 are immutable. Development schema head is v17; new persistent work must use append-only versions after it. Production remains at v15/history 001–015 until every PROD-06A artifact, preflight, backup/off-host, and rehearsal gate is green.

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
- `PROD-05A` — exact production release `25cdab1…` at schema v15.

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

## Approved First-Use Correction Queue

Execute in this bounded order:

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

The remaining Pre-OCR program stays intact but is paused until this first-use correction reaches STOP. `RF-LIBRARY01` and `RF-LIBRARY02` remain completed and must not be redone.

Next research task after Owner reopens the queue will be `RF-META01`, now explicitly gated on `RF-SHAREDDEFAULT01`. Metadata must surface through normal `资料详情`, not a standalone engineering-entity browser.

The remaining sequence after that is preserved as:

`RF-META01 → RF-PROV01 → RF-LINEAGE01 → RF-STATS01 → RF-OVERLAY01 → RF-ORGANIZE01 → RF-SEARCH01 → RF-VIEWS01 → RF-INTAKE01 → RF-ANNOTATE01 → RF-CITE01 → RF-EVIDENCE01 → RF-EXPORT01 → RF-LIBRARY03 → RF-LIBRARY04 → RF-INTEGRITY01 → RF-RECOVERY01 → RF-AUTHMATRIX01 → RF-DERIVED01 → STOP BEFORE OCR`.

## Safety Boundaries

`PROD-06A` authorizes only the reviewed production release procedure in its task card: exact-artifact verification, read-only preflight, protective backup/off-host evidence, isolated rehearsal, the exact append-only 016–017 live transition, and bounded non-destructive acceptance. It does **not** authorize:
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

Execute `PROD-06A` gate by gate. Fail closed before unsafe mutation on any material mismatch; otherwise reconcile the exact production release/schema/evidence, push the final checkpoint, and STOP for independent Owner/ChatGPT review. Do not resume `RF-META01` or select another task.
