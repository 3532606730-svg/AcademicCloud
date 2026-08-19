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
PASS/CLOSED. Exact hotfix source/artifact `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a` is deployed in production at unchanged schema v21/history 001–021. The `.anonymous` receiver regression and suggestion-specific raw-error leak are repaired; authenticated non-mutating acceptance, OCR/runtime, transfer/Range, schema/integrity, health/readiness, protected-hash, and no-new-error/OOM evidence are green. Rollback was not used. RF-SEARCH01 remains parked.

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
- Committed and published exact green source `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`; local/tracking/remote equality and a clean worktree were verified before artifact execution.
- Artifact workflow `32234343552` passed. The primary build/runtime job and fresh-runner independent download/runtime verification are green; the initial independent attempt was cancelled runnerless with zero executed steps and only that job was rerun against the same uploaded bundle.
- Verified Actions artifact `9358788301`, bundle digest `sha256:ea3549fe6fd3f08210a2e109c8b7c696324e7a06323e285b1914ee06e8b0e924`; archive SHA-256 `0fe94a30d9ba77810c822c6f5a9ee7c5f4f41dacdcd8ffe5678b7db553d6b7a2`; manifest SHA-256 `ec1b4d14f13e76f001166c124e9838776ffe3eaa01664c71e53520e0542ec1c4`; runtime-evidence SHA-256 `1c15752aa7bfc43b80f57c009bf40b474aa2dd129668b3e52511afbf94399936`; 5,384 files / 125,820,107 bytes.
- Read-only production preflight proved exact baseline/process `9d2fc9b…`, v21/history 001–021/checksums, integrity `ok`, zero foreign-key violations, unchanged protected hashes, active/disabled service with `NRestarts=0`, one loopback-only listener, green loopback/public health/readiness, and root-owned non-writable rollback release.
- Verified and installed only the exact four-file bundle as immutable root-owned release `a5e2bc21…`; archive paths/internal-external manifest/all entries, migrations 001–021, Linux x64 native modules, PDF.js/canvas, and release-local offline Tesseract passed. The service account cannot write the release.
- Completed guarded no-migration cutover from `9d2fc9b…` to exact `a5e2bc21…`; stop/listener guard passed, process CWD matches the new release, no migration runner executed, and rollback was not used.
- Post-cutover acceptance proved exact release/process, schema/history/checksums/integrity/FK, active/disabled/zero-restart/loopback-listener state, byte-identical public assets, unchanged protected hashes, Tesseract 5.5.3 with exact languages/18 libraries/offline synthetic OCR, PDF.js/canvas/native modules, 401 suggestion/multipart/Range guards, exact one-byte 206 Range response, and zero new app/OOM/cgroup events.
- Authenticated Owner acceptance issued exactly one bodyless suggestion POST. It completed 200 in 95 ms with an expected `unsupported` run; `.anonymous`, raw internal error, generic internal error, and error alert were absent; no candidate was selected or accepted; canonical metadata remained unchanged. No sensitive resource identity/content was retained in evidence.
- Removed the exact task-owned staging directory and verified final public health `ok` and readiness `ready`.

## Remaining
None.

## Blockers
None.

## Last Verification
- Activation recovery: branch `codex/project-memory-reconcile-20260817`; local/tracking/remote `55f4c700316415a460417bcf1d01bab41df480ec`; clean worktree before task activation.
- Exact affected backend suggestion/OCR/PDF/service/HTTP verification PASS 28/28; exact frontend API/i18n/details verification PASS 53/53.
- Full backend PASS 339/339; full frontend PASS 221/221; backend/frontend typechecks and production builds PASS.
- Compiled acceptance PASS at migration head 21 with `redeployMigrationCount=0`, health/readiness/restart/backup/restore/canonical-metadata evidence green; release-local Tesseract verifier PASS; `git diff --check` PASS.
- Independent read-only hotfix review PASS with no material finding.
- Artifact workflow `32234343552` / exact source `a5e2bc21…`: PASS; archive/manifest/runtime evidence and independent verification PASS.
- Production release/process `a5e2bc21…`; schema v21/history 001–021/checksums exact; integrity `ok`; foreign keys 0; no migration; rollback not used.
- Health `ok`; readiness `ready`; public assets exact; protected hashes unchanged; OCR/native runtime PASS; transfer/Range authorization/206 semantics PASS; app/OOM/cgroup events zero.
- Authenticated suggestion regression PASS: one POST 200, expected `unsupported`, no raw/internal error, no acceptance or canonical-metadata mutation, sensitive evidence excluded.

## Next Action
Publish and synchronize this final evidence checkpoint, verify local/tracking/remote equality and clean worktree, then STOP. Resume RF-SEARCH01 only after Owner review and new explicit authorization.
