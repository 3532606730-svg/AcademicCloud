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
Implementation complete and independently green in isolated worktree `D:\Projects\AcademicCloud-ocr` on branch `codex/rf-frontmatterocr01-20260819`, which began exactly at development commit `35d03dd350d874cb43e85e4fc4cd3b22ee5abd89`. Development schema on this isolated branch is v20/history 001–020; migration 020 and RF-FRONTMATTEROCR01 remain development-only and undeployed. Implementation checkpoint `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427` is published on the temporary task branch. The one authorized post-push state check found `PROD-08R` active on authoritative branch head `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, so integration and authoritative current-state reconciliation are intentionally blocked until that separate deployment session has published final durable truth and stopped.

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

## Remaining
- After the separate `PROD-08R` deployment session has completed, published final durable production truth, and reached STOP, reconcile this isolated implementation non-destructively with the newest authoritative development line.
- Only then rerun merge-affected verification and finalize `tasks/done/RF-FRONTMATTEROCR01.md`, `CURRENT_STATUS.md`, `TASK_BOARD.md`, and the high-level `ROADMAP.md` result. Do not start RF-SEARCH01.

## Blockers
`PROD-08R — v19 Production Artifact Runtime Repair and Release Resume` is active in durable repository state at authoritative head `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`. The task instruction prohibits merge/rebase and current-state finalization while that session is active. This is not an implementation blocker; the safe isolated checkpoint is published.

## Last Verification
- Isolation: task branch initial HEAD, merge-base, and authorized base were all `35d03dd350d874cb43e85e4fc4cd3b22ee5abd89`; requested worktree/branch were absent before creation.
- Full backend suite: 318/318 passing, including suggestions, metadata/CAS, authorization/non-disclosure, migrations, storage, account/Library lifecycle, Favorites, Recycle, permanent-delete safety, and exact synthetic-fixture suppression.
- Full frontend suite: 193/193 passing; final focused suggestion/API/details rerun: 33/33 passing.
- Focused OCR/suggestion/metadata/storage/migration verification: 60/60 passing before the final full-suite pass; the final OCR/suggestion/provenance rerun after bounded text streaming was 43/43 passing.
- Backend and frontend typechecks passing.
- Backend and frontend production builds passing.
- Compiled acceptance passing with `firstMigrationCount: 20`, restart/readiness, backup/restore, canonical metadata, and `redeployMigrationCount: 0` green.
- `git diff --check` clean. Static review found no OCR network/cloud call, upload/approval/background hook, whole-document traversal, search/index/embedding/RAG path, raw OCR/page-image persistence, migration beyond 020, production contact, or current-state/deployment evidence edit.
- No production endpoint, credential, database, OSS object, release, backup, deployment artifact, or real academic document was contacted, inspected, or changed.
- Git implementation checkpoint `bcd8211c0b0a091ec8ff3b8f674eaf2c9be72427` was pushed to `origin/codex/rf-frontmatterocr01-20260819` and local/remote task heads matched at the checkpoint.
- One post-push repository-only state check fetched origin and found authoritative head `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`; its durable `CURRENT_STATUS.md` explicitly says `PROD-08R` is active. No production system was contacted, and no repeated polling was performed.

## Next Action
STOP after publishing this task-local waiting-state note. Do not merge/rebase, finalize `CURRENT_STATUS.md`/`TASK_BOARD.md`/`ROADMAP.md`, contact production, or poll the deployment session repeatedly. Resume only after the separate deployment session has completed and reached STOP.
