# RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions

## Task ID
RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions

## Goal
Provide deterministic, bilingual, evidence-backed bibliographic suggestions for authorized canonical Library resources while keeping suggestions separate from RF-META01 canonical facts until an effective Library manager explicitly accepts them.

## Scope
- Bounded local PDF text-layer inspection through the provider-neutral storage seam.
- Exact first 15 plus last 5 page discovery window, with fixed parser/text/time limits.
- Chinese and English title-page, copyright/verso, CIP, colophon, series, embedded Info, and conservative filename evidence.
- Field-specific precedence, page/source/confidence/excerpt evidence, ambiguity, stale, unsupported, and OCR-deferred states.
- Append-only reviewable suggestion runs/candidates and normal `资料详情` UI/API integration.
- Explicit effective-manager acceptance through RF-META01 metadata CAS, including same-domain authority review.

## Non-goals
- OCR, image rendering, whole-document extraction, indexing, embeddings, retrieval, RAG, LLM/AI extraction, web search, or external catalogue/ISBN APIs.
- Automatic canonical writes, authority creation/merge, physical filename/object-key/byte mutation, production contact/deployment, or destructive real-data operations.

## Acceptance Criteria
- Same input and ruleset produce deterministic candidate ordering and bounded evidence.
- Only the deduplicated 1-based first 15 plus last 5 pages are inspected; object/page/text/embedded metadata/time budgets are enforced.
- Chinese and English title/copyright/CIP fixtures, older books, conflicts, body noise, malformed/noisy metadata, filename cleanup, and image-only PDFs are covered.
- Every candidate records fixed RF-META01 field/role, source type, source page, page class, confidence, precedence rank, bounded excerpt, and ruleset version.
- Conflicting best-rank values remain ambiguous; low-confidence/generic values fall back safely rather than inventing facts.
- Members can read but cannot generate or accept; effective Library managers generate/review/accept through server-derived authorization and RF-META01 CAS.
- Stale metadata, stale database source fingerprints, provider object changes, unresolved authorities, and conflicting selections fail closed.
- Acceptance preserves file ID, accepted filename, object key/bytes, checksum, uploader/contributor provenance, Record/Artifact/Version lineage, Favorites, and private overlay state.
- Production remains untouched and RF-SEARCH01 remains parked.

## Relevant ADRs
- ADR-014 — privacy/ownership/research-activity boundaries.
- ADR-022 — canonical shared Library and private overlays.
- ADR-025 — front-matter evidence precedence and OCR boundary (amended for this current authorization).
- ADR-026 — canonical metadata/minimal-authority destination and CAS.
- ADR-027 — bounded implementation, limits, persistence, and acceptance contract.

## Relevant Modules / Files
- `backend/src/suggestions/suggestion.ts`
- `backend/src/suggestions/pdf-text.ts`
- `backend/src/suggestions/extractor.ts`
- `backend/src/suggestions/suggestion-service.ts`
- `backend/src/suggestions/http.ts`
- `backend/src/suggestions/repositories.ts`
- `backend/src/persistence/sqlite/suggestion-repository.ts`
- `backend/src/storage/storage-adapter.ts`, in-memory adapter, and Aliyun adapter/client seam
- `database/migrations/019_bibliographic_metadata_suggestions.sql`
- `frontend/src/resource-details.tsx`, `frontend/src/api.ts`, i18n/styles and focused tests

## Current State
Complete. The checkpoint was implemented on `codex/project-memory-reconcile-20260817` from synchronized RF-META01 baseline `2322169bc33415734d025010c465900c7fbc6bd9`. Development schema is v19/history 001–019. Production remains release `855b63c49f12f3375972774e7bc7385088b0495e`, schema v17/history 001–017, and was not contacted.

## Completed
- Added pinned `pdfjs-dist` 6.2.108 behind a bounded `StorageAdapter.readObject` seam. Reads cap at 32 MiB; inspection caps at 20 selected pages, 16,384 characters/page, 262,144 total characters, 4,096/16,384 embedded Info characters, and five seconds. No rendering/OCR occurs.
- Added exact 1-based first-15/last-5 page selection, meaningful-text detection, C1/control sanitization, malformed/encrypted/oversized fail-closed handling, and `ocr_deferred` for valid image-only/textless PDFs.
- Added deterministic `rf-metasuggest-v1` bilingual extraction. Title/subtitle/creator precedence is title page → CIP/colophon/copyright → embedded Info → filename. Publisher/place/date/edition/ISBN precedence is copyright/verso/CIP/colophon → title page → embedded Info → filename. Chinese CIP/publication forms, English LOC/British CIP forms, older title-page publication statements, suffix authors, `责任编辑`, `印次`, ISBN validation, and conservative archive/hash/ISBN filename cleanup are covered.
- Added ordinary-body and metadata-only safeguards, generic embedded/filename placeholder suppression, same-rank ambiguity, bounded excerpts, and no invented canonical facts. Sparse two-line English title pages with conservative `Given Family` or `Family, Given` names are admitted only within the first four pages and normalize the person value deterministically.
- Added migration 019 append-only run/candidate persistence. Stored evidence excludes PDF bytes, raw page text, object keys, and private overlay state; lifecycle status is guarded and evidence immutable.
- Added manager-only generate/accept and Member read-only routes. Acceptance rechecks source database fingerprint and provider object stat, uses RF-META01 CAS, rejects stale/conflicting selections, and requires explicit same-domain authority links without auto-create/merge.
- Added normal `资料详情` suggestions panel with source/page/class/confidence/excerpt, manager-only controls, OCR-deferred/stale/unsupported states, metadata-less safety guard, and explicit acceptance/edit flow. Stable physical identity and private research controls remain separate.
- Added focused service, parser, extractor, HTTP, storage, and frontend coverage plus migration/schema-head updates. No production state or real private research data was used.

## Remaining
- RF-SEARCH01 and the remaining Pre-OCR queue remain parked. OCR/text extraction, indexing, embeddings, retrieval, and RAG remain outside this checkpoint.
- A later Owner decision would be required for any production release or additional Epic.

## Blockers
None for RF-METASUGGEST01. The required stop boundary is reached; future work is Owner-gated.

## Last Verification
- Focused suggestion suites: 30/30 passing (extractor 17, PDF inspector 4, service 8, HTTP 1).
- Full backend suite: 300/300 passing.
- Full frontend suite: 186/186 passing.
- Backend and frontend typechecks passing.
- Backend and frontend production builds passing.
- Compiled acceptance passing after migration-head reconciliation (`firstMigrationCount: 19`, restart/backup/restore/integrity/readiness evidence green).
- `git diff --check` clean apart from normal Windows line-ending warnings.
- Independent read-only review repaired and rechecked: multiline title classification, metadata-only/imprint false titles, ordinary-body copyright false positives, Chinese publication splitting/CIP heading cleanup, generic placeholders, sparse bare English title-page names with metadata-label suppression, bare author-marker handling, conflict acceptance, provider-stat stale acceptance, and identity/private-state test coverage. No remaining material finding was reported after the final re-review.
- Production was not contacted, deployed, migrated, inspected, or mutated.

## Next Action
STOP for independent Owner/ChatGPT review. Do not start RF-SEARCH01, OCR/RAG work, or production activity without new explicit authorization.
