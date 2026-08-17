# OPS01A — Operations Observability & Recovery Preparation

This document describes repository/local preparation only. It does not
authorize production SSH, a public probe, service/timer installation,
certificate renewal, backup upload, pruning, production restore, deployment,
push, or main merge.

## Safe command surface

```powershell
# Zero-network repository status and explicit live-plan preview
npm.cmd run ops:check
npm.cmd run ops:check:plan

# Development TypeScript runner; production artifacts use ops:recovery:prod
npm.cmd run ops:recovery -- backup-create --backup=<snapshot.sqlite> --receipt=<snapshot.receipt.json> --source-commit=<40-hex-sha>
npm.cmd run ops:recovery -- receipt-verify --backup=<snapshot.sqlite> --receipt=<snapshot.receipt.json>
npm.cmd run ops:recovery -- retention-plan --input=<retention-input.json>
npm.cmd run ops:recovery -- restore-drill --backup=<snapshot.sqlite> --receipt=<snapshot.receipt.json>
```

There is deliberately no `--apply`, delete, prune, repair, migrate, network,
credential, encryption, or upload operation in `ops:recovery`.

## Verified backup receipt and freshness

`backup-create` is the only receipt-creation path. In one command boundary it
creates a no-clobber SQLite online backup from the configured `DATABASE_PATH`
using the configured `MIGRATIONS_DIRECTORY`, verifies
migration checksums/current schema, `PRAGMA integrity_check`, foreign keys,
SHA-256, byte length, and safe aggregate row counts, and then publishes the
receipt. The CLI accepts neither an alternate source database nor a migration
directory, and cannot attach a newly dated receipt to an arbitrary existing
snapshot. SQLite validation occurs against a 0600 copy in a task-owned 0700
system-temporary directory, so the selected backup and its directory need no
write access and do not acquire `-wal/-shm` companions.

Only after verification succeeds is a schema-version-1 receipt published with
exclusive/no-clobber semantics and mode 0600. The receipt contains:

- UTC backup-generation time captured by that same creation boundary, plus
  receipt-publication time;
- backup basename only (never an absolute/source path);
- bytes, SHA-256, database schema version, and aggregate counts;
- optional full source commit;
- `offHostStatus: unknown`.

It contains no login/account ID, filename/object key, credential, environment,
session, signed URL, password hash, private key, or age identity. A public age
recipient does not prove successful off-host delivery. That state remains
unknown until a separately approved pipeline produces a non-secret destination
receipt bound to the encrypted artifact hash.

`receipt-verify` re-runs the database verifier and requires every receipt field
to match. Freshness is computed from the bound backup-generation timestamp:

- age `<=24h`: healthy;
- `>24h` and `<=48h`: warning;
- `>48h`: critical;
- more than five minutes in the future: critical.

Malformed, missing, mismatched, or unverifiable evidence never becomes
healthy. A legacy or independently copied snapshot without a receipt created in
the same `backup-create` boundary has unknown freshness; issuing a later
receipt is not supported. Neither creation nor verification accepts an
operator-supplied comparison clock. Receipt creation never overwrites the last
known good receipt.

## Deterministic retention dry-run

`retention-plan` accepts a bounded, regular, non-symlink JSON file:

```json
{
  "now": "2026-08-17T12:00:00.000Z",
  "backups": [
    {
      "name": "academiccloud-20260817T000000Z.sqlite",
      "createdAt": "2026-08-17T00:00:00.000Z",
      "sha256": "<64 lowercase hex>",
      "verified": true,
      "lastKnownGood": true
    }
  ]
}
```

The pure planner unions the newest verified generation in each of 7 UTC daily
buckets, 4 ISO-week buckets, and 6 UTC month buckets. It always keeps the
newest verified generation and every explicitly recorded last-known-good
generation. Stable time/SHA/name/verification/last-known-good tie-breaking
makes output independent of input order, including adversarial duplicates.

Each result is exactly `keep`, `eligible`, or `hold`. Invalid names/times/SHA,
duplicates, future records, unverified records, and ambiguous evidence are
`hold` and therefore never eligible for deletion. `eligible` is a plan only;
the command has no filesystem mutation code and never deletes a file.

## Isolated restore drill

`restore-drill` accepts only a backup whose receipt re-verifies. It rejects a
source whose real path equals the configured live database path. The tool:

1. creates its own fixed-prefix directory directly under the system temporary
   directory;
2. copies the verified source with exclusive creation and mode 0600;
3. re-verifies the copy before use;
4. composes the compiled application against only the copy with production
   schema fail-closed behavior and `InMemoryStorageAdapter`;
5. exercises health/readiness through Fastify injection, opening no listener;
6. runs maintenance in dry-run mode only and reports aggregate counts;
7. re-verifies both copy and source, proving neither changed;
8. in `finally`, validates the real system-temp parent plus fixed task prefix
   and removes only that exact task-owned directory.

There is no migration runner, OSS adapter, credential, external network, or
caller-selected live-database or cleanup target. The configured database is
used only as the exact path that the backup source may not equal. A production
restore remains a separate,
destructive Owner gate governed by `docs/deployment/backup-recovery.md`.

## Service, restart, and log-growth preparation

The checked-in application unit now makes the existing crash-restart behavior
deterministic with `Restart=on-failure`, `RestartSec=5s`,
`StartLimitIntervalSec=300s`, and `StartLimitBurst=5`, while retaining the
accepted hardening and 320/384 MiB cgroup limits. This template change is not
installed or deployed by OPS01A.

Nginx application logs remain bounded by the checked-in daily, 14-generation,
10 MiB compressed logrotate policy. Journald previously had no repository cap;
`deployment/journald/90-academiccloud-retention.conf` is an inactive future
template for a 512 MiB maximum, 2 GiB kept free, 14-day retention, and one-day
file segments. Installing it or restarting journald requires a separate
production operations window.

Disk and memory remain alert/fail-closed concerns. The readiness auditor
reports the 128 MiB whole-host MemAvailable gate, 256 MiB heavy-check guard,
independent swap state, filesystem headroom, service cgroup/OOM evidence, and
bounded log aggregates. It never performs automatic cleanup.

## Artifact and verification boundary

The immutable Linux artifact includes the compiled recovery entrypoint, the
readiness auditor/lib, the restart-storm unit update, and the inactive journald
template. Compiled acceptance creates and verifies a receipt and runs the
isolated restore drill against a task-owned backup copy with memory storage.

All OPS01A acceptance uses local or injected fixtures. Public/live auditor
modes, off-host encryption/upload, scheduling, retention apply, certificate
renewal, service/timer/journald installation, and production recovery remain
separate Owner-gated operations.
