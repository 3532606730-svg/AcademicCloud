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

- [ ] a real GitHub Actions run passes on Ubuntu Linux x86_64 with an exact recorded Node.js 24.x and npm version
- [ ] clean `npm ci`, backend/frontend tests, type-check, production build, both audits, compiled acceptance, and Argon2 benchmark pass
- [ ] better-sqlite3 and Argon2 native modules load and execute from the extracted production-only artifact
- [ ] the extracted artifact reruns compiled acceptance with random local-only credentials and no live cloud calls
- [ ] the artifact contains the required runtime/deployment files and excludes development dependencies, secrets, databases, logs, caches, and Windows native binaries
- [ ] a deterministic per-file manifest, archive SHA-256 file, runtime-verification evidence, and immutable GitHub artifact are generated and independently verified after download
- [ ] applicable local checks, targeted secret scan, diff review, and an independent read-only review pass
- [ ] final `main` and private GitHub `main` match, the worktree is clean, cost remains 0 RMB, Alibaba is unchanged, and PROD-02H has not started

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
- `tasks/doing/PROD-02G.md`

## Current State

Started from clean local and private GitHub `main` at `704ed3ae4762e1e6b3c73e5d27f7c858fb3b0d84` on branch `codex/prod-02g`. No Actions workflow existed at task start. The local `gh` CLI is absent, so local Git/SSH will publish changes while the connected GitHub integration handles the draft PR, Actions inspection, logs, and artifact download.

## Completed

- Recovered repository, Git, GitHub, workflow, ADR, and deployment state from durable sources.
- Confirmed the dedicated repository-scoped SSH transport and private GitHub access.
- Confirmed `PROD-02G` is the sole Ready task and all deployment/cloud/Layer 2 boundaries remain deferred.
- Added a least-privilege, SHA-pinned, two-job GitHub Actions workflow for Linux x86_64 / Node.js 24 production builds and independent post-upload verification on a fresh runner.
- Added repository-owned production artifact preparation, native-prebuild pruning, deterministic manifest/archive generation, SHA-256 verification, archive traversal defense, policy checks, ELF64 x86-64 validation, SQLite/Argon2 runtime probes, and compiled acceptance rerun.
- Passed the complete applicable local gate: 88 backend tests, 22 frontend tests, type-check, production build, compiled acceptance, full/production audits with zero vulnerabilities, and the Argon2 benchmark.
- Passed JavaScript syntax, YAML lint, whitespace, and targeted secret checks; independent read-only Reviewer approved the first push with no blockers.

## Remaining

- Push the branch, create the draft PR, execute the real Linux workflow, and repair ordinary failures.
- Download and independently verify the successful artifact bundle.
- Complete review, durable records, main fast-forward, and final verification.

## Blockers

None.

## Last Verification

2026-08-14: local implementation gate passed (backend 88/88; frontend 22/22; type-check; production build; compiled acceptance; both npm audits at zero vulnerabilities; Argon2id hash 80 ms, verify 77 ms, peak RSS 117.2 MiB on local Node.js `v24.16.0`); `node --check`, YAML lint, `git diff --check`, targeted secret scan, and independent read-only review passed. Local HEAD and SSH remote `main` remain `704ed3ae4762e1e6b3c73e5d27f7c858fb3b0d84`; Alibaba was not accessed.

## Next Action

Create the first clean Git checkpoint, push `codex/prod-02g` over the dedicated SSH transport, open the draft PR, and observe the real Linux production build.
