# AcademicCloud

AcademicCloud is long-term academic digital infrastructure.

Current product direction:

> Reliable Core Drive → controlled Accounts & Sharing → Shared Academic Library → Research Infrastructure → source-grounded Intelligence.

The repository and Git are the durable project memory. Chat is planning context only.

## Current Status

**Production:** the accepted UX01 generation remains live at `https://cloud.ajtlab.top`. Production is a separate Owner-gated track.

**Development:** Core Drive repository closure and Accounts I are green on `codex/project-memory-reconcile-20260817`; Global Homepage Announcements is the next approved repository task. This newer repository generation is not deployed.

**Accepted local/repository checkpoints:**
- Layer 1 foundation L1-E01–L1-E08
- UX01 production acceptance
- UX02 academic workspace implementation
- BUGAUDIT01 independent review PASS
- FAV01 independent review PASS
- UX03 repairs independently reviewed and checkpointed
- PERF01 evidence checkpoint
- FOLDER01 transactional recursive recycle/restore independently reviewed and checkpointed
- Accounts I Owner/Member, invitation, administration, and isolation foundation independently reviewed and checkpointed

**Approved remaining sequence:** Global Homepage Announcements → Password Change only if its conditional gate remains satisfied → OPS01A only if its gate remains satisfied → stop. External Sharing, Shared Library, OCR, RAG, production rollout, and main merge are not part of the current continuous objective.

Read:
- `AGENTS.md` — mandatory repository policy
- `.agents/skills/academiccloud-workflow/SKILL.md` — autonomous engineering workflow
- `PROJECT_SPEC.md` — product specification
- `ROADMAP.md` — product sequencing
- `CURRENT_STATUS.md` — concise current truth
- `TASK_BOARD.md` — executable queue
- `DECISION_LOG.md` — durable decisions
- `tasks/ready/` — approved not-yet-active Epic specifications
- `tasks/doing/` — active Epic state
- `tasks/done/` — completed Epic records

## Product Layers

### Layer 1 — Core Drive

Private academic cloud-drive foundation: auth, folders, direct upload/download, preview, move/rename, recycle/restore, Favorites, mobile/desktop UI, security/reliability, deployment/recovery foundation.

Core Drive repository closure tasks are complete. Production rollout remains a separate Owner gate.

### Layer 2 — Accounts & Sharing

Approved Accounts I scope:
- `owner | member`
- first-Owner bootstrap
- invite-only registration
- invitation management
- minimal Owner user administration
- Member disable/enable
- revoke all sessions on disable

Global Homepage Announcements follows Accounts I. Password Change is optional only after both are green. One-Time External Sharing is later Layer 2 work.

### Layer 3 — Shared Academic Library

Future separate authorization: Library-owned resources, membership/permissions, Trusted Contributor, contribution review, academic catalog, canonical records.

### Layer 4 — Research Infrastructure

Future: provenance, document/version relationships, citations/page refs, research questions, export, research asset graph.

### Layer 5 — Intelligence

Future: OCR, indexing/search, embeddings/retrieval, RAG, source-grounded research assistance.

## Operations Track

Operations is cross-cutting. The repository already contains deployment, backup/restore, Nginx, systemd, log rotation, health/readiness, migration verification, and runbooks.

Conditional OPS01A may prepare lightweight status/health, backup freshness, disk/RAM/swap, certificate-expiry, restore-drill, retention dry-run, and timer-template tooling. It does not authorize production activation or mutation.

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
│   ├── ready/
│   ├── doing/
│   └── done/
├── workers/
├── plugins/
├── tests/
└── deployment/
```

## Core Principles

- modularity
- fault isolation
- data safety before feature count
- server-authoritative identity/authorization
- storage portability
- explicit lifecycle state
- independently reviewable Epic checkpoints
- no silent architecture/product changes
- repository-driven autonomous progression
- production as a separate explicit gate
- AI/compute features isolated from authoritative original files

## Current Infrastructure

Alibaba Cloud Simple Application Server:
- 2 vCPU
- 1 GiB-class RAM (`916,044 KiB` Linux `MemTotal` in accepted measurements)
- 1 GiB swap
- 20 GB disk
- Ubuntu 24.04
- Malaysia region

File bytes live in private Alibaba OSS behind `StorageAdapter`; the server is primarily the API/auth/metadata/control plane. This architecture is expected to remain suitable for Accounts and shared-library metadata at the current low-concurrency scale. OCR/embedding/RAG compute should be isolated later.

## Development Rule

Normal development follows:

```text
recover repository state
→ select approved Ready/Doing task
→ implement
→ test
→ adversarial review
→ reconcile docs/task state
→ Git checkpoint
→ next approved task if continuous objective allows
```

Completion is acceptance-driven, not clock-driven. Long Agent runs must not invent work merely to consume time.

## Local Development

Prerequisites: Node.js `24.16.0` (recorded in `.nvmrc`) and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Frontend: `http://127.0.0.1:5173`  
Backend: `http://127.0.0.1:3000`

Initialize/upgrade local SQLite:

```powershell
npm.cmd run db:migrate
```

Repository checks:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:acceptance-tools
npm.cmd run acceptance:compiled
```

Use the actual scripts in `package.json` if they change.

## Security / Data Flow Summary

Authentication uses Argon2id with the accepted 64 MiB / three-iteration / one-lane profile and bounded KDF work. Sessions are opaque, revocable, SQLite-backed, and digest-only at rest.

Large file bytes use browser-direct object-storage paths. The backend authorizes/signs and maintains logical metadata; it must not become a large-byte proxy merely to add product features.

Production configuration, credentials, migrations, DNS/TLS/OSS, destructive real-data operations, deployment, and main merge remain separately gated.

## License

No public licensing or distribution decision has been made.
