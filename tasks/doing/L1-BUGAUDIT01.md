# L1-BUGAUDIT01 — Cross-Layer Hidden Bug Hardening

## Task ID
L1-BUGAUDIT01 — Cross-Layer Hidden Bug Hardening

## Goal
Harden hidden cross-layer production boundaries before later UX/Favorites work: CSP-safe row menus, environment-independent upload recovery identity, fail-closed production migrations, bounded inline preview sizes, correct modal focus restoration, and app-wide external drop protection.

## Scope
- CSP-safe RowMenu positioning with zero runtime inline styles.
- Upload recovery identity based on NFC filename + exact size + exact MD5; browser MIME is not part of identity.
- Production startup fails closed on missing/not-current schema; explicit migration command remains authoritative.
- Backend-authoritative inline preview limits.
- RowMenu→modal focus restoration.
- Global external-file drop protection without breaking text/link/internal drags.

## Non-goals
No Favorites implementation, recursive folder recycle, Shared Library, account registration, backup automation, certificate renewal, permanent-delete redesign, or production deployment.

## Acceptance Criteria
All six hardening areas implemented with regression tests; canonical tests/typecheck/build/acceptance/diff/secret checks PASS; zero dependency delta; production CSP not weakened.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files
- frontend App/styles/recovery/i18n/tests
- backend platform/migrations/drive/tests

## Current State
**Implementation complete and independently reviewed.**

ChatGPT independent review of the accepted baseline found no remaining BUGAUDIT01 blocker and later UX03 review reconfirmed the key boundaries (drop guard, RowMenu focus, CSP, fail-closed migration behavior) were preserved.

`INDEPENDENT_L1_BUGAUDIT01_REVIEW_PASS=true`

## Completed
- CSP-safe RowMenu.
- NFC/size/MD5 recovery identity.
- production migration fail-closed startup.
- preview size limits.
- modal focus restore.
- app-wide external file-drop protection.
- targeted/full automated gates.
- independent review PASS.

## Remaining
None for BUGAUDIT01. Do not reopen absent new evidence.

## Blockers
None.

## Last Verification
2026-08-17 repository reconciliation: BUGAUDIT01 implementation remains present in the accepted descendant baseline through `dd42cab…`; independent review PASS remains valid; no later regression was found in the UX03 independent review.

## Next Action
No task action. Preserve the accepted boundaries while executing later Epics.
