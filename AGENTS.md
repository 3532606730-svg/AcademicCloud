# AGENTS.md

## Project

**AcademicCloud** is a long-term academic digital infrastructure project.

**Current execution phase:** Core Drive repository closure is complete while the accepted UX01 production release remains live. The approved next product boundary is Accounts & Sharing I, followed by the approved global homepage announcements MVP. Shared Library, Research Infrastructure, and Intelligence remain future boundaries unless separately authorized.

**Approved continuous objective (repository/local only):** complete UX03, PERF01, and FOLDER01; then execute Accounts I and the global homepage announcements MVP. PASSWORD01 is optional after Accounts I and announcements are green. OPS01A is a conditional cross-cutting operations-preparation task. Production deployment, production migration, main merge, External Sharing, Shared Library, OCR, and RAG are not authorized by this continuous objective.

## Engineering Workflow

Ordinary AcademicCloud engineering tasks follow `.agents/skills/academiccloud-workflow/SKILL.md`. The repository is the durable project memory. Product and architecture facts come from current code, Git, task cards, current-state documents, and accepted ADRs—not from chat memory.

## Highest-Priority Rules

1. **Modularity first.** Core modules must have clear boundaries and interfaces. Failure or replacement in one module must not unnecessarily break unrelated modules.
2. **Fault isolation is mandatory.** Optional modules must never become hard dependencies of the core file system.
3. **Do not expand beyond the approved objective.** Record later ideas instead of implementing them.
4. **Do not change architecture silently.** Durable architecture or product-model changes require a recorded decision with migration and rollback consequences.
5. **Prefer simple, maintainable solutions.** The current 1 GiB-class control-plane host is intentionally small; do not add unnecessary resident services.
6. **Data safety outranks feature count.** Never silently overwrite, destroy, resurrect, or misattribute academic files.
7. **External services must be abstracted.** File bytes remain behind storage adapters; compute-heavy OCR/RAG/AI must stay isolated from the core drive.
8. **Server authority is mandatory.** Never trust client-provided owner, role, membership, or authorization claims.
9. **Production is a separate gate.** Repository implementation does not authorize SSH, live migration, DNS/TLS/OSS mutation, deployment, destructive production tests, or main merge.
10. **Each Epic must end at an evidence-backed checkpoint.** Tests, adversarial review, task-state reconciliation, and a Git checkpoint come before autonomous progression to the next approved Epic.

## Product Layers

### Layer 1 — Core Drive

Reliable private file storage and file management:
- authentication foundation
- user/account isolation
- folders
- direct browser upload/download
- listing, rename, move
- favorites
- recycle/restore
- preview
- mobile/desktop UI
- security/reliability
- deployment/recovery foundation

Core Drive closure checkpoint: UX03 repair, PERF01 evidence, and FOLDER01 recursive recycle/restore are complete in repository development. Production rollout remains separate.

### Layer 2 — Accounts & Sharing

Approved first Epic: **Accounts I**
- global `owner | member` roles
- first-Owner bootstrap
- invite-only registration
- invitation management
- Owner user administration
- Member disable/enable
- revoke all sessions on disable

Approved second Epic: **Global Homepage Announcements**
- Owner-administered create/edit/publish/unpublish
- authenticated global read on the homepage
- database/API-backed plain-text announcements with severity and effective/expiry windows
- no notification delivery, read receipts, acknowledgement workflow, or new global role

Optional follow-up after Accounts I and announcements: password change. One-Time External Sharing is a later Layer 2 task and is not part of the current continuous objective.

### Layer 3 — Shared Academic Library

Future, separate authorization:
- Library-owned resources
- Library membership and permissions
- Library-scoped Trusted Contributor
- contribution review
- academic catalog and canonical records

### Layer 4 — Research Infrastructure

Future:
- provenance
- document/version relationships
- citations and page references
- research questions
- structured export
- research asset graph

### Layer 5 — Intelligence

Future:
- OCR/text extraction
- indexing/search
- embeddings/retrieval
- RAG
- source-grounded research assistance

### Operations Track

Operations is cross-cutting rather than a product layer. OPS01A may prepare read/verify/rehearsal tooling, but production activation or destructive recovery always remains separately Owner-gated.

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

File bytes belong in object storage. Application/database state stores logical metadata such as account ownership, folder, display filename, object key, provider, media type, size, checksum, lifecycle state, and timestamps.

Moving or recursively recycling logical resources should primarily mutate metadata, not copy or delete object bytes.

Do not use user-facing filenames as trusted physical storage keys.

## Security Rules

- Never commit secrets.
- Use environment variables or approved secret management.
- Provide `.env.example`, never real secrets.
- Validate all input.
- Verify authorization server-side for every protected operation.
- Never trust client-provided `owner_id`, account role, or Library role.
- Do not expose permanent privileged OSS credentials to the browser.
- Prefer short-lived scoped upload/download authorization.
- Prevent path traversal and unsafe filename handling.
- Use established authentication libraries/services; avoid custom cryptography.
- Log security failures without credentials, raw capability tokens, signed URLs, password material, or session secrets.
- Destructive operations should default to recoverable soft deletion.
- Do not use real production academic data for development tests.

## Working Method

Before changing code:
1. Follow `.agents/skills/academiccloud-workflow/SKILL.md`.
2. Recover the active/next approved task from repository state.
3. Inspect relevant code, tests, task acceptance criteria, and ADRs.
4. Preserve unrelated work and keep blast radius bounded.

After implementation:
1. Run applicable tests and checks.
2. Repair failures caused by the task.
3. Perform an adversarial review appropriate to risk.
4. Update the task card, `CURRENT_STATUS.md`, and `TASK_BOARD.md`; update durable decisions only when needed.
5. Review the diff and create the task-level Git checkpoint.
6. Continue only to the next task inside an explicitly approved continuous objective; otherwise stop.

## Documentation and Git

Project files, code, tests, task cards, ADRs, and Git history are persistent project memory. Chat history is temporary planning context.

`ROADMAP.md` defines product sequencing. `TASK_BOARD.md` defines the executable queue. `tasks/ready/` stores approved task specifications that are not active yet; `tasks/doing/` stores active Epic state; `tasks/done/` stores completed Epic records.

Do not create parallel handoff/status/memory systems.
