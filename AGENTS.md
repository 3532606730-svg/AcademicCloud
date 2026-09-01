# AGENTS.md

## Project

**AcademicCloud** is long-term academic digital infrastructure.

**Current execution phase:** `ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE` is the active integrated production repair and optimization program. The Local Compute pivot remains authoritative. Production is exact frontend/Core `3a23a7b5679bf64d01332fc761bae0dcf1a1d572` at schema v34/history 001–034 with `local_pull`; the append-only registry admits exact v1–v11/prompt-v7. The former `AcademicCloudCompute` VHDX suffered verified block loss and remains preserved with its pre-repair and repaired evidence copies; clean D-only WSL2 distro `AcademicCloudComputeV2` holds exact CUDA 12.8, recovered shared Paddle/llama runtimes, one shared NuExtract3 Q5_K_M asset, and immutable Compute release `d5580ed…`. Its main service remains absent/inactive and the environment remains `PAUSED`, so no background claim can occur. NuExtract3 offline A/B/B/unknown qualification passed 4/4 against the frozen v11 validator. Normal production UI created historical-source B job `75f14c31…` / attempt `7f474c6e…`; isolated `d5580ed…` persisted current-attempt v11/prompt-v7 evidence with `primary_source_modern_edition`, exact field provenance, no auto-apply, unchanged object identity, and refresh-stable `元朝秘史 中華書局校勘本` display. Exact frontend checkpoint `3a23a7b…` then restored the authoritative Activity Center state, and the same signed-in browser session showed reviewable success consistently in Activity Center and Resource Details, so B is fully green. Production C is now a real hard stop: two distinct normal-UI multilingual resources, jobs `a3a4bfc9…` and `7aedd762…`, both ran exact isolated `d5580ed…`, completed bounded range access, and failed closed at `bibliographic_reasoning/canonical_schema_invalid`; UI stayed failed/retryable and no AI success, structured record, auto-apply, authority mutation, or canonical promotion occurred. An intervening `道布` run safely returned `no_bibliography` without OCR and does not count as C. Repeated real C contract failure reaches the Owner-defined systematic model-contract stop line. Do not add parser normalization, choose another book, enable main Compute, enter forced-loss/NORMAL/corpus, or change schema/runtime/model until the Owner decides whether to reduce the model's C output responsibility or select a stronger local reasoner. Final acceptance still requires normal signed-in browser paths for new-upload automatic cataloguing and existing-resource retry; SSH, DB writes, internal endpoints, and one-shot worker commands do not satisfy that gate.

**Approved continuous objective:** repair correctness and AI-state semantics across every currently implemented product path; inventory and process all available Owner-supplied relevant files plus every AI-eligible production Library resource through the normal product path; remove material zero-cost structural bottlenecks; deploy and retry autonomously; then run a frozen full-corpus clean sweep and whole-product regression. Existing upload/multipart performance work is inside this integrated scope, so stale `UPLOAD-PERF01` next-task pointers do not control execution. ADR-037 makes the outbound-only Local Pull worker on the existing Owner Windows/WSL2 machine the target primary production Compute provider; GitHub-hosted production document processing is frozen and retained only for CI/qualification or separately authorized emergency fallback. There is no hard 30-second AI SLA. Zero added one-time/monthly infrastructure cost and zero new billable GitHub usage are hard gates. STOP before Internal Beta, invitations, new Layer 2/3/4 capabilities, whole-document OCR/indexing, embeddings/RAG, paid services, irreversible real-data risk, or unrelated provider/security mutation. Artifact `9405764771` / source `8d289702…` remains permanently disallowed.

## Engineering Workflow

Ordinary AcademicCloud engineering follows `.agents/skills/academiccloud-workflow/SKILL.md`. The repository is durable project memory. Product and architecture facts come from current code, Git, task cards, current-state documents, and accepted ADRs—not from chat memory.

## Highest-Priority Rules

1. **Modularity first.** Core modules have clear boundaries/interfaces; optional research/intelligence modules must not become hard dependencies of the core file system.
2. **Fault isolation is mandatory.** Failure/replacement in one module must not unnecessarily break unrelated modules.
3. **Do not expand beyond the approved objective.** Record later ideas rather than implementing them.
4. **Do not change architecture silently.** Durable product/architecture/security changes require an ADR with migration/rollback consequences where relevant.
5. **Prefer simple, maintainable solutions.** The current 1 GiB-class control-plane host is intentionally small; do not add unnecessary resident services.
6. **Data safety outranks feature count.** Never silently overwrite, destroy, resurrect, misattribute, or expose academic data.
7. **External services stay abstracted.** File bytes remain behind storage adapters; compute-heavy OCR/RAG/AI stays isolated from Core Drive.
8. **Server authority is mandatory.** Never trust client-provided owner, role, membership, privacy, or authorization claims.
9. **Production is a separate gate.** Repository implementation alone never authorizes SSH, live migration, DNS/TLS/OSS mutation, deployment, destructive production tests, or main merge. The active final-stabilization program explicitly authorizes only its evidence-gated exact Core/frontend/Local Compute releases, bounded canaries/retries, and normal-path corpus acceptance; it does not authorize unrelated provider changes, destructive production tests, main merge, or new product scope.
10. **Every Epic ends at an evidence-backed checkpoint.** Applicable tests, risk-appropriate review, task-state reconciliation, and Git checkpoint precede autonomous progression.
11. **Shared resource does not imply shared research activity.** ADR-014 governs private research-state boundaries; ADR-022 defines the canonical shared-corpus default.
12. **AI authority never exceeds the requesting user's effective authority.** There is no AI super-admin research view.
13. **Verification must be proportionate, not performative.** Run the checks that materially cover changed risk, then stop when relevant evidence is green. Do not repeatedly rerun historical full acceptance, production artifact builds, backup/restore drills, benchmarks, or unrelated audits merely to increase ceremony. Escalate verification only when a concrete failure, migration/data-integrity risk, authorization/security change, production boundary, or other material evidence justifies it.
14. **Re-verify before changing a technical judgment.** Owner urgency or preference may change product priority, but it does not by itself invalidate an engineering/security/data-safety conclusion. Material reversals require a changed fact, constraint, or corrected reasoning that should be recorded when durable.
15. **Durable decisions must be reconciled and synchronized.** Per ADR-023, accepted durable product/architecture/security/workflow/roadmap/task-boundary decisions must be written into the smallest complete authoritative repository set rather than left in chat. After authorized remote publication, synchronize the accessible active local checkout non-destructively and verify local HEAD equals the intended remote HEAD; never discard unknown local work to force equality, and never claim local synchronization without actual local evidence.

## Durable Data / Privacy Model

Follow `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md` and ADR-022.

### Physical Artifact
Stored bytes/file representation, object identity, checksum, media/lifecycle metadata. Visibility follows the owning resource/Library authorization.

### Scholarly Resource / Scholarly Record
Logical academic object and canonical scholarly facts. One Record may relate to several artifacts/versions/editions/scans/translations/derived artifacts. These are internal domain concepts, not primary navigation labels.

### Personal Research Overlay
Private per-account research state, including when implemented: Reading State/progress, Important/To Cite, Favorites/Recent, Personal Tags, Collections, Saved Views, private research/acquisition notes, annotations, citation/evidence organization, Evidence Bundles, Research Questions, and private search/history state.

**Owner/Admin has no implicit product/API read authority over another account's Personal Research Overlay.** Infrastructure operator access is a separate production-security matter, not a product permission.

### Collaborative / Library Plane
The canonical shared academic corpus, contribution review, Library Tags, shared catalog/canonical records, shared provenance, and future explicitly shared research objects. A Personal Overlay never crosses into this plane implicitly.

### Governance / Operations
Accounts, invitations, account status, permissions, announcements, quota/statistics, security audit, integrity/recovery evidence. Administrative audit must not become default research surveillance and appears to users only under Owner administration as `操作记录`.

### Derived Intelligence
OCR/extracted text/index/embeddings/retrieval/RAG-derived state. Authorization must inherit source-resource and applicable private-overlay authority.

Additional invariants:
- AcademicCloud presents one canonical `资料库`; approved academic resources are shared to active authorized members after Owner admission.
- For a normal Member, upload is contribution intake/review, not creation of a permanent private Drive corpus.
- Owner-originated uploads may be admitted directly because the Owner already holds admission authority.
- Shared resource does not expose another member's Personal Research Overlay.
- Folder = storage hierarchy; Collection = research-semantic organization.
- Personal Tags and Library Tags are distinct.
- canonical metadata and private interpretation/notes are distinct.
- original acquired artifacts remain preservable evidence; derived artifacts have explicit lineage.
- duplicate/fingerprint results must not reveal inaccessible resources.

## Product Layers

### Layer 1 — Core Drive / Resource Handling

**Layer 1 implementation complete; production AI acceptance reopened.** Authentication, folders, browser-direct upload/download, listing/move/rename, Favorites, recycle/restore, Preview, mobile/desktop UI, security/reliability, deployment/recovery, the canonical shared `资料库`, normalized bibliographic authority, bounded AI cataloguing, metadata-aware Library retrieval/display, deterministic citation projection, and the integrated compact Library/Activity/edit/citation UX are deployed through schema v34/history 001–034. Exact v11/prompt-v7 is live in Core and hash-verified in isolated Compute. The Owner selected NuExtract3 Q5_K_M after B established the final Qwen3-1.7B structured-output boundary; v11 validation and authority semantics remain frozen. Offline qualification and production B pass, but two distinct real multilingual C resources failed closed at the same canonical contract boundary. C, forced-loss, NORMAL browser-only automatic-cataloguing acceptance, and full-corpus acceptance remain blocked on the Owner's model-capability decision.

### Layer 2 — Accounts & Governance

**Foundation complete.** Exact `owner | member`, invite-only registration, Owner administration, disable/enable/archive/session revocation, Global Homepage Announcements, and Owner-assisted credential reset are green. ADR-024 retires the authenticated self-service password HTTP/UI path: the active Owner may issue a digest-only, 30-minute, one-time capability for an active or disabled Member, and the Member chooses the final password while session/auth-revision safety remains atomic. One-Time External Sharing remains a separate later Layer 2 capability unless explicitly queued.

### Layer 3 — Personal Scholarly Workspace & Scholarly Model

Owner-approved Pre-OCR direction includes:
- Personal Research Overlay (Reading State/progress/flags, Personal Tags, Collections, Saved Views, private research notes);
- Scholarly Records separate from physical Artifacts, while keeping those implementation entities out of primary navigation;
- metadata templates, canonical metadata, provenance/acquisition records;
- fingerprints/safe duplicate detection;
- artifact/version/edition/scan/translation/transcription relationships and derived lineage;
- minimal Authority Records foundation without turning the phase into a mature RDF system;
- Research Inbox/intake;
- sidecar annotations, citations, page-level evidence, Evidence Bundles, Research Questions, structured export foundations.

`RF-META01`, `RF-METASUGGEST01`, bounded front-matter OCR, and `RF-SEARCH01` are complete. Canonical information remains surfaced through normal `资料详情`, not a standalone `学术记录` browser. ADR-031 keeps heavy PDF/render/OCR execution in durable asynchronous Compute while Core retains authorization, candidate persistence/review, and canonical CAS authority. ADR-032 defines the Layer-1 bibliographic domain; ADR-033 defines the exact-pinned ephemeral bibliographic Compute pipeline; ADR-034 defines metadata-aware catalogue query and display identity. No raw OCR page text or rendered page image is persisted. The remaining Personal Research / pre-intelligence queue stays parked.

### Layer 4 — Shared Academic Library

`RF-LIBRARY01` and `RF-LIBRARY02` are complete and remain valid implementation substrate:
- `RF-LIBRARY01`: Library ownership/domain boundary, membership/manager authority, authorized holdings list/preview/download;
- `RF-LIBRARY02`: explicit submitted/approved/rejected/withdrawn contribution review with guarded ownership promotion preserving stable identities/object bytes/contributor provenance/private overlays.

ADR-022 supersedes their earlier optional-Shared-Library product framing. The ordinary product is one Owner-curated shared academic corpus. Completed `RF-SHAREDDEFAULT01` made that canonical Library the default authority/data flow and defined/tested the append-only transition path for existing account-owned corpus data.

Later parked Layer 4 direction includes Library Tags, shared catalog/canonical records/naming, provenance/source confidence, and duplicate/version grouping.

### Layer 5 — Research Infrastructure & Pre-OCR Hardening

Owner-approved final pre-OCR foundation remains parked:
- integrity monitoring;
- metadata snapshot/recovery foundations where justified;
- permission-matrix verification;
- structured-export contracts;
- stable Resource/Artifact/Version/Page identity;
- derived-artifact lineage;
- OCR adapter and extracted-text storage/authorization contracts only.

### Layer 6 — Intelligence

**Future / not authorized by the current program:** whole-document OCR/text extraction, full-text indexing/search, embeddings/retrieval, RAG, evidence-grounded assistance. The completed bounded front-matter OCR fallback does not authorize any of those capabilities.

### Operations Track

Operations is cross-cutting. OPS01A, the `JOB-CORE01` / `COMPUTE-GHA01` / `OCR-METADATA-GHA01` vertical slice, the provider-specific `<768 MiB` GitHub-hosted contract, verified `output/` stage/promote, GOAL-BETA-PREP01, and the exact `L1-INTELLIGENT-LIBRARY01` production release are complete historical substrate. ADR-037 retains GitHub Actions as a disabled normal-production fallback/CI adapter and places the Local Pull worker behind the same provider-neutral Compute contract. WSL2-on-D, CUDA `sm_89`, bounded network I/O, warm runtime lifecycle, and systemd stability are deployed; the worker is intentionally inactive. Exact Core/frontend `3a23a7b…` is deployed at schema v34 with append-only v11/prompt-v7 admission; exact candidate Compute `d5580ed…` and its shared NuExtract3 model are fully hash-verified, while no main service is installed in `AcademicCloudComputeV2`. Rulesets v4–v6 are historical correction attempts and must not be extended with per-book title regexes. Worker-thread isolation was insufficient under the real PDF/native path, so heartbeat scheduling runs in a separate lightweight process. The 270-second lease, 30-second cadence, stale-attempt rejection, and fail-closed authority checks remain live. A and B are green. NuExtract3 Q5_K_M replaces only the isolated local reasoner/model adapter: the single pinned GGUF lives under the shared model root, pinned CUDA llama.cpp is compatible, Qwen is retained only for rollback, and v11 contract/parser/evidence/class/authority/display/queue semantics do not change. Offline A/B/B/unknown qualification passed, but two distinct real multilingual C runs failed closed at `canonical_schema_invalid`; repeated book selection or parser normalization is prohibited. Owner model-capability direction is required before C can resume. Offline Local Compute leaves jobs queued/recoverable and is not immediate cloud execution. Preserve/re-hash the 12 Owner sources under `D:\AcademicCloudCompute\staging\acceptance-sources`. Paid infrastructure, broad credentials, unrelated provider mutation, and work outside the active program remain separately Owner-gated.

## Architecture Principles

Business code must not directly depend on Alibaba Cloud OSS APIs.

```text
File Service
    ↓
Storage Interface
    ↓
Storage Adapter
    ↓
Provider
```

File bytes belong in object storage. Application/database state stores logical metadata and relationships. Moving, organizing, recursively recycling, sharing through Library ownership, or adding research overlays should primarily mutate metadata/relations rather than copy/delete object bytes unless a task explicitly requires a new artifact.

Do not use user-facing filenames as trusted physical storage keys.

## Security Rules

- Never commit secrets.
- Use environment variables/approved secret management; `.env.example`, never real secrets.
- Validate all input and verify authorization server-side for every protected operation.
- Never trust client-provided `owner_id`, account role, Library role, privacy scope, or creator identity.
- Never expose permanent privileged OSS credentials to the browser; prefer short-lived scoped authorization.
- Prevent path traversal/unsafe filename handling.
- Use established auth/crypto libraries; avoid custom cryptography.
- Log security failures without credentials, raw capabilities, signed URLs, password material, session secrets, or private research content.
- Destructive operations default to recoverable soft deletion.
- Do not use real production academic data for development tests.
- Cross-account tests must verify non-disclosure as well as write isolation.

## Working Method

Before changing code:
1. Follow `.agents/skills/academiccloud-workflow/SKILL.md`.
2. Recover active/next approved task from repository state.
3. Inspect relevant code/tests/task acceptance/ADRs.
4. Preserve unrelated work and bounded blast radius.

After implementation or an Owner-approved durable planning decision:
1. Run applicable real checks that cover the changed risk when code/configuration changed.
2. Repair task-caused failures.
3. Perform risk-appropriate review; do not repeat it without a concrete reason.
4. Reconcile the smallest complete authoritative repository set: task card, `CURRENT_STATUS.md`, `TASK_BOARD.md`, `ROADMAP.md`, ADR/`DECISION_LOG.md`, `AGENTS.md`, or workflow skill as appropriate to the decision.
5. Review diff and create a task/decision-level Git checkpoint.
6. Push only to the authorized non-main branch when publication is within scope.
7. If the active local checkout is accessible, synchronize it non-destructively to the intended remote branch and verify local HEAD == remote HEAD. If local access is unavailable, report synchronization as outstanding rather than guessing.
8. Preserve completed `L1-INTELLIGENT-LIBRARY01` evidence as history. Execute only `ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE`; do not start Internal Beta or unrelated roadmap work from it.

When relevant checks are green and no material finding remains, record/commit instead of continuing to search for hypothetical issues.

## Documentation and Git

Project files, tests, task cards, ADRs, and Git history are persistent memory. Chat is temporary planning context.

- `ROADMAP.md` defines durable product sequencing/inventory.
- `CURRENT_STATUS.md` defines concise project-level truth.
- `TASK_BOARD.md` defines the executable queue.
- `tasks/ready/` stores approved future Epic specs.
- `tasks/doing/` stores the active Epic/program.
- `tasks/done/` stores completed Epic records.
- accepted durable workflow/product/architecture/security decisions must be reconciled into their authoritative files per ADR-023.
- after an authorized push, remote publication and local synchronization are separate states; verify the accessible local checkout instead of assuming it followed the remote.

Do not create parallel handoff/status/memory systems.
