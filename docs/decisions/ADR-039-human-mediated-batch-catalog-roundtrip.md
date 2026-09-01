# ADR-039: Human-mediated batch cataloguing roundtrip

- Status: Accepted
- Date: 2026-09-01

## Context

The frozen v11 bibliography/authority validator remains sound, but current small local reasoning models have not established a reliable production path across the multilingual corpus. Continuing model-specific parser work would increase risk without improving the canonical authority boundary. The Owner instead authorized an offline, human-mediated evidence/results roundtrip. External reviewers are not AcademicCloud runtime dependencies and their output is untrusted.

Core must remain small and must not absorb PDF rendering or PaddleOCR. Existing front-matter extraction intentionally belongs to Local Compute under ADR-031/ADR-037. The workflow also must avoid a new persistent batch table or schema migration when exact source identity and preview CAS can be checked statelessly.

## Decision

AcademicCloud adds `academiccloud.catalog-batch.v1`, `academiccloud.catalog-results.v1`, and deterministic filename policy `academiccloud.filename.v1`.

Core creates a private, in-memory export capability scoped to an exact Owner-managed Library, exact resource IDs, and their existing immutable source fingerprints. The capability expires after 24 hours and is lost on Core restart. Local Compute uses it only to renew short-lived signed source access, reuses native PDF text plus selective PaddleOCR, and emits a bounded JSON-only ZIP. It does not enable or depend on the main reasoning worker.

The final manifest and its canonical SHA-256 are echoed in the results file. Import never matches by filename, title, array position, OCR title, or proposed filename. Core requires `resourceId`, manifest source identity, result source identity, and current live source identity all to agree.

Import is always preview then explicit Owner-selected apply. The preview digest and each per-resource preview version bind the exact result, file revision/content identity, current metadata/bibliography revisions, proposed filename, and collision state. Apply rechecks them inside the mutation transaction.

External output cannot bind internal contributor IDs or authority IDs. On Owner confirmation, changed fields pass through existing canonical repositories and become human-authoritative under that Owner account. Existing audit vocabulary records `libraries.metadata_update`; no new payload-bearing audit channel is introduced. Object keys never change.

## Bounded V1 limits

- 500 resources per batch;
- first 15 plus last 5 pages, at most 20 pages;
- 16,384 text characters per evidence page;
- 262,144 text characters per resource;
- 8 MiB results JSON;
- 160 MiB uncompressed / 128 MiB compressed evidence ZIP;
- one selective OCR page job at a time under the existing inspector limits.

No PDF or rendered image bytes enter the final package. Whole-document OCR remains unauthorized.

## Consequences

AcademicCloud gains a zero-added-cost, model-independent cataloguing path while preserving server authority and human review. Export has one deliberate local step: the website prepares the private request and the existing Owner Local Compute machine produces the shareable ZIP. This maintains the Core/Compute boundary without adding a resident service or database queue type.

The private request must never be shared with the external reviewer. Core restart or capability expiry requires preparing a new request, not weakening identity checks. A results file can be previewed later because it carries the immutable manifest; live source or metadata changes fail closed.

No production deployment, database migration, external AI API, main worker activation, or production resource mutation is authorized by this ADR.

## Rollback

Remove the Library UI entry and catalog-batch routes/Local Compute CLI. No database rows or schema objects need reversal. Existing resource bytes, object keys, canonical metadata, authority history, and AI evidence remain unchanged.
