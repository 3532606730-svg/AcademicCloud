# RF-INTEGRITY01 — Storage/Metadata Integrity & Reconciliation

## Goal
Provide a read-only, fail-closed integrity monitor across AcademicCloud's authoritative metadata and object-storage references, promoted earlier because real storage incidents demonstrated that this is foundational reliability work.

## Scope
Bounded checks with `healthy | warning | critical | unknown` evidence for:

- Record ↔ Artifact ↔ Version ↔ StoredFile identity;
- ownership/library/lifecycle consistency;
- expected object existence and provider identity;
- DB size/checksum metadata vs safe provider metadata where comparable;
- missing-object detection;
- provider/metadata mismatch;
- stale multipart sessions;
- incomplete purges;
- orphan/provider-only evidence only when safe bounded enumeration is explicitly authorized;
- rolling fixity status and last-verified timestamps, using provider-native evidence where sufficient and avoiding unbounded full-object downloads on the core host;
- existing provenance/lineage/reference integrity as those models become active.

## Default Safety
Repository/test mode is zero-network. Any live provider scan is separately Owner-gated, bounded by count/time/cost, read-only, and secret-safe.

## Non-goals
- no automatic repair/delete/relink;
- no provider-wide unbounded listing;
- no whole-corpus byte re-download on the 1 GiB core host;
- no mutation timer activation;
- no permission-matrix replacement;
- no inference that unknown evidence is healthy.

## Acceptance
- definite corruption is critical; unavailable evidence is unknown/warning, never silently healthy;
- reports expose only safe identifiers/counts/statuses;
- dry-run/read-only is the only default mode;
- tests cover missing object, mismatch, stale multipart, incomplete purge, false-green dependency propagation and bounded resource behavior;
- source DB/files remain byte-identical;
- migration/dependency delta is zero unless a separately reviewed design proves persistent verification history requires an append-only migration.

## Sequencing
This card is intentionally promoted ahead of the Personal Research Workspace expansion. It can reuse existing `ReliabilityMaintenance`, backup verifier and storage adapter boundaries instead of creating a second maintenance framework.
