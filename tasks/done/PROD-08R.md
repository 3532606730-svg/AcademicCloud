## Task ID

PROD-08R — v19 Production Artifact Runtime Repair and Release Resume

## Goal

Prove and repair the exact extracted Linux x64 / Node 24 artifact startup failure from GitHub Actions run `32168164654`, produce an independently verified immutable artifact from `35d03dd350d874cb43e85e4fc4cd3b22ee5abd89` plus only the minimum runtime-boundary repair, and only after both artifact workflow jobs are completely green resume the already-authorized bounded v19 production deployment.

## Scope

- Make compiled-acceptance startup failures safely observable with bounded stdout/stderr capture, early-exit detection, quiet success, and sanitized failure diagnostics.
- Reproduce the exact post-finalization/extraction failure under the repository Linux x64 / Node 24 production workflow and compare pre-prune, post-prune, and extracted runtime state.
- If evidence proves a required PDF.js native runtime dependency is pruned, preserve only its exact pinned Linux x64 glibc path through the existing native allowlist and ELF verification boundary.
- Add explicit extracted-artifact verification that the pinned PDF.js runtime can load from the artifact itself.
- Create and publish only narrow repair checkpoints on `codex/project-memory-reconcile-20260817`; preserve the isolated `codex/rf-frontmatterocr01-20260819` worktree and branch.
- Require exact-source build, manifest/archive verification, extracted compiled acceptance, and independent fresh-runner artifact download verification before any production contact.
- After a completely green artifact, revalidate exact production release/schema/checksums/integrity/FK and only then perform the already-authorized v18-to-v19 app-plus-database deployment and bounded acceptance.

## Non-goals

- No production contact or mutation during artifact diagnosis and repair.
- No deployment of failed run `32168164654` or reuse of its unpublished archive.
- No weakening of pruning, safe-path, manifest, dependency, native-binary, Node-version, exact-source, or independent-verification gates.
- No migration 020, OCR implementation, RF-FRONTMATTEROCR01 worktree mutation, RF-SEARCH01, whole-document extraction, full-text search, embeddings, retrieval, RAG, main merge, infrastructure-policy repair, credentials, or unrelated cleanup.
- No destructive acceptance against pre-existing production resources; any optional destructive production acceptance may touch only uniquely identified run-owned synthetic data with proven ownership and verified cleanup.

## Acceptance Criteria

- [x] Compiled acceptance captures child stdout/stderr in bounded memory, remains quiet on success, detects early exit, and emits only bounded sanitized startup diagnostics on failure/timeout.
- [x] Focused diagnostic behavior is tested without exposing environment values, credentials, cookies, signed URLs, request bodies, database content, PDF content, or scholarly content.
- [x] The exact extracted-artifact startup exception is captured under Linux x64 / Node 24, and the first failing stage among pre-prune, post-prune, and extracted runtime is recorded.
- [x] The native allowlist change is limited to `node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node`; all other unapproved `.node` files remain pruned and every retained native binary passes ELF64 x86-64 verification.
- [x] The extracted artifact explicitly loads the pinned PDF.js runtime and passes health, readiness, migrations 001–019 presence, and compiled application acceptance.
- [x] Both jobs of the complete production artifact workflow pass for exact repair commit `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, with deterministic archive/manifest, safe paths, full hashes, production-only dependencies, no dev dependencies, Node 24, and independent fresh-runner download verification.
- [x] Production was not contacted before the artifact was independently green.
- [x] Before live mutation, production was revalidated as exact `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, schema v18/history 001–018, integrity `ok`, FK zero, exact migration checksums 001–018, and migration 019 as the sole pending migration.
- [x] A fresh verified encrypted off-host v18 backup was created; migration 019 was applied exactly once in the final successful cutover; exact repaired release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` was selected; bounded production acceptance is green.
- [x] Durable repair/deployment evidence and current-state records are reconciled without erasing historical PROD-07B, RF-METASUGGEST01, or L1-UX07 evidence.

## Relevant ADRs

- `docs/decisions/ADR-023-durable-decision-reconciliation-and-local-sync.md`
- `docs/decisions/ADR-027-bounded-bibliographic-suggestion-implementation.md`
- `docs/decisions/ADR-028-permanent-delete-authority-and-domain-safety.md`

## Relevant Modules / Files

- Runtime diagnostics: `backend/scripts/compiled-acceptance.mjs` and focused script tests/helpers.
- PDF runtime: `backend/src/suggestions/pdf-text.ts`, `backend/package.json`, `package-lock.json`.
- Artifact policy: `scripts/production-artifact.mjs`, `.github/workflows/production-build.yml`, `backend/test/deployment/artifacts.test.ts`.
- Deployment: `docs/deployment/production-runbook.md` and established protected production scripts/workflows.
- Durable state/evidence: `tasks/done/PROD-08R.md`, `CURRENT_STATUS.md`, `TASK_BOARD.md`, `ROADMAP.md`, `AGENTS.md`, and `docs/deployment/production-runbook.md`.

## Current State

Complete. Production runs exact immutable release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, previous release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, at exact schema v19/history 001–019. RF-METASUGGEST01 and L1-UX07 are deployed, PROD-07B behavior is preserved, and rollback was used during two fail-closed cutover attempts before the final successful app-plus-database cutover. Execution is stopped.

## Completed

- Recovered the exact failed-run evidence and Owner repair/deployment boundaries.
- Confirmed the authoritative branch/HEAD/upstream are exact and the working tree was clean before opening this task.
- Confirmed `codex/rf-frontmatterocr01-20260819` is checked out only in the separate OCR worktree at `35d03dd…`.
- Confirmed failed run `32168164654` passed tests, typechecks, builds, audits, production dependency install, finalization, manifest, and deterministic packing, then failed only when the extracted compiled API did not become healthy.
- Added bounded per-stream startup capture, quiet-success behavior, early child-exit detection, fixed diagnostic reason text, and allowlisted module/runtime exception lines with environment/credential/URL redaction.
- Added focused tests proving the diagnostic byte bound, secret/content suppression, useful missing-native-module evidence, quiet ordinary output, and exit-code/signal detection.
- Published diagnostic checkpoint `75b6a70861006ece30ac9abb6fe1a5704a2dc144` and reproduced the exact failure in Linux workflow run `32170306350`, job `95819599032`: after finalization/extraction PDF.js could not load `@napi-rs/canvas`, could not polyfill `DOMMatrix`, and terminated backend startup with `ReferenceError: DOMMatrix is not defined`.
- Confirmed the pinned dependency chain `pdfjs-dist@6.2.108` → `@napi-rs/canvas@1.0.7` → Linux glibc `@napi-rs/canvas-linux-x64-gnu@1.0.7`; the platform package contains exactly `package.json`, `README.md`, and the single 33,978,880-byte `skia.linux-x64-gnu.node` native binary, with no ICU sidecar.
- Confirmed the PDF.js official Node metadata/text example uses `pdfjs-dist/legacy/build/pdf.mjs`; no supported text-only Node entry point bypasses this import-time DOM polyfill/runtime requirement.
- Repaired the artifact boundary in exact commit `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` by retaining only the pinned Linux x64 glibc canvas binding required for PDF.js import-time `DOMMatrix` initialization. Pre-prune, post-prune, and extracted PDF.js probes, ELF/native policy, compiled acceptance, backend 309/309, frontend 193/193, both typechecks, both production builds, artifact-policy tests, and `git diff --check` passed.
- Completed artifact workflow run `32171340265`: build/runtime job `95822977886` and independent job `95823802592` passed. GitHub artifact `9337450791` has service digest `8a5c285c52b48f205575d5ee2cf4ae255b790f5f76517f011833e8ffaee3ab5a`, archive SHA-256 `6438e5235ce1290d450f1beae28bed19c342a5258717f9fd321bc339f06aee32`, manifest SHA-256 `488c445a9f4677787803c9dbcc9737347d95793ac17cd83e9582b6500fe8bb23`, and runtime-evidence SHA-256 `9080e6a2efa358405257e64f2f83df99937968a1006aff95fd266e071e9fa9f5` (5,329 files; 102,592,679 bytes).
- Created the write-frozen schema-v18 rollback backup `academiccloud-pre-prod08r-20260818T184801Z.sqlite` (667,648 bytes; SHA-256 `338d245d0e0aeb7fec063df069e0750bf3830aceedf32a0f4aad716fb868453b`) and receipt (SHA-256 `2caae7d82611720bef5229c5a692409504cdcc1459b820cdb5630a3f504115fc`). Encrypted ciphertext SHA-256 `73d5ad3123c8204a060bb36bc6cf0e45e06e46de39c0199d8df76a22b57007b3` is independently verified in private off-host backup commit `a7369933f31af7839bc833d3d24d30688504276d`; no plaintext database was published.
- Two optional post-migration SQL verification attempts failed on probe quoting, each failed closed, preserved its v19 database in the designated incident location, restored the exact fresh v18 backup, reselected `bc578863…`, and verified schema/integrity/FK/health/readiness. `ROLLBACK_USED=true`; the preserved incident databases remain untouched.
- The final cutover applied exactly migration 019 from the restored v18 baseline (`{"appliedVersions":[19],"currentVersion":19}`), selected `f62766c…`, and completed the protected service restart after acceptance detected that a prior `systemctl start` had left the old process resident. The running process working directory is exact `/opt/academiccloud/releases/f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7/backend`.
- Final acceptance proved release `f62766c…`; schema/history/checksums exact 001–019; migration 019 checksum `c533d8947f4ab8492673c9872f4f11b5cf55d528bd762d7cf7c9682c137f33ff`; migration 020 absent; SQLite integrity `ok`; FK violations zero; one loopback listener at `127.0.0.1:3000`; loopback/public health `ok` and readiness `ready`; service active with autostart disabled and `NRestarts=0`; public index/JS/CSS identity exact; RF-METASUGGEST endpoint present; RF-METASUGGEST/L1-UX07/PROD-07B behavior present; and no OCR, RF-SEARCH01, extraction, embedding, retrieval, or RAG residue.
- No authenticated run-owned synthetic production resource was created, so destructive synthetic acceptance was skipped for safety. No task-owned synthetic residue exists, and no historical or pre-existing production resource was mutated for acceptance.
- The Owner confirmed the observed folder-count delta was caused by intentional Owner deletions, not a production anomaly. No further database comparison, audit investigation, restore, cleanup, or mutation was performed for that delta.
- Protected systemd, Nginx, security-header, root-only environment, DNS, TLS, firewall, autostart, and CSP policy remained unchanged. Current rollback is the inseparable pair: exact application `bc5788633e0295744905b4ae2dcdfcc5d97635bf` plus the fresh schema-v18 backup above.

## Remaining

None.

## Blockers

None.

## Last Verification

2026-08-19: exact repaired artifact run `32171340265` passed both jobs and independent extracted-runtime verification. Final production is exact release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, schema/history/checksums 001–019, integrity `ok`, FK zero, one loopback API listener, loopback/public health `ok` and readiness `ready`, exact public assets, RF-METASUGGEST endpoint present, no migration 020/OCR/search/RAG residue, service active/autostart disabled/`NRestarts=0`, and protected configuration unchanged. Rollback was used before final success. Synthetic destructive acceptance was skipped safely because no uniquely owned task-created target existed.

## Next Action

STOP. Do not reopen the Owner-explained folder-count comparison, touch preserved incident databases, mutate production, begin another task, start OCR/search/RAG, create migration 020, repair infrastructure, merge main, or perform unrelated work without a new explicit Owner authorization.
