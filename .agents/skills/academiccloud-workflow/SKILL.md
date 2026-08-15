---
name: academiccloud-workflow
description: Run the repository-backed AcademicCloud engineering workflow for approved work. Use when the user asks to start the next task, continue development, execute an AcademicCloud task or Epic, fix the current task, resume interrupted work, or finish the current Epic. Restore state, select and execute scoped work, validate results, maintain task memory and project documentation, create Git checkpoints, coordinate subagents when useful, and enforce escalation boundaries. This skill defines the engineering process; it is not a source of product requirements or authority beyond approved scope.
---

# AcademicCloud Engineering Workflow

## Apply the Governing Boundary

- Use this workflow only for the AcademicCloud repository.
- Treat this skill as process guidance, not as a product or architecture specification.
- Derive product scope and technical constraints from repository facts, accepted decisions, current task scope, and actual code.
- Follow `AGENTS.md` as the persistent repository policy. Do not let recovered implementation state waive its safety or scope rules.
- Work autonomously only within the approved product Layer, current task scope, and accepted architecture.

## Recover the Minimum Context

Recover context automatically for a new chat or subagent, a brief continue instruction, a long pause, context compaction, an interrupted execution, or uncertainty about current state.

Always inspect:

1. `CURRENT_STATUS.md`.
2. `TASK_BOARD.md`.
3. The current `tasks/doing/<TASK-ID>.md` task card, if one exists.
4. Git HEAD and recent task-level history.
5. The Git working tree and relevant diff.
6. Code, tests, configuration, and documentation directly related to the current task.
7. The task card's `Last Verification`, acceptance criteria, and `Next Action`.

Read only when relevant:

- directly related accepted ADRs for implementation constraints;
- `PROJECT_SPEC.md` when product requirements or scope are unclear;
- `ROADMAP.md` for cross-Epic, cross-Layer, or sequencing decisions;
- `DECISION_LOG.md` when historical rationale is needed;
- unrelated or future-Layer documents only when the current decision truly depends on them.

Do not re-read the entire knowledge base at every task start. Do not continue from vague chat memory.

## Resolve Project Facts

Use this order when resolving claims about actual project state:

1. Current code and actual file state.
2. Git history and Git working tree.
3. `AGENTS.md`.
4. Current task card.
5. `CURRENT_STATUS.md`.
6. `TASK_BOARD.md`.
7. Accepted ADRs.
8. `DECISION_LOG.md`.
9. `PROJECT_SPEC.md`.
10. `ROADMAP.md`.
11. Chat history.

If chat memory conflicts with repository facts, use repository facts. If state files disagree with code or Git, investigate the mismatch and repair the records within task scope; do not silently rewrite implementation history.

## Select and Maintain the Task

When the user says `开始下一个任务`, `继续开发`, or names a task:

1. Recover the minimum context.
2. Confirm the Ready task, working-tree safety, scope, and acceptance criteria.
3. Refuse to infer a different product task when the board or request is ambiguous enough to change scope.
4. When an Epic genuinely begins, create `tasks/doing/<TASK-ID>.md` if it does not exist.
5. Keep the task card concise and current throughout execution.
6. Move the completed card to `tasks/done/` only after its acceptance criteria and applicable verification pass.

Use exactly these task-card sections:

```markdown
## Task ID
## Goal
## Scope
## Non-goals
## Acceptance Criteria
## Relevant ADRs
## Relevant Modules / Files
## Current State
## Completed
## Remaining
## Blockers
## Last Verification
## Next Action
```

Store decisions and evidence in their natural locations:

- source and configuration in code;
- behavior evidence in tests;
- checkpoints in Git;
- durable architecture changes in ADRs;
- current Epic memory in the task card.

Do not create competing `HANDOFF.md`, `STATUS2.md`, `CONTEXT.md`, `MEMORY.md`, context databases, or similar state systems.

## Execute the Standard Lifecycle

### A. Recover

Restore the minimum context and reconcile interrupted or dirty work before editing.

### B. Select

Confirm the current Ready task, task card, acceptance criteria, relevant boundaries, and existing user changes. Preserve unrelated user work.

### C. Plan

Create an internal, task-bounded plan. Give the user only a concise start update. Do not request approval for ordinary engineering details.

### D. Execute

Implement continuously within scope. Make ordinary dependency, structure, API, schema, configuration, testing, error-handling, and small refactoring choices autonomously.

### E. Verify

Run only applicable checks that actually exist, such as build, typecheck, lint, unit tests, integration tests, and task-specific checks. Do not claim nonexistent tests. Repair failures caused by the current task before proceeding.

### F. Review

Check acceptance criteria, diff scope, module boundaries, data safety, security consequences, rollback, and unintended changes. Use a read-only review subagent when it adds material confidence.

### G. Record

Update the task card, `CURRENT_STATUS.md`, and `TASK_BOARD.md`. Update an ADR and `DECISION_LOG.md` only for a durable architecture decision; do not elevate ordinary implementation details into ADRs.

### H. Commit

Create an ordinary task-level Git commit without separate approval when acceptance criteria are satisfied, applicable checks pass, the diff is scoped, and repository records match reality.

Never automatically force-push, rewrite history, deploy to production, or delete unknown user changes.

### I. Report

Report what changed, verification results, commit hash, remaining issues, and the next task. Keep the report concise and evidence-based.

## Exercise Default Autonomous Authority

Within the current approved Layer, active task, and accepted architecture, decide and execute ordinary engineering work without asking the user to approve each detail. This includes:

- directory, function, class, and type organization;
- Fastify and React internal structure;
- internal API and SQLite implementation details;
- repository and migration implementation;
- dependency selection within the accepted stack;
- package scripts, configuration, linting, formatting, and typechecking;
- tests, fixtures, bug fixes, bounded refactors, logging, and ordinary error handling;
- task-card and project-status updates;
- ordinary task-level Git commits.

For a significant but reversible technical decision within scope, perform an internal review before proceeding:

1. Confirm compliance with `AGENTS.md` and accepted ADRs.
2. Confirm compatibility with the accepted 1 GiB-class production host (Linux `916,044 KiB` `MemTotal`) and the unchanged 320/384 MiB service cgroup plus 128 MiB whole-host headroom gates.
3. Reject unnecessary resident services and dependencies.
4. Preserve modularity, fault isolation, and data safety.
5. Define verification and rollback.
6. Confirm the decision does not expand product scope.

Record a new ADR only when the decision creates a durable architecture change.

## Escalate Only Mandatory Cases

Stop and ask the user only when the task reaches one of these boundaries:

### Real Cost

- Add or materially expand a paid service.
- Upgrade a server or purchase a database, domain, or infrastructure.
- Create a meaningful new recurring cost.

### Irreversible Real-Data Risk

- Permanently delete real OSS objects or production data.
- Run a destructive production migration.
- Accept a credible irreversible risk to academic materials.

### Accounts, Credentials, or System Security

- Create or modify AccessKeys, cloud accounts, GitHub accounts, VPN settings, TLS or certificate trust, production SSH, or critical system-security policies.
- Disable or bypass security verification.

### Product Direction

- Enter Layer 2 or Layer 3 early.
- Add collaboration, external cloud-drive connectors, mobile applications, desktop sync, or another major product-goal change.

### Severe Anomaly

- Encounter unexplained corruption, abnormal Git history, large OSS/database inconsistency, a suspected severe vulnerability, or a production incident that cannot be recovered safely and automatically.

Ordinary technical uncertainty, test failures, dependency choices, and reversible implementation problems are not escalation by themselves. Investigate and resolve them autonomously within scope.

## Coordinate Main Agent and Subagents

When subagents are available and useful, use the main agent as project orchestrator:

- Keep task selection, scope, project state, escalation, result review, and final reporting with the main agent.
- Prefer one dedicated implementation agent for a write-intensive Epic.
- Do not let multiple agents concurrently edit related files in the same working tree.
- Use parallel agents primarily for read-only exploration, test or log analysis, security review, and documentation review.
- Require subagents to recover context from the task card and repository rather than from a long chat handoff.
- Require subagents to return a concise summary of changed files, verification, risks, and blockers instead of full logs.
- Have the main agent inspect the resulting diff, verification, and task-card state before committing or reporting.

Prefer a dedicated subagent context for a normal Epic when the client supports it and isolation is useful. Otherwise use a bounded ordinary chat. Do not let one unbounded chat accumulate all Layer 1 history.

## Control Epic Progression

- Continue autonomously through all ordinary subtasks inside the active Epic.
- At Epic completion, create a task-card and Git checkpoint, update the next Ready task, report, and stop by default.
- If the user explicitly authorizes a broader continuous objective such as completing multiple Layer 1 Epics, the main agent may begin the next ordinary roadmap Epic in a fresh bounded context after reviewing the previous checkpoint.
- Never use task-board sequencing to bypass a mandatory escalation or expand the approved product Layer.

## Keep Context Clean

- Keep `CURRENT_STATUS.md` as the project-level summary.
- Keep `TASK_BOARD.md` as the task index.
- Keep the current task card as the Epic-level working memory.
- Do not paste full source, long logs, or extensive architecture history into task cards or chat.
- Do not repeatedly restate stable ADRs or inspect future Layers without need.
- Preserve completed knowledge through code, tests, Git, ADRs, and task cards.

## Use Goals and Scheduling Sparingly

If thread-scoped Goals are available, use one short Goal for one Epic only. Do not copy the specification, all ADRs, or the full task card into it. A Goal supplements but never replaces repository state.

Do not create scheduled development tasks. AcademicCloud progress is dependency-driven, not clock-driven. Scheduled checks may be proposed later for testing, repository health, dependency security, backup verification, or status reporting, but must not modify the main branch unsupervised.
