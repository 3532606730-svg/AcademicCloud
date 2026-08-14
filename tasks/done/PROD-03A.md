## Task ID

PROD-03A — Production Foundation and Immutable Release

## Goal

Install the verified Linux x86_64 / Node.js 24 production artifact into a rollback-safe, root-owned immutable release layout and prepare the non-secret production foundation for `cloud.ajtlab.top`, without starting the application, injecting credentials, creating a production account, modifying OSS, or exposing an incomplete service.

## Scope

- reconfirm repository/Git/GitHub, host health, DNS, deployment absence, bucket endpoint identity, and artifact availability
- independently download and verify GitHub artifact `9225471228` for source `639baa9596a17f4160521f31440d9e3ac3b12eda`
- create the dedicated `academiccloud` system user/group and restrictive production directories
- safely extract and install the verified release under an immutable commit-named root-owned directory and set `/opt/academiccloud/current`
- install the verified systemd unit disabled/inactive, and render Nginx, security-header, and logrotate files only into a root-only prepared directory without entering the active Nginx/logrotate trees
- install zero-cost ACME/Certbot tooling without issuing a certificate before the reviewed Owner bootstrap boundary
- add and verify a minimal local interactive bootstrap path that never stores secrets in Git, logs, argv, shell history, frontend, database rows, or the artifact
- retain exact pre-change state and rollback instructions

## Non-goals

- `npm ci`, `npm install`, `node-gyp`, native compilation, TypeScript/Vite build, Docker, or any application build on Alibaba
- production AccessKey injection, account/password provisioning, service start, Nginx cutover, certificate issuance, OSS CORS mutation, or browser E2E
- live OSS object operations, production data, permanent deletion, or account/credential changes
- weakening Argon2id, SQLite durability, KDF concurrency, systemd hardening, `MemoryHigh`, `MemoryMax`, TLS verification, owner isolation, or secret handling
- Layer 2, OCR, RAG, AI, connectors, mobile, desktop sync, or architecture expansion
- resizing the post-upgrade 30 GiB block device or existing approximately 20 GiB mounted root filesystem

## Acceptance Criteria

- [x] clean local/private GitHub `main`, exact task branch, read-only host/DNS/bucket preflight, and independent pre-write review pass
- [x] artifact ID/source/ZIP/archive/manifest/verifier/runtime evidence match the accepted PROD-02I identities and no unverified fallback artifact is used
- [x] the `academiccloud` system identity and production directory ownership/modes satisfy the runbook with no secret or production data present
- [x] the immutable release exactly matches the verified manifest/archive, is root-owned and non-writable by the service, and `current` resolves only to that release
- [x] checked-in systemd hardening and 320/384 MiB limits remain exact; service is disabled/inactive and no application listener exists
- [x] prepared Nginx/CSP/logrotate files use only `cloud.ajtlab.top` and `ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com`, contain no placeholder/secret, and remain outside active configuration trees; structural checks and the unchanged current active `nginx -t/-T` pass, while real production-site `nginx -t` remains a post-certificate PROD-03B gate
- [x] Certbot webroot tooling is installed without registration, certificate issuance, Nginx plugin mutation, TLS-verification change, or public-route change; package/timer state is recorded and the timer remains disabled until a separately reviewed renewal gate proves that the final edge configuration preserves ACME challenges
- [x] the reviewed interactive bootstrap accepts secrets only through hidden local input and protected SSH stdin, installs only root-owned mode-0600 configuration, and exposes no secret in output/history/repository
- [x] exact rollback state and removal/restore commands are retained; host services, listeners, memory, swap, and OOM state remain healthy
- [x] applicable tests, syntax checks, manifest/file checks, secret scan, diff review, and independent read-only review pass
- [x] task-level commit is pushed through the existing strict Windows-to-GitHub SSH channel and durable state identifies the next bounded task without entering it prematurely

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `.github/workflows/production-build.yml`
- `scripts/production-artifact.mjs`
- `scripts/alibaba-production-foundation.sh`
- `scripts/alibaba-certbot-foundation.sh`
- `scripts/alibaba-production-activate.sh`
- `scripts/production-owner-bootstrap.ps1`
- `scripts/run-prod03a-foundation.ps1`
- `deployment/systemd/academiccloud.service`
- `deployment/nginx/academiccloud.conf`
- `deployment/nginx/academiccloud-security-headers.conf`
- `deployment/logrotate/academiccloud-nginx`
- `deployment/env/academiccloud.env.example`
- `docs/deployment/production-runbook.md`
- `docs/deployment/oss-deployment-checklist.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/done/PROD-03A.md`

## Current State

Complete. The exact source `639baa9596a17f4160521f31440d9e3ac3b12eda` release is installed at its immutable commit-named path and `/opt/academiccloud/current` resolves to it. The `academiccloud` nologin identity and restrictive config/state/log directories exist; the release is root-owned, all 4,605 regular files plus 15 symlinks match the artifact identity, and the service identity cannot write it. The exact production unit is installed with SHA-256 `fed6c26d80ad070decf4ddeabb7f4af6d23c38c24d2494666c7bfe981e39500b`, systemd security exposure is `2.9 OK`, and the unit remains disabled/inactive with `MainPID=0`. Prepared edge/bootstrap files are root-only and inactive. Certbot 2.9.0 is installed with its timer disabled/inactive and no ACME account, certificate, or renewal state. No environment, database, account, application listener, active site, OSS mutation, or production data exists.

## Completed

- Recovered repository, Git/GitHub, ADR, deployment, artifact, runtime-acceptance, storage-adapter, frontend direct-upload, and backup/account state from durable sources.
- Confirmed the official Kuala Lumpur OSS public endpoint is `oss-ap-southeast-3.aliyuncs.com`, matching the checked-in production example and the observed bucket endpoint.
- Completed the required read-only repository, host, DNS, Nginx, memory/swap/OOM, deployment-absence, and anonymous bucket checks.
- Implemented and independently reviewed fail-closed artifact publication, Certbot foundation, resumable secret-safe activation, hidden Owner input, evidence, rollback, and exact-cleanup tooling.
- Preserved two ordinary fail-closed attempts: attempt 1 rejected a 0700 release root and has evidence SHA-256 `e4f1011ffbae20cc0de24bde5b2bca90bf627c878dbcdfd3abcd4d312f9eb753`; attempt 2 rejected 0700 archive directories and has evidence SHA-256 `337c648bd7b641498599f04afe56f165d08bd28349ecfc9e2874426a6c08b656`. Both automatically rolled back, independently confirmed healthy/clean state, and removed their exact task stages before retry.
- Completed the formal install with evidence bundle SHA-256 `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5` and 15 exact evidence members. Added packages are exactly `certbot`, `python3-acme`, `python3-certbot`, `python3-configargparse`, `python3-josepy`, `python3-parsedatetime`, and `python3-rfc3339`; APT reported zero upgrades and zero removals.
- Reconfirmed post-install systemd `running`, zero failed units, healthy Nginx/SSH, unchanged Nginx SHA-256, unchanged listeners, no port 3000, `MemAvailable=546,080 KiB`, `SwapFree=1,048,572 KiB`, no current-boot OOM, no secret signature, and no `academiccloud-prod03a-*` stage residue.
- Added no paid resource and incurred `0 RMB` of new task cost; the seven Ubuntu packages came from the existing repository and all host/cloud/storage/billing resources remained unchanged.

## Remaining

None.

## Blockers

None for PROD-03A. PROD-03B deliberately stops for the shortest Owner-side hidden credential/password/ACME-email entry and exact OSS CORS console action; those values must never enter chat. PROD-03C retains the encrypted off-host destination/key-custody/new-cost boundary and exact disposable-object permanent-delete confirmation.

## Last Verification

2026-08-15: independent Reviewer recomputed formal evidence SHA-256 `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5`, verified 15 unique exact members, all artifact/runtime identities, 4,605 regular files plus 15 symlinks, root ownership/non-writability, exact unit and prepared configuration, seven additions/zero package removals, Certbot/timer/no-certificate state, pre/post host health, memory/swap/OOM/listeners, secret scan, and exact stage cleanup. The only systemd verification messages concern the host's pre-existing `cloudmonitor.service`; the only APT warnings concern the pre-existing unavailable `en_US.UTF-8` locale. Neither changed a task gate.

## Next Action

Stop PROD-03A. After its completion checkpoint is pushed and synchronized, start the bounded PROD-03B task and present only the shortest Owner-side hidden input and OSS CORS instructions at the mandatory interaction boundary.
