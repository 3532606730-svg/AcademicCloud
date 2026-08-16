# ADR-010 — Product Roadmap Expansion and Repository-Driven Continuous Objectives

**Date:** 2026-08-17  
**Status:** Accepted

## Context

AcademicCloud's original repository plan correctly constrained the first implementation layer to a private cloud drive and established a repository-backed autonomous engineering workflow. During later product design, the approved direction expanded beyond the original Layer 1 boundary: controlled multi-user accounts, invitation registration, Shared Library governance, academic cataloging, research infrastructure, and eventual source-grounded AI became materially clearer.

For several iterations, that newer product design lived mainly in chat and increasingly large execution prompts while `ROADMAP.md`, `PROJECT_SPEC.md`, `AGENTS.md`, and task state still described the earlier Layer-1-only boundary. This created two competing planning surfaces:

1. persistent repository truth; and
2. transient chat/prompt specifications.

The project already had ADR-008 and `.agents/skills/academiccloud-workflow/SKILL.md` specifically to avoid that condition.

## Decision

### 1. The repository is restored as the authoritative planning system

Product direction, queue order, task acceptance criteria, and durable invariants must be compiled back into repository files before long autonomous execution.

The roles of the durable files are:
- `PROJECT_SPEC.md` — product model and governing principles;
- `ROADMAP.md` — cross-layer sequencing;
- `CURRENT_STATUS.md` — concise current factual state;
- `TASK_BOARD.md` — executable queue and continuous objective;
- `tasks/ready/` — approved not-yet-active Epic specifications;
- `tasks/doing/` — active Epic working memory;
- `tasks/done/` — completed Epic record;
- ADRs — durable product/architecture/security/workflow decisions;
- code/tests/Git — implementation truth and evidence.

Long chat prompts may be used to design or clarify work, but they are not the durable execution specification once the same decisions are recorded in the repository.

### 2. The post-Core-Drive product layers are explicit

AcademicCloud now uses this product sequence:

1. **Layer 1 — Core Drive**
   - reliable storage/file lifecycle
   - Favorites
   - desktop/mobile UX
   - security/reliability
   - performance closure
   - recursive folder recycle/restore

2. **Layer 2 — Accounts & Sharing**
   - global Owner/Member roles
   - invite-only registration
   - user administration
   - password/session lifecycle
   - later One-Time External Sharing

3. **Layer 3 — Shared Academic Library**
   - Library-owned resources
   - membership/permissions
   - Trusted Contributor
   - contribution review
   - academic catalog/canonical records

4. **Layer 4 — Research Infrastructure**
   - provenance
   - document/version relationships
   - citations/page references
   - research questions/workflow
   - structured export
   - research asset graph

5. **Layer 5 — Intelligence**
   - OCR/text extraction
   - indexing/search
   - embeddings/retrieval
   - RAG
   - source-grounded research assistance

This does not retroactively expand the historical Layer 1 scope. It defines the approved route after the Core Drive closure.

### 3. Operations is cross-cutting

Backup verification, health checks, certificate-expiry monitoring, restore drills, service/timer templates, resource checks, and similar operational capabilities are not a product layer.

Repository-only operations preparation may be scheduled as bounded OPS Epics. Production activation, destructive retention, restore, credential/system-security changes, DNS/TLS/OSS/Nginx/systemd mutation, and deployment remain separate Owner gates.

### 4. Long autonomous runs are objective-driven, not clock-driven

A long Agent run may cross multiple Epics only when the Owner explicitly authorizes a continuous objective in `TASK_BOARD.md`.

Each Epic must still:
- recover repository context;
- execute only its approved scope;
- pass task-specific verification;
- receive an appropriate adversarial review;
- reconcile task/project state;
- create an independently reviewable Git checkpoint.

The Agent may then re-recover state and enter the next approved Ready Epic.

Elapsed time never authorizes new work. Optional tasks may be skipped safely. Final verification/review must not be sacrificed merely to consume a time window.

### 5. Current continuous objective

The current repository/local objective is:

```text
finish L1-UX03 repair
→ L1-PERF01
→ L1-FOLDER01
→ L2-ACCOUNTS01
→ L2-PASSWORD01 (optional)
→ OPS01A (conditional)
→ STOP
```

Not authorized by this objective:
- production access/mutation/deployment;
- main merge;
- One-Time External Sharing;
- Shared Academic Library;
- Research Infrastructure;
- OCR/RAG/AI.

## Consequences

- Future engineering prompts can remain short because detailed task truth lives in the repository.
- The Agent can autonomously advance farther without repeatedly asking the Owner for routine engineering decisions.
- Chat/planning discoveries must be reconciled into repository truth before they become durable requirements.
- Each high-risk subsystem remains a separate review unit even inside a continuous overnight run.
- Production and product-direction gates remain explicit rather than being inferred from roadmap order.
- The 1 GiB-class server remains the core control-plane target; compute-heavy Intelligence work should be isolated when introduced.

## Revisit Criteria

Revisit this ADR if:
- the project adopts a different persistent planning/task system;
- the repository becomes multi-service enough that one task board can no longer safely order work;
- production operations require a dedicated infrastructure repository;
- a team workflow replaces the current Owner + main Agent + independent reviewer model.
