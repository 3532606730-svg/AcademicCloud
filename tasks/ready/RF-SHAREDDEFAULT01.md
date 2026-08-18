# RF-SHAREDDEFAULT01 — Canonical Shared Library Default

## Task ID
RF-SHAREDDEFAULT01 — Canonical Shared Library Default

## Goal
Correct the current optional-sharing product model so AcademicCloud behaves as one Owner-curated shared academic corpus: approved resources are shared to all active authorized accounts, Member uploads enter review automatically, and Personal Research Overlay state remains private.

## Scope
Use ADR-022 as the product contract. Reuse the existing ownership-domain, Library, Scholarly Record/Artifact/Version, and contribution-review foundations rather than rebuilding them.

Implement the smallest coherent vertical slice that:
- establishes one canonical/default Library authority for the product;
- makes ordinary Library browsing the normal `资料库` data source for active accounts;
- ensures active Members receive effective read/preview/download access to approved holdings without per-user manual sharing ceremonies;
- makes non-Owner uploads enter the default Library contribution review flow automatically rather than becoming a long-lived private Drive corpus;
- allows Owner-originated uploads to be admitted directly because the Owner already holds review authority;
- keeps pending submissions non-public and visible only to the contributor plus authorized reviewer(s);
- keeps shared folder/corpus structure and destructive shared-resource actions Owner/Manager-governed;
- preserves uploader/contributor provenance separately from shared ownership;
- defines an append-only transition path for existing account-owned corpus resources into the canonical Library while preserving stable IDs, object keys/bytes, checksums, lineage, Favorites, and Personal Research Overlay state;
- does not silently delete or specially reinterpret known test/synthetic residue.

## Product Invariants
- Academic resources are shared **after Owner admission**.
- Personal research activity remains private per account.
- There is no ordinary end-user concept of “my private Drive” versus “Shared Library”.
- Pending review is an intake state, not a permanent private storage product.
- Owner/Admin has no implicit read access to another user's private research overlay.
- Contribution approval must not copy OSS bytes when ownership promotion can preserve the existing object identity.
- Existing stable scholarly/file identities must survive the correction.

## Acceptance Criteria
- A fresh active Member sees the same approved default Library holdings as other active Members without manual Library selection/membership administration in the ordinary product flow.
- A Member upload is not published immediately; it creates a pending review candidate and does not appear in other Members' Library holdings until approval.
- Owner review approve/reject preserves the existing guarded one-winner contribution state semantics; approval produces an immediately shared holding.
- Owner upload can enter the canonical Library without redundant self-review while preserving normal audit/provenance rules.
- Disabled/archived accounts cannot access Library holdings or review surfaces.
- Favorites and every implemented/preserved Personal Research Overlay relation remain account-private and survive any ownership transition.
- Existing account-owned resource transition is append-only, transactional, restart-safe, preserves IDs/bytes/object keys/checksums/provenance/lineage, and has explicit no-op/redeploy behavior.
- Cross-account tests prove shared-resource visibility while also proving private-overlay non-disclosure.
- No production access, migration, OSS mutation, permanent delete, OCR, indexing, embeddings, retrieval, or RAG occurs.

## Relevant ADRs
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-016-explicit-resource-ownership-domains.md`
- `docs/decisions/ADR-020-*`
- `docs/decisions/ADR-021-*`

## Current State
PROD-05A is green at schema v15. The existing implementation supports explicit Libraries and contribution promotion, but ordinary files remain account-owned and the UI/product model still presents private `资料库` plus separate `共享资料库`. Live production Library tables are empty.

## Non-goals
- No production rollout or live-data migration.
- No multi-Library redesign.
- No public registration/external sharing expansion.
- No metadata/catalog/OCR expansion beyond what is necessary to correct the ownership/intake boundary.
- No permanent deletion of existing or synthetic production data.

## Verification
Use focused migration/ownership/contribution/privacy tests, one frontend integration pass for the changed data flow, typecheck/build, and one focused independent review. Do not replay PROD-05A or unrelated historical production acceptance.

## Next Action
Implement this card before resuming RF-META01 or any later Pre-OCR card.
