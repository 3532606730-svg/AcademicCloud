---
name: academiccloud-workflow
description: Run the repository-backed AcademicCloud engineering workflow for approved work. Use when the user asks to start the next task, continue development, execute an AcademicCloud task or Epic, fix the current task, resume interrupted work, or complete an approved continuous objective. Restore state from the repository, select and execute scoped work, validate results, maintain task memory and project documentation, create Git checkpoints, coordinate subagents when useful, and enforce escalation boundaries. This skill defines the engineering process; it is not a source of product requirements beyond approved repository scope.
---

# AcademicCloud Engineering Workflow

## Apply the Governing Boundary

- Use this workflow only for the AcademicCloud repository.
- Treat this skill as process guidance, not as the product specification.
- Derive product scope and technical constraints from current code, Git, `AGENTS.md`, current/ready task cards, `CURRENT_STATUS.md`, `TASK_BOARD.md`, accepted ADRs, `PROJECT_SPEC.md`, and `ROADMAP.md`.
- Work autonomously only inside the approved current task or explicitly approved continuous objective.
- Production access, real credentials, real cost, destructive real-data operations, and unapproved product boundaries remain Owner-gated even when repository work is autonomous.

## Recover the Minimum Context

Recover context automatically for a new chat/subagent, a brief continue instruction, a long pause, context compaction, interrupted execution, or uncertainty about state.

Always inspect:
1. Git branch/HEAD and working tree.
2. `CURRENT_STATUS.md`.
3. `TASK_BOARD.md`.
4. `tasks/doing/<TASK-ID>.md` if an active task exists.
5. Otherwise the first approved `tasks/ready/<TASK-ID>.md` referenced by `TASK_BOARD.md`.
6. Recent task-level Git history and relevant diff.
7. Code, tests, configuration, and docs directly related to the task.
8. The task card's acceptance criteria, `Last Verification`, and `Next Action`.

Read only when relevant:
- directly related accepted ADRs;
- `PROJECT_SPEC.md` when product requirements/scope are unclear;
- `ROADMAP.md` for cross-Epic/cross-layer sequencing;
- `DECISION_LOG.md` for durable rationale;
- unrelated future-layer documents only when the current decision truly depends on them.

Do not re-read the entire knowledge base at every task start. Do not continue from vague chat memory.

## Resolve Project Facts

Use this order for claims about actual project state:
1. current code and actual files;
2. Git history and working tree;
3. `AGENTS.md`;
4. active task card;
5. approved ready task card;
6. `CURRENT_STATUS.md`;
7. `TASK_BOARD.md`;
8. accepted ADRs;
9. `DECISION_LOG.md`;
10. `PROJECT_SPEC.md`;
11. `ROADMAP.md`;
12. chat history.

If chat memory conflicts with repository facts, use repository facts. If state files disagree with code/Git, investigate and reconcile the records within scope; do not rewrite implementation history to hide a mismatch.

## Select and Maintain Tasks

When the user says `开始下一个任务`, `继续开发`, names a task, or authorizes a continuous objective:
1. recover minimum context;
2. confirm working-tree safety and the approved queue in `TASK_BOARD.md`;
3. if a task is already in `tasks/doing/`, continue/fix it before selecting a new task unless the board explicitly supersedes it;
4. otherwise select the first Ready task in the approved sequence;
5. move/copy its approved specification from `tasks/ready/` to `tasks/doing/` when implementation actually begins, preserving the specification and adding live state;
6. do not infer a different product task when ambiguity would change scope;
7. keep the active card concise and current;
8. move the completed active card to `tasks/done/` only after acceptance criteria and applicable verification pass.

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

Store decisions/evidence in natural locations:
- source/configuration in code;
- behavioral evidence in tests;
- checkpoints in Git;
- durable architecture/product-model changes in ADRs;
- queue state in `TASK_BOARD.md`;
- approved not-yet-active Epic specs in `tasks/ready/`;
- active working memory in `tasks/doing/`;
- completed Epic records in `tasks/done/`.

Do not create competing `HANDOFF.md`, `STATUS2.md`, `CONTEXT.md`, `MEMORY.md`, context databases, or similar state systems.

## Execute the Standard Lifecycle

### A. Recover
Restore minimum context and reconcile interrupted/dirty work before editing.

### B. Select
Confirm the current approved task, acceptance criteria, relevant boundaries, and existing user changes.

### C. Plan
Create an internal task-bounded plan. Give the user only a concise start update. Do not request approval for ordinary engineering details.

### D. Execute
Implement continuously inside scope. Make ordinary internal structure, API, schema, configuration, testing, error-handling, and bounded refactoring choices autonomously.

### E. Verify
Run only applicable checks that actually exist. Never claim nonexistent tests. Repair failures caused by the task before proceeding.

### F. Review
Check acceptance criteria, diff scope, module boundaries, data safety, security consequences, concurrency/rollback where relevant, and unintended changes. Use a read-only reviewer/subagent when it materially increases confidence.

### G. Record
Update the task card, `CURRENT_STATUS.md`, and `TASK_BOARD.md`. Update an ADR/`DECISION_LOG.md` only for durable product/architecture/security/workflow changes.

### H. Commit
Create an ordinary task-level Git checkpoint when acceptance criteria are satisfied, applicable checks pass, the diff is scoped, and repository records match reality.

Never automatically force-push, rewrite history, deploy production, or delete unknown user work.

### I. Progress or Report
- If no broader continuous objective is authorized: report the checkpoint and stop.
- If a broader continuous objective is explicitly authorized: re-recover state from the repository, select the next approved Ready Epic, and continue in a fresh bounded task context where practical.
- Never use continuous progression to bypass a mandatory escalation.

## Default Autonomous Authority

Within the current approved task/objective and accepted architecture, decide ordinary engineering details without asking the Owner to choose among equivalent implementations. This includes:
- directory/function/class/type organization;
- Fastify/React internal structure;
- internal API and SQLite implementation details;
- migrations inside the approved data model;
- existing-stack dependency usage;
- package scripts/configuration/typechecking;
- tests/fixtures/bug fixes/bounded refactors;
- logging and ordinary error handling;
- task/project-state updates;
- ordinary non-main Git checkpoints and pushes when the task authorizes them.

For significant but reversible technical decisions:
1. confirm compliance with `AGENTS.md` and relevant ADRs;
2. confirm compatibility with the accepted 1 GiB-class production host where the component may run there (Linux `916,044 KiB` `MemTotal`, current 320/384 MiB service cgroup and 128 MiB whole-host headroom gate unless superseded by a later accepted decision);
3. reject unnecessary resident services/dependencies;
4. preserve modularity, fault isolation, authorization, and data safety;
5. define verification and rollback;
6. confirm the decision does not expand beyond the approved task/objective.

Record a new ADR only for a durable product/architecture/security/workflow decision.

## Escalate Only Mandatory Cases

Stop and ask the Owner only when the current task reaches one of these boundaries:

### Real Cost
- add/materially expand a paid service;
- upgrade/purchase infrastructure;
- create meaningful new recurring cost.

### Irreversible Real-Data Risk
- permanently delete real OSS objects/production data;
- destructive production migration;
- credible irreversible risk to academic materials.

### Accounts, Credentials, or System Security
- create/modify AccessKeys, cloud accounts, GitHub accounts, VPN settings, production SSH credentials, TLS/certificate trust, or critical system-security policy;
- disable/bypass security verification.

Repository-only account/auth code inside an explicitly approved Accounts task is not by itself an escalation; live account creation or live credential/system-security changes are.

### Product Direction
- enter a product layer/Epic not approved by `TASK_BOARD.md`/current Owner objective;
- add external connectors, native/mobile sync clients, collaboration modes, or another major product goal not already authorized.

### Severe Anomaly
- unexplained corruption;
- abnormal Git history that cannot be safely isolated;
- large OSS/database inconsistency;
- suspected severe vulnerability;
- production incident that cannot be recovered safely under an already approved runbook.

Ordinary technical uncertainty, test failures, dependency choices, and reversible implementation problems are not escalation by themselves. Investigate and resolve them autonomously within scope.

## Main Agent and Subagents

When subagents are useful:
- main agent owns task selection, scope, project state, escalation, result review, and final reporting;
- prefer one write-intensive implementation agent per Epic;
- do not let multiple agents concurrently edit related files in the same working tree;
- use parallel agents mainly for read-only exploration, test/log analysis, security review, performance analysis, and documentation review;
- require subagents to recover context from repository/task cards rather than long chat handoffs;
- require concise evidence/results, not full logs;
- main agent inspects resulting diff, verification, and task state before committing/reporting.

### Anti-pause rule

NEVER end the parent turn merely because a required subagent is still running.

If a required subagent verdict blocks the milestone, use the runtime's wait/result lifecycle and continue when the result is available. Do not narratively “pause and wait for notification” unless the runtime explicitly confirms automatic parent resumption.

If a reviewer is slow, wait for that same reviewer; do not spawn duplicates merely because it has not returned yet. Replace it only when the runtime proves it failed/lost its result.

## Control Epic Progression

- Continue autonomously through ordinary subtasks inside the active Epic.
- At Epic completion, create an evidence-backed Git checkpoint and reconcile repository state.
- If the Owner authorized multiple Epics as one continuous objective, begin the next ordinary Ready Epic only after the previous checkpoint is green.
- Each Epic remains an independently reviewable unit even inside a long autonomous run.
- Optional/conditional Epics may be skipped when the board's preconditions are not satisfied; skipping an optional Epic is not failure.
- Never use elapsed time as a reason to invent extra features.
- Never cut final verification/review merely to start another optional Epic.

## Keep Context Clean

- `CURRENT_STATUS.md` is the concise project-level truth.
- `TASK_BOARD.md` is the executable queue/index.
- `tasks/ready/` stores approved future Epic specs.
- `tasks/doing/` stores active Epic memory.
- `tasks/done/` stores completed Epic records.
- Do not paste full source, long logs, or whole architecture history into task cards/chat.
- Preserve completed knowledge through code, tests, Git, ADRs, and completed task cards.

## Scheduling

AcademicCloud feature progress is dependency-driven, not clock-driven. Do not create scheduled development tasks. Time windows may be used as safety budgets, but acceptance criteria—not elapsed time—define completion.

Scheduled production-health checks may be proposed/implemented only inside an approved operations task and must obey the production-mutation gates.
