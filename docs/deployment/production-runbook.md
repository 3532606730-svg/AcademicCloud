# Production Deployment Runbook

This runbook prepares the approved Layer 1 single-host topology: Nginx serves the static SPA and proxies `/api` to one loopback-only Node.js process; SQLite stores control-plane metadata; file bytes travel directly between the browser and a private OSS bucket.

The checked-in files are templates, not authorization to mutate the server or cloud account. Real credentials, bucket/RAM/CORS/versioning changes, DNS, certificate issuance, firewall changes, package installation, service enablement, and production data operations require a separate approved deployment window.

## Approval-gated preflight

Record the operator, maintenance window, domain, release commit, current release path, backup destination, and rollback release before change.

Verify on the target host:

- Ubuntu 24.04 is patched and has the latest approved Node.js 24 LTS security
  patch plus all runtime libraries required by the verified Linux artifact.
  Build tools may be present from server preparation, but they are not used to
  install or compile AcademicCloud on this host.
- The host has at least 128 MiB measured headroom during the production Argon2 benchmark and representative control-plane operations. The local Windows result is not an Ubuntu capacity result.
- Only ports 80/443 are public. Fastify binds `127.0.0.1:3000`; `ss -lntp` must show no public API listener.
- A dedicated, non-login `academiccloud` user exists. Release files are root-owned and read-only to the service; `/var/lib/academiccloud` is `academiccloud:academiccloud` mode 0700.
- `/etc/academiccloud/academiccloud.env` is root-owned mode 0600 and not inside a release, static root, backup archive, shell history, or Git checkout.
- An encrypted off-host database-backup destination and retention policy exist. A same-server backup is only a staging copy.
- The private OSS deployment gate in [OSS Deployment Checklist](oss-deployment-checklist.md) is fully signed off.

Abort if any preflight fails. Do not weaken database durability, password hashing, authorization, or hardening to fit the host; increase memory instead.

`PROD-02H` measured the former approximately 407 MiB Alibaba host and failed this gate: minimum whole-host `MemAvailable` was 38,992 KiB and a global OOM occurred. After the Owner-reported upgrade, Linux exposed `916,044 KiB` `MemTotal`; `PROD-02I` accepted runtime suitability with minimum `MemAvailable=393,396 KiB`, minimum `SwapFree=1,048,572 KiB`, a 241,455,104-byte cgroup peak, zero OOM evidence, and complete runtime/compiled acceptance. This result does not waive any remaining live deployment gate. Any further RAM/server change has real-cost implications and requires explicit Owner approval.

## Build and release preparation

Do not build or install dependencies on the Alibaba production host, and do not
copy Windows `node_modules` to Ubuntu. A real target-host
`npm ci --omit=dev` was OOM-killed, so `npm ci`, `node-gyp`, native compilation,
and frontend builds are prohibited there. Use a compatible GitHub Actions
Linux/Node 24 build environment; never run npm lifecycle or native build scripts
as root:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

The release artifact contains the tracked runtime files, `backend/dist`,
`frontend/dist`, `database/migrations`, `package.json`, `package-lock.json`, and
production dependencies built for the target Linux x86_64/Node 24 ABI,
including verified `better-sqlite3` and Argon2 native modules. The Alibaba host
only verifies and unpacks that already validated artifact; it does not run npm.
Root only installs the verified artifact into its final root-owned, read-only
release directory. Never ship local `.env`, SQLite files, logs, backups, test
output, or development caches.

Before any approved transfer, obtain the four-file bundle from the successful
GitHub Actions run: `<name>.tar.gz`, `<name>.tar.gz.sha256`,
`<name>.manifest.json`, and `<name>.runtime-verification.json`. Independently
verify the GitHub artifact digest, require the runtime evidence status to be
`ok` for the intended source commit and Linux x86-64/Node 24, and verify the
release archive against its SHA-256 file before extraction. A mismatch,
expired artifact, different source commit, unexpected native-module path, or
missing evidence aborts the deployment window; never rebuild on Alibaba as a
fallback.

Use immutable timestamped release directories such as `/opt/academiccloud/releases/<commit>` and a `/opt/academiccloud/current` symlink. Verify ownership and that the service cannot write the release tree.

## Configuration and protected one-shot operations

Render [academiccloud.env.example](../../deployment/env/academiccloud.env.example) into `/etc/academiccloud/academiccloud.env`. `APP_ORIGIN`, the Nginx hostname, static CSP OSS origin, and OSS CORS origin must be the same exact HTTPS application origin/bucket endpoint pair.

An ordinary `sudo -u` command does **not** inherit the service `EnvironmentFile`.
At the start of each approved operations shell, define this transient-unit runner.
It makes systemd read the root-only environment file before dropping to the
service account, preserves the state/release write boundary, and waits for a
logged one-shot result:

```bash
academiccloud_op() {
  sudo systemd-run --quiet --wait --pipe --collect \
    --property=User=academiccloud \
    --property=Group=academiccloud \
    --property=WorkingDirectory=/opt/academiccloud/current/backend \
    --property=EnvironmentFile=/etc/academiccloud/academiccloud.env \
    --property=UMask=0077 \
    --property=NoNewPrivileges=yes \
    --property=PrivateTmp=yes \
    --property=ProtectSystem=strict \
    --property=ProtectHome=yes \
    --property=ReadWritePaths=/var/lib/academiccloud \
    "$@"
}
```

Use this runner for compiled migration, account provisioning, backup, verify,
and maintenance commands. Never replace it with an unconfigured `sudo -u` call.
Before every mutation, print and independently compare the configured absolute
database and migrations paths against the approved change record.

## First deployment

1. Install the environment file with mode 0600 and the service unit from `deployment/systemd/academiccloud.service`. Keep the service stopped. Define `academiccloud_op` as above.
2. Render and install `deployment/nginx/academiccloud.conf`, and install
   `deployment/nginx/academiccloud-security-headers.conf` as
   `/etc/nginx/snippets/academiccloud-security-headers.conf`. Install
   `deployment/logrotate/academiccloud-nginx` under `/etc/logrotate.d`, create
   `/var/log/academiccloud` as `root:adm` mode 0750, and ensure the distro Nginx
   rule does not also target these nonstandard log paths. Replace both the app
   host and exact OSS host in the two Nginx files.
3. Validate before reload:

   ```bash
   sudo nginx -t
   sudo logrotate --debug /etc/logrotate.d/academiccloud-nginx
   sudo systemd-analyze verify /etc/systemd/system/academiccloud.service
   sudo systemd-analyze security academiccloud.service
   ```

4. With the API still stopped, initialize or upgrade the exact configured SQLite database:

   ```bash
   academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/persistence/sqlite/migrate.js
   ```

5. For a first deployment only, provision the first account after migration and
   before starting the service. Confirm no other process runs as `academiccloud`.
   Read and confirm the password without argv or environment exposure, then send
   one line over the transient unit's inherited stdin:

   ```bash
   read -rsp 'Initial password: ' ACADEMICCLOUD_PASSWORD; echo
   read -rsp 'Confirm password: ' ACADEMICCLOUD_PASSWORD_CONFIRM; echo
   if [ "$ACADEMICCLOUD_PASSWORD" != "$ACADEMICCLOUD_PASSWORD_CONFIRM" ]; then
     unset ACADEMICCLOUD_PASSWORD ACADEMICCLOUD_PASSWORD_CONFIRM
     echo 'Passwords do not match; aborting.' >&2
     exit 1
   fi
   printf '%s\n' "$ACADEMICCLOUD_PASSWORD" | academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/operations/account-main.js \
     --login=Scholar --password-stdin
   unset ACADEMICCLOUD_PASSWORD ACADEMICCLOUD_PASSWORD_CONFIRM
   ```

   The password must be 12–1024 characters. Provisioning stores only Argon2id,
   rejects an existing case-insensitive login, and returns no password/hash.
   Account creation is a credential change and requires explicit approval.

6. Start the service, then verify locally before Nginx:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start academiccloud
   curl --fail http://127.0.0.1:3000/api/health
   curl --fail http://127.0.0.1:3000/api/ready
   ```

7. Reload Nginx only after its validation succeeds. Verify HTTP redirects to HTTPS, TLS 1.2/1.3, SPA fallback, API 404/no-store headers, login Secure/HttpOnly/Strict cookie, invalid-origin 403, and readiness.
8. Verify application, Nginx access, Nginx error, and rotation-debug logs contain no raw query, Referer, cookie, password, signed URL, upload policy/signature, AccessKey, STS token, object key, or provider exception. Never put secrets in application query parameters; Nginx error diagnostics may include a rejected request line.
9. Enable HSTS only after certificate issuance, renewal, redirect, and rollback are proven. Do not add `includeSubDomains` without reviewing sibling hosts.

## Routine release and rollback

> The reviewed L1-UX01 production window has a dedicated operator checklist
> with capture/verify/rollback matrices: see
> `docs/deployment/l1-ux01-production-gate.md` (two transactions: files-domain
> infrastructure, then application deployment) and
> `docs/deployment/files-ajtlab-top-plan.md`. Use those for the UX01 window;
> the generic routine below remains the baseline procedure.

1. Stage and validate the new immutable release without switching `current`. Open the approved operations shell and define `academiccloud_op` as above.
2. Create and verify a consistent backup:

   ```bash
   academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/operations/backup-main.js \
     create --output=/var/lib/academiccloud/backups/pre-<commit>.sqlite
   academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/operations/backup-main.js \
     verify --input=/var/lib/academiccloud/backups/pre-<commit>.sqlite
   ```

3. Copy the verified backup to the approved encrypted off-host destination before migration.
4. Stop the API, switch `current`, redefine `academiccloud_op` so its working directory resolves through the new `current`, run the new compiled migration entry through it, start, and verify health/readiness plus the critical path. File uploads/downloads remain approval-gated live OSS tests.
   The production application itself NEVER applies migrations at startup: it
   opens the database, asserts the schema is initialized and current, and
   fails closed (startup refuses) when any pending/missing migration exists.
   Only the explicit compiled migration runner may change the production
   schema. Development/test startups keep the automatic migration path.
5. If startup, migration, readiness, or smoke checks fail, stop. An application-only rollback is allowed only when the old release supports the current schema. Otherwise restore the matching pre-migration database backup and old release as an inseparable pair using [Backup and Recovery](backup-recovery.md).

Never downgrade a database with ad hoc SQL. Never switch releases while retaining an incompatible migrated database merely because the process starts.

## Operations

- `journalctl -u academiccloud` is the primary application log stream. Nginx uses the query-free dedicated logs and checked-in 14-generation/10 MiB rotation rule. Configure journal size/retention for the 20 GB disk, dry-run logrotate after changes, and alert before disk exhaustion.
- Run compiled maintenance through `academiccloud_op` during a maintenance window. Dry-run first. Apply only after inspection and with the web process stopped as documented in the security/reliability guide.
- Rerun the Argon2 benchmark after Node/native dependency/host changes. The
  approximately 407 MiB host historically failed `PROD-02H`: cgroup peak was
  151,027,712 bytes, minimum whole-host `MemAvailable` was 38,992 KiB, and global
  OOM killed the acceptance process. After the Owner-reported upgrade, Linux
  exposed `916,044 KiB` `MemTotal`; `PROD-02I` passed the same artifact verifier,
  Argon2id parameters, SQLite durability, 320/384 MiB service bounds, and 128 MiB
  headroom gate. It measured a 241,455,104-byte cgroup peak, minimum
  `MemAvailable=393,396 KiB`, minimum `SwapFree=1,048,572 KiB`, and no cgroup or
  kernel OOM. Do not weaken hashing, durability, or service hardening.
- Certificate renewal must include automated `nginx -t` and reload verification.
- Rotate long-lived RAM credentials through the approved secret procedure, restart, verify readiness and an authorized storage smoke, then revoke the prior credential. A static STS token is not a rotation solution.

## Installed production foundation checkpoint (historical)

`PROD-03A` installed GitHub artifact `9225471228`, source `639baa9596a17f4160521f31440d9e3ac3b12eda`, as the root-owned immutable release selected by `/opt/academiccloud/current`. Its evidence bundle SHA-256 is `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5`. At that checkpoint the exact production unit was installed disabled/inactive with no PID or port 3000 listener and Nginx exposed only its prior default port-80 site. Prepared edge and bootstrap files were root-only and outside active configuration trees.

Certbot 2.9.0 plus `python3-acme`, `python3-certbot`, `python3-configargparse`, `python3-josepy`, `python3-parsedatetime`, and `python3-rfc3339` were the only package additions; APT upgraded and removed zero packages. The Certbot timer is disabled/inactive. Two prior publication attempts correctly failed closed on non-traversable extracted directory modes, automatically rolled back, preserved evidence, and left no state before the corrected run. Existing host locale fallback warnings and unrelated `cloudmonitor.service` verification warnings did not change an AcademicCloud gate.

## Current production state

PROD-03B completed secret-safe activation, PROD-03C1 enabled the reviewed public HTTPS edge, and PROD-04A completed the accepted routine multi-user release on 2026-08-17. Production now runs exact commit `34a2eada158dcf08783dc9538d853f9361425e8a`, installed only from successful GitHub Actions run `31997033717`'s verified Linux x64 / Node 24 artifact. Alibaba did not run npm, a build, native compilation, or Docker. The database is schema v8 with exact migration history 1–8; migrations 009 and later remain repository-only.

The final account aggregate is four: one active Owner, one active real Member intentionally created by the Owner, and two disabled acceptance Members with zero live sessions. The acceptance announcement is unpublished. The 235-byte synthetic acceptance TXT remains active after upload, exact download/hash, Preview, Favorite add/remove, recycle, and restore acceptance; no production file or OSS object was permanently deleted. Do not use the real Member for operational testing without a separate Owner gate.

The exact hardened service remains disabled-but-active behind Nginx with one `127.0.0.1:3000` listener, unchanged 320/384 MiB cgroup bounds, zero restarts, zero cgroup pressure/OOM events, and zero kernel OOM evidence since the release entered active state at `2026-08-17 22:38:19 CST`. Final read-only verification measured `MemTotal=916,044 KiB`, `MemAvailable=524,792 KiB`, and `SwapFree=1,048,572 KiB`; health/readiness and public asset identity were exact. Nine current-boot OOM keyword lines are the already-known 2026-08-16 verifier failures and predate this release start.

The exact rollback is an inseparable pair: old release `15181f90d6eecbb0ddb977a0168536a445802ec7` plus v4 backup `academiccloud-pre-34a2eada-20260817T135543Z.sqlite` (SHA-256 `7635f6cb313d957ad9e360b290d6b1a9d5a0ba244bd3bc4ebae469bb34ef0cf6`). The age-encrypted off-host copy is verified in private `AcademicCloud-Backups` commit `4b527e48be8d4f91c50c93ef9ea49caf9560b088`. Never switch only the old release onto schema v8 and never invent reverse SQL.

The exact certificate for `cloud.ajtlab.top`, root-owned mode-0600 environment, reviewed Nginx site/security headers, HTTP→HTTPS path, loopback API proxy, private OSS abstraction, and `files.ajtlab.top` browser endpoint remain unchanged by PROD-04A. Certificate renewal remains disabled until the edge configuration demonstrably preserves the ACME challenge path and renewal/reload tests pass, and HSTS remains disabled until renewal and rollback are proven.

## Deferred live acceptance

Secret-safe configuration, real TLS/DNS, Nginx/systemd loopback behavior, firewall/listener state, exact OSS CORS and metadata behavior, anonymous-access denial, encrypted off-host backup, isolated v4→v8 rehearsal, exact 005–008 migration, multi-user/isolation/governance/password/browser transfer acceptance, and the reviewed production deployments now have recorded evidence. The remaining separately Owner-gated production decisions are the exact disposable-object permanent-delete confirmation, reboot/autostart policy, and the PROD-03C3 operational-hardening cluster (backup cadence, certificate-renewal automation before certificate expiry, HSTS only after renewal/rollback proof, destructive restore drill, and journal retention). PROD-04A did not authorize or consume these gates. Any later deployment, production migration, real-account testing, destructive operation, or infrastructure mutation requires a new bounded Owner window.

OPS01A later added repository/local preparation only: the zero-network-default
readiness auditor, verified backup receipt/freshness logic, deterministic
retention dry-run, isolated compiled restore drill, explicit restart-storm
limits, and an inactive journald retention template. None of these repository
artifacts installs a timer/drop-in, runs public/live probes, uploads or prunes a
backup, renews a certificate, restores production, or closes the Owner-gated
PROD-03C3 operations cluster.
