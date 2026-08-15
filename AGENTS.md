# AGENTS.md

## Project

**AcademicCloud**

AcademicCloud is a long-term personal academic digital infrastructure project.

**Current execution phase:** Layer 1 — Basic Private Cloud Storage is implemented and in First Usable Production (live at `cloud.ajtlab.top`); the remaining gates are the live disposable-object E2E, the permanent-delete Owner confirmation, autostart/reboot, backup cadence, and renewal hardening

**Approved product implementation target:** Layer 1 — Basic Private Cloud Storage

## Engineering Workflow

Ordinary AcademicCloud engineering tasks follow `.agents/skills/academiccloud-workflow/SKILL.md`. The skill defines the working method; product and architecture facts remain in the current code, Git history, project documentation, and accepted ADRs.

## Highest-Priority Rules

1. **Modularity first.** Core modules must have clear boundaries and interfaces. Failure or replacement in one module must not break unrelated modules.
2. **Fault isolation is mandatory.** Optional modules must never become hard dependencies of the core file system.
3. **Do not expand scope without approval.** Record out-of-scope ideas instead of implementing them.
4. **Do not change architecture silently.** Major changes require a proposal explaining reason, alternatives, impact, migration cost, and rollback.
5. **Prefer simple, maintainable solutions.** This is initially a personal project with less than roughly 100 GB of academic material.
6. **Data safety is more important than feature count.** Never silently overwrite, destroy, or mutate source files.
7. **External services must be abstracted.** Storage uses adapters; future cloud drives use connectors; OCR/RAG/AI remain isolated.
8. **The approved product implementation scope is Layer 1 only.** Do not implement OCR, RAG, AI chat, research graphs, external cloud-drive transfer, mobile apps, or desktop sync unless explicitly approved.

## Layer 1 Objective

Build a reliable private cloud-drive MVP with:
- authentication
- user isolation / authorization foundation
- folders
- upload
- file listing
- download
- rename
- move
- soft delete / recycle bin
- restore
- basic preview where practical
- object storage integration
- logging and basic security controls
- deployment and recovery documentation

Do not start Layer 2 automatically.

## Architecture Principles

Business code must not directly depend on Alibaba Cloud OSS APIs.

```text
File Service
    ↓
Storage Interface
    ↓
Aliyun OSS Adapter
```

Future adapters may include R2, S3-compatible storage, or NAS/local storage.

File bytes belong in object storage. Database/application state stores logical metadata such as owner, folder, display filename, object key, provider, MIME type, size, checksum, state, and timestamps.

Do not use user-facing filenames as trusted physical storage keys.

## Security Rules

- Never commit secrets.
- Use environment variables or approved secret management.
- Provide `.env.example`, never real secrets.
- Validate all user input.
- Verify authorization server-side for every protected file operation.
- Never trust a client-provided `owner_id`.
- Do not expose permanent privileged OSS credentials to the browser.
- Prefer short-lived scoped upload/download authorization.
- Prevent path traversal and unsafe filename handling.
- Use established authentication libraries/services.
- Avoid custom cryptography.
- Log security failures without secrets.
- Destructive operations should default to recoverable soft deletion.
- Do not casually use production data for development testing.

## Working Method

Before changing code:
1. Follow the minimal context recovery and task-selection process in `.agents/skills/academiccloud-workflow/SKILL.md`.
2. Inspect the current task card, project state, Git state, and directly relevant code; consult specifications and ADRs when the task requires them.
3. State task understanding, expected files/modules to change, and major risks.
4. Do not broadly refactor without approval.

After implementation:
1. Run applicable tests and checks.
2. Fix failures caused by the change.
3. Update the task card, `CURRENT_STATUS.md`, and `TASK_BOARD.md`; update decisions only when needed.
4. Review the diff, create the task-level Git checkpoint, and summarize changes and verification.
5. Stop at the Epic checkpoint unless the user authorized a broader continuous objective.

## Documentation and Git

Project files, code, and Git history are persistent project memory; chat history is not.

Keep changes small and task-focused. Do not mix unrelated refactors into feature work.

## Future Directions — Not Current Requirements

Preserve, but do not implement during Layer 1:
- research asset graph
- research workflow layer
- source credibility metadata
- document/version lineage
- academic data export
- research-question management
- citation support
- extensible interfaces
- OCR
- full-text indexing
- RAG
- AI research assistant
