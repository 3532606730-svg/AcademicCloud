# RF-RECOVERY01 — Metadata Snapshot and Isolated Recovery Foundation

## Task ID
RF-RECOVERY01 — Metadata Snapshot and Isolated Recovery Foundation

## Goal
Create a verified, non-destructive logical metadata snapshot/recovery rehearsal for Pre-OCR research state without replacing SQLite backup or touching production/live data.

## Scope
Define a versioned metadata snapshot manifest/export over ownership, scholarly identity, canonical metadata, provenance/lineage, private overlay (requester/test fixture only), and Library state. Create snapshots exclusively under an approved ignored output root with hash/count/schema/source identity, no-clobber semantics, and no object bytes/secrets. Add an isolated restore verifier that uses a task-owned temp database/storage fixture, never the configured live DB, and validates integrity/current migration/identity counts before and after. Reuse OPS01A cleanup/receipt patterns and `RF-EXPORT01` schemas where compatible.

## Non-goals
- No production backup/schedule/off-host delivery, live restore/apply, retention deletion, object-byte archive, credentials, Time Machine/Rewind, or automatic repair.

## Acceptance Criteria
- Snapshot generation is one coherent read snapshot, versioned, deterministic for injected time, exclusive/no-clobber, and bound to SHA-256/bytes/schema/source commit/safe aggregate counts.
- Private overlay data is included only for the authenticated requester's own overlay or a synthetic test fixture and is never mixed across accounts. Global Owner authority cannot include another account's overlay; infrastructure whole-database backup remains a separate operational/security mechanism. Operational reports contain no private content.
- Restore rehearsal rejects source/live path equality, symlink/escape/unknown cleanup targets, uses a validated task-owned 0700 temp root and 0600 DB, opens no listener, contacts no provider/network, and cannot migrate/mutate the source.
- Tamper/missing/version mismatch/inaccessible planes fail closed and preserve the last known good snapshot/source.
- Source hash remains unchanged; cleanup failure is surfaced with any primary failure and never silently masked.
- Tests cover schema upgrades, every data plane, tamper, interruption, cleanup, privacy/secret scans, source equality, and zero-provider calls.
- Full compiled/artifact gates and independent destructive-path/privacy/recovery review pass; production remains untouched.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- OPS01A backup/restore decisions and `RF-EXPORT01`, `RF-INTEGRITY01`

## Relevant Modules / Files
- operations backup/receipt/isolated-drill modules
- new research metadata snapshot/recovery modules and CLI/tests
- persistence/research/overlay/Library repositories
- artifact/operations docs if packaged

## Current State
Blocked on `RF-INTEGRITY01`. SQLite operational backup exists, but no versioned research metadata logical snapshot/recovery contract exists.

## Completed
- RF-PLAN01 classified full Time Machine as non-blocking and split bounded recovery from integrity monitoring.
- OPS01A provides reviewed no-clobber/temp-cleanup/source-identity patterns.

## Remaining
- define snapshot schema/manifest and privacy modes;
- implement no-clobber generation and isolated verifier;
- test tamper, cleanup, identity, privacy, and compiled packaging;
- independently review and checkpoint.

## Blockers
Production/live restore, destructive pruning, off-host credentials/cost, object-byte archive, or full rewind semantics require explicit Owner authorization.

## Last Verification
2026-08-17 baseline OPS01A tooling covers whole-DB recovery rehearsal only; this approved task remains metadata-contract preparation.

## Next Action
After `RF-INTEGRITY01`, reuse its checks in a no-clobber snapshot and isolated recovery rehearsal; never add an apply-to-live path.
