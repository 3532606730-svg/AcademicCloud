# AcademicCloud Task Board

## Current Phase

**Layer 0 — Project Setup**

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

## Ready

### SETUP-003 — Layer 1 Technical Architecture Decision

**Status:** Ready — not started; requires explicit instruction

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

This is an architecture-decision task. Do not install frameworks, create business code, or begin Layer 1 implementation without separate approval.

## Backlog — Layer 1

- L1-E01 Core Architecture
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
