# AcademicCloud Roadmap

**Last reconciled:** 2026-09-28

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

## Reliable book intake priority — 2026-09-27

The Owner prioritizes reliable book intake within the active vNext remediation. See the [reliable book intake plan](docs/architecture/reliable-book-intake.md): repair concrete export failures, make admission-to-catalogue handoff durable, recover per-resource processing independently of browser sessions, then compare field quality and review effort against adjudicated sources. ZIP export is a compatibility workflow; the proposed normal intake path uses the existing candidate review and authority model. Changes to task persistence, page selection, temporary evidence storage or provider provenance require their own ADR/contracts and release gates. Whole-corpus OCR and paid/external inference are not implicitly authorized. Reader completion remains valid; unfinished corpus/report work remains in the same task.

The [OCR planning handoff](docs/architecture/ocr-product-plan.md#8-与提升书籍录入可靠性的协作约定) is integrated as planning/evidence only. Intake remains first; OCR qualifications and page-result design may be coordinated independently, with shared interface review before implementation. Full-text persistence and production OCR remain separately gated; no parallel resource, permission or queue system is introduced.

ADR046 implements the bounded first reliability step: record a new admission job in the existing activation/approval transaction, reuse the current queue and Catalog fingerprint, and recover through the existing dispatcher. No migration or new service. Historical missing work, immutable-source orchestration, per-resource review and field-quality acceptance remain separate next steps. Current continuation excludes main merge and new OCR execution; all delegated agents use GPT-6 Astra/ultra.

## Active vNext remediation interlock

September25 reader milestone under ADR045: owned client-side PDF.js rendering, independent Library/Research navigation, closeable research tabs/recent reading, private source-bound progress/highlights and page notes, native-text search/export. Same shared resource bytes and account-private overlays. Local IAB smoke and normal signed-in production changed paths passed; exactd58ef44/schema039 is deployed. OCR remains interface-only; no new service or infrastructure cost.


September24 milestone: the integrated970 Core/frontend release is deployed with source037 and Workspace038; exact Linux1124/1124, host verification and data-preserving migration checks pass. The Owner requested fast deployment without additional broad testing. The next gate is bounded normal-site confirmation, then unfinished/affected corpus and final-report completion. Compute7e remains active and unchanged; the six damaged-source replacement cases remain an external gate.

The current Owner charter and explicit Phase B takeover on 2026-09-09 supersede the narrow historical R01–R16 completion sequence below. The sole active task remains ACADEMICCLOUD-VNEXT-REMEDIATION01. Unified Library/Search, source-generation037, private Workspace038, inline PDF reading and resumable Catalog review now pass their local gates. The inherited expiry defect in existing-note page jumps is repaired and checked against source replacement. Details and note-save timings now include a signed-in browser against real local HTTP/Auth/SQLite; production transport and PDF first-paint timings remain open. The bounded full-text evaluation is recorded as design-only, and the Owner has deferred OCR execution. Candidate qualification and the combined publication/deployment are complete; continue the remaining live workflows and current-corpus work. Do not force the entire old RF queue to precede useful private research tools. Full-corpus OCR and RAG rollout remain later evidence-dependent decisions.

Existing SQLite/Core/storage-adapter/Local Pull boundaries remain valuable. Avoid a framework/database rewrite, new resident service or model change without evidence. Zero added infrastructure cost and zero billable GitHub usage remain gates. Historical parked entries are an inventory, not a competing active sequence.

The Owner accepted the complete 360 review on 2026-09-06 and made
ACADEMICCLOUD-VNEXT-REMEDIATION01 the sole active integration and production
remediation task. It supersedes the old stabilization execution pointer while
preserving its correctness, privacy, local-Compute and zero-added-cost goals.

Current sequence:

```text
local implementation, measured paths and candidate review
→ exact Linux qualification, migration/rollback and immutable artifact checks
→ one combined publication and Core/frontend release, preserving qualified Compute
→ normal signed-in Library/Reader/Workspace/Catalog/transfer acceptance
→ current-source inventory and only unfinished/affected corpus work
→ final queue/authority evidence, whole-product regression and final report
```

The initial vNext implementation uses SQLite candidate search and complete
server-side review plans (ADR-041), keeps original bytes and private overlays
intact, and preserves human bibliography authority. Missing values preserve
existing facts; only explicit reviewed clears remove them. External confidence
is not correctness probability or write authority.

The laptop remains a disposable, outbound-only executor. Its absence may delay
AI but must not break Library, storage, search, citations or human metadata.
NuExtract3 qualification and both normal-site C retries already passed; retain
that evidence and the qualified Compute release. Current corpus completion and
final integrated product acceptance remain separate gates. Six unchanged
replacement-required PDFs need usable source bytes; repeated execution of the
same damaged files cannot close their acceptance. Preserve successful jobs.
Current release and runtime facts belong in CURRENT_STATUS.md and
CURRENT_STATE.json, not in this sequencing document.

The original360-review boundary below is historical. The current charter now includes the explicitly sequenced private research foundations above. Paid infrastructure, billable GitHub usage and Internal Beta/invitations remain excluded; whole-corpus OCR and RAG rollout are later evidence-dependent decisions. Earlier full-corpus stabilization evidence remains in its existing task card; historical inventories are not current live acceptance.

## Historical operational maturity interlock

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
job authority in Core; GitHub Actions was the first adapter behind a
provider-neutral Compute interface; the existing bounded front-matter OCR and
Metadata Suggestion heavy path runs one page at a time in one clean worker; and
the browser uses durable queued/processing/succeeded/failed state. Core retains
all Auth, Library, SQLite, storage, suggestion-review, and canonical metadata
authority. Its exact historical cutover established schema v22/history
001–022; the later completed Layer-1 release advances production to v24.

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

The completed `GOAL-BETA-PREP01` program cleared these two blockers and reached
internal-beta readiness:

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
→ GOAL-BETA-PREP01 Phase 3 / RF-SEARCH01 production closure — COMPLETE
  compose existing Search behavior onto latest baseline
  + mandatory browser gate + new exact artifact + deploy
→ GOAL-BETA-PREP01 Phase 4 / L1-UX08 beta-minimum Activity Center v0.1 + Source Recovery — COMPLETE
→ GOAL-BETA-PREP01 Phase 5 / QA-GOLDEN01 exact-release real-browser final gate — COMPLETE
→ INTERNAL_BETA_READY — REACHED
→ STOP before starting/inviting users into internal beta
```

The Owner-authorized `L1-INTELLIGENT-LIBRARY01` program is complete across
checkpoints A–F. A/B delivered the normalized bibliographic domain, additive
migrations 023–024, and the exact-qualified ephemeral PP-OCRv6-small →
Qwen3-1.7B Q8_0 pipeline. C/D delivered metadata-aware Search/filter/display
and exact-pinned offline citation projection for Chicago Notes & Bibliography,
《历史研究》, 《文史哲》, and GB/T 7714—2025. E delivered the compact Library,
Activity, direct bibliography editing, field-authority reset, and citation UX.
F completed the exact artifact, stopped-service encrypted/off-host rollback
generation, additive migration, deployment, and bounded production proof.
Production runs exact `017a47d…` at schema v24/history 001–024 with no
historical backfill or full-Library AI wave.

Layer 1's implementation checkpoints remain historically complete, but the
active full-corpus contract revoked project-level production acceptance and
Internal Beta readiness. Existing upload-path optimization is now inside the
integrated final-stabilization program; no separate `UPLOAD-PERF01` task begins.
The completed Layer-1 contract remains preserved in
`tasks/done/L1-INTELLIGENT-LIBRARY01.md`.

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

### RF-SEARCH01 — production closure complete
Metadata/name catalogue search is behavior-frozen at historical source
`7bba7b869fd1234c1e7c67002cb93368c299209b`; its historical artifact must
**not** be deployed directly. Ancestry verification corrected the earlier
absence claim: the Phase 2 source already descends that candidate and therefore
exposes Search. Search-specific files remain byte-identical, focused tests and
the production desktop browser journey are green, and no rewrite/cherry-pick is
needed. Phase 3 closed on browser-gated integrated source `b19f9dc5…`, new
artifact `9424397852`, independent/local/host verification, and a same-schema
application cutover. Post-deploy process/health/readiness/SQLite/Search browser
gates passed; the historical artifact was never used.

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

Repository-declared production now runs exact Search-integrated Core/Compute
release `b19f9dc5b48e1976127704712e08a8655b1fadd5`, previous application
release `1c3bb10a48082995924a2d9ec41a48d6d3d34acd`, at schema v22/history
001–022. Phase 3 rollback is application-only to `1c3bb10…`; the older Phase 2
v21 rollback remains inseparable from verified pre-migration backup
`academiccloud-pre-compute-20260820T200600Z.sqlite`.

GOAL-BETA-PREP01 Phase 2 consumed its bounded authority successfully: stopped-
service backup verification, off-host encrypted evidence, migration 022,
minimum Compute credentials/environment, exact artifact/deployment/restart, and
one bounded canary are green. It introduced no paid infrastructure, broad
credential, provider-policy change, or destructive data manipulation.

RF-SEARCH01 release candidate remains historical evidence at
`7bba7b869fd1234c1e7c67002cb93368c299209b`. It is an ancestor of production
source `b19f9dc5…`, so composition was an evidence-backed no-op rather than a
cherry-pick; Phase 3's new exact artifact and browser-gated deployment are now
complete.

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
