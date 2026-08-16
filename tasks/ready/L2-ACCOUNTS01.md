# L2-ACCOUNTS01 — Account Foundation, Invite Registration & User Administration

## Task ID
L2-ACCOUNTS01 — Account Foundation, Invite Registration & User Administration

## Goal
Turn AcademicCloud from a single-owner/private-drive account model into a controlled multi-user private academic cloud where the Owner can invite Members, Members can register only through valid invitations, and the Owner can safely disable/re-enable Member access.

## Scope

### Global account roles
- Add exactly two global roles: `owner | member`.
- Enforce role in the database (`NOT NULL` + valid-role check or equivalent).
- Authenticated server identity may expose safe fields `id`, `loginName`, `role`; never expose `passwordHash`.
- Account state remains `active | disabled` and remains authoritative during session resolution.

### Legacy migration
For the role migration:
- existing account count = 0 → migration succeeds and creates no account;
- existing account count = 1 → that existing account becomes `owner`;
- existing account count > 1 → migration fails closed and atomically; never guess/promote all/choose one heuristically.
- Preserve existing account IDs and all file/folder/Favorite ownership relationships.
- Never edit historical migrations; use the actual next migration after FOLDER01.

### Bootstrap first Owner
The existing provisioning path becomes a first-Owner bootstrap:
- 0 accounts → may create one active Owner;
- >=1 account → refuses ordinary account creation;
- subsequent normal users must enter through invitation registration.
- Never print/log passwords or hashes.

### Owner authorization boundary
- Add a reusable server-side Owner guard/policy.
- UI visibility is not authorization.
- Members directly calling Owner APIs must be denied according to established auth/error conventions.

### Invitations
Owner may create/list/revoke unused invitations.

Token requirements:
- at least 32 cryptographically random bytes;
- base64url raw token;
- database stores only SHA-256 digest, never raw token;
- raw token may be returned exactly once by creation response;
- default expiry = 7 days;
- raw token never appears in database, logs, audit logs, localStorage, sessionStorage, cookies, committed docs, or normal screenshots.

Invitation record is equivalent to:
- id
- token digest
- created_by account
- created_at
- expires_at
- consumed_at
- consumed_by account
- revoked_at

Listing invitations exposes safe metadata/status only, never the raw token/digest unless an internal implementation absolutely requires a non-public identifier.

Preferred invitation URL shape is fragment-based, e.g. `/#/invite/<RAW_TOKEN>`, so the raw capability is not sent in the initial HTTP request target.

### Invite-only Member registration
Registration input is conceptually:
- invite token
- login name
- password

No email, role selector, profile form, or public signup.

Server-authoritative result role is always `member`.

Redemption must be race safe:
1. digest raw token;
2. initial validation;
3. validate account fields;
4. Argon2 hash password outside the long write transaction;
5. begin write transaction;
6. re-read/revalidate invite inside transaction (exists, unexpired, unrevoked, unconsumed);
7. re-check login-name availability;
8. create Member;
9. conditionally consume exactly the same invitation;
10. if consume transition does not succeed exactly once, rollback account creation;
11. commit.

Must remain safe when invitation expires or is revoked while password hashing is in progress.

Invalid/expired/revoked/consumed invitation responses to unauthenticated clients should avoid unnecessary capability-state enumeration. Registration is rate-limited using the existing bounded auth/KDF infrastructure.

### Minimal Owner user administration
Owner can view safe account rows:
- login name
- role
- state
- created time

Owner may disable/re-enable **Members**.

Disable Member:
- account state becomes disabled;
- revoke all sessions belonging to that account;
- existing session cookies/secrets immediately stop authorizing.

Enable Member:
- state becomes active;
- previously revoked sessions remain revoked;
- Member must log in again.

Current scope rejects Owner/self targets for disable/enable rather than generalizing into role administration.

### Frontend
- zero-descriptive-copy continues;
- no fifth mobile bottom-nav item;
- Owner admin/invite entry belongs naturally under AccountMenu or another restrained existing surface;
- Member does not see Owner-only controls, but server enforcement remains authoritative;
- registration/admin UI must remain usable at mobile widths and preserve existing scholarly/editorial design.

### Cross-account isolation
Strengthen direct API tests proving Member cannot operate on another account's:
- folder
- file
- Favorite
- pending upload
- recycle item
- Preview
- Download
- Move/Rename/Restore
- recursive folder root

## Non-goals
- No public signup.
- No email/SMTP/email verification.
- No forgot-password/email reset.
- No OAuth/social login/captcha.
- No account deletion.
- No arbitrary role editing or Member→Owner promotion UI/API.
- No Owner demotion.
- No Shared Library membership or Trusted Contributor.
- No One-Time External Sharing.
- Password Change is a separate optional task (`L2-PASSWORD01`).
- No production account/invite creation, production migration, or deployment.
- No new dependency unless current stack is demonstrably insufficient; if a dependency appears genuinely necessary, stop before adding it.

## Acceptance Criteria

### Migration/account foundation
1. empty DB → role migration succeeds, no account auto-created;
2. exactly one legacy account → becomes Owner;
3. >1 legacy accounts → migration fails atomically;
4. first bootstrap on empty migrated DB → Owner;
5. second bootstrap attempt → fails;
6. invited registration → Member;
7. restart/reload preserves roles;
8. migration replay/current-schema checks remain correct;
9. existing account IDs and file/folder/Favorite ownership remain unchanged.

### Invitations/registration
1. Owner create → raw token returned once, DB stores digest only;
2. Member create/list/revoke invite → denied;
3. Owner list → raw token absent;
4. revoke unused invite → later registration rejected;
5. expired invite rejected;
6. consumed invite cannot be reused;
7. concurrent redemption of same invite → exactly one Member, exactly one consume;
8. revoke during password hash → registration fails;
9. expiry during password hash → registration fails;
10. duplicate login conflict does not orphan account or incorrectly consume invite; preferred behavior is full rollback with invite remaining usable if still valid;
11. injected failure after account insert/before invite consume → full rollback;
12. raw token absent from logs/browser persistent storage/committed evidence;
13. registration rate limit/KDF overload behavior remains bounded.

### User administration
1. Owner lists safe account DTOs only;
2. Member admin/list API denied;
3. Owner disables Member → state disabled;
4. all Member sessions revoked;
5. disabled Member session immediately rejected;
6. Owner enables Member → active;
7. old sessions remain invalid after enable;
8. fresh login after enable succeeds;
9. Member disable/enable attempts denied;
10. Owner self-disable/Owner-target mutation rejected under current scope;
11. no account-delete route;
12. no role-edit route.

### Integration/security
- current Argon2/session/cookie/exact-origin security baseline preserved;
- server never trusts client role/owner IDs;
- no password/session/invite secret leakage;
- Favorites remain per-user;
- account roles do not alter existing drive ownership;
- production startup remains fail-closed on outdated schema;
- canonical tests/typecheck/build/acceptance/diff/secret checks pass;
- dependency delta remains zero;
- dedicated adversarial security/race review PASS before checkpoint.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

A new Accounts-specific ADR may be added during implementation if the final schema/capability/session-admin model introduces durable details not already captured here.

## Relevant Modules / Files
- next database migration after FOLDER01
- `backend/src/auth/*`
- account/session repository interfaces and SQLite implementations
- account bootstrap operation/CLI
- Fastify auth/admin/invite HTTP routes
- frontend API/session/App/AccountMenu/i18n/styles/tests
- cross-account drive/Favorites tests

## Current State
Ready, not started. Current schema has account id/login/password hash/state/timestamps but no role. Current account repository supports create/find only. Current authentication/session foundation is already accepted and should be extended, not replaced.

## Completed
None.

## Remaining
- inspect actual post-FOLDER01 migration number and current auth/persistence conventions;
- design role/invitation schema and Owner guard;
- implement migration/bootstrap;
- implement invitation service/API and race-safe redemption;
- implement minimal zero-copy registration/admin UI;
- implement disable/enable + revoke-all-sessions;
- strengthen cross-account tests;
- run adversarial security/race review and repair;
- full gates/state reconciliation/checkpoint.

## Blockers
None known. Stop only for a genuine security/product-model contradiction, unavoidable new dependency, irreversible migration ambiguity, production/credential need, or another mandatory escalation boundary.

## Last Verification
2026-08-17 planning reconciliation: Accounts I is explicitly approved as the first Layer 2 Epic after Core Drive closure. No Accounts I code/migration has been implemented on baseline `dd42cab…`.

## Next Action
After L1-FOLDER01 is fully green and checkpointed, move this task to `tasks/doing/`, recover the current post-FOLDER schema/auth implementation, and begin with migration/security invariants before UI.
