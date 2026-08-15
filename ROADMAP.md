# AcademicCloud Roadmap

Later phases must not be pulled forward without explicit approval.

## Layer 0 — Project Setup

**Goal:** create a stable project and project-memory foundation.

Deliverables:
- repository structure
- Git initialization
- project documentation
- task tracking
- decision records
- development rules
- environment documentation

**Status:** Complete

## Layer 1 — Basic Private Cloud Storage

**Goal:** deliver a reliable private cloud-drive MVP.

Planned epics:

### L1-E01 Core Architecture
- minimal frontend/backend structure
- configuration strategy
- local development workflow
- health-check/basic API connectivity

### L1-E02 Database Foundation
- account/user representation
- folder model
- file metadata model
- migrations
- integrity constraints

### L1-E03 Authentication & Authorization
- authentication
- protected routes/API
- ownership/authorization checks

### L1-E04 Storage Abstraction
- storage interface
- Alibaba OSS adapter
- safe object keys
- secure upload/download authorization strategy

### L1-E05 File Management
- upload
- list
- download
- folders
- rename
- move
- soft delete
- recycle bin
- restore
- permanent delete

### L1-E06 Frontend Interface
- login
- file browser
- upload flow
- file actions
- basic PDF/image/text preview where practical

### L1-E07 Security & Reliability
- validation
- authorization verification
- secret handling
- error handling
- logging
- upload consistency
- checksum/integrity strategy
- deletion safety

### L1-E08 Testing & Deployment
- critical-path tests
- representative file tests
- deployment
- HTTPS
- backup/recovery documentation
- restart/redeployment verification

Layer 1 ends when acceptance criteria are satisfied. Do not automatically begin Layer 2.

**Current phase note (2026-08-16):** Layer 1 core storage is in First Usable
Production (live `cloud.ajtlab.top`; fresh live E2E PASS). The open Layer 1
remainder is: the L1-UX01 production window (UX polish: bilingual UI, upload
UX, browser-correct Preview — implementation PASS, deployment Owner-gated),
the permanent-delete and autostart Owner decisions, and the PROD-03C3
operational hardening cluster. Shared Library (research library) remains NOT
started; Knowledge/RAG layers remain future-only.

## Layer 2 — Academic Knowledge Layer

Future only:
- academic metadata
- tags
- provenance
- workflow states
- document/version lineage
- research questions
- citations
- structured export
- research asset graph

## Layer 3 — Intelligence Layer

Future only:
- OCR
- text extraction
- full-text indexing
- embeddings
- vector retrieval
- RAG
- evidence/page citation
- research assistant

## Deferred Integrations

- WebDAV
- URL import
- OneDrive
- Google Drive
- Baidu Netdisk
- third-party cloud migration
- desktop sync
- mobile application
