## Task ID

PROD-02I — Alibaba 1 GiB Runtime Re-Acceptance

## Goal

Prove or reject production runtime suitability of the verified Linux x86_64 / Node.js 24 artifact after the Owner-authorized Alibaba RAM upgrade to the 1 GiB specification, without installing, building, deploying, or contacting live cloud services.

## Scope

- verify that Linux reports the upgraded memory and that systemd, SSH, Nginx, networking, resolver, login, time, and user-manager services are healthy
- confirm all PROD-02H staging, units, processes, listeners, and deployment paths remain absent before any write
- revalidate and reuse verified GitHub artifact `9225471228` for source `639baa9596a17f4160521f31440d9e3ac3b12eda`
- rerun the reviewed private-network, non-privileged transient acceptance harness with unchanged Argon2id, SQLite, systemd, and 128 MiB headroom gates
- complete SQLite, Argon2id, native ELF64 x86-64, and compiled runtime acceptance from the artifact
- record whole-host memory, swap, cgroup peak/events, kernel OOM evidence, timing, and pre/post host state
- retrieve non-secret evidence, remove the exact task-owned stage, and verify host recovery

## Non-goals

- `npm ci`, `npm install`, `node-gyp`, native compilation, TypeScript/Vite build, Docker, or package installation on Alibaba
- changing Argon2id parameters/concurrency, SQLite durability, systemd hardening, memory limits, or accepted architecture
- installing or deploying AcademicCloud, creating production users/configuration/data, or changing `/opt`, `/etc`, or `/var/lib` deployment state
- live OSS, DNS, TLS, firewall, credentials, public traffic, production data, cutover, or irreversible operations
- any additional paid-resource change beyond the already completed Owner-authorized RAM upgrade
- Layer 2 or Layer 3 work

## Acceptance Criteria

- [x] Linux reports the upgraded 1 GiB-class memory and all required base services, listeners, Nginx hash, cleanup state, deployment absence, and unchanged mounted root filesystem pass read-only preflight
- [x] the exact non-expired GitHub artifact, ZIP SHA-256, archive checksum, manifest, verifier, and source identity match locally and on Alibaba
- [x] Alibaba remains Ubuntu 24.04 x86_64 with Node.js 24.x and no on-server npm/install/build/native compilation is run
- [x] the unchanged artifact verifier completes successfully under `nobody:nogroup`, `PrivateNetwork=yes`, and the reviewed 320/384 MiB cgroup bounds
- [x] better-sqlite3 executes SQLite operations, Argon2id `m=65536,t=3,p=1` hashes/verifies, both approved native modules are ELF64 x86-64, and compiled acceptance passes
- [x] minimum whole-host `MemAvailable` remains at least 128 MiB, swap is not exhausted, cgroup/kernel OOM evidence is zero, and timing/resource evidence is retained
- [x] all task-owned credentials/data/processes/listeners/unit/staging are removed and post-run system/service/deployment state is healthy and unchanged
- [x] no live OSS, DNS/TLS, production data, credential, live-host configuration, cutover, Layer 2, or additional paid-resource change occurs
- [x] applicable checks, targeted secret scan, diff review, and independent read-only review pass
- [x] final local/private GitHub `main` match, worktree is clean, and no future task starts automatically

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- The Owner authorized only the completed RAM upgrade; runtime acceptance must retain the accepted security and durability boundaries.

## Relevant Modules / Files

- `scripts/alibaba-runtime-acceptance.sh`
- `scripts/production-artifact.mjs`
- `deployment/systemd/academiccloud.service`
- `backend/scripts/compiled-acceptance.mjs`
- `docs/deployment/layer1-acceptance.md`
- `docs/deployment/production-runbook.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/done/PROD-02I.md`

## Current State

Complete — Accepted for runtime on the upgraded host. Started from clean local/private GitHub `main` at `3dbc919b0ec168a6d89d575bc32ee9bda6f1a512` on branch `codex/prod-02i`. The Owner reports the RAM upgrade complete; Linux exposes `916,044 KiB` `MemTotal`. Exact artifact `9225471228` passed the unchanged formal runtime/compiled acceptance, resource gates passed without OOM, evidence was retrieved, the exact task stage was removed, and host health/deployment absence remained intact. Production is still closed.

## Completed

- Recovered repository, Git/GitHub, PROD-02H, ADR, deployment, harness, and artifact state from durable/current sources.
- Completed the required read-only post-upgrade host health, cleanup, deployment-absence, memory, swap, and OOM preflight.
- Confirmed the task can reuse the corrected verified artifact and unchanged acceptance method; no new build or host installation is needed.
- Passed independent read-only task-boundary, pre-write, exact-command, evidence, and cleanup review.
- Transferred only the verified ZIP and reviewed harness into `/var/tmp/academiccloud-prod02h-nsRTSg2p`; the legacy prefix is the unchanged harness safety namespace, not a stale PROD-02H stage.
- Passed artifact identity, archive/manifest/verifier, SQLite `3.53.4`, Argon2id `m=65536,t=3,p=1`, exact native ELF64 x86-64, and full compiled runtime acceptance under the unchanged systemd boundaries.
- Recorded 233 samples: minimum `MemAvailable=393,396 KiB`, minimum `SwapFree=1,048,572 KiB`, cgroup peak `241,455,104` bytes, and zero cgroup/kernel OOM evidence.
- Matched remote/local evidence SHA-256 `ac1de4bf4881d84e869138f3c14ab4ef7ba943b80a7121c7891e7dec0dc7a518`, then precisely removed the validated stage and confirmed healthy unchanged post-cleanup host state with no deployment residue.
- Performed no Alibaba npm/install/build/native compilation, deployment, live OSS/DNS/TLS/credential/production-data action, mounted-root resize, or additional paid-resource change.

## Remaining

None.

## Blockers

None.

## Last Verification

2026-08-15: strict SSH preflight/post-cleanup checks confirmed Ubuntu 24.04 x86_64, Node `v24.19.0`, npm `11.17.0`, two CPUs, unchanged hostname/IP, `MemTotal=916,044 KiB`, `SwapFree=1,048,572 KiB`, systemd `running`, zero failed units, all required services active, Nginx aggregate `cb5d4fbec0712ab7911dbd4973ca42b3305852d91da33d739e530099dd13670c`, unchanged listeners, 30 GiB block device with unchanged approximately 20 GiB mounted root, no acceptance/deployment residue, and no current-boot OOM. Artifact `9225471228`, source `639baa9596a17f4160521f31440d9e3ac3b12eda`, ZIP `6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe`, archive `0985f32c9ed063d3d9e37a97f3f7c80fab4235dbf13e59fe2b67dafb318254f9`, and verifier identity matched. Formal acceptance passed with minimum `MemAvailable=393,396 KiB`, minimum `SwapFree=1,048,572 KiB`, cgroup peak `241,455,104` bytes, zero OOM evidence, and complete SQLite/Argon2/native/compiled results. Remote/local evidence bundle SHA-256 is `ac1de4bf4881d84e869138f3c14ab4ef7ba943b80a7121c7891e7dec0dc7a518`.

## Next Action

Stop. Do not create or start another task automatically; runtime acceptance does not authorize deployment, live OSS, DNS/TLS, backup, cutover, another resource change, or Layer 2.
