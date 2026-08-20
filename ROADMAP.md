# AcademicCloud Roadmap

**Last reconciled:** 2026-08-21

## Product Direction

AcademicCloud is long-term academic digital infrastructure for a small invitation-only academic community.

Durable product rule:

> **Owner-curated shared academic corpus + private per-user research activity.**

Long-term architecture remains:

```text
Reliable Core Resource Handling
        ↓
Controlled Accounts & Governance
        ↓
Shared Academic Corpus + Private Personal Scholarly Workspace
        ↓
Research Infrastructure
        ↓
Source-Grounded Intelligence
```

The current reliability interlock changes sequencing, not this model.

## Current Reality — Operational Maturity Interlock

Real use on 2026-08-20 exposed a gap between strong repository/unit/artifact
evidence and end-to-end product operability. The exact RAM, provider-runtime,
CORS, and R3 application repairs are deployed as `08657727…`; Owner-reported
browser storage acceptance passed and `OPS-STORAGE-INCIDENT01` is closed. Its
complete evidence remains in the completed incident and repair cards.

A later, independent Metadata Suggestion attempt exposed the next operational
boundary: PDF.js rendering, native canvas/PNG, and Tesseract inside the Core Node
request process pushed its constrained cgroup into memory reclaim. The process
did not OOM or restart, but the event loop stalled and therefore blocked Auth,
Library, health, and unrelated requests. The Owner authorized the first gradual
Core/Compute separation rather than a memory-limit-only workaround.

`ARCH-COMPUTE01` is now complete in development. Migration 022 supplies durable
job authority in Core; GitHub Actions is the first adapter behind a
provider-neutral Compute interface; the existing bounded front-matter OCR and
Metadata Suggestion heavy path runs one page at a time in one clean worker; and
the browser uses durable queued/processing/succeeded/failed state. Core retains
all Auth, Library, SQLite, storage, suggestion-review, and canonical metadata
authority. Production remains v21 and unchanged pending a separate Owner gate.

This creates a temporary mandatory interlock before broad new scholarly features:

```text
ARCH-COMPUTE01 Owner review / production cutover decision (STOP)
→ RF-SEARCH01 production closure only after a later explicit decision
→ L1-UX08 Upload Activity & Source Recovery
→ OPS-DEPENDENCY01 Dependency Health
→ QA-GOLDEN01 Real-Browser Golden Journeys
→ ERR-BOUNDARY01 Unified Error Boundary
→ DOC-TRUTH01 Repository Truth Hygiene
→ RF-INTEGRITY01 Storage/Metadata Integrity & Reconciliation
→ OPS-OBJECTBACKUP01 Independent Object-Byte Backup
→ FE-DECOMP01 Frontend Decomposition
→ CONTRACT-CORE01 Shared API Contracts
→ resume Personal Research Workspace
```

No item in this sequence silently authorizes production mutation, paid infrastructure, credentials, migrations, destructive repair, or automatic progression.

## Why this interlock exists

The project already has strong foundations:

- explicit Physical Artifact / Scholarly Resource / Artifact Version identities;
- one governed shared Library plus private research overlays;
- browser-direct object storage, multipart resume and Range download;
- SQLite + modular monolith appropriate to current scale;
- canonical metadata separated from reviewable derived suggestions;
- revision/CAS and fail-closed lifecycle transitions;
- immutable release artifacts, migration checksums, DB integrity, backup receipts and restore drills.

The weak points exposed by real use are different:

- health/readiness can remain green while a core provider path is unusable;
- real user journeys are underrepresented in release gates;
- raw network errors can leak to the product UI;
- current upload state is not globally visible;
- browser source-file recovery is weaker than server multipart recovery;
- production long-running extraction/OCR remains tied to request lifetimes until
  the separately gated ARCH-COMPUTE01 cutover;
- SQLite metadata backup is stronger than object-byte redundancy;
- repository current-state facts have drifted across Markdown files;
- frontend orchestration has grown too concentrated in `App.tsx`.

## Near-Term Cards

### OPS-STORAGE-INCIDENT01 — complete
Diagnosis proved every boundary. The bounded RAM repair restored raw stat,
Range-read, and ListParts access. Exact R3 source `08657727…` deployed the
remaining empty-marker/abandon-routing repair and exact CORS delta. Production
invariants and pending state were preserved, and Owner-reported browser storage
acceptance passed. The later Metadata Suggestion memory stall is separate.

### ARCH-COMPUTE01 — development complete, production gated
`JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01` implement the smallest durable
Core-owned job abstraction and one clean GitHub Actions worker. The existing
front-matter OCR/metadata behavior is migrated rather than redesigned. Core no
longer depends on PDF.js/canvas/Tesseract for the migrated path; Compute owns
those runtime checks and returns candidates only. Stop for Owner review before
any production migration, secrets, environment, artifact, or cutover action.

### RF-SEARCH01 — implementation/artifact complete
Metadata/name catalogue search is green in development. Final source `7bba7b869fd1234c1e7c67002cb93368c299209b`; exact artifact is built and independently verified. Production remains blocked until the storage incident is closed and a real-browser pre-cutover journey passes.

### L1-UX08 — Upload Activity & Source Recovery
Create a cross-page Activity Center for immediate upload feedback. Reuse the current `File` first; where supported, persist a `FileSystemFileHandle` via IndexedDB and revalidate file identity before resuming existing multipart parts. `选择原文件继续` is a fallback, not the default.

### OPS-DEPENDENCY01 — Dependency Health
Add Owner-only health information for application, database, storage stat/range/multipart capability, backup freshness, disk/memory and other bounded critical dependencies. Do not turn readiness into expensive unbounded probes.

### QA-GOLDEN01 — Real-Browser Golden Journeys
Make the actual product path part of release evidence: login → Library → upload → progress/complete → details → metadata suggestion → download/preview → search → favorite → recycle/restore, with safe fixtures and zero residue.

### ERR-BOUNDARY01 — Unified Error Boundary
Map raw browser/provider/internal errors into stable user-actionable classes. Preserve safe provider/request correlation server-side; never expose secrets, signed URLs, object keys, raw stacks, or provider payloads.

### DOC-TRUTH01 — Repository Truth Hygiene
Use `CURRENT_STATE.json` as the compact current pointer, remove duplicated stale production facts from explanatory docs, and add checks that prevent contradictory production/schema/task declarations.

### RF-INTEGRITY01 — Integrity & Reconciliation
Promoted from the later Pre-OCR queue. Detect missing objects, metadata/provider mismatch, stale multipart, incomplete purge, orphan/provider-only evidence where safely enumerable, and rolling fixity status. Detect/report first; no automatic repair.

### OPS-OBJECTBACKUP01 — Independent Object-Byte Backup
Design and then, only after Owner cost/provider approval, establish a second independent copy of authoritative object bytes. Database backup alone is insufficient because original PDFs are the primary asset.

### JOB-CORE01 — complete within ARCH-COMPUTE01
Development migration 022 now provides `queued/running/succeeded/failed`,
progress, attempts, timestamps, idempotency/attempt correlation, result digest,
stable error code, and durable deadline classification. No Redis/Celery or
production migration was introduced.

### FE-DECOMP01 — Frontend Decomposition
Behavior-preserving decomposition of `App.tsx` orchestration into focused shell/workspace/upload/activity/preview/admin boundaries. No React rewrite, router rewrite, state-library migration or visual redesign.

### CONTRACT-CORE01 — Shared API Contracts
Reduce frontend/backend contract drift through a small shared schema/types/error-code source. Avoid broad framework replacement.

## Preserved Scholarly Roadmap

After the reliability interlock is cleared, resume the scholarly sequence:

```text
RF-PROV01          provenance / acquisition records
→ RF-LINEAGE01     edition/scan/translation/transcription relationships
→ RF-STATS01       bounded storage/research statistics
→ RF-OVERLAY01     private reading/research overlay foundation
→ RF-ORGANIZE01    Personal Tags + Collections
→ RF-VIEWS01       Saved Research Views
→ RF-INTAKE01      Research Inbox / intake boundary
→ RF-ANNOTATE01    sidecar annotations/highlights/page notes
→ RF-CITE01        Citation Workspace
→ RF-EVIDENCE01    page-level Evidence / Evidence Bundles
→ RF-EXPORT01      structured export foundations
→ RF-LIBRARY03     shared catalogue/tags/canonical-original naming
→ RF-LIBRARY04     provenance confidence / duplicate-version grouping
→ RF-RECOVERY01    bounded metadata recovery
→ RF-AUTHMATRIX01  complete authorization/non-disclosure matrix
→ RF-DERIVED01     derived-artifact authorization contracts
→ STOP BEFORE broader OCR/full-text/retrieval/RAG
```

`RF-INTEGRITY01` is intentionally moved earlier because real operational experience showed that integrity/reconciliation is foundational rather than a late research feature.

## Architecture Decisions Preserved

### Storage
Keep the provider-neutral boundary:

```text
Application Resource Logic
        ↓
Storage Interface
        ↓
Storage Adapter
        ↓
Provider
```

Do not proxy large file bytes through Fastify. Current scale does not justify replacing the storage architecture because of one provider incident.

### Persistence
SQLite remains appropriate for the current low-concurrency invitation-only service. Do not add PostgreSQL merely for parity with larger open-source systems.

### Deployment
Modular monolith remains the default. Logical service boundaries may later become physical workers/services only when load or isolation requires it.

### Intelligence
Original files remain authoritative. OCR/text/index/embeddings are derived and rebuildable. Derived authority may never exceed the user's effective authority over source material and any private overlay used.

### Backups
Database metadata and object bytes are separate recovery domains. A verified SQLite backup does not recover permanently lost OSS bytes; independent object-byte redundancy therefore requires its own explicit plan and cost/security approval.

## Production Track

Repository-declared production remains exact bounded R3 release
`08657727a17a7ea766ad0d74cc663fa40f91eee1`, previous release
`988bdbf052de1a39b47a1e22ac761c977eec72c8`, at unchanged schema v21/history
001-021. ARCH-COMPUTE01 is a development checkpoint at schema v22; no production
migration or cutover is implied.

RF-SEARCH01 release candidate remains frozen at `7bba7b869fd1234c1e7c67002cb93368c299209b`; documentation/planning reconciliation does not require rebuilding that artifact.

## Execution Rule

```text
recover repository truth
→ select only the explicitly authorized task
→ implement/diagnose within the bounded card
→ focused verification
→ real-browser/product journey where user-facing behavior changed
→ independent review when risk warrants
→ durable reconciliation
→ checkpoint/push
→ STOP at production/cost/destructive/credential gates
```

The purpose of the new sequence is not to slow feature work indefinitely. It is to make the core trustworthy enough that later Tags, Collections, Annotations, Citation, Evidence and source-grounded AI can rely on it.
