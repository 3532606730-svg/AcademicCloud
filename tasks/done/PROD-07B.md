## Task ID

PROD-07B — Recycle Authority and Permanent-Delete Production Hotfix

## Goal

Fix the three observed production usability defects on exact PROD-07A: align canonical Library holdings with sibling root catalogue rows, restore the ordinary account-folder `移入回收站` action, and add global-Owner-only permanent deletion for eligible recycled account resources and Library holdings. Deploy the exact bounded hotfix without migration 019, RF-METASUGGEST01, OCR/search/RAG, unrelated development, or destructive production acceptance.

## Scope

- Create a separate hotfix branch/worktree from exact production release `2322169bc33415734d025010c465900c7fbc6bd9`; leave the active v19/RF-METASUGGEST development checkout untouched.
- Change only the root-row presentation, ordinary account-folder recycle dispatch, Owner-only Recycle controls/API calls, account file/folder global-Owner route enforcement, and the smallest correct Library-domain purge lifecycle.
- For Library purge, derive the exact Library/domain/recycle/file/Record/Artifact/Version/storage/audit state server-side; prove exclusive ownership/reference; revalidate exclusivity at the destructive transaction boundary; fail closed on shared or concurrent state; reuse the established purge state machine and storage/audit ordering.
- Build/package and deploy exact hotfix commit `bc5788633e0295744905b4ae2dcdfcc5d97635bf`; preserve schema v18/history 001–018; create and publish a fresh verified rollback backup; run only minimal non-destructive production smoke checks.

## Non-goals

- No migration 019, RF-METASUGGEST01, OCR, RF-SEARCH01, full-text indexing, embeddings, retrieval, RAG, metadata cleanup, dependency change, main merge, or unrelated bug fix.
- No unit/integration/full test suite, typecheck, compiled acceptance, migration acceptance, independent reviewer, broad security audit, or broad dependency audit under the explicit fast-hotfix policy.
- No real production resource recycle or permanent delete for verification; no direct SQLite editing, unrelated OSS mutation, visible historical-residue cleanup, credential change, or DNS/TLS/Nginx/firewall/systemd/autostart/infrastructure-policy change.

## Acceptance Criteria

- [x] Active v19/RF-METASUGGEST development worktree was not reset, stashed, cleaned, checked out, built, or used for the artifact.
- [x] Exact 18-file hotfix diff is committed and pushed at `bc5788633e0295744905b4ae2dcdfcc5d97635bf`; no migration, dependency, deployment-policy, OCR/search/RAG, or metadata feature file changed.
- [x] Root Library holdings use the same selection-control spacer geometry as sibling account rows; no ownership, hierarchy, Library, or scholarly relation changes were made.
- [x] Ordinary account-folder row recycle uses the established direct `DELETE /api/drive/folders/:folderId` lifecycle instead of the bulk endpoint.
- [x] Owner-only account folder/file and eligible Library holding permanent-delete controls use explicit irreversible confirmations and opaque versions; bulk permanent delete is available only to the global Owner for selected recycled account resources.
- [x] Account file/folder permanent-delete routes require the active authenticated global Owner server-side; Library manager/member/contributor/uploader/creator status is insufficient and non-Owner authority fails closed without resource disclosure.
- [x] Library purge proves exclusive lifecycle ownership/reference before mutation and revalidates immediately at the destructive transaction boundary; shared file/object/version/holding/contribution/promotion/transition paths or concurrent changes leave storage and scholarly lineage untouched.
- [x] Fresh schema-v18 rollback backup/receipt verified healthy, age ciphertext published off-host, exact Linux x64 / Node 24 artifact installed, and production selected the exact hotfix with no migration command.
- [x] Non-destructive production smoke proves exact release, schema/history/checksums, integrity/FK, safe aggregate stability, public asset identity, forged-request denial, health/readiness, loopback-only API, unchanged protected configuration hashes, and absence of migration 019/RF-METASUGGEST/OCR/search content.
- [x] Rollback was not used; no real resource was recycled or purged.

## Relevant ADRs

- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-016-explicit-resource-ownership-domains.md`
- `docs/decisions/ADR-018-scholarly-resource-artifact-version-identity.md`
- `docs/decisions/ADR-020-shared-library-authorization.md`
- `docs/decisions/ADR-021-library-contribution-promotion.md`
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-023-durable-decision-reconciliation-and-local-sync.md`

## Relevant Modules / Files

- Frontend: `frontend/src/App.tsx`, `frontend/src/api.ts`, `frontend/src/i18n.ts`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.
- Drive HTTP/service/repositories: `backend/src/drive/http.ts`, `backend/src/drive/drive-service.ts`, `backend/src/drive/repositories.ts`, `backend/src/drive/recycle-repository.ts`.
- Library and scholarly persistence: `backend/src/library/http.ts`, `backend/src/library/library-service.ts`, `backend/src/library/repositories.ts`, `backend/src/persistence/sqlite/library-repository.ts`, `backend/src/persistence/sqlite/scholarly-repository.ts`, `backend/src/persistence/sqlite/stored-file-repository.ts`, `backend/src/persistence/sqlite/folder-repository.ts`, `backend/src/persistence/sqlite/recycle-repository.ts`, `backend/src/research/repositories.ts`.
- Production evidence: `CURRENT_STATUS.md`, `TASK_BOARD.md`, `docs/deployment/production-runbook.md`, `tasks/done/PROD-07B.md`.

## Current State

Complete. Production runs exact immutable release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at unchanged schema v18/history 001–018. The bounded hotfix/deployment authority is exhausted and execution is stopped.

## Completed

- Created `D:\Projects\AcademicCloud-hotfix-prod-20260818` on branch `codex/prod-hotfix-20260818` from exact production commit `2322169…`; preserved the active development checkout at `D:\Projects\AcademicCloud`, branch `codex/project-memory-reconcile-20260817`, HEAD `940b51a80935428c043175ddb9b4494c80d26af7`.
- Fixed the false root indentation by rendering canonical holdings with `.entry-select-spacer`, whose desktop/mobile geometry matches the ordinary selection-control reservation. No database, parent, domain, holding, Record, Artifact, or Version relation changed.
- Fixed ordinary folder recycle by replacing the erroneous one-item bulk dispatch with the established direct account-folder DELETE endpoint, keeping its existing recursive recycle/provenance/audit/refresh behavior.
- Added explicit Owner-only single and account-bulk permanent-delete UI, destructive confirmations, version-bearing API calls, global-Owner drive route guards, and the Library purge endpoint `DELETE /api/libraries/:libraryId/recycle/:fileId/permanent`.
- Reused the established `deleted → purging → purged` state machine and `drive.file_purge_request` / `drive.file_purge_complete` audit ordering. Account-folder purge CAS-validates the exact recycle tree, transitions child files, removes verified objects through the storage adapter, revalidates descendants, purges files, deletes folders deepest-first, and consumes the group.
- Library purge derives exact authority/lifecycle state and proves single-Library ownership-domain alignment; exact group/file/Record/Artifact/Version identity; one Artifact and one target Version/file reference; unique physical provider/object key; no competing promotion, contribution, approved-other-Library, or transition path. A transaction-local proof immediately precedes detach plus file CAS; the final transaction revalidates purging revision, object metadata, group membership, and detached exclusivity before purged/group-complete audit. Record, Artifact, Artifact Version, and unrelated lineage remain retained.
- Production builds passed for backend and frontend; `git diff --check` passed. Focused in-memory checks passed for successful canonical Library purge with retained Artifact Version, competing submitted contribution conflict with storage/lineage untouched, and recursive account-folder purge. No prohibited broad suite/reviewer/audit was run.
- Prepared exact Linux x64 / Node `v24.19.0` archive `academiccloud-linux-x64-node24-bc5788633e0295744905b4ae2dcdfcc5d97635bf.tar.gz` (SHA-256 `ad084372db6e128cc4a7ff2beae4dbbe7c8b1077c0bb07db926d69bacfbcbca6`) and manifest (SHA-256 `7fe3b0608dddf7431af9cc3bb0ff4a0de40401c2257b2a6eadd4e76eb69287e8`, 4,732 entries, 33,764,979 bytes). Linux-side narrow verification passed full manifest hashes, safe paths, exact migrations 001–018, ELF64 x86-64 native modules, and minimal native loading; broad compiled acceptance was deliberately not run on production.
- Read-only preflight confirmed exact prior release `2322169…`, schema/history/checksums 001–018, integrity `ok`, FK zero, safe aggregates, active healthy service, loopback listener, disk/memory/swap headroom, and protected-path hashes. The general readiness auditor also recorded three pre-existing non-hotfix findings: files-domain CSP profile mismatch, nine historical current-boot kernel OOM log matches from an earlier unrelated acceptance process, and the installed unit's existing 10-second start-limit interval.
- Created fresh verified backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite` (667,648 bytes; SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`) and receipt (SHA-256 `aebe203e88ad047e97f765aa0ccbad441dabe6cf193a7fe9bc10125391d55e67`). Age ciphertext `database-pre-hotfix-20260818T161319Z.age` is 668,008 bytes, SHA-256 `2a5c0decfab2133db708c027416e5f558dfc08ed25e5c7fe11a9b5d29eb0f7ec`; encrypted off-host evidence is at private backup commit `49e72e5`.
- Installed the root-owned write-denied immutable release. The first cutover guard failed closed before symlink change because `systemctl is-active` intentionally returns exit 3 for `inactive`; it restarted exact `2322169…` healthy. The corrected retry atomically selected `bc578863…`, invoked no migration, and restarted healthy. Rollback was not used.
- Final production evidence: exact current manifest source, Linux x64 / Node 24, schema/history/checksums 001–018, integrity `ok`, FK zero, safe counts unchanged at 5/4/32/18/5/1, service active/autostart disabled/`NRestarts=0`, one `127.0.0.1:3000` listener, loopback/public health and readiness 200, no post-start service errors/new kernel OOM/cgroup events/failed units, and unchanged systemd/Nginx/security-header/logrotate hashes.
- Public index/JavaScript/stylesheet SHA-256 values exactly match the hotfix release. The served bundle contains the spacer, direct folder recycle path, Owner-only account/Library permanent-delete controls, and no RF-METASUGGEST/migration-019/OCR/search residue. Forged-session requests against nonexistent account-folder, account-file, and Library permanent-delete targets returned 401. No authenticated browser session was available, so no real account/resource was used to manufacture UI evidence.

## Remaining

None inside PROD-07B. Any real disposable-object permanent-delete confirmation, infrastructure-policy repair, or later product/release task requires a new explicit Owner gate.

## Blockers

None. The artifact manifest verifier first failed closed before selection because its independent checker omitted the manifest mode field; it was corrected and the preserved tree fully reverified. The first service cutover guard also failed closed before release selection on the expected inactive-unit exit code and restored the unchanged prior service. Neither event changed the database, consumed rollback, or touched storage objects.

## Last Verification

2026-08-19: production exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`; schema v18/history/checksums 001–018; integrity `ok`; foreign keys zero; safe aggregates unchanged; loopback/public health and readiness green; API loopback-only; active/disabled service with zero restarts; public asset hashes exact; forged permanent-delete calls denied; no migration 019/RF-METASUGGEST/OCR/search residue; no real resource lifecycle mutation; backup and private off-host publication verified. Global readiness remains `NOT_READY` only on the explicitly recorded unchanged infrastructure/profile findings outside this bounded hotfix.

## Next Action

STOP for independent Owner/ChatGPT review. Do not begin another production or repository task, real permanent-delete confirmation, RF-METASUGGEST01/migration 019, OCR/search/RAG, infrastructure change, credential change, cleanup, main merge, or active-worktree synchronization from this deployment session without new explicit Owner authorization.
