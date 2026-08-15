# AcademicCloud Project Specification

**Version:** 1.0  
**Status:** Approved project baseline  
**Current execution phase:** Layer 1 — Basic Private Cloud Storage is implemented and in First Usable Production (live at `cloud.ajtlab.top`); the remaining gates are the live disposable-object E2E, the permanent-delete Owner confirmation, autostart/reboot, backup cadence, and renewal hardening  
**Approved product implementation target:** Layer 1 — Basic Private Cloud Storage

## 1. Purpose

AcademicCloud is a long-term personal academic digital infrastructure project.

Immediate purpose: provide a reliable, self-controlled place to store and access academic files.

Long-term purpose: evolve into structured academic knowledge infrastructure and eventually a source-grounded RAG research assistant.

The project must evolve in layers.

## 2. Product Layers

### Layer 1 — Storage Layer

Approved product implementation scope.

Goal:

> Build a safe, stable, maintainable private academic cloud drive.

Required capabilities:
- authentication
- basic user isolation
- folder hierarchy
- upload
- download
- list/browse
- rename
- move
- soft delete
- recycle bin
- restore
- basic preview where practical
- object storage
- basic security controls
- logs
- deployment documentation
- backup/recovery planning

Layer 1 does not attempt to understand academic content.

### Layer 2 — Knowledge Layer

Future scope. Do not implement now.

Potential capabilities:
- bibliographic metadata
- tags
- provenance/source records
- language and period metadata
- document relationships
- document/version lineage
- citations
- research-question links
- research workflow states
- structured export
- research asset graph

### Layer 3 — Intelligence Layer

Future scope. Do not implement now.

Potential capabilities:
- OCR
- text extraction
- indexing
- embeddings
- retrieval
- RAG
- source-grounded question answering
- page-level evidence tracing

Layer 3 must never control or endanger original files.

## 3. Current Infrastructure Constraints

Current server:
- Alibaba Cloud Simple Application Server
- 2 vCPU
- 1 GiB-class RAM (Linux `916,044 KiB` `MemTotal` after the Owner-authorized PROD-02I upgrade; service cgroup 320/384 MiB, 128 MiB whole-host headroom gate)
- 20 GB system disk
- up to 200 Mbps indicated bandwidth
- Ubuntu 24.04
- Malaysia region

Implications:
- do not use the server as primary academic-file storage
- avoid memory-heavy infrastructure initially
- do not assume large local disk capacity
- object storage should hold file bytes
- server should primarily provide application/API/control functions

Expected near-term academic material volume: under approximately 100 GB.

## 4. Storage Direction

Initial intended provider: Alibaba Cloud OSS.

Application logic must not be hard-coded to OSS.

```text
Application File Logic
        ↓
Storage Interface
        ↓
Storage Adapter
        ↓
Provider
```

Future providers may include R2, S3-compatible services, or NAS.

## 5. Data Model Principles

Logical files and physical storage objects are related but distinct.

A logical file should retain:
- owner
- logical folder
- display filename
- object reference
- checksum
- type
- size
- state
- timestamps

Folders are logical application objects. Moving a logical file should ideally update metadata rather than copy large objects.

Deletion should initially be recoverable:

```text
active
→ deleted (recycle bin)
→ permanently deleted
```

## 6. Reliability Principles

Layer 1 must account for:
- incomplete uploads
- database/object-storage inconsistency
- interrupted connections
- invalid metadata
- failed deletes
- unauthorized access attempts
- server restart/redeployment
- recovery of core metadata/configuration

Upload state should be explicit rather than assumed.

## 7. Security Baseline

- established authentication
- secure session/token handling
- server-side authorization
- secret isolation
- input validation
- protected object access
- no permanent privileged credentials in frontend code
- safe filename handling
- HTTPS in production
- audit/error logging
- recoverable deletion
- practical separation of development and production

## 8. Development Strategy

```text
Project rules
↓
Current task
↓
Plan
↓
Implementation
↓
Tests
↓
Documentation update
↓
Git checkpoint
↓
Next task
```

Repository files and Git are the source of truth, not chat history.

## 9. Layer 1 Success Definition

A user can reliably:
1. authenticate,
2. create/browse folders,
3. upload a representative PDF,
4. see it in the application,
5. download/open it,
6. rename/move it,
7. delete it to recycle bin,
8. restore it,
9. repeat these operations without breaking data isolation,
10. restart/redeploy without losing file metadata or object references.

## 10. Non-Goals for Layer 1

- OCR
- RAG
- semantic search
- research graph
- citation generation
- cloud-drive connectors
- Baidu transfer
- Google Drive/OneDrive transfer
- mobile app
- desktop sync
- collaborative editing
- enterprise multi-tenant administration
- large-scale microservice architecture

## 11. Long-Term Design Intent

```text
Reliable File Storage
        ↓
Structured Research Library
        ↓
Domain Research Infrastructure
        ↓
Source-Grounded AI Research Assistant
```

Future flexibility is a design constraint, not a current implementation requirement.
