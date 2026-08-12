# AcademicCloud

AcademicCloud is a long-term personal academic digital infrastructure project.

Current goal:

> Build a reliable, secure, maintainable private cloud drive for academic files.

Future layers may add structured academic knowledge management and RAG-based research assistance, but these are outside current scope.

## Current Status

**Layer 1 — Basic Private Cloud Storage (in progress)**

The TypeScript/Fastify/React application now includes SQLite persistence, authentication, the provider-neutral object-storage boundary, the authenticated file lifecycle, and a responsive browser interface. Security/reliability hardening and deployment acceptance remain in progress.

Read:
- `AGENTS.md` — mandatory rules
- `PROJECT_SPEC.md` — product/architecture specification
- `ROADMAP.md` — phased plan
- `CURRENT_STATUS.md` — current state
- `TASK_BOARD.md` — task state
- `DECISION_LOG.md` — durable decisions

## Project Structure

```text
AcademicCloud/
├── backend/
├── frontend/
├── database/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── deployment/
│   └── decisions/
├── tasks/
│   ├── backlog/
│   ├── ready/
│   ├── doing/
│   └── done/
├── workers/
├── plugins/
├── tests/
└── deployment/
```

Some directories remain intentionally empty until their approved Layer 1 task begins.

## Core Principles

- modularity
- fault isolation
- data safety
- storage portability
- small task scope
- documented decisions
- testing before progression
- no silent architecture changes
- no premature OCR/RAG/AI work

## Current Infrastructure

Alibaba Cloud Simple Application Server:
- 2 vCPU
- 512 MB RAM
- 20 GB disk
- Ubuntu 24.04
- Malaysia region

Expected initial academic-file volume:
- less than approximately 100 GB

Initial storage direction:
- Alibaba Cloud OSS behind a storage abstraction

## Development Rule

Repository files and Git are the source of truth. Chat history is temporary context.

## Local Development

Prerequisites: Node.js `24.16.0` (recorded in `.nvmrc`) and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

The frontend runs at `http://127.0.0.1:5173` and proxies `/api` to the backend at `http://127.0.0.1:3000`. Runtime defaults are documented in `backend/.env.example`; copy it to `backend/.env` only when local overrides are needed. `APP_ORIGIN` is the exact browser origin accepted on unsafe API requests and must be an HTTPS origin in production.

Initialize or upgrade the local SQLite schema before database-backed features are used:

```powershell
npm.cmd run db:migrate
```

The default database is `database/academiccloud.sqlite`. Database files and their WAL/SHM companions are ignored by Git. Migration files in `database/migrations/` are ordered, checksummed, and immutable after application; add a new migration instead of editing an applied one.

Repository checks:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Authentication uses Argon2id with 64 MiB memory, three iterations, one lane, and a 32-byte hash. KDF work is serialized with at most four queued operations to preserve memory headroom on the 512 MB target. Run the local benchmark after dependency or runtime changes:

```powershell
npm.cmd run auth:benchmark
```

The authentication HTTP contract and cookie policy are documented in `docs/api/authentication.md`. Layer 1 intentionally has no public registration endpoint.

Object storage is accessed only through `StorageAdapter`. Application-generated opaque keys keep display filenames out of physical storage paths; short-lived exact-object upload and download authorization is implemented by the isolated Alibaba Cloud OSS adapter. Configuration and security boundaries are documented in `docs/architecture/object-storage.md`. Tests use the in-memory adapter or an injected fake OSS client and do not contact cloud services.

The authenticated file-management API now supports folders, direct browser uploads with pending-state verification, active listings, downloads, metadata-only rename/move, recycle-bin deletion and restore, and durable permanent deletion. Its routes, request limits, lifecycle ordering, and stable error codes are documented in `docs/api/file-management.md`.

The API now has secure response headers, secret-safe structured/audit logs, bounded provider calls, revision-based lifecycle CAS, and an explicit stale-state recovery command. The default maintenance run is read-only; operational rules and residual risks are documented in `docs/architecture/security-reliability.md`.

```powershell
npm.cmd run maintenance
npm.cmd run maintenance -- --apply
```

The React interface recovers sessions, browses folders, calculates MD5 incrementally, uploads directly with progress and retry state, exposes recoverable file actions, and previews a narrow safe media-type set through short-lived inline authorization. Its local limitations, browser data flow, and frontend checks are documented in `docs/architecture/frontend.md`.

## License

No public licensing or distribution decision has been made.
