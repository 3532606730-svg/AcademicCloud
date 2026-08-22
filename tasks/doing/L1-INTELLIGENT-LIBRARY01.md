# L1-INTELLIGENT-LIBRARY01 — Complete Intelligent Library

## Goal

Turn the canonical shared Library into a bibliographically intelligent Layer‑1
surface: automatic bounded AI cataloguing for new uploads, authoritative
structured metadata, scholarly display/search/filtering, deterministic citation
output, and compact integrated UX. Complete one exact production release, then
STOP before internal beta or invitations.

## Owner authorization and hard boundaries

`IMPLEMENT_AND_DEPLOY` is authorized in mandatory checkpoints A–F. Each
checkpoint must be coherent, tested in proportion to changed risk, committed,
pushed to `codex/project-memory-reconcile-20260817`, and locally synchronized
before continuing. Partial production deployment is prohibited.

Allowed: the smallest coherent additive schema migration, existing ephemeral
GitHub Actions Compute, exact pinned free/open model/runtime assets, and the
established production backup/migration/deploy procedure.

STOP for destructive migration/backfill, paid AI/infrastructure, a persistent
heavy model in Core, broad/new credentials requiring Owner action, privacy or
authorization weakening, OSS/RAM/CORS/provider mutation outside a newly proved
blocking regression, uncertain production data integrity, uncontrolled
full-Library reprocessing, product-scope expansion, or unsafe/unrecoverable
production failure. Do not start internal beta or invite users.

## Mandatory sequence

| Checkpoint | Scope | State | Exact checkpoint SHA |
|---|---|---|---|
| A | Domain + persistence architecture | COMPLETE / PUSHED / SYNCED | `fff33c7e2ffe6c6cd726c18c85d2bdd4bafe7643` |
| B | AI bibliographic Compute | COMPLETE / QUALIFIED / PUSHED / SYNCED | `9d8a3a097a5eba0d8c1603cee18568793417b135` |
| C | Search + filters + display | COMPLETE / PUSHED / SYNCED | `17c1395995575cdf5b26944097c382fbf44478fe` |
| D | Citation engine | COMPLETE / PUSH AND SYNC PENDING | D tip; exact SHA recorded before E |
| E | Library UX + Activity Center | PENDING | — |
| F | Integration + migration + exact production deployment | PENDING | — |

## Checkpoint A evidence

### Implemented

- Accepted ADR-032 and added migration 023 only; migrations 001–022 and the
  migration-019/020 immutable evidence contract are unchanged.
- Added the single 19-value `materialClass` taxonomy, 12 conceptual contributor
  roles with separate evidence labels, structured publication/current-carrier
  and historical-source editions, deterministic ISBN validation, and explicit
  field registries.
- Added normalized SQLite repositories, CAS profile writes, Library-domain
  guards/indexes, exact-label/alias person binding, and zero historical backfill.
- Extended holding details with bibliography/version/field-authority data and
  added manager-only strict write plus explicit field-scoped “restore AI” APIs.
- Existing canonical manager edits now establish durable human authority for
  the canonical fields actually changed. Unfilled new fields are not locked.
- Original bytes, filenames, lineage, Favorites/private overlays, authority
  scope, and existing audit semantics remain unchanged.

### Decision and safety evidence

- v18 `material_type` remains a compatibility-only historical template field;
  `materialClass` is the one authoritative Layer‑1 taxonomy.
- Automatic Authority identity requires exactly one same-domain person match by
  exact canonical label or exact alias; fuzzy/ambiguous automatic merges return
  no binding.
- Current carrier and historical source/base edition are separate by schema and
  contract. No guessed historical values are required.
- Production remains exact `53317bb…`, schema v22/history 001–022. Checkpoint A
  does not authorize or perform a partial production migration/deployment.

### Verification

```text
backend full suite = 348/348 PASS after repairing one task-caused historical trigger-count expectation
focused bibliography/metadata/migration HTTP/service = 17/17 PASS
workspace typecheck = PASS
git diff --check = PASS
```

Final Checkpoint-A rerun and review are recorded with the checkpoint commit.

## Checkpoint B acceptance evidence

### Implemented

- Replaced the ordinary protected Compute OCR path with sequential, ephemeral,
  memory-only PP-OCRv6 small document reading followed by Qwen3-1.7B Q8_0
  bibliographic reasoning. Paddle closes before Qwen starts; neither runtime is
  resident in Core.
- Added one strict shared bibliography result contract aligned to migration 023,
  exact model/runtime provenance, per-field confidence and evidence digests,
  deterministic quality gates, and fail-closed schema/ISBN/page/authority
  checks. AI cannot submit contributor authority identities.
- Added migration 024 for immutable structured AI-run evidence only. It stores
  no raw OCR text, rendered page bytes, source URL, capability, or model
  conversation; normalized canonical data remains in migration 023 tables.
- Core automatically applies only warning-free `>=85` defaults to empty or
  already AI-authoritative fields. Existing human and pre-authority canonical
  values remain authoritative, and exact-only same-domain person binding is
  still performed by Core.
- Canonical Owner uploads and Owner-approved Member contributions trigger the
  durable asynchronous job automatically. Dispatch, render, OCR, model,
  validation, and callback failures do not roll back or hide a valid upload.
- Ordinary production execution no longer selects Tesseract. The old adapter is
  retained behind the explicit `ACADEMICCLOUD_OCR_EMERGENCY_LEGACY=1` emergency
  switch and is absent from the protected workflow environment.
- Added an exact clean-runner qualification comparing the selected pipeline to
  qualification-only Qwen3-VL-2B on the same multilingual/vertical rendered
  pages, plus the full seven-case bibliographic reasoning set, encompassing GNU
  RSS gates, privacy scan, and zero artifact publication.

### Local verification

```text
backend = 351/351 PASS
frontend = 259/259 PASS
Compute = 60 PASS / 0 FAIL / 2 expected local runtime skips
Compute contracts = 2/2 PASS
backend/frontend/Compute/contract typecheck = PASS
Compute/contract build = PASS
git diff --check = PASS
```

### Exact hosted qualification

- Exact source `0fa04b43a80ac4d1486323c700e737850b081222`, workflow run
  `32574319098`, job `97034473517`, clean `ubuntu-24.04`: SUCCESS.
- Real PP-OCRv6 rendered-page E2E passed with no skip. The selected
  PP-OCRv6-small → Qwen3-1.7B pipeline passed title/material class on 3/3
  modern Chinese, traditional vertical, and Japanese rendered pages in
  198,499 ms.
- The seven-case gate passed 7/7. Six evidenced cases were warning-free
  `auto_apply` at confidence 90 with title/class/carrier/source checks green;
  the deliberately conflicting case remained `ambiguous` with controlled
  warnings.
- Seven-case GNU maximum RSS was 3,396,112 KiB; visual-comparison maximum RSS
  was 3,298,672 KiB. Both are below the 6-GiB contract.
- Qualification-only direct Qwen3-VL completed no case inside the final bounded
  window and is not selected. Earlier diagnostic evidence completed 2/3 but
  missed the traditional vertical case and was slower than the selected path.
- Privacy/output and production-shell safety passed; workflow artifacts were
  exactly zero. Linux production build run `32574318996` also passed
  deterministic build and independent artifact verification.
- ADR-033 is Accepted. Production remains exact `53317bb…` at schema
  v22/history 001–022; no partial deployment or production migration occurred.

## Checkpoint C acceptance evidence

### Implemented

- Accepted ADR-034 and extended the authorization-first catalogue query over
  the migration-023 bibliography without changing the existing RF-SEARCH01
  title/contributor-first relevance tiers or making composed display text the
  sole search identity.
- Added server-authoritative filtering for the exact 19-value material class
  plus contributor, language, publisher, publication year/date, carrier/source
  edition type, dynasty, reign title, editorial role, series, and volume.
- Bound every Search cursor to a SHA-256 identity of the normalized query,
  normalized filters, and sort mode. Keyset continuation supports relevance
  and all existing six sort modes; incompatible cursors fail closed.
- Preserved the established normal Library sort implementation, Hanyu-Pinyin
  title behavior, natural/numeric policy, Unicode fallback, and deterministic
  tie-breaks. Search relevance and normal sorting remain distinct.
- Added evidence-driven structured edition matching for modern and historical
  queries including `明代刻本`, `万历刻本`, `武英殿本`, `影印本`, `现代点校本`,
  and `中华书局点校本`.
- Added one presentation-only modern/historical/facsimile display composer.
  Modern scholarship uses contributor + space + title; primary/historical
  sources use title + supported carrier/source edition statement. The
  composed label is exposed consistently in Library lists, Search, and
  Library-scoped Favorites but is never persisted or used as a storage key.
- Added a visible authoritative material-class selector and restrained
  collapsible advanced-filter UI. Filter-only queries execute on the server;
  clearing or changing query/filter state cancels stale requests and resets
  pagination.

### Safety and compatibility

- Effective membership filtering still precedes enumeration, matching,
  filtering, ranking, counting, and cursor creation; inaccessible identities
  remain non-disclosing.
- Existing canonical metadata and safe display-name fallback remain usable for
  rows without a migration-023 profile. No guessed edition precision or
  placeholder is introduced, and no `.pdf` suffix appears when a real
  scholarly title is available.
- Checkpoint C adds no migration or backfill and does not mutate metadata,
  object bytes, filenames, private overlays, credentials, provider policy, or
  production configuration. Production remains exact `53317bb…` at schema
  v22/history 001–022; development remains v24/history 001–024.

### Verification

```text
backend full suite = 357/357 PASS
frontend full suite = 262/262 PASS
focused backend Search/filter/display/sort/HTTP/service = 26/26 PASS
focused frontend Search/filter/display/API = 44/44 PASS
workspace typecheck = PASS
frontend production build = PASS
git diff --check = PASS
```

## Checkpoint D acceptance evidence

### Implemented

- Accepted ADR-035 and added an authorization-first, per-request citation route
  over the canonical metadata-details service. The client supplies only the
  selected style and typed locators; Library authority and canonical facts
  remain server-derived.
- Added a style-neutral CSL-compatible mapping that preserves material class,
  exact contributor roles, current carrier edition, historical source/base
  edition, publication facts, identifiers, archive/fonds/reference facts, and
  bounded partial-metadata fallback.
- Exact-pinned local `citeproc@2.4.63`; no runtime network, AI formatting,
  remote style fetch, or user-authored style execution is in the request path.
- Added exact release-owned `production_subset` definitions for Chicago Notes
  & Bibliography, 《历史研究》, 《文史哲》, and current GB/T 7714—2025.
  Each response carries reviewed source/revision, processor version, review
  date, and SHA-256, and definition drift fails closed.
- Added strict structured locators for page, page range, volume, fascicle,
  chapter, 卷, 叶面, line, item, document number, archive call number, and
  labelled custom values. Chinese historical combinations render in stable
  scholarly order without pretending every locator is a page.
- Returned full note, supported subsequent short note, bibliography, normalized
  CSL item, completeness, material class, structured locators, and style
  provenance together for the Checkpoint-E dialog/copy surface.

### Exact style pins

```text
Chicago Notes & Bibliography = decf6aa5bde13e8f52e7674d421bb1a20b5bfd18fe588b9160ce260ac0e7d514
《历史研究》 = 54d40e14b8171047200f42021c2506d308bf20b1d79e4d54afeccc56df083478
《文史哲》 = 1cbb0cb635739c1233ea69b369ee3c9aaa6ce20370f0d1dc8208b80325670be8
GB/T 7714—2025 = e41c757ffc1a5230f60e03cd829fb0c13c1556373d87f586cf6a98f0fd8d0599
```

### Safety and verification

- Effective membership is checked before canonical metadata is loaded;
  guessed Library/holding identities remain non-disclosing. Citation output is
  not persisted and does not expose another account's private research state.
- Missing facts yield explicit partial completeness and safe fallback; no
  contributor, edition, date, archive, or publication fact is invented.
- Checkpoint D adds no schema/backfill/object mutation, provider/configuration
  change, private artifact, or production action. Production remains exact
  `53317bb…` at schema v22/history 001–022; development stays 001–024.

```text
backend full suite = 364/364 PASS
focused citation/mapping/processor/HTTP/authority = 8/8 PASS
backend production compile = PASS
workspace typecheck = PASS
npm dependency audit at install = 0 vulnerabilities
git diff --check = PASS
```

## Remaining acceptance contract

- B: **COMPLETE.** Current official PaddleOCR/PP-OCR/PaddleOCR-VL and small Qwen-VL options
  receive a bounded real decision record; production path is exact-pinned,
  strict-schema, confidence/provenance-bearing, safe auto-application that
  respects human fields, upload-independent on failure, and remains entirely in
  ephemeral Compute. Old Tesseract naming becomes legacy/emergency, and batch
  naming becomes bibliographic maintenance.
- C: **COMPLETE.** Server-authoritative structured metadata Search, material and advanced
  filters, filter-bound cursor identity, stable ranking/pagination/sort, and
  modern/historical/facsimile display composition with safe fallback.
- D: **COMPLETE.** Deterministic CSL-compatible mapping and UI-ready output for Chicago Notes
  & Bibliography, 《历史研究》, 《文史哲》, and GB/T 7714, including page, 卷,
  册, 叶, 行, archive, and custom locators.
- E: automatic upload status, concise Library row/detail/edit/filter/citation
  UX, explicit human-to-AI reset, responsive toolbar, and Activity Center
  collapsed/local preference behavior.
- F: relevant backend/frontend/Compute tests, workspace typecheck, production
  build, diff/private-artifact/config review; exact immutable artifact; verified
  stopped-service backup/off-host hash and app+DB rollback pair; migrations 023–024;
  exact deploy and health/readiness/schema/integrity/FK/journal/memory checks.
  At most one tiny Owner-controlled Compute canary if materially needed. No
  full-Library AI wave.

## Final successor

After a green production release, set next approved work to `UPLOAD-PERF01` but
do not start it. STOP with Internal Beta still not started.
