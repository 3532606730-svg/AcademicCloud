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

`ARCH-COMPUTE01` is complete in production. Migration 022 supplies durable
job authority in Core; GitHub Actions is the first adapter behind a
provider-neutral Compute interface; the existing bounded front-matter OCR and
Metadata Suggestion heavy path runs one page at a time in one clean worker; and
the browser uses durable queued/processing/succeeded/failed state. Core retains
all Auth, Library, SQLite, storage, suggestion-review, and canonical metadata
authority. The exact Core/Compute cutover now runs at schema v22/history
001–022.

`COMPUTE-GHA02` qualified the exact workflow-only checkpoint on a real
GitHub-hosted `ubuntu-24.04` runner. Its final exact run passed contracts,
Compute, pinned Tesseract 5.5.3, real OCR, the unchanged five-run memory gate,
log/output safety, quoted shell inputs, and zero-artifact checks. The historical
fixed 512 MiB Node gate is not reproducible enough for a cutover decision by
itself: two clean runs peaked above 512 MiB and the final green run retained only
2,875,392 bytes of headroom. The protected production job also retains a
pre-existing staging mismatch (`runtime/tesseract` versus the pinned builder's
repository-`output/`-only contract); qualification did not execute or repair
that path.

The Owner has now authorized `GOAL-BETA-PREP01` as the bounded autonomous
program that clears these two blockers and proceeds to internal-beta readiness:

COMPUTE-PRECUTOVER01 cleared both blockers on exact hosted run
`32407660640`: source `1c3bb10…` passed real OCR, the explicit GitHub-hosted
`<768 MiB` peak and retained `<64 MiB` drift contracts, verified `output/`
stage/promote, privacy/output scanning, and zero-artifact checks without
production execution. Phase 2 then built and independently verified exact Core
artifact `9421010643`. After Owner email verification and exact-scope approval,
it created only the minimum 30-day single-repository Actions-write credential
and protected Compute Environment, took and independently verified the stopped-
service/off-host backup, applied only migration 022, deployed exact `1c3bb10…`,
and passed one bounded real canary in final run `32415058752`. Core remained
responsive; canonical metadata, source bytes, OSS/RAM/CORS, memory limits, and
cost remained unchanged.

```text
GOAL-BETA-PREP01 Phase 1 / COMPUTE-PRECUTOVER01 — COMPLETE
  hosted provider-specific memory-contract decision
  + smallest protected Tesseract staging repair
→ GOAL-BETA-PREP01 Phase 2 / ARCH-COMPUTE01 production cutover — COMPLETE
  backup + migration 022 + minimum least-privilege Compute credentials/environment
  + exact artifact/deploy + one bounded canary
→ GOAL-BETA-PREP01 Phase 3 / RF-SEARCH01 production closure — ACTIVE
  compose existing Search behavior onto latest baseline
  + mandatory browser gate + new exact artifact + deploy
→ GOAL-BETA-PREP01 Phase 4 / L1-UX08 beta-minimum Activity Center v0.1 + Source Recovery
→ GOAL-BETA-PREP01 Phase 5 / QA-GOLDEN01 exact-release real-browser final gate
→ INTERNAL_BETA_READY
→ STOP before starting/inviting users into internal beta
```

Routine implementation choices inside this exact program no longer require a
separate Owner round-trip. The explicit hard-stop conditions in
`tasks/doing/GOAL-BETA-PREP01.md` remain binding: no paid infrastructure, no
broad personal token stored on production, no unproven data-integrity/migration
risk, no security/privacy weakening, no provider-policy mutation outside scope,
and no unrelated product/architecture expansion.

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
- production long-running extraction/OCR still needs the authorized Core/Compute cutover;
- SQLite metadata backup is stronger than object-byte redundancy;
- repository current-state facts have drifted across Markdown files;
- frontend orchestration has grown too concentrated in `App.tsx`.

GOAL-BETA-PREP01 intentionally addresses only the beta-critical subset now:
Compute isolation/cutover, Search closure, live activity/source recovery, and
real-browser release evidence. The remaining reliability and scholarly queues
stay preserved for later work unless a concrete blocker makes one unavoidable.

## Near-Term Cards

### OPS-STORAGE-INCIDENT01 — complete
Diagnosis proved every boundary. The bounded RAM repair restored raw stat,
Range-read, and ListParts access. Exact R3 source `08657727…` deployed the
remaining empty-marker/abandon-routing repair and exact CORS delta. Production
invariants and pending state were preserved, and Owner-reported browser storage
acceptance passed. The later Metadata Suggestion memory stall is separate.

### ARCH-COMPUTE01 — production cutover complete
`JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01` implement the smallest durable
Core-owned job abstraction and one clean GitHub Actions worker. The existing
front-matter OCR/metadata behavior is migrated rather than redesigned. Core no
longer depends on PDF.js/canvas/Tesseract for the migrated path; Compute owns
those runtime checks and returns candidates only. `COMPUTE-GHA02` proved the
runtime on real hosted Linux and preserved the exact memory evidence: peaks of
547,672,064 and 549,146,624 bytes failed the historical 512 MiB gate, while the
final 533,995,520-byte peak passed narrowly with only 4,247,552 bytes of
run-one-to-five post-RSS drift. COMPUTE-PRECUTOVER01 repaired both blockers:
exact run `32407660640` passed at a 547,860,480-byte peak and 225,280-byte
five-run drift under the explicit GitHub-hosted `<768 MiB` / `<64 MiB`
  contract, and the protected runtime now uses verified `output/worker-stage` →
  `output/worker` promotion. Exact Phase 2 artifact `9421010643` passed build and
  independent/local/host verification. Production was frozen for a verified
  schema-v21 backup, whose encrypted off-host copy at commit `22b05321…` was
  independently rehashed, then only migration 022 was applied and exact
  `1c3bb10…` selected. The immediate rollback pair is application release
  `08657727…` plus `academiccloud-pre-compute-20260820T200600Z.sqlite`.
  Least-scoped routing/credentials are protected outside Git, and the final
  canary run `32415058752` passed real OCR/memory/callback/privacy/zero-artifact
  evidence with Core responsive and canonical metadata unchanged.

### RF-SEARCH01 — implementation complete, production closure active
Metadata/name catalogue search is behavior-frozen at historical source
`7bba7b869fd1234c1e7c67002cb93368c299209b`; its historical artifact must
**not** be deployed directly. Ancestry verification corrected the earlier
absence claim: the Phase 2 source already descends that candidate and therefore
exposes Search. Search-specific files remain byte-identical, focused tests and
the production desktop browser journey are green, and no rewrite/cherry-pick is
needed. Phase 3 nevertheless remains open until the browser-gated integrated
source receives a new independently verified exact artifact and deployment.

### L1-UX08 — beta-minimum unified Activity Center + Source Recovery
The original upload Activity/Source-Recovery card remains the substrate. Under
GOAL-BETA-PREP01 Phase 4, beta v0.1 expands only enough to unify:

- upload queued/preparing/uploading/completing/complete/failed and safe resume/retry/abandon;
- same-session `File` reuse plus optional supported `FileSystemFileHandle` recovery with fail-closed source identity verification and `选择原文件继续` fallback;
- Metadata/Compute queued/processing/succeeded/failed backed by durable Job Core state across reload;
- download preparing/started/failed where reliably observable, without proxying bytes through Core merely to fabricate progress.

Do not turn this phase into full task history, advanced filters, per-page OCR
progress, a general notification platform, or unrelated UI redesign.

### OPS-DEPENDENCY01 — Dependency Health
Add Owner-only health information for application, database, storage stat/range/multipart capability, backup freshness, disk/memory and other bounded critical dependencies. Do not turn readiness into expensive unbounded probes. This remains outside the beta-prep critical path unless a concrete new blocker makes it necessary.

### QA-GOLDEN01 — Real-Browser Golden Journeys
Make the actual product path part of release evidence. GOAL-BETA-PREP01 Phase 5
requires the exact final release journey to cover safe/run-owned fixtures for:

```text
login
→ open Library
→ Search
→ upload + immediate Activity Center state
→ upload complete
→ details
→ preview/download
→ Metadata Suggestion 202/job state
→ queued/processing
→ GitHub Compute OCR/candidate callback
→ reviewable candidate while Core health/auth/Library remain responsive
→ favorite
→ recycle/restore
```

Also cover one controlled resumable upload path where practical. The final
release is not beta-ready merely because unit/CI/artifact evidence is green.

### ERR-BOUNDARY01 — Unified Error Boundary
Map raw browser/provider/internal errors into stable user-actionable classes. Preserve safe provider/request correlation server-side; never expose secrets, signed URLs, object keys, raw stacks, or provider payloads.

### DOC-TRUTH01 — Repository Truth Hygiene
Use `CURRENT_STATE.json` as the compact current pointer, remove duplicated stale production facts from explanatory docs, and add checks that prevent contradictory production/schema/task declarations.

### RF-INTEGRITY01 — Integrity & Reconciliation
Promoted from the later Pre-OCR queue. Detect missing objects, metadata/provider mismatch, stale multipart, incomplete purge, orphan/provider-only evidence where safely enumerable, and rolling fixity status. Detect/report first; no automatic repair.

### OPS-OBJECTBACKUP01 — Independent Object-Byte Backup
Design and then, only after Owner cost/provider approval, establish a second independent copy of authoritative object bytes. Database backup alone is insufficient because original PDFs are the primary asset. This cost-bearing work is explicitly outside GOAL-BETA-PREP01.

### JOB-CORE01 — complete within ARCH-COMPUTE01
Development migration 022 now provides `queued/running/succeeded/failed`,
progress, attempts, timestamps, idempotency/attempt correlation, result digest,
stable error code, and durable deadline classification. No Redis/Celery or
production migration was introduced yet.

### FE-DECOMP01 — Frontend Decomposition
Behavior-preserving decomposition of `App.tsx` orchestration into focused shell/workspace/upload/activity/preview/admin boundaries. No React rewrite, router rewrite, state-library migration or visual redesign. Outside GOAL-BETA-PREP01 except for the smallest bounded edits strictly needed by Activity Center v0.1.

### CONTRACT-CORE01 — Shared API Contracts
Reduce frontend/backend contract drift through a small shared schema/types/error-code source. Avoid broad framework replacement. Outside GOAL-BETA-PREP01 unless a concrete beta-blocking contract defect makes the minimum repair unavoidable.

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

Repository-declared production now runs exact Core/Compute release
`1c3bb10a48082995924a2d9ec41a48d6d3d34acd`, previous application release
`08657727a17a7ea766ad0d74cc663fa40f91eee1`, at schema v22/history 001–022.
Rollback to the previous application is inseparable from the verified
pre-migration backup `academiccloud-pre-compute-20260820T200600Z.sqlite`.

GOAL-BETA-PREP01 Phase 2 consumed its bounded authority successfully: stopped-
service backup verification, off-host encrypted evidence, migration 022,
minimum Compute credentials/environment, exact artifact/deployment/restart, and
one bounded canary are green. It introduced no paid infrastructure, broad
credential, provider-policy change, or destructive data manipulation.

RF-SEARCH01 release candidate remains historical evidence at
`7bba7b869fd1234c1e7c67002cb93368c299209b`. It is already an ancestor of the
latest baseline, so composition is an evidence-backed no-op rather than a
cherry-pick; Phase 3 still requires a new exact artifact and deployment after
its browser gate.

## Execution Rule

```text
recover repository truth + GOAL-BETA-PREP01 current phase
→ implement/diagnose only that bounded phase
→ focused changed-risk verification
→ real-browser/product journey where user-facing behavior changed
→ independent review when risk warrants
→ durable reconciliation
→ checkpoint/push
→ autonomously continue to the next green Goal phase
→ STOP early only at GOAL-BETA-PREP01 hard boundaries
→ otherwise STOP only at INTERNAL_BETA_READY before inviting users
```

The purpose of the sequence is not to slow feature work indefinitely. It is to
make the core trustworthy enough for a controlled internal beta, after which the
preserved reliability and scholarly roadmap can resume deliberately.
