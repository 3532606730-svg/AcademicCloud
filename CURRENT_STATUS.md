# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**RF-FRONTMATTEROCR01 development, the narrow workflow proportionality clarification, and RF-TRANSFER01 — True Resumable Upload and Download are complete and green at development schema v21/history 001–021. Production remains unchanged at the closed PROD-08R v19 checkpoint. The next gate is the exact combined Linux x64 / Node 24 artifact, including the Tesseract packaging proof, before any production contact.**

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
- development schema is v21/history 001–021; migrations 001–020 remain byte-identical, migration 020 adds only immutable suggestion evidence provenance, and migration 021 adds only server-authoritative multipart transfer state;
- bounded local/offline OCR preserves native-text preference, the exact deduplicated first-15/last-5 window, manager review and RF-META CAS acceptance, Library-domain non-disclosure, and no raw OCR/page-image persistence;
- RF-TRANSFER01 preserves the provider-neutral storage boundary, uses an 8 MiB/640-part bounded multipart contract with CAS lifecycle, completed-part reuse, missing-part-only resume, exact abandonment, legacy compatibility, and browser-native Range downloads without backend large-file buffering;
- full backend 335/335, full frontend 211/211, both typechecks/builds, and compiled acceptance are green; migration, transfer, OCR, storage, HTTP, contribution, and byte-path focused suites are green;
- the PROD-08R exact PDF.js/canvas native runtime allowlist and ELF64 x86-64 verification boundary remain intact;
- the workflow now distinguishes structural deployment invariants from ordinary mutable business-state drift, while preserving migration, authorization, corruption, destructive-data, and backup/rollback gates;
- `tasks/done/PROD-08R.md`, `tasks/done/RF-FRONTMATTEROCR01.md`, and `tasks/done/RF-TRANSFER01.md` preserve bounded evidence; no task is currently Doing.

## Safety Boundaries

No production contact or mutation is authorized during the remaining development checkpoints. The later final production gate is bounded to the exact green combined artifact, exact pending migrations, fresh verified rollback backup, cutover, and changed-risk acceptance. Incident-database inspection, real permanent deletion, `PROD-03C2`, reboot/autostart, infrastructure-policy changes, credentials, paid infrastructure, main merge, RF-SEARCH01, whole-document extraction, full-text search, embeddings, retrieval, RAG, external metadata/catalogue lookup, web search, AI extraction, and unrelated work remain prohibited.

## Next Action

Build and independently verify the exact combined Linux x64 / Node 24 artifact from the RF-TRANSFER01 checkpoint, including deterministic archive/manifest identity, production-only dependency/native-runtime audits, and the exact release-local Tesseract 5.5.3/tessdata_fast 4.1.0 chi_sim/chi_tra/eng packaging proof. Do not contact production until both artifact jobs are green.
