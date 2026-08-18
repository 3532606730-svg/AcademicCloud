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

   When using the OPS01A `recovery-main.js backup-create` / `receipt-verify`
   boundary instead of `backup-main.js`, invoke the script through the exact
   immutable release path, not the `/opt/academiccloud/current` symlink:

   ```bash
   ACADEMICCLOUD_RELEASE_ROOT="$(readlink -f /opt/academiccloud/current)"
   academiccloud_op /usr/bin/node \
     "$ACADEMICCLOUD_RELEASE_ROOT/backend/dist/operations/recovery-main.js" \
     backup-create --backup=<path> --receipt=<path> --source-commit=<commit>
   ```

   Releases through `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` compare
   the process entry path with the module's real path before executing this
   command. Addressing it through `current` therefore exits without publishing
   a backup or receipt. The exact immutable path preserves the reviewed runner,
   configured database/migrations paths, no-clobber behavior, and receipt
   verification. `backup-main.js` does not have this entry-guard quirk.

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

PROD-03B completed secret-safe activation, PROD-03C1 enabled the reviewed public HTTPS edge, PROD-04A completed the routine multi-user release, PROD-05A completed first-use polish + Shared Library foundation, PROD-06A completed the First-Use Correction, and PROD-07A deployed the exact independently accepted RF-META01 checkpoint on 2026-08-18. Production now runs exact release `2322169bc33415734d025010c465900c7fbc6bd9` at schema v18/history 001–018. The corrected Linux x64 / Node 24 artifact was assembled from the exact target worktree because no GitHub CLI/Actions credentials were available; therefore no GitHub artifact ID or Actions-run claim is made. Archive SHA-256 is `fca93a9ce844b713d73a26d146655ecd9689555b7ddf94d18b8a3d6202ebdc17`; manifest SHA-256 is `d6ec107a038fec7b53e6fcc2ebc0a7902d1991be252180a23fc9a0db407ea287`. The first locally prepared package was rejected before live mutation because Windows CRLF migration bytes did not match production checksums; the corrected package was rebuilt from exact Git LF blobs, independently verified on Linux, and only the corrected package was staged and deployed.

The database is schema v18 with exact migration history and file checksums 001–018. One isolated copy of the fresh production backup transitioned v17→v18 with exactly `[18]`, returned an empty second pass, and passed schema/integrity/foreign-key and safe-aggregate verification. The single live migration invocation then applied exactly `[18]`; rollback was not used. Final `integrity_check=ok`, foreign-key violations are zero, and safe aggregates remain accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1.

Migration 016 created the one canonical Library, three effective active-account memberships, and 28 deterministic transition/backfill graphs for eligible active holdings. Opaque before/after comparison proved all 32 preexisting file IDs, object keys/bytes, checksums, uploader/contributor provenance, Scholarly Record/Artifact/Version lineage, Favorites/private-overlay state, and non-active residue were preserved. No private research row was exposed. Live Library contributions and credential-reset rows remain zero; no live synthetic account, session, upload, reset capability, or OSS object was created for acceptance.

The first live transaction attempt stopped before release switch or migration because an opaque `query_only` snapshot runner could not open SQLite WAL companions under an overly narrow filesystem sandbox. The guard restarted exact `25cdab1…`; follow-up read-only checks proved release, schema v15, integrity, foreign keys, Library-zero state, service state, and health/readiness unchanged. The runner retained `query_only` and was given the reviewed `/var/lib/academiccloud` filesystem boundary SQLite requires; the next invocation passed. This was a pre-migration fail-closed verification anomaly, not a database/application rollback.

Focused post-deploy product acceptance ran only against a disposable schema-v17 synthetic database with injected in-memory storage, private networking, and no listener. It proved Member upload → submitted/pending, non-public visibility before review, Member review denial, Owner approval, stable file/object/provenance promotion, private Favorite non-disclosure, digest-only single-use Owner-assisted credential reset, old-session revocation, retired self-service password route, and stale recycle conflict → refreshed-version retry → restore without permanent delete. The synthetic stage was removed and retained no irreversible junk. Evidence SHA-256 is `db841199ed658675b6b2ba2fef2f38684baaa513ba817fe66e2b051d4c1728d1`. Exact public index/JavaScript/stylesheet hashes match the artifact whose workflow frontend suite passed 165/165.

The exact hardened service remains disabled-but-active behind Nginx with one `127.0.0.1:3000` listener and no non-loopback API listener, unchanged 320/384 MiB cgroup policy, zero restarts, zero failed units, zero post-release application errors, and zero kernel/cgroup OOM findings since entering active state at `2026-08-18 15:55:08 CST`. Final observed `MemoryPeak` was 97,509,376 bytes. Loopback and public health/readiness are 200; anonymous Library access returns 401 with `no-store`. Environment, systemd unit, Nginx site/security headers, and logrotate hashes match preflight. Autostart remains disabled; no daemon reload, reboot, DNS/TLS/Nginx/systemd policy, firewall, certificate, credential, paid-infrastructure, or unrelated OSS action occurred.

The exact rollback is an inseparable pair: prior release `855b63c49f12f3375972774e7bc7385088b0495e` plus fresh schema-v17 backup `academiccloud-pre-prod07a-20260818T135032Z.sqlite` (548,864 bytes; SHA-256 `b7abaa36355c40c88ab539b2a59e32c20f130539146246c33bd66a6b21579911`). The receipt SHA-256 is `95ed7830d2dbb565c1b5222191bec63d920ba44635bf118e421c45e99a8092e8`; age ciphertext SHA-256 is `1fc7de13aa27f64f42d5fb7625486b700c17312526d3949ce164549a2b74296f`. Byte-identical ciphertext, receipt, and manifest are verified in private off-host `AcademicCloud-Backups` commit `7c29aa6a9bc9171db5c235e427a580118220a6e0`. Never switch only `855b63c…` onto schema v18 and never invent reverse SQL.

The exact certificate for `cloud.ajtlab.top`, root-owned mode-0600 environment, reviewed Nginx site/security headers, HTTP→HTTPS path, loopback API proxy, private OSS abstraction, and `files.ajtlab.top` browser endpoint remain unchanged by PROD-07A. Certificate renewal remains disabled until the edge configuration demonstrably preserves the ACME challenge path and renewal/reload tests pass, and HSTS remains disabled until renewal and rollback are proven.

## Deferred live acceptance

Secret-safe configuration, real TLS/DNS, Nginx/systemd loopback behavior, firewall/listener state, exact OSS CORS and metadata behavior, anonymous-access denial, encrypted off-host backup, isolated v4→v8, v8→v15, v15→v17, and v17→v18 rehearsals, exact 005–008, 009–015, 016–017, and 018 production migrations, multi-user/isolation/governance/browser-transfer foundations, canonical shared-Library transition, Owner-assisted credential reset, canonical metadata acceptance, and bounded post-deploy checks now have recorded evidence. The remaining separately Owner-gated production decisions are the exact disposable-object permanent-delete confirmation, reboot/autostart policy, and the PROD-03C3 operational-hardening cluster (backup cadence, certificate-renewal automation before certificate expiry, HSTS only after renewal/rollback proof, destructive restore drill, and journal retention). PROD-07A did not authorize or consume these gates. Any later deployment, production migration, real-account testing, destructive operation, or infrastructure mutation requires a new bounded Owner window.

OPS01A later added repository/local preparation only: the zero-network-default
readiness auditor, verified backup receipt/freshness logic, deterministic
retention dry-run, isolated compiled restore drill, explicit restart-storm
limits, and an inactive journald retention template. None of these repository
artifacts installs a timer/drop-in, runs public/live probes, uploads or prunes a
backup, renews a certificate, restores production, or closes the Owner-gated
PROD-03C3 operations cluster.
