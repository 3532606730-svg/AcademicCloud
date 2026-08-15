## Task ID

PROD-03R — Production Acceptance and Repository-State Reconciliation

## Goal

Reconcile the actual application contracts, production acceptance tooling, completed PROD-03C1 evidence, and repository durable state into one coherent truth — without mutating production infrastructure, application behavior, or production data.

## Scope

- recover repository truth from `main` at `e16682876c6d25261bdce0342784d9fe84959f2d` and freeze production
- audit the complete authentication contract (frontend client, backend routes, tests, Nginx edge, ADR-009, completed evidence, and the external acceptance harness) field-by-field
- determine the exact cause of the observed `logout_status=415` / `revoked_session_status=200`
- replace the out-of-repository acceptance harness with the smallest repository-owned, reviewed acceptance mechanism that mirrors the real HTTP contract and handles secrets safely
- audit and reconcile all living durable-state documents (AGENTS.md, workflow SKILL.md, CURRENT_STATUS.md, TASK_BOARD.md, production-runbook.md, PROD-03C1 done card, applicable docs) — historical checkpoint facts are preserved as history, never rewritten
- classify the complete remaining First Usable Production boundary into A (required before reliable First Usable), B (shortly after as operational hardening), C (deliberately deferred/non-goal)
- create the ONE next bounded task card determined by that gap analysis
- run applicable tests/checks and an independent read-only review of the reconciliation diff
- stop before any live production action

## Non-goals

- production application behavior changes, Nginx/systemd changes on the host, restarts, OSS operations, TLS/DNS/firewall changes, credential changes, or production-data mutation
- live OSS E2E, permanent deletion, certificate renewal activation, or Layer 2/3 work
- rewriting historical evidence or historical decisions

## Acceptance Criteria

- [x] repository recovered at `main` = `e16682876c6d25261bdce0342784d9fe84959f2d`; no production mutation
- [x] exact root cause of the 415 established from the complete request contract with production wire evidence
- [x] production logout code defect determined: NOT defective (browser-shape request returns 204; backend tests pin the contract)
- [x] the old external harness defect determined: DEFECTIVE (PowerShell 5.1 `Invoke-WebRequest` injects `Content-Type: application/x-www-form-urlencoded` on body-less POSTs; Fastify has no urlencoded parser and answers 415)
- [x] repository-owned acceptance tooling added (`scripts/production-https-acceptance.mjs`, Node fetch semantics mirroring `frontend/src/api.ts`, muted secret input, non-secret status/boolean output only) and a frontend contract test pins the body-less no-Content-Type logout shape
- [x] durable-state contradictions reconciled (living docs only; historical facts preserved)
- [x] complete remaining First Usable Production gate list with A/B/C classification recorded
- [x] the next bounded task card created from the gap analysis
- [x] applicable tests/checks pass (`node --check`, frontend tests 23/23, `git diff --check`, secret scan) and the independent read-only review passes
- [x] a clean task-level commit is pushed through strict SSH

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `frontend/src/api.ts`, `frontend/src/api.test.ts`
- `backend/src/auth/http.ts`, `backend/src/platform/app.ts`, `backend/test/auth/auth-http.test.ts`
- `scripts/production-https-acceptance.mjs`
- `deployment/nginx/academiccloud.conf`
- `AGENTS.md`, `.agents/skills/academiccloud-workflow/SKILL.md`
- `CURRENT_STATUS.md`, `TASK_BOARD.md`, `README.md`
- `docs/deployment/production-runbook.md`
- `tasks/done/PROD-03C1.md`
- `tasks/doing/PROD-03R.md`, `tasks/ready/PROD-03C2.md`

## Current State

In progress on `codex/prod-03r` from `e16682876c6d25261bdce0342784d9fe84959f2d`. Production is frozen: no host mutation was performed; the only network probes were read-only (no-cookie requests and the Owner's own harness run).

## Completed

- Recovered `main` at `e16682876c6d25261bdce0342784d9fe84959f2d` and created the bounded task branch.
- Audited the complete authentication contract: `frontend/src/api.ts` `logout()` issues `POST /api/auth/logout` with only `Accept` (no Content-Type, no body); `backend/src/auth/http.ts` logout has no body schema and no guard and returns 204; backend tests pin this shape; the login route's `preValidation` and the drive routes' `requireJson` are the application-level 415 sources; Fastify registers no urlencoded content-type parser, so the harness's injected urlencoded Content-Type was rejected by the content-type-parser layer with 415.
- Reproduced the harness wire shape with a local echo server: PowerShell 5.1 `Invoke-WebRequest` sends `Content-Type: application/x-www-form-urlencoded` (Content-Length 0) on every body-less POST.
- Proved the production behavior read-only with Origin-bearing no-cookie requests: browser-shape logout → `204`; urlencoded-shape logout → `415`; text/plain → `204`. The harness's 415 therefore came from the injected urlencoded content type, the logout never executed, and the session remained valid (`revoked_session_status=200`). Production logout is NOT defective.
- Added the repository-owned acceptance tool `scripts/production-https-acceptance.mjs` (Node 24 fetch, exact `api.ts` semantics, explicit cookie handling, muted password prompt, status/boolean output only) and pinned the logout contract in `frontend/src/api.test.ts`.
- Audited all living durable-state documents for stale pre-PROD-03C1 statements and reconciled them (see Last Verification).

## Remaining

- Complete the independent read-only review of the reconciliation diff.
- Commit and push the reconciliation checkpoint; stop before any live production action.

## Blockers

None.

## Last Verification

2026-08-15 (Phase B wire evidence): production `POST /api/auth/logout` with `Origin` and no Content-Type returns `204`; with `Origin` plus `application/x-www-form-urlencoded` and `Content-Length: 0` returns `415`; with `Origin` plus `text/plain` returns `204`. Frontend tests 23/23 pass including the new logout contract pin; `node --check` passes on the acceptance tool; `git diff --check` and the secret scan are clean.

## First Usable Production gate list (Phase E)

Class A — required before reliable First Usable Production:
1. One real authenticated HTTPS login/session/logout/revocation run with the corrected repository-owned tool (`scripts/production-https-acceptance.mjs`) — the Owner runs it once with hidden local input; the old harness defect made the previous run incomplete.
2. Live browser/API E2E with pre-registered disposable objects: upload → provider verification/activation → listing → signed download + independent byte/hash verification → rename/move → recycle → restore (Layer 1 acceptance coverage).
3. The exact disposable-object permanent-delete confirmation (Owner gate; irreversible, requires the pre-registered file ID, checksum, and test prefix).
4. Host reboot/autostart behavior: the service unit is `disabled`, so a host reboot leaves the site down until manual start; decide with the Owner and verify autostart (or an explicitly accepted manual-start procedure).

Class B — shortly after First Usable as operational hardening:
- backup cadence/retention (currently one manual generation; document a regular manual cadence first, then automation)
- certificate renewal/reload automation — hard deadline before 2026-11-13 (current cert expiry)
- HSTS enablement after renewal and rollback are proven (runbook step 9)
- production-format destructive restore drill in an approved maintenance window
- second disposable account and live cross-account isolation check (Owner decision)
- journal size/retention tuning for the 20 GB disk

Class C — deliberately deferred/non-goal:
- OSS object-level backup/replication (future cost/security decision; versioning stays disabled)
- Layer 2/3, OCR, RAG, connectors, mobile, desktop sync

## Next Action

Finish the independent review and push the reconciliation checkpoint; then start `PROD-03C2` (Ready) with the Owner's one-time acceptance-tool run and the live disposable-object E2E boundary.
