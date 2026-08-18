# L2-CREDENTIALRESET01 — Owner-Assisted Credential Reset

## Task ID
L2-CREDENTIALRESET01 — Owner-Assisted Credential Reset

## Goal
Replace the unnecessary authenticated self-service password-change product surface with a simple Owner-authorized reset flow suitable for AcademicCloud's small invitation-only known-member operating model.

## Scope
- Remove ordinary authenticated self-service password-change UI/navigation.
- Retire or disable the self-service password-change HTTP/product path so it is not merely hidden in the frontend.
- Add an Owner-only action in Member administration to issue a bounded one-time credential-reset capability for a selected active/disabled Member as allowed by account lifecycle rules.
- Store only a digest/verification representation of the reset secret; never store the plaintext reset capability.
- Give the Owner a one-time link/code to deliver privately to the Member. No SMTP/SMS/OAuth infrastructure is introduced.
- The Member uses the capability on a dedicated reset surface to choose the final password. The Owner must not learn the final password.
- Final password hashing reuses the existing bounded Argon2id executor and authentication security baseline.
- Successful reset consumes the capability atomically, advances/revokes authentication state as appropriate, and invalidates old sessions.
- Reset capability has a short explicit expiry, is single-use, non-enumerable, and safe under concurrent redemption/reissue.
- Reissuing a reset invalidates or supersedes prior outstanding reset capability for the same account according to a deterministic contract.
- Login page may show a quiet `无法登录？请联系管理员。` hint; do not add fake automated “forgot password” recovery.

Historical relationship: `L2-PASSWORD01` remains valid evidence for bounded Argon2id/CAS/session-revocation behavior, but ADR-022 supersedes its self-service product requirement. Reuse those safe primitives without retaining the old UI or HTTP path.

## Non-goals
- No email, SMTP, SMS, OAuth, public recovery, security questions, or support-ticket system.
- No Owner-set permanent password.
- No account hard deletion or username reuse.
- No production deployment in this task.

## Acceptance Criteria
- No ordinary logged-in Owner or Member sees or can call the old self-service password-change product endpoint.
- Owner can initiate a reset only for an authorized Member target and cannot retrieve the Member's current password or final replacement password.
- Reset link/code is returned only at creation time; database persists only bounded digest/state metadata.
- Expired, consumed, superseded, malformed, or wrong-account reset capabilities fail without account-existence disclosure beyond the already authenticated Owner administration boundary.
- Exactly one concurrent reset redemption wins; successful redemption invalidates all prior sessions and prevents a pending old-password login from reviving a stale session.
- Disabled/archived lifecycle semantics are explicit and safe: a reset does not silently re-enable an account.
- Argon2id concurrency/memory limits remain unchanged.
- Focused backend/persistence/frontend tests, migration tests if persistence is added, typecheck/build, and one security-focused review pass.

## Relevant ADRs
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- historical `ADR-013-authenticated-password-change-model.md`
- `docs/decisions/ADR-024-owner-assisted-credential-reset.md`

## Relevant Modules / Files
- append-only database migration after schema v16
- account/auth/session repositories and bounded password hasher
- Owner account-administration and anonymous reset HTTP boundaries
- login/member-administration frontend surfaces and focused security tests

## Current State
Complete and independently green after the synchronized RF-SHAREDDEFAULT01 checkpoint `51c3d7b82d05574e53849c6ef1b5eec0e9ceabc5`. Development schema head is v17; production remained closed and unchanged at v15.

## Completed
- Recovered the exact task contract and historical password-change security primitives.
- Added append-only migration 017 with immutable digest-only reset capability state, one-outstanding-per-Member enforcement, terminal consumed/superseded transitions, and credential-reset audit vocabulary.
- Added an active-Owner-only issue boundary for active/disabled Members. Raw 256-bit capability material is returned once; reissue atomically supersedes prior outstanding state. Owner/archived targets are rejected.
- Added dedicated anonymous same-origin redemption with a 30-minute expiry, stable generic capability failures, shared bounded Argon2id hashing, exactly-one concurrent winner, atomic password/auth-revision update, capability consumption, revoke-all sessions, and audit evidence.
- Preserved lifecycle separation: disabled Members may choose a new password but remain disabled; archived accounts cannot be issued or redeemed.
- Removed authenticated `POST /api/auth/password` routing and all self-service password-change navigation/UI. Added the quiet login hint, Owner one-time-link display, and Member reset form without persisting secrets in browser storage or URLs.
- Recorded ADR-024 and updated authentication/security documentation and development schema expectations.

## Remaining
- Publish the clean Epic checkpoint, verify exact local/remote synchronization, then select `L1-UX05`.

## Blockers
None.

## Last Verification
2026-08-18: backend full suite PASS 258/258, followed by final directly affected reset/migration verification PASS 7/7 after adding the exact-expiry/stale-login case; frontend full suite PASS 164/164 and final directly affected App/API/mobile verification PASS 121/121; backend/frontend typecheck PASS; backend/frontend production build PASS; `git diff --check` PASS after documentation cleanup. Tests cover digest-only persistence, 30-minute expiry, single-use and deterministic supersession, concurrent single winner, old-session revocation, pending old-password login rejection, active/disabled/archived lifecycle, Owner/Member authorization, generic failure responses, retired self-service route, and browser-secret non-persistence. Focused security review found no remaining capability, authorization, migration, data-integrity, or rollback defect. No production, main, OCR/RAG, or destructive data action occurred.

## Next Action
Run the final focused verification/build and diff review, checkpoint/push this Epic, verify exact synchronization, then select `L1-UX05`.
