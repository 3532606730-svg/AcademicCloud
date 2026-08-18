# RF-META01 — Canonical Metadata, Templates, and Minimal Authorities

## Task ID
RF-META01 — Canonical Metadata, Templates, and Minimal Authorities

## Goal
Add material-aware canonical scholarly metadata and a minimal normalized Authority Records foundation without collapsing personal interpretation into shared facts or becoming an RDF project.

## Scope
Extend Scholarly Records with strict, versioned metadata contracts for Book, Article, Manuscript, Inscription, and Archival Document, designed to add later types. Keep the first slice deliberately small: a bounded common-field set plus no more than four type-specific fields per template. Minimal Person, Place, Language, Work, and Institution authorities are limited to stable ID, canonical label, bounded aliases, type, and typed Record links; there is no cross-domain automatic merge. Implement additive persistence, validation, server-authorized editing, API, forms/detail presentation, and tests. Canonical metadata remains shared Scholarly Record data for the canonical Library; private notes/tags/reading state remain outside this task.

The UI must not introduce a standalone `学术记录 / Scholarly Record` primary navigation surface. Record/Artifact/Version are internal domain identities; implemented canonical metadata should appear through ordinary `资料详情` flows in accordance with ADR-022.

## Non-goals
- No mature authority control, RDF/ontology/knowledge graph, automatic metadata extraction/suggestion, OCR, Library governance, provenance, or private note storage.
- No dynamic executable schema language or arbitrary client-defined fields.
- No production migration/deployment or historical migration edit.
- No revival of the private-Drive-versus-Shared-Library product split superseded by ADR-022.

## Acceptance Criteria
- Each supported material type has deterministic required/optional fields, normalization, length/cardinality limits, and round-trip serialization; type changes cannot silently discard incompatible data.
- Canonical fields and authority links are server-validated. Clients cannot set owner/domain/audit actor or reference inaccessible records.
- Canonical shared-library records are visible only through the requesting account's effective Library authority; private Personal Research Overlay data remains account-scoped and non-disclosing even to global Owner.
- Concurrent edits use revision/CAS or equivalent conflict detection; validation or authority-link failure rolls back the entire canonical update.
- Authority records are limited to stable ID, canonical label, bounded aliases, type, and typed Record links; they are deduplicated only inside the authorized domain, never auto-merged across domains, and do not claim mature identity resolution.
- UI handles all five initial templates through normal resource/detail presentation, accessible labels, unknown/optional fields, conflict recovery, responsive/mobile layouts, and plain-text safe rendering.
- Additive migration, upgrades from historical schema states, restart, backup/restore, compiled acceptance, and redeploy count zero pass.
- Independent review focuses on schema rigidity/loss, client authority injection, authority leakage, unsafe rendering, concurrency overwrite, private-overlay separation, and RDF scope creep.

## Relevant ADRs
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- `RF-DOMAIN01` ownership/identity decision record

## Relevant Modules / Files
- `database/migrations/`
- scholarly research domain/repository/service/HTTP modules created by `RF-DOMAIN01`
- canonical Library authority/data flow corrected by `RF-SHAREDDEFAULT01`
- `backend/src/persistence/contracts.ts`, `backend/src/platform/application.ts`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- metadata/migration/frontend/compiled acceptance tests

## Current State
`RF-DOMAIN01`, `RF-LIBRARY01`, and `RF-LIBRARY02` are complete, but first-use review established that the product must first correct the optional-sharing/private-Drive model into one Owner-curated shared Library. `RF-META01` is therefore parked behind `RF-SHAREDDEFAULT01` so canonical metadata is built on the correct shared-resource authority.

## Completed
- The approved initial material classes and authority categories are recorded.
- RF-PLAN01 assigned canonical metadata/templates/minimal authority foundations exactly once to this card.
- Stable Scholarly Record/Artifact/Version identities now exist from RF-DOMAIN01.

## Remaining
- wait for `RF-SHAREDDEFAULT01` to establish the canonical shared-Library product/data-flow contract;
- design bounded versioned metadata contracts and minimal authority schema;
- implement persistence/API/detail UI with conflict-safe updates;
- verify every template, privacy boundary, migration, backup/restore, and rendering path;
- independently review and checkpoint.

## Blockers
`RF-SHAREDDEFAULT01` must be independently green first. A proposal for mature RDF/semantic-web authority control, automatic extraction, external authority service/cost, or a metadata design that erases existing facts requires a new Owner/architecture decision.

## Last Verification
2026-08-18 planning reconciliation: Scholarly Record identity exists, but canonical metadata must not proceed until ADR-022's shared-corpus correction is implemented.

## Next Action
Start only after `RF-SHAREDDEFAULT01` is independently green; derive the smallest extensible metadata schema from the five approved material classes and surface it through `资料详情`, not a standalone engineering-entity browser.
