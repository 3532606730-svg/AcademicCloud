# L1-BUGAUDIT01 — Cross-Layer Hidden Bug Hardening

## Task ID
L1-BUGAUDIT01 — Cross-Layer Hidden Bug Hardening (final hardening layer before
UX02 production-readiness; followed by L1-FAV01 on the same branch).

## Goal
Harden six hidden cross-layer boundaries discovered by full-diff review:
production-CSP-safe row menus, environment-independent upload recovery
identity, fail-closed production migrations, bounded inline preview sizes,
correct modal focus restoration, and app-wide external drop protection.

## Scope
- A1 RowMenu: zero runtime inline `style` positioning (production CSP is
  style-src 'self'); CSS trigger-relative positioning + upward-flip class;
  catalogue clipping ancestor removed with corner-radius treatment instead.
- A2 Recovery identity: NFC filename + exact size + exact MD5; browser MIME
  no longer part of pending-upload recovery identity.
- A3 Production startup fails closed on missing/not-current schema; explicit
  db:migrate:prod remains the only production schema mutation path. Dev/test
  keep automatic migrations.
- A4 Inline preview size policy (backend-authoritative): pdf 512 MiB, images
  128 MiB, text 16 MiB → preview_too_large (503, service-style); downloads
  unaffected.
- A5 RowMenu→modal focus restore to the originating row trigger (Preview/Move).
- A6 Document-level external file-drop protection (no browser file navigation
  anywhere in the app; text/link/internal drags untouched).

## Non-goals
- No pagination, Shared Library, recursive folder recycle, backup automation,
  certificate renewal, pluralization framework, maintenance scheduler,
  search/tags/recent, or permanent-delete changes.
- No CSP weakening (no unsafe-inline/unsafe-eval), no new dependencies,
  no production deployment, no production DB migration.

## Acceptance Criteria
All six fixes implemented with regression tests; `npm test`, `npm run
typecheck`, `npm run build`, `npm run test:acceptance-tools`, `git diff
--check`, targeted secret scan PASS; zero dependency delta; production CSP
file untouched. `BUGAUDIT01_PHASE_A_PASS=true`.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files
- `frontend/src/App.tsx`, `frontend/src/recovery-identity.ts`,
  `frontend/src/i18n.ts`, `frontend/src/styles.css`, frontend tests
- `backend/src/platform/application.ts`,
  `backend/src/persistence/sqlite/migrations.ts`,
  `backend/src/drive/drive-service.ts`, `backend/src/drive/http.ts`,
  backend platform/drive tests

## Current State
Phase A complete; all gates PASS (backend 115/115, frontend 83/83, typecheck,
build, acceptance 25/25, diff-check clean, 0 diff secret hits, zero dependency
delta). Committed as "fix: harden cross-layer production boundaries" on
`codex/l1-bugaudit01-fav01`. Proceeding to Phase B (L1-FAV01) on the same
branch per Owner authorization.

## Completed
- A1 CSP-safe RowMenu (no inline styles, upward-flip class, unclipped
  catalogue) + no-style-attribute regression test.
- A2 NFC/size/MD5 recovery identity + unit tests (NFD/NFC, MIME difference,
  checksum/size/name mismatches) + App-level MIME-difference renewal test.
- A3 production migration fail-closed startup + 5 startup tests (dev
  initialize, prod current OK, prod pending fails without applying, explicit
  runner applies, prod uninitialized refuses).
- A4 preview size limits + preview_too_large (503) + boundary tests
  (exact-limit OK, +1 rejected, download unaffected, unsafe MIME independent)
  + HTTP-level 503 test.
- A5 modal focus restore to row trigger + Preview/Move focus tests.
- A6 app-wide external file-drop protection + topbar drop/no-hijack tests.

## Remaining
- Phase B: L1-FAV01 (separate task card + separate commit, same branch).

## Blockers
None.

## Last Verification
2026-08-16 (Phase A gates): backend 115/115, frontend 83/83, typecheck PASS,
build PASS, acceptance-tools 25/25, `git diff --check` clean, secret scan over
the diff 0 hits, "unsafe-inline" diff hits = 2 explanatory comments only (no
CSP change; deployment/nginx CSP templates untouched), dependency delta 0.
`BUGAUDIT01_PHASE_A_PASS=true`.

## Next Action
Proceed to Phase B (L1-FAV01) per Owner continuous authorization.
