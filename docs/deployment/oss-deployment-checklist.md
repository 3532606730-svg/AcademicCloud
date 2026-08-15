# OSS Deployment Checklist

Every item is an approval-gated cloud/account change or verification. Record the account, region, bucket, operator, timestamp, and evidence without storing credentials or signed URLs in the repository.

## Bucket gate

- [ ] Bucket is in the approved region and its endpoint exactly matches server configuration, Nginx static CSP, and browser CORS expectations.
- [ ] Bucket is dedicated to AcademicCloud, contains zero objects before acceptance, has no unknown historical data, and uses SSE-OSS/AES-256 rather than KMS; this keeps encryption at rest within the zero-additional-cost and three-action RAM boundary.
- [ ] Bucket ACL is private, Block Public Access is enabled, public website hosting is off, and no anonymous bucket/object policy or public object ACL exists.
- [ ] Versioning status is exactly `Disabled`. `Enabled` and `Suspended` are both incompatible with the upload no-overwrite guarantee. A bucket that was ever enabled cannot return to Disabled; use a newly approved bucket instead.
- [ ] No lifecycle rule can expire active `objects/*` unexpectedly.
- [ ] Anonymous object GET and bucket listing fail.

## RAM gate

- [ ] Dedicated service identity is limited to the exact bucket and application `objects/*` prefix.
- [ ] Its action list is exactly `oss:PutObject`, `oss:GetObject` (which authorizes the HeadObject API), and `oss:DeleteObject`, and its resource is exactly `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`; it has no bucket listing, ACL, public-access, CORS, versioning, website, policy, PutObjectAcl, KMS, or administrative permission.
- [ ] AccessKey ID/secret are installed only in root-owned mode-0600 server environment configuration. They are absent from frontend bundles, Git, shell history, logs, database rows, and backups.
- [ ] Static STS tokens are not used as permanent credentials. Credential rotation (install new credential, restart and verify, then revoke old) remains a separate production operation and must not be marked complete merely because initial activation passed.

## CORS gate

- [ ] Allowed origin is the one exact production HTTPS `APP_ORIGIN`; no `*`, alternate scheme, wildcard subdomain, or development origin.
- [ ] Allowed methods contain only `POST`. Downloads and previews use signed navigation/subresource URLs rather than cross-origin JavaScript reads; browser access does not receive `GET`, `HEAD`, or `DELETE` through CORS.
- [ ] Allowed headers are empty unless an actual production browser preflight identifies a required HTTP request header. The signed-policy values `Content-Type`, `Content-MD5`, and `x-oss-forbid-overwrite` are multipart form fields, not HTTP request headers, and must not be copied into this setting. Wildcard headers are forbidden.
- [ ] Exposed headers are empty because the upload client reads only the HTTP `201` status, not OSS response headers. Add an exposed header only after a reviewed application change proves it is read by browser JavaScript.
- [ ] `Access-Control-Allow-Credentials` is platform-controlled: the Alibaba OSS CORS console exposes no credentials toggle, and the live platform emits `Access-Control-Allow-Credentials: true` automatically on the approved preflight. The accepted live rule is therefore: the header is absent, OR appears exactly once with the case-insensitive value `true`; any other value, duplicate occurrence, or wildcard origin fails closed. The browser upload client sends no cookies or HTTP Authorization to OSS (multipart POST with server-signed policy fields only), so this platform-emitted header grants nothing. The preflight cache maximum age is exactly 300 seconds.
- [ ] Preflight from the exact app origin succeeds without `Access-Control-Request-Headers`; evil, HTTP-scheme, development, unapproved-header, and non-POST method probes fail without an allow-origin response.

## Representative live acceptance

- [ ] Before any byte test, pre-register a unique acceptance prefix, logical file IDs, expected size/type/checksum, operator, and time window. Every object must be newly created for this acceptance run, disposable, and confirmed to contain no academic or production data. Existing bucket objects and existing recycle-bin entries are never acceptance targets.
- [ ] Upload small PDF, PNG, UTF-8 text, ZIP/binary, and an approved larger file through the production UI. Validate browser MD5, exact size/type/checksum in provider metadata, active listing, and unchanged opaque object key across rename/move.
- [ ] PDF/image/text inline preview works; ZIP/HTML/SVG remain attachment-only.
- [ ] Downloaded bytes match a separately computed hash.
- [ ] Reusing an upload authorization cannot overwrite the verified object.
- [ ] Missing/mismatched provider metadata preserves pending state; provider outage returns stable failure with no provider detail.
- [ ] Soft delete and restore preserve bytes. Before permanent deletion, stop and obtain a separate irreversible-operation confirmation naming the pre-registered disposable file ID, object checksum, and test prefix. Abort on any mismatch. Permanent deletion operates only on that exact newly created acceptance object from recycle state and reaches purged only after exact verification.
- [ ] All signed URLs are short-lived, owner-authorized, and absent from logs/browser storage/history.

These checks use real credentials, cloud configuration, storage and possibly billable traffic. Do not execute them without explicit approval.
