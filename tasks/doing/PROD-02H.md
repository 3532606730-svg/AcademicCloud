## Task ID

PROD-02H — Alibaba Runtime-Only Acceptance

## Goal

Prove or reject runtime suitability of the verified Linux x86_64 / Node.js 24 production artifact on the existing Alibaba host without installing, building, deploying, or contacting live cloud services.

## Scope

- revalidate the retained final-main GitHub artifact and its SHA-256/manifest/runtime evidence before transfer
- transfer only the verified bundle and task-owned acceptance tooling to an isolated temporary host directory
- verify the target OS, architecture, Node.js 24 runtime, bundle checksum, archive policy, better-sqlite3, Argon2id, and compiled acceptance directly from the artifact
- run acceptance under a temporary least-privilege, private-network boundary with random temporary credentials and SQLite data
- measure total-system memory headroom, swap behavior, process cleanup, listener state, and OOM evidence during representative runtime operations
- retrieve non-secret evidence locally, remove all task-owned host files/processes, and confirm no deployment state changed
- use the existing production SSH credential without creating, rotating, or modifying credentials

## Non-goals

- `npm ci`, `npm install`, `node-gyp`, native compilation, TypeScript/Vite build, Docker, or package installation on Alibaba
- installing a release, changing `/opt/academiccloud`, creating a production user/config/database, or starting/enabling AcademicCloud
- changing Nginx, systemd units, firewall, DNS, TLS, RAM/OSS configuration, credentials, or cloud resources
- real OSS requests, production data, account provisioning, public traffic, production cutover, or destructive operations
- Layer 2 or Layer 3 work

## Acceptance Criteria

- [ ] the exact final-main artifact is revalidated locally and on Alibaba before extraction
- [ ] Alibaba remains Ubuntu 24.04 x86_64 with Node.js 24.x and no on-server npm/build/install is run
- [ ] the artifact verifier passes on Alibaba from a private-network, least-privilege transient execution boundary
- [ ] better-sqlite3 executes SQLite operations, Argon2id hashes/verifies, both approved native modules are ELF64 x86-64, and compiled acceptance passes from the extracted artifact
- [ ] representative acceptance records total-system `MemAvailable`, swap, cgroup, timing, and OOM evidence; runtime suitability is accepted only if at least 128 MiB remains with no OOM kill or swap exhaustion
- [ ] all temporary credentials, databases, processes, listeners, transient units, and task-owned host files are removed after evidence retrieval
- [ ] AcademicCloud remains undeployed; Nginx, systemd configuration, firewall, OSS, DNS/TLS, production data, and existing credentials remain unchanged
- [ ] applicable local checks, targeted secret scan, diff review, and independent read-only review pass
- [ ] final local/private GitHub `main` match, worktree is clean, added cost is 0 RMB, and no future task or Layer 2 work starts

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- No architecture change is authorized; a failed memory gate must be recorded rather than weakening durability or security.

## Relevant Modules / Files

- `scripts/production-artifact.mjs`
- `scripts/alibaba-runtime-acceptance.sh`
- `backend/scripts/compiled-acceptance.mjs`
- `backend/scripts/password-benchmark.ts`
- `deployment/systemd/academiccloud.service`
- `backend/test/deployment/artifacts.test.ts`
- `docs/deployment/layer1-acceptance.md`
- `docs/deployment/production-runbook.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/doing/PROD-02H.md`

## Current State

Started from clean local and private GitHub `main` at `82b088c0e0e9ed4a6eceb4401679aa43ec6b4c9a` on branch `codex/prod-02h`. Final-main Actions run `31813055501` and artifact `9223908043` passed build and fresh-runner verification. Alibaba attempt 1 verified the exact artifact identity but rejected runtime suitability: compiled acceptance could not start the API and minimum whole-host `MemAvailable` fell to 45,324 KiB, below the 128 MiB gate. A diagnostic-only repeat traced the API failure to the production systemd address-family allowlist omitting `AF_NETLINK`; the repository unit, exact test, and runtime harness are now corrected, but a new artifact must be built and verified before the final host repeat. AcademicCloud remains undeployed.

## Completed

- Recovered the Ready task, Git state, artifact evidence, relevant ADRs, production runbook, compiled acceptance behavior, and existing SSH alias from durable/current sources.
- Confirmed this task may use the existing production SSH identity but may not create or modify credentials or system-security policy.
- Revalidated artifact `9223908043` locally and on Alibaba, including ZIP/source/archive/manifest/verifier identity, under a task-owned `/var/tmp` stage.
- Ran the original private-network acceptance and recorded a valid failed resource/runtime report: 45,324 KiB minimum `MemAvailable`, 1,048,572 KiB minimum `SwapFree`, 152,236,032-byte cgroup peak, no cgroup/kernel OOM, and identical pre/post host state.
- Ran one diagnostic-only repeat under the same isolation and limits. It showed `ali-oss` module initialization calling `os.networkInterfaces()` and failing with `EAFNOSUPPORT` because `AF_NETLINK` was absent; no live OSS request was possible or made.
- Corrected the production unit, exact deployment test, and acceptance harness to allow `AF_NETLINK` while retaining `PrivateNetwork=yes`; the targeted deployment test passes 3/3.
- Retrieved non-secret attempt evidence locally and removed every task-owned staging directory; the transient unit is absent, deployment paths remain absent, Nginx remains active/enabled, and listeners remain unchanged.

## Remaining

- Commit and push the deployment fix, run a new GitHub Linux production build, and independently verify/download its immutable artifact.
- Repeat the original (non-diagnostic) Alibaba acceptance with the new exact artifact, retrieve evidence, and clean the task-owned stage.
- Complete independent review, durable records, Git checkpoint, SSH push, and final equality checks.

## Blockers

No execution blocker. Production runtime suitability remains unaccepted unless the rebuilt artifact completes runtime verification and retains at least 128 MiB whole-host `MemAvailable`.

## Last Verification

2026-08-14: targeted deployment artifact tests pass 3/3 and remote `bash -n` passes for the harness. Attempt 1 and diagnostic reports are retained under ignored local `output/prod-02h-evidence/`; all Alibaba staging paths are absent, the transient unit is `not-found`, `/opt/academiccloud`, `/etc/academiccloud`, and `/var/lib/academiccloud` remain absent, Nginx is active/enabled, and existing listeners remain unchanged.

## Next Action

Create and push the focused deployment-fix checkpoint, dispatch the Linux production build on its exact commit, and use only the resulting verified artifact for the final Alibaba repeat.
