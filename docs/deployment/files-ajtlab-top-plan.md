# files.ajtlab.top — OSS Custom Browser Domain Plan (NON-MUTATING)

This document is the preparation-only plan for the later production
infrastructure gate that enables correct browser-native inline Preview for
AcademicCloud. **Nothing in this document is executed here**: no DNS change,
no OSS custom-domain binding, no certificate upload, no Nginx reload, no
production mutation of any kind. Every step requires a separate Owner-approved
production window after the independent implementation review passes.

## Why this exists

Alibaba Cloud OSS native bucket domains force a browser download for objects
such as images and PDFs, so a signed URL on
`https://<bucket>.oss-ap-southeast-3.aliyuncs.com/<key>` can never render
inline reliably. The reviewed architecture (see `tasks/doing/L1-UX01.md` and
`backend/src/storage/aliyun/*`) therefore signs browser GET URLs against a
dedicated custom domain mapped to the same private bucket, using the ali-oss
SDK with `endpoint: <custom-domain>` and `cname: true`. The bucket stays
private; signed URLs stay short-lived; the backend never proxies file bytes.

## Target topology

```text
Browser  ── signed GET ──▶ https://files.ajtlab.top/<objectKey>   (custom domain, cname)
                            │  same private bucket
Backend  ── HEAD/Delete ──▶ https://<bucket>.oss-ap-southeast-3.aliyuncs.com  (native endpoint)
Browser  ── multipart POST▶ https://<bucket>.oss-ap-southeast-3.aliyuncs.com  (unchanged direct upload)
```

## Production steps (future gate — DO NOT execute now)

1. **OSS custom-domain binding**: in the Alibaba Cloud OSS console, bind the
   custom domain `files.ajtlab.top` to the existing private bucket
   `ajt-academiccloud-kl-8f3c` (region `oss-ap-southeast-3`). No bucket ACL,
   policy, versioning, or public-access change; Block Public Access remains
   enabled.
2. **DNS**: create the exact CNAME record `files.ajtlab.top →`
   `ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com.` in the
   Owner's DNS control panel for `ajtlab.top`. No other record changes.
3. **HTTPS certificate**: issue/upload a valid certificate for
   `files.ajtlab.top` (Let's Encrypt via the Owner's existing issuance path,
   or an equivalent approved certificate source) covering exactly
   `files.ajtlab.top`; a wildcard is acceptable only if the Owner prefers it
   for `*.ajtlab.top` and reviews the sibling-host implication.
4. **Certificate hosting in OSS**: bind the certificate to the OSS custom
   domain in the console (the platform's certificate-bind flow) so
   `https://files.ajtlab.top` serves TLS directly from OSS. Certificate
   renewal cadence must be recorded alongside the existing renewal notes.
5. **Private-access verification**: prove that anonymous, unsigned requests
   to `https://files.ajtlab.top/<known-test-key>` are denied (`403`) and that
   only a fresh signed GET URL succeeds; confirm bucket listing is impossible
   and that the custom domain grants no public read permission.
6. **Application environment value**: install
   `OSS_BROWSER_ENDPOINT=https://files.ajtlab.top` into
   `/etc/academiccloud/academiccloud.env` (root:root 0600) through the
   approved secret-safe procedure, then restart the service per the reviewed
   deployment transaction. The config loader rejects any non-exact HTTPS
   origin and requires HTTPS in production.
7. **ali-oss `cname=true` behavior**: `createAliyunBrowserClient` builds the
   signing client with `endpoint: files.ajtlab.top, cname: true`, so signed
   URLs have host `files.ajtlab.top` and path `/<objectKey>` — no bucket
   prefix. Backend HEAD/Delete/stat continue on the native client; upload
   authorization stays on the native bucket endpoint.
8. **CSP**: the checked-in Nginx template
   (`deployment/nginx/academiccloud-security-headers.conf`) already lists
   `https://files.ajtlab.top` in `img-src` and `frame-src` only. The
   production site file must be updated from this template and Nginx
   validated (`nginx -t`) and reloaded in the same window. `connect-src`,
   `form-action`, and every other directive stay unchanged; no `https:`/`*`
   broadening.
9. **No public bucket permission**: nothing in this plan makes the bucket or
   any object public. Preview/download remain authorization-controlled.
10. **No permanent object exposure**: authorization duration stays short-lived
    (`OSS_DOWNLOAD_AUTHORIZATION_SECONDS`, bounded 30–900 s). Closing and
    reopening Preview requests a fresh authorization; expired links fail and
    the dialog is reopened for a new one.
11. **Rollback**: remove `OSS_BROWSER_ENDPOINT` from the environment and
    restart (application-only rollback; schema unchanged). The application
    then automatically fails inline Preview with `preview_unavailable`
    ("Online preview is currently unavailable…" / "在线预览暂不可用，可下载后查看。")
    and keeps attachment downloads working on the native domain. Revert the
    Nginx CSP line to the previous template value and `nginx -t` + reload.
    Optionally unbind the custom domain in the OSS console; keep the CNAME
    removal last (or leave it inert) at the Owner's discretion.

## Current production state (unchanged by this task)

`OSS_BROWSER_ENDPOINT` is NOT configured in production; the served frontend
has no Preview URL change; the production CSP does not yet mention
`files.ajtlab.top`; DNS has no `files` record; OSS has no custom domain bound.
