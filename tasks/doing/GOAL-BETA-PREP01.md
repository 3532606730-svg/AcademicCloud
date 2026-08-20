# GOAL-BETA-PREP01 — Autonomous path to internal-beta readiness

## Owner authorization

Authorized by the Owner on 2026-08-21 for Codex Goal Mode to continue autonomously from the exact repository state after `COMPUTE-GHA02` until the project reaches **INTERNAL_BETA_READY**, then STOP before actually starting/inviting users into internal beta.

This program-level authorization supersedes the previous STOP-only checkpoint for the bounded work below. It does **not** authorize unrelated roadmap work.

## Goal

Reach a production state that is ready for the Owner to begin internal beta, with the Compute split safely cut over, metadata/name Search live, a minimal unified Activity Center live, and one evidence-backed real-browser golden journey passing against the exact final release.

## Mandatory order

### Phase 1 — COMPUTE-PRECUTOVER01

Resolve both proven pre-cutover blockers without touching production first:

1. **Hosted memory contract**
   - preserve the historical 512 MiB measurements and the fact that two clean hosted runs failed that threshold;
   - classify the evidence as bounded native/PDF.js/canvas first-use high-water versus a real growth/leak condition;
   - do not rewrite/slow OCR merely to satisfy the historical 512 MiB number unless new evidence proves a real implementation defect;
   - keep `concurrency=1`, process-per-job isolation, real Tesseract E2E, and repeat drift `<64 MiB` as hard invariants;
   - if the evidence supports recalibration, adopt a **GitHub-hosted-provider-specific** peak RSS gate. Owner-preferred candidate: `<768 MiB`, but only if the existing evidence and runner profile support it. Do not silently choose a different threshold; document rationale in ADR/task/current state.

2. **Protected production job staging**
   - repair the mismatch between the builder's repository-`output/`-only contract and the protected job's current `runtime/tesseract` target;
   - preserve the builder's output-only safety boundary;
   - use the smallest build/stage/promote repair and add a static/contract test so qualification and protected staging cannot silently diverge again;
   - do not execute the protected callback path during this repair-only phase.

Phase 1 acceptance: hosted real Tesseract/OCR passes, memory contract is evidence-backed and reproducible under its new provider-specific bound, staging contract passes, privacy/output scan passes, no production mutation occurred.

**Phase 1 result — COMPLETE (2026-08-21).** Exact source
`1c3bb10a48082995924a2d9ec41a48d6d3d34acd`, hosted run `32407660640`,
job `96550455191` passed contracts, Compute, pinned Tesseract 5.5.3, real OCR
with zero skip, the explicit GitHub-hosted `<768 MiB` peak contract, retained
`<64 MiB` drift contract, and privacy/output scan. Exact peak was 547,860,480
bytes, run-one-to-five post-RSS drift was 225,280 bytes, GNU `time` maximum was
535,796 KiB, artifact count was zero, and the protected production job was
skipped. The local-development gate remains `<512 MiB`. Protected staging now
builds under `output/worker-stage`, verifies before atomic promotion to
`output/worker`, and is locked by a static deployment contract. Production,
credentials, schema, database, OSS/RAM/CORS, Search, and callback paths were
unchanged. Durable evidence is in `tasks/done/COMPUTE-PRECUTOVER01.md` and
ADR-031. Phase 2 subsequently completed the production cutover recorded below.

### Phase 2 — ARCH-COMPUTE01 production cutover

After Phase 1 is green, autonomously perform the smallest safe production cutover for the already-completed Core/Compute architecture.

Required gates:

1. re-read exact repository state and verify clean/synchronized source;
2. build/verify an exact release artifact from the approved source;
3. establish a rollback pair and take/verify the existing production SQLite backup path before migration;
4. apply only migration 022 (v21 → v22 / 001–022) and verify migration history;
5. install/create only the minimum Compute routing/secret material required by ADR-031;
6. deploy/restart only what the exact cutover requires;
7. verify release identity, `/health`, `/ready`, auth/session, Library browse, upload/download/preview, and that Core remains responsive while a Compute job runs;
8. run exactly one bounded canary Metadata Suggestion on an Owner-approved safe production resource or fixture, verify queued → running → succeeded/failed lifecycle, callback idempotency/attempt safety, reviewable candidates, and unchanged Core canonical-metadata authority;
9. verify no signed source URL, capability, document text, candidate payload, or secret appears in GitHub logs/artifacts;
10. if a production gate fails, stop new work, preserve evidence, and use the already-defined rollback path when rollback is clearly required for service/data safety.

Credential rule: Codex may generate/install a new strong bootstrap secret without printing/logging it. It may use an already-existing **least-scoped** workflow-dispatch credential if one is available. It must **not** repurpose/store a broad personal GitHub token on production or broaden account privileges. If no compliant least-scoped dispatch credential can be provisioned without Owner interaction, stop only at that exact minimal credential gate and report it; do not weaken the security model.

Privacy authorization for this program: the Owner accepts that the one selected canary PDF may be transiently processed on a GitHub-hosted runner under the ADR-031 short-lived single-object capability model, provided no raw document bytes/text/candidates are uploaded as workflow artifacts or emitted to logs.

**Phase 2 result — COMPLETE (2026-08-21).** Repository checkpoint
`a3af736…` was clean and synchronized at preflight.
Exact Core source `1c3bb10…` already produced artifact `9421010643` in run
`32407660568`; build job `96550916880` and independent verification job
`96551622641` passed. GitHub artifact SHA-256 is
`48abdc8b2ebfb5484358d6983f83d2f7c7dcb7956d9a2b028d484f668a9e7836`,
archive SHA-256 is
`1b78cf47ea1938cbed5e1247f27dc5be392596287ae02eb0f4ec0475c5b78e1c`,
and manifest SHA-256 is
`7dfed78239ef60f012b0865715eb78a9a5e0553c7dee6017b68fbd1fa445df7e`.
The artifact has 4,789 files / 34,151,198 bytes, contains neither Core OCR
nor PDF-render runtime, and expires at `2026-08-27T19:19:09Z`. The downloaded
archive/manifest were rehashed locally and the unpacked artifact passed the
production-host verifier before installation.

Read-only production preflight re-proved live release `08657727…`, existing
rollback release `988bdbf…`, active service with zero restarts, exact
v21/history 001–021, `integrity_check=ok`, and zero foreign-key violations.
The initial minimum-credential hard stop was resolved only after the Owner
completed GitHub email verification and approved the exact scope. The created
30-day fine-grained token is owned by `3532606730-svg`, limited to only the
`AcademicCloud` repository, and grants repository `Actions: write` plus
GitHub-required read-only metadata; no classic/broad token was used. Protected
Environment `academiccloud-compute-production` contains one bootstrap secret
and exact non-secret Core-origin/ref variables. Production contains only the
seven minimum Compute routing/secret keys in its root-only environment. Secret
values were never recorded in Git or durable evidence.

Writes were frozen by stopping Core. The verified pre-migration backup is
`academiccloud-pre-compute-20260820T200600Z.sqlite`, 778,240 bytes, SHA-256
`1c00b6bcb9fe7e5aaf30a28c9e0b797753626d0ec99f79d2ebe799d097a8609a`,
schema v21 with `integrity_check=ok` and zero foreign-key violations. Its
encrypted off-host evidence is independently rehashed at private backup commit
`22b05321febe6bfceb7d1bd609b30b499937b7d2`; the application rollback pair is
exact `08657727…` plus that database backup and the preserved pre-cutover
environment/unit. Only migration 022 was applied once; its SHA-256 is
`07dfe1147d830754dd16dce791dfae6bbe234eeea37985901f763575a4645574`.

Production now selects immutable release `1c3bb10…` at schema v22/history
001–022. The service is active with zero restarts and one loopback listener;
loopback/public health are `ok`, readiness is `ready`, existing Owner session,
Library browse, details, preview, and download passed, and the prior R3 browser
upload/storage acceptance remains valid.

Exactly one logical canary used Core job
`2cb8a0b6-fb37-4b51-bd3b-f9330dbbbde7`. Its first dispatch exposed a
runner-owned-directory promotion defect before claim. After the smallest repair,
the same queued job claimed but failed closed because the production worker ran
outside the staged release-local Tesseract tree. The second bounded repair made
the staged release contain both compiled worker and runtime and executed that
exact worker. A UI retry created attempt 2 of the same Core job; final workflow
run `32415058752`, job `96574206668`, source `440b556…` passed routing, build,
pinned Tesseract, real OCR, the `<768 MiB` peak and `<64 MiB` drift gates,
claim/compute/callback, and cleanup. The durable job succeeded at 100%, one
reviewable filename candidate is visible, and canonical metadata was not
accepted or changed. Core stayed responsive throughout.

The final workflow uploaded zero artifacts. Exact scans of its logs and the Core
journal found no dispatch/bootstrap secret, signed source URL, capability,
source/callback payload, document text, candidate payload, or selected filename;
GitHub's one checkout Authorization value was platform-masked. No source/object,
canonical metadata, Nginx, `MemoryHigh`/`MemoryMax`, OSS, RAM, CORS, bucket
policy, paid infrastructure, or Search mutation occurred. Rollback was not
required. Phase 2 is green and Phase 3 is authorized to proceed.

### Phase 3 — RF-SEARCH01 compose and production closure

Do **not** deploy the historical Search artifact directly.

1. compose the already-green RF-SEARCH01 behavior onto the **latest post-Compute production baseline**;
2. preserve its existing semantics/ranking/authority boundaries; do not redesign Search;
3. run changed-risk tests plus the mandatory real-browser Search journey;
4. build/independently verify a new exact artifact;
5. deploy it only after the exact pre-cutover browser gate passes;
6. verify clear-query folder restoration, Chinese title, author, author+title, original filename fallback, no-result, stale-request safety, details open, pagination, narrow/mobile, and Member path where safely available.

No full-text/OCR-body search, embeddings, RAG, external lookup, query history, or new Search infrastructure.

### Phase 4 — L1-UX08 Activity Center v0.1 + Source Recovery

Implement only the beta-minimum unified global activity surface.

Required beta v0.1 states:

- **Upload:** queued/preparing/uploading/completing/complete/failed, progress where already reliable, safe resume/retry/abandon, same-session `File` reuse, optional supported `FileSystemFileHandle` recovery, checksum/source-identity fail-closed fallback to `选择原文件继续`;
- **Metadata/Compute:** queued/processing/succeeded/failed, durable across reload and backed by Job Core state;
- **Download:** preparing/started/failed only where reliably observable; do not proxy file bytes through Core merely to manufacture percent progress.

Keep `待处理` as durable recovery state and Activity Center as live activity. Do not build full history, advanced filters, per-page OCR progress, complex pause semantics, animations, RAG states, or a general notification platform in this phase.

### Phase 5 — QA-GOLDEN01 final beta gate

Run an exact-build real-browser golden journey with safe/run-owned fixtures and clean residue:

```text
login
→ open Library
→ Search
→ drag/select PDF
→ immediate Activity Center upload state
→ upload complete
→ open resource details
→ preview/download
→ Metadata Suggestion returns 202/job state
→ queued/processing
→ GitHub Compute OCR/candidate callback
→ reviewable candidate visible
→ Core health/auth/Library remain responsive throughout
→ favorite
→ recycle/restore
```

Also cover one controlled interrupted/resumable upload path and stable user-facing failure rendering where practical.

The final release is not beta-ready merely because unit/CI/artifact gates are green; the changed-risk real-browser journey must pass.

## INTERNAL_BETA_READY definition

Set `INTERNAL_BETA_READY=true` only when all are true:

- Core/Compute production cutover is complete on schema v22/history 001–022;
- real GitHub Compute canary passed without Core stall;
- RF-SEARCH01 is live on the latest baseline and its browser journey passed;
- Activity Center v0.1 + source recovery are live and browser-verified;
- QA-GOLDEN01 final exact-release journey passed;
- no unresolved Sev-1/Sev-2 production/data-integrity/security blocker remains;
- production release identity, rollback pointer, migration state, and durable repository records are reconciled;
- repository/local/remote state is synchronized where local access is actually available.

Then STOP and leave starting/inviting users into internal beta to the Owner.

## Global boundaries

Authorized inside this program:

- bounded code/workflow/test/document changes needed by Phases 1–5;
- GitHub Actions qualification/build/release workflows;
- production backup verification, migration 022, exact deployment/restart, minimal Compute secret/environment setup, and one bounded canary as specified above;
- composing/deploying Search on the latest baseline;
- beta-minimum Activity Center and Source Recovery;
- safe real-browser golden verification and cleanup.

Not authorized:

- paid infrastructure or a second server;
- changes to `MemoryHigh`/`MemoryMax` merely to hide a defect;
- new OSS/RAM/CORS/bucket-policy changes unless a newly proven regression makes them strictly necessary—in that case STOP for Owner review;
- destructive/manual mutation of existing pending uploads or object/part state;
- permanent deletion of academic data;
- broad GitHub credential escalation or storage of a personal broad-scope token on production;
- whole-document OCR product expansion, full-text indexing/search, embeddings, retrieval, RAG, external sharing, Personal Research Workspace, OPS-OBJECTBACKUP01 cost-bearing work, FE-DECOMP01, CONTRACT-CORE01, or unrelated roadmap cleanup;
- merging to `main` unless the repository workflow explicitly requires and separately authorizes it;
- starting internal beta or inviting users.

## Autonomous progression / stop rules

Codex Goal Mode should continue from one green checkpoint to the next without asking the Owner for routine implementation choices.

STOP early only if:

- a required credential cannot be provisioned within the least-privilege rule above;
- a new paid service/cost is required;
- production data integrity is uncertain;
- a migration/rollback cannot be proven safe;
- a new security/privacy boundary would be weakened;
- a provider/OSS/RAM/CORS mutation outside this authorization becomes necessary;
- a real-browser/product gate fails in a way that requires product-scope expansion rather than a bounded repair;
- production becomes unhealthy and the defined rollback cannot safely restore it.

For bounded defects discovered inside Phases 1–5, diagnose the first failing boundary, repair only that boundary, rerun changed-risk verification, reconcile durable state, checkpoint/push, and continue.

## Final report

At STOP return at minimum:

```text
PROGRAM=GOAL-BETA-PREP01
FINAL_HEAD=
PRODUCTION_RELEASE=
PRODUCTION_SCHEMA=
COMPUTE_CUTOVER=
COMPUTE_CANARY=
SEARCH_PRODUCTION=
ACTIVITY_CENTER_V0_1=
GOLDEN_JOURNEY=
INTERNAL_BETA_READY=
ROLLBACK_POINTER=
UNRESOLVED_BLOCKERS=
PRODUCTION_DATA_MUTATION_SUMMARY=
CREDENTIAL_CHANGE_SUMMARY=
COST_CHANGE=false
NEXT=OWNER_INTERNAL_BETA_DECISION
STOP
```
