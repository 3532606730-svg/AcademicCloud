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

## Acceptance Criteria
- No ordinary logged-in Owner or Member sees or can call the old self-service password-change product endpoint.
- Owner can initiate a reset only for an authorized Member target and cannot retrieve the Member's current password or final replacement password.
- Reset link/code is returned only at creation time; database persists only bounded digest/state metadata.
- Expired, consumed, superseded, malformed, or wrong-account reset capabilities fail without account-existence disclosure beyond the already authenticated Owner administration boundary.
- Exactly one concurrent reset redemption wins; successful redemption invalidates all prior sessions and prevents a pending old-password login from reviving a stale session.
- Disabled/archived lifecycle semantics are explicit and safe: a reset does not silently re-enable an account.
- Argon2id concurrency/memory limits remain unchanged.
- Focused backend/persistence/frontend tests, migration tests if persistence is added, typecheck/build, and one security-focused review pass.

## Historical Relationship
`L2-PASSWORD01` remains valid historical evidence for bounded Argon2id/CAS/session-revocation behavior, but ADR-022 supersedes its self-service product requirement. Reuse safe primitives; do not retain the old UI merely because the implementation exists.

## Non-goals
- No email, SMTP, SMS, OAuth, public recovery, security questions, or support-ticket system.
- No Owner-set permanent password.
- No account hard deletion or username reuse.
- No production deployment in this task.

## Relevant ADRs
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- historical `ADR-013-authenticated-password-change-model.md`

## Verification
Keep verification focused on capability secrecy, expiry/single-use, concurrent redemption, session revocation, disabled/archived state, and no retention of the final password. Do not replay unrelated production acceptance.

## Next Action
Implement as a bounded Layer-2 correction in the current first-use repair queue. Production rollout remains separately Owner-gated.
