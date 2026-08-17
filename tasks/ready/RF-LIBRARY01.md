# RF-LIBRARY01 — Library Domains, Membership, and Permissions

## Task ID
RF-LIBRARY01 — Library Domains, Membership, and Permissions

## Goal
Create Shared Library as a real ownership and authorization domain with bounded membership/permissions, without using a shared folder or exposing Personal Research Overlays.

## Scope
Record a Library authorization ADR and implement Library entities backed by the `RF-OWNERSHIP01` domain substrate, active-account membership, minimal Library-scoped manager/member permissions, stable IDs, strict repository/service/API, and responsive administration/access UI. Define last-manager and disabled-account behavior. Library domain creation creates no files/resources and grants no implicit access to personal records. Add append-only migration(s).

## Non-goals
- No Trusted Contributor/review workflow, catalog, Library Tags, provenance governance, public access, external invitation, shared folder, resource transfer, or personal-overlay sharing.
- No assumption that global Owner can read Library resources without explicit effective Library authority; governance powers must be separately enumerated.

## Acceptance Criteria
- Library is an explicit ownership-domain row plus Library metadata, never a folder naming convention or contributor-account alias.
- Membership/permissions are server-derived and Library-scoped; clients cannot set Library role, owner domain, actor, creator, or account authority.
- Exact global Owner governance versus Library membership/content authority is recorded in ADR/tests; neither grants access to another account's Personal Research Overlay.
- Add/remove/change membership is transactional, revision/CAS or conflict-safe, idempotent on replay, and protects the last effective Library manager.
- Disabled accounts lose access immediately without deleting membership/history/resources; re-enable does not revive revoked sessions.
- Nonmembers and nonexistent Library/resource cases are non-disclosing; membership lists are limited to authorized governance.
- Required membership/permission decisions emit credential/content-free `RF-AUDIT01` events; private research reads/writes remain unaudited.
- UI/API tests cover Owner/Member, manager/member/nonmember, disabled account, concurrent manager removal, authority injection, mobile/accessibility, migration, backup/restore, and compiled acceptance.
- Independent review focuses on implicit global power, confused deputy, last-manager race, domain/FK integrity, membership leakage, and overlay exposure.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-OWNERSHIP01`, `RF-AUDIT01`, and private model decisions
- new Library authorization ADR required

## Relevant Modules / Files
- `database/migrations/`
- new Library domain/repository/service/HTTP modules
- ownership, auth/accounts, audit, persistence/application modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- permission/migration/backup/compiled acceptance tests

## Current State
Blocked on the full private model through `RF-EXPORT01`. Ownership-domain infrastructure exists only after earlier work; no Library row/membership is currently implemented.

## Completed
- ADR-014 defines Collaborative Overlay versus Personal Overlay.
- RF-PLAN01 sequences Library after private resource/overlay/export foundations.

## Remaining
- record exact Library/global authority matrix;
- implement domain/membership/permission persistence/API/UI;
- verify concurrency, disabled accounts, audit, migration, privacy, recovery;
- independently review and checkpoint.

## Blockers
Public/external membership, global super-admin content access, paid service, production migration, or any Library design that shares Personal Overlay requires Owner escalation.

## Last Verification
2026-08-17 baseline/global account roles have no Library-scoped authority; current folders/files are account-owned until `RF-OWNERSHIP01`.

## Next Action
After `RF-EXPORT01`, write the Library authorization ADR and tests before implementing the minimal domain/membership slice.
