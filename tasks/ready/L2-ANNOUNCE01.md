# L2-ANNOUNCE01 — Global Homepage Announcements

## Task ID
L2-ANNOUNCE01 — Global Homepage Announcements

## Goal
Give the Owner a small database/API-backed way to publish time-bounded global announcements that every authenticated AcademicCloud user can see on the homepage.

## Scope
- Add persistent global announcements with exactly these product fields: `title`, `body`, `severity`, `link_url`, `is_active`, `published_at`, `expires_at`, `created_by_account_id`, `created_at`, and `updated_at`, plus an opaque server-generated identifier.
- Restrict `severity` to `info | warning | critical`.
- Allow the authenticated Owner to create, edit, publish, and unpublish announcements through a reusable server-side authorization boundary.
- Treat “Owner/Admin” in this MVP as Owner administration authority supplied by `L2-ACCOUNTS01`; this task does not add a third global `admin` role or weaken the exact `owner | member` role model.
- Allow every authenticated active account to read currently effective announcements.
- Define an effective announcement as active, published at or before the authoritative server time, and either without an expiry or expiring after the authoritative server time.
- Omit expired, unpublished, future-published, and inactive announcements from the authenticated homepage response without requiring a cleanup job.
- Render current announcements on the existing homepage with severity conveyed by text/semantics as well as color.
- Keep links nullable and validate any supplied link as a safe supported URL before storage and rendering.
- Use the existing database, API, session, exact-origin, error, audit, accessibility, responsive-layout, and zero-descriptive-copy conventions.
- Preserve strict account isolation for drive data; announcements are global read-only content and do not grant access to another account's resources.

## Non-goals
- No new global role and no arbitrary role administration.
- No public/unauthenticated announcement feed.
- No email, push, SMS, or external notification delivery.
- No read receipts, view counters, acknowledgement workflow, or per-user dismissal state.
- No notification center or inbox.
- No complex rich-text/HTML editor; body remains safe plain text for the MVP.
- No announcement attachments or OSS objects.
- No production migration, deployment, or production content creation.
- No hard-coded frontend announcement configuration.
- No new dependency unless the accepted stack is demonstrably insufficient and the workflow's dependency gate is satisfied.

## Acceptance Criteria
1. The next additive migration creates the announcement model without editing historical migrations and passes fresh, prior-schema, replay, checksum, integrity, backup, and isolated-restore checks.
2. Database constraints enforce required fields, severity, timestamps, nullable link/expiry semantics, and a valid creator account reference.
3. Owner create returns safe announcement data; Member create is denied server-side.
4. Owner edit may change the approved mutable fields without changing identifier or creator attribution; Member edit is denied.
5. Owner publish/unpublish transitions are explicit, repeatable, and do not silently rewrite content; Member transitions are denied.
6. Authenticated Owner and Member reads return the same currently effective global announcement set.
7. Unauthenticated reads are denied using the established authentication contract.
8. Inactive, unpublished, future-published, and expired announcements are omitted at the exact server-time boundaries.
9. Ordering is deterministic and tested for multiple simultaneously effective announcements.
10. Nullable links work; unsafe or unsupported links are rejected before persistence and cannot become executable markup.
11. Homepage renders the current set responsively at desktop and mobile widths, with accessible severity semantics and no fifth mobile navigation item.
12. Announcement content is database/API-backed; frontend tests prove no hard-coded production announcement fallback.
13. API inputs never supply or override creator identity, account role, or authoritative timestamps.
14. Existing drive, Favorites, authentication, invitation, and account-administration behavior remains unchanged and isolated.
15. Canonical backend/frontend tests, typecheck, build, compiled acceptance, migration/diff/secret checks pass with zero unnecessary dependency delta.
16. A dedicated adversarial review attacks authorization bypass, stored-content injection, link validation, publish/expiry boundary races, deterministic ordering, account-state enforcement, and accidental cross-account data exposure before checkpoint.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- Accounts-specific ADR created by `L2-ACCOUNTS01`, if one exists.

## Relevant Modules / Files
- next database migration after `L2-ACCOUNTS01`
- account/Owner authorization policy established by `L2-ACCOUNTS01`
- announcement domain/service/repository and SQLite implementation
- authenticated Fastify announcement routes and DTOs
- frontend API/homepage/i18n/styles/tests
- migration, authorization, time-boundary, injection, and integration tests

## Current State
Approved Ready, not started. The Owner approved this task after `L2-ACCOUNTS01`; the current repository has no announcement schema, API, or homepage implementation.

## Completed
- MVP product contract and sequencing recorded durably on 2026-08-17.
- Dependency on the future Accounts I Owner authorization boundary made explicit.

## Remaining
- wait until `L2-ACCOUNTS01` is fully green, independently reviewed, and checkpointed;
- recover the final Accounts role/authorization model and actual next migration number;
- design the minimal announcement schema/API/homepage integration;
- implement the full acceptance matrix without expanding into notifications or rich text;
- run adversarial review, canonical gates, state reconciliation, and a task-level checkpoint.

## Blockers
Do not begin implementation before `L2-ACCOUNTS01` is fully green and independently checkpointed. Stop for any need to introduce a new global role, unsafe rich content, production access, irreversible migration ambiguity, or an unapproved dependency/product boundary.

## Last Verification
2026-08-17 Owner authorization: `L2-ANNOUNCE01` is an approved future task after Accounts I. Repository inspection confirmed Accounts I currently specifies exactly `owner | member`, so this card reuses Owner administration authority and does not silently add an `admin` role.

## Next Action
After `L2-ACCOUNTS01` is green and checkpointed, move this card to `tasks/doing/`, recover the final account/authorization implementation, and begin with the migration and server-authoritative authorization/time invariants before frontend work.
