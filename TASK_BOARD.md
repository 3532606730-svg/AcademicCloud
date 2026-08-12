# AcademicCloud Task Board

## Current Phase

**Layer 0 — Project Setup: Complete**

**Next phase:** Layer 1 — Basic Private Cloud Storage implementation

## Completed

### SETUP-001 — Project Knowledge Setup

**Status:** Done

Goal: place the approved project rules and project-memory files in the repository root.

Allowed:
- Markdown project files
- project-management structure
- Git initialization/verification
- documentation-only changes

Not allowed:
- business code
- framework installation
- database implementation
- OSS integration
- authentication
- file upload/download

Acceptance criteria:
- [x] all core Markdown files exist in repository root
- [x] Codex can correctly summarize project rules
- [x] no business code has been added
- [x] Git state is initialized or confirmed
- [x] `CURRENT_STATUS.md` matches reality
- [x] next task is proposed but not automatically executed

### SETUP-002 — Environment Inspection

**Status:** Done

Goal: inspect the local environment and recommend the minimal Layer 1 setup without implementing business functionality.

Inspect:
- operating system
- Git
- Node.js / Python availability
- package managers
- Docker availability as information only
- local development constraints
- 512 MB server-memory implications

Completion notes:
- [x] confirmed Windows 11 x64 and local Git state
- [x] confirmed Node.js `v24.16.0`, `npm.cmd`, and `npx.cmd` availability
- [x] confirmed that no standard Python development environment is available
- [x] recorded disk-space, GitHub TLS, and PowerShell execution-policy risks without changing the system
- [x] assessed the 512 MB Ubuntu server constraint and recommended a lightweight Layer 1 architecture
- [x] made no installations, configuration changes, or business-code changes

### SETUP-003 — Layer 1 Technical Architecture Decision

**Status:** Done

Goal: compare and determine the minimum technical stack for Layer 1, including:
- backend runtime/framework
- frontend strategy
- database
- package manager
- authentication approach
- local development model
- production deployment model

Decision priorities:
- modularity
- low resource usage
- compatibility with the 512 MB Ubuntu server
- compatibility with the current Windows development environment
- maintainability
- avoidance of over-engineering

Completion notes:
- [x] compared Node.js and Python backend options against the confirmed environment
- [x] compared SPA, integrated frontend, and SSR strategies
- [x] compared SQLite and PostgreSQL deployment options
- [x] selected SQLite-backed opaque sessions and deferred password-hashing implementation details
- [x] selected npm workspaces and a lightweight Nginx/systemd production model
- [x] defined the five minimum module boundaries: `platform`, `auth`, `drive`, `storage`, and `persistence`
- [x] received approval for the final architecture with Node.js, SQLite, and password-hashing policy corrections
- [x] recorded the accepted decision in `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- [x] made no dependency installations, runtime upgrades, framework initialization, or business-code changes

### SETUP-004 — Autonomous AcademicCloud Engineering Workflow

**Status:** Done

Goal: establish the repository-backed AI engineering workflow used to recover context, select and execute approved tasks, validate work, preserve task memory, coordinate subagents safely, maintain project state, and create Git checkpoints.

Completion notes:
- [x] created `.agents/skills/academiccloud-workflow/SKILL.md`
- [x] kept the Skill instruction-only with no scripts, references, assets, hooks, daemon, service, index, or additional dependency
- [x] defined repository source-of-truth precedence and minimum context recovery
- [x] defined concise `tasks/doing/<TASK-ID>.md` task cards and `tasks/done/` completion movement
- [x] defined the standard recover, select, plan, execute, verify, review, record, commit, and report lifecycle
- [x] defined default autonomous authority for ordinary engineering work within approved scope
- [x] defined mandatory user escalation boundaries
- [x] defined main-agent orchestration and single-writer subagent safety
- [x] validated Skill structure and repository discovery path, and performed a read-only simulation of `开始下一个任务`
- [x] did not create scheduled work or execute `L1-E01`

## Ready

### L1-E01 — Core Architecture Scaffold

**Status:** Ready — starts on a user task-selection instruction such as `开始下一个任务`

Goal: establish the approved minimum Layer 1 application foundation:
- npm workspace structure for the existing `backend/` and `frontend/` directories
- TypeScript and configuration foundations
- Fastify application bootstrap and health check
- React/Vite SPA bootstrap and basic API connectivity
- local development workflow

This task has not started. It must not implement database models, authentication, OSS integration, or file-management business functionality without the relevant approved task scope.

## Backlog — Layer 1

- L1-E02 Database Foundation
- L1-E03 Authentication & Authorization
- L1-E04 Storage Abstraction
- L1-E05 File Management
- L1-E06 Frontend Interface
- L1-E07 Security & Reliability
- L1-E08 Testing & Deployment

## Explicitly Deferred

Do not move to Ready without approval:
- OCR
- RAG
- research graph
- research workflow
- academic citation system
- Baidu Connector
- OneDrive Connector
- Google Drive Connector
- WebDAV Connector
- mobile app
- desktop sync
