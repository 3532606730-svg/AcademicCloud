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

- [ ] Compiled acceptance captures child stdout/stderr in bounded memory, remains quiet on success, detects early exit, and emits only bounded sanitized startup diagnostics on failure/timeout.
- [ ] Focused diagnostic behavior is tested without exposing environment values, credentials, cookies, signed URLs, request bodies, database content, PDF content, or scholarly content.
- [ ] The exact extracted-artifact startup exception is captured under Linux x64 / Node 24, and the first failing stage among pre-prune, post-prune, and extracted runtime is recorded.
- [ ] Any native allowlist change is limited to the exact required pinned Linux x64 glibc file(s); all other `.node` files remain pruned and every retained native binary passes ELF64 x86-64 verification.
- [ ] The extracted artifact explicitly loads the pinned PDF.js runtime and passes health, readiness, migrations 001–019 presence, and compiled application acceptance.
- [ ] Both jobs of the complete production artifact workflow pass for the exact new repair commit, with deterministic archive/manifest, safe paths, full hashes, production-only dependencies, no dev dependencies, Node 24, and independent fresh-runner download verification.
- [ ] Production is not contacted before the artifact is independently green.
- [ ] Before any live mutation, production is revalidated as exact `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, schema v18/history 001–018, integrity `ok`, FK zero, exact migration checksums 001–018, and migration 019 as the sole pending migration.
- [ ] If live truth is unchanged, a fresh verified encrypted off-host v18 backup is created, migration 019 is applied exactly once, the exact repaired release is selected, and bounded production acceptance is green; otherwise deployment fails closed.
- [ ] Durable repair/deployment evidence and current-state records are reconciled and published without erasing historical PROD-07B, RF-METASUGGEST01, or L1-UX07 evidence.

## Relevant ADRs

- `docs/decisions/ADR-023-durable-decision-reconciliation-and-local-sync.md`
- `docs/decisions/ADR-027-bounded-bibliographic-suggestion-implementation.md`
- `docs/decisions/ADR-028-permanent-delete-authority-and-domain-safety.md`

## Relevant Modules / Files

- Runtime diagnostics: `backend/scripts/compiled-acceptance.mjs` and focused script tests/helpers.
- PDF runtime: `backend/src/suggestions/pdf-text.ts`, `backend/package.json`, `package-lock.json`.
- Artifact policy: `scripts/production-artifact.mjs`, `.github/workflows/production-build.yml`, `backend/test/deployment/artifacts.test.ts`.
- Deployment: `docs/deployment/production-runbook.md` and established protected production scripts/workflows.
- Durable state/evidence: `tasks/doing/PROD-08R.md`, `CURRENT_STATUS.md`, `TASK_BOARD.md`.

## Current State

Active. The prior artifact workflow failed closed after archive creation and before upload; the independent verification job was skipped and production was not mutated. The authoritative checkout and upstream are clean at `35d03dd350d874cb43e85e4fc4cd3b22ee5abd89`. The isolated OCR worktree is separate at `D:\Projects\AcademicCloud-ocr` and will not be modified. Production remains at the last read-only-confirmed `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, v18/history 001–018, but live truth must not be contacted again until a fully green artifact exists.

## Completed

- Recovered the exact failed-run evidence and Owner repair/deployment boundaries.
- Confirmed the authoritative branch/HEAD/upstream are exact and the working tree was clean before opening this task.
- Confirmed `codex/rf-frontmatterocr01-20260819` is checked out only in the separate OCR worktree at `35d03dd…`.
- Confirmed failed run `32168164654` passed tests, typechecks, builds, audits, production dependency install, finalization, manifest, and deterministic packing, then failed only when the extracted compiled API did not become healthy.
- Added bounded per-stream startup capture, quiet-success behavior, early child-exit detection, fixed diagnostic reason text, and allowlisted module/runtime exception lines with environment/credential/URL redaction.
- Added focused tests proving the diagnostic byte bound, secret/content suppression, useful missing-native-module evidence, quiet ordinary output, and exit-code/signal detection.

## Remaining

- Implement and verify bounded startup diagnostics.
- Reproduce and prove the exact Linux runtime failure.
- Implement and verify the minimum evidence-backed runtime policy repair.
- Obtain a completely green two-job artifact workflow for the exact repaired commit.
- Only then revalidate and, if unchanged, complete the authorized v19 production deployment and durable evidence reconciliation.

## Blockers

None. Production contact is intentionally gated on complete artifact verification.

## Last Verification

2026-08-19: focused compiled-startup diagnostic tests 3/3; backend tests 308/308; backend typecheck; backend production build; compiled application acceptance with schema 001–019, health, readiness, restart, backup/restore, metadata, and credential-reset checks; `git diff --check`. No production contact or mutation in this repair phase.

## Next Action

Implement bounded compiled-acceptance startup diagnostics, verify them locally, checkpoint/publish the diagnostic-only change, and reproduce the exact extracted Linux x64 / Node 24 startup exception through the production artifact workflow.
