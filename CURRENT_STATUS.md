# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**PROD-09A is PASS/CLOSED. Production runs exact immutable hotfix release `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`, previous release `9d2fc9b08e2e02c821ef357f149ed928510c2825`, at unchanged schema v21/history 001–021. The exact metadata-suggestion receiver regression and suggestion-specific internal-error leak are repaired; authenticated non-mutating production acceptance is green. STOP. RF-SEARCH01 remains parked until a new explicit Owner continuation.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

ADR-028 remains authoritative for permanent deletion: only the authenticated global `owner` may permanently delete eligible recycled account or Library resources; Library exclusivity is revalidated at the destructive transaction boundary; concurrent/shared state fails closed with storage and unrelated lineage untouched. PROD-09 preserved this PROD-07B behavior.

## Production Truth

```text
PRODUCTION=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
PREVIOUS_RELEASE=9d2fc9b08e2e02c821ef357f149ed928510c2825
PRODUCTION_SCHEMA=v21 / migrations 001–021
PROD09A_CLOSED=true
RF_METASUGGEST_DEPLOYED=true
L1_UX07_DEPLOYED=true
OCR_DEPLOYED=true
RF_TRANSFER_DEPLOYED=true
ROLLBACK_USED=false
```

- migration history and repository checksums are exact 001–021; exactly migrations 020 and 021 were applied once, with SHA-256 `1a6d363d4ff5dd4325adfaac0b54ce64c8c071c0788ac45f98827504d22887eb` and `67b4699cbfae349c7397223fea9d3eaf36aacdcd9e0cec2daef9c4e130e7f01f` respectively;
- SQLite integrity is `ok` and foreign-key violations are zero;
- the service is active with autostart disabled, `NRestarts=0`, and exactly one API listener at `127.0.0.1:3000`;
- loopback/public health is `ok` and readiness is `ready`;
- the running process is rooted in exact immutable release `a5e2bc21…`, and public assets match that release byte-for-byte;
- Tesseract 5.5.3 and exact `tessdata_fast` 4.1.0 languages `chi_sim`, `chi_tra`, and `eng` run from the immutable release without network access or production path overrides;
- RF-METASUGGEST01, L1-UX07, RF-FRONTMATTEROCR01, and RF-TRANSFER01 are deployed; PROD-07B account/Library destructive-lifecycle behavior and PROD-08R PDF.js/canvas repair are preserved;
- the Aliyun adapter supports true multipart upload/resume and the download path supports HTTP Range resume; unauthorized suggestion, multipart-status/resume, and Range probes fail closed with 401;
- no systemd, Nginx, DNS, TLS, firewall, autostart, CSP, certificate, credential, or other infrastructure policy was changed.

The immediate PROD-09A rollback is application-only because the hotfix ran no migration:

- application `9d2fc9b08e2e02c821ef357f149ed928510c2825` against the unchanged live v21 database.

The older deep rollback remains inseparable:

- application `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`;
- fresh schema-v19 backup `academiccloud-pre-prod09-20260819T061155Z.sqlite`, SHA-256 `21af5882483c21cfa65854fa592a7805b029b4f31c06c598114d161412c36436`;
- encrypted off-host backup verified in private commit `702695ee9bfd65ee69c2f8cb6c8f105bd4320755`.

Never select `f62766c…` against the live v21 database; restore the paired v19 backup as part of any separately authorized deep rollback. PROD-09A and PROD-09 rollback guards were not used. PROD-08R's earlier rollback usage remains historical evidence only.

## Artifact and Acceptance Evidence

- PROD-09A workflow `32234343552` passed on exact source `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`; the primary job and fresh-runner independent artifact download/runtime verification are green. The first independent attempt was cancelled without a runner or executed step and was rerun against the same uploaded bundle;
- deterministic archive SHA-256 is `0fe94a30d9ba77810c822c6f5a9ee7c5f4f41dacdcd8ffe5678b7db553d6b7a2`; manifest SHA-256 is `ec1b4d14f13e76f001166c124e9838776ffe3eaa01664c71e53520e0542ec1c4`; runtime-evidence SHA-256 is `1c15752aa7bfc43b80f57c009bf40b474aa2dd129668b3e52511afbf94399936`; the manifest contains 5,384 files / 125,820,107 bytes;
- Actions artifact `9358788301`, `academiccloud-linux-x64-node24-a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`, has bundle digest `sha256:ea3549fe6fd3f08210a2e109c8b7c696324e7a06323e285b1914ee06e8b0e924` and was independently downloaded and verified without rebuilding;
- same-path reproducibility, extracted Linux x64 runtime checks, Tesseract 5.5.3 exact closure/models/offline synthetic probe, PDF.js/canvas, Argon2id, better-sqlite3, and compiled acceptance all passed;
- no migration command ran and no new backup was required for the same-schema application-only rollback boundary;
- post-cutover release/schema/history/checksums, integrity/FK, health/readiness, process identity, public assets, OCR runtime, transfer routes, Range semantics, protected hashes, and absence of new app/OOM/cgroup events all passed;
- authenticated bounded suggestion generation completed with one bodyless POST returning 200 and an expected `unsupported` run. The `.anonymous` crash, raw internal error, and error alert were absent; no candidate was selected or accepted; canonical metadata remained unchanged; no sensitive resource identity/content was retained in evidence;
- the exact staging directory was removed and final live health/readiness remained green.

## Development Truth

- `codex/project-memory-reconcile-20260817` remains the single authoritative non-main line;
- RF-FRONTMATTEROCR01 checkpoint `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427` was integrated non-destructively after exact PROD-08R evidence checkpoint `497f55a648a7d819e5e01909920781e66506c731`;
- development schema is v21/history 001–021; migrations 001–020 remain byte-identical, migration 020 adds only immutable suggestion evidence provenance, and migration 021 adds only server-authoritative multipart transfer state;
- bounded local/offline OCR preserves native-text preference, the exact deduplicated first-15/last-5 window, manager review and RF-META CAS acceptance, Library-domain non-disclosure, and no raw OCR/page-image persistence;
- RF-TRANSFER01 preserves the provider-neutral storage boundary, uses an 8 MiB/640-part bounded multipart contract with CAS lifecycle, completed-part reuse, missing-part-only resume, exact abandonment, legacy compatibility, and browser-native Range downloads without backend large-file buffering;
- repository implementation, focused OCR/transfer/catalogue suites, both typechecks/builds, compiled acceptance, final artifact verification, and bounded production acceptance are green;
- the PROD-08R exact PDF.js/canvas native runtime allowlist and ELF64 x86-64 verification boundary remain intact;
- the workflow now distinguishes structural deployment invariants from ordinary mutable business-state drift, while preserving migration, authorization, corruption, destructive-data, and backup/rollback gates;
- completed task cards under `tasks/done/` preserve the bounded evidence, including PROD-09A's exact hotfix source/artifact/deployment and PROD-09's deeper rollback pair.

## Safety Boundaries

PROD-09A authority is exhausted. No further production contact, mutation, migration, deployment, or product task is authorized. Broad database or unrelated resource inspection, real permanent deletion, `PROD-03C2`, reboot/autostart, infrastructure-policy changes, credentials, paid infrastructure, main merge, RF-SEARCH01, remaining Pre-OCR cards, whole-document extraction, full-text search/indexing, embeddings, retrieval, RAG, external metadata/catalogue lookup, web search, AI extraction, and unrelated work remain parked or prohibited.

## Next Action

STOP. Resume RF-SEARCH01 only after Owner review and new explicit authorization.
