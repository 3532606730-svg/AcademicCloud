# Production Deployment Runbook

This runbook prepares the approved Layer 1 single-host topology: Nginx serves the static SPA and proxies `/api` to one loopback-only Node.js process; SQLite stores control-plane metadata; file bytes travel directly between the browser and a private OSS bucket.

The checked-in files define the operational mechanism. The active task defines
authorization: [ACADEMICCLOUD-VNEXT-REMEDIATION01](../../tasks/doing/ACADEMICCLOUD-VNEXT-REMEDIATION01.md)
authorizes the required release, initialization, configuration and live product
verification without repeated approval. Use the existing infrastructure and
protect credentials, source bytes, resource identity and access boundaries.
The exact deployed commit and completion evidence belong in
[CURRENT_STATUS.md](../../CURRENT_STATUS.md) and the active task, rather than
being duplicated as a second current-state record here. Artifact `9405764771`
and source `8d289702…` remain permanently disallowed.

## Deployment preflight

Identify the intended commit, current immutable release, database path and
schema-compatible recovery option. Reuse an adequate existing recovery point;
do not generate a fresh backup or duplicate artifact for every ordinary edit.
Use the established `academiccloud-prod` SSH alias with non-interactive,
host-key-verified access. Do not print the environment file or credentials.

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

Resolve a concrete failed preflight before cutover. Do not weaken database
durability, password hashing, authorization or hardening to fit the host. A
capacity problem requires diagnosis within the existing cost constraints.

`PROD-02H` measured the former approximately 407 MiB Alibaba host and failed this gate: minimum whole-host `MemAvailable` was 38,992 KiB and a global OOM occurred. After the Owner-reported upgrade, Linux exposed `916,044 KiB` `MemTotal`; `PROD-02I` accepted runtime suitability with minimum `MemAvailable=393,396 KiB`, minimum `SwapFree=1,048,572 KiB`, a 241,455,104-byte cgroup peak, zero OOM evidence, and complete runtime/compiled acceptance. This result does not waive any remaining live deployment gate. Any further RAM/server change has real-cost implications and requires explicit Owner approval.

## Build and release preparation

Do not build or install dependencies on the Alibaba production host, and do not
copy Windows `node_modules` to Ubuntu. A real target-host
`npm ci --omit=dev` was OOM-killed, so `npm ci`, `node-gyp`, native compilation,
and frontend builds are prohibited there. Use a compatible GitHub Actions
Linux/Node 24 build environment; never run npm lifecycle or native build scripts
as root:

```bash
npm exec --yes --package=npm@11.19.1 -- npm ci --strict-allow-scripts
npm run test:ci
npm run typecheck
npm run build
npm run acceptance:compiled
npm audit --audit-level=high
npm audit --omit=dev --audit-level=low
```

Node.js 24 and npm 11.19.1 are the supported installer combination. The root
`allowScripts` policy permits the reviewed versioned Argon2, esbuild and
platform-specific fsevents scripts and explicitly denies the unnecessary
`better-sqlite3@13.0.3` install script. SQLite loads its packaged native
prebuild. This avoids npm's known implicit `node-gyp` behavior without globally
disabling dependency scripts; see the [upstream issue](https://github.com/WiseLibs/better-sqlite3/issues/1516)
and [npm lifecycle policy](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/).
Review a changed lifecycle package version before updating its permission.

`AcademicCloud regression` is the permanent application/operations gate,
including real PDF.js/native canvas tests with injected OCR and a clean Windows
native-install smoke. The two actual OCR-engine qualification suites remain
separate. `Linux production build` produces and independently verifies the
exact Core artifact. The manual `Derived compute emergency fallback` workflow
does not run on ordinary pull requests and is not the normal production
Compute provider.

The release artifact contains the tracked runtime files, `backend/dist`,
`frontend/dist`, `database/migrations`, `database/ruleset-admissions`,
`backend/dist/persistence/sqlite/initialize-database.js`, `package.json`,
`package-lock.json`, and
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

Use immutable commit-named release directories such as `/opt/academiccloud/releases/<commit>` and a `/opt/academiccloud/current` symlink. Verify ownership and that the service cannot write the release tree.

## Configuration and protected one-shot operations

Render [academiccloud.env.example](../../deployment/env/academiccloud.env.example) into `/etc/academiccloud/academiccloud.env`. `APP_ORIGIN`, the Nginx hostname, static CSP OSS origin, and OSS CORS origin must be the same exact HTTPS application origin/bucket endpoint pair.

An ordinary `sudo -u` command does **not** inherit the service `EnvironmentFile`.
At the start of each approved operations shell, define this transient-unit runner.
It makes systemd read the root-only environment file before dropping to the
service account, preserves the state/release write boundary, and waits for a
logged one-shot result:

```bash
academiccloud_op() {
  local release_root="${ACADEMICCLOUD_OPERATION_RELEASE_ROOT:-$(readlink -f /opt/academiccloud/current)}"
  [[ "$release_root" =~ ^/opt/academiccloud/releases/[a-f0-9]{40}$ ]] || return 2
  test -d "$release_root/backend" || return 2
  sudo systemd-run --quiet --wait --pipe --collect \
    --property=User=academiccloud \
    --property=Group=academiccloud \
    --property="WorkingDirectory=$release_root/backend" \
    --property=EnvironmentFile=/etc/academiccloud/academiccloud.env \
    --property=UMask=0077 \
    --property=NoNewPrivileges=yes \
    --property=PrivateTmp=yes \
    --property=ProtectSystem=strict \
    --property=ProtectHome=yes \
    --property=ReadWritePaths=/var/lib/academiccloud \
    /usr/bin/env \
    "MIGRATIONS_DIRECTORY=$release_root/database/migrations" \
    "RULESET_ADMISSIONS_DIRECTORY=$release_root/database/ruleset-admissions" \
    "$@"
}
```

Use this runner for compiled initialization, account provisioning, backup,
verification and maintenance. Set `ACADEMICCLOUD_OPERATION_RELEASE_ROOT` to an
exact staged release when operating before the `current` switch; unset it
afterward. The final `/usr/bin/env` arguments deliberately override only the
two non-secret release-relative asset paths after systemd loads the protected
environment. This matters because the installed production environment points
`MIGRATIONS_DIRECTORY` through `current`: a staged initializer must not
accidentally read the previous release's migration directory. `DATABASE_PATH`
continues to come from the protected environment.

## Supported initialization and readiness

The supported fresh-install and upgrade entry is `db:initialize` in a source
checkout, or `db:initialize:prod` after compilation. It performs, in order:

1. Validate the admission manifest, immutable SQL assets and compiled runtime identity.
2. Apply pending append-only migrations, including `035_library_search_projection.sql` and `036_bibliographic_contributor_collection_authority.sql`.
3. Admit missing declared rulesets without rewriting existing registry history.
4. Verify the migration/admission state and initialize the derived Library search projection.

The result contains migration, admission and projection summaries, not source
document content. Repeating initialization preserves current admissions and
rebuilds only the projection work required by its state. The low-level
`db:migrate` and `db:admit-rulesets` commands remain available for diagnosis;
neither alone is the supported complete readiness process.

Production startup checks the migration and admission invariants and refuses
an incomplete database; it does not silently migrate or admit rulesets. `/api/ready` also checks the
compiled runtime admission, returning an unavailable state if it is removed or
changed. Fix a missing admission through the exact initializer, not a direct
registry edit or a retry intended to bypass readiness. An admission checksum or
identity conflict needs correction of the selected release/configuration;
never overwrite a historical registry row to make it pass.

Schema 035 adds a rebuildable search projection and dirty markers. It does not
replace PDF bytes, canonical bibliography or resource identity. See
[ADR-041](../decisions/ADR-041-vnext-review-plans-and-search-projection.md).
Schema 036 retains human contributor-list decisions, including an explicitly
empty list. This authority is durable canonical state, not a rebuildable search cache.

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

4. With the API still stopped, initialize the exact configured SQLite database:

   ```bash
   academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/persistence/sqlite/initialize-database.js
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
   Run account creation only when it belongs to the active task's authorization.

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

1. Stage and validate the new immutable release without switching `current`.
   Verify the included initializer, migrations and admission assets belong to
   the intended commit. Define `academiccloud_op` as above.
2. Determine whether the change needs a new recovery point. Reuse an adequate
   existing one for ordinary code/configuration changes. If a persistent change
   requires a new consistent database recovery point, use the existing backup
   mechanism once and verify it:

   ```bash
   academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/operations/backup-main.js \
     create --output=/var/lib/academiccloud/backups/pre-<commit>.sqlite
   academiccloud_op /usr/bin/node \
     /opt/academiccloud/current/backend/dist/operations/backup-main.js \
     verify --input=/var/lib/academiccloud/backups/pre-<commit>.sqlite
   ```

   Publish a newly required recovery point through the existing encrypted
   off-host mechanism. Do not copy the live database file or WAL manually.

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

3. When initialization is needed, stop the API and run the staged release's
   initializer against the protected production database:

   ```bash
   ACADEMICCLOUD_OPERATION_RELEASE_ROOT=/opt/academiccloud/releases/<exact-40-character-commit>
   academiccloud_op /usr/bin/node \
     "$ACADEMICCLOUD_OPERATION_RELEASE_ROOT/backend/dist/persistence/sqlite/initialize-database.js"
   ```

   The helper pins both migration and admission directories to this staged
   release, even while `current` still selects the previous application. Verify
   the successful summary, schema history 001–036, current v11/prompt-v7
   admission, projection initialization and foreign-key integrity. Initialization
   is repeatable; a failed step must be diagnosed before starting the service.
4. Atomically select the verified release, unset
   `ACADEMICCLOUD_OPERATION_RELEASE_ROOT`, and start/restart the API. Verify
   the actual process/release identity, loopback and public `/api/health` and
   `/api/ready`, then the changed signed-in product paths. Install/render the
   matching nginx source as described below, run `nginx -t`, and reload only
   after validation. Do not reinstall unrelated units or alter credentials.
5. After a real failure, recover according to the actual database state. A
   release that recognizes only migrations through 034 rejects a database with
   035–036 and is **not** an application-only rollback. Prefer a corrected,
   schema-036-compatible release; derived search state can be repaired by the
   supported initializer. Database restoration is reserved for a failure that
   requires it, using the matching recovery pair and accounting for any writes
   since the recovery point. See [Backup and Recovery](backup-recovery.md).

Never downgrade a database with ad hoc SQL. Never switch releases while retaining an incompatible migrated database merely because the process starts.

## Catalog edge and product verification

Render the repository nginx template into
`/etc/nginx/sites-available/academiccloud`; the established enabled link is
`/etc/nginx/sites-enabled/academiccloud` (no `.conf` suffix). Preserve the
existing production hostname, certificate paths and exact source origins.
Keep the repository as the source of truth instead of appending another
production-only location block.

| Request | Core and nginx maximum | Meaning |
| --- | ---: | --- |
| Ordinary API | 16 KiB | Existing default |
| Compute callback | 512 KiB | Existing capability-authenticated result boundary |
| Catalog export-request | 128 KiB | Up to 500 bounded resource IDs |
| Catalog Preview | 8 MiB | Results document sent directly as JSON |
| Catalog Apply | 256 KiB | Plan ID plus up to 500 selections/acknowledgements |

Apply no longer carries a second copy of the results document. Preview plans
are actor/Library-bound, expire after 30 minutes, and are limited to four plans
and 32 MiB total memory. A restart or eviction requires a fresh Preview; the UI
must not silently reuse a stale plan. Within a surviving plan, completed items
replay their recorded outcomes when the same selection is retried.

After `nginx -t` and reload, exercise the real authenticated edge: a supported
large results document must reach Preview, and the resulting plan/selection
envelope must reach Apply. Verify oversized bodies are rejected at the specific
route boundary while ordinary API limits remain unchanged. A 401/404 on an
unauthenticated request alone does not prove an accepted product envelope.
Review exact current/proposed values, explicit clears, human conflicts and
unverified-evidence acknowledgements before the authorized live Apply. Check
persisted bibliography and filename, stable resource/object identity, partial
results, and retrieval afterward. An uncertain field remains unknown rather
than being manufactured for a smoke test.

The Catalog Bridge is a separate release under
`/srv/academiccloud-compute/catalog-releases/<commit>` selected by
`catalog-current` in `AcademicCloudComputeV2`. Use its existing
`assemble-catalog-bridge-release.sh`, `verify-catalog-bridge-release.sh` and
`activate-catalog-bridge-release.sh` sequence; the assembler selects the same
pinned npm/lifecycle policy. Verify loopback health at port 43117, exact
production-Origin CORS, and a signed-in browser export/cancel path. Check the
existing Windows-login launcher before reinstalling it. Bridge activation does
not select or start the main reasoning worker; that independent qualification
and activation belongs to its own explicit step in the active task.

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

All checkpoint records below are historical evidence, including their
then-current release, authority and rollback statements. They do not define
the vNext deployment state or supersede the active task.

`PROD-03A` installed GitHub artifact `9225471228`, source `639baa9596a17f4160521f31440d9e3ac3b12eda`, as the root-owned immutable release selected by `/opt/academiccloud/current`. Its evidence bundle SHA-256 is `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5`. At that checkpoint the exact production unit was installed disabled/inactive with no PID or port 3000 listener and Nginx exposed only its prior default port-80 site. Prepared edge and bootstrap files were root-only and outside active configuration trees.

Certbot 2.9.0 plus `python3-acme`, `python3-certbot`, `python3-configargparse`, `python3-josepy`, `python3-parsedatetime`, and `python3-rfc3339` were the only package additions; APT upgraded and removed zero packages. The Certbot timer is disabled/inactive. Two prior publication attempts correctly failed closed on non-traversable extracted directory modes, automatically rolled back, preserved evidence, and left no state before the corrected run. Existing host locale fallback warnings and unrelated `cloudmonitor.service` verification warnings did not change an AcademicCloud gate.

## L1 intelligent-library production checkpoint (historical)

At this checkpoint, production ran exact immutable source
`017a47dbd837264175d8cbcb3f469a01e3e62c92`, previous application release
`53317bb0156589baa21bc69c22e199d200c49840`, at schema v24/history 001–024.
Artifact `9477785607` from workflow `32580834900` has GitHub digest
`b221f22b0b1d7b22543e43ac0f5a756465e1f750f57c5cc07c87b49cec8ef3bd`,
archive SHA-256
`e714ef877681fddd9078fb6cdcace31d1602840bc244ac84b9cfcc868d903210`,
and manifest SHA-256
`3b32afe7b2c75766cdd4f5faed5934e23d6229cc3986fe7ad09766bd26c37b4f`.
The deterministic/independent build and isolated Alibaba runtime acceptance
passed before the root-owned, non-writable release was installed.

The stopped-service pre-migration backup is
`/var/lib/academiccloud/backups/academiccloud-pre-l1-20260822T152800Z.sqlite`
(1,355,776 bytes; SHA-256
`a11a38da37ac0df45ae5eb632184ffca44674210b2fe780d34c4815ee445a7b8`).
Its receipt and `age`-encrypted database/configuration generation were
published to private off-host payload commit
`908c85ab1ddb5e189a440320070148b973235dc0` and sealed at
`a5bbbeb27d6486083a45e4191c55fa0ec6db8479`; a fresh clone independently
rehash-verified the three payload files and contained no plaintext database.

The compiled migration runner applied exactly 023 and 024. Their SHA-256 values
are `b4eeb224e4b44691ed8b11b91fca53eea079c874034008f575bb861066132a42`
and `60c1410b4dc75476841d3f5ee08edd1cdec74c668555cd608fc6fc31e62358d1`.
Post-cutover verification passed schema/history/checksums, SQLite integrity
`ok`, zero foreign-key violations, exact process/frontend identity, one
loopback listener, public and loopback health/readiness, `NRestarts=0`, clean
journal and OOM evidence, and unchanged protected configuration. Backup/live
counts for files, suggestion runs/candidates, and durable Compute jobs were
identical; the five new bibliographic/AI tables were empty, proving no backfill
or full-Library AI wave. The optional canary was skipped because no task-owned
authenticated fixture existed and no pre-existing private resource was used.

Rollback was not required. The checkpoint's rollback was an inseparable app-plus-
database pair: select `53317bb0156589baa21bc69c22e199d200c49840` only together
with restoration of `academiccloud-pre-l1-20260822T152800Z.sqlite`, then verify
schema v22/history 001–022, integrity/FK, exact process identity, and health/
readiness. Never run the previous application against the live v24 database.

RF-SEARCH01 Phase 3 used artifact `9424397852`, build run `32417182890`,
source `b19f9dc5…`, archive SHA-256
`e75f0f1c53e1f0861692db2d58c262d8772232e52610d8fc4bdb98d4dacca6a8`,
and manifest SHA-256
`e152e01b8cd4e9ecd4c4ef1a058c4b555e97a21d3404b0687c7d6ca70d8d8a4a`.
Deterministic build, independent download, local hashes, and production-host
verification passed. Its runtime tree is byte-identical to `1c3bb10…` except
artifact-manifest source identity. The application-only atomic switch required
no migration or database/config/provider change. `1c3bb10…` is the immediate
same-schema rollback; the older Phase 2 v21 rollback remains inseparable from
its recorded pre-migration database/config pair.

Owner-reported R3 browser storage acceptance passed on 2026-08-21 and
`OPS-STORAGE-INCIDENT01` is closed. The separate Metadata Suggestion Core stall
is also closed by the production ADR-031 boundary: migration 022, Core-owned
durable jobs, and a clean GitHub Actions Compute worker. The Core artifact
contains neither PDF.js/native canvas nor Tesseract for this path; the dedicated
worker builds/verifies the pinned ADR-030 runtime and runs one job in one clean
process. No production `MemoryHigh`/`MemoryMax`, OSS, RAM, CORS, Nginx, or paid
infrastructure change was required.

The verified pre-migration database is
`/var/lib/academiccloud/backups/academiccloud-pre-compute-20260820T200600Z.sqlite`
(778,240 bytes; SHA-256
`1c00b6bcb9fe7e5aaf30a28c9e0b797753626d0ec99f79d2ebe799d097a8609a`),
with `integrity_check=ok`, zero foreign-key violations, and encrypted off-host
commit `22b05321febe6bfceb7d1bd609b30b499937b7d2`. Migration 022 SHA-256 is
`07dfe1147d830754dd16dce791dfae6bbe234eeea37985901f763575a4645574`.
Its rollback pair is exact application `08657727…`, that database backup, and
the preserved pre-cutover environment/unit. Never run the v21 application
against live v22 without first restoring this paired database/config state.

Canary Core job `2cb8a0b6-fb37-4b51-bd3b-f9330dbbbde7` succeeded on attempt 2
in final workflow run `32415058752`, job `96574206668`, source `440b556…`.
Core stayed responsive, the result remained a reviewable candidate, canonical
metadata stayed unchanged, workflow artifact count was zero, and workflow/Core
log scans found no signed URL, capability, document/candidate payload, or secret.

The 2026-08-20 `OPS-STORAGE-APP-REPAIR01` attempt verified and installed artifact ID `9405764771`, source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6`, archive SHA-256 `03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4`, and manifest SHA-256 `76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4`. The release initially passed exact process identity, active/running service, one loopback listener, and loopback/public health/readiness. It then failed the final authorized-scope gate: the exact source descends from frozen `RF-SEARCH01` candidate `7bba7b869fd1234c1e7c67002cb93368c299209b` and ships its Search UI/API despite the deployment's explicit no-Search boundary. The same-schema application-only rollback restored `604cb8d…` and passed exact process identity, v21/history 001–021 fingerprint, old-release tree hash, protected configuration hashes, RAM v2 readback, five preserved `uploading` multipart rows, six preserved `pending_upload` file rows, and all four health/readiness probes. No migration, RAM, credential, configuration, Nginx, SQLite, metadata, OSS object/part, or pending-upload mutation occurred. The inactive `8d289702…` release must not be reselected under the no-Search boundary.

The later Owner-authorized `OPS-STORAGE-HOTFIX01` deployment used only artifact ID `9409511861`, source `988bdbf052de1a39b47a1e22ac761c977eec72c8`, GitHub artifact SHA-256 `dec7ef47249e8d148aa7d31b8e0ddf3861dbceb2319dec4aaaa83b94c612b150`, archive SHA-256 `79cea866533e9da1b7d00fb0b3e62a3a3123a90bc20138b8c4d9d40141ed5f33`, and manifest SHA-256 `d6d8b22077d79e9018c6e3eef2cb4454e452995dbc3c1127e574257914e8ce30`. Preflight re-proved exact `604cb8d…`, schema/history, the exact two-commit/two-file release delta, and exclusion of Search/database/migration/configuration/dependency/unrelated product changes. Local and host-side artifact verification passed; the root-owned immutable release was installed, the current pointer switched atomically, and only `academiccloud.service` restarted. Post-cutover verification passed release/process identity, active/running state with `NRestarts=0`, one loopback listener, all four health/readiness probes, unchanged protected configuration and Nginx process identity, unchanged schema v21/history 001–021 fingerprint, five preserved `uploading` multipart rows, six preserved `pending_upload` file rows, and a fresh RAM v2 exact-policy readback. No migration, RAM, credential, configuration, Nginx, SQLite, metadata, OSS object/part, pending-upload, or Search mutation occurred; rollback was not required. This historical prerequisite was superseded by R3 and requires no further action.

The final Owner-authorized `OPS-STORAGE-INCIDENT01-R3-REPAIR` deployment used only artifact ID `9413295334`, source `08657727a17a7ea766ad0d74cc663fa40f91eee1`, GitHub artifact SHA-256 `e72c5c5ef29029dc0d60bedcaf32402e8eaebd416c8a6479024483f7f2dca767`, archive SHA-256 `f18b3068fbcced6816b267c569e4c2080abe589e7fdef37cb812fdc2e2fc33be`, and manifest SHA-256 `a4d51fc043a2b9d830401a8c55e0e7df318fa331e5f87ad2b6376e45f4c2aedf`. Preflight re-proved exact `988bdbf…`, schema/history, the exact one-commit/ten-file release delta with only two runtime files, and exclusion of Search/database/migration/metadata-suggestion/OCR/dependency/application-environment/RAM/credential/unrelated product changes. Local, fresh-runner, downloaded-artifact, and production-host packaged verification passed before immutable installation. The current pointer switched atomically and only `academiccloud.service` restarted. Post-cutover verification passed release/process identity, active/running state with `NRestarts=0`, all four health/readiness probes, zero service errors, unchanged protected configuration and Nginx PID, unchanged v21/history fingerprint, integrity/FK, six preserved `uploading` multipart rows at revision 0, seven preserved `pending_upload` file rows, and one preserved legacy pending file. The existing exact-Origin CORS rule retained POST and added only PUT plus `Content-MD5`; positive and negative live preflights passed without synthetic object bytes. No migration, RAM, credential, application-environment, Nginx, SQLite, metadata, OSS object/part, pending-upload, or Search mutation occurred; rollback was not required. Owner-reported browser storage acceptance later passed; the storage incident is closed, while the independent Metadata Suggestion memory incident remains outside this release's scope.

The release adds bounded random-access PDF inspection (exact object stat plus a 5-byte signature Range probe, a PDF.js range transport with a synchronous aggregate byte budget, and no whole-object buffering above the 32 MiB ceiling), independent filename/embedded/native/OCR evidence branches, deterministic native-text quality, explicit-label extraction anywhere in the exact deduplicated first-15/last-5 window, conservative structured filename parsing, bounded Info/XMP handling, and measured OCR/parser budgets. It includes the committed A–L realistic fixture corpus, a release-local real-Tesseract E2E, and parser fixes for explicit-label title pages after page 4, a spurious `publication_place` of the `出版发行` label, an embedded multi-author truncation bug, and a false `ambiguous` status for multiple person authorities.

Artifact workflow `32286643640` passed on exact source `604cb8d…`; the primary job (including the release-local Tesseract E2E step) and the independent fresh-runner download/verify job are green. GitHub artifact digest is `sha256:859182edf9dd26d9f88f453357b6396e1fed8c62cb47d5f0f641470e011d95a1`; archive SHA-256 is `2e90ab225c234826a1dd471dcfb8673f3003dcd9f449b699536fb54fa822df13`; 5,384 files / 125,846,980 bytes.

The no-persistence private pre-cutover smoke read five anonymized Owner-authorized production PDFs (`REAL-01`…`REAL-05`) through the exact staged release and reported `metadata_mutated=false`, `crash=false`, `raw_error=false`. Two real scanned PDFs produced `ready` suggestions with bounded OCR evidence; three larger scans (76–240 MiB) failed closed inside the 25 s bounded budget (`timeout`) without whole-object download, crash, mutation, or raw-error exposure. Post-cutover acceptance proved exact release/process CWD, schema v21/history 001–021/checksums, integrity/FK, active service, byte-identical public assets, release-local Tesseract 5.5.3, unauthenticated suggestion probes denied, and zero new service errors. No candidate was accepted and canonical metadata remained unchanged. Task-owned staging/diagnostic files were removed.

The historical R3 immediate rollback was application-only to exact `988bdbf052de1a39b47a1e22ac761c977eec72c8` against unchanged v21. It is superseded by the current Core/Compute rollback pair recorded above. The older `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` release remains inseparable from its paired schema-v19 backup and must never run against live v21/v22. RF-METASUGGEST-HARDEN01 is PASS/CLOSED; its production authority is exhausted.

### Historical PROD-09A checkpoint

PROD-09 completed the final combined OCR and transfer release on 2026-08-19. Production runs exact immutable artifact source `9d2fc9b08e2e02c821ef357f149ed928510c2825`, previous release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, at schema v21/history 001–021 with exact repository checksums. Exactly migrations 020 and 021 were applied once; their SHA-256 values are `1a6d363d4ff5dd4325adfaac0b54ce64c8c071c0788ac45f98827504d22887eb` and `67b4699cbfae349c7397223fea9d3eaf36aacdcd9e0cec2daef9c4e130e7f01f`. SQLite integrity is `ok`, foreign-key violations are zero, loopback/public health is `ok`, and readiness is `ready`.

Final artifact workflow `32218607374` passed primary job `95964718499` and independent fresh-runner job `95966983161`. GitHub Actions artifact `9353425023`, `academiccloud-linux-x64-node24-9d2fc9b08e2e02c821ef357f149ed928510c2825`, has bundle digest `sha256:90ecb9bd837532d99008f1fb09d0a01ec7fdcab86cde24624e8988a84af762ba`; deterministic archive SHA-256 `91d9493938ca4611baa1132acea6e051aa96eec5995962ef48f9ba0a47957ddd`; manifest SHA-256 `03eeb5c95803152a46a7ebc2ade63c1429bf5833cb26169d6afda36ed194d4bf`; runtime-evidence SHA-256 `fcebe885c4f1c33c1a0d30b6ac4c963cdca44f646eef7e9c1577040140e97bc1`; 5,384 files / 125,816,418 bytes. Same-path rebuild archives were byte-identical, and both extracted and independent redownload verification passed.

The immutable release contains Node v24.19.0, release-local Tesseract 5.5.3, exact `tessdata_fast` 4.1.0 `chi_sim`, `chi_tra`, and `eng`, and 18 packaged Tesseract libraries. Offline synthetic OCR, no-network runtime behavior, PDF.js/canvas, Argon2id, better-sqlite3, and compiled acceptance passed. RF-METASUGGEST01, L1-UX07, bounded local OCR, true Aliyun multipart upload/resume, and browser-native Range download resume are deployed while PROD-07B destructive lifecycle and the PROD-08R PDF.js/canvas repair remain preserved.

With writes frozen, PROD-09 created fresh schema-v19 backup `academiccloud-pre-prod09-20260819T061155Z.sqlite` (741,376 bytes; SHA-256 `21af5882483c21cfa65854fa592a7805b029b4f31c06c598114d161412c36436`). Receipt `academiccloud-pre-prod09-20260819T061155Z.receipt.json` has SHA-256 `a7e0b20f43a199a37cddae8f81dc628e402b1db5d6428cdf1e4088c5f371fada`; age ciphertext `database-pre-prod09-20260819T061155Z.age` has SHA-256 `4bd11e1a672bdf86122de60a6fa2a8264c5377c6775961997189928f7c1b9790`; non-secret manifest `prod09-backup-20260819T061155Z.manifest.json` has SHA-256 `560c144a7ba7e0eeba08b7ae37cf73924cc64b7999aaa2b1a7870dd988462e8f`. The three private remote blobs were independently fetched and rehashed in off-host backup commit `702695ee9bfd65ee69c2f8cb6c8f105bd4320755`, tree `57f29e756bc3bb5675db3011a94ab54b2e8a33ad`. No plaintext SQLite file was published.

Final changed-risk acceptance proved exact release/process CWD, schema/history/checksums, integrity/FK, one loopback-only listener, service active with autostart disabled and `NRestarts=0`, public assets byte-identical to the immutable release, release-local OCR with no path override, transfer route authorization, valid 206/`Content-Range` semantics against an immutable deployed asset, protected-configuration hashes unchanged, and no new application error, kernel OOM, or cgroup event. No authenticated run-owned target existed, so synthetic destructive acceptance was skipped safely; no arbitrary scholarly document was OCRed or downloaded, no pre-existing resource was used, and no task-owned product residue remains. The exact remote staging directory was removed and the final live smoke passed.

The current rollback is an inseparable app-plus-database pair: select `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` only together with restoration of `academiccloud-pre-prod09-20260819T061155Z.sqlite`, then reverify integrity/FK/schema/history/checksums/health/readiness. Never run the previous application against the live v21 database. PROD-09 rollback was not used. No systemd, Nginx, CSP, DNS, TLS, firewall, autostart, credential, host-package, system-wide Tesseract/Leptonica, global library-path, paid-infrastructure, OSS-data, or main-branch change was made. PROD-09 is PASS/CLOSED and its production authority is exhausted.

### Historical PROD-08R checkpoint

PROD-08R completed the v19 production release on 2026-08-19. At that checkpoint production ran exact immutable release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, previous release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, at schema v19/history 001–019 with exact repository checksums. Migration 019 was the sole pending migration and was applied exactly once in the final successful cutover; its SHA-256 is `c533d8947f4ab8492673c9872f4f11b5cf55d528bd762d7cf7c9682c137f33ff`. Migration 020 was absent. RF-METASUGGEST01 and L1-UX07 were deployed, and the forward-ported PROD-07B account/Library destructive lifecycle and ADR-028 boundaries were preserved.

The first v19 artifact workflow (`32168164654`) failed closed before upload or production contact. Diagnostic workflow `32170306350` proved that artifact native pruning removed `node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node`, the pinned Linux x64 glibc binding required when `pdfjs-dist@6.2.108` loads `@napi-rs/canvas@1.0.7` for import-time `DOMMatrix` initialization. Repair commit `f62766c…` retains only that exact file in addition to the established Argon2 and better-sqlite3 native files, while keeping native pruning, safe paths, complete manifest hashing, production-only dependencies, deterministic packaging, and ELF64 x86-64 verification intact. Pre-prune, post-prune, extracted PDF.js import, and extracted compiled-application probes all passed.

Artifact workflow `32171340265` passed build/runtime job `95822977886` and independent fresh-runner job `95823802592`. GitHub artifact `9337450791` has service digest SHA-256 `8a5c285c52b48f205575d5ee2cf4ae255b790f5f76517f011833e8ffaee3ab5a`; archive SHA-256 is `6438e5235ce1290d450f1beae28bed19c342a5258717f9fd321bc339f06aee32`; manifest SHA-256 is `488c445a9f4677787803c9dbcc9737347d95793ac17cd83e9582b6500fe8bb23`; runtime-evidence SHA-256 is `9080e6a2efa358405257e64f2f83df99937968a1006aff95fd266e071e9fa9f5` (5,329 files; 102,592,679 bytes). Safe archive paths, internal/external manifest equality, full file hashes, exact migrations 001–019, migration-020 absence, and extracted compiled acceptance passed independently.

With the service stopped and writes frozen, PROD-08R created fresh schema-v18 backup `academiccloud-pre-prod08r-20260818T184801Z.sqlite` (667,648 bytes; SHA-256 `338d245d0e0aeb7fec063df069e0750bf3830aceedf32a0f4aad716fb868453b`) and receipt (SHA-256 `2caae7d82611720bef5229c5a692409504cdcc1459b820cdb5630a3f504115fc`). Age ciphertext `database-pre-prod08r-20260818T184801Z.age` is 668,008 bytes, SHA-256 `73d5ad3123c8204a060bb36bc6cf0e45e06e46de39c0199d8df76a22b57007b3`; ciphertext, receipt, and manifest were independently verified in private off-host backup commit `a7369933f31af7839bc833d3d24d30688504276d`. No plaintext SQLite file was published.

Two cutover attempts reached v19 and then failed on quoting in optional post-migration SQL probes. Each attempt failed closed: it stopped the service, preserved the failed v19 database/WAL/SHM in its designated incident directory, restored the exact fresh v18 backup, reselected `bc578863…`, and verified integrity/FK/schema/history/health/readiness. Rollback was therefore used. The final cutover began again from the restored v18 backup, applied exactly migration 019, selected exact `f62766c…`, and succeeded. A later acceptance observation found that `systemctl start` had been a no-op while the old process remained active; the established protected restart boundary corrected process identity to `/opt/academiccloud/releases/f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7/backend` before acceptance closed.

Final changed-risk acceptance proves release/schema/history/checksums exact; SQLite integrity `ok`; zero foreign-key violations; one `127.0.0.1:3000` listener only; service active with autostart disabled and `NRestarts=0`; loopback/public health `ok` and readiness `ready`; public index/JavaScript/stylesheet identity equal to the immutable release; RF-METASUGGEST endpoint presence; and no migration 020, OCR, RF-SEARCH01, extraction, indexing, embedding, retrieval, or RAG residue. No run-owned authenticated synthetic target was created, so destructive synthetic acceptance was skipped for safety; no task-owned residue exists and no pre-existing resource was used. The Owner confirmed that the observed folder-count delta was caused by intentional Owner deletions, not an incident; no further database comparison, audit investigation, restoration, cleanup, or mutation is required for that delta.

Protected systemd, Nginx, security-header, root-only environment, DNS, TLS, firewall, certificate, autostart, and CSP policy were not changed. At that checkpoint its rollback was an inseparable app-plus-database pair: select `bc5788633e0295744905b4ae2dcdfcc5d97635bf` only together with restoration of `academiccloud-pre-prod08r-20260818T184801Z.sqlite`, then reverify integrity/FK/schema/history/health/readiness. That pair was later superseded by PROD-09 and remains historical evidence. PROD-08R is PASS/CLOSED, and its production authority is exhausted.

### Historical PROD-07B checkpoint

PROD-03B completed secret-safe activation, PROD-03C1 enabled the reviewed public HTTPS edge, PROD-04A completed the routine multi-user release, PROD-05A completed first-use polish + Shared Library foundation, PROD-06A completed the First-Use Correction, PROD-07A deployed exact RF-META01, and PROD-07B deployed the bounded recycle/permanent-delete hotfix on 2026-08-19. At that checkpoint production ran exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at unchanged schema v18/history 001–018. The Linux x64 / Node 24 hotfix archive was assembled from the clean exact hotfix commit using the previously accepted PROD-07A Linux runtime dependency tree; archive SHA-256 is `ad084372db6e128cc4a7ff2beae4dbbe7c8b1077c0bb07db926d69bacfbcbca6`, and manifest SHA-256 is `7fe3b0608dddf7431af9cc3bb0ff4a0de40401c2257b2a6eadd4e76eb69287e8` (4,732 entries; 33,764,979 bytes). Production-side narrow verification covered the complete manifest, safe archive paths, exact migrations 001–018, the two approved ELF64 x86-64 native modules, and minimal native loading. The explicit fast-hotfix policy prohibited the broad compiled acceptance suite, so no claim is made that it ran for this package.

At the PROD-07B checkpoint the database was schema v18 with exact migration history and file checksums 001–018. PROD-07A historically applied exactly migration 018 once. PROD-07B invoked no migration command, made no database/schema/metadata change, and finished with `integrity_check=ok`, zero foreign-key violations, and safe aggregates unchanged at accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1. Rollback was not used in PROD-07B.

PROD-07B corrects three bounded defects. Canonical Library holdings now reserve the same selection-control width as sibling root account rows, so a preceding folder cannot make holdings appear as children. Ordinary account-folder `移入回收站` again calls the established direct folder lifecycle endpoint. Recycle exposes explicit-confirmation permanent deletion only for the authenticated global Owner; Library manager/member/contributor/uploader/creator status is insufficient. Account files/folders keep their established purge lifecycle. Library holdings use a separate domain-aware lifecycle that derives the exact Library/domain/group/file/Record/Artifact/Version/object/audit state, proves exclusive ownership/reference, revalidates immediately at the destructive transaction boundary, and fails closed with storage and unrelated lineage untouched if any shared or concurrent path is present. The existing `deleted → purging → purged` state machine and purge-request/storage/purge-complete audit ordering remain authoritative.

Migration 016 created the one canonical Library, three effective active-account memberships, and 28 deterministic transition/backfill graphs for eligible active holdings. Opaque before/after comparison proved all 32 preexisting file IDs, object keys/bytes, checksums, uploader/contributor provenance, Scholarly Record/Artifact/Version lineage, Favorites/private-overlay state, and non-active residue were preserved. No private research row was exposed. Live Library contributions and credential-reset rows remain zero; no live synthetic account, session, upload, reset capability, or OSS object was created for acceptance.

The first live transaction attempt stopped before release switch or migration because an opaque `query_only` snapshot runner could not open SQLite WAL companions under an overly narrow filesystem sandbox. The guard restarted exact `25cdab1…`; follow-up read-only checks proved release, schema v15, integrity, foreign keys, Library-zero state, service state, and health/readiness unchanged. The runner retained `query_only` and was given the reviewed `/var/lib/academiccloud` filesystem boundary SQLite requires; the next invocation passed. This was a pre-migration fail-closed verification anomaly, not a database/application rollback.

Historical PROD-06A focused product acceptance ran only against a disposable schema-v17 synthetic database with injected in-memory storage, private networking, and no listener. PROD-07B added no live synthetic account, session, corpus resource, or object and performed no real recycle or purge. Its exact public index/JavaScript/stylesheet hashes match the hotfix release; the served bundle contains the root spacer, direct folder recycle call, Owner-only account/Library permanent-delete controls, and no RF-METASUGGEST/migration-019/OCR/search residue. Forged-session requests against nonexistent account-folder, account-file, and Library purge targets returned 401. Focused in-memory implementation checks covered canonical Library purge success with retained Artifact Version, shared-contribution conflict with storage/lineage untouched, and recursive account-folder purge.

At that checkpoint the exact hardened service was disabled-but-active behind Nginx with one `127.0.0.1:3000` listener and no non-loopback API listener, unchanged 320/384 MiB cgroup policy, `NRestarts=0`, zero failed units, zero post-hotfix service errors, and zero new kernel/cgroup OOM events since the hotfix start at `2026-08-19 00:25:27 CST`. Observed hotfix `MemoryPeak` was 130,711,552 bytes. Loopback and public health/readiness were 200. Environment, systemd unit, Nginx site/security headers, and logrotate hashes matched preflight; autostart remained disabled. The general readiness auditor recorded the same pre-existing files-domain CSP profile mismatch, nine historical current-boot kernel OOM log matches from an earlier unrelated acceptance process, and the installed unit's existing 10-second start-limit interval. PROD-07B did not change or conceal those findings and performed no daemon reload, reboot, DNS/TLS/Nginx/systemd-policy, firewall, certificate, credential, paid-infrastructure, or unrelated OSS action.

The PROD-07B checkpoint rollback pair was prior release `2322169bc33415734d025010c465900c7fbc6bd9` plus schema-v18 backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite` (667,648 bytes; SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`). The receipt SHA-256 is `aebe203e88ad047e97f765aa0ccbad441dabe6cf193a7fe9bc10125391d55e67`; age ciphertext SHA-256 is `2a5c0decfab2133db708c027416e5f558dfc08ed25e5c7fe11a9b5d29eb0f7ec`. The encrypted database, receipt, and manifest are verified in private off-host `AcademicCloud-Backups` commit `49e72e5`. PROD-08R superseded this as the active rollback pair while preserving it as historical evidence.

The exact certificate for `cloud.ajtlab.top`, root-owned mode-0600 environment, reviewed Nginx site/security headers, HTTP→HTTPS path, loopback API proxy, private OSS abstraction, and `files.ajtlab.top` browser endpoint remain unchanged by PROD-07B. Certificate renewal remains disabled until the edge configuration demonstrably preserves the ACME challenge path and renewal/reload tests pass, and HSTS remains disabled until renewal and rollback are proven.

## Deferred live acceptance

Secret-safe configuration, real TLS/DNS, Nginx/systemd loopback behavior, firewall/listener state, exact OSS CORS and metadata behavior, anonymous-access denial, encrypted off-host backup, isolated v4→v8, v8→v15, v15→v17, v17→v18, v18→v19, and v19→v21 transitions, exact 005–021 production migrations, multi-user/isolation/governance/browser-transfer foundations, canonical shared-Library transition, Owner-assisted credential reset, canonical metadata acceptance, the bounded PROD-07B hotfix, PROD-08R, and PROD-09 now have recorded evidence. The remaining separately Owner-gated production decisions include a real disposable-object permanent-delete confirmation/cleanup, reboot/autostart policy, and the PROD-03C3 operational-hardening cluster (backup cadence, certificate-renewal automation before certificate expiry, HSTS only after renewal/rollback proof, destructive restore drill, and journal retention). PROD-09 did not authorize or consume those gates. Any later deployment, production migration, real-account testing, destructive operation, incident-database inspection, or infrastructure mutation requires a new bounded Owner window.

OPS01A later added repository/local preparation only: the zero-network-default
readiness auditor, verified backup receipt/freshness logic, deterministic
retention dry-run, isolated compiled restore drill, explicit restart-storm
limits, and an inactive journald retention template. None of these repository
artifacts installs a timer/drop-in, runs public/live probes, uploads or prunes a
backup, renews a certificate, restores production, or closes the Owner-gated
PROD-03C3 operations cluster.
