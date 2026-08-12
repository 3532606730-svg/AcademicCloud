# AcademicCloud

AcademicCloud is a long-term personal academic digital infrastructure project.

Current goal:

> Build a reliable, secure, maintainable private cloud drive for academic files.

Future layers may add structured academic knowledge management and RAG-based research assistance, but these are outside current scope.

## Current Status

**Layer 0 — Project Setup**

No business functionality should be implemented until setup and architecture tasks are approved.

Read:
- `AGENTS.md` — mandatory rules
- `PROJECT_SPEC.md` — product/architecture specification
- `ROADMAP.md` — phased plan
- `CURRENT_STATUS.md` — current state
- `TASK_BOARD.md` — task state
- `DECISION_LOG.md` — durable decisions

## Project Structure

```text
AcademicCloud/
├── backend/
├── frontend/
├── database/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── deployment/
│   └── decisions/
├── tasks/
│   ├── backlog/
│   ├── ready/
│   ├── doing/
│   └── done/
├── workers/
├── plugins/
├── tests/
└── deployment/
```

Many directories are intentionally empty during project setup.

## Core Principles

- modularity
- fault isolation
- data safety
- storage portability
- small task scope
- documented decisions
- testing before progression
- no silent architecture changes
- no premature OCR/RAG/AI work

## Current Infrastructure

Alibaba Cloud Simple Application Server:
- 2 vCPU
- 512 MB RAM
- 20 GB disk
- Ubuntu 24.04
- Malaysia region

Expected initial academic-file volume:
- less than approximately 100 GB

Initial storage direction:
- Alibaba Cloud OSS behind a storage abstraction

## Development Rule

Repository files and Git are the source of truth. Chat history is temporary context.

## License

No public licensing or distribution decision has been made.
