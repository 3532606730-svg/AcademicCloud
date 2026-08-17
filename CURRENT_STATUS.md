# AcademicCloud Current Status

**Last updated:** 2026-08-17

## Current Phase

**The repository-local objective through Core Drive closure, Accounts I, Global Homepage Announcements, Authenticated Password Change, OPS01A, RF-PLAN01, RF-AUDIT01, and RF-OWNERSHIP01 is complete and independently green. The Owner-authorized Pre-OCR Research Foundation continues with `RF-BULK01` as the next Ready task.**

The accepted production site remains live on the previously accepted UX01 release. Current repository work is newer than production and remains repository-only unless a separate Owner production gate is opened.

## Source-of-Truth Development Baseline

Current development line:
- branch: `codex/project-memory-reconcile-20260817`;
- recovery baseline before FOLDER01: `4d706bb9ce821a6f70af24dbd097209e0aa62cd3`;
- FOLDER01 checkpoint: `5c3bae9…`;
- Accounts I checkpoint: `817ace5…`;
- Announcements checkpoint: `9b64ed7c945f687eef2b80ea3c509c1849e70807`;
- Password Change checkpoint: `6ef6fb612d2bdac808e3682eb5bcae6bdb3a0de3`;
- OPS01A code-bearing independent-review checkpoint: `34a2eada158dcf08783dc9538d853f9361425e8a`;
- RF-AUDIT01 checkpoint: `cb25ce01a5e25c89ae4de3db1110433b71bb45fa`;
- latest repository migration: `010_resource_ownership_domains.sql`;
- dependency delta for OPS01A: zero;
- migration delta for OPS01A: zero.

No main merge or production rollout is authorized by repository completion.

## Production State

Production remains the accepted UX01 generation.

Recorded production boundary:
- public site: `https://cloud.ajtlab.top`;
- backend loopback-only behind Nginx;
- file bytes in private Alibaba OSS behind the storage abstraction;
- `files.ajtlab.top` remains the browser-facing OSS custom domain from the accepted production window;
- post-UX01 repository features listed below have not been deployed merely because they are complete in development;
- systemd/autostart, backup scheduling/off-host delivery, certificate lifecycle, destructive recovery, deployment, and other live mutations remain separately Owner-gated.

## Completed Repository-Development Checkpoints

### Core Drive closure

- UX02 academic workspace foundation;
- BUGAUDIT01 independent review PASS;
- FAV01 independent review PASS;
- UX03 required mobile/Preview/touch-target repairs independently re-reviewed PASS;
- PERF01 evidence closure: browser-direct transfer architecture verified; measured checksum stage did not justify product optimization;
- FOLDER01 migration 006 transactional recursive recycle/restore independently reviewed PASS. The central invariant is preserved: independently pre-deleted descendants never join or revive with a later parent recycle group.

### L2-ACCOUNTS01

**Complete; independent adversarial review PASS.** Migration 007 established exact global `owner | member` roles, first-Owner bootstrap, digest-only single-use invitations, race-safe Member registration, Owner administration, atomic disable/session revocation, and strict cross-account drive/Favorites isolation. The disable/login/re-enable session-publication race found during review was repaired and deterministically tested.

Final recorded suite at completion: backend `156/156`, frontend `125/125`, canonical build/typecheck/acceptance green, dependency delta 0.

### L2-ANNOUNCE01

**Complete; independent adversarial review PASS.** Migration 008 added Owner-administered database/API-backed global homepage announcements with plain text, `info | warning | critical`, safe HTTPS links, server-owned creator/timestamps, exact publication/expiry boundaries, deterministic ordering, and responsive homepage integration. No new global role or notification worker was introduced.

Final recorded suite at completion: backend `165/165`, frontend `131/131`, canonical build/typecheck/acceptance green, dependency delta 0.

### L2-PASSWORD01

**Complete; independent adversarial review PASS.** Authenticated Owner/Member self-password change reuses the bounded Argon2id executor. Expected old hash plus durable authentication revision forms the CAS boundary; password mutation and revoke-all sessions commit atomically, preventing concurrent overwrite, disable/enable ABA revival, and stale login publication. No migration/dependency was added.

Final recorded suite at completion: backend `178/178`, frontend `136/136`, canonical build/typecheck/acceptance green.

### OPS01A — Operations Observability & Recovery Preparation

**Complete in repository development; final independent acceptance PASS / APPROVE-WITH-NIT.**

Delivered repository/local preparation:
- default zero-network readiness auditor with explicit plan/public/live read-only modes;
- fixed/validated SSH/read-only check surface, bounded execution, UNKNOWN rather than false-green evidence, and report secret filtering;
- verified SQLite backup generation receipt and bounded freshness semantics;
- backup verification against a task-owned 0600 copy so verification cannot leave WAL/SHM companions beside the selected backup;
- deterministic 7-daily / 4-weekly / 6-monthly retention dry-run with conservative `hold` state and no apply/delete path;
- isolated restore drill using verified task-owned temporary state, `InMemoryStorageAdapter`, Fastify injection, maintenance dry-run, source/copy identity re-verification, and exact cleanup ownership;
- bounded restart-storm systemd template and inactive journald-retention template;
- production artifact inclusion plus compiled/runtime validation.

Final evidence:
- Codex local: backend `189/189` PASS; frontend `136/136` PASS; readiness auditor `48/48` PASS; acceptance tools `25/25` PASS; workspace typecheck PASS; `git diff --check` PASS; independent read-only Reviewer PASS with no blocker/medium finding.
- ChatGPT independently reviewed the exact `6ef6fb6…34a2eada` change scope and found no blocker/medium issue. One non-blocking wording nit remains: the auditor help text says it “never writes anything” although explicit `--output` may create a no-clobber local report under `output/operations`; this does not mutate an inspected/production system and does not block closure.
- Draft validation PR #3 triggered the existing Linux production-build workflow against exact head `34a2eada…`. Workflow run `31997033717` passed full tests, typechecks, production build, compiled acceptance, dependency audits, Argon2 benchmark, deterministic artifact packaging, extracted runtime verification, and a second fresh-runner independent artifact download/runtime verification.
- No OPS01A migration/dependency was added and no production host/data/OSS/DNS/TLS/Nginx/systemd service was contacted or mutated for task acceptance.

Task record: `tasks/done/OPS01A.md`.

## New Durable Product Boundary — Pre-OCR Research Foundation

The Owner has approved a new repository/local program before OCR. ADR-014 now defines the privacy/data model:

- Physical Artifact;
- Scholarly Resource / Scholarly Record;
- Personal Research Overlay;
- Collaborative Overlay;
- Governance / Operations;
- Derived Intelligence.

Critical rules:
- shared resource does not imply shared research activity;
- Owner/Admin has no implicit product read authority over another user's private research state;
- administrative audit is not research surveillance;
- Folder and Collection are distinct;
- original acquired artifacts remain preservable evidence while derived artifacts have explicit lineage;
- duplicate detection must not reveal inaccessible resources;
- future AI authority must never exceed the requesting user's effective authority.

`ROADMAP.md` records the complete approved Pre-OCR inventory. The independently reviewed `docs/architecture/pre-ocr-execution-plan.md` maps that inventory exactly once across a dependency-safe 25-card queue: governance audit; ownership domains; bounded Core UX; Scholarly Record/metadata/provenance/lineage; private overlays/organization/search/views; intake; annotation/citation/evidence/export; four Library checkpoints; separate integrity/recovery/authorization-matrix checkpoints; and a terminal production-disabled derived-contract card.

### RF-PLAN01 — Execution Decomposition

**Complete; independent planning review PASS.** All 25 Ready cards use the exact 13-section task contract. The queue explicitly preserves server authority, append-only migration rules, cross-account non-disclosure, no research surveillance, distinct Folder/Collection and Personal/Library state, original/derived lineage, contributor-independent Library ownership, recoverable transactions, compiled/recovery gates, and the terminal STOP before OCR.

Planning verification: documentation/task-state only; 0 product-code/migration/dependency/runtime-configuration delta; 0 high-confidence secret-like hits; whitespace/structural/reference checks PASS.

### RF-AUDIT01 — Governance Security Audit Foundation

**Complete; independent adversarial review PASS.** Migration 009 adds immutable fixed-column governance events plus append-only event/target/reason registries. Successful security/governance mutations are transaction-coupled; denied/busy/failed attempts are target-free; permanent purge records request before provider deletion and completion only with the final metadata transaction. Retention is capped at the newest 20,000 rows with Owner-only ID-keyset pagination and no search/export/target lookup.

The Owner UI is an account-menu dialog rather than a fifth primary destination. It exposes fixed localized labels and bounded loading/empty/error/load-older states without resolving filenames or private research content. No Personal Research Overlay, search, reading/page, annotation, citation, evidence, question, or AI activity is audited.

Final local evidence: backend `196/196` PASS; frontend `142/142` PASS; workspace typecheck/build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with migration count 9, backup/isolated restore, and zero redeploy migrations; dependency audits 0 vulnerabilities; `git diff --check` PASS; independent read-only Reviewer PASS with no remaining blocker/medium finding.

### RF-OWNERSHIP01 — Explicit Resource Ownership Domains

**Complete; independent adversarial review PASS.** ADR-016 and migration 010 introduce one concrete `account | library` ownership-domain authority parent, backfill exactly one immutable account domain per account, and rebuild folder/file/recycle ownership around domain IDs. Folder creator, file uploader, and recycle initiator remain separate account provenance; a contributor's disabled state cannot invalidate a differently owned resource. Current account-private repositories resolve the account domain server-side, while HTTP rejects authority injection and returns no domain/provenance fields.

The migration preserves exact IDs, object keys, hierarchy, lifecycle state, revisions, timestamps, recycle groups, Favorites, pending/active/deleted/purging/purged rows, cycle constraints, and independently recycled descendants without any object-provider byte operation. Deterministic 0/1/>1-account fixtures verify exact identity, composite foreign keys, transaction rollback, disabled-contributor behavior, integrity, restart, backup/isolated restore, and zero redeploy migrations.

Final local evidence: backend `201/201` PASS; frontend `142/142` PASS; workspace typecheck/build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with migration count 10, backup/operations/isolated restore, and zero redeploy migrations; dependency audits 0 vulnerabilities; `git diff --check` PASS; independent read-only Reviewer PASS with no blocker/medium finding.

## Approved Continuous Objective

The previous objective through OPS01A is complete.

The new objective begins with:

1. `RF-PLAN01`, `RF-AUDIT01`, and `RF-OWNERSHIP01` — complete and independently reviewed;
2. autonomously execute the remaining Pre-OCR queue one independently green Epic at a time, beginning with `RF-BULK01`;
3. after terminal `RF-DERIVED01`, STOP before OCR/text-extraction execution, full-text indexing, embeddings, retrieval, or RAG.

## Safety Boundaries

The current program still does **not** authorize:
- production SSH or production mutation;
- production DB migration;
- production OSS/DNS/TLS/Nginx/systemd changes;
- destructive production tests, backup pruning, or production restore;
- certificate replacement;
- main merge or deployment;
- real credentials or paid infrastructure changes;
- OCR/text-extraction execution;
- embeddings, retrieval, or RAG;
- an unrecorded product boundary outside the approved Roadmap/Task Board.

## Next Action

Create/recover from the RF-OWNERSHIP01 checkpoint, select `tasks/ready/RF-BULK01.md`, and implement bounded account-authorized bulk operations over the existing Drive/Favorites lifecycle without pulling forward Scholarly Record or Library behavior.
