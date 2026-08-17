# RF-INTEGRITY01 — Pre-OCR Integrity Monitor

## Task ID
RF-INTEGRITY01 — Pre-OCR Integrity Monitor

## Goal
Add a read-only, fail-closed consistency monitor for scholarly identity, ownership, lifecycle, provenance, lineage, overlay references, and Library metadata without automatic repair.

## Scope
Implement repository/local integrity checks with `healthy | warning | critical | unknown` results and bounded evidence for ownership-domain/FK consistency, Record↔Artifact↔Version↔stored-file identity, lifecycle availability, checksum presence, lineage cycles, orphaned overlay/page/citation/evidence/catalog links, and Library membership/resource ownership. Use read-only transactions and injectable/test storage evidence; any live/provider mode remains explicit and separately Owner-gated. Add CLI/report tests and artifact inclusion if needed; no migration expected.

## Non-goals
- No repair/delete/relink, production contact, provider-wide scan, background resident service, timer activation, byte hashing job, metadata snapshot/restore, or permission-matrix replacement.

## Acceptance Criteria
- Required unknown evidence never becomes healthy; definite corruption is critical; advisory gaps are clearly separated.
- Default repository/test mode is zero-network/read-only and uses synthetic fixtures. No command exposes apply/fix/delete or accepts arbitrary mutation commands/paths.
- Checks are bounded by count/time/memory and cannot load an unbounded 1 GiB-host dataset/report into memory.
- Reports include only safe IDs/counts/statuses needed for repair planning, never credentials, URLs with capabilities, private notes/content, search/history, annotations/citations/evidence text, or cross-domain fingerprints.
- Source DB/files/fixtures remain byte-identical; failures preserve evidence and do not mutate transaction state.
- Tests cover each corruption/unknown/boundary, adversarial symlink/path/output no-clobber, secret scan, and false-green dependency propagation.
- Full tests/typecheck/build/compiled/artifact gates and independent mutation/false-green/privacy review pass; migration/dependency delta is zero.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- OPS01A read-only readiness patterns and all RF identity/Library decisions

## Relevant Modules / Files
- new research-integrity operations modules/CLI/tests
- persistence/research/overlay/Library repositories
- `scripts/production-artifact.mjs` and operations docs if packaged

## Current State
Blocked on all product tasks through `RF-LIBRARY04`. OPS01A verifies operational readiness/backups but not future research-model consistency.

## Completed
- Approved integrity boundary is detect/report without destructive repair.
- RF-PLAN01 split monitoring from snapshot/recovery and permission-matrix work.

## Remaining
- define bounded status/check dependency model;
- implement read-only checks/report/CLI and synthetic corrupt fixtures;
- verify no-write/no-secret/false-green/resource behavior;
- independently review and checkpoint.

## Blockers
Production/provider access, repair automation, destructive cleanup, paid monitoring, or unbounded resource use requires Owner escalation.

## Last Verification
2026-08-17 planning baseline: OPS01A patterns exist, but the research schema is future and has no integrity monitor.

## Next Action
After `RF-LIBRARY04`, implement fixture-first read-only checks with all mutation paths absent.
