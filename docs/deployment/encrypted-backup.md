# Encrypted Off-host Backup (PROD-03C1)

The Owner-approved pure-online zero-new-cost backup design. The production host can
encrypt backups but can never decrypt them: it holds only the public `age` recipient.

## Custody

- Recipient (public): committed here as `deployment/backup/academiccloud-backup-age.pub`
  and installed on the host at `/etc/academiccloud/academiccloud-backup-age.pub` (root:root 0600).
- Identity (private `AGE-SECRET-KEY-1…`): exists ONLY in the Owner's independent online
  password vault (Bitwarden preferred). It must never enter GitHub, chat, logs, evidence,
  the Alibaba production host, or any durable local file.

## Destination

A separate PRIVATE GitHub repository `AcademicCloud-Backups` (Owner-created), dedicated to
recovery backups. Never store these archives in the main `AcademicCloud` source repository.

## Scope

- INCLUDE: production SQLite database/metadata and required configuration/recovery material
  (`academiccloud.env`, exact systemd unit, prepared Nginx edge files).
- EXCLUDE: all Aliyun OSS object bytes (PDFs, books, images, file bodies); no object-level
  mirroring. OSS versioning stays disabled for the no-overwrite guarantee, so permanently
  deleted provider objects are intentionally irrecoverable by design.

## Create a backup (production host, root)

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
systemd-run --quiet --wait --collect --pipe \
  --unit=academiccloud-backup \
  --property=User=academiccloud --property=Group=academiccloud \
  --property=UMask=0077 --property=PrivateNetwork=true \
  --property=RuntimeMaxSec=180 --property=KillMode=control-group \
  --property=NoNewPrivileges=true --property=ProtectSystem=strict \
  --property=ProtectHome=true --property="ReadWritePaths=/var/lib/academiccloud" \
  --setenv=NODE_ENV=production \
  --setenv="DATABASE_PATH=/var/lib/academiccloud/academiccloud.sqlite" \
  --setenv="MIGRATIONS_DIRECTORY=/opt/academiccloud/current/database/migrations" \
  --working-directory="/opt/academiccloud/current/backend" \
  /usr/bin/node /opt/academiccloud/current/backend/dist/operations/backup-main.js \
  create "--output=/var/lib/academiccloud/backups/academiccloud-$TS.sqlite"
```

The compiled operation performs the consistent SQLite online backup, verifies migration
checksums, integrity, and foreign keys, sets mode 0600, and never overwrites. Record the
printed `sha256`, `bytes`, `schemaVersion`, and `counts` in the manifest.

## Encrypt (production host, root; decryptable only by the vaulted identity)

```bash
age -r "$(cat /etc/academiccloud/academiccloud-backup-age.pub)" \
    -o /var/lib/academiccloud/backups/database.age \
    /var/lib/academiccloud/backups/academiccloud-$TS.sqlite
```

Package the configuration/recovery material (env, unit, prepared Nginx files) into a
separate tarball and encrypt it the same way as `configuration.age`. Never keep the
plaintext package or the plaintext environment copy in any staging directory after
encryption. Publish only `database.age`, `configuration.age`, and the non-secret manifest
to `AcademicCloud-Backups`; retain one staging generation on the host.

## Verify a backup

1. `backup-main.js verify --input=<path>` and compare the summary with the manifest.
2. Decrypt `database.age` with the vaulted identity (on an offline/trusted machine, e.g.
   `age -d -i key.txt -o restored.sqlite database.age`) and compare SHA-256 with the manifest.
3. Decrypt `configuration.age` and compare each member SHA-256 with the manifest.

## Isolated restore rehearsal

Mirror the production systemd unit (same hardening, `EnvironmentFile` pointing at a
root:root 0600 rehearsal env with `NODE_ENV=test`, `STORAGE_PROVIDER=memory`, an isolated
`DATABASE_PATH` under `/var/lib`, and a distinct port) and start it as
`academiccloud-rehearsal.service`. Never place rehearsal staging under `/var/tmp`:
`PrivateTmp=true` replaces `/tmp` and `/var/tmp` inside the unit namespace, which fails
mount-namespace setup (`226/NAMESPACE`). Then:

1. `PRAGMA integrity_check` = ok, `PRAGMA foreign_key_check` = empty, migrations current.
2. Compiled app `/api/health` and `/api/ready` return `200`.
3. Compiled maintenance dry-run completes with `mode=dry_run` and no selected/pruned rows.
4. Stop the unit, remove the unit file, `daemon-reload`, and remove the stage exactly.
5. Confirm the production service, listener, Nginx tree, and backup files are untouched.

## Restore in production

Follow `backup-recovery.md` "Production metadata restore" using the decrypted, verified
database and the matching immutable release, with the service stopped and the failed
database preserved in an incident directory. Restore the environment file only from the
decrypted `configuration.age` members, never from an untrusted source.
