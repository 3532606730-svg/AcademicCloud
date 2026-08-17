# RF-LIBRARY03 — Shared Catalog, Library Tags, and Naming Governance

## Task ID
RF-LIBRARY03 — Shared Catalog, Library Tags, and Naming Governance

## Goal
Provide an authorized shared Library catalog with Library Tags and explicit canonical/original naming, distinct from personal organization and physical storage names.

## Scope
Add Library-scoped catalog records/views over Library-owned Scholarly Records, manager/contributor-governed canonical metadata, Library Tags, canonical display name, preserved original filename, revision/time/actor provenance, strict API, and responsive catalog UI. Extend the single `RF-SEARCH01` authority resolver/search surface and the versioned `RF-EXPORT01` contract for Library membership rather than creating parallel search/export implementations. Add append-only migration(s).

## Non-goals
- No Personal Tag/Collection sharing, provenance confidence, duplicate/version grouping, contribution transfer, public catalog, OCR/full text, external authority service, or automatic canonical merge.

## Acceptance Criteria
- Library Tags/canonical naming are Collaborative Overlay data; Personal Tags/private notes remain mutually invisible and never seed catalog values implicitly.
- Original filename is retained as provenance; canonical display name changes do not rename object keys or destroy source naming.
- Catalog reads/edits use effective Library authority; nonmembers/inaccessible records are non-disclosing and global role alone cannot bypass recorded policy.
- Search uses the existing access-scoped contract, applies membership before counts/ranking/facets, and does not leak inaccessible Library existence.
- Structured export extends the existing versioned schema/effective-authority hook for Library canonical/catalog data. It includes no other member's Personal Overlay; the requester may include only their own separately authorized overlay references.
- Metadata/tag/name mutations use revision/CAS, transactions, deterministic normalization, idempotent relations, and credential/content-safe audit events.
- Concurrent edits/membership changes have explicit conflict behavior; rollback cannot partially change tags/name/catalog metadata.
- UI/API tests cover Library roles, nonmember, disabled account, Personal Overlay isolation, search leaks, unsafe rendering, mobile/accessibility, migration, backup/restore, compiled acceptance.
- Independent review focuses on private-to-collaborative data bleed, naming/object-key confusion, search bypass, authority escalation, and overwrite races.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-META01`, `RF-SEARCH01`, `RF-LIBRARY01`, `RF-LIBRARY02`

## Relevant Modules / Files
- `database/migrations/`
- Library/catalog/research/search/audit modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- catalog/privacy/search/migration/compiled acceptance tests

## Current State
Blocked on `RF-LIBRARY02`. Library catalog/tags/naming do not exist.

## Completed
- Planning separates Library Tags from Personal Tags and canonical name from original/object key.
- Search extension must reuse the single effective-authority service.

## Remaining
- define catalog/tag/name permissions and normalization;
- implement persistence/API/UI/search integration;
- verify privacy, races, audit, migration, recovery, and accessibility;
- independently review and checkpoint.

## Blockers
Public catalog, private-overlay promotion, object-key rename, or external catalog/authority service requires a separate Owner decision.

## Last Verification
2026-08-17 roadmap/ADR review confirms Shared Catalog is approved only after Library ownership/review prerequisites.

## Next Action
After `RF-LIBRARY02`, implement Collaborative catalog/tag/naming governance without provenance confidence/grouping scope.
