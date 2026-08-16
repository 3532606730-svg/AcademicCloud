# AcademicCloud Project Specification

**Version:** 2.0  
**Status:** Approved product baseline  
**Last reconciled:** 2026-08-17

## 1. Purpose

AcademicCloud is long-term academic digital infrastructure.

Near-term purpose: provide a reliable, self-controlled academic cloud drive that can safely serve more than one invited user.

Long-term purpose: evolve from reliable file storage into a shared academic library, structured research infrastructure, and finally a source-grounded AI research assistant.

The product must evolve in explicit layers. Original academic files remain authoritative and must never depend on later AI features for availability or integrity.

## 2. Product Architecture by Layer

### Layer 1 — Core Drive

Goal:

> Reliable, secure, maintainable private academic file storage.

Implemented foundation includes:
- authentication and server-side user isolation
- logical folder hierarchy
- direct browser upload to object storage
- signed/direct download
- list/browse
- rename/move
- recycle/restore
- permanent file deletion with conservative safeguards
- safe inline preview
- Favorites
- bilingual desktop interface
- drag/drop upload
- dedicated mobile presentation
- security/reliability hardening
- deployment, backup, and recovery foundation

Open closure work:
- finish the independent UX03 repair gate
- performance measurement and only evidence-supported low-risk optimization
- transactional recursive non-empty-folder recycle/restore

Layer 1 ends when these closure tasks are green and independently reviewable. Production deployment remains a separate Owner gate.

### Layer 2 — Accounts & Sharing

Goal:

> Turn the private drive into a controlled multi-user private academic cloud without opening public registration.

Approved first Epic — Accounts I:
- global roles: `owner | member`
- deterministic legacy migration
- first-Owner bootstrap
- invite-only registration
- digest-only invitation capabilities
- invitation listing/revocation for Owner
- minimal Owner user administration
- Member disable/enable
- revoke all Member sessions on disable
- strict cross-account isolation

Optional near-term follow-up:
- authenticated password change with concurrency-safe update and session invalidation

Later Layer 2 work, not part of the current continuous objective:
- One-Time External Sharing using short-lived, revocable/single-use capability semantics
- additional session-management UX if justified

Explicit Layer 2 non-goals for the current Accounts I Epic:
- public signup
- email/SMTP verification
- OAuth/social login
- arbitrary role editing
- account deletion
- Shared Library membership

### Layer 3 — Shared Academic Library

Goal:

> Move from account-owned private storage to governed shared academic collections.

Planned capabilities:
- Library-owned resources distinct from uploader identity
- Library membership and permissions
- Library-scoped Owner/Member/Trusted Contributor semantics
- contribution lifecycle and review
- approved/rejected/submitted workflow
- academic catalog records
- author/editor/translator/language/publication/type metadata
- provenance/source confidence
- original filename and canonical filename
- duplicate/canonical-record relationships
- multiple physical files/versions attached to one bibliographic record

This layer requires separate authorization after Layer 2 closure.

### Layer 4 — Research Infrastructure

Goal:

> Represent academic materials as research assets rather than isolated files.

Potential capabilities:
- provenance/source records
- document relationships
- version/scan/edition/translation lineage
- citations and page references
- research-question links
- structured export
- research workflow state
- research asset graph

### Layer 5 — Intelligence

Goal:

> Add source-grounded machine assistance without becoming authoritative over originals.

Potential capabilities:
- OCR and text extraction
- full-text indexing/search
- embeddings and retrieval
- RAG
- evidence/page citation
- source-grounded research assistance

Compute-heavy OCR/embedding/RAG jobs should be isolated from the small core application host rather than turning the drive service into a compute worker.

## 3. Cross-Cutting Operations Track

Operations is not a product layer.

The repository already contains deployment, backup/restore, systemd, Nginx, log rotation, health/readiness, migration verification, and production runbooks.

Approved conditional OPS01A may prepare:
- a lightweight operations status/check command
- backup verification/freshness checks
- disk/memory/swap checks
- certificate-expiry checks
- restore-drill tooling in isolation
- retention planning/dry-run
- systemd service/timer templates
- restart-policy review

OPS01A does **not** authorize:
- SSH to production
- enabling timers/services
- destructive backup pruning
- production restore
- certificate replacement
- HSTS enablement
- Nginx/OSS/DNS/TLS mutation
- production deployment

## 4. Current Infrastructure Constraints

Current control-plane host:
- Alibaba Cloud Simple Application Server
- 2 vCPU
- 1 GiB-class RAM (`916,044 KiB` Linux `MemTotal` in the accepted production-host measurements)
- 1 GiB swap
- 20 GB system disk
- Ubuntu 24.04
- Malaysia region

Current service resource policy retains the 320/384 MiB cgroup limits and a 128 MiB whole-host headroom gate unless superseded by a later accepted production decision.

Implications:
- file bytes live in object storage, not the 20 GB system disk
- backend remains a control/authorization/metadata plane, not a large-file proxy
- avoid unnecessary resident services
- SQLite remains appropriate for the current low-concurrency/private-community scale
- Accounts, invitations, catalog metadata, and shared-library metadata are expected to fit this host class
- OCR/embedding/local model work should be moved to isolated workers/services when introduced

Expected near-term academic material volume remains under approximately 100 GB, with object storage carrying the file bytes.

## 5. Storage Direction

Current provider: private Alibaba Cloud OSS behind `StorageAdapter`.

Application logic must remain provider-neutral:

```text
Application File Logic
        ↓
Storage Interface
        ↓
Storage Adapter
        ↓
Provider
```

Future providers may include S3-compatible object storage, R2, NAS, or another approved backend.

Large upload/download bytes should not be proxied through Fastify merely to add product features.

## 6. Data Model Principles

Logical resources and physical object-storage objects are distinct.

A logical file should retain authoritative metadata such as:
- owning account or future owning Library
- uploader/contributor where applicable
- logical folder/collection
- display filename
- object reference
- checksum
- media type
- size
- lifecycle state
- timestamps

Moving logical resources should generally mutate metadata rather than copy object bytes.

Deletion is recoverable before permanent purge. Recursive folder recycle must preserve independently pre-deleted descendants instead of resurrecting them during parent restore.

Favorites are per-user relationships, not a global flag on a file/folder.

Future Shared Library resources should not become orphaned merely because an uploader account is later disabled.

## 7. Authentication and Account Principles

Current authentication baseline:
- Argon2id password hashing (`m=65536`, `t=3`, `p=1`)
- bounded KDF concurrency
- 32-byte opaque session secrets
- only SHA-256 session digests persisted
- seven-day absolute sessions
- exact-origin unsafe-request protection
- production `__Host-ac_session` Strict/Secure/HttpOnly cookie

Accounts I extends this baseline rather than replacing it.

Global account roles are deliberately small:
- `owner`
- `member`

Library-scoped roles belong to Layer 3 and must not be confused with global account roles.

No public signup is planned. New normal users enter through Owner-issued invitations.

## 8. Reliability Principles

AcademicCloud must account for:
- incomplete uploads
- database/object-storage inconsistency
- interrupted connections
- invalid/stale metadata
- failed deletes
- concurrent lifecycle mutations
- unauthorized/guessed-resource access
- server restart/redeployment
- migration mismatch
- backup/restore integrity
- account/session revocation
- future invitation redemption races

State transitions should be explicit and transactionally safe where multiple rows must change together.

Fail closed rather than silently relocating, promoting, resurrecting, overwriting, or guessing data/security state.

## 9. Security Baseline

- server-side authorization
- server-derived account identity
- secret isolation
- input validation
- protected object access
- no permanent privileged cloud credentials in frontend code
- short-lived scoped browser storage authorization
- HTTPS in production
- secret-safe audit/error logging
- recoverable deletion by default
- development/production separation
- capability tokens stored digest-only when practical
- raw invitation/session/password material never logged or persisted to browser storage

## 10. Development Strategy

AcademicCloud is repository-driven:

```text
Repository policy + roadmap
↓
TASK_BOARD approved queue
↓
ready task specification
↓
active task card
↓
implementation
↓
tests
↓
adversarial review
↓
document/state reconciliation
↓
Git checkpoint
↓
next approved task
```

Repository files and Git are the source of truth; chat history is planning context only.

The Owner may authorize a continuous objective across multiple Epics. That authorization permits autonomous progression only through the tasks explicitly listed in the approved queue, with each Epic independently verified and checkpointed.

## 11. Current Approved Continuous Objective

Repository/local work only:

1. finish current UX03 independent-review repairs;
2. PERF01 evidence-first performance baseline and safe low-risk optimization;
3. FOLDER01 transactional recursive folder recycle/restore;
4. Accounts I — roles, invite-only registration, invitation management, Owner user administration, disable/enable, session revocation;
5. PASSWORD01 only if Accounts I is fully green and the task remains safe;
6. OPS01A only if its board preconditions are met.

Not authorized by this objective:
- production deployment/migration/SSH/config mutation
- main merge
- One-Time External Sharing
- Shared Library
- OCR/RAG/AI

## 12. Long-Term Design Intent

```text
Reliable Core Drive
        ↓
Controlled Accounts & Sharing
        ↓
Shared Academic Library
        ↓
Research Infrastructure
        ↓
Source-Grounded Intelligence
```

Future flexibility is a design constraint. Future complexity is not a reason to weaken the current core or pull unapproved work forward.
