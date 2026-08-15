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

- [ ] repository/Git/GitHub and the production baseline pass a read-only preflight before the first live action
- [ ] the corrected acceptance tool run records `VERDICT=true` with login/session/logout/revocation statuses and no secret output
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
- `frontend/src/api.ts`, `frontend/src/direct-upload.ts`
- `backend/src/auth/`, `backend/src/drive/`, `backend/src/storage/aliyun/aliyun-oss-adapter.ts`
- `docs/deployment/oss-deployment-checklist.md`
- `docs/deployment/production-runbook.md`
- `docs/deployment/encrypted-backup.md`
- `CURRENT_STATUS.md`, `TASK_BOARD.md`
- `tasks/doing/PROD-03C2.md`

## Current State

Ready — not started. Created by the PROD-03R gap analysis as the single next bounded production task. No live OSS operation has ever been performed; the bucket is empty, private, versioning-disabled, with the exact reviewed CORS rule live.

## Completed

None yet.

## Remaining

- Execute the full bounded scope above.

## Blockers

None for planning. The exact disposable-object permanent-delete confirmation is a mandatory Owner gate reached only after all other E2E checks pass.

## Last Verification

Not started. Created from the PROD-03R gate analysis with classes: A-items 1–4 of that analysis (session acceptance, live disposable-object E2E, permanent-delete Owner gate, reboot/autostart decision).

## Next Action

Wait for the PROD-03R reconciliation checkpoint to be merged and synchronized before selecting this task.
