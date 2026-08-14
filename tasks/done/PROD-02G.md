## Task ID

PROD-02G — GitHub Actions Linux Production Build

## Goal

Build, verify, package, and retain a reproducible Linux x86_64 / Node.js 24 production runtime artifact in real GitHub Actions without deploying it.

## Scope

- add a least-privilege GitHub Actions workflow on a GitHub-hosted Ubuntu x86_64 runner
- run clean npm installation, tests, type-check, build, audits, compiled acceptance, and Argon2 benchmark on Node.js 24
- assemble backend production dependencies and compiled backend/frontend outputs without Windows binaries or development dependencies
- generate a per-file manifest, archive SHA-256, and runtime-verification evidence
- extract the archive into a clean directory and verify better-sqlite3, Argon2id, compiled acceptance, manifest completeness, and archive integrity
- upload the immutable verification bundle with short retention, download it independently, and verify it again
- use the dedicated Windows-to-GitHub SSH path for Git writes

## Non-goals

- Alibaba host access, npm installation, build, artifact extraction, runtime execution, or deployment
- real OSS, RAM, DNS, TLS, firewall, Nginx, systemd, production database, or academic-data operations
- Docker, self-hosted runners, paid services, release publication, or production cutover
- Layer 2 or Layer 3 work

## Acceptance Criteria

- [x] a real GitHub Actions run passes on Ubuntu Linux x86_64 with an exact recorded Node.js 24.x and npm version
- [x] clean `npm ci`, backend/frontend tests, type-check, production build, both audits, compiled acceptance, and Argon2 benchmark pass
- [x] better-sqlite3 and Argon2 native modules load and execute from the extracted production-only artifact
- [x] the extracted artifact reruns compiled acceptance with random local-only credentials and no live cloud calls
- [x] the artifact contains the required runtime/deployment files and excludes development dependencies, secrets, databases, logs, caches, and Windows native binaries
- [x] a deterministic per-file manifest, archive SHA-256 file, runtime-verification evidence, and immutable GitHub artifact are generated and independently verified after download
- [x] applicable local checks, targeted secret scan, diff review, and an independent read-only review pass
- [x] final `main` and private GitHub `main` match, the worktree is clean, cost remains 0 RMB, Alibaba is unchanged, and PROD-02H has not started

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- No new product or application architecture decision is introduced by this task.

## Relevant Modules / Files

- `.github/workflows/production-build.yml`
- `scripts/production-artifact.mjs`
- `backend/scripts/compiled-acceptance.mjs`
- `package.json` and `package-lock.json`
- `docs/deployment/layer1-acceptance.md`
- `docs/deployment/production-runbook.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/done/PROD-02G.md`

## Current State

Completed on branch `codex/prod-02g`. GitHub Actions run `31812294336` passed both the Linux production build and independent fresh-runner download/verification jobs for source commit `afd46c3db3e36e4d0dc53bc2c66b2cf6e17f89f4`. Artifact `9223626582` is retained for seven days. No Alibaba host, live OSS, or production cloud resource was accessed or changed.

## Completed

- Recovered repository, Git, GitHub, workflow, ADR, and deployment state from durable sources.
- Confirmed the dedicated repository-scoped SSH transport and private GitHub access.
- Confirmed `PROD-02G` is the sole Ready task and all deployment/cloud/Layer 2 boundaries remain deferred.
- Added a least-privilege, SHA-pinned, two-job GitHub Actions workflow for Linux x86_64 / Node.js 24 production builds and independent post-upload verification on a fresh runner.
- Added repository-owned production artifact preparation, native-prebuild pruning, deterministic manifest/archive generation, SHA-256 verification, archive traversal defense, policy checks, ELF64 x86-64 validation, SQLite/Argon2 runtime probes, and compiled acceptance rerun.
- Passed the complete applicable local gate: 88 backend tests, 22 frontend tests, type-check, production build, compiled acceptance, full/production audits with zero vulnerabilities, and the Argon2 benchmark.
- Passed JavaScript syntax, YAML lint, whitespace, and targeted secret checks; independent read-only Reviewer approved the first push with no blockers.
- Pushed checkpoint `f36f8dee21a3b30771a4ee6db0142605a82cdc87`, opened draft PR #1, and inspected real Actions run `31812031469`; the Linux gate passed through production-only install before the artifact policy correctly rejected a locked dependency's Visual Studio `.vs/slnx.sqlite` cache.
- Added targeted pruning of `.vs` development-tool directories inside production `node_modules` while retaining hard rejection of `.vs` directories and SQLite files in the final artifact.
- Passed replacement run `31812294336` end to end, including production artifact extraction, exact native ELF64 x86-64 validation, SQLite execution, Argon2id hash/verify, compiled acceptance, upload, fresh-runner download, and identical full re-verification.
- Downloaded artifact `9223626582` independently through the GitHub connector and verified its ZIP digest, release SHA-256, safe archive paths, internal/external manifest equality, source/platform identity, exact native-module evidence, SQLite/Argon2 execution evidence, and compiled acceptance evidence.

## Remaining

None.

## Blockers

None.

## Last Verification

2026-08-14: GitHub Actions run `31812294336` passed both jobs on Ubuntu 24.04 x86_64, Node.js `v24.19.0`, and npm `11.17.0`. Artifact `9223626582` ZIP SHA-256 `405a2cd2330f1a9294fe277a01d0bee7048b4b5829764af3e27d3aa174c2cf7d`; release SHA-256 `fe28ea66b8e4c88888572932c8195ec4bb23c5345f10a7aa9658c3f6ebe9d630`; 4,619 manifest files / 32,741,380 bytes; SQLite `3.53.4`; exact Argon2 and better-sqlite3 ELF64 x86-64 binaries; Argon2id and compiled acceptance status `ok`. Connector download and local metadata/integrity verification passed. Alibaba remained unchanged and incremental cost remained 0 RMB.

## Next Action

Stop. `PROD-02H` is Ready but was not started; it requires a new execution request.
