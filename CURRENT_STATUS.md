# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**`RF-META01 — Canonical Metadata, Templates, and Minimal Authorities` remains complete and independently green. `PROD-07B` deployed the bounded production hotfix and reached STOP. Production now runs exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, schema v18/history 001–018.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

L1-UX06 renders canonical Library holdings and Owner-managed folder/account rows through one existing catalogue table, restores established file-type badges and compact row actions, suppresses duplicate filename-derived labels and redundant descriptive copy, and supplies a manager-only Library-domain recycle → normal Recycle list → CAS restore lifecycle. PROD-07B fixes the root-row alignment and ordinary-folder recycle regressions and adds explicit global-Owner-only permanent deletion for recycled account resources and eligible recycled Library holdings while retaining distinct account and Library destructive lifecycles.

ADR-026 records the implemented canonical metadata, minimal authority, CAS, non-lossy type-transition, privacy, and filename-separation contract. ADR-025 remains the later suggestion/evidence model and keeps extraction/OCR outside this completed Epic.

## Execution State

`tasks/done/PROD-07B.md`

There is no active task. PROD-07B is complete and the explicit hotfix/deployment authority is exhausted. The strict metadata v1 contract still supports Book, Article, Manuscript, Inscription, and Archival Document through ordinary `资料详情`. Canonical titles remain the preferred catalogue title, with accepted acquisition/display filename fallback and a separate `原始文件名` fact. Effective Members read; only effective Library managers mutate canonical metadata.

Completed result:
- append-only migration 018 advances the development schema from v17 to v18 without metadata backfill or changes to existing Record/Artifact/Version/file identity, accepted filename, object key/checksum, provenance, Favorites, or private overlays;
- exact Library/holding detail and metadata routes derive actor, membership, domain, holding, lineage, and audit identity server-side and use an independent opaque metadata CAS;
- five fixed templates, five Library-domain authority types, typed same-domain links, authority CAS, strict validation, and explicit two-save non-lossy material-type transitions are implemented;
- the normal catalogue prefers canonical title and `资料详情` provides Member read-only / effective-manager edit behavior while Preview, Download, Favorites, and recycle retain stable file identity and their existing authorization/CAS boundaries;
- PROD-07A later deployed this exact checkpoint through the separately authorized production window; RF-METASUGGEST01/migration 019 remain undeployed.
- PROD-07B then deployed only the 18-file recycle/permanent-delete hotfix on top of exact PROD-07A, without a schema, migration, dependency, canonical-metadata, OCR, search, or infrastructure-policy change.

## Completed Dependency

`tasks/done/L1-UX06.md`

Completed result:
- one coherent root catalogue with its desktop header above Owner folders/account rows and canonical holdings;
- existing PDF/image/text/generic badges, `RowMenu`, `StarButton`, responsive rows, and fullscreen Preview behavior reused;
- one visible filename-derived title until RF-META01, with `recordLabel` residue omitted from compact rows and provenance retained in data;
- manager-only `POST /api/libraries/:libraryId/holdings/:fileId/recycle`, with active membership, exact-Library holding resolution, Library ownership-domain resolution, opaque `driveEntryVersion` CAS, transactional recycle-group provenance, and non-disclosing Member/wrong-Library/guessed-ID denial;
- manager-only `GET /api/libraries/:libraryId/recycle` and `POST /api/libraries/:libraryId/recycle/:fileId/restore`, with exact deleted scholarly holding/domain resolution, read-only object metadata verification, post-stat authority/version/group revalidation, atomic restore/group consumption/audit, and no account-path fallback;
- one top-level Recycle product surface combining separately held account and Library rows; L1-UX06 originally exposed Restore only, and PROD-07B supersedes that presentation with explicit global-Owner-only permanent-delete controls while keeping account and Library lifecycle paths separate;
- no real production resource was recycled or permanently deleted during PROD-07B verification, and no private overlay was inspected or exposed.

## Current Execution Boundary

```text
L1-UX06   ← DONE
→ RF-META01   ← DONE
→ STOP   ← REACHED
```

RF-METASUGGEST01, RF-SEARCH01, and the later Pre-OCR queue remain parked and require new explicit Owner authorization.

### RF-META01 — Complete
ADR-026 is implemented through append-only repository schema v18, exact holding-scoped APIs, and normal `资料详情`; PROD-07A later deployed this exact checkpoint through a separately authorized production window.

### RF-METASUGGEST01 — Preserved, not started
For PDFs with a usable existing text layer, bounded discovery uses title/copyright/CIP/colophon/front-matter evidence, embedded metadata and filename fallbacks. Default page discovery is first 15 pages + last 5 pages. Pure scanned PDFs return `OCR deferred`; this round does not execute OCR.

### RF-SEARCH01 — Preserved, not started
One authority-scoped catalogue metadata/name search field on `资料库`, with authority filtering before ranking/serialization and no persisted query history or OCR/full-text claim.

## Production Truth

Production now runs:
- exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`;
- previous release `2322169bc33415734d025010c465900c7fbc6bd9`;
- schema/history v18 / migrations 001–018 with exact checksums;
- PROD-07B invoked no migration command and rollback was not used;
- Linux x64 / Node 24 hotfix archive SHA-256 `ad084372db6e128cc4a7ff2beae4dbbe7c8b1077c0bb07db926d69bacfbcbca6` and manifest SHA-256 `7fe3b0608dddf7431af9cc3bb0ff4a0de40401c2257b2a6eadd4e76eb69287e8`;
- integrity `ok`;
- foreign-key violations zero;
- loopback and public health/readiness green;
- API loopback-only; autostart policy unchanged;
- safe aggregates unchanged at accounts 5 / folders 4 / files 32 / sessions 18 / invitations 5 / announcements 1;
- exact public index/JavaScript/stylesheet hashes match the deployed artifact, whose bundle contains the aligned root-row spacer, direct ordinary-folder recycle call, Owner-only account/Library permanent-delete controls, and no migration 019 or RF-METASUGGEST/OCR/search residue;
- no real resource was recycled or purged for acceptance; stable IDs, object keys/bytes, checksums, provenance, scholarly lineage, Favorites/private overlays, and metadata remained untouched.

PROD-07B rollback pair is:
- release `2322169bc33415734d025010c465900c7fbc6bd9`;
- fresh schema-v18 backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite`, 667,648 bytes, SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`;
- receipt SHA-256 `aebe203e88ad047e97f765aa0ccbad441dabe6cf193a7fe9bc10125391d55e67`;
- age ciphertext SHA-256 `2a5c0decfab2133db708c027416e5f558dfc08ed25e5c7fe11a9b5d29eb0f7ec`, published off-host at private backup commit `49e72e5`.

Do not rerun PROD-05A, PROD-06A, PROD-07A, or PROD-07B.

## Safety Boundaries

The consumed PROD-07B authorization permitted only the bounded hotfix implementation and exact production deployment. It did not authorize:
- permanently deleting or recycling any real production resource merely for verification;
- direct DB cleanup or cleanup of visible historical production residue / `PROD-03C2`;
- main merge;
- reboot/autostart, DNS/TLS/Nginx/systemd/firewall/certificate changes;
- credentials or paid infrastructure changes;
- OCR execution or whole-book text extraction;
- full-text indexing, embeddings, retrieval, RAG;
- external metadata/catalogue services, ISBN APIs, web lookup, or AI/LLM extraction.

Global Owner is now the sole product/API authority for permanent deletion. Library manager/member/contributor/uploader/creator status never grants it. For Library purge, the server must derive the target lifecycle, prove exclusive ownership/reference before mutation, revalidate that proof at the destructive transaction boundary, fail closed on concurrent/shared state, and retain unrelated physical objects and scholarly lineage. Any later production release or real destructive confirmation remains a separate Owner gate.

## Verification Policy

RF-META01 is green on the exact closing tree: backend 268/268 and frontend 182/182 tests; both typechecks; both release builds; migration 018 v17→v18 preservation/idempotency; and compiled restart/backup/restore acceptance with `firstMigrationCount: 18`, canonical metadata retained across restart/restore, readiness green, and `redeployMigrationCount: 0`. Independent review found one test-only unknown-template fixture/query defect, which was repaired; follow-up review found no remaining P0–P2 issue. `git diff --check` is green apart from expected Windows line-ending notices. No production or broad historical production acceptance was contacted or replayed.

PROD-07B followed the explicit fast-hotfix policy: no unit/integration/full suite, typecheck, compiled acceptance, migration acceptance, independent reviewer, or broad security/dependency audit was run. The technically required backend/frontend production builds passed; focused in-memory lifecycle checks covered canonical Library purge success, shared-contribution conflict with no mutation, and recursive account-folder purge. Production verification was non-destructive: exact release/schema/history, integrity/FK, safe aggregates, public asset hashes, forged-request denial, health/readiness, loopback listener, unchanged protected-path hashes, zero post-start service errors/new OOM/cgroup events, and no RF-METASUGGEST/migration-019 residue. The general readiness auditor remains globally `NOT_READY` because three pre-existing observations are unchanged: files-domain CSP expectation, nine historical current-boot kernel OOM log matches from earlier unrelated acceptance, and the installed unit's existing 10-second start-limit interval; PROD-07B did not alter those infrastructure boundaries.

## Next Action

STOP after PROD-07B. Do not start RF-METASUGGEST01, RF-SEARCH01, another Pre-OCR task, another production release, a real permanent-delete confirmation, infrastructure work, or main merge without new explicit Owner authorization.
