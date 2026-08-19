# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**PROD-09A is the sole active Owner-authorized bounded production hotfix for the real metadata-suggestion `.anonymous` regression. Production is expected to remain on exact PROD-09 release `9d2fc9b08e2e02c821ef357f149ed928510c2825` at schema v21/history 001–021 until a new exact green Linux x64 / Node 24 artifact is ready. Diagnose from the exact request/stack, fix the narrow root cause and suggestion-specific raw-error leak, deploy with no migrations, run bounded non-mutating acceptance, reconcile evidence, then STOP. RF-SEARCH01 remains parked.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

ADR-028 remains authoritative for permanent deletion: only the authenticated global `owner` may permanently delete eligible recycled account or Library resources; Library exclusivity is revalidated at the destructive transaction boundary; concurrent/shared state fails closed with storage and unrelated lineage untouched. PROD-09 preserved this PROD-07B behavior.

## Production Truth

```text
PRODUCTION=9d2fc9b08e2e02c821ef357f149ed928510c2825
PREVIOUS_RELEASE=f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7
PRODUCTION_SCHEMA=v21 / migrations 001–021
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
- the running process is rooted in exact immutable release `9d2fc9b…`, and public assets match that release byte-for-byte;
- Tesseract 5.5.3 and exact `tessdata_fast` 4.1.0 languages `chi_sim`, `chi_tra`, and `eng` run from the immutable release without network access or production path overrides;
- RF-METASUGGEST01, L1-UX07, RF-FRONTMATTEROCR01, and RF-TRANSFER01 are deployed; PROD-07B account/Library destructive-lifecycle behavior and PROD-08R PDF.js/canvas repair are preserved;
- the Aliyun adapter supports true multipart upload/resume and the download path supports HTTP Range resume; unauthorized suggestion, multipart-status/resume, and Range probes fail closed with 401;
- no systemd, Nginx, DNS, TLS, firewall, autostart, CSP, certificate, credential, or other infrastructure policy was changed.

The current rollback pair is inseparable:

- application `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`;
- fresh schema-v19 backup `academiccloud-pre-prod09-20260819T061155Z.sqlite`, SHA-256 `21af5882483c21cfa65854fa592a7805b029b4f31c06c598114d161412c36436`;
- encrypted off-host backup verified in private commit `702695ee9bfd65ee69c2f8cb6c8f105bd4320755`.

Never select `f62766c…` against the live v21 database; restore the paired v19 backup as part of any authorized rollback. The PROD-09 rollback guard was not used. PROD-08R's earlier rollback usage remains historical evidence only.

## Artifact and Acceptance Evidence

- final PROD-09 workflow `32218607374` passed on exact source `9d2fc9b08e2e02c821ef357f149ed928510c2825`: primary job `95964718499` and independent fresh-runner job `95966983161` are green;
- the deterministic archive SHA-256 is `91d9493938ca4611baa1132acea6e051aa96eec5995962ef48f9ba0a47957ddd`; manifest SHA-256 is `03eeb5c95803152a46a7ebc2ade63c1429bf5833cb26169d6afda36ed194d4bf`; the manifest contains 5,384 files / 125,816,418 bytes;
- Actions artifact `9353425023`, `academiccloud-linux-x64-node24-9d2fc9b08e2e02c821ef357f149ed928510c2825`, has bundle digest `sha256:90ecb9bd837532d99008f1fb09d0a01ec7fdcab86cde24624e8988a84af762ba` and was independently downloaded and verified without rebuilding;
- same-path reproducibility, extracted Linux x64 runtime checks, Tesseract 5.5.3 exact closure/models/offline synthetic probe, PDF.js/canvas, Argon2id, better-sqlite3, and compiled acceptance all passed;
- the fresh v19 backup receipt, encrypted database, and non-secret manifest were independently fetched and rehashed from the private off-host repository; no plaintext SQLite file was published;
- post-cutover release/schema/history/checksums, integrity/FK, health/readiness, process identity, public assets, OCR runtime, transfer routes, Range semantics, protected hashes, and absence of new app/OOM/cgroup events all passed;
- authenticated destructive acceptance was skipped safely because the deployment created no run-owned target; no pre-existing scholarly resource was used and no task-owned product residue remains.

## Development Truth

- `codex/project-memory-reconcile-20260817` remains the single authoritative non-main line;
- RF-FRONTMATTEROCR01 checkpoint `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427` was integrated non-destructively after exact PROD-08R evidence checkpoint `497f55a648a7d819e5e01909920781e66506c731`;
- development schema is v21/history 001–021; migrations 001–020 remain byte-identical, migration 020 adds only immutable suggestion evidence provenance, and migration 021 adds only server-authoritative multipart transfer state;
- bounded local/offline OCR preserves native-text preference, the exact deduplicated first-15/last-5 window, manager review and RF-META CAS acceptance, Library-domain non-disclosure, and no raw OCR/page-image persistence;
- RF-TRANSFER01 preserves the provider-neutral storage boundary, uses an 8 MiB/640-part bounded multipart contract with CAS lifecycle, completed-part reuse, missing-part-only resume, exact abandonment, legacy compatibility, and browser-native Range downloads without backend large-file buffering;
- repository implementation, focused OCR/transfer/catalogue suites, both typechecks/builds, compiled acceptance, final artifact verification, and bounded production acceptance are green;
- the PROD-08R exact PDF.js/canvas native runtime allowlist and ELF64 x86-64 verification boundary remain intact;
- the workflow now distinguishes structural deployment invariants from ordinary mutable business-state drift, while preserving migration, authorization, corruption, destructive-data, and backup/rollback gates;
- completed task cards under `tasks/done/` preserve the bounded evidence, including PROD-09's exact deployment source and rollback pair.

## Safety Boundaries

PROD-09A authorizes only request-specific production diagnostics, the bounded hotfix/artifact/deployment path, and non-mutating acceptance described in `tasks/doing/PROD-09A.md`. Broad database or unrelated resource inspection, real permanent deletion, `PROD-03C2`, reboot/autostart, infrastructure-policy changes, credentials, paid infrastructure, main merge, RF-SEARCH01, remaining Pre-OCR cards, whole-document extraction, full-text search/indexing, embeddings, retrieval, RAG, external metadata/catalogue lookup, web search, AI extraction, and unrelated work remain parked or prohibited.

## Next Action

Complete and close PROD-09A, publish and synchronize its exact evidence checkpoint, then STOP. Resume RF-SEARCH01 only after Owner review.
