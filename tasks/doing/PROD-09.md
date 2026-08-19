# PROD-09 — Final Combined OCR and Transfer Release

## Task ID
PROD-09 — Final Combined OCR and Transfer Release

## Goal
Produce an independently verified immutable Linux x64 / Node 24 artifact with a release-local Tesseract 5.5.3 runtime, then deploy the exact combined schema-v21 application through the bounded Owner-authorized production gate and reconcile final evidence before stopping.

## Scope
- Build exact official Tesseract 5.5.3 source in controlled Linux x86_64 CI and package its audited minimum release-local runtime dependency closure.
- Package exact official `tessdata_fast` 4.1.0 `eng`, `chi_sim`, and `chi_tra` models with pinned file hashes and upstream notices.
- Make AcademicCloud invoke the release-local OCR runtime with child-scoped library/model paths.
- Extend manifest, artifact policy, extracted runtime probes, deterministic archive checks, and independent fresh-runner verification without weakening the existing PDF.js/canvas/argon2/better-sqlite3 boundary.
- Only after both artifact jobs pass, run the authorized bounded production preflight, fresh verified encrypted off-host schema-v19 backup, exact migrations 020–021, immutable cutover, changed-risk OCR/transfer/Range acceptance, and durable evidence reconciliation.

## Non-goals
- System-wide Tesseract or package installation on production; host-library replacement; global environment changes; daemon/service creation; cloud OCR; runtime downloads; paid services; unrelated infrastructure changes.
- RF-SEARCH01, whole-document extraction, indexing/search, embeddings/retrieval/RAG, main merge, incident-database inspection, real permanent deletion/PROD-03C2, reboot/autostart, credentials, DNS/TLS/firewall changes, or unrelated OSS/data cleanup.

## Acceptance Criteria
- Source tag/commit/archive and builder/toolchain/build dependency identities are exact and recorded; unpinned or unresolved inputs fail closed.
- The release-local runtime contains only the bounded executable/library/model/notice set; every packaged file has manifest SHA-256 and every ELF is Linux x86-64 with an exact resolved closure and no CI workspace dependency.
- Extracted artifact reports Tesseract 5.5.3, discovers exact `eng`, `chi_sim`, `chi_tra` model hashes, passes a deterministic synthetic OCR probe offline, and preserves PDF.js/canvas/argon2/better-sqlite3 and compiled acceptance.
- The production artifact archive and manifest are deterministic across two clean builds, and the independent fresh runner redownloads and repeats runtime verification without rebuilding or downloading OCR components.
- Production remains untouched until both artifact jobs are green. Preflight proves exact `f62766c…`/v19/001–019 structural state before mutation.
- Writes are frozen before a fresh verified schema-v19 backup; only encrypted backup plus non-secret evidence is published and independently hash-verified off-host.
- Exactly migrations 020 and 021 apply once; integrity/FK/history/checksums remain exact; immutable release cutover, OCR/transfer/Range/health/readiness acceptance pass without arbitrary real-document OCR or destructive pre-existing targets.
- Final task/status/board/roadmap/AGENTS/runbook evidence is reconciled, pushed, and local/tracking/remote state is verified clean; then STOP.

## Relevant ADRs
- ADR-023 — durable decision reconciliation and synchronization.
- ADR-027 — bounded bibliographic suggestion implementation and local OCR amendment.
- ADR-029 — provider-backed multipart transfer and browser-native Range resume.
- ADR-030 — release-local Tesseract runtime.

## Relevant Modules / Files
- `.github/workflows/production-build.yml`
- `scripts/production-artifact.mjs` and bounded Tesseract build/runtime helpers
- `backend/src/suggestions/ocr.ts`
- `backend/test/deployment/artifacts.test.ts` and OCR/artifact tests
- `deployment/env/academiccloud.env.example`
- `docs/deployment/production-runbook.md`
- authoritative project/task/evidence records

## Current State
Active on authoritative branch `codex/project-memory-reconcile-20260817`. Release-local Tesseract implementation checkpoint `85227a28733c90f7874528e7dccd93d1b518ff1d` and post-cleanup checkpoint `776188e17642af709be496350030c1781b781881` remain intact. Owner-paused pre-cleanup artifact run `32212570141` was cancelled before finalization/upload. First post-cleanup run `32213527270` failed closed on the missing minimal-builder CA bootstrap. Repair run `32213936555` then built exact Tesseract 5.5.3 and discovered the verifier's direct `Array.map(basename)` callback incorrectly supplied the array index as `basename`'s suffix; this checkpoint uses an explicit one-argument callback and keeps every closure check intact. RF-FRONTMATTEROCR01 and RF-TRANSFER01 remain closed at schema v21/history 001–021. Production remains untouched at exact `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, schema v19/history 001–019.

## Completed
- Owner authorized the exact release-local Tesseract build/package/deployment boundary.
- Recovered the existing artifact/runtime repair, task state, production truth, and final continuous-objective boundary.
- Reconciled and published ADR-030/task activation at checkpoint `3f54bc843f872107091e9b9d503ebd2599e9b702` with local/tracking/remote equality.
- Added a digest-pinned Ubuntu 24.04 amd64 builder, fixed Ubuntu archive snapshot, exact signed-tag/commit/archive/model identities and hashes, bounded source build, release-local dynamic dependency closure, upstream/package notices, and deterministic build evidence.
- Made production OCR resolve only the release-local binary/models/libraries with child-scoped environment and reject production path overrides.
- Extended artifact manifest/runtime verification for ELF64 x86-64, readelf/ldd closure, no CI workspace resolution, exact models, offline synthetic OCR, two clean-build reproducibility, and independent fresh-runner re-verification while retaining PDF.js/canvas/argon2/better-sqlite3 checks.
- Cancelled pre-cleanup run `32212570141` against old source `85227a2…` before it finalized or uploaded an artifact; its independent job did not run.
- Replaced zh-CN/English implementation-facing UI copy with shared user states and actionable localized errors, preserving pause/continue/reselect/abandon behavior, destructive warnings, accessibility names, and transfer implementation compatibility without changing schema, APIs, or OCR runtime work.
- Diagnosed post-cleanup run `32213527270` as a missing builder CA bootstrap, retained the fixed image/snapshot/source/model identities, and added a snapshot-signed one-time CA bootstrap followed by a clean certificate-verified snapshot refresh.
- Proved the repaired snapshot path and complete pinned Tesseract source build in run `32213936555`, then repaired the manifest verifier's `Array.map` callback without weakening dynamic-closure validation.

## Remaining
- Produce two green artifact jobs from the exact post-cleanup source commit containing this record; do not reuse or resume run `32212570141`.
- Execute bounded production preflight/backup/migrations/cutover/acceptance only after the artifact gate.
- Reconcile/publish final evidence and stop.

## Blockers
None. Ordinary build/link/package details are authorized; any inability to produce a deterministic independently verifiable closure fails the artifact gate before production.

## Last Verification
- RF-TRANSFER01 checkpoint `6491022a7e3da11278a30fed809c55dd235beee0`: backend 335/335, frontend 211/211, both typechecks/builds, compiled acceptance, migration head 21, and diff check PASS.
- Publication evidence checkpoint `f02930748fc488f09336ec043561f0c3989adac8`: local/tracking/remote equal and clean.
- Local implementation verification: backend 337/337 PASS; backend typecheck/build PASS; build shell syntax, Node syntax, and `git diff --check` PASS. Linux runtime build/ELF/determinism evidence remains pending the exact CI jobs.
- Pre-cleanup artifact run `32212570141`: cancelled on exact `85227a28733c90f7874528e7dccd93d1b518ff1d` during release-local Tesseract build; release finalization/archive/reproducibility/extracted verification/upload skipped and independent verification not started.
- Bounded UI cleanup: frontend 212/212 PASS; focused copy/transfer/error tests 160/160 PASS plus final direct-upload/i18n focus 33/33 PASS; frontend typecheck and production build PASS; `git diff --check` PASS.
- Post-cleanup artifact run `32213527270` on exact `776188e17642af709be496350030c1781b781881`: tests/typechecks/builds/compiled acceptance/audits/Argon2/package preparation PASS; Tesseract build failed at the first snapshot package fetch; finalization/archive/reproducibility/extracted verification/upload skipped and independent verification skipped; production untouched.
- Builder CA-bootstrap repair: backend 337/337 PASS including artifact policy; build script syntax PASS; `git diff --check` PASS. Real Linux snapshot/build/closure evidence remains pending a fresh exact CI run.
- Builder repair run `32213936555` on exact `47a91083174d33df948ae92bd35737b0e15e545d`: prerequisites and full pinned Tesseract build PASS; manifest finalization failed on the verifier callback before archive/upload; independent job skipped; production untouched.
- Verifier callback repair: deployment-artifact tests 6/6 PASS; Node syntax and `git diff --check` PASS. Full finalization/closure/reproducibility/extracted runtime evidence remains pending a fresh exact CI run.
- Production touched: false.

## Next Action
Publish the exact verifier-repair checkpoint containing this record, verify local/tracking/remote equality, then dispatch a fresh two-job GitHub Actions gate from that new HEAD. Repair only artifact-gate failures; do not contact production until both jobs pass.
