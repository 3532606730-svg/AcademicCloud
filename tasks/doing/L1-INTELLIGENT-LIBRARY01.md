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
| A | Domain + persistence architecture | READY TO CHECKPOINT — implementation and evidence below | recorded immediately after commit |
| B | AI bibliographic Compute | PENDING | — |
| C | Search + filters + display | PENDING | — |
| D | Citation engine | PENDING | — |
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

## Remaining acceptance contract

- B: current official PaddleOCR/PP-OCR/PaddleOCR-VL and small Qwen-VL options
  receive a bounded real decision record; production path is exact-pinned,
  strict-schema, confidence/provenance-bearing, safe auto-application that
  respects human fields, upload-independent on failure, and remains entirely in
  ephemeral Compute. Old Tesseract naming becomes legacy/emergency, and batch
  naming becomes bibliographic maintenance.
- C: server-authoritative structured metadata Search, material and advanced
  filters, filter-bound cursor identity, stable ranking/pagination/sort, and
  modern/historical/facsimile display composition with safe fallback.
- D: deterministic CSL-compatible mapping and UI-ready output for Chicago Notes
  & Bibliography, 《历史研究》, 《文史哲》, and GB/T 7714, including page, 卷,
  册, 叶, 行, archive, and custom locators.
- E: automatic upload status, concise Library row/detail/edit/filter/citation
  UX, explicit human-to-AI reset, responsive toolbar, and Activity Center
  collapsed/local preference behavior.
- F: relevant backend/frontend/Compute tests, workspace typecheck, production
  build, diff/private-artifact/config review; exact immutable artifact; verified
  stopped-service backup/off-host hash and app+DB rollback pair; migration 023;
  exact deploy and health/readiness/schema/integrity/FK/journal/memory checks.
  At most one tiny Owner-controlled Compute canary if materially needed. No
  full-Library AI wave.

## Final successor

After a green production release, set next approved work to `UPLOAD-PERF01` but
do not start it. STOP with Internal Beta still not started.
