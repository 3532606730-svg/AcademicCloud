## Task ID

PROD-02R — Repository Reconciliation + Windows Git SSH

## Goal

Reconcile the durable repository record with the completed production-preparation work and establish a dedicated, strict Windows-to-GitHub SSH Git path for `D:\Projects\AcademicCloud`.

## Scope

- recover local and private GitHub repository state from the Layer 1 checkpoint
- record verified GitHub/bootstrap and Alibaba host/runtime/preparation facts
- correct deployment documentation that still permits native builds on the low-memory target host
- create and secure a dedicated Windows GitHub Ed25519 key without reusing the Alibaba production key
- after Owner key registration, verify GitHub host identity, authenticate, switch this repository's remote to SSH, commit the bounded documentation changes, push, and verify the private remote

## Non-goals

- Windows HTTPS certificate, VPN, root-certificate, or firewall repair
- Alibaba SSH access or any server, Nginx, systemd, package, database, OSS, DNS, TLS, credential, or firewall change
- GitHub Actions workflow creation or execution
- application deployment, production runtime acceptance, or Layer 2 work

## Acceptance Criteria

- [x] starting local and GitHub `main` both equal `621b19a16e620f1a8a9ba6993bb927ae2d620748`
- [x] `CURRENT_STATUS.md` and `TASK_BOARD.md` distinguish unsupported target-host builds from untested runtime suitability and record the retained bootstrap key decision
- [x] stale target-host `npm ci` instructions are removed from deployment documentation
- [x] dedicated key `C:\Users\35326\.ssh\academiccloud_github_ed25519` is created and ACL-restricted without reusing the Alibaba key
- [x] the Owner has registered the public key in GitHub as an authentication key
- [x] GitHub's current official host fingerprint is independently verified before strict SSH authentication
- [x] strict `ssh -T` authentication and `git ls-remote` pass through the dedicated key
- [ ] documentation review, secret scan, task-level commit, direct SSH push, and post-push GitHub verification pass
- [ ] final local and remote `main` match, the worktree is clean, Alibaba is unchanged, and no Actions workflow exists or runs

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- No new architecture decision is introduced by this task.

## Relevant Modules / Files

- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `docs/deployment/layer1-acceptance.md`
- `docs/deployment/production-runbook.md`
- `tasks/doing/PROD-02R.md`, moved to `tasks/done/` only after completion
- repository-external Windows SSH key/configuration under `C:\Users\35326\.ssh\`

## Current State

Repository reconciliation and strict SSH setup are implemented and verified. The dedicated GitHub key is registered, the official GitHub Ed25519 host key is pinned, authentication succeeds as `3532606730-svg`, and this repository's `origin` is `git@github.com:3532606730-svg/AcademicCloud.git` with a repository-local strict `core.sshCommand`. Remote `main` remains at the starting checkpoint. The bounded documentation checkpoint and direct SSH push remain to be completed.

## Completed

- Reconciled GitHub bootstrap and Alibaba production-preparation facts in durable state.
- Removed stale target-host native-install instructions from deployment documentation.
- Created and ACL-restricted the dedicated GitHub Ed25519 key without reusing the Alibaba key.
- Verified GitHub's published Ed25519 host fingerprint and pinned its official key.
- Authenticated as `3532606730-svg`, switched only this repository to SSH, and read remote `main` strictly.

## Remaining

- Resolve final documentation review findings and rerun diff/secrets checks.
- Create and push the documentation checkpoint through the verified SSH transport.
- Verify remote `main`, clean working tree, Alibaba unchanged, and no Actions workflow.

## Blockers

None.

## Last Verification

2026-08-14: Windows OpenSSH `9.5p2` found at `C:\Windows\System32\OpenSSH`; dedicated GitHub key fingerprint `SHA256:NYOtnbak1oL1UCzRVNfRfnxFUputU5c6U4dIBuG+YPI`; private-key ACL inheritance disabled and access limited to the current user, Administrators, and SYSTEM; GitHub official and pinned Ed25519 host fingerprint `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`; strict `ssh -T` authenticated as `3532606730-svg`; `git ls-remote origin refs/heads/main` returned `621b19a16e620f1a8a9ba6993bb927ae2d620748`; `git diff --check` passed; targeted private-key/token/AccessKey scan found no matches; no `.github/workflows` files exist.

## Next Action

Complete the final review, create `docs: reconcile production preparation state`, push it directly over SSH, verify remote equality, and then record task completion.
