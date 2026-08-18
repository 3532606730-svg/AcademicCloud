# AcademicCloud Task Board

**Last reconciled:** 2026-08-18

## Current Phase

**`PROD-06A` is the sole active task: one bounded production release of the completed First-Use Correction. Production currently runs exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15; the exact independently verified candidate is `855b63c49f12f3375972774e7bc7385088b0495e` at schema head v17.**

First-use review corrected a material product-model misunderstanding: AcademicCloud is not “private Drive + optional Shared Library”. It is one Owner-curated shared academic corpus. Approved academic resources are shared to all active authorized members; Member uploads enter Owner review before admission; each member's research activity around those resources remains private.

ADR-022 is the governing product correction.

## Approved Continuous Objective — First-Use Correction Production Release

Execute only `PROD-06A → STOP for independent Owner/ChatGPT review`. The release must use the smallest exact verified candidate containing already-complete `RF-SHAREDDEFAULT01`, `L2-CREDENTIALRESET01`, and `L1-UX05`, apply only migrations 016–017 after a verified schema-v15 rollback generation and isolated rehearsal, and preserve the task card's data/privacy/rollback boundaries.

`L2-CREDENTIALRESET01` is technically independent after recovery, but the final shell must not retain the self-service password-change surface. `L1-UX05` should consume the shared-corpus semantics from `RF-SHAREDDEFAULT01` rather than implementing another UI-only sharing fiction.

Verification must remain proportionate: focused changed-risk tests, one typecheck/build pass as applicable, and focused independent review where authorization/authentication/data migration boundaries justify it. Do not replay PROD-05A or broad historical production acceptance.

## Doing

`PROD-06A` — [task card](tasks/doing/PROD-06A.md); bounded exact First-Use Correction release from production schema v15 to v17.

## Ready — Owner-Approved First-Use Correction

| Order | Task | Task card | Bounded result |
|---:|---|---|---|
| 1 | STOP | — | Independent Owner/ChatGPT review after PROD-06A final reconciliation |

## Product Model — Authoritative Short Form

```text
Member upload
  → 待审核
  → Owner approve
      → shared 资料库
      → all active authorized members can browse / preview / download

Shared resource
  + User A private Favorites / reading / tags / notes / annotations / citations
  + User B private Favorites / reading / tags / notes / annotations / citations
```

Owner upload may be admitted directly because the Owner already holds review authority. Ordinary Members do not gain shared folder/canonical-metadata/destructive corpus authority merely because they can contribute.

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit event tables remain internal implementation/domain concepts. They must not become primary UI navigation labels.

## Parked Pre-OCR Queue

The original independently reviewed Pre-OCR program remains valid. Early completion of `RF-LIBRARY01` and `RF-LIBRARY02` still counts as done; do not redo them. Resume only after the new first-use correction reaches STOP and the Owner reopens the queue.

Remaining sequence:

```text
RF-META01
→ RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
→ RF-SEARCH01
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

`RF-META01` is explicitly gated on `RF-SHAREDDEFAULT01` so canonical metadata is built on the corrected shared-resource authority and appears through normal `资料详情`, not a standalone `学术记录` browser.

## Production State and Gate

Production is currently exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15. `PROD-05A` is closed and must not be rerun. PROD-06A is a new bounded gate for exact candidate `855b63c49f12f3375972774e7bc7385088b0495e` and append-only migrations 016–017 only. The candidate differs from requested code checkpoint `f7b9ef0…` only by two exact-workflow verification repairs; successful artifact run `32111496535` is green.

Current rollback pair:
- release `34a2eada158dcf08783dc9538d853f9361425e8a`;
- schema-v8 backup `academiccloud-pre-prod05a-20260818T041406Z.sqlite`, SHA-256 `873374176280848ae9cd6747a01dcdf19f0423ce32c8fea7f30c042ba1199b17`.

PROD-06A does **not** authorize:
- production mutation outside the exact reviewed correction transition and its protective rollback procedure;
- cleanup/permanent deletion of the visible test folders/files;
- `PROD-03C2`;
- reboot/autostart/infrastructure policy changes;
- main merge;
- OCR/text extraction, full-text indexing, embeddings, retrieval, or RAG.

The Owner has authorized that production transition only inside PROD-06A and only through the reviewed migration 016 contract after all artifact, preflight, backup/off-host, and isolated-rehearsal gates pass.

## Completed Milestones Relevant to This Queue

- `RF-AUDIT01` — bounded governance/security audit without research surveillance.
- `RF-OWNERSHIP01` — explicit `account | library` ownership domains and separate uploader/contributor provenance.
- `RF-DOMAIN01` — stable Scholarly Record / Artifact / Artifact Version identities.
- `RF-LIBRARY01` — Library ownership/membership/holdings foundation.
- `RF-LIBRARY02` — guarded contribution review and ownership promotion.
- `RF-SHAREDDEFAULT01` — canonical default `资料库`, automatic active-account access, Member pending upload intake, Owner direct admission, private Favorite preservation, and transactional v15→v16 corpus transition; repository verification green, production untouched.
- `L2-CREDENTIALRESET01` — Owner-issued 30-minute digest-only reset capability, deterministic reissue supersession, Member-chosen final password, atomic capability consumption/auth-revision/session revocation, retired self-service HTTP/UI, and append-only migration 017; production untouched.
- `L1-UX05` — one canonical `资料库` surface, compact account menu, unified Owner `管理后台`, hidden internal engineering destinations, one dominant upload action, Member-safe shared-structure controls, and stale-folder conflict refresh/retry through revision-bearing atomic recycle; production untouched.
- `L1-UX04`, `L2-ACCOUNTARCHIVE01`, `L2-ADMINPOLISH01` — first-use polish already complete.
- `PROD-05A` — exact release `25cdab1…`, schema v15, production verification green.

## Separate Parked Production Work

`PROD-03C2` permanent-delete confirmation remains a separate Owner gate. The visible synthetic/test residue should be removable through the normal safe recycle/delete lifecycle once the stale-state bug is repaired; do not bypass product lifecycle with direct database edits.
