# Backup and Recovery

SQLite contains account password hashes, session digests, logical hierarchy, object references, checksums, and lifecycle state. Treat every backup as sensitive. OSS file bytes are not inside the database backup.

## Consistent backup

The backup command uses the SQLite online backup API while the database may be open. It validates source migration checksums, integrity, and foreign keys; writes a same-directory partial file; validates the snapshot; sets mode 0600; and publishes with a no-clobber hard link. It never copies a live database file directly and never overwrites an existing backup.

Development runner:

```powershell
npm.cmd run backup -- create --output=D:\secure-staging\academiccloud-20260813.sqlite
npm.cmd run backup -- verify --input=D:\secure-staging\academiccloud-20260813.sqlite
```

Compiled production runner:

```bash
academiccloud_op /usr/bin/node \
  /opt/academiccloud/current/backend/dist/operations/backup-main.js \
  create --output=/var/lib/academiccloud/backups/academiccloud-$(date +%Y%m%dT%H%M%SZ).sqlite
academiccloud_op /usr/bin/node \
  /opt/academiccloud/current/backend/dist/operations/backup-main.js \
  verify --input=/var/lib/academiccloud/backups/academiccloud-20260813T000000Z.sqlite
```

`academiccloud_op` is the protected transient-unit runner defined in the
[Production Deployment Runbook](production-runbook.md). A bare `node`, `npm`,
or `sudo -u` invocation does not load the production environment and may target
the wrong database.

The output reports byte length, SHA-256, schema version, and counts only. Record these separately. Store the database and configuration/secrets in separate encrypted off-host systems; never bundle the environment file into an ordinary database archive. Limit local staging and retained generations so the 20 GB disk cannot fill.

## Restore rehearsal

Rehearse in an isolated directory and never point a rehearsal at production OSS credentials:

1. Verify the backup with the matching release migrations and compare recorded SHA-256/counts.
2. Copy it to a new isolated path; keep the backup immutable.
3. Configure `DATABASE_PATH` to the isolated copy, `NODE_ENV=test`, and `STORAGE_PROVIDER=memory` or a purpose-built non-production adapter.
4. Start the compiled API, check health/readiness, authenticate with a designated non-production account, browse representative folders, and confirm file IDs/object references/checksums without issuing real signed URLs.
5. Run `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and compiled maintenance dry-run.
6. Destroy the isolated working copy securely according to the backup handling policy; retain only the approved backup/evidence.

A recovery plan is not accepted until this rehearsal succeeds on a schedule defined by the operator.

## Production metadata restore

This is destructive and requires an approved outage:

1. Stop AcademicCloud and confirm no process holds the database. Disable any maintenance timer.
2. Preserve the failed database and its `-wal`/`-shm` companions by moving them into a timestamped incident directory; do not delete them.
3. Verify the selected backup and its release/schema compatibility in isolation.
4. Copy the verified backup to a new file in `/var/lib/academiccloud`, set `academiccloud:academiccloud` and mode 0600, then atomically rename it to the configured database path while the service is stopped.
5. Start the matching release, verify readiness, session behavior, folder/file metadata, and exact object references. Run maintenance dry-run before any apply.
6. Record recovery point, lost metadata window, release, backup hash, validation results, and any provider reconciliation required.

Do not restore an environment file or credential from an untrusted database archive. Do not “repair” state by deleting OSS objects or editing object keys.

## Scope and residual risk

The database backup recovers metadata, not object bytes. With OSS versioning disabled to preserve no-overwrite upload semantics, a permanently deleted provider object is not recovered by SQLite restore. A separate object-level encrypted backup/replication design is a future cost/security decision requiring approval; until then permanent deletion is intentionally irreversible after the recycle-bin confirmation.

Server-local backups do not survive server loss. Off-host encrypted copies and tested access to their decryption keys are mandatory for production acceptance.
