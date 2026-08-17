# AcademicCloud Task Board

**Last reconciled:** 2026-08-17

## Current Phase

**The repository-local objective through OPS01A, RF-PLAN01, RF-AUDIT01, RF-OWNERSHIP01, RF-BULK01, and RF-DOMAIN01 is complete and independently green. PROD-04A deployed and accepted exact checkpoint `34a2eada…`. Feature development remains stopped and no task is active.**

Production is live on exact commit `34a2eada158dcf08783dc9538d853f9361425e8a` at schema v8. Repository HEAD remains newer and does not automatically select another production target.

## Approved Continuous Objective

The previous sequence is complete:

1. `L1-UX03` review repairs — complete;
2. `L1-PERF01` — complete;
3. `L1-FOLDER01` — complete;
4. `L2-ACCOUNTS01` — complete;
5. `L2-ANNOUNCE01` — complete;
6. `L2-PASSWORD01` — complete;
7. `OPS01A` — complete.

The Owner interrupted the repository/local continuous objective after RF-DOMAIN01. `RF-PLAN01`, `RF-AUDIT01`, `RF-OWNERSHIP01`, `RF-BULK01`, and `RF-DOMAIN01` are complete. RF-META01 and every later Pre-OCR card remain Ready/backlog and may not be selected until new Owner direction.

External predeployment review selected the earlier exact green OPS01A checkpoint `34a2eada…`; the bounded PROD-04A window deployed and accepted that exact target. Repository HEAD remains deliberately newer than production HEAD.

Every product Epic remains independently reviewable/checkpointed. Large workstreams must be split in planning rather than implemented as giant diffs.

The completed PROD-04A window does not authorize any further production access/mutation, deployment, migration, main merge, real credentials, paid infrastructure, destructive real-data operations, OCR execution, embeddings, retrieval, RAG, or an unrecorded product boundary.

## Doing

None.

## Ready / Backlog — Parked Pre-OCR Queue

The following independently reviewed queue remains durably specified in `docs/architecture/pre-ocr-execution-plan.md`, but it is parked by the Owner's explicit stop after RF-DOMAIN01. Do not move any card to Doing or consume the queue without new Owner direction. If resumed later, preserve the listed dependency order.

| Order | Task | Task card | Bounded result |
|---:|---|---|---|
| 5 | `RF-META01` | `tasks/ready/RF-META01.md` | bounded canonical metadata/templates/minimal authorities |
| 6 | `RF-PROV01` | `tasks/ready/RF-PROV01.md` | canonical provenance, fingerprint, leak-safe duplicate contract |
| 7 | `RF-LINEAGE01` | `tasks/ready/RF-LINEAGE01.md` | artifact/version/derived relationship lineage |
| 8 | `RF-STATS01` | `tasks/ready/RF-STATS01.md` | storage statistics and quota-policy foundation |
| 9 | `RF-OVERLAY01` | `tasks/ready/RF-OVERLAY01.md` | private reading state/progress/flags/Recent/note |
| 10 | `RF-ORGANIZE01` | `tasks/ready/RF-ORGANIZE01.md` | Personal Tags, Collections, Favorites integration |
| 11 | `RF-SEARCH01` | `tasks/ready/RF-SEARCH01.md` | authority-scoped metadata/name search, no OCR full text |
| 12 | `RF-VIEWS01` | `tasks/ready/RF-VIEWS01.md` | private Saved Research Views |
| 13 | `RF-INTAKE01` | `tasks/ready/RF-INTAKE01.md` | Research Inbox, safe triage, deterministic suggestion/intake API |
| 14 | `RF-ANNOTATE01` | `tasks/ready/RF-ANNOTATE01.md` | stable Page anchors and private sidecar annotations |
| 15 | `RF-CITE01` | `tasks/ready/RF-CITE01.md` | private Citation Workspace and page Evidence |
| 16 | `RF-EVIDENCE01` | `tasks/ready/RF-EVIDENCE01.md` | Evidence Bundles, Research Questions, explicit links |
| 17 | `RF-EXPORT01` | `tasks/ready/RF-EXPORT01.md` | structured authorized scholarly export contracts |
| 18 | `RF-LIBRARY01` | `tasks/ready/RF-LIBRARY01.md` | Library domains, membership, permissions |
| 19 | `RF-LIBRARY02` | `tasks/ready/RF-LIBRARY02.md` | Trusted Contributor and atomic contribution review/promotion |
| 20 | `RF-LIBRARY03` | `tasks/ready/RF-LIBRARY03.md` | shared catalog, Library Tags, canonical/original naming |
| 21 | `RF-LIBRARY04` | `tasks/ready/RF-LIBRARY04.md` | shared provenance confidence and duplicate/version grouping |
| 22 | `RF-INTEGRITY01` | `tasks/ready/RF-INTEGRITY01.md` | read-only integrity monitor |
| 23 | `RF-RECOVERY01` | `tasks/ready/RF-RECOVERY01.md` | no-clobber metadata snapshot and isolated recovery rehearsal |
| 24 | `RF-AUTHMATRIX01` | `tasks/ready/RF-AUTHMATRIX01.md` | complete cross-plane authorization/non-disclosure matrix |
| 25 | `RF-DERIVED01` | `tasks/ready/RF-DERIVED01.md` | production-disabled OCR/text/index authorization contracts only |

`RF-DERIVED01` is terminal. After it is independently green and checkpointed, STOP before OCR/text extraction, full-text indexing, embeddings, retrieval, RAG, or any production rollout.

## Separate Owner-Gated Production Track

### PROD-03C2 — Remaining First-Usable Production Gates

**Task card:** `tasks/ready/PROD-03C2.md`

**Status:** parked, not executable under the current Pre-OCR continuous objective. It may resume only after an explicit Owner instruction opens a production operations window.

The remaining bounded decisions are the exact disposable-object permanent-delete confirmation and the reboot/autostart policy. Historical authenticated/live disposable-object acceptance, the accepted UX01 generation, and the accepted PROD-04A multi-user release are already recorded and must not be replayed merely because this card exists.

Any later deployment is a separate Owner-gated production rollout, not silently part of RF-PLAN01 or the Pre-OCR queue. PROD-04A did not consume or authorize PROD-03C2's permanent-delete or reboot/autostart decisions.

## Future / Non-Blocking Backlog

These are preserved but must not block Pre-OCR completion:
- Private Vault / client-side encryption;
- External Deposit Link;
- polished browser extension after the intake API;
- mature Authority/RDF/semantic-web system;
- full Time Machine/Rewind;
- unrelated expansion of One-Time External Sharing.

### Layer 2 separate backlog — L2-SHARE01

One-Time External Sharing remains a separately scoped capability:
- no-login external capability;
- digest-only/single-use or bounded short-lived redemption semantics;
- short signed download;
- revoke/expiry;
- no public bucket exposure.

It is not silently pulled into the Pre-OCR program merely because other sharing work is authorized.

## Completed

### PROD-04A — Routine Multi-User Release 34a2eada

**Task card:** `tasks/done/PROD-04A.md`

**Status:** complete; independent read-only review PASS. Exact GitHub Actions Linux x64 / Node 24 artifact `34a2eada…` was verified, backed up, rehearsed, and deployed with only migrations 005–008. Production is schema v8/history 1–8; browser/runtime acceptance covers invitations, isolation, password/session revocation, disable/re-enable, announcements, Favorites, recycle/restore, upload/download/Preview, and final resource/integrity checks. Final aggregate is one active Owner, one active Owner-confirmed real Member, two disabled acceptance Members, an unpublished acceptance announcement, and an active recoverable synthetic TXT. No permanent deletion, later migration, feature work, infrastructure mutation, build on Alibaba, or unconsumed Owner gate entered the window.

### RF-DOMAIN01 — Scholarly Resource and Artifact Identity Foundation

**Task card:** `tasks/done/RF-DOMAIN01.md`

**Status:** complete; independent read-only review PASS. ADR-018 and append-only migration 011 establish zero-backfill ownership-domain-owned Record/Artifact/Version identities, immutable one-file Version linkage, retained tombstones, account-private server authority, strict bounded keyset pages, metadata-only attach/detach, same-Record stable reattach, lifecycle availability, and service/transaction/trigger attached-purge defense. Backend `227/227`, frontend `154/154`, workspace typecheck/build, acceptance tools, dependency audits, and compiled production-runtime migration/restart/backup/isolated-restore identity acceptance are green with zero redeploy migrations and no dependency/provider/production action.

### RF-OWNERSHIP01 — Explicit Resource Ownership Domains

**Task card:** `tasks/done/RF-OWNERSHIP01.md`

**Status:** complete; independent read-only adversarial review PASS. ADR-016 and migration 010 add one concrete account/future-Library ownership-domain parent, exact account-domain backfill, separate creator/uploader/initiator provenance, atomic Favorite-preserving table rebuilds, domain-scoped hierarchy/recycle constraints, and server-only account-domain resolution with no API behavior change. Backend `201/201`, frontend `142/142`, build/typecheck, compiled migration/restart/backup/restore acceptance, dependency audits, and acceptance tools are green.

### RF-BULK01 — Safe Bulk Drive Operations

**Task card:** `tasks/done/RF-BULK01.md`

**Status:** complete; independent read-only review PASS. ADR-017 defines bounded, atomic account-private move/recycle/restore/Favorite actions with opaque version concurrency tokens, FOLDER01-compatible provenance, exact restore metadata preflight, no object-byte mutation, strict 1–100 request bounds, 10,000 expanded-subtree bound, rollback-safe audit behavior, and conservative replay semantics. Backend `214/214`, frontend `149/149`, workspace typecheck/build, compiled acceptance (migration 10, redeploy 0), acceptance tools, dependency audits, and `git diff --check` are green with zero migration/dependency delta.

### RF-AUDIT01 — Governance Security Audit Foundation

**Task card:** `tasks/done/RF-AUDIT01.md`

**Status:** complete; independent read-only adversarial review PASS. Migration 009 provides immutable fixed-column events and append-only registries, transaction-coupled successful governance mutations, target-free denied/busy/failed attempts, two-phase permanent-purge evidence, newest-20,000 retention, and Owner-only bounded keyset review without private research surveillance. Backend `196/196`, frontend `142/142`, build/typecheck, compiled migration/restart/backup/restore acceptance, dependency audits, and acceptance tools are green.

### RF-PLAN01 — Pre-OCR Execution Decomposition

**Task card:** `tasks/done/RF-PLAN01.md`

**Status:** complete; independent read-only planning review PASS. The complete approved Pre-OCR inventory is assigned exactly once across 25 bounded Ready cards with explicit dependencies, privacy/ownership planes, append-only migration and rollback/concurrency rules, frontend/backend/persistence acceptance, adversarial review focus, production gates, and terminal STOP before OCR execution.

### OPS01A — Operations Observability & Recovery Preparation

**Task card:** `tasks/done/OPS01A.md`

**Status:** complete in repository development. The exact code-bearing checkpoint `34a2eada158dcf08783dc9538d853f9361425e8a` received independent final review and exact-head Linux CI validation. The workflow passed full tests, typechecks, production build, compiled acceptance, dependency audits, Argon2 benchmark, production artifact creation/runtime verification, and a fresh-runner independent artifact download/runtime verification. Repository-owned backup receipt/freshness, dry-run retention, isolated restore drill, readiness audit, restart policy, and inactive journald preparation remain non-production tooling. No migration/dependency or production activation was added.

### L2-PASSWORD01 — Authenticated Password Change

**Task card:** `tasks/done/L2-PASSWORD01.md`

**Status:** complete in repository development. Self-only password change uses the shared bounded Argon2id executor, expected-hash/auth-revision CAS, and atomic revoke-all sessions. Independent adversarial review PASS.

### L2-ANNOUNCE01 — Global Homepage Announcements

**Task card:** `tasks/done/L2-ANNOUNCE01.md`

**Status:** complete in repository development. Migration 008, Owner-authorized administration, server-time effective windows, safe plain-text/HTTPS-link boundaries, responsive homepage integration, backup/restore/runtime evidence, and independent adversarial review are green.

## Completed / Accepted Checkpoints

- Layer 0 project setup and repository-backed workflow;
- L1-E01 through L1-E08 foundation;
- accepted 1 GiB-class production runtime baseline;
- public HTTPS production foundation and UX01 production acceptance;
- PROD-04A exact `34a2eada…` multi-user production release at schema v8 + independent review PASS;
- L1-UX02 implementation foundation;
- L1-BUGAUDIT01 + independent review PASS;
- L1-FAV01 + independent review PASS;
- L1-UX03 repairs + independent re-review PASS (`OWNER_VISUAL_GATE=PENDING` for future deployment);
- L1-PERF01 evidence closure;
- L1-FOLDER01 migration 006 recursive recycle/restore + independent review PASS;
- L2-ACCOUNTS01 migration 007 Owner/Member/invitations/isolation + independent review PASS;
- L2-ANNOUNCE01 migration 008 + independent review PASS;
- L2-PASSWORD01 + independent review PASS;
- OPS01A repository/local operations preparation + independent final review and exact-head Linux artifact CI PASS.
- RF-AUDIT01 migration 009 governance/security audit + independent adversarial review PASS.
- RF-OWNERSHIP01 migration 010 explicit resource ownership domains + independent adversarial review PASS.
- RF-BULK01 bounded atomic Drive/Favorites operations + independent read-only review PASS.
- RF-DOMAIN01 migration 011 scholarly Record/Artifact/Version identity + independent read-only review PASS.

Historical completed task cards are archived under `tasks/done/`; they no longer remain in `tasks/doing/`.

## Stop / Escalation Boundaries

Autonomous progression stops for:
- real cost or infrastructure purchase/upgrade;
- production SSH/credentials/security-policy changes;
- destructive or irreversible real-data risk;
- production DB/OSS/DNS/TLS/Nginx/systemd mutation;
- production deployment or main merge;
- OCR/text-extraction execution, embeddings, retrieval, or RAG under the current program;
- severe unexplained corruption/security anomaly;
- a new product boundary not represented by the approved roadmap/queue.

Ordinary reversible repository implementation, local migrations inside an approved data model, tests, bounded refactors, and task/project-state reconciliation should be resolved autonomously.
