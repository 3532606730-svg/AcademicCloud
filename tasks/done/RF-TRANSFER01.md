# RF-TRANSFER01 — True Resumable Upload and Download

## Task ID
RF-TRANSFER01 — True Resumable Upload and Download

## Goal
Replace whole-file retry with provider-backed multipart resume that reuses completed remote parts, while preserving browser-native Range download resume, server authority, canonical Library contribution semantics, and the small control-plane boundary.

## Scope
- Append the minimum durable multipart session state after migration 020; keep migrations 001–020 byte-identical.
- Initialize, authorize, list/reconcile, complete, abort, and bounded-clean multipart uploads through the provider-neutral storage adapter.
- Upload parts directly from browser to object storage with bounded concurrency/retry/backoff, per-part MD5, pause/continue, same-session one-click resume, refresh/reselect identity verification, automatic lost-completion reconciliation, and exact abandonment.
- Retain a truthful one-final-reupload or verify/finalize compatibility path for legacy pending uploads without multipart state.
- Preserve short-lived exact-object/exact-part authorization and revalidate account/Library authority at every server lifecycle transition.
- Expose stable ETag/size/Range capability for authorized account and Library downloads and keep the browser-native direct-download path free of whole-file JavaScript buffering.
- Use official OSS bounds: 100 KiB–5 GiB parts except the final part, 1–10,000 parts, and at most 1,000 ListParts results per provider page. AcademicCloud uses a bounded 8 MiB part contract, at most 640 parts for the existing 5 GiB file limit, client concurrency 3, and bounded retries.

## Non-goals
- Production contact, OSS mutation, deployment, migration application, or CORS/infrastructure-policy change during development.
- Backend proxying/buffering of large file bytes, permanent provider credentials in the browser, local filesystem path persistence, desktop `.part` ownership, native sync, whole-document OCR/search/RAG, main merge, or unrelated cleanup.
- Pretending legacy whole-object reservations or same-name files are resumable/identical.

## Acceptance Criteria
- New uploads use real multipart init/part progress/ListParts/complete; completed valid parts are rediscovered and never retransmitted, and only missing parts resume after failure, restart, or reauthorization.
- File size plus the existing whole-file MD5 identity must match before a retained multipart session can resume; same filename with different content fails closed.
- Same-session pause/continue preserves the File object and remote parts without a picker; after refresh the UI truthfully requests `选择原文件并继续`, verifies identity, and resumes existing parts rather than byte zero.
- State and UI distinguish queued/checking/uploading/paused/resumable/completing/complete/recoverable failure/abandoned; normal product language uses `未完成上传`, `继续上传`, `选择原文件并继续`, and `放弃上传` rather than implementation terms.
- Completion is provider-reconciled and logically exactly-once across lost responses, duplicate requests, server restart, and two-tab CAS races.
- Explicit abandonment aborts only the exact owned multipart upload and releases the pending reservation only after provider abort; stale cleanup is bounded, explicit, and never deletes a completed academic object.
- Legacy pending uploads are labeled non-resumable, may verify/finalize an already complete object, may perform one final whole-object reupload, and may be safely abandoned.
- Account and Library download authorizations expose stable ETag/size/`Accept-Ranges: bytes`; provider Range/206/Content-Range/If-Range behavior remains browser-native and authorized with short-lived signed GETs, with no JS Blob buffering.
- Cross-account, cross-Library, guessed-ID, disabled-account, stale-version, wrong-object/part, and revoked-authority paths fail non-disclosingly; contribution, provenance, canonical ownership, Favorites/Recycle, metadata, OCR, and permanent-delete boundaries remain unchanged.
- Deterministic provider fakes cover the authorized failure matrix; focused/full relevant tests, both typechecks/builds, compiled acceptance, migration history, artifact/runtime regression, and `git diff --check` are green.

## Relevant ADRs
- ADR-014 — privacy/ownership/research-activity boundaries.
- ADR-018 — stable Resource/Artifact/Version identity.
- ADR-022 — canonical shared Library and private overlays.
- ADR-023 — durable decision reconciliation and synchronization.
- ADR-028 — permanent-delete authority and destructive-boundary safety (unchanged).
- ADR-029 — provider-backed multipart transfer and browser-native Range resume.

## Relevant Modules / Files
- `backend/src/storage/storage-adapter.ts`
- `backend/src/storage/in-memory-storage-adapter.ts`
- `backend/src/storage/aliyun/client.ts`
- `backend/src/storage/aliyun/aliyun-oss-adapter.ts`
- `backend/src/drive/drive-service.ts`, `backend/src/drive/http.ts`, and transfer repositories
- `backend/src/maintenance/` and existing bounded reliability maintenance
- `database/migrations/021_*`
- `frontend/src/api.ts`, `frontend/src/direct-upload.ts`, `frontend/src/app.tsx`, i18n, and focused transfer tests
- account/Library download services and HTTP tests

## Current State
Completed on authoritative branch `codex/project-memory-reconcile-20260817`, sourced from checkpoint `ec5418912f22a1584b34ffde9d53bd1f5c7a8142`. The task checkpoint is the exact commit recorded below; production was not contacted.

## Completed
- Recovered the exact post-OCR schema v20 and current upload/download/storage/maintenance boundaries.
- Confirmed official OSS multipart limits and retained `ali-oss@6.23.0` support for init, V4 signed PUT part URLs, ListParts pagination, complete, and abort.
- Selected an 8 MiB fixed part contract: it exceeds the 100 KiB non-final minimum, keeps the existing 5 GiB limit to at most 640 parts, fits one bounded ListParts page, and permits browser concurrency 3 without backend byte buffering.
- Added migration `021_resumable_multipart_transfers.sql` with exact file/domain identity, opaque provider upload ID, part contract, lifecycle/CAS state, expiry, stale-session index, and abandonment audit support while preserving migrations 001–020 byte-identically.
- Implemented provider-neutral multipart storage contracts, deterministic in-memory/provider fakes, Aliyun adapter operations, server-authoritative initialization/reconciliation/part authorization/pause/resume/completion/abandonment/cleanup, exact-once activation, lost-completion recovery, legacy compatibility, and account/Library authority preservation.
- Implemented browser direct multipart PUT with whole-file/per-part MD5, concurrency 3, bounded retry/backoff, completed-part reuse, missing-part-only resume, same-session pause/continue, refresh/reselect identity verification, wrong-file fail-closed behavior, explicit abandonment, and browser-native direct Range download metadata.
- Removed misleading default reserved-upload/verify-again language and preserved a truthful final whole-object compatibility path for legacy pending rows.

## Remaining
- Build and independently verify the exact final Linux x64 / Node 24 production artifact, including deterministic archive/manifest, native runtime allowlist, retained PDF.js/canvas/argon2/better-sqlite3 bindings, transfer dependency coverage, and the Tesseract packaging gate.
- After both artifact jobs are green, follow the separately authorized bounded production gate and then stop.

## Blockers
None for development. Production OSS CORS/support is a later read-only preflight/artifact deployment concern; no infrastructure policy change is authorized or assumed.

## Last Verification
- Backend full suite: 335/335 PASS; focused multipart, drive HTTP, Aliyun adapter, migration, byte-path, and contribution suites PASS.
- Frontend full suite: 211/211 PASS, including multipart scheduling, retry/abort/progress, identity mismatch, native download, and API contract coverage.
- Backend/frontend typechecks and production builds PASS.
- Compiled acceptance PASS with `compiledBuild=true`, migration head 21, redeploy count 0, restart/session/announcement/scholarly identity/metadata survival, backup/restore, isolated restore, and readiness evidence.
- `git diff --check` PASS; migrations 001–020 remain byte-identical.
- Production touched: false.
- SOURCE_BASE=`ec5418912f22a1584b34ffde9d53bd1f5c7a8142`
- FINAL_HEAD=6491022a7e3da11278a30fed809c55dd235beee0
- SCHEMA=v21
- MIGRATION_CREATED=`021_resumable_multipart_transfers.sql`
- TRUE_MULTIPART_UPLOAD=true
- COMPLETED_PARTS_REUSED=true
- MISSING_PARTS_ONLY_RESUMED=true
- SAME_SESSION_ONE_CLICK_RESUME=true
- RESELECT_AFTER_REFRESH_RESUMES_EXISTING_PARTS=true
- WRONG_FILE_FAILS_CLOSED=true
- PAUSE_CONTINUE=true
- ABANDON_ABORT_CLEANUP=true
- STALE_MULTIPART_CLEANUP=true
- LEGACY_PENDING_UPLOAD_PATH=true
- DEFAULT_RESERVED_UPLOAD_UI_REMOVED=true
- VERIFY_AGAIN_AUTOMATED=true
- DOWNLOAD_RANGE_SUPPORT=true
- DOWNLOAD_206=true
- DOWNLOAD_ETAG=true
- DOWNLOAD_IF_RANGE=true
- BROWSER_NATIVE_DOWNLOAD_RESUME=true
- ACCOUNT_LIBRARY_AUTHORITY_PRESERVED=true
- OCR_REGRESSION_GREEN=true
- PROD08R_RUNTIME_CONTRACT_PRESERVED=true
- TESTS=`backend 335/335; frontend 211/211`
- TYPECHECK=PASS
- BUILDS=PASS
- COMPILED_ACCEPTANCE=PASS
- GIT_DIFF_CHECK=PASS
- PRODUCTION_TOUCHED=false
- REMOTE_SYNCHRONIZED=true (verified origin/codex/project-memory-reconcile-20260817 at 6491022a7e3da11278a30fed809c55dd235beee0)
- LOCAL_SYNCHRONIZED=true (verified local/tracking/remote equality at 6491022a7e3da11278a30fed809c55dd235beee0)
- NEXT=exact Linux x64 / Node 24 combined artifact and Tesseract gate

## Next Action
Build the final combined artifact from the exact task checkpoint, prove the independent fresh-runner verification and deterministic identity, resolve the exact release-local Tesseract/tessdata packaging gate without unpinned/system-side installation, and only then enter the separately authorized bounded production gate. Stop after final reconciliation.
