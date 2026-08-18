# AcademicCloud Roadmap

**Last reconciled:** 2026-08-18

The roadmap records durable product sequencing and approved boundaries. `TASK_BOARD.md` is the executable queue; task cards define bounded implementation contracts. A roadmap item never bypasses an Owner production/cost/destructive-data gate.

## Product Direction

AcademicCloud is a small invitation-only academic database and research workspace.

Its durable product model is now:

> **Owner-curated shared academic corpus + private per-user research activity.**

This clarifies ADR-014 after first-use review and is recorded in ADR-022.

The ordinary user experience is **not** a private Drive plus a separate Shared Library. There is one canonical `资料库` containing Owner-approved academic resources. A normal Member can contribute material, but contribution is an intake/review action:

```text
Member upload
  → 待审核
  → Owner review
      → approve → shared 资料库
      → reject  → not admitted
```

Owner-originated uploads may be admitted directly because the Owner already holds review authority.

Once admitted, the academic resource is shared to all active authorized members for browse/search/preview/download. The contributor remains recorded as provenance, not as exclusive private owner of the approved holding.

Around the same shared resource, each account has a mutually private Personal Research Overlay: Favorites, Recent, reading state/progress, Important/To Cite, Personal Tags, Collections, Saved Views, notes, annotations/highlights, Citation Workspace, Evidence, Research Questions, and equivalent personal research state.

The core invariant remains:

> **Shared resource does not imply shared research activity.**

## Cross-Layer Data Model

AcademicCloud retains the six conceptual planes from ADR-014:

1. **Physical Artifact** — stored bytes/file representation and lifecycle identity.
2. **Scholarly Resource / Scholarly Record** — the logical academic object and canonical shared facts.
3. **Personal Research Overlay** — private per-account research activity/state.
4. **Collaborative / Library Plane** — admitted shared corpus, contribution/review, catalog and shared governance state.
5. **Governance / Operations** — accounts, invitations, permissions, announcements, security audit, integrity/recovery evidence.
6. **Derived Intelligence** — OCR/text/index/embeddings/retrieval/RAG subject to source authorization.

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit rows are implementation/domain concepts. They should not become primary UI navigation labels merely because they exist internally.

## Immediate Owner Priority — First-Use Product Correction

PROD-05A is complete. Before resuming the remaining Pre-OCR research cards, the Owner has approved one bounded repository-only correction queue:

```text
RF-SHAREDDEFAULT01
        ↓
L2-CREDENTIALRESET01
        ↓
L1-UX05
        ↓
STOP for Owner review
```

### RF-SHAREDDEFAULT01 — Canonical Shared Library Default

Correct the current optional-sharing/private-Drive product framing without discarding the safe foundations already built.

Required outcome:
- one canonical/default Library authority behind the normal `资料库`;
- all active authorized members can see approved holdings without a manual sharing ceremony;
- non-Owner upload automatically enters contribution review and is not public before approval;
- Owner approval promotes/adopts the resource into shared Library ownership while preserving stable IDs, object bytes/keys, checksums, contributor/uploader provenance, Scholarly Record/Artifact/Version lineage, Favorites, and Personal Research Overlay state;
- Owner-originated upload may be admitted directly;
- ordinary Members do not receive shared folder/destructive/canonical-metadata governance authority merely because they can contribute;
- existing account-owned corpus transition is designed/tested append-only in repository development, while live migration remains a separate Owner-gated production deployment.

### L2-CREDENTIALRESET01 — Owner-Assisted Credential Reset

The previous self-service password-change feature is no longer a desired product surface.

Target model:
- no authenticated “修改密码” product path for ordinary users;
- no email/SMS/OAuth recovery infrastructure;
- if a known Member loses access, the Owner issues a short-lived one-time reset capability;
- only the capability digest/state is stored;
- the Member chooses the final password, so the Owner does not learn it;
- Argon2id limits and session/auth-revision safety remain unchanged;
- successful reset consumes the capability and invalidates old sessions without silently changing disabled/archived lifecycle state.

### L1-UX05 — Information Architecture and Visual Hierarchy Repair

The interface should feel like a quiet scholarly product, not an enterprise admin console.

Required information architecture:

```text
AcademicCloud
  资料库
  收藏
  待处理
  回收站

User menu
  管理后台   (Owner only)
  退出登录

管理后台
  成员管理
  投稿审核
  公告
  操作记录
```

UI requirements:
- remove the duplicate top-level `共享资料库` concept;
- remove standalone `学术记录`; scholarly identity stays internal and canonical metadata appears through `资料详情`;
- remove `管理账户`, `管理公告`, `治理审计`, `修改密码` from global navigation;
- keep `操作记录` as the existing bounded governance/security audit under Owner administration;
- one strong Library-page CTA: `上传资料`;
- demote `新建文件夹` and other secondary actions;
- keep the warm neutral/deep-green identity but reduce equal-weight bordered buttons, unnecessary boxes, and action competition;
- preserve responsive/mobile and accessibility behavior;
- fix the reproducible stale-state folder recycle/delete failure without weakening revision/CAS protection or bypassing normal lifecycle.

`L1-UX03` already completed the dedicated mobile/fullscreen Preview and zero-descriptive-copy UI work. `L1-UX05` preserves that accepted baseline and must not reopen it as new scope.

## Layer 0 — Project Setup

**Status:** Complete.

Repository structure, persistent project memory, ADR/task workflow, local environment baseline, and repository-driven autonomous engineering are established.

## Layer 1 — Core Drive / Resource Handling

**Status:** Foundation complete; current UI/data-flow semantics are being corrected by `RF-SHAREDDEFAULT01` + `L1-UX05`.

Completed foundations include architecture, SQLite/auth/storage abstraction, file/folder lifecycle, responsive frontend, security/reliability, Favorites, bulk operations, recursive recycle/restore, transfer-performance evidence, duplicate-name UX, `L1-UX03` dedicated mobile/fullscreen Preview plus zero-descriptive-copy cleanup, and sticky desktop navigation.

The old first-layer “private cloud drive” behavior is historical implementation substrate, not the final product concept for academic holdings after ADR-022.

## Layer 2 — Accounts & Governance

**Status:** Foundation complete; credential recovery is being simplified for the actual small known-member operating model.

Completed:
- Owner/Member accounts and invitation-only registration;
- Member enable/disable/archive lifecycle and session revocation;
- announcements and administration polish;
- bounded governance/security audit;
- historical authenticated self-password-change implementation.

Current correction:
- `L2-CREDENTIALRESET01` supersedes self-service password change as the desired product path.

Later separate backlog:
- one-time external sharing capability (`L2-SHARE01`) if explicitly reopened.

Explicitly not implied:
- public signup;
- SMTP/SMS/OAuth identity infrastructure;
- hard account deletion/username reuse;
- unrestricted global role editing.

## Layer 3 — Personal Scholarly Workspace & Scholarly Model

**Status:** Approved Pre-OCR program; remaining cards parked until the current first-use correction reaches STOP.

### Personal Research Overlay

Private per-account capabilities include:
- reading state/progress;
- Important / To Cite;
- Recent;
- Personal Tags;
- Collections;
- Saved Research Views;
- private acquisition/research notes;
- annotations/highlights/page notes;
- Citation Workspace;
- Evidence Bundles;
- Research Questions and private links.

Owner/Admin authority does not implicitly expose another user's Personal Research Overlay.

### Scholarly identity, metadata, provenance, lineage

Stable Scholarly Record / Artifact / Artifact Version identities are already implemented by `RF-DOMAIN01`.

Remaining approved work includes:
- bounded canonical metadata/templates and minimal authorities (`RF-META01`);
- provenance/fingerprint/leak-safe duplicate handling (`RF-PROV01`);
- artifact/version/derived lineage (`RF-LINEAGE01`);
- storage statistics (`RF-STATS01`).

`RF-META01` now depends on `RF-SHAREDDEFAULT01` and must surface canonical information through normal `资料详情`, not a standalone “Scholarly Record” browser.

### Research intake

Later `RF-INTAKE01` should build on ADR-022: acquisition/contribution intake is a staging/review workflow, not justification for reintroducing a permanent private Drive product. Duplicate checking, metadata capture/suggestion boundaries, and future browser-save APIs remain separate scoped work.

## Layer 4 — Shared Academic Library

**Status:** Core primitives complete; default product semantics are being corrected.

Completed:
- `RF-LIBRARY01` — Library ownership domain, membership/manager authority, holdings read/preview/download;
- `RF-LIBRARY02` — guarded submitted/approved/rejected/withdrawn contribution review and ownership promotion.

ADR-022 supersedes the earlier **optional Shared Library** framing. These primitives now support the **canonical shared corpus**.

Later approved cards remain:
- `RF-LIBRARY03` — shared catalog, Library Tags, canonical/original naming;
- `RF-LIBRARY04` — shared provenance confidence and duplicate/version grouping.

## Layer 5 — Research Infrastructure & Pre-OCR Hardening

**Status:** Approved and parked.

Remaining foundations include:
- integrity monitor;
- no-clobber metadata snapshot/recovery;
- complete cross-plane authorization/non-disclosure matrix;
- structured scholarly export;
- stable page/derived-artifact authorization contracts;
- production-disabled OCR/text/index adapter contracts only.

Pre-OCR completion means these models and boundaries are coherent and independently checkpointed. It does not authorize OCR execution.

## Layer 6 — Intelligence

**Status:** Future; not authorized.

Future sequence remains:
- OCR/text extraction;
- full-text indexing/search;
- embeddings/retrieval;
- RAG;
- source/page-grounded research assistance.

Derived authority must never exceed the requesting account's effective authority over shared resources and any private overlay used in the request.

## Remaining Pre-OCR Execution Order

After the current three-card first-use correction reaches STOP and the Owner reopens research development:

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

`RF-LIBRARY01` and `RF-LIBRARY02` were completed early and are not repeated.

## Cross-Cutting Operations

OPS01A and the production runbook remain the operational baseline. Production release selection is explicit; repository HEAD is never automatically a production candidate.

Verification is proportionate, not performative. Run checks that materially cover changed risk; once relevant evidence is green and focused review finds no material issue, record/checkpoint instead of replaying broad historical campaigns.

## Production Track

Production currently runs exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15 from completed `PROD-05A`.

Current rollback pair:
- previous release `34a2eada158dcf08783dc9538d853f9361425e8a`;
- schema-v8 backup `academiccloud-pre-prod05a-20260818T041406Z.sqlite`, SHA-256 `873374176280848ae9cd6747a01dcdf19f0423ce32c8fea7f30c042ba1199b17`.

The current repository correction does not authorize production access or data migration. Any eventual transition of existing account-owned holdings into the canonical shared Library is separately Owner-gated after repository implementation/review is green.

`PROD-03C2` permanent-delete confirmation remains separately parked.

## Non-Blocking Future Backlog

Preserved but non-blocking:
- Private Vault / client-side encryption;
- External Deposit Link;
- polished browser extension after intake APIs stabilize;
- mature Authority/RDF/semantic-web work;
- full Time Machine/Rewind;
- native desktop/mobile apps unless future real use justifies them.

## Current Approved Repository Objective

Only:

```text
RF-SHAREDDEFAULT01
→ L2-CREDENTIALRESET01
→ L1-UX05
→ STOP
```

No production deployment, main merge, permanent deletion, real-data cleanup, OCR/text extraction, indexing, embeddings, retrieval, RAG, or unrelated Pre-OCR consumption is authorized by this roadmap update.
