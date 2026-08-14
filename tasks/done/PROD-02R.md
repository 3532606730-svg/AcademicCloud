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
- [x] documentation review, secret scan, task-level commit, direct SSH push, and post-push GitHub verification pass
- [x] local and remote `main` matched after the reconciliation push, the worktree was clean, Alibaba was unchanged, and no Actions workflow exists or ran

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- No new architecture decision is introduced by this task.

## Relevant Modules / Files

- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `docs/deployment/layer1-acceptance.md`
- `docs/deployment/production-runbook.md`
- `tasks/done/PROD-02R.md`
- repository-external Windows SSH key/configuration under `C:\Users\35326\.ssh\`

## Current State

Complete. Repository reconciliation, the dedicated strict SSH setup, direct Windows push, independent GitHub connector read, and post-push equality checks passed. Alibaba remained unchanged, Windows HTTPS remains unresolved but non-blocking, and no GitHub Actions or deployment work was started.

## Completed

- Reconciled GitHub bootstrap and Alibaba production-preparation facts in durable state.
- Removed stale target-host native-install instructions from deployment documentation.
- Created and ACL-restricted the dedicated GitHub Ed25519 key without reusing the Alibaba key.
- Verified GitHub's published Ed25519 host fingerprint and pinned its official key.
- Authenticated as `3532606730-svg`, switched only this repository to SSH, and read remote `main` strictly.
- Created and directly pushed reconciliation commit `26034c42e78a09f4b6b1e28acaf9f71e303f7be5`.
- Verified that commit through both SSH remote read and the connected GitHub integration.
- Passed targeted secret scan, diff check, and two rounds of independent read-only review.

## Remaining

None for `PROD-02R`. Start `PROD-02G` only as a separate task.

## Blockers

None.

## Last Verification

2026-08-14: Windows OpenSSH `9.5p2` found at `C:\Windows\System32\OpenSSH`; dedicated GitHub key fingerprint `SHA256:NYOtnbak1oL1UCzRVNfRfnxFUputU5c6U4dIBuG+YPI`; private-key ACL inheritance disabled and access limited to the current user, Administrators, and SYSTEM; GitHub official and pinned Ed25519 host fingerprint `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`; strict `ssh -T` authenticated as `3532606730-svg`; reconciliation commit `26034c42e78a09f4b6b1e28acaf9f71e303f7be5` pushed directly over SSH; local HEAD, SSH remote `main`, and GitHub connector commit all matched; worktree was clean; `git diff --check`, targeted private-key/token/AccessKey scan, and independent review passed; no `.github/workflows` files exist; no Alibaba command or mutation occurred.

## Next Action

Stop at the `PROD-02R` checkpoint. Begin `PROD-02G — GitHub Actions Linux Production Build` only in a separate task.
