# ADR-009 — Layer 1 Authentication Security Baseline

**Date:** 2026-08-12
**Status:** Accepted
**Scope:** Layer 1 — Authentication & Authorization

## Context

Layer 1 needs revocable authentication that survives application restarts without Redis or JWT lifecycle complexity. Password verification must resist offline attacks while leaving safe memory headroom on the 512 MB production server. The same-origin React SPA and Fastify API also need a narrow CSRF and cookie policy that does not depend on a separate service.

ADR-007 selected SQLite-backed opaque sessions and preferred Argon2id, while deferring the exact package, password parameters, concurrency limit, session lifetime, cookie policy, and CSRF mechanism to this task.

## Decision

### Password hashing

- Use the maintained `argon2` Node.js package and its Argon2id implementation.
- Store the package-generated PHC string in the account record. Each hash includes its random salt and parameters.
- Use `memoryCost=65536` KiB, `timeCost=3`, `parallelism=1`, and `hashLength=32`.
- Permit one active password KDF operation and at most four queued operations per application process. Reject additional work with HTTP 429.
- Verify a fixed valid dummy Argon2id hash for unknown login names so the normal unknown-account path still pays the password-verification cost.
- Do not introduce a password pepper until the project has an approved independent secret lifecycle and recovery procedure.

The selected parameters exceed the OWASP minimum of 19 MiB, two iterations, and one lane. They follow the RFC 9106 memory-constrained profile direction while keeping only one 64 MiB KDF allocation active on the 512 MB host.

### Sessions

- Generate session secrets from 32 cryptographically random bytes and encode them with base64url.
- Return the original secret only in the browser cookie. Persist only its SHA-256 hexadecimal digest, account reference, creation time, absolute expiry, and optional revocation time in SQLite.
- Use a seven-day absolute lifetime. Authorization checks always validate expiry, revocation, and the current account state; cleanup timing is not part of authorization correctness.
- Reauthentication replaces and revokes a previously presented session. Logout revokes the presented session and clears the cookie.
- Use the reusable Fastify guard to derive the authenticated account on the server. Ownership-sensitive code must not accept a client-provided owner identifier.

### Cookies and CSRF

- Production uses `__Host-ac_session` with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain`, and the same seven-day bound as the server session.
- Local HTTP development uses the distinct `ac_session` name, omits `Secure`, and scopes it to `/api`.
- Every unsafe `/api` method requires an `Origin` header exactly equal to the validated `APP_ORIGIN`; production requires an HTTPS origin. Requests marked `Sec-Fetch-Site: cross-site` are rejected.
- Login accepts JSON only and has an in-process per-client rate limit. This matches the approved single-process topology and adds no Redis dependency.

The combination of exact-origin enforcement and `SameSite=Strict` is the Layer 1 synchronizer for the same-origin SPA. If a future topology requires cross-origin clients, the CSRF policy must be redesigned before enabling them.

## Consequences

- Password verification has a deliberate native-memory and CPU cost, bounded by the KDF executor and login limiter.
- Sessions can be revoked and survive restarts without exposing replayable secrets in a database-only compromise.
- A process restart resets the in-memory login limiter. Nginx-level complementary limits may be added during deployment hardening, but authorization does not depend on them.
- The native Argon2 package must be installed for the target Ubuntu/Node platform; Windows `node_modules` must never be copied to production.
- Seven-day absolute sessions favor a personal private-cloud workflow over short interactive sessions. A future idle timeout or long-term rotation policy requires a measured database-write and concurrency design.

## Verification and Revisit Criteria

Local Node.js `v24.16.0` measurements on Windows 11 showed roughly 97 ms for hashing, 94 ms for verification, and a sampled RSS increase of about 65 MiB with the selected parameters. The deployment task must rerun the benchmark on the final Ubuntu build and retain at least 128 MiB of total-system headroom under representative authentication load.

Revisit this decision if the target host cannot meet the memory/latency gate, Node's native Argon2 support gains a mature PHC/verification wrapper, the application moves beyond one process, or cross-origin/mobile clients are approved.

## References

- [RFC 9106 — Argon2 Memory-Hard Function](https://www.rfc-editor.org/rfc/rfc9106.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [node-argon2](https://github.com/ranisalt/node-argon2)
