# RF-META01 — Canonical Metadata, Templates, and Minimal Authorities

## Task ID
RF-META01 — Canonical Metadata, Templates, and Minimal Authorities

## Goal
Add material-aware canonical scholarly metadata and a minimal normalized Authority Records foundation without collapsing personal interpretation into shared facts or becoming an RDF project.

## Scope
Extend Scholarly Records with strict, versioned metadata contracts for Book, Article, Manuscript, Inscription, and Archival Document, designed to add later types. Keep the first slice deliberately small: a bounded common-field set plus no more than four type-specific fields per template. Minimal Person, Place, Language, Work, and Institution authorities are limited to stable ID, canonical label, bounded aliases, type, and typed Record links; there is no cross-domain automatic merge. Implement additive persistence, validation, server-authorized editing, API, forms/detail presentation, and tests. Canonical metadata remains shared Scholarly Record data for the canonical Library; private notes/tags/reading state remain outside this task.

The UI must not introduce a standalone `学术记录 / Scholarly Record` primary navigation surface. Record/Artifact/Version are internal domain identities; implemented canonical metadata should appear through ordinary `资料详情` flows in accordance with ADR-022.

The original acquisition/display filename remains preserved as provenance/detail data. Canonical human-facing title/author/publication fields may differ from that filename once explicitly set through the authorized metadata path.

## Non-goals
- No mature authority control, RDF/ontology/knowledge graph, automatic metadata extraction/suggestion, OCR, Library governance, provenance, or private note storage.
- Automatic/local title and metadata suggestions are owned by the separate successor card `RF-METASUGGEST01`, not this task.
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
- `资料详情` exposes the preserved original filename separately from canonical title metadata; changing canonical metadata never renames object keys or stored bytes.
- Additive migration, upgrades from historical schema states, restart, backup/restore, compiled acceptance, and redeploy count zero pass.
- Independent review focuses on schema rigidity/loss, client authority injection, authority leakage, unsafe rendering, concurrency overwrite, private-overlay separation, and RDF scope creep.

## Relevant ADRs / Tasks
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- `RF-DOMAIN01`, `RF-SHAREDDEFAULT01`, `L1-UX06`, `RF-METASUGGEST01`

## Relevant Modules / Files
- `database/migrations/`
- scholarly research domain/repository/service/HTTP modules created by `RF-DOMAIN01`
- canonical Library authority/data flow corrected by `RF-SHAREDDEFAULT01`
- `backend/src/persistence/contracts.ts`, `backend/src/platform/application.ts`
- `frontend/src/api.ts`, catalogue/detail UI, `frontend/src/styles.css`
- metadata/migration/frontend/compiled acceptance tests

## Current State
`RF-SHAREDDEFAULT01` and PROD-06A are complete: production now runs one canonical shared Library at schema v17. Owner first-use review subsequently identified a catalogue presentation regression, so `L1-UX06` is sequenced immediately before this card to establish one coherent resource catalogue. The metadata authority prerequisite itself is no longer blocked.

## Completed
- The approved initial material classes and authority categories are recorded.
- RF-PLAN01 assigned canonical metadata/templates/minimal authority foundations exactly once to this card.
- Stable Scholarly Record/Artifact/Version identities exist from RF-DOMAIN01.
- Canonical shared-Library authority and live corpus transition exist from RF-SHAREDDEFAULT01/PROD-06A.

## Remaining
- wait only for `L1-UX06` to finish the coherent catalogue presentation surface;
- design bounded versioned metadata contracts and minimal authority schema;
- implement persistence/API/`资料详情` UI with conflict-safe updates and preserved original filename;
- verify every template, privacy boundary, migration, backup/restore, and rendering path;
- independently review and checkpoint.

## Blockers
`L1-UX06` is the immediate sequencing dependency. Any proposal for mature RDF/semantic-web authority control, automatic extraction inside this card, external authority service/cost, or a metadata design that erases existing facts requires a new Owner/architecture decision.

## Last Verification
2026-08-18 post-PROD-06A Owner review: canonical Library authority is live and green. Metadata work is now sequenced after the bounded catalogue presentation repair, with deterministic title/metadata suggestion explicitly delegated to `RF-METASUGGEST01`.

## Next Action
After `L1-UX06` is independently green, derive the smallest extensible metadata schema from the five approved material classes and surface it through `资料详情`, keeping original filename/provenance separate from canonical title metadata.