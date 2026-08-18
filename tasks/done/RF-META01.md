# RF-META01 — Canonical Metadata, Templates, and Minimal Authorities

## Task ID
RF-META01 — Canonical Metadata, Templates, and Minimal Authorities

## Goal
Add a strict canonical scholarly metadata destination and minimal Library-domain authority foundation through ordinary `资料详情`, while keeping the accepted acquisition filename, physical identity, provenance, and private research activity separate.

## Scope
Implement the ADR-026 version-1 contracts for Book, Article, Manuscript, Inscription, and Archival Document. Add append-only schema v18 persistence, exact-Library holding/detail APIs, effective-manager mutation authority, opaque metadata/authority CAS, atomic typed authority links, canonical-title catalogue preference, filename fallback, and a compact manager-edit/member-read-only details UI.

The common fields are `canonicalTitle`, optional `subtitle`, up to eight `alternativeTitles`, optional `dateStatement`, and up to eight `{scheme,value}` identifiers. Type fields are exactly:

- Book: `editionStatement`, `volumeStatement`;
- Article: `volumeStatement`, `issueStatement`, `locator`;
- Manuscript: `shelfmark`, `supportStatement`, `extentStatement`, `scriptStatement`;
- Inscription: `objectType`, `materialStatement`, `dimensionsStatement`, `scriptStatement`;
- Archival Document: `documentType`, `fondsOrCollection`, `seriesStatement`, `referenceCode`.

Authority types are exactly Person, Place, Language, Work, and Institution. Records contain only stable ID, type, canonical label, up to eight aliases, opaque version, and same-domain typed Record links under the fixed ADR-026 role matrix.

## Non-goals
- No RF-METASUGGEST01, RF-SEARCH01, filename cleanup, automatic metadata discovery, PDF/front-matter parsing, OCR, ISBN/catalogue/network lookup, AI/LLM extraction, indexing, embeddings, retrieval, or RAG.
- No RDF/OWL/general graph, fuzzy identity resolution, external authority API, automatic merge, dynamic schema builder, or standalone `学术记录` product surface.
- No production contact/migration/deployment, main merge, permanent deletion, or destructive real-data operation.

## Acceptance Criteria
- Schema v18 upgrades v17 additively, performs no metadata backfill, restarts idempotently, and preserves every existing Record/Artifact/Version/file identity, filename, object key/checksum, provenance, contribution evidence, and Favorite/private-overlay state.
- All five strict templates round-trip with deterministic required/optional rules, normalization, length/cardinality bounds, unknown-key rejection, and no silent incompatible type-field loss.
- Exact Library/file routes derive actor, domain, holding, Record, and audit actor server-side; Members read; only current effective managers mutate; wrong Library/guessed file/disabled or archived manager/inaccessible authority fail non-disclosingly.
- Current opaque metadata/authority versions succeed and stale versions fail explicitly. Metadata fields, ordered values, and authority links update atomically.
- Canonical detail serialization contains shared canonical facts and accepted original filename, but no Personal Research Overlay or injected ownership/provenance authority.
- Catalogue prefers canonical title and otherwise uses `file.displayName`; `资料详情` displays the filename separately and uses plain-text safe rendering.
- All five templates render; Member details are read-only; manager edit/create-authority paths work; stale UI state reloads authoritative data without replaying a stale write; mobile/basic accessibility remains usable.
- Focused migration/backend/frontend/typecheck/build checks and independent diff review are green without replaying production or unrelated historical campaigns.

## Relevant ADRs
ADR-014, ADR-016, ADR-018, ADR-020, ADR-022, ADR-025, and ADR-026; completed RF-DOMAIN01, RF-SHAREDDEFAULT01, and L1-UX06.

## Relevant Modules / Files
- `database/migrations/018_canonical_scholarly_metadata.sql`
- `backend/src/metadata/`, persistence contracts/SQLite wiring, platform composition, Library holding projection, and governance audit vocabulary
- `backend/test/metadata/` and `backend/test/persistence/canonical-metadata-migration.test.ts`
- `frontend/src/api.ts`, `frontend/src/resource-details.tsx`, `frontend/src/App.tsx`, `frontend/src/styles.css`, `frontend/src/i18n.ts`, and focused API/App/resource-detail tests
- `docs/decisions/ADR-026-canonical-scholarly-metadata-and-minimal-authorities.md`

## Current State
Complete and independently green on branch `codex/project-memory-reconcile-20260817`. The development schema head is v18. Production was not contacted and remains exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017. This completed record is part of the bounded RF-META01 checkpoint; execution stops after publication/synchronization for independent Owner/ChatGPT review.

## Completed
- Recovered a clean synchronized baseline at `e4d109076f30709fabd341534c9fe08e6bdbee4f` and kept RF-META01 as the sole active implementation boundary.
- Accepted ADR-026 with the fixed five-template canonical metadata contract, five authority types, exact typed-role matrix, Library-domain constraint, independent opaque CAS, explicit two-save non-lossy material-type transition, and filename/physical/private-overlay separation.
- Added append-only migration 018 with no backfill, normalized ordered metadata values, fixed migration-controlled type fields, domain-scoped authority/alias/link tables, same-domain composite foreign keys, and immutability/type/role guards.
- Added exact holding-scoped detail and metadata routes plus Library-scoped authority list/create/update routes. The server derives the authenticated actor, effective membership/manager role, Library domain, holding, retained lineage, and audit identity; injected authority fields and cross-domain links are rejected.
- Added atomic metadata/authority persistence with record-specific no-metadata CAS, stale-write conflicts, strict NFC/one-line/length/cardinality/unknown-key validation, role compatibility, and immutable physical/provenance identities.
- Added canonical-title projection to Library holdings while preserving `files.display_name` as the accepted filename fallback and separate `原始文件名` detail fact.
- Added the ordinary responsive `资料详情` surface: Member read-only facts, effective-manager metadata editing and authority creation/linking, safe unknown-template rendering, stale-state refresh without replay, and plain-text rendering.
- Kept Preview, Download, Favorites, and Library recycle bound to the existing stable file identity and their established authorization/CAS paths; metadata CAS is never used as Drive/recycle CAS.
- Expanded compiled local acceptance to retain synthetic canonical metadata through restart, verified backup, isolated restore, readiness, and idempotent redeploy.
- Repaired the independent review's one test-only finding: the unknown-future-template fixture now typechecks and uses a plural text query for an intentionally repeated safe value. Follow-up review found no remaining P0–P2 issue.
- Reconciled `AGENTS.md`, `CURRENT_STATUS.md`, `TASK_BOARD.md`, `ROADMAP.md`, ADR-026, and this task record to the completed STOP state.
- Did not contact production, run a production migration/deployment, start suggestion/search/OCR/RAG work, merge main, permanently delete data, or change infrastructure/credentials.

## Remaining
None inside RF-META01. RF-METASUGGEST01, RF-SEARCH01, all later Pre-OCR work, and every production action require new explicit Owner authorization.

## Blockers
None. The required terminal boundary is STOP for independent Owner/ChatGPT review.

## Last Verification
2026-08-18 exact closing tree:

- backend full suite: 268/268 passed;
- frontend full suite: 182/182 passed;
- backend and frontend typechecks: passed;
- backend and frontend release builds: passed;
- migration 018 focused v17→v18 preservation/idempotency rehearsal: passed;
- compiled local restart/backup/restore acceptance: `status: ok`, `firstMigrationCount: 18`, health/readiness green, session/announcement/scholarly identity/canonical metadata retained across restart and verified restore, `redeployMigrationCount: 0`;
- independent final diff review: no remaining P0, P1, or P2 finding;
- `git diff --check`: passed with expected Windows line-ending notices only;
- production contact/mutation: none.

## Next Action
STOP for independent Owner/ChatGPT review after publication and synchronization of the enclosing non-main checkpoint. No next task is authorized; do not start RF-METASUGGEST01, RF-SEARCH01, another Pre-OCR card, or production work without new explicit Owner authorization.
