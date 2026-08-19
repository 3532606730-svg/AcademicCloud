# PROD-09A — Metadata Suggestion Runtime Error Hotfix

## Task ID
PROD-09A — Metadata Suggestion Runtime Error Hotfix

## Goal
Reproduce and locate the exact production failure in `POST /api/libraries/:libraryId/holdings/:fileId/metadata/suggestions`, fix its root cause at the narrowest correct boundary, prevent unexpected internal suggestion-generation exceptions from reaching the ordinary UI, deploy the exact verified hotfix without migrations, and close with synchronized evidence.

## Scope
- Minimum request-specific production diagnostics: relevant application log lines and exact stack trace only.
- Narrow source/dependency root-cause repair and a regression test using the actual `.anonymous` failure shape.
- Preserve existing localized/actionable `SuggestionError` and API-code behavior; map only unexpected suggestion-generation failures to a short localized generic message while retaining a sanitized server-side exception/stack diagnostic.
- Proportional affected backend/frontend verification, production builds, immutable Linux x64 / Node 24 artifact workflow, exact baseline/rollback preflight, no-migration deployment, and bounded non-mutating production acceptance.
- Reconcile, commit, publish, and synchronize final evidence on `codex/project-memory-reconcile-20260817`, then stop.

## Non-goals
- RF-SEARCH01 or any other product task; whole-document OCR/extraction; indexing/search; embeddings/retrieval/RAG; automatic upload OCR; network/cloud OCR; LLM/catalogue/ISBN/web lookup; raw OCR/page-image persistence.
- Migration/schema change, infrastructure-policy change, system-wide Tesseract change, credentials, main merge, permanent deletion, broad database/resource inspection, real scholarly metadata mutation, or unrelated cleanup.

## Acceptance Criteria
- The exact request is traced and production evidence plus a deterministic production-source/runtime stack prove the precise source/dependency line that yields `.anonymous` from `undefined`; no root-cause guess is accepted.
- A regression test uses the actual failure shape and fails before/passes after the narrow fix.
- Expected `SuggestionError`/API codes retain current localized actionable behavior.
- Unexpected suggestion-generation failures return only `无法查找资料信息，请重试。` / `Could not find resource information. Try again.` to the ordinary UI; raw JavaScript/dependency messages are absent from the response/UI.
- The server diagnostic path retains the real exception/stack without PDF/OCR text, credentials, signed URLs, object keys, or other sensitive resource content.
- Native-PDF-text-first, bounded first-15/last-5 OCR fallback, local/offline Tesseract, suggestions-only review/acceptance, metadata normalization/catalogue display, transfer/Range, overlay isolation, authorization, and permanent-delete behavior remain intact.
- Exact regression/affected suggestion-OCR-PDF/frontend tests, applicable typechecks, backend/frontend production builds, and `git diff --check` pass.
- A new immutable Linux x64 / Node 24 artifact is built and independently verified from the exact hotfix source.
- Preflight proves exact PROD-09/v21/001–021 state and rollback safety; no migration runs; only the exact green artifact is deployed.
- Production health/readiness, unchanged schema/history, reproduced-case suggestion behavior, error redaction, OCR runtime, and existing suggestion acceptance behavior pass without modifying scholarly metadata.

## Relevant ADRs
- ADR-023 — durable decision reconciliation and synchronization.
- ADR-027 — bounded bibliographic suggestion implementation and local OCR amendment.
- ADR-030 — release-local Tesseract runtime.

## Relevant Modules / Files
- `backend/src/suggestions/`
- metadata-suggestion HTTP routes and error handling
- frontend metadata-suggestion API/error rendering and i18n
- affected backend/frontend tests
- `.github/workflows/production-build.yml`
- `scripts/production-artifact.mjs`
- `docs/deployment/production-runbook.md`
- authoritative project/task/evidence records

## Current State
Active; implementation and local verification are green, independent review is PASS, and the exact source checkpoint/artifact remain pending. Repository/local/tracking/remote began clean and equal at `55f4c700316415a460417bcf1d01bab41df480ec`. Production remains exact PROD-09 release `9d2fc9b08e2e02c821ef357f149ed928510c2825`, schema v21/history 001–021. RF-SEARCH01 has not started and remains parked.

## Completed
- Owner authorized the exact bounded diagnosis, implementation, verification, artifact, production hotfix, evidence publication, and synchronization objective.
- Recovered clean authoritative repository/task/release state and confirmed no RF-SEARCH01 work exists to isolate.
- Bounded production diagnostics proved exact release `9d2fc9b…`, active service, zero restarts, and no POST completion for the reported action. The existing server cannot contain a stack because the frontend fails before `fetch`; only unrelated authorized-guard GETs exist in the bounded journal evidence.
- Verified exact production asset `index-CGK4rc7S.js` (SHA-256 `28ee18625b208f4915c8704b10c72e8335a1a6cdcb45d493209ed8cb132ddf2a`) detaches `generateLibraryMetadataSuggestions` and then enters private `this.#action` from an undefined receiver. V8 on the anonymous production class deterministically produces `Cannot read properties of undefined (reading 'anonymous')`; the unminified stack points to `frontend/src/api.ts:896` through the detached call formerly at `frontend/src/resource-details.tsx:342`.
- Preserved the receiver for suggestion GET/generate/accept calls, so all three optional `ApiClient` prototype methods execute through `api` and the generation POST reaches the backend.
- Added the suggestion-specific `metadata_suggestion_internal_error` boundary and exact zh-CN/English copy. Raw/non-actionable client errors are normalized only inside the suggestion UI; expected suggestion/auth/request API codes retain their existing behavior.
- Unexpected inspector/storage/dependency exceptions no longer create a misleading partial `unsupported` run. The generation route now returns only the stable internal code and logs a validated error type plus bounded real call frames with the message/cause/request/resource content excluded.
- Added real-`ApiClient` receiver coverage for suggestion GET/generate/accept, exact `.anonymous` UI-redaction coverage in both languages, expected-code mapping coverage, sanitized diagnostic coverage with sensitive sentinels, and no-partial-run service coverage.
- Independent read-only review returned PASS with no material finding and confirmed no migration/schema/dependency/artifact-workflow/transfer/Range/Favorites/authorization/permanent-delete or unrelated feature delta.

## Remaining
- Create/publish the exact source checkpoint and build/independently verify its immutable Linux x64 / Node 24 artifact.
- Verify the exact unchanged production baseline/rollback boundary, deploy without migrations, and complete bounded production acceptance.
- Reconcile final evidence, close the card, publish, synchronize, and stop.

## Blockers
None.

## Last Verification
- Activation recovery: branch `codex/project-memory-reconcile-20260817`; local/tracking/remote `55f4c700316415a460417bcf1d01bab41df480ec`; clean worktree before task activation.
- Exact affected backend suggestion/OCR/PDF/service/HTTP verification PASS 28/28; exact frontend API/i18n/details verification PASS 53/53.
- Full backend PASS 339/339; full frontend PASS 221/221; backend/frontend typechecks and production builds PASS.
- Compiled acceptance PASS at migration head 21 with `redeployMigrationCount=0`, health/readiness/restart/backup/restore/canonical-metadata evidence green; release-local Tesseract verifier PASS; `git diff --check` PASS.
- Independent read-only hotfix review PASS with no material finding.
- Production contact was read-only and limited to release/service identity, exact suggestion-route journal matches, and the exact deployed frontend asset/hash; no database, resource record, object, scholarly content, credential, or unrelated log was inspected or mutated.

## Next Action
Commit and publish the exact green hotfix source, verify local/tracking/remote equality, then run the existing immutable artifact workflow against only that source.
