## Task ID

PROD-03C1 — Public HTTPS/Nginx Edge Cutover and Minimum Machine Verification

## Goal

Enable the reviewed public HTTPS/Nginx edge for `cloud.ajtlab.top` (the exact prepared AcademicCloud site on the existing TLS certificate) and complete its minimum machine verification over the public HTTPS path — only after the durable encrypted off-host backup/restore gate and this task's independent review pass — while keeping rollback to the current loopback-only state immediate and safe.

## Scope

- recover the synchronized PROD-03B completion checkpoint, exact release/unit/environment/database/account identities, and the loopback-ready host baseline before any change
- first honor the durable pre-cutover gate recorded in the PROD-03C backlog: complete an encrypted off-host backup and isolated restore rehearsal of the production database and environment (destination, key custody, and any new cost remain Owner gates); the public route is enabled only after that gate passes
- render the exact prepared `deployment/nginx/academiccloud.conf` and `academiccloud-security-headers.conf` into the active Nginx tree, run `nginx -t`, and reload Nginx atomically; keep the prior default-only tree and listener state recorded for rollback
- verify the public HTTPS path with minimum machine checks: exact hostname/TLS chain, HTTP→HTTPS behavior, security headers, static asset serving, `/api/health` and `/api/ready` through the edge, login/session over HTTPS, and the approved browser CORS/upload preflight boundary unchanged
- keep the systemd unit unchanged (still disabled-but-active, loopback-only backend), measure whole-host memory/swap and cgroup/kernel OOM evidence during the HTTPS verification, and confirm no secret, cookie, or signed URL enters chat, Git, logs, or evidence
- define and record the exact rollback (remove the active site, reload Nginx, verify loopback state) and stop before any live OSS object acceptance, permanent deletion, or renewal activation

## Non-goals

- live OSS object upload/download/delete, browser E2E with real production material, permanent deletion, or bucket deletion (later PROD-03C steps)
- certificate renewal activation, firewall/security-group changes, DNS changes, or any new paid resource
- changing the systemd unit, SQLite durability, Argon2id parameters, TLS verification, or any accepted hardening boundary
- Layer 2, OCR, RAG, AI, connectors, mobile, desktop sync, or architecture expansion

## Acceptance Criteria

- [ ] repository/Git/GitHub and the loopback-ready host baseline pass a read-only preflight before the first task write
- [ ] the durable encrypted off-host backup and isolated restore gate passes before the public route is enabled, or the task stops at that Owner gate without cutover
- [ ] independent read-only Reviewer approves the exact edge files, Nginx procedure, verification plan, and rollback behavior before the active Nginx tree is changed
- [ ] `nginx -t` passes, the active tree contains exactly the reviewed AcademicCloud site, and the service/host/OSS/CORS state is otherwise unchanged
- [ ] public HTTPS checks pass: exact certificate chain/hostname, HTTP→HTTPS handling, security headers, static assets, `/api/health`/`/api/ready`, and one real login/session round trip without exposing credentials or cookies
- [ ] whole-host memory/swap headroom and cgroup/kernel OOM evidence remain zero during the HTTPS verification
- [ ] exact rollback instructions and pre-change Nginx/unit/listener records are retained and the task remains fully reversible
- [ ] applicable syntax/diff/secret checks and independent read-only review pass
- [ ] durable state is updated, the task card moves to `tasks/done/`, a clean task-level commit is pushed through strict SSH, and local/private GitHub refs plus the connected default branch match

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `deployment/nginx/academiccloud.conf`
- `deployment/nginx/academiccloud-security-headers.conf`
- `deployment/systemd/academiccloud.service`
- `docs/deployment/production-runbook.md`
- `docs/deployment/oss-deployment-checklist.md`
- `docs/deployment/backup-recovery.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/doing/PROD-03C1.md`

## Current State

Ready — not started. PROD-03B completed at phase `loopback-ready` on the synchronized checkpoint `227523d`. The prepared edge files remain root-only outside the active Nginx tree; Nginx serves only its default site; the backend is loopback-only on `127.0.0.1:3000`. This task must not begin until its completion checkpoint is merged and its own mandatory review/cutover boundary is reached.

## Completed

None yet.

## Remaining

- Execute the full bounded scope above.

## Blockers

None for planning. The encrypted off-host backup/restore destination, key custody, and any new cost remain PROD-03C Owner gates and are a mandatory precondition before the public route is enabled.

## Last Verification

Not started. Repository state at creation: `codex/prod-03b` = `origin/codex/prod-03b` = `227523d`; production phase `loopback-ready`; service disabled-but-active loopback-only; Nginx default-only; certificate valid for `cloud.ajtlab.top`.

## Next Action

Wait for the PROD-03B completion checkpoint to be merged and synchronized before selecting this task.
