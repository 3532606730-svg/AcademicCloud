# AcademicCloud Task Board

**Last reconciled:** 2026-08-18

## Current Phase

**`PROD-05A` is complete and green. Production runs exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15. A new Owner-approved repository-only first-use correction queue is now open; production remains closed.**

First-use review corrected a material product-model misunderstanding: AcademicCloud is not “private Drive + optional Shared Library”. It is one Owner-curated shared academic corpus. Approved academic resources are shared to all active authorized members; Member uploads enter Owner review before admission; each member's research activity around those resources remains private.

ADR-022 is the governing product correction.

## Approved Continuous Objective — Shared Corpus + First-Use UX Repair

Execute only the following queue:

1. `RF-SHAREDDEFAULT01` — **complete and green**; canonical shared Library, automatic Member intake, Owner direct admission, preserved private overlays/stable identities, and append-only migration 016.
2. `L2-CREDENTIALRESET01` — **complete and green**; authenticated self-service route/UI removed, Owner-issued digest-only one-time reset added, and atomic auth-revision/session invalidation preserved in migration 017.
3. `L1-UX05` — correct information architecture and visual hierarchy; hide engineering entities/admin actions from the global shell; move audit to `操作记录`; fix stale-state folder recycle/delete UX without weakening CAS.
4. STOP for Owner first-use review.

`L2-CREDENTIALRESET01` is technically independent after recovery, but the final shell must not retain the self-service password-change surface. `L1-UX05` should consume the shared-corpus semantics from `RF-SHAREDDEFAULT01` rather than implementing another UI-only sharing fiction.

Verification must remain proportionate: focused changed-risk tests, one typecheck/build pass as applicable, and focused independent review where authorization/authentication/data migration boundaries justify it. Do not replay PROD-05A or broad historical production acceptance.

## Doing

None. `L2-CREDENTIALRESET01` is independently green and awaiting its clean checkpoint publication. Select `L1-UX05` only after local/remote equality is verified.

## Ready — Owner-Approved First-Use Correction

| Order | Task | Task card | Bounded result |
|---:|---|---|---|
| 1 | `L1-UX05` | `tasks/ready/L1-UX05.md` | premium/quiet information architecture + admin consolidation + stale-state delete repair |
| 2 | STOP | — | Owner inspects real first-use behavior before resuming the research queue |

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

Production is exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15. `PROD-05A` is closed and must not be rerun merely because repository development resumes.

Current rollback pair:
- release `34a2eada158dcf08783dc9538d853f9361425e8a`;
- schema-v8 backup `academiccloud-pre-prod05a-20260818T041406Z.sqlite`, SHA-256 `873374176280848ae9cd6747a01dcdf19f0423ce32c8fea7f30c042ba1199b17`.

The new correction queue does **not** authorize:
- production SSH, migration, deployment, live-data backfill, or OSS mutation;
- cleanup/permanent deletion of the visible test folders/files;
- `PROD-03C2`;
- reboot/autostart/infrastructure policy changes;
- main merge;
- OCR/text extraction, full-text indexing, embeddings, retrieval, or RAG.

Any future production transition from account-owned corpus data to the canonical shared Library requires a separate Owner-gated deployment after repository implementation/review is green.

## Completed Milestones Relevant to This Queue

- `RF-AUDIT01` — bounded governance/security audit without research surveillance.
- `RF-OWNERSHIP01` — explicit `account | library` ownership domains and separate uploader/contributor provenance.
- `RF-DOMAIN01` — stable Scholarly Record / Artifact / Artifact Version identities.
- `RF-LIBRARY01` — Library ownership/membership/holdings foundation.
- `RF-LIBRARY02` — guarded contribution review and ownership promotion.
- `RF-SHAREDDEFAULT01` — canonical default `资料库`, automatic active-account access, Member pending upload intake, Owner direct admission, private Favorite preservation, and transactional v15→v16 corpus transition; repository verification green, production untouched.
- `L2-CREDENTIALRESET01` — Owner-issued 30-minute digest-only reset capability, deterministic reissue supersession, Member-chosen final password, atomic capability consumption/auth-revision/session revocation, retired self-service HTTP/UI, and append-only migration 017; production untouched.
- `L1-UX04`, `L2-ACCOUNTARCHIVE01`, `L2-ADMINPOLISH01` — first-use polish already complete.
- `PROD-05A` — exact release `25cdab1…`, schema v15, production verification green.

## Separate Parked Production Work

`PROD-03C2` permanent-delete confirmation remains a separate Owner gate. The visible synthetic/test residue should be removable through the normal safe recycle/delete lifecycle once the stale-state bug is repaired; do not bypass product lifecycle with direct database edits.
