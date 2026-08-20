# OPS-OBJECTBACKUP01 — Independent Object-Byte Backup

## Goal
Remove the current single-copy risk for authoritative academic file bytes. SQLite backup protects metadata but cannot recreate lost OSS objects.

## Phase 1 — Design only
Before any paid/provider action, compare bounded options for the expected <100 GB corpus, including a second cloud provider, encrypted local/NAS copy, or other approved target. Evaluate cost, egress, encryption/key custody, retention/versioning, deletion propagation and restore ergonomics.

## Phase 2 — Owner-gated implementation
Only after explicit Owner approval of provider/cost/credentials:

- maintain an independent second copy of authoritative active object bytes;
- incremental/no-clobber by default;
- verify copied bytes or trustworthy end-to-end checksum evidence;
- retain a manifest/receipt separate from secret material;
- test restore of a small isolated sample without overwriting production;
- define how permanent deletion interacts with backup retention.

## Boundaries
No provider signup, charge, credential creation, bucket creation, mass copy, retention deletion or production mutation is authorized by this planning card.

## Acceptance
The Owner can answer: where is the second copy, how recent is it, how is it verified, which key unlocks it, and how would one lost object be restored safely?
