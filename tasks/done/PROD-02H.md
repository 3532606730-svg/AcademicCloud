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

- [x] the exact corrected GitHub artifact is revalidated locally and on Alibaba before extraction
- [x] Alibaba remains Ubuntu 24.04 x86_64 with Node.js 24.x and no on-server npm/build/install is run
- [x] the artifact verifier is executed from a private-network, least-privilege transient boundary and its exact failed outcome is captured; runtime suitability is accepted only if the verifier passes
- [x] GitHub build and fresh-runner evidence validates better-sqlite3, Argon2id, both ELF64 x86-64 native modules, and compiled acceptance; the Alibaba full verifier/compiled acceptance non-completion is explicitly recorded as a host rejection
- [x] representative acceptance records total-system `MemAvailable`, swap, cgroup, timing, and OOM evidence; runtime suitability is rejected because only 38,992 KiB remained and OOM occurred
- [x] all temporary credentials, databases, processes, listeners, transient units, and task-owned host files are removed after evidence retrieval
- [x] AcademicCloud remains undeployed; live-host Nginx/systemd configuration, firewall, OSS, DNS/TLS, production data, and existing credentials remain unchanged
- [x] applicable local checks, targeted secret scan, diff review, and independent read-only review pass
- [x] final local/private GitHub `main` match, worktree is clean, added cost is 0 RMB, and no future task or Layer 2 work starts

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
- `tasks/done/PROD-02H.md`

## Current State

Complete with an executed-and-rejected result. The corrected GitHub artifact is valid, but the current approximately 407 MiB Alibaba host cannot sustain the production security/durability workload while retaining the mandatory 128 MiB whole-host headroom. Production remains closed and AcademicCloud remains undeployed.

## Completed

- Recovered the Ready task, Git state, artifact evidence, relevant ADRs, production runbook, compiled acceptance behavior, and existing SSH alias from durable/current sources.
- Confirmed this task may use the existing production SSH identity but may not create or modify credentials or system-security policy.
- Revalidated artifact `9223908043` locally and on Alibaba, including ZIP/source/archive/manifest/verifier identity, under a task-owned `/var/tmp` stage.
- Ran the original private-network acceptance and recorded a valid failed resource/runtime report: 45,324 KiB minimum `MemAvailable`, 1,048,572 KiB minimum `SwapFree`, 152,236,032-byte cgroup peak, no cgroup/kernel OOM, and identical pre/post host state.
- Ran one diagnostic-only repeat under the same isolation and limits. It showed `ali-oss` module initialization calling `os.networkInterfaces()` and failing with `EAFNOSUPPORT` because `AF_NETLINK` was absent; no live OSS request was possible or made.
- Corrected the production unit, exact deployment test, and acceptance harness to allow `AF_NETLINK` while retaining `PrivateNetwork=yes`; the targeted deployment test passes 3/3.
- Retrieved non-secret attempt evidence locally and removed every task-owned staging directory; the transient unit is absent, deployment paths remain absent, Nginx remains active/enabled, and listeners remain unchanged.
- Committed and pushed the production unit correction, then ran the real GitHub Actions Linux build `31817102343`; both jobs passed for source `639baa9596a17f4160521f31440d9e3ac3b12eda` and artifact `9225471228`.
- Revalidated ZIP SHA-256 `6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe`, archive SHA-256 `0985f32c9ed063d3d9e37a97f3f7c80fab4235dbf13e59fe2b67dafb318254f9`, the 4,619-file manifest, corrected unit, runtime evidence, and fresh-runner result before transfer.
- Ran the corrected exact artifact through the original non-diagnostic Alibaba harness. It recorded 367 samples, 38,992 KiB minimum `MemAvailable`, 1,048,572 KiB minimum `SwapFree`, a 151,027,712-byte cgroup peak, one cgroup OOM kill, and kernel-confirmed global OOM; full verifier evidence was not produced.
- Preserved the final evidence bundle locally with SHA-256 `01e10bfe7d84f883e1e0b67bbcdfd57e6b4bb7d768de7551731551ec161fa5d5`, then removed the exact remote stage.
- Verified recovery: systemd overall `running`, zero failed units, all critical services active, no later OOM, unchanged Nginx aggregate/listeners, no acceptance unit/stage/deployment paths, and no application deployment.

## Remaining

None.

## Blockers

None for task completion. Production progression is blocked by the rejected host capacity; any paid RAM/server change requires an explicit Owner decision.

## Last Verification

2026-08-15: run `31817102343` and both jobs passed; artifact `9225471228` identity and contents passed local/Reviewer checks. The exact Alibaba run failed the 128 MiB gate with global OOM. Final evidence and cleanup/recovery passed independent read-only review: system state `running`, zero failed units, critical services active, Nginx hash `cb5d4fbec0712ab7911dbd4973ca42b3305852d91da33d739e530099dd13670c`, listeners unchanged, no later OOM, no acceptance unit/stage/deployment path, and 0 RMB added cost.

## Next Action

Stop. Do not create a capacity-change task, retry pressure acceptance, or enter OSS/DNS/TLS/cutover/Layer 2 unless the Owner explicitly authorizes the mandatory real-cost boundary.
