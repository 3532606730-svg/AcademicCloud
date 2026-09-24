# OSS Deployment Checklist

Every item is an approval-gated cloud/account change or verification. Record the account, region, bucket, operator, timestamp, and evidence without storing credentials or signed URLs in the repository.

## Bucket gate

- [ ] Bucket is in the approved region and its endpoint exactly matches server configuration, Nginx static CSP, and browser CORS expectations.
- [ ] Bucket is dedicated to AcademicCloud, contains zero objects before acceptance, has no unknown historical data, and uses SSE-OSS/AES-256 rather than KMS; this keeps encryption at rest within the zero-additional-cost and bounded RAM action boundary.
- [ ] Bucket ACL is private, Block Public Access is enabled, public website hosting is off, and no anonymous bucket/object policy or public object ACL exists.
- [ ] Versioning status is exactly `Disabled`. `Enabled` and `Suspended` are both incompatible with the upload no-overwrite guarantee. A bucket that was ever enabled cannot return to Disabled; use a newly approved bucket instead.
- [ ] No lifecycle rule can expire active `objects/*` unexpectedly.
- [ ] Anonymous object GET and bucket listing fail.

## RAM gate

- [ ] Dedicated service identity is limited to the exact bucket and application `objects/*` prefix.
- [ ] Its action list is exactly `oss:PutObject`, `oss:GetObject` (which authorizes the HeadObject API), `oss:DeleteObject`, `oss:ListParts`, and `oss:AbortMultipartUpload`, and its resource is exactly `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`. `PutObject` covers multipart initiate/upload-part/complete; `ListParts` covers server-authoritative resume state; `AbortMultipartUpload` covers abandon. The application does not enumerate all bucket uploads, so `oss:ListMultipartUploads` is not granted. The principal has no bucket listing, ACL, public-access, CORS, versioning, website, policy, PutObjectAcl, KMS, wildcard, or administrative permission.
- [ ] Effective-policy verification checks direct RAM-user attachments, group inheritance, explicit denies, bucket-policy statements/denies, principal identity, and exact bucket/prefix scope before changing policy. If the exact action is already allowed and no deny/scope/principal mismatch exists, stop rather than churning versions and collect a provider-support evidence bundle.
- [ ] AccessKey ID/secret are installed only in root-owned mode-0600 server environment configuration. They are absent from frontend bundles, Git, shell history, logs, database rows, and backups.
- [ ] Static STS tokens are not used as permanent credentials. Credential rotation (install new credential, restart and verify, then revoke old) remains a separate production operation and must not be marked complete merely because initial activation passed.

## CORS gate

- [ ] Allowed origin is the one exact production HTTPS `APP_ORIGIN`; no `*`, alternate scheme, wildcard subdomain, or development origin.
- [ ] Allowed methods are exactly `GET`, `POST` and `PUT`. `POST` preserves the legacy browser form-upload contract; `PUT` is required for resumable multipart parts; `GET` permits the owned PDF.js reader to fetch signed source URLs directly. `HEAD`, `DELETE` and other methods remain excluded.
- [ ] Allowed headers contain exactly `Content-MD5` and `Range`. PDF.js sends bounded byte-range GET requests; resumable multipart `PUT` sends `Content-MD5` as a signed HTTP request header. Legacy POST values such as `Content-Type` and `x-oss-forbid-overwrite` remain multipart form fields and are not CORS request headers. Wildcard or unrelated allowed headers are forbidden.
- [ ] Exposed headers are exactly `Accept-Ranges`, `Content-Length`, `Content-Range` and `Content-Encoding`, required for PDF.js range detection and response validation. No wildcard or unrelated exposed headers.
- [ ] `Access-Control-Allow-Credentials` is platform-controlled: the Alibaba OSS CORS console exposes no credentials toggle, and the live platform emits `Access-Control-Allow-Credentials: true` automatically on approved preflights. The accepted live rule is therefore: the header is absent, OR appears exactly once with the case-insensitive value `true`; any other value, duplicate occurrence, or wildcard origin fails closed. The browser upload clients send no cookies or HTTP Authorization to OSS, so this platform-emitted header grants nothing. The preflight cache maximum age is exactly 300 seconds.
- [ ] Preflight from the exact app origin succeeds for `POST`, `PUT` with `Content-MD5`, and `GET` with `Range` on both native OSS and `https://files.ajtlab.top`. Evil, HTTP-scheme, development, unrelated-header, `HEAD`, `DELETE` and `PATCH` probes fail without an allow-origin response. Run `node scripts/oss-cors-contract.mjs` as the read-only live gate. The previous upload-only rule is not owned-reader deployment-ready.

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

## Owned PDF reader CORS application

The exact proposed rule is checked in at `deployment/oss/reader-cors.xml`. Apply it using the existing Owner OSS console session or an already-authorized bucket administrator, after reading and preserving the current bucket rules. Do not grant bucket administration to the application principal or replace unrelated rules. The application principal deliberately lacks GetBucketCors/PutBucketCors.

The necessary reader rule admits only https://cloud.ajtlab.top, GET/POST/PUT, Content-MD5/Range, four response metadata headers, and a 300-second max age. Both signed-URL domains must pass the read-only gate. A configured local contract is not evidence of a live bucket change.

PDF.js native browser rendering uses same-origin worker files and generated font blobs; its bundled WASM image decoders require the narrow CSP `wasm-unsafe-eval` allowance. JavaScript `unsafe-eval`, external workers and wildcard sources remain forbidden. Reference documentation: Mozilla PDF.js API (wasmUrl/useWasm), https://mozilla.github.io/pdf.js/api/draft/api.js.html; Alibaba OSS CORS, https://www.alibabacloud.com/help/en/oss/user-guide/configure-cross-origin-resource-sharing.
