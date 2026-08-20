# JOB-CORE01 — Lightweight Durable Background Jobs

## Goal
Create a minimal durable job abstraction before longer metadata/OCR/extraction work expands beyond comfortable request lifetimes.

## Contract
A small SQLite-backed model should support at least:

```text
queued → running → succeeded
                 ↘ failed
queued/running → cancelled (only where operation semantics permit)
```

with kind, resource identity, progress, attempts, created/started/finished timestamps and stable safe error code.

## Architecture
Start as a logical module and one bounded worker/concurrency=1. No Redis, RabbitMQ, Celery, Kubernetes or microservice requirement. Preserve the option to move the worker to another machine later without moving authoritative file/database logic into an untrusted compute plane.

## Initial Use
Do not automatically migrate all existing work. First prove the abstraction with a bounded non-destructive task; later metadata deep recognition/OCR can adopt it through separate cards.

## Safety
Jobs must be idempotent or explicitly guarded, authority-scoped, restart-safe, bounded in CPU/memory/time and unable to write canonical metadata without the existing review/acceptance authority.

## Acceptance
Restart does not silently lose queued state; duplicate worker execution cannot double-apply a guarded operation; user Activity Center can consume stable progress/status without reading operational logs.
