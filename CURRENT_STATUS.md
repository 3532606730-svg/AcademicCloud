# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**PROD-08R — v19 Production Artifact Runtime Repair and Release Resume is complete and closed. Production acceptance is green, durable evidence is reconciled, and execution is stopped.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

ADR-028 remains authoritative for permanent deletion: only the authenticated global `owner` may permanently delete eligible recycled account or Library resources; Library exclusivity is revalidated at the destructive transaction boundary; concurrent/shared state fails closed with storage and unrelated lineage untouched. PROD-08R preserved this PROD-07B behavior.

## Production Truth

```text
PRODUCTION=f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7
PREVIOUS_RELEASE=bc5788633e0295744905b4ae2dcdfcc5d97635bf
PRODUCTION_SCHEMA=v19 / migrations 001–019
RF_METASUGGEST_DEPLOYED=true
L1_UX07_DEPLOYED=true
ROLLBACK_USED=true
```

- migration history and repository checksums are exact 001–019; migration 019 was the sole pending migration and was applied exactly once in the final successful cutover; migration 020 is absent;
- SQLite integrity is `ok` and foreign-key violations are zero;
- the service is active with autostart disabled, `NRestarts=0`, and exactly one API listener at `127.0.0.1:3000`;
- loopback/public health is `ok` and readiness is `ready`;
- the running process is rooted in exact immutable release `f62766c…`, and public index/JavaScript/stylesheet hashes match that release;
- RF-METASUGGEST01 and L1-UX07 are deployed; PROD-07B account/Library destructive-lifecycle behavior is preserved;
- no migration 020, OCR, RF-SEARCH01, whole-document extraction, indexing, embeddings, retrieval, or RAG residue exists;
- no systemd, Nginx, DNS, TLS, firewall, autostart, CSP, certificate, credential, or other infrastructure policy was changed.

Two earlier post-migration verification attempts failed closed on optional SQL-probe quoting, restored the exact fresh schema-v18 backup with `bc578863…`, and reverified integrity/FK/schema/history/health/readiness before retry. This consumed rollback, so `ROLLBACK_USED=true`. The final app-plus-database cutover succeeded.

The current rollback pair is inseparable:

- application `bc5788633e0295744905b4ae2dcdfcc5d97635bf`;
- fresh schema-v18 backup `academiccloud-pre-prod08r-20260818T184801Z.sqlite`, SHA-256 `338d245d0e0aeb7fec063df069e0750bf3830aceedf32a0f4aad716fb868453b`;
- encrypted off-host backup verified in private commit `a7369933f31af7839bc833d3d24d30688504276d`.

Never select `bc578863…` against the live v19 database; restore the paired v18 backup as part of any authorized rollback.

## Artifact and Acceptance Evidence

- failed workflow `32168164654` never uploaded or deployed its artifact;
- diagnostic workflow `32170306350` proved that native pruning removed the pinned Linux x64 glibc `@napi-rs/canvas` binding required by PDF.js import-time `DOMMatrix` initialization;
- repair commit `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` retained only that exact canvas native file through the existing allowlist/ELF boundary;
- artifact workflow `32171340265`, build job `95822977886`, and independent job `95823802592` passed completely;
- archive SHA-256 is `6438e5235ce1290d450f1beae28bed19c342a5258717f9fd321bc339f06aee32`; manifest SHA-256 is `488c445a9f4677787803c9dbcc9737347d95793ac17cd83e9582b6500fe8bb23`;
- synthetic destructive acceptance was skipped for safety because the deployment created no uniquely owned run target; no task-owned synthetic residue exists and no pre-existing production resource was used;
- the Owner confirmed the observed folder-count delta resulted from intentional Owner deletions, so it is not an incident and requires no comparison, audit investigation, restore, cleanup, or mutation.

## Development Truth

- `codex/project-memory-reconcile-20260817` remains the single authoritative non-main line;
- development and deployed application schema head are v19 / migrations 001–019; no migration 020 exists;
- RF-META01, RF-METASUGGEST01, PROD-07B, and L1-UX07 remain complete with their historical task evidence preserved;
- `tasks/done/PROD-08R.md` is the bounded deployment evidence card; no task remains Doing.

## Safety Boundaries

This completed checkpoint does not authorize further production contact/mutation, incident-database inspection, real permanent deletion, `PROD-03C2`, reboot/autostart or infrastructure-policy repair, credentials, paid infrastructure, main merge, OCR, RF-FRONTMATTEROCR01, RF-SEARCH01, whole-document extraction, full-text search, embeddings, retrieval, RAG, external metadata/catalogue lookup, web search, AI extraction, migration 020, or unrelated work.

## Next Action

STOP. A new Owner authorization is required for any later repository or production task.
