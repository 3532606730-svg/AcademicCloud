# Security and Reliability Operations

This document defines the Layer 1 application hardening and conservative local recovery boundary. Production TLS, reverse-proxy hardening, service installation, backup execution, and live OSS validation remain deployment work in L1-E08.

## HTTP and logging baseline

Every `/api` response, including errors, carries:

- `Cache-Control: no-store`;
- a deny-by-default CSP for JSON responses;
- `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`;
- strict referrer and permissions policies;
- same-origin opener and resource policies.

Control-plane request bodies are limited to 16 KiB. Connection inactivity is limited to 10 seconds and request receipt to 30 seconds. Object-storage SDK calls have their own explicit timeout because the HTTP request timeout does not cancel an in-progress provider call.

Fastify's raw request logging is disabled so a query string cannot place a token or signed URL in logs. Completion logs contain only the method, matched route template, status, and duration. Unhandled failures record a stable error type without serializing the original exception or cause. Redaction covers authorization and cookie headers, passwords, session secrets, signed URLs, upload policy/signature fields, AccessKey material, and STS tokens.

Audit events cover exact-origin rejection, session rejection, login outcomes, logout, owner-scoped drive misses, upload completion, soft deletion, restore, and permanent deletion. Events contain stable names/outcomes and authenticated account IDs only. They do not contain request bodies, filenames, object keys, cookies, credentials, provider responses, or signed URLs.

`GET /api/health` is liveness. `GET /api/ready` checks SQLite only. Readiness intentionally does not contact OSS, so a transient provider outage does not trigger a restart loop.

## Resource bounds

The Layer 1 single-process target remains compatible with the 512 MB host:

- Argon2id uses 64 MiB and one active KDF with at most four queued operations;
- file bytes travel directly between the browser and object storage;
- control-plane bodies are capped at 16 KiB;
- OSS requests default to 30 seconds and are bounded to 1-120 seconds;
- SQLite waits at most five seconds for a busy writer and uses full synchronous WAL mode;
- maintenance is a one-shot, serial process with a default batch of 100 and a maximum of 1,000 per state.

No queue server, scheduler, bucket scan, or permanent worker is introduced.

## Durable lifecycle recovery

Every file row has a monotonically increasing `revision`. File updates and pending deletion compare both expected state and expected revision. Provider calls occur outside database transactions.

Upload renewal first advances the pending revision and timestamp, then creates the authorization. A signing failure conservatively delays cleanup; it cannot leave an already-issued authorization pointing at removed metadata. Stale pending cleanup requires a minimum age of one hour and defaults to 24 hours, safely beyond the maximum 900-second authorization lifetime.

Permanent deletion records `deleted -> purging` before provider I/O. Once recorded, `purging` is never rolled back to `deleted`: a timeout may mean the provider deleted the object but the response was lost. Recovery first performs `HEAD`:

| Record | Provider result | Apply behavior |
| --- | --- | --- |
| `pending_upload` | exact key/size/MIME/MD5 | activate with revision CAS |
| `pending_upload` | absent after stale cutoff | remove pending metadata with revision CAS; never delete an object |
| `pending_upload` | mismatch, incomplete metadata, provider error, or provider mismatch | preserve unchanged |
| `purging` | absent | mark `purged` with revision CAS |
| `purging` | exact key/size/MIME/MD5 | delete exact key, then mark `purged` |
| `purging` | mismatch, incomplete metadata, provider error, or provider mismatch | preserve unchanged; never delete |

OSS does not provide an application-usable conditional `DeleteObject` based on the preceding `HEAD`. Therefore `HEAD -> DELETE` is not a strong remote compare-and-swap. Layer 1 mitigates the residual time-of-check/time-of-use risk with opaque keys, no-overwrite upload policy, a private bucket, least-privilege credentials, one application writer, and metadata verification. Bucket versioning and credential policy must be verified during L1-E08 deployment.

## One-shot maintenance command

Run maintenance from the repository root. The default is read-only dry-run:

```powershell
npm.cmd run maintenance
```

Dry-run opens an existing SQLite database in read-only/query-only mode and requires its checksummed schema to be current. It neither creates a database nor applies a migration; run `npm.cmd run db:migrate` separately when required. Argument parsing also completes before the database is opened.

Apply an inspected plan explicitly:

```powershell
npm.cmd run maintenance -- --apply
```

Optional bounded arguments are `--limit=1..1000`, `--pending-age-hours=<integer>` (minimum 1), and `--purging-age-minutes=<integer>` (minimum 1). The command accepts no account ID or object key. Output contains mode, counts, database file IDs, prior state, and stable result codes; it omits owner IDs, object keys, URLs, credentials, and provider error details.

The commands above use the development runner. A production installation that omits development dependencies must build first and use `npm run maintenance:prod -- <arguments>`, which executes `backend/dist/maintenance/main.js`.

An apply run also prunes expired sessions in the same bounded batch. Authentication correctness never depends on pruning: expiry and revocation are checked on every session resolution.

Use a maintenance window with the web process stopped for an apply run. Execute dry-run, inspect `ambiguous_metadata`, `provider_mismatch`, and `storage_unavailable` results, correct configuration or provider availability, then apply and rerun dry-run. Do not repair lifecycle rows with ad hoc SQL and do not delete bucket objects manually.

## Restart and fault expectations

- Active, deleted, and pending metadata survive restart in SQLite.
- A pending browser upload can be verified again or renewed after login recovery.
- A crash before provider deletion leaves `purging`; retry or maintenance resumes it.
- A crash or lost response after remote deletion leaves `purging`; a later absent-object check finishes `purged` without another destructive call.
- Metadata mismatch and provider failure remain visible and preserve data.
- Migration 004 adds the revision token and stale-state index. Normal startup and explicit apply maintenance run checksummed migrations; dry-run only verifies an already-current schema in read-only mode.

The maintenance boundary deliberately does not enumerate the bucket or delete orphan objects. Any orphan investigation, manual provider mutation, backup restore, or multi-instance operation requires a separate approved procedure.
