# files.ajtlab.top — OSS Custom Browser Domain Plan (NON-MUTATING)

This document is the preparation-only plan for the later production
infrastructure gate that enables correct browser-native inline Preview for
AcademicCloud. **Nothing in this document is executed here**: no DNS change,
no OSS custom-domain binding, no certificate upload, no Nginx reload, no
production mutation of any kind. Every step requires a separate Owner-approved
production window; the operator-facing checklist that executes those steps is
`docs/deployment/l1-ux01-production-gate.md`.

> **TEMPLATE WARNING — never copy it to production literally.**
> `deployment/nginx/academiccloud-security-headers.conf` is a GENERIC checked-in
> template whose OSS hostname is a placeholder
> (`academiccloud-private.oss-ap-southeast-3.aliyuncs.com`). The real production
> site file under `/etc/nginx/snippets/` contains deployment-specific hostnames
> (the actual private bucket origin) that must NEVER be replaced by copying the
> generic template. The only production change this plan authorizes is adding
> `https://files.ajtlab.top` to `img-src` and `frame-src` in the LIVE file.

## Why this exists

Alibaba Cloud OSS native bucket domains force a browser download for objects
such as images and PDFs, so a signed URL on the native bucket endpoint can
never render inline reliably. The reviewed architecture (see
`tasks/doing/L1-UX01.md` and `backend/src/storage/aliyun/*`) therefore signs
browser GET URLs against a dedicated custom domain mapped to the same private
bucket, using the ali-oss SDK with `endpoint: <custom-domain>` and
`cname: true`. The bucket stays private; signed URLs stay short-lived; the
backend never proxies file bytes.

## Target topology

```text
Browser  ── signed GET ──▶ https://files.ajtlab.top/<objectKey>   (custom domain, cname)
                            │  same private bucket
Backend  ── HEAD/Delete ──▶ https://<bucket>.oss-ap-southeast-3.aliyuncs.com  (native endpoint)
Browser  ── multipart POST▶ https://<bucket>.oss-ap-southeast-3.aliyuncs.com  (unchanged direct upload)
```

## Current DNS reality (captured read-only 2026-08-15)

`files.ajtlab.top` ALREADY EXISTS in DNS as a Porkbun parking record:

- `files.ajtlab.top CNAME pixie.porkbun.com` (TTL 600)
- `pixie.porkbun.com` A `207.207.210.229` / `207.207.210.107` (TTL 60)
- no AAAA record; CAA records absent (no issuance constraint observed);
  DNSSEC state not verified from this machine (tooling limitation);
  zone served by Porkbun nameservers (`curitiba/fortaleza/maceio/salvador.ns.porkbun.com`)

The future DNS mutation is therefore **CAPTURE → REPLACE**, never "create a new
record": the existing parking CNAME (and its exact TTL) is the recorded
rollback state.

## Production steps (future gate — DO NOT execute now)

1. **OSS custom-domain binding**: in the Alibaba Cloud OSS console, bind the
   custom domain `files.ajtlab.top` to the existing private bucket
   `ajt-academiccloud-kl-8f3c` (region `oss-ap-southeast-3`). No bucket ACL,
   policy, versioning, or public-access change; Block Public Access remains
   enabled. Record the exact console feedback and any prerequisites
   (e.g. ICP/region or certificate requirements) verbatim.
2. **Determine the ACTUAL CNAME target — do not guess.** After the binding
   step, read the target the OSS console/API assigns or requires for THIS
   bucket/region (a dedicated OSS custom-domain CNAME target if the
   region/account provides one, otherwise the standard bucket endpoint as
   Alibaba explicitly requires). The old
   `ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com.` string is
   recorded only as a candidate, NOT an assumption. Only after the exact
   target is recorded may DNS be edited.
3. **DNS — replace the parking record, not create**: in the Owner's Porkbun
   control panel, capture the existing record (CNAME `pixie.porkbun.com`,
   TTL 600), then REPLACE it with `files.ajtlab.top CNAME <actual-OSS-target>`
   keeping a sensible TTL (the captured TTL is the rollback value). Do not add
   a second conflicting record; do not touch `cloud.ajtlab.top`.
4. **HTTPS certificate**: issue/import a valid certificate for exactly
   `files.ajtlab.top` (see the TLS lifecycle decision below), then bind it to
   the OSS custom domain so `https://files.ajtlab.top` terminates TLS at OSS.
   A wildcard is acceptable only if the Owner prefers `*.ajtlab.top` and
   reviews the sibling-host implication.
5. **Private-access verification**: prove that anonymous, unsigned requests
   to `https://files.ajtlab.top/<known-test-key>` are denied (`403`), that a
   fresh signed GET succeeds, and that bucket listing remains impossible —
   the custom domain must grant no public read permission.
6. **Application environment value**: install
   `OSS_BROWSER_ENDPOINT=https://files.ajtlab.top` into
   `/etc/academiccloud/academiccloud.env` (root:root 0600) through the
   approved secret-safe procedure (part of Transaction B, after the
   infrastructure steps pass). The config loader rejects any non-exact HTTPS
   origin and requires HTTPS in production.
7. **ali-oss `cname=true` behavior**: `createAliyunBrowserClient` builds the
   signing client with `endpoint: files.ajtlab.top, cname: true`, so signed
   URLs have host `files.ajtlab.top` and path `/<objectKey>` — no bucket
   prefix. Backend HEAD/Delete/stat continue on the native client; upload
   authorization stays on the native bucket endpoint.
8. **CSP — live-file capture, add-only diff, exact restore** (Transaction B):
   1. Capture the live `Content-Security-Policy` (snippet file AND served
      response header, cross-checked) plus a full copy of the file.
   2. Confirm the current deployment-specific OSS origins and preserve every
      active production origin/directive verbatim.
   3. Modify ONLY `img-src` and `frame-src`: append ` https://files.ajtlab.top`.
   4. Diff old vs candidate CSP; the ONLY semantic additions must be
      `https://files.ajtlab.top` in those two directives. No `https:`/`*`.
   5. `nginx -t` BEFORE reload; reload only after it passes.
   6. Rollback restores the EXACT captured previous CSP (file + header),
      never a reconstruction from the generic template.
9. **No public bucket permission**: nothing makes the bucket or any object
   public; Preview/download remain authorization-controlled.
10. **No permanent object exposure**: authorization duration stays short-lived
    (`OSS_DOWNLOAD_AUTHORIZATION_SECONDS`, bounded 30–900 s). Closing and
    reopening Preview requests a fresh authorization. The large-PDF
    signed-URL-lifetime behavior is a recorded Product Verification item
    (see `l1-ux01-production-gate.md`), not a reason to lengthen durations.

## TLS / certificate lifecycle decision for files.ajtlab.top

`files.ajtlab.top` terminates TLS at Alibaba OSS custom-domain
infrastructure, UNLIKE `cloud.ajtlab.top` (TLS at Nginx + Certbot on the
host). Renewal must therefore be decided explicitly:

- **Option A — Alibaba Cloud managed certificate (certificate-deployment
  workflow).** Renewal/rotation handled by the platform; no host involvement.
  PREFERRED if the current account/console provides managed certificates for
  OSS custom domains: lowest manual burden, no host secret expansion, but
  availability/cost must be confirmed in the current console.
- **Option B — external ACME / Let's Encrypt + redeploy into OSS.** Reuses the
  proven issuance path, but every renewal requires the Owner to obtain the
  renewed certificate and bind it in the OSS console; automating it would need
  OSS console API credentials and (for DNS-01) DNS API credentials — a NEW
  credential boundary that is NOT introduced in this task. ACCEPTABLE with an
  explicit renewal cadence and calendar; NOT RECOMMENDED as unmonitored manual
  work.
- **Option C — Porkbun-provided certificate.** Possible since the zone is at
  Porkbun, but binds certificate lifecycle to a second vendor workflow and
  still requires manual OSS binding. ACCEPTABLE if the Owner prefers one
  vendor; otherwise NOT RECOMMENDED.

**Recommendation:** confirm in the Alibaba console whether a managed
certificate can be bound to the OSS custom domain (Option A); if unavailable,
use Option B with a recorded renewal calendar and the existing
pre-2026-11-13 deadline discipline. Pricing/feature availability is
`REQUIRES_OWNER_CONSOLE_OR_CURRENT_OFFICIAL_DOC_CHECK` — no prices are assumed.
Any automation path that needs DNS API credentials is flagged as a NEW
credential boundary requiring separate Owner approval.

## Rollback (exact)

1. **DNS**: restore the CAPTURED Porkbun parking record (`CNAME pixie.porkbun.com`,
   TTL 600) — never "remove CNAME" or invent a value.
2. **TLS**: optionally unbind/leave the certificate on the OSS custom domain;
   restore DNS first if the custom domain must stop serving (ordering:
   application env → CSP → DNS → certificate/domain unbind, minimizing
   user-visible breakage).
3. **CSP**: restore the EXACT captured snippet file + verified header, then
   `nginx -t` + reload.
4. **Environment**: remove `OSS_BROWSER_ENDPOINT` (or restore the captured
   exact previous line state) and restart per the reviewed transaction —
   inline Preview then fails safely with `preview_unavailable` and attachment
   downloads keep working on the native domain.
5. **Application**: `current` symlink back to the exact previous immutable
   release (Transaction B records the atomic switch method).
6. **Database**: schema expected unchanged; do NOT restore the DB unless a real
   database mutation occurred (runbook Case B application-only rollback).

## Current production state (verified read-only 2026-08-15)

`OSS_BROWSER_ENDPOINT` NOT configured; served frontend unchanged; live CSP does
not mention `files.ajtlab.top`; `files.ajtlab.top` resolves to the Porkbun
parking CNAME (HTTPS unreachable); OSS custom domain not bound; bucket CORS
positive probe 200 / anonymous listing 403; certificate for `cloud.ajtlab.top`
expires 2026-11-13; Certbot timer disabled.
