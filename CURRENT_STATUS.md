# AcademicCloud Current Status

**Last updated:** 2026-08-17

## Current Phase

**Layer 1 Core Drive and Layer 2 Accounts I are green in repository development; the approved global homepage announcements MVP is next.**

The accepted production site remains live on the previously accepted UX01 release. Current repository work is newer than production and remains local/repository-only unless a separate Owner production gate is opened.

## Source-of-Truth Development Baseline

Current repository-development line:

- branch: `codex/project-memory-reconcile-20260817`
- recovery baseline before L1-FOLDER01: `4d706bb9ce821a6f70af24dbd097209e0aa62cd3`
- accepted ancestor: `d9bdfebfab0cfb4fc0b5067ec1ba1ce91fe31c21`
- latest repository migration: `007_accounts_and_invitations.sql`
- dependency delta from the accepted UX03 baseline: zero

This work remains on a separate `codex/` branch; no main merge or production rollout is authorized.

## Production State

Production remains the accepted UX01 generation, not the current UX03 development branch.

Verified/recorded production facts:
- public site: `https://cloud.ajtlab.top`
- backend remains loopback-only behind Nginx
- private Alibaba OSS remains the file-byte store
- `files.ajtlab.top` is the browser-facing OSS custom domain from the UX01 production window
- production UX01 browser Product Verification passed
- no UX02, FAV01, UX03, FOLDER01, Accounts I, announcements, or OPS01A code has been deployed
- systemd autostart/permanent-delete/certificate-lifecycle hardening remain separately Owner-gated according to the production runbooks

Do not infer production rollout from repository completion.

## Completed Core Foundation

Layer 0 and Layer 1 foundation Epics L1-E01 through L1-E08 are complete:
- Node.js/TypeScript/Fastify backend
- React/TypeScript/Vite frontend
- SQLite persistence and checksummed migrations
- Argon2id + opaque SQLite sessions
- exact-origin unsafe-request protection
- private object-storage abstraction and Alibaba OSS adapter
- direct browser upload and signed/direct download
- folder/file lifecycle, move/rename, recycle/restore, permanent file deletion safeguards
- preview authorization
- security/reliability hardening
- deployment artifact/runbooks, backup/restore tooling, Nginx/systemd templates

## UX / Favorites / Hardening Progress

### UX01

**Production accepted.** Bilingual UI, upload UX, browser-correct Preview, and `files.ajtlab.top` production path were accepted in the UX01 production window.

### UX02

Academic workspace visual refresh and drag/drop implementation is complete in repository history. It introduced the current scholarly/editorial visual language, catalogue rows, command bar, row menus, drop upload, queue behavior, and bilingual UX foundation. It was not independently deployed as a separate production release.

### L1-BUGAUDIT01

Implementation and independent ChatGPT review **PASS**.

Accepted hardening includes:
- CSP-safe RowMenu positioning with no runtime inline styles
- NFC/size/MD5 upload-recovery identity
- production startup fail-closed on missing/not-current schema
- backend-authoritative inline-preview size limits
- correct RowMenu→modal focus restoration
- app-wide external file-drop protection

No new evidence currently requires reopening BUGAUDIT01.

### L1-FAV01

Implementation and independent ChatGPT review **PASS** for continued repository development.

Accepted behavior includes:
- migration 005 per-user Favorite relations
- account-scoped Favorites API
- Library/Favorites state-machine separation
- explicit `favoritesError`
- Favorites refetch/retry behavior
- abort/stale-request safety
- Favorites account isolation

A separate Owner visual/product gate remains pending before any future deployment of this generation.

### L1-FOLDER01

**Repository-development complete; independent adversarial review PASS.** Migration 006 adds same-owner recycle-operation groups without editing migrations 001–005. Recursive folder recycle now collects only the active subtree, rejects any direct/deep pending upload before mutation, and transitions the complete group in one `BEGIN IMMEDIATE` transaction. Restore revalidates exact group membership/counts and the original parent, restores the group topologically, and rolls the transaction back on stale state, sibling conflict, CAS failure, or injected failure.

The critical invariant is verified: independently pre-deleted files/folders and their Favorites remain in their own groups and never revive with a later parent restore. Recycle lists operation roots only; recursive recycle/restore never deletes storage bytes or changes IDs, hierarchy, display metadata, or object keys. Standalone file permanent-delete retry semantics remain intact, while grouped descendants cannot be recursively purged.

Verification on 2026-08-17:
- backend `135/135` PASS;
- frontend `121/121` PASS;
- workspace typecheck and production build PASS;
- acceptance tools `25/25` PASS;
- compiled acceptance PASS with migration count 6, restart/session, maintenance dry-run, backup, and isolated restore;
- migration fresh/prior/replay/checksum/integrity and production-startup fail-closed tests PASS;
- `git diff --check` PASS, targeted secret scan clear, dependency delta 0;
- independent read-only Reviewer: PASS, no blocker or medium finding.

### L2-ACCOUNTS01

**Repository-development complete; independent adversarial review PASS.** Migration 007 adds database-enforced `owner | member` roles, fail-closed legacy-owner selection, durable authentication revisions, and digest-only single-use invitations without editing migrations 001–006. First-account provisioning now creates the sole initial Owner only when the database has zero accounts; all later accounts enter as Members through race-safe invitation redemption.

Owner authorization is re-read server-side. Owner invitation management and safe account listing expose no password hash, session secret, raw invitation digest, or repeatable raw invitation token. Member disable/enable is restricted to Owner administration; disable and revoke-all-sessions are atomic, and login publishes a session only after a post-Argon transaction re-read confirms unchanged active state, password hash, and authentication revision. A deterministic disable→enable race test proves an authentication attempt begun before disable cannot revive after re-enable.

The restrained frontend adds fragment-based invite registration and Owner account administration under the existing account menu. Invitation capabilities are removed from the URL immediately and remain memory-only; the four-item mobile navigation is unchanged. True Member identities remain isolated across folders, files, pending uploads, recycle operations, Preview, Download, Move/Rename/Restore, and Favorites. ADR-011 records the durable security and concurrency model.

Verification on 2026-08-17:
- backend `156/156` PASS;
- frontend `125/125` PASS;
- workspace typecheck and production build PASS;
- acceptance tools `25/25` PASS;
- compiled acceptance PASS with migration count 7, restart/session, maintenance dry-run, backup, isolated restore, restored session, and zero redeploy migrations;
- migration empty/singleton/ambiguous-legacy, replay/checksum/integrity, backup, and production-startup fail-closed tests PASS;
- `git diff --check` PASS, 57 changed-file credential-pattern scan clear, dependency delta 0;
- independent read-only Reviewer: PASS after repairing and re-testing the disable/login/re-enable race, with no remaining blocker or medium finding.

### L1-UX03

Implementation exists at `dd42cab…`; zero-descriptive-copy and the dedicated responsive mobile architecture were verified in the independent GitHub review. The three required repair findings are now repaired and independently re-reviewed **PASS** (APPROVE-WITH-NITS, non-blocking NITs only):

1. mobile bottom-nav DOM/semantic order now exactly `Library / Favorites / Pending / Recycle` (exact-sequence test added);
2. Preview now exposes Close / Open / Download, with Download reusing the authoritative `createDownload(file.id)` attachment path while Open keeps the inline signed URL;
3. mobile 44px touch floor added for Sign In, AccountMenu Sign Out, 中文, and EN (selector-scoped to the mobile media block).

Verified non-regressions (both reviews):
- FAV01 behavior preserved
- global drop guard preserved
- RowMenu scroll/resize focus repair is real
- fullscreen mobile Preview structure exists
- zero-descriptive-copy cleanup is real, not CSS hiding
- migration-count 4→5 acceptance fix is valid
- no CSP regression found

Formal state:

```text
INDEPENDENT_L1_UX03_REVIEW_PASS=true
UX03_REQUIRED_REPAIRS=0
OWNER_VISUAL_GATE=PENDING
```

A separate Owner visual/product gate remains pending before any future deployment of this generation.

## Approved Continuous Objective

The Owner has approved a return to repository-driven autonomous development.

After this planning reconciliation, the executable sequence is:

1. ~~finish the current L1-UX03 review repairs and re-run its gates~~ — **DONE** (repairs committed `a15b2e3`; adversarial re-review APPROVE-WITH-NITS);
2. ~~L1-PERF01 — evidence-first transfer/checksum performance baseline and only justified low-risk optimization~~ — **DONE** (measured; no optimization justified; evidence note committed);
3. ~~L1-FOLDER01 — transactional recursive folder recycle/restore~~ — **DONE** (migration 006, full gates, independent review PASS);
4. ~~L2-ACCOUNTS01 — Owner/Member foundation, invite-only registration, invite management, minimal Owner user administration, Member disable/enable, session revocation~~ — **DONE** (migration 007, full gates, independent security/race review PASS);
5. L2-ANNOUNCE01 — Owner-administered, database/API-backed global homepage announcements for authenticated users;
6. L2-PASSWORD01 — conditional/optional after Accounts I and announcements are fully green;
7. OPS01A — conditional repository/local operations preparation only;
8. stop.

Each Epic must be independently reviewable and checkpointed before autonomous progression.

## Key Future Product Boundaries

After the current objective, later work may include:
- Layer 2 One-Time External Sharing
- Layer 3 Shared Academic Library: Library-owned resources, membership/permissions, Trusted Contributor, contribution review, academic catalog
- Layer 4 Research Infrastructure: provenance, lineage, citations/page refs, research questions, export, asset graph
- Layer 5 Intelligence: OCR, indexing/search, embeddings/retrieval, RAG

None of these later boundaries is authorized by the current continuous objective unless already represented by an approved Ready task.

## Operations / Infrastructure Reality

Current production host class remains suitable for the present control-plane architecture:
- 2 vCPU
- Linux `916,044 KiB` `MemTotal`
- 1 GiB swap
- 20 GB system disk
- object bytes in OSS rather than local disk
- current service cgroup policy 320/384 MiB with 128 MiB whole-host headroom gate

Accounts, invitations, shared-library metadata, and catalog metadata are expected to remain lightweight relative to file bytes. OCR/embedding/RAG compute should be isolated when introduced.

OPS01A may prepare health/backup/certificate/disk/memory/restore-drill tooling, but must not activate or mutate production.

## Safety Boundaries

Current continuous objective does **not** authorize:
- production SSH
- production DB migration
- production account/invite creation
- production OSS/DNS/TLS/Nginx/systemd changes
- destructive production tests
- backup pruning on real production data
- production restore
- certificate replacement
- main merge
- deployment
- One-Time External Sharing
- Shared Library
- OCR/RAG

## Next Action

Record the green `L2-ACCOUNTS01` checkpoint, then activate `L2-ANNOUNCE01` from its approved Ready card. Keep announcements repository/local only and reuse the accepted Owner authorization boundary without adding a third global role.
