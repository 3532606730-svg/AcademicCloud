## Task ID

PROD-03C2 — Live Disposable-Object E2E and First-Usable Production Gates

## Goal

Complete the remaining Class-A live gates to reliable First Usable Production: one real authenticated HTTPS login/session/logout/revocation run with the corrected repository-owned acceptance tool, the live browser/API E2E over pre-registered disposable objects (upload, provider verification/activation, listing, signed download with independent byte/hash verification, rename/move, recycle, restore), and the exact disposable-object permanent-delete Owner confirmation — without touching any existing production material.

## Scope

- recover the synchronized PROD-03R reconciliation checkpoint and the loopback-ready/public-edge baseline before any change
- Owner runs `node scripts/production-https-acceptance.mjs` once locally (hidden password prompt; only non-secret status/boolean output) and the recorded output must show `VERDICT=true`
- pre-register a unique disposable acceptance prefix, logical file IDs, expected sizes/types/checksums, operator, and time window; every object is newly created for this acceptance run and contains no academic or production data
- through the public HTTPS edge: create folders, upload small PDF/PNG/UTF-8-text/binary via the exact browser-direct multipart flow, verify provider metadata and activation, list active and pending entries, signed download with independent SHA-256 comparison, rename/move, soft delete to recycle, restore, and confirm exact object references
- stop at the exact disposable-object permanent-delete Owner confirmation naming the pre-registered file ID, object checksum, and test prefix; permanent deletion proceeds only on that exact newly created object from recycle state and reaches `purged` only after exact verification
- measure memory/swap/cgroup/kernel OOM evidence during the E2E and confirm the backend remains loopback-only and the OSS CORS boundary unchanged
- decide the host reboot/autostart question with the Owner (enable the unit with the exact reviewed procedure, or record an explicitly accepted manual-start procedure) and verify the chosen behavior
- update durable state, move the card to `tasks/done/`, and push a clean checkpoint

## Non-goals

- touching existing production objects, folders, accounts, or data
- any permanent deletion beyond the single pre-registered disposable acceptance object with the exact Owner confirmation
- certificate renewal activation, DNS/firewall/security-group changes, or any new paid resource
- changing Argon2id, SQLite durability, systemd hardening, TLS verification, or owner isolation
- Layer 2/3, OCR, RAG, connectors, mobile, desktop sync

## Acceptance Criteria

- [x] repository/Git/GitHub and the production baseline pass a read-only preflight before the first live action
- [x] the corrected acceptance tool run records `VERDICT=true` with login/session/logout/revocation statuses and no secret output
- [ ] every live object is pre-registered, newly created, disposable, and verified against the pre-registered checksum/type/size; no existing object is touched
- [ ] upload/activation/listing/signed-download/rename/move/recycle/restore pass through the public HTTPS edge with independent byte/hash verification
- [ ] the exact disposable-object permanent-delete Owner confirmation is obtained before that deletion, and only that exact object is deleted
- [ ] whole-host memory/swap headroom and cgroup/kernel OOM evidence remain zero; the backend stays loopback-only and the CORS boundary unchanged
- [ ] the reboot/autostart decision is recorded and verified (or explicitly accepted as manual)
- [ ] applicable tests/checks, secret scan, diff review, and independent read-only review pass
- [ ] durable state is updated, the card moves to `tasks/done/`, a clean commit is pushed through strict SSH, and local/private GitHub refs match

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `scripts/production-https-acceptance.mjs`
- `scripts/production-e2e-acceptance.mjs`
- `frontend/src/api.ts`, `frontend/src/direct-upload.ts`
- `backend/src/auth/`, `backend/src/drive/`, `backend/src/storage/aliyun/aliyun-oss-adapter.ts`
- `docs/deployment/oss-deployment-checklist.md`
- `docs/deployment/production-runbook.md`
- `docs/deployment/encrypted-backup.md`
- `CURRENT_STATUS.md`, `TASK_BOARD.md`
- `tasks/doing/PROD-03C2.md`

## Current State

In progress on `codex/prod-03c2` from the synchronized PROD-03R checkpoint `fd0cd13f4c4c492ba27193b3e3d571e4a4a8138d`. Gate 1 PASS: the Owner ran the repository-owned `scripts/production-https-acceptance.mjs` with the real production account and obtained `VERDICT=true` (login `200` match, session `200` match, logout `204` with `Max-Age=0`, revoked session `401`, cookie name/secure/httpOnly/sameSite/path/domain checks all true). Read-only preflight passed: phase `loopback-ready`, service disabled-but-active `MainPID=34558` on exactly `127.0.0.1:3000` (health/ready `200`), Nginx `academiccloud` only, public HTTPS `200`, environment/database identities unchanged, both encrypted backup artifacts present, certificate valid beyond 30 days, `MemAvailable=517,220 KiB`, swap intact, kernel OOM `0`, zero failed units, exactly one account. The E2E tooling is committed; the Owner run is the next mandatory step.

## Completed

- Recorded Gate 1 (authenticated HTTPS session acceptance) as PASS with the Owner's non-secret output.
- Completed the read-only preflight above.
- Added `scripts/production-e2e-acceptance.mjs` (deterministic disposable payloads, exact `api.ts`/`direct-upload.ts` request semantics, hidden credential entry, non-secret status/hash output only, never permanently deletes) with `--plan` pre-registration mode.
- Corrected the E2E tool after an independent repository audit found contract defects against `backend/src/drive/http.ts` and `frontend/src/md5.ts`: folder creation and upload reservation now require `201` (not `200`); the checksum is Base64 MD5 (`^[A-Za-z0-9+/]{22}==$`, mirroring `md5.ts` hex→Base64) instead of hex; the pending-upload listing (`GET /api/drive/uploads`) is now exercised; `logout_status=204`, folder/subfolder `201` statuses, and the pending-listing boolean are now gated into `VERDICT`. Added deterministic contract tests (`scripts/production-e2e-acceptance.test.mjs`, `npm run test:acceptance-tools`) pinning the payload identities, the status-code contract, the `--plan` output, and the absence of any permanent-delete reference; backend suite 88/88 passes.

## Pre-registration record (disposable acceptance objects, operator = Owner, window = single 2026-08-15 run)

Unique prefix `prod03c2-e2e-<runId>-`; every object is newly created by this run and contains no academic or production material. Deterministic payload identities:

- `sample.pdf` — `application/pdf`, 4,096 bytes, md5Base64 `GvL9/U7aoQyRRZXavZXUiw==`, sha256 `72bf1f6f5873dad6afb9cdc121d831d3f23be71e7836e72d4553ff825c830d49`
- `sample.png` — `image/png`, 2,048 bytes, md5Base64 `dcMLvbSMMqsDYPl7G354lg==`, sha256 `8ac1a17273ea8a556144a9fcfe4bd642437888ab082884a7f91798cc8efd0309`
- `sample.txt` — `text/plain`, 512 bytes, md5Base64 `bm0r4c+F742ow8KJleaJdw==`, sha256 `61bcc644615d8948dbe6af96314a2096481426d528e31d340d8e1b5c7f4c263a`
- `sample.bin` — `application/octet-stream`, 8,192 bytes, md5Base64 `alb7C4fKRWh9VXAPF48fmA==`, sha256 `3a06cffa607bd3ecfcb3361b62171ed268224840304cca4e29ef63aeae2199cb`

## Remaining

- Independent read-only review of the E2E tooling before the live run.
- Owner runs `node scripts/production-e2e-acceptance.mjs` once (hidden credential entry) and pastes the non-secret output.
- After the run: host-side memory/swap/cgroup/OOM check, backend loopback-only confirmation, and OSS CORS boundary confirmation.
- Stop at the mandatory Owner gates: the exact disposable-object permanent-delete confirmation and the autostart/enable decision.

## Blockers

None for planning. The Owner's one-time E2E tool run (hidden input), the permanent-delete confirmation, and the autostart decision are mandatory Owner steps reached only at their defined points.

## Last Verification

2026-08-15 (Gate 1 + preflight): session acceptance `VERDICT=true`; preflight facts above; `node --check` passes on both acceptance tools; `--plan` pre-registration table reproduced above.

## Next Action

Wait for the independent read-only review of the E2E tooling, then have the Owner run the tool once and paste the non-secret output; afterwards complete the host-side resource/CORS checks and stop at the permanent-delete and autostart Owner gates.
