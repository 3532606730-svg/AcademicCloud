# L1-INTELLIGENT-LIBRARY01 — Complete Intelligent Library

**State:** COMPLETE / DEPLOYED / VERIFIED — 2026-08-22

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
| D | Citation engine | COMPLETE / PUSHED / SYNCED | `015738ccb43fa120ab3a2455798d18a22e2f6a21` |
| E | Library UX + Activity Center | COMPLETE / PUSHED / SYNCED | `017a47dbd837264175d8cbcb3f469a01e3e62c92` |
| F | Integration + migration + exact production deployment | COMPLETE / DEPLOYED / VERIFIED | exact production source `017a47dbd837264175d8cbcb3f469a01e3e62c92`; final reconciliation checkpoint recorded in Git history |

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

## Checkpoint E acceptance evidence

### Implemented

- Consolidated the wide Library controls into one restrained Search → material
  class → sort → Filters row. All six existing server-authoritative sort modes
  remain available, the separate visible sort toolbar is gone, and the row
  stacks responsively on narrow screens.
- Tightened the Library heading and reports the number of holdings currently
  loaded without presenting a page count as a total corpus count.
- Made Activity Center compact and collapsed on first use, with a count and
  failed-count summary, explicit expansion, and an optional account-scoped
  browser-local preference. Existing durable upload, AI-cataloguing, download,
  failed, and completed evidence is preserved; implementation jargon is not
  exposed in ordinary activity copy.
- Added the ordinary details → Cite flow with all four exact Checkpoint-D styles,
  structured page/range, volume, fascicle, chapter, 卷, 叶面, line, item,
  document-number, archive-call-number, and labelled custom locators. The
  client renders plain server-returned text and copies that exact text; no HTML
  citation rendering or client-side authority is introduced.
- Added direct structured bibliographic editing for material class,
  contributors and evidence roles, publication, language, series/volume,
  current carrier edition, and historical source/base edition. The existing
  compatibility metadata editor remains distinct, while field-scoped
  human-to-AI restoration is explicit, selected, and CAS-protected.

### Safety and verification

- Every bibliography/citation request uses the existing Library and holding
  identity only; Core still derives effective membership, canonical facts,
  CAS state, field authority, and citation output. No client owner/role,
  canonical identity, raw style, or private-overlay claim is accepted.
- The Activity preference contains one per-account boolean only. It is not
  server data, does not delete old failure evidence, and failure to access
  browser storage leaves the panel usable in its safe collapsed state.
- Checkpoint E adds no migration, backfill, object mutation, credential,
  provider, OSS/RAM/CORS, or production change. Production remains exact
  `53317bb…` at schema v22/history 001–022; development stays 001–024.

```text
frontend full suite = 270/270 PASS
focused citation/details/search/API/App/mobile = 209/209 PASS
workspace typecheck = PASS
frontend production build = PASS
git diff --check = PASS
```

## Checkpoint F acceptance evidence

### Integrated verification

```text
backend = 364/364 PASS
frontend = 270/270 PASS
Compute = 60 PASS / 0 FAIL / 2 expected local-runtime skips
Compute contracts = 2/2 PASS
workspace typecheck = PASS
all-workspace production build = PASS
compiled acceptance = PASS (24 migrations; restart/backup/restore checks)
Argon2id benchmark = m=65536, t=3, p=1; hash 83 ms; verify 81 ms; peak RSS 135 MiB
npm audit (all and production-only) = 0 vulnerabilities
git diff/private-artifact/config review = PASS; unrelated scratch/ preserved
```

### Exact artifact and stopped-service rollback generation

- Exact source `017a47dbd837264175d8cbcb3f469a01e3e62c92` built in GitHub
  Actions run `32580834900`; Linux build job `97049835217` and independent
  verification job `97050251770` passed.
- Artifact `9477785607`, GitHub digest
  `b221f22b0b1d7b22543e43ac0f5a756465e1f750f57c5cc07c87b49cec8ef3bd`;
  archive SHA-256
  `e714ef877681fddd9078fb6cdcace31d1602840bc244ac84b9cfcc868d903210`;
  manifest SHA-256
  `3b32afe7b2c75766cdd4f5faed5934e23d6229cc3986fe7ad09766bd26c37b4f`.
  Independent download, 4,857-file manifest, native-module boundary,
  compiled acceptance, and isolated Alibaba-host runtime checks passed.
- With exact previous release `53317bb0156589baa21bc69c22e199d200c49840`
  stopped and schema v22/history 001–022 intact, the consistent backup
  `academiccloud-pre-l1-20260822T152800Z.sqlite` was created at 1,355,776
  bytes with SHA-256
  `a11a38da37ac0df45ae5eb632184ffca44674210b2fe780d34c4815ee445a7b8`.
  Its compiled receipt verification passed.
- Database and protected-configuration recovery material was published only as
  `age` ciphertext plus non-secret receipt/manifest to the private off-host
  repository. Payload commit `908c85ab1ddb5e189a440320070148b973235dc0`,
  sealed remote head `a5bbbeb27d6486083a45e4191c55fa0ec6db8479`;
  a fresh authenticated clone independently reproduced the receipt and both
  ciphertext hashes. No plaintext SQLite database was published.

### Migration, deployment, and bounded production proof

- The immutable target release was installed root-owned and non-writable by
  `academiccloud`. The `current` symlink was atomically selected while the
  service remained stopped, then the compiled migration runner applied exactly
  versions 023 and 024 and reported `currentVersion: 24`.
- Migration 023 checksum is
  `b4eeb224e4b44691ed8b11b91fca53eea079c874034008f575bb861066132a42`;
  migration 024 checksum is
  `60c1410b4dc75476841d3f5ee08edd1cdec74c668555cd608fc6fc31e62358d1`.
  Production now reports schema v24/history 001–024, SQLite integrity `ok`,
  zero foreign-key violations, and unchanged account/folder/file/session/
  invitation/announcement counts across the stopped-service boundary.
- The active process CWD resolves inside exact release `017a47d…`;
  `NRestarts=0`, one `127.0.0.1:3000` listener, loopback/public health `ok`,
  readiness `ready`, public frontend index byte identity exact, zero service
  error/fatal matches, zero new kernel or cgroup OOM events, and zero failed
  units. Final-smoke `MemoryPeak=113,774,592` bytes under unchanged
  `MemoryHigh=335,544,320` and `MemoryMax=402,653,184`.
- Root-only environment, systemd unit, Nginx site, and security-header hashes
  remained exact. OSS/RAM/CORS, credentials, source objects, DNS/TLS, memory
  policy, and paid cost were not changed.
- Backup/live comparison proved identical counts for 132 files, 73 suggestion
  runs, 63 suggestion candidates, and 47 durable Compute jobs. All five
  migration-023/024 tables remained empty immediately after cutover: no
  historical backfill, existing-data reinterpretation, or full-Library AI wave
  occurred.
- The optional production Compute canary was not run because no task-owned
  authenticated source fixture existed; using an existing private academic
  resource would have weakened the bounded privacy contract. Hosted exact-path
  qualification was already green, and the migration/no-wave/runtime evidence
  covered the changed production risk without touching user-authored data.
- Rollback was not required. The immediate rollback is the inseparable pair:
  application `53317bb0156589baa21bc69c22e199d200c49840` plus restoration of
  `academiccloud-pre-l1-20260822T152800Z.sqlite`; the old application must never
  run against the live v24 database.

## Acceptance contract — complete

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
- E: **COMPLETE.** Automatic upload status, concise Library row/detail/edit/filter/citation
  UX, explicit human-to-AI reset, responsive toolbar, and Activity Center
  collapsed/local preference behavior.
- F: **COMPLETE.** Integrated tests/build/audit, exact immutable artifact,
  stopped-service verified/off-host rollback generation, additive migrations
  023–024, exact deployment, and health/readiness/schema/integrity/FK/journal/
  memory/no-wave checks are green. The privacy-safe canary decision is recorded
  above; no full-Library AI wave occurred.

## Final successor

Next approved work is `UPLOAD-PERF01`, but it has not been started. Layer 1 is
complete and this program stops with Internal Beta still not started and no
users invited.
