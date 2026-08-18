# RF-FRONTMATTEROCR01 — Bounded Front-Matter OCR

## Task ID
RF-FRONTMATTEROCR01 — Bounded Front-Matter OCR

## Goal
Extend RF-METASUGGEST01 so scanned or image-only PDF front matter can produce the same bounded, reviewable bibliographic suggestions through local/offline OCR without changing canonical metadata automatically.

## Scope
- Preserve the exact deduplicated first-15/last-5 page window.
- Prefer usable native PDF text per page and OCR only selected pages whose native text is unusable.
- Render and recognize sequentially through provider-neutral PDF/OCR boundaries with explicit object, page, pixel, bitmap, text, timeout, cancellation, and request-concurrency limits.
- Use an ephemeral local Tesseract 5.5.3 CLI adapter with pinned `tessdata_fast` 4.1.0 `chi_sim`, `chi_tra`, and `eng` deployment data; no network OCR or resident worker.
- Persist only bounded candidate evidence with truthful native/OCR origin, stable engine provenance, and bounded OCR confidence.
- Keep manager-only generation/acceptance, Member read-only review, Library-domain non-disclosure, and RF-META01 CAS acceptance unchanged.
- Integrate understandable OCR/page provenance into normal `资料详情`.

## Non-goals
- Production contact, deployment, migration, backup, or real production OCR.
- Whole-document/body OCR, automatic OCR on upload/approval, background jobs, corpus sweeps, extracted-text storage, search/indexing, embeddings, RAG, AI/LLM extraction, external catalogue/ISBN lookup, or cloud OCR.
- Raw OCR page-text or rendered-image persistence, modified PDF copies, object-byte changes, lifecycle changes, migration 021, or main merge.

## Acceptance Criteria
- Native-text pages bypass OCR; only unusable selected pages are rendered and OCRed.
- The first-15/last-5 window is exact, overlap is deduplicated, and pages outside it are never rendered or recognized.
- Local OCR supports bounded Chinese and English/Latin evidence; low-confidence, empty, unsupported-script, unavailable-engine, malformed-PDF, render, dimension/pixel, output, timeout, cancellation, and capacity failures fail closed without fake successful evidence.
- OCR candidate serialization retains page, evidence origin, stable adapter/engine identity, and bounded confidence; native text retains higher preference for the page by bypassing OCR.
- No raw page text/images, PDF bytes, object keys, or private overlays are persisted or logged.
- Canonical metadata remains unchanged until an effective Library manager explicitly accepts through the existing RF-META01 CAS path; source/version/authority revalidation remains intact.
- Member and cross-domain/guessed-ID non-disclosure behavior remains intact; no automatic/background/network OCR path exists.
- Existing RF-METASUGGEST01 and relevant L1-UX07 catalogue/lifecycle behavior remain green.

## Relevant ADRs
- ADR-014 — privacy/ownership/research-activity boundaries.
- ADR-022 — canonical shared Library and private overlays.
- ADR-025 — bounded front-matter evidence and OCR boundary.
- ADR-026 — canonical metadata destination and CAS.
- ADR-027 — bounded suggestion implementation, amended for local OCR provenance and limits.
- ADR-028 — permanent-delete authority and domain safety (unchanged).

## Relevant Modules / Files
- `backend/src/suggestions/suggestion.ts`
- `backend/src/suggestions/pdf-text.ts`
- `backend/src/suggestions/ocr.ts`
- `backend/src/suggestions/extractor.ts`
- `backend/src/suggestions/suggestion-service.ts`
- `backend/src/persistence/sqlite/suggestion-repository.ts`
- `database/migrations/020_suggestion_evidence_provenance.sql`
- focused backend/frontend suggestion, migration, authority, and catalogue tests
- `frontend/src/api.ts`, `frontend/src/resource-details.tsx`, and i18n

## Current State
Complete. Implementation checkpoint `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427` from isolated branch `codex/rf-frontmatterocr01-20260819` was integrated non-destructively onto authoritative PROD-08R evidence checkpoint `497f55a648a7d819e5e01909920781e66506c731` as `469b5982bec8a3dbc0b0dc75b38f4dc7d8b00440`. Development is schema v20/history 001–020 while production remains unchanged at exact release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, schema v19/history 001–019.

## Completed
- Proved the isolated branch/worktree begins exactly at the authorized base and is clean.
- Recovered RF-META01, RF-METASUGGEST01, migration 019, storage, authorization, UI, ADR-022/025/027/028, and L1-UX07 boundaries.
- Determined migration 020 is necessary because migration 019 cannot truthfully retain native-vs-OCR origin, OCR engine identity, or OCR confidence.
- Selected an ephemeral local Tesseract CLI plus PDF.js canvas-rendering design with no runtime downloads, network service, persistent worker, page-image persistence, or raw OCR-text persistence.
- Added exact `@napi-rs/canvas` 1.0.7 rendering and a provider-neutral local Tesseract CLI adapter pinned to Tesseract 5.5.3 with the later deployment contract pinned to `tessdata_fast` 4.1.0 `chi_sim`, `chi_tra`, and `eng`. The adapter verifies the actual engine version/language IDs and fails closed when unavailable or mismatched.
- Added a two-pass PDF.js inspector: the original five-second bounded text stream covers exactly the deduplicated first 15/last 5 pages, usable native pages bypass OCR, and only unusable selected pages render/recognize sequentially under dimension, pixel, bitmap, encoded-image, output, per-page, total-request, cancellation, and single-request limits.
- Added migration 020 with immutable prospective `evidence_origin`, `ocr_engine`, and integer 0–100 `ocr_confidence`. Existing v19 evidence retains the truthful `legacy_v1` storage marker and maps deterministically from its original source type; new evidence cannot use that marker.
- Propagated native/OCR/embedded/filename provenance through the existing classifier/extractor, persistence/API serialization, and ordinary `资料详情`; OCR confidence below 55 or unsupported script is unusable, and otherwise-high OCR candidates are capped at medium bibliographic confidence.
- Preserved manager-only generation/acceptance, Member read-only access, exact Library-domain non-disclosure, post-inspection authority/source revalidation, RF-META01 CAS acceptance, original bytes/identity/provenance/private overlays, and L1-UX07 account/Library lifecycle behavior.
- Added deterministic synthetic PDF/render/adapter/provenance/migration/UI tests for native bypass, image-only and mixed fallback, exact page windows, malformed/oversized input, pixel allocation guards, engine/language/timeout/output/cancellation/capacity failures, Chinese/English evidence, unsupported scripts, confidence, immutable retention, stale sources, authorization changes, and no raw page-text/image persistence.
- Preserved the PROD-08R PDF.js runtime repair: `pdfjs-dist@6.2.108`, `@napi-rs/canvas@1.0.7`, and only `node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node` as the additional PDF.js native file inside the exact ELF64 x86-64 allowlist.
- Reconciled ADR-025/ADR-027 and the authoritative project-state files without authorizing whole-document OCR, search/indexing, external lookup, AI extraction, or premature production contact.

## Remaining
None for RF-FRONTMATTEROCR01 development. The pinned Tesseract/tessdata production packaging proof remains a gate of the later authorized final combined artifact/deployment, not unfinished development behavior in this task.

## Blockers
None.

## Last Verification
- Isolation: task branch initial HEAD, merge-base, and authorized base were all `35d03dd350d874cb43e85e4fc4cd3b22ee5abd89`; requested worktree/branch were absent before creation.
- Integration ancestry: authoritative base/HEAD/upstream/remote matched `497f55a648a7d819e5e01909920781e66506c731`; OCR source branch matched `96084d1fb942ec88977d21fb79e550c67ecdb7d6`; implementation checkpoint matched `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427`; only the implementation checkpoint was cherry-picked because the source tip contained an obsolete wait-state note.
- Full backend suite: 322/322 passing, including OCR, suggestions, metadata/CAS, authorization/non-disclosure, migrations, storage, account/Library lifecycle, Favorites, Recycle, permanent-delete safety, exact synthetic-fixture suppression, and PROD-08R artifact-runtime checks.
- Full frontend suite: 193/193 passing; final focused suggestion/API/details rerun: 33/33 passing.
- Focused integrated OCR/PDF/suggestion/provenance/artifact verification: 30/30 backend passing; focused suggestion/API/details verification: 33/33 frontend passing.
- Backend and frontend typechecks passing.
- Backend and frontend production builds passing.
- Compiled acceptance passing with `firstMigrationCount: 20`, restart/readiness, backup/restore, canonical metadata, and `redeployMigrationCount: 0` green.
- Migrations 001–019 are byte-unchanged; migration 020 is the only appended migration. `git diff --check` is clean. Static review found no OCR network/cloud call, upload/approval/background hook, whole-document traversal, search/index/embedding/RAG path, raw OCR/page-image persistence, migration beyond 020, or production contact.
- GitHub Actions workflow `32177558840` passed for exact closure source `a7b974e0d31d0ece3a623b40a062baa845df30b0`: Linux x64 / Node 24 job `95842863911` and independent fresh-runner download/verification job `95843592236` both succeeded. The release archive SHA-256 is `aa0e7cf6f158bb0bc8fde65c7a300d9efe9474de23e216e585e98c5b6ed14149`; manifest SHA-256 is `438afe7b80685c1878e09d74bbd81dc27e29873e2aafb40fb9281739d9419029`. Extracted runtime verification proved schema count 20, the exact three-file ELF64 x86-64 native set, PDF.js 6.2.108, canvas 1.0.7, health/readiness, and zero redeploy migrations.
- No production endpoint, credential, database, OSS object, release, backup, deployment artifact, or real academic document was contacted, inspected, or changed.

```text
TASK=RF-FRONTMATTEROCR01
VERDICT=PASS/CLOSED
AUTHORITATIVE_BASE=497f55a648a7d819e5e01909920781e66506c731
OCR_SOURCE_BRANCH=codex/rf-frontmatterocr01-20260819
OCR_SOURCE_CHECKPOINT=bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427
INTEGRATED_HEAD=469b5982bec8a3dbc0b0dc75b38f4dc7d8b00440
SCHEMA=v20
MIGRATIONS=001-020; 001-019 byte-identical; 020 appended
OCR_LOCAL_ONLY=true
NATIVE_TEXT_PREFERRED=true
OCR_FALLBACK_ONLY=true
PAGE_WINDOW=exact deduplicated first-15/last-5
PROVENANCE_MIGRATION=020_suggestion_evidence_provenance.sql
TESSERACT_VERSION=5.5.3 pinned adapter contract
TESSDATA_VERSION=tessdata_fast 4.1.0 pinned deployment contract
OCR_LANGUAGES=chi_sim,chi_tra,eng
PDFJS_CANVAS_RUNTIME_PRESERVED=true
TESTS=backend 322/322; frontend 193/193; focused backend 30/30; focused frontend 33/33
TYPECHECK=backend PASS; frontend PASS
BUILDS=backend production PASS; frontend production PASS
COMPILED_ACCEPTANCE=PASS; firstMigrationCount=20; redeployMigrationCount=0
ARTIFACT_RUNTIME=PASS; workflow 32177558840; jobs 95842863911/95843592236; archive aa0e7cf6f158bb0bc8fde65c7a300d9efe9474de23e216e585e98c5b6ed14149; manifest 438afe7b80685c1878e09d74bbd81dc27e29873e2aafb40fb9281739d9419029
PRODUCTION_TOUCHED=false
REMOTE_SYNCHRONIZED=true; closure checkpoint a7b974e0d31d0ece3a623b40a062baa845df30b0 matched origin after fetch
LOCAL_SYNCHRONIZED=true; closure checkpoint a7b974e0d31d0ece3a623b40a062baa845df30b0 matched tracking/remote
NEXT=RF-TRANSFER01
```

## Next Action
RF-FRONTMATTEROCR01 is closed. Proceed to RF-TRANSFER01 after the separately checkpointed workflow proportionality clarification. Do not contact production.
