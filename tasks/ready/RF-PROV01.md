# RF-PROV01 — Provenance, Fingerprint, and Safe Duplicate Foundation

## Task ID
RF-PROV01 — Provenance, Fingerprint, and Safe Duplicate Foundation

## Goal
Record canonical acquisition provenance and artifact fingerprints while providing one leak-safe duplicate contract reused by intake and future Library work.

## Scope
Add bounded provenance facts such as acquisition method/time, source/repository reference, original filename, and checksum/fingerprint links to the Scholarly/Physical planes. Implement strict persistence/API/UI and a single duplicate-query service constrained by the requester's effective ownership-domain access. Existing file checksum is authoritative where present; no byte rehash job is added. Add append-only migration(s) after the current head.

## Non-goals
- No private “why do I have this?” note, relationship/lineage graph, metadata suggestion engine, OCR, external metadata service, object-store scan, or Library grouping.
- No credential-bearing URL persistence or production/provider contact.

## Acceptance Criteria
- Canonical provenance is distinct from Personal Research Overlay notes and from later collaborative source-confidence decisions.
- Provenance fields are bounded, validated, safely rendered, and server-authored where authority matters; secrets/capabilities/query credentials are rejected/redacted.
- Duplicate lookup returns only authorized matches. No match and only-inaccessible matches are externally indistinguishable in status, shape, counts, timing class, logs, and suggestions.
- Intake and future Library grouping must consume this contract rather than implement alternative fingerprint searches.
- Updates use revision/CAS and transactions; concurrent edits/duplicate checks cannot overwrite provenance or expose a race winner outside authority.
- Migration, restart, backup/restore, compiled acceptance, frontend/mobile, disabled-account, cross-account, and authority-injection tests pass.
- Independent review focuses on existence leaks, URL/secret leakage, checksum ambiguity, canonical/private mixing, race behavior, and accidental byte/provider work.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- current storage/checksum ADRs and `RF-DOMAIN01` identity decision

## Relevant Modules / Files
- `database/migrations/`
- research domain/repository/service/HTTP modules
- `backend/src/drive/`, `backend/src/storage/`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- migration/privacy/duplicate/compiled acceptance tests

## Current State
Blocked on `RF-META01`. Stored files can carry checksums, but no canonical provenance model or authority-scoped duplicate service exists.

## Completed
- ADR-014 requires original preservation and non-disclosing duplicate behavior.
- RF-PLAN01 split provenance/fingerprint from relationship lineage to keep both reviewable.

## Remaining
- define bounded provenance/fingerprint contracts;
- implement persistence/API/UI and the single leak-safe duplicate service;
- verify privacy, concurrency, backup/restore, and compiled runtime;
- independently review and checkpoint.

## Blockers
Cross-domain duplicate disclosure, provider-wide scans, external services/cost, credential storage, or automatic destructive deduplication require Owner escalation.

## Last Verification
2026-08-17 baseline inspection confirmed checksum metadata exists only on stored files and no provenance/duplicate repository or endpoint exists.

## Next Action
After `RF-META01`, implement canonical provenance plus the reusable authority-scoped duplicate contract; do not add relationship lineage in this task.
