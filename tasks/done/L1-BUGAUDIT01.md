# L1-BUGAUDIT01 — Cross-Layer Hidden Bug Hardening

## Task ID
L1-BUGAUDIT01 — Cross-Layer Hidden Bug Hardening

## Goal
Harden hidden cross-layer boundaries before later UX/Favorites work: CSP-safe row menus, environment-independent upload recovery identity, fail-closed production migrations, bounded inline preview sizes, correct modal focus restoration, and app-wide external drop protection.

## Scope
- CSP-safe RowMenu positioning with zero runtime inline styles.
- Upload recovery identity based on NFC filename + exact size + exact MD5.
- Production startup fail-closed on missing/not-current schema.
- Backend-authoritative inline preview limits.
- RowMenu→modal focus restoration.
- Global external-file drop protection without breaking ordinary drags.

## Non-goals
No Favorites implementation, recursive folder recycle, Shared Library, account registration, production deployment, OCR, or RAG.

## Acceptance Criteria
All six hardening areas implemented with regression tests; canonical checks green; dependency delta zero; production CSP not weakened.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files
Frontend App/styles/recovery/i18n/tests and backend platform/migrations/drive/tests.

## Current State
**Complete in repository development; independent review PASS.** Later UX03 review reconfirmed the accepted drop-guard, RowMenu focus, CSP, and fail-closed migration boundaries.

## Completed
- CSP-safe RowMenu.
- NFC/size/MD5 recovery identity.
- production migration fail-closed startup.
- preview size limits.
- modal focus restore.
- app-wide external-file drop protection.
- targeted/full automated gates.
- independent review PASS.

## Remaining
None. Do not reopen absent concrete regression evidence.

## Blockers
None.

## Last Verification
2026-08-17 repository reconciliation: implementation remains present in the accepted descendant line and later independent UX03 review found no regression in the protected boundaries.

## Next Action
No task action. Preserve these invariants in later Epics.
