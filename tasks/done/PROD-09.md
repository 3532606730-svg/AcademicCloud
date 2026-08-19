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
PASS/CLOSED on authoritative branch `codex/project-memory-reconcile-20260817`. Exact artifact source `9d2fc9b08e2e02c821ef357f149ed928510c2825` is deployed in production at schema v21/history 001–021. Release-local Tesseract 5.5.3 with exact `tessdata_fast` 4.1.0 `chi_sim`, `chi_tra`, and `eng`, bounded OCR metadata suggestions, true multipart upload/resume, and Range download resume are deployed. The post-cleanup checkpoint `776188e17642af709be496350030c1781b781881`, catalogue correction `beee119da5aee14fe9bf4adcd90f5f620875a6cf`, PROD-07B lifecycle behavior, RF-METASUGGEST01/L1-UX07, and the PROD-08R PDF.js/canvas runtime repair remain preserved. The previous release is `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`; the current rollback pair uses the fresh schema-v19 backup recorded below. PROD-09 rollback was not used.

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
- Cancelled artifact run `32214609923` against pre-correction source `c0d6a92…` before finalization/upload; its independent verification job did not execute and the run is non-final evidence.
- Added one shared active-holding API view model that projects ordered author authority labels without persistence or migration, plus one locale-aware frontend title helper used by the ordinary Library catalogue, Favorites, preview, and the matching recycle confirmation.
- Preserved structured Resource Details metadata, CAS writes, OCR suggestion acceptance, authority links, original/display filenames, upload/download behavior, Library authorization, Favorites privacy, recycle/permanent-delete lifecycle, and all migrations.
- Diagnosed post-correction run `32215516295` as an overbroad `ldd` path assertion after the exact Tesseract build passed; narrowed the verifier to distinguish the current packaged library directory from escaped CI/build dependencies and added a direct regression test.
- Diagnosed repair run `32216224956` as a reproducibility comparison across different absolute output roots after both builds/finalizations succeeded; changed the second clean build to reuse the exact emptied release path and made any future manifest delta visible without weakening archive/hash equality.
- Diagnosed run `32217258656` as anonymous GitHub API exhaustion after the pinned source archive hash passed; bound the existing ephemeral read-only Actions token only to exact tag-signature lookups with bounded retries and no persisted credential material.
- Diagnosed run `32217768105` as mounted-output ownership preventing the exact same-path cleanup after the authenticated first build/finalization/archive passed; create the artifact runtime parent as the runner and return only the bounded Tesseract output to the invoking non-root UID/GID after verification.
- Published source checkpoint `9d2fc9b08e2e02c821ef357f149ed928510c2825` with clean local/tracking/remote equality and reported that exact source before any production contact.
- Completed final workflow `32218607374`: primary deterministic build/extracted verification/upload and independent fresh-runner redownload/verification both passed with the exact identities recorded above.
- Completed the bounded production preflight against exact `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` / v19 / 001–019, distinguishing the three unchanged documented generic profile findings from the Owner-defined structural gate.
- Froze writes and created fresh rollback backup `academiccloud-pre-prod09-20260819T061155Z.sqlite`; published only its encrypted database plus non-secret receipt/manifest to the private off-host repository and independently rehashed all three remote blobs.
- Applied exactly migrations 020 and 021 once, verified exact 001–021 history/checksums, SQLite integrity `ok`, and zero foreign-key violations, then selected immutable release `9d2fc9b…`.
- Completed structural, OCR/runtime, transfer/Range, health/readiness, process/listener, protected-configuration, and no-new-error/OOM acceptance without arbitrary scholarly-document OCR, an authenticated production account, or destructive use of a pre-existing target.
- Removed exact remote staging directory `/var/tmp/academiccloud-prod09-SpQ2OJ70`, confirmed final live smoke, left no task-owned product residue, and did not change systemd/Nginx/CSP/DNS/TLS/firewall/autostart/credentials/host packages/system-wide OCR libraries/OSS data.

## Remaining
None.

## Blockers
None.

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
- Pre-correction artifact run `32214609923` on exact `c0d6a92b531a62c2f8ae19eff4a4a0b7f5319a9d`: cancelled during the pinned Tesseract build; manifest finalization/archive/reproducibility/extracted verification/upload skipped; independent verification did not run; production untouched.
- Catalogue correction: affected backend Library/Favorites/metadata/suggestion tests 24/24 PASS; focused frontend catalogue/metadata tests 13/13 PASS; backend and frontend typechecks PASS; frontend production build PASS; `git diff --check` PASS. The read model returns ordered author labels separately, the helper covers one/multiple/no-author/file-fallback cases in zh-CN and English, canonical edits remain title-only, and OCR suggestion acceptance does not concatenate author into `canonicalTitle`.
- Post-correction artifact run `32215516295` on exact `beee119da5aee14fe9bf4adcd90f5f620875a6cf`: repository tests/typechecks/builds/compiled acceptance/audits/package preparation PASS; exact pinned Tesseract 5.5.3 build and model discovery PASS; finalization failed on the overbroad workspace-path assertion; archive/reproducibility/extracted verification/upload skipped and independent verification skipped; production untouched.
- Release-local path repair: focused runtime regression 1/1 PASS; deployment-artifact policy 6/6 PASS; backend typecheck, Node syntax, package JSON parse, and `git diff --check` PASS. The repair still rejects unresolved dependencies, any non-baseline path outside the current packaged library directory, and baseline resolution into `/work/` or the fixed Tesseract build tree.
- Release-local path repair run `32216224956` on exact `e34634d340626d4d178176699d525284589d4e80`: full repository gates, exact Tesseract build, finalization, and first archive PASS; second clean Tesseract build/finalization PASS with the same 5,384-file count but a 105-byte aggregate size delta under the different longer output root; reproducibility failed closed before extracted verification/upload, independent verification skipped, and production untouched.
- Same-path reproducibility repair: deployment-artifact policy 6/6 PASS; backend typecheck and `git diff --check` PASS. Both clean builds now use the exact emptied `output/release` root; real manifest/archive equality remains pending a fresh exact CI run.
- Same-path run `32217258656` on exact `80b12c5667677445c052b289a1f00cdd2ed62dda`: repository tests/typechecks/builds/compiled acceptance/audits/package preparation PASS; pinned source archive downloaded and SHA-256 verified; unauthenticated pinned `tessdata_fast` tag-signature API request returned HTTP 403; build failed closed before compile/finalization/archive/upload, independent verification skipped, and production untouched.
- Authenticated tag-verification transport repair: deployment-artifact policy 6/6 PASS; backend typecheck, build-script shell syntax, and `git diff --check` PASS. Token use is ephemeral/read-only and limited to the two exact GitHub tag API requests; real transport and remaining artifact gates await fresh exact CI.
- Authenticated transport run `32217768105` on exact `912841397be5704cdef6fb294fb70385e6a5a20e`: repository gates, authenticated pinned tag verification, complete Tesseract build, finalization, and first archive PASS; same-path prepare failed with `EACCES` while deleting root-owned mounted builder output; second build/extracted verification/upload skipped, independent verification skipped, and production untouched.
- Bounded output-ownership repair: deployment-artifact policy 6/6 PASS; backend typecheck, build-script shell syntax, production-artifact Node syntax, and `git diff --check` PASS. The runner-owned parent plus exact recursive Tesseract-subtree handoff covers same-path deletion without host `sudo`, broad writable permissions, or archive-ownership changes; final run `32218607374` subsequently proved same-path cleanup and reproducibility.
- Final exact-source artifact run `32218607374` on `9d2fc9b08e2e02c821ef357f149ed928510c2825`: primary job `95964718499` PASS; independent job `95966983161` PASS; identical first/rebuild archive SHA-256 `91d9493938ca4611baa1132acea6e051aa96eec5995962ef48f9ba0a47957ddd`; manifest SHA-256 `03eeb5c95803152a46a7ebc2ade63c1429bf5833cb26169d6afda36ed194d4bf`; 5,384 files / 125,816,418 bytes; artifact `9353425023` bundle digest `sha256:90ecb9bd837532d99008f1fb09d0a01ec7fdcab86cde24624e8988a84af762ba`; exact Tesseract 5.5.3/models/closure/offline probe, extracted runtime, compiled acceptance, upload, and independent redownload/reverification PASS.
- Final artifact runtime-evidence SHA-256 `fcebe885c4f1c33c1a0d30b6ac4c963cdca44f646eef7e9c1577040140e97bc1`; platform `linux/x64`; Node `v24.19.0`; packaged Tesseract libraries 18; network required false; PDF.js/canvas, Argon2id, better-sqlite3, and compiled acceptance PASS.
- Preflight PASS against exact current process/release `f62766c…`, schema/history/checksums 001–019, only migrations 020–021 pending, integrity `ok`, foreign keys 0, post-start app/OOM events 0, and cgroup events all zero. Protected hashes remained exact: environment `a9723ff4638fe43ceb646c0ceaef7c46c82c5da6a7249525c66d0a06b9395bed`; systemd `fed6c26d80ad070decf4ddeabb7f4af6d23c38c24d2494666c7bfe981e39500b`; Nginx site `0686a46171df93bead05ddbd2c9c2dbbbc5ba7846a118594c679971d19445447`; Nginx security snippet `4f1f9059abe3dd61224acf5ac81b90e0cad24d5571c8feff66c39e0cb72ca9ca`.
- Fresh backup `academiccloud-pre-prod09-20260819T061155Z.sqlite`: 741,376 bytes, SHA-256 `21af5882483c21cfa65854fa592a7805b029b4f31c06c598114d161412c36436`; receipt `academiccloud-pre-prod09-20260819T061155Z.receipt.json`, SHA-256 `a7e0b20f43a199a37cddae8f81dc628e402b1db5d6428cdf1e4088c5f371fada`; ciphertext `database-pre-prod09-20260819T061155Z.age`, SHA-256 `4bd11e1a672bdf86122de60a6fa2a8264c5377c6775961997189928f7c1b9790`; non-secret manifest `prod09-backup-20260819T061155Z.manifest.json`, SHA-256 `560c144a7ba7e0eeba08b7ae37cf73924cc64b7999aaa2b1a7870dd988462e8f`; private off-host commit `702695ee9bfd65ee69c2f8cb6c8f105bd4320755`, tree `57f29e756bc3bb5675db3011a94ab54b2e8a33ad`; no plaintext SQLite file was published.
- Migration `020_suggestion_evidence_provenance.sql` SHA-256 `1a6d363d4ff5dd4325adfaac0b54ce64c8c071c0788ac45f98827504d22887eb`; migration `021_resumable_multipart_transfers.sql` SHA-256 `67b4699cbfae349c7397223fea9d3eaf36aacdcd9e0cec2daef9c4e130e7f01f`; runner output `appliedVersions=[20,21]`, `currentVersion=21`; post-migration history/checksums exact 001–021, integrity `ok`, foreign keys 0.
- Final cutover PASS: release/process CWD `9d2fc9b08e2e02c821ef357f149ed928510c2825`; service active; `NRestarts=0`; autostart disabled; one `127.0.0.1:3000` listener only; loopback/public health and readiness 200; public assets exact; post-cutover app errors 0; kernel OOM events 0; cgroup events all zero; protected hashes unchanged; OCR path overrides false.
- Runtime acceptance PASS as the service account: Tesseract 5.5.3; languages `chi_sim`, `chi_tra`, `eng`; offline synthetic OCR probe ok; packaged libraries 18; PDF.js import/canvas native loading true. Aliyun multipart adapter presence PASS; suggestion, multipart status/resume, and Range route authorization guards returned 401. Safe immutable-asset Range probe returned 206 with `Content-Range`, one-byte body, and exact byte match.
- Synthetic destructive acceptance skipped safely: no authenticated run-owned target was created, no pre-existing scholarly resource was used, and no multipart upload/file/folder/contribution/recycle item/OSS object was created or altered. `ROLLBACK_USED=false`; final stage cleanup and live smoke PASS.

## Next Action
STOP. The approved continuous objective is complete.
