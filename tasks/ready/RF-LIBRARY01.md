# RF-LIBRARY01 — Library Domains, Membership, and Permissions

## Task ID
RF-LIBRARY01 — Library Domains, Membership, and Permissions

## Goal
Create the minimum real Shared Library ownership and authorization domain required for immediate multi-user sharing and contribution review, without using a shared folder or exposing Personal Research Overlays.

## Scope
Implement Library entities backed by the existing `RF-OWNERSHIP01` ownership-domain substrate, active-account membership, minimal Library-scoped manager/member permissions, stable IDs, strict repository/service/API boundaries, and responsive administration/access UI. Define last-manager and disabled-account behavior. Add the minimum Library holdings/read surface required for authorized members to list, preview, and download Library-owned resources. Library creation grants no implicit access to personal records. Add append-only migration(s) after the actual current development schema head.

This checkpoint is intentionally accelerated by Owner direction from its former post-`RF-EXPORT01` position because real first-use sharing is now the highest-priority product need. The acceleration does not waive ADR-014 privacy/ownership invariants.

## Non-goals
- No contribution/review workflow in this checkpoint; that is `RF-LIBRARY02` immediately after it.
- No Trusted Contributor, catalog, Library Tags, provenance governance, public access, external invitation, shared-folder shortcut, metadata expansion, OCR, or RAG.
- No assumption that global Owner can browse arbitrary Member-private Drive/resources without explicit effective Library/review authority.

## Acceptance Criteria
- Library is an explicit ownership-domain row plus Library metadata, never a folder naming convention or contributor-account alias.
- Membership/permissions are server-derived and Library-scoped; clients cannot set Library role, owner domain, actor, creator, or account authority.
- Exact global Owner governance versus Library membership/content authority is recorded in tests/decision notes; neither grants access to another account's Personal Research Overlay.
- Add/remove/change membership is transactional and conflict-safe, and protects the last effective Library manager.
- Disabled accounts lose Library access immediately without deleting membership/history/resources; re-enable does not revive revoked sessions.
- Nonmembers and nonexistent Library/resource cases are non-disclosing.
- Authorized Library members can immediately list, preview, and download Library-owned holdings through scoped authorization.
- Library resources remain independent of the contributor/uploader account remaining active.
- Relevant governance events are credential/content-free where the current audit substrate applies; private research reads/writes remain outside administrative surveillance.
- Focused backend/persistence/frontend tests cover manager/member/nonmember, disabled account, authority injection, last-manager behavior, holding access/non-disclosure, migration persistence, and responsive UI.
- Verification is intentionally bounded: relevant suites, one workspace typecheck/build pass, then one focused independent review. Do not run unrelated historical acceptance/backup/benchmark/artifact campaigns when changed-component evidence is green.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-OWNERSHIP01`, `RF-AUDIT01`, and private model decisions
- new concise Library authorization decision/ADR if required by implementation

## Relevant Modules / Files
- `database/migrations/`
- Library domain/repository/service/HTTP modules
- ownership, auth/accounts, audit, persistence/application modules
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- focused permission/migration/UI tests

## Current State
Owner-accelerated and Ready. `RF-OWNERSHIP01` and `RF-DOMAIN01` are complete, so the minimum safe Library substrate can now be implemented without waiting for `RF-META01` through `RF-EXPORT01`. Those unrelated Pre-OCR cards remain parked.

## Completed
- ADR-014 defines Collaborative Overlay versus Personal Overlay.
- RF-OWNERSHIP01 provides explicit future-Library ownership domains.
- RF-DOMAIN01 provides stable Scholarly Record/Artifact/Version identity.
- Owner explicitly reprioritized real sharing ahead of metadata/overlay/export work.

## Remaining
- define the minimum Library/global authority matrix;
- implement domain/membership/permission persistence/API/UI;
- implement scoped Library holdings read/preview/download;
- run focused privacy/authorization/migration verification;
- independently review once and checkpoint.

## Blockers
Public/external membership, global super-admin browsing of Member-private content, paid service, production migration/deployment, or any Library design that shares Personal Overlay requires Owner escalation.

## Last Verification
2026-08-17: ownership-domain and scholarly-identity prerequisites are complete in repository development; no Library row/membership/read surface is yet implemented.

## Next Action
Implement the minimum Shared Library substrate now, checkpoint it, then continue directly to `RF-LIBRARY02`.
