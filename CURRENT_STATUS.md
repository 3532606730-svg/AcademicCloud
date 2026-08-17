# AcademicCloud Current Status

**Last updated:** 2026-08-18

## Current Phase

**The repository-local line through `RF-DOMAIN01` and `RF-LIBRARY01` is complete and green, PROD-04A has deployed/accepted the earlier exact OPS01A checkpoint `34a2eada…` at production schema v8, and all three first-use polish cards are complete with focused verification green. The approved repository-development objective continues at `RF-LIBRARY02`.**

Production remains live on exact commit `34a2eada158dcf08783dc9538d853f9361425e8a` / schema v8. Repository development is newer and remains repository-only until a separate Owner deployment gate selects an exact candidate.

## Source-of-Truth Development Baseline

Current development lineage before this planning reconciliation:
- branch: `codex/project-memory-reconcile-20260817`;
- OPS01A / accepted production code checkpoint: `34a2eada158dcf08783dc9538d853f9361425e8a`;
- RF-AUDIT01 checkpoint: `cb25ce01a5e25c89ae4de3db1110433b71bb45fa`;
- RF-OWNERSHIP01 checkpoint: `636a19e6f55aba8d84855e266954a08b3b415065`;
- RF-BULK01 checkpoint: `fc30aed2eeb4536ec3747869bb5b99b22fbf94e8`;
- RF-DOMAIN01 checkpoint: `ddcc19eb41428bbdbececd8868a11a09dae97e98`;
- latest repository migration: `014_shared_libraries.sql`.

Current execution branch:
- `codex/project-memory-reconcile-20260817`;
- accelerated-queue planning checkpoint before implementation: `e915825fd546a122ff8606e699a9fd678c020001`;
- contains repository development only; no production mutation.

Historical migrations 001–014 must not be modified or renumbered. New persistent work must use append-only versions after the actual development schema head.

## Production State

Production is the accepted routine multi-user release `34a2eada158dcf08783dc9538d853f9361425e8a`, deployed from successful GitHub Actions run `31997033717` using its verified Linux x64 / Node 24 artifact.

Production database state:
- schema v8 with exact append-only history 1–8;
- only migrations 005–008 were added by PROD-04A;
- repository migrations 009–013 remain undeployed.

Accepted production behavior includes Owner/Member invitations and login, cross-account Drive isolation, password/session revocation, disable/re-enable, announcements, Favorites, recycle/restore, upload/download/Preview, and final integrity/resource checks.

Recorded operational boundary remains:
- public site `https://cloud.ajtlab.top`;
- backend loopback-only behind Nginx;
- file bytes in private Alibaba OSS;
- old release `15181f90d6eecbb0ddb977a0168536a445802ec7` and pre-migration v4 backup SHA-256 `7635f6cb…` remain the rollback pair;
- never run the old release against schema v8 or invent reverse SQL;
- no permanent-delete production test has been consumed by PROD-04A;
- later deployment, production migration, OSS mutation, autostart/reboot changes, backup pruning, certificate work, and destructive recovery remain separately Owner-gated.

## Completed Repository Checkpoints Relevant to New Work

- `L2-ACCOUNTS01`: Owner/Member accounts, digest-only invitations, race-safe registration, disable/session revocation, strict cross-account isolation.
- `L2-ANNOUNCE01`: Owner-administered global announcements.
- `L2-PASSWORD01`: self password change with bounded Argon2id/CAS/revoke-all semantics.
- `RF-AUDIT01`: governance/security audit without research surveillance.
- `RF-OWNERSHIP01`: explicit `account | library` ownership-domain substrate and durable contributor/uploader provenance separation.
- `RF-BULK01`: bounded account-private bulk Drive/Favorites actions.
- `RF-DOMAIN01`: stable Scholarly Record / Artifact / Artifact Version identity with account-private server authority and stable file linkage.
- `RF-LIBRARY01`: explicit Library domains, durable manager/member membership, last-manager/disabled-account guards, non-disclosing Library holdings, and scoped preview/download.

These completed foundations are why the minimum Library slice can be accelerated safely without first consuming `RF-META01` through `RF-EXPORT01`.

## New Owner-Approved Priority — First-Use Polish + Sharing

Real first-use feedback reprioritizes the executable repository queue to:

```text
L1-UX04
L2-ACCOUNTARCHIVE01
L2-ADMINPOLISH01
        ↓
RF-LIBRARY01
        ↓
RF-LIBRARY02
        ↓
STOP
```

Current progress: `L1-UX04`, `L2-ACCOUNTARCHIVE01`, `L2-ADMINPOLISH01`, and `RF-LIBRARY01` are complete. Next is `RF-LIBRARY02`, followed by STOP.

### L1-UX04
- clear localized feedback when a same-folder active/pending file name already exists;
- preserve the existing database uniqueness rule and allow same names in different folders;
- do not auto-create `(1)`/`(2)` copies;
- keep desktop sidebar navigation visible while long file lists scroll;
- preserve sticky top bar and current mobile behavior.

### L2-ACCOUNTARCHIVE01
- add non-destructive Member `archived` lifecycle after `disabled`;
- archived accounts cannot authenticate and remain session-invalid;
- preserve account ID/login name/files/resources/provenance/invitations/audit/private data;
- hide archived accounts by default with explicit Owner reveal;
- unarchive returns to disabled;
- no hard deletion or username reuse.

**Complete.** Migration 012 and ADR-019 add a non-destructive logical `active | disabled | archived` Member lifecycle without rebuilding `accounts`. Archive requires disabled, unarchive returns to disabled, every non-active transition revokes sessions, archived accounts remain login-invalid/default-hidden, and all identity/data/history relationships stay intact. Focused backend/persistence/frontend verification and workspace typecheck/build are green.

### L2-ADMINPOLISH01
- Owner-only announcement deletion with explicit confirmation and immediate feed/list removal;
- keep invitation history durable but collapse consumed/revoked/expired invitations under `历史邀请 / Invitation history`;
- usable invitations remain prominent and alone expose Revoke;
- invitation token/security semantics remain unchanged.

**Complete.** Owner-only, target-confirmed announcement deletion now removes effective/admin rows and commits immutable `announcements.delete` audit in the same transaction. Available invitations remain prominent; consumed/revoked/expired records remain stored under a counted collapsed history section with no deletion/token-semantic change. Focused backend/migration/frontend verification and workspace typecheck/build are green.

### RF-LIBRARY01 — Accelerated Minimum Shared Library
- real Library entity and ownership domain, never a shared-folder convention;
- minimal manager/member Library-scoped authority and membership;
- Shared Library navigation plus authorized holdings list/preview/download;
- disabled accounts lose effective Library access;
- global Owner does not receive arbitrary Member-private content access;
- Personal Research Overlay remains private.

**Complete.** ADR-020 and migration 014 add a real Library entity on `library:<id>` ownership domains, transactional manager/member membership, active-account and last-effective-manager guards, credential/content-free Library audit events, and no-backfill semantics. Scoped service/HTTP/UI surfaces provide non-disclosing Library list/member/holding reads and reuse the storage adapter's existing preview/download policy. Library service `3/3`, migration `2/2`, HTTP `1/1`, frontend `159/159`, workspace typecheck/build, and `git diff --check` are green. No production access or mutation occurred.

### RF-LIBRARY02 — Accelerated Contribution Review
- Member explicitly submits an eligible private resource;
- authorized reviewer sees/opens only explicitly submitted resources;
- state: `submitted → approved | rejected | withdrawn`;
- approval atomically promotes the resource into Library ownership while preserving stable IDs/object bytes/object key/contributor provenance;
- rejection/withdrawal leave Member ownership and bytes unchanged;
- approved holdings become immediately listable/previewable/downloadable by authorized Library members;
- unrelated Member Drive and private research state remain invisible;
- Trusted Contributor expansion is deferred from this accelerated minimum slice unless required for base correctness.

## Parked Work

During this objective, do **not** consume:
- `RF-META01` through `RF-EXPORT01`;
- `RF-LIBRARY03` / `RF-LIBRARY04`;
- later integrity/recovery/auth-matrix/derived cards;
- `PROD-03C2`;
- OCR/text extraction/full-text indexing/embeddings/retrieval/RAG.

The original Pre-OCR plan remains durable; only execution priority has changed for the bounded first-use sharing slice.

## Verification Policy for This Objective

The Owner explicitly prefers delivery speed over repeated low-value checking.

Default policy:
- small polish cards: focused changed-component tests only, plus one typecheck/build pass as applicable;
- Library/review: focused backend/persistence/frontend authorization, ownership, privacy, migration-persistence, disabled-account, and one important concurrency case;
- one focused independent review after the complete Library + contribution-review boundary is green;
- repair concrete material findings and rerun only affected verification;
- once relevant evidence is green, record/commit instead of continuing to search for hypothetical issues.

Do not repeatedly run broad historical acceptance suites, production artifact builds, backup/restore drills, benchmarks, or unrelated dependency/security audits unless a real failure or material risk justifies them.

## Safety Boundaries

This repository objective does **not** authorize:
- production SSH or mutation;
- production DB migration/deployment;
- production OSS/DNS/TLS/Nginx/systemd changes;
- permanent-delete production acceptance;
- destructive real-data testing;
- main merge;
- real credentials or paid infrastructure changes;
- OCR/text extraction, embeddings, retrieval, or RAG;
- global Owner browse-all access to Member-private Drive/research state;
- fake shared-folder shortcuts that bypass Library ownership/authorization boundaries.

## Next Action

Create/push the green `RF-LIBRARY01` checkpoint, then execute `RF-LIBRARY02` with focused contribution/ownership/privacy verification. Continue only through that checkpoint and STOP before any production rollout.
