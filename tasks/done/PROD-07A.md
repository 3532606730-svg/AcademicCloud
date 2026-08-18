## Task ID

PROD-07A — RF-META01 Canonical Metadata Production Release

## Goal

Deploy the exact independently accepted checkpoint `2322169bc33415734d025010c465900c7fbc6bd9`, apply only additive migration 018, and record the bounded production evidence checkpoint. RF-METASUGGEST01, migration 019, and all later intelligence/search work remain undeployed.

## Scope

- Production release switch from `855b63c49f12f3375972774e7bc7385088b0495e` / schema v17 to `2322169bc33415734d025010c465900c7fbc6bd9` / schema v18.
- Fresh pre-v18 SQLite backup, receipt, age encryption, private off-host publication, isolated v17→v18 rehearsal, fail-closed live migration, restart, and focused acceptance.
- No production DNS/TLS/Nginx/firewall/systemd-policy/autostart/credential/OSS-policy change.

## Non-goals

- RF-METASUGGEST01, migration 019, OCR, automatic title recognition, RF-SEARCH01, full-text indexing, embeddings, retrieval, RAG, external catalogue/ISBN lookup, AI extraction, permanent deletion, cleanup of historical visible residue, main merge, or unrelated infrastructure work.
- No synthetic production corpus resource, real scholarly metadata mutation, private-overlay inspection, or permanent production-data deletion.

## Acceptance Criteria

- [x] Active development worktree was not reset, stashed, cleaned, checked out, or used to build the deployment artifact.
- [x] Deployment tree was pinned to the exact target commit and contained migrations 001–018 only; no 019/suggestion code entered the release.
- [x] Fresh pre-v18 backup and receipt were created immediately before migration, verified, age-encrypted, and published to private `AcademicCloud-Backups`.
- [x] Isolated v17→v18 rehearsal applied exactly `[18]`, repeated with `[]`, and passed schema/integrity/FK verification.
- [x] Live migration applied exactly `[18]`; release switched atomically and production restarted healthy.
- [x] Focused post-deploy checks passed for health/readiness, exact release/schema, Library holdings, fallback metadata counts, loopback listener, public asset identity, guarded catalogue/Library routes, and absence of suggestion UI/endpoint residue.
- [x] Rollback was not used; the inseparable rollback pair is old release `855b63c…` plus the fresh pre-v18 backup below.

## Relevant ADRs

- ADR-014 — Privacy, ownership, and research-activity boundaries
- ADR-022 — Default shared Library and private research activity
- ADR-023 — Durable decision reconciliation and synchronization
- ADR-026 — Canonical metadata, authorities, CAS, and filename separation

## Relevant Modules / Files

- `database/migrations/018_canonical_scholarly_metadata.sql`
- `scripts/production-artifact.mjs`
- `backend/scripts/compiled-acceptance.mjs`
- `frontend/src/resource-details.tsx`
- `docs/deployment/production-runbook.md`
- `docs/deployment/backup-recovery.md`
- `docs/deployment/encrypted-backup.md`

## Current State

Complete. Production now runs exact release `2322169bc33415734d025010c465900c7fbc6bd9` at schema v18/history 001–018. The active development worktree remains untouched by this deployment.

## Completed

- Created a separate detached deployment worktree at the target commit. Exact migration files 001–018 were verified; migration 019 and suggestion source were absent.
- Local target verification passed: backend 268 tests, frontend 182 tests, type-check, production build, full and production dependency audits.
- Linux x64 / Node 24 artifact runtime verification passed with source commit `2322169bc33415734d025010c465900c7fbc6bd9`, archive SHA-256 `fca93a9ce844b713d73a26d146655ecd9689555b7ddf94d18b8a3d6202ebdc17`, manifest SHA-256 `d6ec107a038fec7b53e6fcc2ebc0a7902d1991be252180a23fc9a0db407ea287`, runtime-evidence SHA-256 `1292fe3524a74fa1f59450777b55a07f881f8818449ec5d27c827768bd68afa5`, Node `v24.19.0`, ELF64 x86-64 native modules, compiled first migration 18, and redeploy migration count 0.
- The first locally prepared package was rejected in isolated rehearsal because Windows CRLF migration bytes did not match production checksums. No live mutation occurred from that package. The corrected package was rebuilt from exact Git LF blobs, independently verified on Linux, and only that corrected package was staged/deployed.
- Created fresh backup `academiccloud-pre-prod07a-20260818T135032Z.sqlite` (548,864 bytes; SHA-256 `b7abaa36355c40c88ab539b2a59e32c20f130539146246c33bd66a6b21579911`), receipt SHA-256 `95ed7830d2dbb565c1b5222191bec63d920ba44635bf118e421c45e99a8092e8`, and age ciphertext `database-pre-prod07a-20260818T135032Z.age` (549,192 bytes; SHA-256 `1fc7de13aa27f64f42d5fb7625486b700c17312526d3949ce164549a2b74296f`). Private off-host backup commit: `7c29aa6a9bc9171db5c235e427a580118220a6e0`.
- Isolated rehearsal used a copy of the fresh v17 backup. Target migration runner returned `{"appliedVersions":[18],"currentVersion":18}`, then `{"appliedVersions":[],"currentVersion":18}`; target backup verification returned schema 18, integrity ok, zero FK violations, and safe aggregate counts accounts 5 / folders 4 / files 32 / sessions 18 / invitations 5 / announcements 1.
- Live cutover stopped the old service, atomically selected the target release, applied only migration 018, verified the live database, and restarted the service. Rollback was not used.
- Final live evidence: current target exact; schema 18/history 001–018; integrity ok; FK violations 0; default Library 1; active memberships 3; active Library holdings 28; canonical metadata rows 0; authority rows 0; metadata-fallback holdings 28; service active with autostart disabled and NRestarts 0; loopback-only API; health/readiness 200.
- Public focused checks: deployed index/JS/CSS bytes matched the target release; unauthenticated catalogue and Library-recycle routes returned 401; suggestion route returned 404; served release scan contained no suggestion/bibliographic/title-recognition residue. Existing changed-risk backend/frontend tests cover Preview/Download, Favorites privacy, Library Recycle authority, Member metadata denial, normal details, filename separation, and fallback behavior without creating production resources.

## Remaining

None inside PROD-07A.

## Blockers

None. The initial CRLF artifact was rejected before live mutation and replaced with the Git-byte-correct artifact. No rollback was needed.

## Last Verification

2026-08-18: exact target release active; migration 018 applied once; schema v18/history 001–018; integrity ok; FK zero; health/readiness green; public asset hashes exact; Library/fallback aggregate evidence green; suggestion residue scan clean; fresh backup and off-host commit verified.

## Next Action

STOP after this production deployment for independent Owner/ChatGPT review. Do not begin another production or repository task, RF-SEARCH01, OCR/RAG, permanent deletion, cleanup, infrastructure change, or main merge from this deployment session.
