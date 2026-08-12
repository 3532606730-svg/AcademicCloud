# OSS Deployment Checklist

Every item is an approval-gated cloud/account change or verification. Record the account, region, bucket, operator, timestamp, and evidence without storing credentials or signed URLs in the repository.

## Bucket gate

- [ ] Bucket is in the approved region and its endpoint exactly matches server configuration, Nginx static CSP, and browser CORS expectations.
- [ ] Bucket ACL is private, Block Public Access is enabled, public website hosting is off, and no anonymous bucket/object policy or public object ACL exists.
- [ ] Versioning status is exactly `Disabled`. `Enabled` and `Suspended` are both incompatible with the upload no-overwrite guarantee. A bucket that was ever enabled cannot return to Disabled; use a newly approved bucket instead.
- [ ] No lifecycle rule can expire active `objects/*` unexpectedly.
- [ ] Anonymous object GET and bucket listing fail.

## RAM gate

- [ ] Dedicated service identity is limited to the exact bucket and application `objects/*` prefix.
- [ ] It has only required PutObject, GetObject/HeadObject, and DeleteObject actions; no bucket listing, ACL, public-access, CORS, versioning, website, policy, or PutObjectAcl administration.
- [ ] AccessKey ID/secret are installed only in root-owned mode-0600 server environment configuration. They are absent from frontend bundles, Git, shell history, logs, database rows, and backups.
- [ ] Rotation is rehearsed: install new credential, restart, verify, then revoke old. Static STS tokens are not used as permanent credentials.

## CORS gate

- [ ] Allowed origin is the one exact production HTTPS `APP_ORIGIN`; no `*`, alternate scheme, wildcard subdomain, or development origin.
- [ ] Allowed methods are only `POST`, `GET`, and `HEAD`; browser access does not receive `DELETE`.
- [ ] Allowed headers cover only the exact returned upload-policy fields and required browser request headers, including `Content-Type`, `Content-MD5`, and `x-oss-forbid-overwrite`. Avoid wildcard headers if OSS configuration permits an explicit list.
- [ ] Exposed headers are limited to preview/download needs such as Content-Length, Content-Type, Content-MD5, ETag, and Accept-Ranges.
- [ ] Preflight from the exact app origin succeeds; an evil origin and development origin fail.

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
