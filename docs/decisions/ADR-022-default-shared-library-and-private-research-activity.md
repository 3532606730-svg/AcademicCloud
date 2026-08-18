# ADR-022 — Default Shared Library and Private Research Activity

**Date:** 2026-08-18  
**Status:** Accepted by Owner

## Context

First-use review after PROD-05A exposed a product-model mismatch. AcademicCloud was implemented as account-private Drive storage plus an optional Shared Library to which a Member explicitly submits an already-private resource. That architecture is safe, but it is not the intended product.

AcademicCloud is a small, invitation-only academic database. The academic corpus itself is shared. Individual research activity around that corpus is private. Members may contribute new material, but a non-Owner contribution must not become part of the shared corpus until the Owner reviews and approves it.

The existing `Scholarly Record`, `Artifact`, `Artifact Version`, ownership-domain, Library, and contribution-review foundations remain useful implementation primitives. The correction is to the default product authority and information architecture, not to erase those foundations.

## Decision

AcademicCloud adopts the following durable product rule:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

### 1. One canonical shared academic corpus

The ordinary end-user concept is one **资料库 / Library**, not a private Drive plus a separate Shared Library.

Approved holdings are visible to every active authorized account and may be browsed, searched, previewed, and downloaded according to normal Library authorization. A contributor is provenance, not continuing private ownership of an approved holding.

The implementation may continue to use an explicit Library ownership domain. The UI must not require users to understand ownership domains or multiple product-level library concepts merely because those primitives exist internally.

### 2. Contribution intake is a review boundary, not a private library

For a normal Member:

```text
upload
  → pending contribution / 待审核
  → Owner review
      → approve: admitted into the shared Library
      → reject: not admitted into the shared Library
```

Pending material is visible only to the contributor and authorized reviewer(s) as required to complete review. It is not a general-purpose long-lived private Drive.

The Owner is the admission authority. Owner-originated uploads may be admitted directly because the same actor already holds review authority; the implementation must not create a pointless self-approval ceremony.

### 3. Personal research activity remains private

The following remain account-private Personal Research Overlay data even when the underlying resource is shared:

- Favorites;
- Recent/opening state;
- reading state and progress;
- `important` / `to_cite` flags;
- Personal Tags;
- Collections and Saved Views;
- private notes;
- annotations/highlights;
- Citation Workspace and Evidence organization;
- Research Questions and equivalent personal research state.

Owner/Admin authority does not implicitly expose another account's Personal Research Overlay.

This preserves ADR-014's core invariant: **shared resource does not imply shared research activity.**

### 4. Shared-corpus governance

The shared corpus is not collaboratively mutable without control. Ordinary Members may browse/download and submit contributions. Shared folder hierarchy, canonical metadata, destructive lifecycle actions, publication/admission, and other corpus-wide structural changes require explicit Library governance authority; the initial product may keep these Owner/Manager-only.

### 5. Internal scholarly entities stay internal

`Scholarly Record`, `Artifact`, and `Artifact Version` remain authoritative domain concepts. They are not primary navigation labels.

The normal user sees a **资料 / resource** and, where useful, a **资料详情 / details** surface. The UI should not expose a standalone “学术记录 / Scholarly Record” button merely because the backend has that entity.

### 6. Governance audit stays operational, not navigational

The audit subsystem from ADR-015 remains required for bounded security/governance evidence. It is not a primary scholarly feature. The UI should present it only inside the Owner administration surface under a plain-language label such as **操作记录**, never as a prominent top-level “治理审计” destination.

### 7. Password recovery matches the invitation-only operating model

Routine self-service password change is not a required product surface. There is no need to add email/SMS recovery infrastructure for this small known-member deployment.

If a Member loses access, the Owner may authorize a bounded one-time credential reset. The Owner should authorize the reset without learning the Member's final new password. The reset must preserve bounded Argon2id handling and revoke/advance existing authentication state appropriately.

## Existing production data

PROD-05A is not rolled back. Existing schema v15 and Library/contribution foundations remain valid.

A later repository checkpoint must define and test an append-only transition for existing account-owned corpus data into the canonical shared Library while preserving stable IDs, object keys/bytes, checksums, uploader/contributor provenance, Scholarly Record/Artifact/Version lineage, Favorites, and Personal Research Overlay state. Production execution of that transition remains a separate Owner-gated deployment.

Known synthetic/test residue must not be silently reclassified or permanently deleted by planning code. Normal delete/recycle behavior must work first; any production cleanup remains explicit and bounded.

## Information-architecture consequence

The intended shell is approximately:

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

The global top bar should remain quiet and product-focused rather than exposing internal entities or every administration action.

## Relationship to earlier decisions

- ADR-014 remains authoritative for privacy/data planes and is clarified, not weakened.
- ADR-016 ownership domains remain authoritative implementation substrate.
- ADR-020/ADR-021 Library and contribution primitives remain reusable, but their earlier optional-shared-library product framing is superseded by this ADR for the canonical default corpus.
- L2-PASSWORD01 remains historical implementation evidence; its self-service product surface is superseded by the Owner-approved credential-reset direction above.

## Non-goals

This decision does not authorize production deployment, production data mutation, permanent deletion, OCR/text extraction, indexing, embeddings, retrieval, RAG, public registration, SMTP, SMS, OAuth, or a multi-Library product redesign.
