# ADR-023 — Durable Decision Reconciliation and Local Sync

**Date:** 2026-08-18  
**Status:** Accepted by Owner

## Context

AcademicCloud already treats the repository as persistent project memory and chat as temporary planning context. Recent product review showed that a decision can still become operationally stale if it is agreed in chat but not reconciled into the repository, or if GitHub is updated while the local working checkout remains behind the remote branch.

For this project, accepted product, architecture, security, workflow, roadmap, task-boundary, or execution-sequencing decisions must become durable repository state. A remote-only update is also incomplete when an accessible local checkout is expected to continue the work.

## Decision

AcademicCloud adopts the following durable workflow rule:

> **A newly accepted durable decision is not fully reconciled until the relevant repository memory is updated, committed/pushed as applicable, and the active local checkout is synchronized and verified against the intended remote branch.**

### 1. Chat is not the durable source of truth

When the Owner and engineering agent finalize a durable product, architecture, security, workflow, roadmap, task-boundary, or execution-sequencing decision, the agent must update the relevant repository memory before treating that decision as settled project state.

Relevant destinations include, as appropriate:
- `ROADMAP.md` for durable sequencing/product inventory;
- `CURRENT_STATUS.md` for current project truth;
- `TASK_BOARD.md` and task cards for executable scope/order;
- ADRs and `DECISION_LOG.md` for durable rationale and supersession;
- `AGENTS.md` and `.agents/skills/academiccloud-workflow/SKILL.md` for persistent engineering-process rules.

Not every decision belongs in every file. The agent should update the smallest complete set of authoritative records and avoid duplicating prose mechanically.

### 2. Repository reconciliation precedes autonomous continuation

If a newly accepted durable decision changes the approved task queue, product authority, architecture boundary, security model, or workflow contract, the agent must reconcile those records before selecting or continuing implementation that depends on the changed decision.

This prevents code from advancing against stale roadmap/task assumptions.

### 3. Remote and local state must converge

When repository changes are pushed to the authorized GitHub branch and an active local checkout is available to the executing agent, the agent must synchronize that checkout to the intended remote branch using a non-destructive fast-forward/rebase-safe workflow appropriate to the repository state, then verify the result.

The minimum verification is:
- expected branch selected;
- working tree safety checked before synchronization;
- no unknown local work overwritten or discarded;
- local HEAD equals the intended remote branch HEAD after synchronization;
- repository state files read from that checkout reflect the newly accepted decision.

The agent must never use force-reset, destructive checkout, history rewrite, or deletion of unknown local changes merely to obtain equality.

### 4. If local access is unavailable, do not pretend synchronization occurred

When the current execution environment can update GitHub but cannot reach the Owner's actual local machine/checkout, the agent must say so explicitly. It may complete the remote durable-state update, but local synchronization remains outstanding until an agent with access to that checkout performs and verifies it.

A claimed `LOCAL_SYNCHRONIZED=true` requires actual evidence from the accessible local repository.

### 5. Task closure and handoff

For tasks whose scope includes repository publication/push, completion reporting should distinguish at least:
- repository records reconciled;
- commit/push status;
- local synchronization status;
- production status, which remains separately gated.

A GitHub push does not imply production deployment, and local synchronization does not authorize production mutation.

## Consequences

- Newly accepted durable decisions should not survive only in chat history.
- Future agents recover the latest product/workflow truth from the repository rather than relying on long conversation migration.
- GitHub and the active development checkout remain aligned after repository-memory changes when local access exists.
- Unknown local work remains protected; synchronization is never achieved by silently discarding it.
- Remote-only work is reported accurately when the user's local machine is not accessible from the current tool environment.

## Relationship to earlier decisions

- ADR-004 remains authoritative that repository documentation is persistent AI project memory.
- ADR-005 and ADR-008 remain authoritative for scoped repository-driven engineering.
- ADR-010 remains authoritative for bounded Epic sequencing/checkpoints.
- This ADR adds the explicit reconciliation requirement from accepted chat decision → durable repository state → authorized remote push → accessible local checkout synchronization/verification.

## Non-goals

This decision does not authorize:
- production deployment or migration;
- force-push/history rewrite;
- destructive local reset;
- automatic main-branch merge;
- bypassing Owner gates for cost, credentials, production, or irreversible data operations.
