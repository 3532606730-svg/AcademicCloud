# ACADEMICCLOUD-EXECUTION-ACCESS-RECOVERY01

## Task ID
ACADEMICCLOUD-EXECUTION-ACCESS-RECOVERY01

## Goal
Restore the minimum Git and authoritative evidence paths needed to resume
INCIDENT-L1-AI-PRODUCTION01 without changing application behavior or
production data.

## Scope
Local Git write-path diagnosis, existing SSH/GitHub access-path diagnosis,
bounded production read-only evidence, and preservation of the already-verified
incident UX/documentation working tree.

## Non-goals
No AI repair, retry wave, deployment, migration, production business-data
change, new credential, provider mutation, or browser-security bypass.

## Acceptance Criteria
- [x] Existing working tree and intended incident changes preserved.
- [x] Git can write the index and create the bounded checkpoint commit.
- [x] Checkpoint is pushed to the authoritative branch and remote SHA verified.
- [x] Existing production SSH route is restored and bounded read-only evidence passes.
- [x] GitHub Actions workflow/job evidence is readable through an authorized path.
- [x] No new credential, production data change, deployment, OSS/RAM/CORS change,
      or cost change occurred.

## Relevant ADRs
ADR-023, ADR-031, ADR-033, ADR-034.

## Relevant Modules / Files
`.git`, `CURRENT_STATE.json`, `CURRENT_STATUS.md`, `TASK_BOARD.md`,
`tasks/done/INCIDENT-L1-AI-PRODUCTION01.md`, frontend incident UX files, and
the fixed production-readiness audit scripts.

## Current State
This recovery task is complete. Branch
`codex/project-memory-reconcile-20260817` published the exact incident repairs
through `ccde12d0f1aadff484b42841eb1136061f86cb9b`; authenticated GitHub CLI,
production SSH read, Git write/push, and authorized browser evidence all
remained available through the final Owner real-browser closure. No new
credential or provider mutation was introduced by recovery.

Historically, the branch began this recovery at start HEAD
`79c251fc2eba6fc87fdb648b9c37a8b6eda0ca88`. The working tree contained the
previously verified eight-file incident UX/documentation diff plus known
unrelated `scratch/` material and this task card.

The active sandbox identity at that checkpoint could read `.git` but could not create
`.git/index.lock`; `git update-index --refresh` fails with `Permission denied`.
ACL inspection found no stale lock and no Git process owner. The failure is the
execution sandbox's `.git` write restriction, not a proven repository ACL defect.
An escalated Git probe was rejected by the execution broker before process
creation with a temporary approval-service `503`; no ACL was changed.

The existing `academiccloud-prod` route is functional through the approved SSH
path. Read-only evidence: exact release
`017a47dbd837264175d8cbcb3f469a01e3e62c92`, service active/running,
`NRestarts=0`, loopback health/readiness `200`, and public health `200`.
The production database reports schema `v24`, migration history `001-024`,
SQLite integrity `ok`, foreign-key violations `0`, and aggregate durable jobs
`38 failed / 13 succeeded`. No raw document content was read.
The prior alias failure was `SSH_CONFIG_NOT_VISIBLE` in the restricted sandbox,
not DNS or host unavailability.

The authenticated GitHub CLI session was initially hidden from the restricted shell,
but the authorized in-app browser route now reads workflow/job evidence. No
workflow was triggered for diagnosis and no secret/capability/document content
was exposed.

## Completed
- Recorded a patch backup outside `.git` at
  `%TEMP%\academiccloud-execution-access-recovery.patch`; scan found no
  credential-like material.
- Re-ran `git diff --check` successfully.
- Re-ran frontend tests `273/273`, frontend typecheck, and frontend production
  build successfully.
- Performed bounded production read-only health/source checks over SSH.
- Read representative new-upload and legacy Compute job logs plus a successful
  historical control through the authorized GitHub Actions browser route.
- Confirmed the Git write/push checkpoint path is restored at `d1d79eb`.
- Published and verified the final incident repair sources through `ccde12d…`,
  followed the exact production Compute run, and completed Owner UI closure.

## Remaining
None.

## Blockers
None.

## Last Verification
```text
BRANCH=codex/project-memory-reconcile-20260817
START_HEAD=d1d79ebf5b2bc1678e6968a798d91eb971bc7cd8
WORKTREE_PRESERVED=true
GIT_DIFF_CHECK=PASS
FRONTEND=273/273 PASS
FRONTEND_TYPECHECK=PASS
FRONTEND_BUILD=PASS
PRODUCTION_SSH_READ=PASS
PRODUCTION_SOURCE_SHA=017a47dbd837264175d8cbcb3f469a01e3e62c92
PRODUCTION_HEALTH=PASS (loopback/public health 200; readiness 200)
SCHEMA_VERSION=v25
MIGRATION_HISTORY=001-025
SQLITE_INTEGRITY=ok
FOREIGN_KEY_VIOLATIONS=0
DURABLE_JOB_EVIDENCE=PASS (38 failed / 13 succeeded; aggregate state only)
GITHUB_ACTIONS_READ=PASS (authorized in-app browser)
CHECKPOINT_COMMITTED=PASS (incident repair ccde12d)
CHECKPOINT_PUSHED=PASS (remote ccde12d verified)
RECOVERY_TASK_PRODUCTION_DATA_CHANGED=false
APPLICATION_DEPLOYED=false
NEW_CREDENTIAL_CREATED=false
```

## Next Action
Closed with the incident. No further recovery action.
