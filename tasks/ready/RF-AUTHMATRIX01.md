# RF-AUTHMATRIX01 — Cross-Plane Authorization Matrix Verification

## Task ID
RF-AUTHMATRIX01 — Cross-Plane Authorization Matrix Verification

## Goal
Prove the complete authorization/non-disclosure matrix across Physical Artifacts, Scholarly Records, Personal Research Overlays, Libraries, Governance, exports, recovery, and the future Derived contract.

## Scope
Create a canonical test fixture/matrix for Owner and Member accounts; active/disabled/session states; account and multiple Library domains; manager/member/contributor/nonmember; private/shared resources; every Personal Overlay type; audit/statistics; contribution/catalog/provenance; export/snapshot; and future derived-source access. Drive all existing HTTP/service/repository policies through shared effective-authority helpers and remove any duplicated/bypassing access path found. Documentation records the matrix. No migration/dependency is expected.

## Non-goals
- No new product permission/role, global super-admin research view, production penetration test, public sharing, OCR/index/retrieval execution, or policy relaxation to make tests pass.

## Acceptance Criteria
- Every matrix cell is explicit allow/deny/non-disclosing; no required case is inferred from global role alone.
- Owner has no implicit read over another account's overlays; Library access never exposes another member's overlays; audit is governance-only.
- Duplicate/search/export/snapshot/derived checks apply authority before existence/count/content and have no inaccessible-resource side channel in contract/status/shape.
- Disabled accounts/sessions and membership/role changes revoke effective access deterministically without deleting state.
- Client authority-field injection and confused-deputy service calls are rejected across all APIs.
- Shared effective-authority helpers are reused; any necessary refactor is behavior-preserving and bounded with complete regression tests.
- Full backend/frontend/typecheck/build/compiled/backup/artifact gates pass with zero migration/dependency delta.
- Independent review focuses on missing matrix cells, alternate/bypass paths, status/timing/count leaks, global-role escalation, and policy/document drift.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- Accounts, ownership, Library, export, integrity, and recovery decisions

## Relevant Modules / Files
- all auth/authorization, research, overlay, Library, audit, export, recovery services/HTTP
- canonical authorization matrix fixtures/tests/docs
- compiled acceptance and artifact verification

## Current State
Blocked on `RF-RECOVERY01`. Earlier tasks have task-specific authorization tests; the complete cross-plane matrix does not yet exist.

## Completed
- ADR-014 supplies the governing data-plane rules.
- RF-PLAN01 separated this proof task from integrity monitoring/recovery.

## Remaining
- enumerate every actor/domain/resource/plane/action cell;
- implement fixtures and consolidate bypassing authority paths;
- run the complete canonical/runtime matrix and secret/leak scans;
- independently review and checkpoint.

## Blockers
A matrix conflict requiring a new role, cross-plane visibility, or production/security-policy change must stop for Owner/ADR review rather than weakening a test.

## Last Verification
2026-08-17 baseline has strong account/Drive tests but no future research/Library/derived cross-plane matrix.

## Next Action
After `RF-RECOVERY01`, write the matrix before code changes, then repair only proven authority inconsistencies and run every canonical gate.
