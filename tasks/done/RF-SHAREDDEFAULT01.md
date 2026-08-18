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

Product invariants:
- Academic resources are shared **after Owner admission**.
- Personal research activity remains private per account.
- There is no ordinary end-user concept of “my private Drive” versus “Shared Library”.
- Pending review is an intake state, not a permanent private storage product.
- Owner/Admin has no implicit read access to another user's private research overlay.
- Contribution approval must not copy OSS bytes when ownership promotion can preserve the existing object identity.
- Existing stable scholarly/file identities must survive the correction.

## Non-goals
- No production rollout or live-data migration.
- No multi-Library redesign.
- No public registration/external sharing expansion.
- No metadata/catalog/OCR expansion beyond what is necessary to correct the ownership/intake boundary.
- No permanent deletion of existing or synthetic production data.

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

## Relevant Modules / Files
- `database/migrations/` append-only schema and transition contract
- Library/research/ownership/account/audit repositories, services, and HTTP routes
- Drive upload/finalization path and frontend Library integration
- focused migration, authorization, contribution, privacy, and UI tests

## Current State
Complete and independently green on `codex/project-memory-reconcile-20260817`. Development schema head is v16; production remains closed and unchanged at release `25cdab1…`, schema v15/history 001–015.

## Completed
- Recovered authoritative branch, queue, ADRs, task cards, and exact remote synchronization.
- Confirmed RF-LIBRARY01/02 are completed substrate and will not be redone.
- Added append-only migration 016 with one deterministic canonical Library, automatic active-account membership, immutable transition/backfill evidence, and exact no-op redeploy behavior.
- Transitioned only eligible complete active account-owned Record graphs; pending/deleted/purging/purged residue remains untouched. Stable file/Record/Artifact/Version IDs, object keys, checksums, uploader identity, and account-private Favorites are preserved.
- Composed upload activation and canonical intake in one database transaction. Member upload creates one pending review candidate; Owner upload promotes directly with no manual self-review; intake failure rolls activation and generated identities back.
- Retired public creation/listing of optional Libraries from the ordinary API while retaining historical service substrate and existing-data safety.
- Extended Favorite authorization for accessible canonical holdings without making any account's Favorite relation visible to another account.
- Reconciled schema-head expectations, API documentation, roadmap, status, board, and this task record.
- Focused review repaired three concrete findings: exhaustive audit labels, canonical-Owner fail-closed disable behavior, and the remaining public optional-Library creation path. No material finding remains.

## Remaining
None within this Epic.

## Blockers
None. Production rollout of migration 016 remains a separate Owner gate.

## Last Verification
2026-08-18: backend suite PASS 255/255 after schema/security compatibility repair; final changed-path migration/contribution/HTTP rollback checks PASS 14/14 after retiring public optional-Library creation; frontend API/App integration PASS 108/108; workspace typecheck PASS; backend/frontend production build PASS; migration 016 isolated v15→v16 rehearsal reports `integrity_check=ok`, zero foreign-key violations, exact stable identity/object/provenance/Favorite preservation, non-active residue retention, and no-op second run; `git diff --check` PASS (line-ending notices only). Focused authorization/data-transition review has no remaining finding. No production, OSS network, main merge, OCR/RAG, or destructive real-data action occurred.

## Next Action
Commit and push this Epic as one clean checkpoint, verify local/remote equality, then select `L2-CREDENTIALRESET01` as the next and only authorized task.
