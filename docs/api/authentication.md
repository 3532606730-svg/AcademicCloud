# Authentication API

Layer 1 uses same-origin, server-side opaque sessions. The browser receives the session secret only as a cookie; SQLite stores its SHA-256 digest, expiry, and revocation state.

## Browser requirements

- Send unsafe `/api` requests with an `Origin` header exactly equal to `APP_ORIGIN`.
- Send login bodies as `application/json`.
- Allow credentials on same-origin requests. No CSRF token is used because the deployment is same-origin, cookies are `SameSite=Strict`, and unsafe requests require the exact origin.

## Routes

### `POST /api/auth/login`

Body:

```json
{
  "loginName": "Scholar",
  "password": "example-only"
}
```

Success returns `200` with the server-derived account identity and sets a seven-day cookie. Invalid credentials and disabled or unknown accounts all return the same `401` response. Repeated attempts are rate-limited; saturated password-hashing capacity returns `429`.

### `GET /api/auth/session`

Returns `200` with the current account identity when the session is active. Missing, expired, revoked, or disabled-account sessions return `401`.

### `POST /api/auth/logout`

Revokes the presented session, clears the cookie, and returns `204`. The operation is idempotent and requires the exact configured origin.

## Cookie policy

Development/test uses `ac_session`, `HttpOnly`, `SameSite=Strict`, `Path=/api`, a seven-day bound, and no `Secure` attribute so local HTTP works. Production uses `__Host-ac_session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, the same bound, and no `Domain` attribute.

Protected routes reuse `app.authenticate`; successful authentication populates `request.authAccount` from the server-side session. Ownership-sensitive services must use this context and must not accept client-supplied owner IDs.

## Password hashing resource bound

Passwords use `argon2` Argon2id with `memoryCost=65536` KiB, `timeCost=3`, `parallelism=1`, and `hashLength=32`. One KDF operation may run at a time and at most four may wait; additional login work fails fast with `429` rather than multiplying the 64 MiB native-memory cost.

Two local benchmark runs on 2026-08-12 with Windows 11 x64 and Node.js `v24.16.0` measured hashes at 91–197 ms, verifications at 90–174 ms, and sampled RSS increases of 65.1–65.4 MiB (120.1–134.0 MiB process peaks). This supports the single-concurrency selection under the 512 MB target constraint. Deployment verification must rerun `npm.cmd run auth:benchmark` on the target Ubuntu build because allocator and native-library behavior can differ.
