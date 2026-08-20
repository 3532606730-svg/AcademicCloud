# JOB-CORE01 — Lightweight Durable Background Jobs

## State
COMPLETE IN DEVELOPMENT — production migration/cutover not authorized.

## Goal
Provide the smallest restart-safe, SQLite-backed job authority required to move
heavy Metadata Suggestion execution out of the Core request process.

## Delivered

- Append-only development migration `022_durable_derived_compute_jobs.sql`.
- Provider-neutral `queued | running | succeeded | failed` lifecycle with a
  guarded failed-to-queued retry attempt.
- Opaque job/resource/scope identity, progress, attempts, timestamps, durable
  deadline, stable error codes, idempotency/source fingerprint, attempt
  correlation, provider receipt, and result reference/digest.
- Digest-only ephemeral callback capability storage; no operational secret in a
  job row.
- Duplicate request, execution, and identical callback safety; changed/stale
  callbacks fail closed.
- Durable timeout classification independent of request lifetime.
- Restart/migration persistence, transition, retry, timeout, duplicate, and
  callback regression coverage.

## Boundaries preserved

- SQLite and job authority remain in Core.
- No Redis, RabbitMQ, Celery, Kubernetes, resident production worker, or
  production database change.
- Canonical metadata remains writable only through the existing manager review
  and CAS path.

## Evidence

Implemented as part of `ARCH-COMPUTE01` from base
`67f6958401a9d826f44c67eba7e3f0c662b6d7c2`. Full checkpoint evidence is
recorded in `OCR-METADATA-GHA01` and ADR-031.

## Production gate

Production remains schema v21/history 001–021. Migration 022 requires a new
Owner-authorized backup/migrate/deploy gate and has not been applied.
