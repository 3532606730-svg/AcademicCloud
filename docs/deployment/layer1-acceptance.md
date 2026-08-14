# Layer 1 Acceptance Record

## Deterministic local acceptance

The repository test suite covers the approved Layer 1 success definition:

1. opaque-session authentication and restart persistence;
2. folder creation and browsing;
3. representative PDF reservation with exact MD5/size/type and simulated provider metadata;
4. active listing;
5. owner-authorized attachment and safe inline authorization;
6. metadata-only rename/move with unchanged object key;
7. recycle-bin soft deletion;
8. provider-verified restore;
9. cross-owner 404 isolation and full protected/origin route matrices;
10. persistence restart with unchanged logical metadata and object reference.

Representative deterministic cases include PDF, PNG, UTF-8 text, and ZIP/binary. A local test-only HTTP object store exercises the actual multipart byte path, rejects authorization replay, and verifies downloaded bytes with an independent SHA-256; it never contacts a cloud service. Browser tests cover incremental MD5, multipart policy fields, upload progress/failure/recovery, sessions, navigation, move, preview, recycle/restore/permanent actions, accessibility, and 320 px layout.

The final local gate is:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run acceptance:compiled
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
npm.cmd run auth:benchmark
```

`acceptance:compiled` uses a temporary SQLite database and random local-only credentials to exercise compiled migration, first-account provisioning, two application processes, a session across restart, maintenance dry-run, non-overwriting online backup, isolated restore verification, and repeat migration. Also verify the secret scan, deployment artifact tests, and `git diff --check`.

On the recorded Windows workstation, ordinary `npm ci` reaches npm's implicit
`node-gyp` configuration for `better-sqlite3` and requires the absent Visual
Studio C++ workload even though the pinned package contains a working Windows
prebuild. The reproducible local gate therefore uses `npm ci --ignore-scripts`,
then proves the packaged `better-sqlite3` and Argon2 native modules through the
database suite and benchmark. This exception does not authorize a
production-host install. A real `npm ci --omit=dev` on the approximately
407 MiB Alibaba target was OOM-killed, and system evidence confirmed the
native-install memory failure. Target-host `npm ci`, `node-gyp`, native
compilation, and frontend builds are unsupported. Production dependencies
must instead be built and verified on a compatible Linux/Node 24 GitHub
Actions runner, packaged into a verified artifact, and exercised separately
through Alibaba runtime-only acceptance.

## Recorded Linux production artifact acceptance

`PROD-02G` completed the required non-deploying Linux acceptance in GitHub
Actions run `31812294336` for source commit
`afd46c3db3e36e4d0dc53bc2c66b2cf6e17f89f4`. The GitHub-hosted environment
was Ubuntu 24.04 x86_64, Node.js `v24.19.0`, and npm `11.17.0`.

The build job passed clean `npm ci`, 88 backend tests, 22 frontend tests,
type-check, the production build, compiled acceptance, both dependency audits
with zero vulnerabilities, the Argon2id benchmark, a production-only install,
manifest/archive generation, and extracted-artifact runtime verification. A
second fresh Ubuntu runner downloaded the immutable artifact and repeated the
archive SHA-256, manifest, native-module, SQLite, Argon2id, and compiled
acceptance checks without reinstalling dependencies.

The retained GitHub artifact ID is `9223626582` (seven-day retention, expiring
2026-08-21). Its downloaded ZIP SHA-256 is
`405a2cd2330f1a9294fe277a01d0bee7048b4b5829764af3e27d3aa174c2cf7d`.
The contained release archive SHA-256 is
`fe28ea66b8e4c88888572932c8195ec4bb23c5345f10a7aa9658c3f6ebe9d630`;
the manifest covers 4,619 files and 32,741,380 bytes. Runtime evidence records
SQLite `3.53.4`, successful Argon2id hash/verify, exactly the approved Argon2
and better-sqlite3 ELF64 x86-64 modules, and successful compiled migration,
restart/session, maintenance dry-run, backup/restore, and redeploy acceptance.

This evidence proves that build artifact, not Alibaba runtime capacity or live
deployment. The later `PROD-02H` runtime-only task rebuilt the artifact after a
deployment-unit correction and measured the target separately.

## Recorded Alibaba runtime-only acceptance

`PROD-02H` corrected the production systemd address-family allowlist to include
`AF_NETLINK`, which `ali-oss` needs to enumerate network interfaces during module
initialization. `PrivateNetwork=yes` remained on the transient acceptance unit,
so this correction did not permit a live OSS request. GitHub Actions run
`31817102343` then built source commit
`639baa9596a17f4160521f31440d9e3ac3b12eda`; both the Linux build/runtime job and
fresh-runner artifact download/verification job passed. Artifact `9225471228`
has ZIP SHA-256
`6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe`;
its release archive SHA-256 is
`0985f32c9ed063d3d9e37a97f3f7c80fab4235dbf13e59fe2b67dafb318254f9`.

The exact artifact was then exercised on the Alibaba Ubuntu 24.04 x86-64 host
under a non-privileged, private-network transient unit with `MemoryHigh=320M`
and `MemoryMax=384M`. The formal run recorded 367 resource samples, a
151,027,712-byte cgroup peak, 38,992 KiB minimum whole-host `MemAvailable`, and
1,048,572 KiB minimum `SwapFree`. The kernel recorded a global OOM and killed a
root user-manager process and the acceptance Node process; the cgroup recorded
one OOM kill. The full verifier and compiled acceptance did not complete on the
host. Runtime suitability for that pre-upgrade host state is therefore
**Rejected**, not passed;
this is capacity evidence, not an artifact/native incompatibility finding.

All task-owned staging, transient units, processes, and temporary data were
removed. The host returned to `running` with zero failed units; Nginx, SSH,
networking, resolver, D-Bus, login, time service, listeners, and the Nginx
configuration aggregate remained unchanged. AcademicCloud was not installed or
deployed, no live OSS/DNS/TLS/production data or credential was touched, and
added cost remained 0 RMB. Do not repeat this pressure test at the former host
size. A paid capacity change requires an explicit Owner decision.

## Recorded 1 GiB runtime re-acceptance

The Owner subsequently reported the RAM upgrade complete. Read-only `PROD-02I`
preflight observed Linux `MemTotal=916,044 KiB`, consistent with a 1 GiB-class
cloud specification after platform/kernel reservation, and confirmed systemd,
SSH, Nginx, networking, resolver, login, time, and user-manager health. The
Nginx configuration hash and listeners were unchanged, current-boot OOM evidence
was empty, PROD-02H staging was absent, and AcademicCloud remained undeployed.
The post-upgrade host exposed a 30 GiB block device while the existing mounted root
partition/filesystem remained approximately 20 GiB; PROD-02I did not resize it.
The console transaction and billing amount were not recorded in the repository,
and PROD-02I performed no additional paid-resource action.

The task revalidated and ran the same corrected artifact `9225471228` for source
`639baa9596a17f4160521f31440d9e3ac3b12eda`, with ZIP SHA-256
`6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe`
and archive SHA-256
`0985f32c9ed063d3d9e37a97f3f7c80fab4235dbf13e59fe2b67dafb318254f9`.
The unchanged non-privileged `nobody:nogroup`, `PrivateNetwork=yes` transient
unit retained `MemoryHigh=320M`, `MemoryMax=384M`, and the 128 MiB whole-host
headroom gate. No npm command, package install, build, native compilation, or
deployment ran on Alibaba.

The formal run passed the complete artifact verifier. It executed SQLite
`3.53.4`, Argon2id `m=65536,t=3,p=1` hash/verify, and exactly the approved
Argon2 and better-sqlite3 ELF64 x86-64 native modules. Compiled migration,
login, health/readiness, restart/session persistence, maintenance dry-run,
non-overwriting backup, isolated restore, restored readiness/session, and
redeploy migration all passed. Across 233 samples, minimum whole-host
`MemAvailable` was 393,396 KiB, minimum `SwapFree` was 1,048,572 KiB, and the
observed cgroup peak was 241,455,104 bytes. Cgroup `oom`/`oom_kill` counters and
kernel OOM evidence were zero.

The remote and local evidence bundle SHA-256 matched at
`ac1de4bf4881d84e869138f3c14ab4ef7ba943b80a7121c7891e7dec0dc7a518`.
The exact task stage was then removed. Post-cleanup verification found systemd
`running`, zero failed units, all required services active, unchanged Nginx
hash/listeners, no transient unit/process/stage, no deployment path, and no
current-boot OOM. Upgraded-host runtime suitability is therefore **Accepted**.
This finding does not mean AcademicCloud is deployed or live and does not
authorize OSS, DNS/TLS, credentials, production data, backup, or cutover work.

## Production approval gate

Local acceptance is not evidence of a real Alibaba Cloud deployment. Before production exposure, execute and record the approval-gated steps in the production runbook and OSS checklist:

- verified GitHub Actions Linux/Node 24 production artifact and separate Alibaba runtime-only acceptance, plus Nginx/systemd validation;
- real DNS, certificate issuance/renewal, TLS, redirect, headers, firewall, and loopback listener;
- private bucket/Block Public Access, exact CORS, Versioning Disabled, and least-privilege RAM;
- representative byte-level direct upload/download/preview/delete with external checksum comparison;
- accepted runtime headroom and systemd resource-limit measurement on an Owner-approved host; the upgraded 1 GiB-class host passed this gate in `PROD-02I` while the former approximately 407 MiB host failure remains historical evidence;
- encrypted off-host backup plus isolated production-format restore rehearsal;
- rollback pairing of application release and compatible database backup.

Any failed item means Layer 1 is code-complete but production remains closed and ineligible for cutover. Do not silently waive, simulate, or mark these operations executed.

Live permanent-delete evidence may use only a pre-registered, newly created,
disposable acceptance object containing no academic or production data, with a
separate irreversible-operation confirmation immediately before deletion.
