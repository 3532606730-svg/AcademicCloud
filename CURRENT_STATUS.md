# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**RF-FRONTMATTEROCR01 development is complete and green at schema v20/history 001–020. Production remains unchanged at the closed PROD-08R v19 checkpoint. The continuous objective proceeds next through one narrow workflow clarification and RF-TRANSFER01 development before any final artifact or production gate.**

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
- RF-FRONTMATTEROCR01 checkpoint `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427` was integrated non-destructively after exact PROD-08R evidence checkpoint `497f55a648a7d819e5e01909920781e66506c731`;
- development schema is v20/history 001–020; migrations 001–019 remain byte-identical and migration 020 adds only immutable suggestion evidence provenance;
- bounded local/offline OCR preserves native-text preference, the exact deduplicated first-15/last-5 window, manager review and RF-META CAS acceptance, Library-domain non-disclosure, and no raw OCR/page-image persistence;
- full backend 322/322, full frontend 193/193, focused OCR/artifact 30/30, focused frontend 33/33, both typechecks/builds, and compiled acceptance are green;
- the PROD-08R exact PDF.js/canvas native runtime allowlist and ELF64 x86-64 verification boundary remain intact;
- `tasks/done/PROD-08R.md` and `tasks/done/RF-FRONTMATTEROCR01.md` preserve bounded evidence; no task is currently Doing.

## Safety Boundaries

No production contact or mutation is authorized during the remaining development checkpoints. The later final production gate is bounded to the exact green combined artifact, exact pending migrations, fresh verified rollback backup, cutover, and changed-risk acceptance. Incident-database inspection, real permanent deletion, `PROD-03C2`, reboot/autostart, infrastructure-policy changes, credentials, paid infrastructure, main merge, RF-SEARCH01, whole-document extraction, full-text search, embeddings, retrieval, RAG, external metadata/catalogue lookup, web search, AI extraction, and unrelated work remain prohibited.

## Next Action

Publish and verify the RF-FRONTMATTEROCR01 closure checkpoint, reconcile the narrow workflow proportionality clarification, then activate RF-TRANSFER01. Do not contact production.
