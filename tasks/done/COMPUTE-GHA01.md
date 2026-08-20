# COMPUTE-GHA01 — GitHub Actions Derived Compute Adapter

## State
COMPLETE IN DEVELOPMENT — production credentials/environment/cutover not authorized.

## Goal
Bind the provider-neutral derived-compute contract to one clean, concurrency-one
GitHub Actions worker without granting Compute Core, SQLite, canonical metadata,
or OSS lifecycle authority.

## Delivered

- `DerivedComputeDispatcher` and strict shared result contracts live outside the
  GitHub adapter.
- Core dispatches only opaque job/attempt identity and non-secret exact routing.
- A protected GitHub environment validates the exact Core origin and Git ref
  before the worker step receives its bootstrap secret.
- Core exchanges that bootstrap authority for one attempt-bound claim only after
  revalidating actor, manager membership, resource fingerprint, and provider
  object metadata.
- The claim contains one short-lived exact-PDF read URL and one ephemeral
  result-callback capability; Core stores only its SHA-256 digest.
- Strict callback validation and one Core transaction persist derived candidates
  and terminal job state.
- Workflow concurrency starts at one per job, uses a clean Ubuntu runner, and
  separates 45-minute job, five-minute execution-step, 120-second worker, and
  existing OCR command timeouts.
- Adapter, routing, secret comparison, invalid/stale callback, worker failure,
  and local HTTP vertical-slice tests are included.

## Security boundary

The worker receives no OSS credential, permanent URL, user secret, object key,
production SQLite access, canonical write authority, or Library/OSS lifecycle
mutation authority.

## Remaining production inputs

- Core secret: least-scoped GitHub workflow-dispatch token.
- Shared secret: one strong bootstrap value installed in Core and the protected
  GitHub environment.
- Non-secret routing: exact repository/workflow/ref and exact Core HTTPS origin.

No production credential was created, rotated, or installed by this task.
