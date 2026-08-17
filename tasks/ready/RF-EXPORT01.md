# RF-EXPORT01 — Structured Scholarly Export Foundations

## Task ID
RF-EXPORT01 — Structured Scholarly Export Foundations

## Goal
Provide versioned, machine-readable exports of the requester's authorized scholarly metadata, citations, evidence, and questions without leaking private or inaccessible data.

## Scope
Define a versioned AcademicCloud JSON export and bounded citation-oriented JSON projection for the current account-private ownership domain. Export selected accessible Records and optionally the authenticated account's own overlay references through one server-authorized snapshot/read transaction. Make the schema and effective-authority hook future-safe for later Library extension, but do not claim or test Library-resource export before Library exists. Include stable IDs, schema version, explicit missing/unavailable markers, and provenance; never include credentials, object keys unless explicitly safe/required, signed URLs, audit data, or another account's overlay. Implement API/CLI-local contract and deterministic tests; add no migration unless proven necessary.

## Non-goals
- No bulk object-byte archive, public/share link, RDF, external sync, cloud upload, scheduled export, production backup replacement, OCR text, or import/mutation.

## Acceptance Criteria
- Export authority is computed at generation time and uses the same effective-access services as product reads; inaccessible IDs are non-disclosing.
- Personal overlay export contains only the requesting account's data even for Library resources. Owner cannot export another account's private research work.
- Output is deterministic for an injected snapshot/time, schema-versioned, bounded, safely encoded, and contains no secrets/capabilities/private object-storage details.
- Concurrent mutations yield one coherent database snapshot or explicit retry; failure creates no partial success artifact.
- Export contracts cover unavailable/recycled/purged artifacts without implying bytes exist and preserve original/derived lineage distinctions.
- Tests cover Owner/Member private domains, cross-account denial, authority injection, secret scan, deterministic ordering, large bounds, and malformed data fail-closed. Library export integration is explicitly deferred to `RF-LIBRARY03` and later verified by `RF-AUTHMATRIX01`.
- Full build/compiled/backup gates and independent privacy/schema-compatibility review pass; dependency/migration delta remains zero unless separately justified.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- identity/metadata/citation/evidence task decisions

## Relevant Modules / Files
- new export domain/service/HTTP and optional local CLI modules
- research/overlay/authority repositories
- `scripts/production-artifact.mjs` if a compiled entrypoint is included
- export/authorization/compiled acceptance tests and docs

## Current State
Blocked on `RF-EVIDENCE01` and `RF-META01`. OPS01A backup is operational recovery, not a scholarly export contract.

## Completed
- Roadmap approves structured export foundations and ADR-014 defines plane-specific authority.
- RF-PLAN01 separates export from backup and future RDF.

## Remaining
- define versioned schema and authority/snapshot bounds;
- implement deterministic authorized export;
- verify privacy, secret safety, lineage, compatibility, and compiled packaging;
- independently review and checkpoint.

## Blockers
Public/cloud delivery, another account's overlay, object-byte archives, RDF scope, or external service/cost requires Owner approval.

## Last Verification
2026-08-17 baseline has verified DB backup/recovery tooling but no scholarly export API/schema.

## Next Action
After `RF-EVIDENCE01`, publish the versioned schema and adversarial authority fixtures, then implement export without delivery/import scope.
