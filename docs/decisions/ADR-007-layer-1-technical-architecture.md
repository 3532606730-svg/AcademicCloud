# ADR-007 — Layer 1 Technical Architecture

**Date:** 2026-08-12
**Status:** Accepted
**Scope:** Layer 1 — Basic Private Cloud Storage

## Context

AcademicCloud Layer 1 must provide a reliable private cloud-drive MVP for personal academic files while preserving clear module boundaries and recoverable data operations.

The current local development environment is Windows 11 x64 with Node.js 24 LTS, `npm.cmd`, and `npx.cmd` available. There is no standard Python development environment, and Docker, WSL, PostgreSQL, and Redis are not current dependencies.

The target server is an Alibaba Cloud Simple Application Server with Ubuntu 24.04, 2 vCPU, 512 MB RAM, and a 20 GB system disk. The application server must remain a lightweight control plane. File bytes will live in object storage rather than on the server disk, with Alibaba Cloud OSS as the initial provider behind a storage abstraction.

Layer 1 is initially intended for personal or single-user use, with less than approximately 100 GB of academic material. The database stores metadata rather than file bytes. The design must support future replacement of infrastructure components without creating present-day complexity or pulling Layer 2 or Layer 3 work forward.

## Decision

The approved Layer 1 technical baseline is:

| Area | Decision |
|---|---|
| Backend | Node.js 24 LTS, TypeScript, and Fastify 5 |
| Frontend | React, TypeScript, and Vite as a client-side SPA |
| Database | SQLite with `better-sqlite3` behind the persistence abstraction |
| Authentication | SQLite-backed server-side opaque sessions |
| Password hashing | A mature, maintained memory-hard implementation; Argon2id is preferred |
| Package management | npm workspaces with one committed `package-lock.json` |
| Production entry point | Nginx for HTTPS, static frontend delivery, and reverse proxying |
| Application process | One Node.js process managed by systemd |
| Containers | No Docker for the current Layer 1 deployment |
| Additional services | No Redis, message queue, or permanent worker |
| Object storage | `StorageAdapter` with an `AliyunOssStorageAdapter` implementation |
| Upload | Server authorization followed by short-lived, restricted browser-direct upload to private OSS |
| Download | Server authorization followed by a short-lived signed download URL |

### Node.js Version Policy

Layer 1 uses the Node.js 24 LTS release line. When dependencies are installed or production is deployed, the project will use the latest supported Node.js 24.x security patch version available at that time. The exact version will be fixed and recorded in the relevant implementation or deployment task.

The architecture does not permanently pin a specific Node.js 24.x patch version. SETUP-003 does not upgrade the currently installed Node.js runtime.

### Frontend and API Model

The frontend is built outside the production server and deployed as static files. Nginx serves the SPA and proxies same-origin `/api` requests to the Fastify application.

Nginx is deployment infrastructure only. Business code must not depend on Nginx-specific behavior or APIs.

```text
Browser
    ↓ HTTPS
Nginx
    ├── static SPA
    └── /api → Fastify
                  ↓
             SQLite metadata
```

File upload bytes bypass the application server:

```text
Browser
    ↓ request upload authorization
Application API
    ↓ short-lived restricted authorization
Browser
    ↓ direct upload
Private Alibaba Cloud OSS
```

The application must allocate an opaque object key and create an explicit upload state before authorizing an upload. A completed upload must be verified before its logical file metadata becomes active. Downloads require server-side authorization before a short-lived signed URL is issued.

### SQLite Boundary

`better-sqlite3` is selected because the Node.js built-in `node:sqlite` API has not yet reached Stable status at the time of this decision.

Business modules must not depend directly on `better-sqlite3` or SQLite-specific APIs. SQLite belongs behind the persistence and repository boundary. The `auth`, `drive`, and `storage` business modules interact with persistence through explicit repository and transaction interfaces.

If `node:sqlite` becomes stable and sufficiently mature, it may be evaluated as a replacement. Such a replacement must not require changes to the `drive`, `auth`, or `storage` business modules.

### Authentication and Password Hashing

Authentication uses an opaque server-side session identifier stored in a secure cookie, with session state persisted in SQLite. Sessions survive application restarts and can be revoked without introducing Redis or JWT lifecycle complexity.

Password hashing must use a mature, maintained memory-hard implementation. Argon2id is preferred. The exact npm package, memory cost, time cost, and authentication concurrency limit are deferred to the Authentication implementation task and must be chosen after measuring the 512 MB production constraint. The project will not design or implement custom cryptography.

### Minimal Module Boundaries

Layer 1 uses five application boundaries:

- `platform`: application composition, validated configuration, logging, HTTP bootstrap, and health checks.
- `auth`: account representation, password verification, sessions, and authentication/authorization guards.
- `drive`: logical files, folders, upload lifecycle, rename, move, recycle bin, and restore behavior.
- `storage`: the `StorageAdapter` contract and provider adapters, initially including `AliyunOssStorageAdapter`.
- `persistence`: database connection, migrations, transactions, and repository implementations.

Files and folders remain together in `drive` because they share hierarchy, naming, move, ownership, and recycle-bin invariants. No empty OCR, RAG, connector, queue, or worker business modules will be created for Layer 1.

The dependency direction is:

```text
HTTP routes
    ↓
auth / drive services
    ↓
repository and StorageAdapter interfaces
    ↓
persistence and Aliyun OSS adapters
```

Alibaba Cloud OSS SDK imports are permitted only inside the Alibaba OSS adapter and its infrastructure wiring.

## Alternatives Considered

### Python with a lightweight framework

Python with FastAPI or a similar lightweight framework is technically capable of supporting Layer 1. It was not selected because the current workstation has no standard Python environment, the frontend already requires Node.js tooling, and Layer 1 has no Python-specific workload. A second runtime would increase setup, deployment, debugging, and maintenance cost without a current benefit.

### Server-rendered or backend-integrated frontend

A server-rendered interface could reduce the initial frontend tool count, but the file tree, upload progress, file actions, recycle bin, and preview state favor a client-side application. Coupling those interactions to server templates would make later maintenance harder.

### SSR or a Next.js-style framework

Layer 1 does not require SEO, public content rendering, or per-request server rendering. SSR would add build and runtime complexity and consume server resources without a matching product requirement.

### PostgreSQL

PostgreSQL provides stronger multi-user concurrency, remote access, and scaling options. Running it locally on the 512 MB server would add avoidable resident memory and administration. A managed PostgreSQL service would add cost, network dependency, and operational scope. SQLite is sufficient for a single application process and low-concurrency metadata workload.

PostgreSQL remains the preferred migration target if the project later requires multiple application instances, sustained concurrent writes, database high availability, or managed recovery.

### JWT authentication

JWT does not provide a useful advantage for the current same-origin, single-application deployment. It would add token revocation, refresh, rotation, and logout complexity. Persistent opaque sessions are simpler to revoke and audit.

### pnpm

pnpm can reduce dependency disk usage, but it is not part of the confirmed environment. npm is already present with Node.js, supports workspaces and reproducible lockfile-based installation, and avoids relying on a temporary cached pnpm installation.

### Docker, Redis, queues, and permanent workers

These components are not needed for the current topology and would increase memory consumption and operational failure modes. Periodic maintenance may later use a bounded systemd timer or one-shot command if required; this does not justify a permanent worker or queue.

### Node.js built-in `node:sqlite`

The built-in API would remove a native third-party binding, but it has not yet reached Stable status. It may be reconsidered later through the persistence boundary.

## Consequences

Positive consequences:

- The local and production stacks use one primary runtime and language family.
- The production host runs only a reverse proxy and one application process in addition to the operating system.
- Static frontend delivery does not create an SSR memory burden.
- SQLite avoids a separate database daemon while retaining transactional metadata operations.
- Direct OSS upload keeps large file bytes out of the 512 MB application server.
- Explicit repository and storage interfaces preserve replaceability.
- Server-side sessions avoid Redis and simplify revocation.

Negative consequences:

- SQLite allows only one writer at a time and does not support horizontal application scaling without architectural change.
- The SQLite metadata file is a critical recovery asset and requires reliable off-server backup.
- `better-sqlite3` is a native dependency and must be installed or packaged for the target Linux runtime.
- Database operations and OSS operations cannot share a single atomic transaction; explicit states and reconciliation are required.
- A SPA requires a frontend build and careful same-origin routing configuration.
- A single application server is not highly available.

## Resource Constraints

- Production uses one Node.js process; Node cluster mode and multiple application workers are not part of the baseline.
- Frontend and TypeScript builds occur on the local workstation or a suitable build environment, not on the 512 MB server.
- Production dependencies containing native code must be prepared for the target Linux platform; Windows `node_modules` must not be copied to Ubuntu.
- File bytes must not be buffered through the application server during normal uploads or downloads.
- Nginx, Fastify, and SQLite must be measured under realistic Layer 1 operations before deployment acceptance.
- If the control-plane workload cannot retain safe memory headroom on 512 MB, increasing server memory is preferred over weakening durability or security.

## Security Implications

- The OSS bucket remains private.
- Permanent Alibaba Cloud credentials must never be exposed to the browser.
- Browser upload authorization must be short-lived, least-privilege, and restricted to the intended object operation and opaque object key.
- Download URLs must be short-lived and issued only after server-side ownership checks.
- The server must derive the owner from the authenticated session and must never trust a client-provided `owner_id`.
- User-facing filenames are metadata only and must not be used as trusted storage keys.
- Session cookies must use secure production attributes, including `HttpOnly`, `Secure`, an appropriate `SameSite` policy, and a bounded lifetime.
- State-changing requests require CSRF protections appropriate to the final cookie policy.
- Password hashing uses a maintained memory-hard implementation with parameters tested against the production memory limit; custom cryptography is prohibited.
- Input validation, safe filename handling, authorization checks, login throttling, and secret-free security logging are required.
- Upload completion must not trust the browser alone; the application must verify the expected object before activating metadata.
- Destructive logical operations default to recoverable soft deletion.
- SQLite files, configuration, secrets, and backups require restrictive filesystem permissions and separation from public static files.

## Migration / Exit Strategy

### Database

Versioned migrations and repository interfaces isolate the database implementation. Application-generated identifiers and explicit metadata fields should be used so that a future migration can export SQLite data, import it into PostgreSQL, validate relationships and object references, perform a controlled cutover, and retain a pre-cutover SQLite backup for rollback.

SQLite backup and restore procedures must use a consistent database backup mechanism rather than copying an actively changing database file without coordination.

### SQLite Binding

Replacing `better-sqlite3` with a stable future `node:sqlite` implementation is confined to persistence wiring and repository implementations. Business-module contracts remain unchanged.

### Object Storage

Logical metadata records the storage provider and opaque object reference separately from the display filename. A future storage provider is introduced by implementing `StorageAdapter`, copying objects without mutating the source, validating integrity, updating metadata in a controlled cutover, and retaining rollback access until verification is complete.

### Frontend and Reverse Proxy

The SPA depends on the application API rather than Nginx-specific behavior. Nginx can be replaced by another TLS/static/reverse-proxy implementation without changing business modules. The frontend can be replaced independently as long as the API contract remains stable.

### Authentication

Sessions are accessed through the authentication and persistence boundaries. A future change in session storage must not alter file ownership or drive-domain rules.

## Deferred Decisions

The following decisions are intentionally deferred to their relevant approved tasks:

- the exact Node.js 24.x security patch used for dependency installation and deployment;
- exact npm dependency versions and version ranges;
- the password-hashing npm package, Argon2id memory/time cost, and authentication concurrency limit;
- authentication route details, session schema, session lifetime, rotation, cleanup, and CSRF mechanism;
- SQLite schema, migration tooling, pragmas, connection settings, and backup schedule;
- detailed OSS STS policy, authorization lifetime, upload protocol, multipart/resume thresholds, CORS configuration, and callback/finalization mechanism;
- Nginx configuration, TLS certificate automation, systemd hardening, logging retention, and deployment rollback procedure;
- measured production memory limits and any swap or systemd resource-control settings;
- basic preview implementation details;
- any PostgreSQL migration, additional storage provider, or higher-layer academic feature.

None of these deferred decisions authorize Layer 1 implementation to begin without an explicit task approval.
