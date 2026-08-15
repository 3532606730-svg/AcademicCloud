# L1-UX01 Production Gate — Operator Checklist (NON-MUTATING UNTIL OWNER AUTHORIZES)

This is the operator-facing checklist for the future Owner-approved production
window that ships L1-UX01 (bilingual UI, upload UX, browser-correct Preview) to
First Usable Production.

**Status: PREPARATION ONLY.** Every command labelled `OWNER-GATED MUTATION`
must NOT be executed during preparation. Architecture rationale lives in
`files-ajtlab-top-plan.md`, the runbook, and the task cards; this document is
the execution + verification + rollback matrix for the window.

Current identities (verified read-only 2026-08-15):

- production runtime `e5217e8c73bab4941a56599b8be97a34ebf1e06b`
- releases present: `639baa95…` (rollback), `e5217e8…` (active)
- service: active + disabled, MainPID 44122, NRestarts 0, `127.0.0.1:3000` only
- DB: schema v4, integrity ok; frozen failed-E2E record present (pending_upload)
- `files.ajtlab.top`: Porkbun parking CNAME `pixie.porkbun.com` TTL 600; OSS
  custom domain unbound; TLS absent; `OSS_BROWSER_ENDPOINT` absent; live CSP
  without the files domain
- `cloud.ajtlab.top` certificate expires 2026-11-13; Certbot timer disabled

---

## PHASE 0 — PRECHECK (read-only, must all pass before ANY mutation)

- [ ] branch/HEAD = reviewed source commit for the UX01 build (record exact SHA)
- [ ] production health/ready 200 loopback; public HTTPS 200
- [ ] listener exactly `127.0.0.1:3000`; failed units 0; kernel OOM 0
- [ ] MemAvailable ≥ 128 MiB headroom; swap free; disk ≥ 10 GiB free
- [ ] DB `integrity_check=ok`, `foreign_key_check` empty, schema v4
- [ ] frozen failed-E2E record untouched (`FROZEN_E2E_RECORD_PRESENT=true`)

## PHASE 1 — CAPTURE (A0; save before any mutation)

- [ ] DNS: exact current `files.ajtlab.top` record set (parking CNAME target,
      TTL 600) + `cloud.ajtlab.top` reference record
- [ ] OSS: current custom-domain binding state (expected: none)
- [ ] TLS: current certificate state for both hostnames
- [ ] env: safe-field snapshot of `/etc/academiccloud/academiccloud.env`
      (names + non-secret values; secrets presence-only)
- [ ] Nginx: full copy + hashes of the live site file and the security-headers
      snippet; the SERVED CSP header captured verbatim
- [ ] service: `systemctl is-active/is-enabled`, MainPID, NRestarts
- [ ] release: `readlink -f /opt/academiccloud/current`
- [ ] backup: current `/var/lib/academiccloud/backups/` inventory

---

## TRANSACTION A — files.ajtlab.top INFRASTRUCTURE

| # | Step | Type |
|---|------|------|
| A1 | OSS console: bind custom domain `files.ajtlab.top` to bucket `ajt-academiccloud-kl-8f3c`; no ACL/public/versioning/policy change; Block Public Access stays enabled | `OWNER-GATED MUTATION` |
| A2 | Record the ACTUAL CNAME target the OSS console assigns/requires for this bucket/region (do NOT reuse the old hard-coded endpoint assumption) | read-only |
| A3 | Issue/import + bind a certificate for exactly `files.ajtlab.top` per the TLS lifecycle decision in `files-ajtlab-top-plan.md` | `OWNER-GATED MUTATION` |
| A4 | Verify OSS custom-domain TLS BEFORE any application change: `https://files.ajtlab.top/<known-test-key>` serves TLS with the right certificate | read-only |
| A5 | Porkbun: REPLACE the captured parking CNAME with `files.ajtlab.top CNAME <actual-OSS-target>` (record new TTL; never add a second record) | `OWNER-GATED MUTATION` |
| A6 | DNS convergence: confirm resolution to the OSS target (TTL wait + recheck) | read-only |
| A7 | Anonymous unsigned request to a known key must stay 403; bucket listing 403 | read-only |
| A8 | A fresh signed GET (via the CURRENT backend signing path or a recorded safe probe) must succeed with 200 | read-only |
| A9 | Record exact rollback info: parking record + TTL, certificate id, OSS binding state | record |

Gate A PASS criteria: A4+A6+A7+A8 all green; A9 recorded; no public access
introduced; `cloud.ajtlab.top` completely untouched.

## TRANSACTION B — UX01 APPLICATION DEPLOYMENT

| # | Step | Type |
|---|------|------|
| B0 | GitHub Actions `production-build.yml` builds the EXACT reviewed source commit (record run id + commit) | CI (Owner-triggered) |
| B1 | Verify artifact chain: ZIP SHA-256 → four-file bundle → archive SHA-256 → manifest (sourceCommit/platform/arch/node) → `scripts/production-artifact.mjs verify` on Linux (status ok) | read-only verify |
| B2 | Pre-deploy DB backup via `academiccloud_op` `backup-main.js create` + `verify` (record sha256/bytes/schemaVersion/counts) | `OWNER-GATED MUTATION` (protective) |
| B3 | Age-encrypt the verified backup (public recipient only) + non-secret manifest; push to private `AcademicCloud-Backups`; verify remote | `OWNER-GATED MUTATION` (off-host, protective) |
| B4 | Transfer verified bundle; stage the new immutable release at `/opt/academiccloud/releases/<new-commit>` (root-owned, service-write denied); Linux verifier PASS; migrations byte-identical to v4 set | `OWNER-GATED MUTATION` (staging only) |
| B5 | Install `OSS_BROWSER_ENDPOINT=https://files.ajtlab.top` in the root-only env file via the approved secret-safe procedure (record exact previous line state) | `OWNER-GATED MUTATION` |
| B6 | Capture live CSP (file + served header) again immediately before editing | read-only |
| B7 | Construct candidate CSP: ADD ONLY `https://files.ajtlab.top` to `img-src` and `frame-src` | file edit (staged, not yet active) |
| B8 | Diff old vs candidate CSP: the ONLY semantic additions are the two files-domain tokens | verify |
| B9 | `nginx -t` | read-only verify |
| B10 | `systemctl stop academiccloud` (verify inactive, MainPID 0, no :3000 listener) | `OWNER-GATED MUTATION` |
| B11 | Atomic `current` switch: temp same-filesystem symlink + `mv -Tf` (old release dir preserved) | `OWNER-GATED MUTATION` |
| B12 | Compiled `migrate.js` via redefined `academiccloud_op` — expected no-op `{"appliedVersions":[],"currentVersion":4}`; ANY applied migration = STOP + escalate | `OWNER-GATED MUTATION` (expected no-op) |
| B13 | `systemctl start academiccloud` (do NOT enable); bounded wait for active | `OWNER-GATED MUTATION` |
| B14 | Loopback health/ready 200; single `127.0.0.1:3000`; journal clean; NRestarts 0 | read-only verify |
| B15 | Public smoke: HTTPS 200, HTTP→301, `/api/health` 200, anonymous session 401 | read-only verify |
| B16 | `nginx -s reload` ONLY after `nginx -t` passed (CSP change) | `OWNER-GATED MUTATION` |
| B17 | Final smoke: served CSP header contains `files.ajtlab.top` ONLY in img-src/frame-src; frontend index references the NEW asset; public JS hash == staged file | read-only verify |
| B18 | Owner browser Product Verification (PV matrix below) | Owner-driven |

Gate B PASS criteria: B0–B17 all green; B18 PV matrix completed with PASS on
every row (or documented known-limitation outcomes for the preview-expiry
item); frozen evidence untouched; no permanent deletion during PV.

## ROLLBACK MATRIX (exact, in preferred order)

| Component | Rollback action | Trigger |
|---|---|---|
| Env | Remove `OSS_BROWSER_ENDPOINT` (restore captured previous line state) + restart via reviewed transaction | any Preview/env regression |
| CSP | Restore the EXACT captured snippet file + served header; `nginx -t`; reload | CSP blocks Preview or loses native upload host |
| Application | Stop → temp-symlink + `mv -Tf` back to the exact previous release → start → verify health/ready | startup/smoke/frontend-proof failure (migration was no-op) |
| DNS | Restore the captured Porkbun parking CNAME + original TTL 600 | custom domain must stop serving |
| TLS | Optionally unbind certificate; keep or unbind custom domain AFTER DNS restore | certificate/domain regression |
| DB | Do NOT restore unless a real DB mutation occurred (expected: none) | unexpected migration |

## PRODUCT VERIFICATION MATRIX (Owner browser, disposable test objects only)

LANGUAGE: default detection (zh browser → zh-CN; en → en) · switch zh↔en both
directions (immediate) · persistence across reload (`academiccloud.language`) ·
`document.documentElement.lang` correct · spot-check localized error text.

UPLOAD: small file · 50–200 MB PDF (speed + ETA visible, real MB/s during
upload phase only) · two simultaneous uploads + a third queued (max 2 active) ·
checksum → preparing → uploading → verifying phases visible · navigation while
queued keeps destination pinned · completion notice · (if safely reproducible)
a failure → retry path · stall/error messaging.

PREVIEW: PDF (inline render, no download) · PNG/JPEG · TXT · unsupported
HTML/SVG → Preview button absent · Chinese filename in dialog ·
large-PDF signed-URL-lifetime test (below).

DOWNLOAD: Chinese filename · filename with spaces · accented Latin name —
saved names readable (RFC 5987), attachment behavior, no object-key names.

FILE OPS: rename · move · recycle · restore (disposable objects only).

AUTH: login · reload keeps session · logout (revoked session 401 afterwards).

### Large-PDF preview expiry test (recorded limitation, not a redesign)

T0 open Preview → expect 200/206 with correct Content-Type and inline render.
Within ~300 s: jump across pages; observe Range requests. After ~300 s with the
dialog open: navigate to a not-yet-fetched page and record the response:
A) browser already buffered → PASS; B) fresh Range succeeds → PASS;
C) Range returns signature-expiry/403 → confirmed known UX limitation.
If C: record it and schedule, in order of minimal complexity, (1) a separate
Preview TTL adjustment decision or (2) preview refresh/reopen UX — do NOT
introduce public objects, backend proxy, CDN, or PDF.js.

## RESOURCE FEASIBILITY

RESOURCE_FEASIBILITY = HIGH (evidence): browser bytes bypass the backend in
both releases; the backend delta is signing-URL construction plus one optional
config read and an inline-disposition branch — no new resident services,
buffers, or SQLite load of consequence; cgroup bounds unchanged (320/384 MiB);
current live measurements: MemAvailable ~505,000 KiB, swap fully free, cgroup
current ~100 MB / peak ~161 MB, disk 13 GiB free. Preview adds one extra
authorization request per dialog open — negligible at Layer 1 scale. Confidence:
HIGH for server memory/bandwidth; MEDIUM for browser-side throughput perception
(that is what the new speed/ETA instrumentation measures).

## FAILURE-MODE TABLE (FMEA-style; likelihood = qualitative confidence)

| Failure | Detection | Impact | Likelihood confidence | Prevention | Rollback |
|---|---|---|---|---|---|
| Wrong DNS CNAME target | A6 convergence mismatch | Preview 404/SSL error; app unaffected (fails safe) | MEDIUM (A2 discipline) | A2 records console target before DNS edit | A9 parking restore |
| Certificate not bound | A4 TLS probe fails | Preview unreachable | MEDIUM | A3+A4 ordering | unbind/rebind cert; DNS restore if needed |
| TLS name mismatch | A4 served-cert SAN check | Browser warning/block | LOW | SAN pinned to files.ajtlab.top only | rebind correct cert |
| DNS cache propagation lag | A6 delayed resolution | Temporary mixed behavior | HIGH (inherent) | TTL wait + convergence recheck | parking restore |
| Custom domain accidentally public | A7 unsigned 403 check | Data exposure | LOW | A7 mandatory; no ACL changes | unbind domain immediately |
| Signed URL broken on custom domain | A8/B17 | Preview/download failure | LOW | cname signing smoke before app change | env+release rollback |
| OSS cname signing mismatch | A8 signed GET 403 | Preview unavailable | LOW | verifier + A8 | env rollback → fail-safe preview_unavailable |
| CSP blocks Preview | B17 header check | iframe/img blocked | LOW | B7/B8 add-only diff | exact CSP restore |
| CSP loses native upload host | B8 diff | uploads break | LOW | B8 diff proves add-only | exact CSP restore |
| OSS_BROWSER_ENDPOINT typo | config-load error at B13 startup | service fails to start | LOW | B5 exact value + loader validation | env restore + release rollback |
| Application fails startup | B14 | outage until rollback | LOW | B13 bounded retry + journal | release rollback |
| New artifact incompatible | B14/B15 | outage | LOW | B1 full identity + Linux verify | release rollback |
| Unexpected SQLite migration | B12 output | schema change | LOW (migrations byte-identical) | B12 no-op assertion; stop on any apply | STOP, escalate (no blind rollback) |
| Memory pressure | B14 cgroup/journal | slowdown/OOM | LOW (delta negligible) | precheck headroom; cgroup bounds unchanged | release rollback |
| Invalid Nginx config | B9 nginx -t | reload failure | LOW | B9 before reload | keep old config (never reload invalid) |
| Preview URL expiry (large PDF) | PV large-PDF test | later-page load fails in old dialogs | MEDIUM (documented) | PV item recorded; reopen requests fresh auth | follow-up decision (TTL or refresh UX) |
| Certificate renewal forgotten (files domain) | expiry calendar | Preview outage at expiry | MEDIUM (manual path) | TLS lifecycle decision + calendar | reissue/rebind |
| Rollback DNS ambiguity | A9 record quality | wrong restore | LOW | A9 exact record + TTL | A9 restore |

## READINESS GATE MATRIX

| Dependency | State |
|---|---|
| UX01 + R1 + R2 code | GO (INDEPENDENT_L1_UX01_IMPLEMENTATION_PASS=true recorded) |
| Tests (backend 104/104, frontend 60/60, acceptance 25/25, builds, audits) | GO |
| Source commit identity for build | NOT-YET-VERIFIED (Owner triggers CI at B0; SHA then recorded) |
| Production resource headroom | GO (live measurements within all gates) |
| DB integrity | GO (integrity ok, FK 0, schema v4, frozen record intact) |
| Backup state | GO (verified backups + off-host repo present; B2/B3 re-verify at window) |
| OSS private boundary | GO (live CORS positive 200, anon listing 403, private bucket records) |
| files DNS capture | GO (parking CNAME + TTL 600 recorded) |
| OSS custom-domain target | NOT-YET-VERIFIED (obtained at A2 from the console) |
| TLS issuance route | OWNER-DECISION (A/B/C lifecycle decision; console availability unverified) |
| Certificate renewal route | OWNER-DECISION (see above; calendar required for manual paths) |
| CSP candidate | GO (procedure defined: capture + add-only + diff) |
| Rollback | GO (exact per-component matrix above) |
| CI artifact | NOT-YET-VERIFIED (produced at B0) |
| Production window | OWNER-DECISION (Owner authorizes and opens the window) |
| Owner browser PV plan | GO (matrix defined; Owner executes at B18) |

## OPERATIONAL HARDENING PRIORITIES (post-UX01; DO NOT execute now)

1. `cloud.ajtlab.top` certificate renewal automation — HIGH value, LOW
   complexity (existing Certbot + nginx reload), hard deadline before
   2026-11-13; do first.
2. systemd autostart decision (enable + verify, or explicitly accept manual) —
   HIGH value, LOW complexity, Owner decision.
3. `files.ajtlab.top` certificate renewal (per TLS lifecycle decision) —
   HIGH value, MEDIUM complexity.
4. Automated SQLite backup cadence (timer + off-host push) — HIGH value,
   LOW-MEDIUM complexity.
5. Off-host backup verification cadence (restore rehearsal) — HIGH value,
   MEDIUM complexity.
6. Documentation reconciliation (README/PROJECT_SPEC stale statements) —
   MEDIUM value, LOW complexity.
7. Branch protection / required CI on `main` — MEDIUM value, LOW complexity.
8. Merge `codex/prod-03c2` back to `main` after the production checkpoint —
   MEDIUM value, LOW complexity, do after PV PASS.
9. HSTS — MEDIUM value, LOW complexity, AFTER renewal automation + rollback
   proof (per runbook).
10. OSS object-body disaster recovery — HIGH value but real-cost/data-policy
    decision (below); defer to a dedicated Owner decision.

## OSS OBJECT-BODY DISASTER RECOVERY OPTIONS (future Owner decision)

Current: SQLite metadata backed up (host + encrypted off-host); object bodies
NOT independently backed up; versioning recorded off (preserves no-overwrite
semantics). Options:

- A. OSS versioning: protects accidental delete/overwrite; NOT account
  compromise; ~storage cost multiplier on changed objects; conflicts with
  current no-overwrite acceptance reasoning (re-evaluate).
- B. Cross-Region Replication (CRR): protects regional outage; not accidental
  delete (replication mirrors deletes); replication/egress implications.
- C. Second OSS bucket + scheduled copy job: protects accidental delete and
  single-bucket faults; requires a scheduler + credentials + cost.
- D. Another provider (R2/S3-compatible): protects provider-level/account
  issues; new vendor + credentials + egress complexity.
- E. Scheduled offline archival (periodic snapshot to long-term storage):
  protects against many modes but loses point-in-time granularity and adds
  recovery lag.

No selection is made here; this is a future Owner decision with cost and
credential-boundary consequences.

## DATA SAFETY DURING THE FUTURE WINDOW

- Frozen failed-E2E evidence (`runId e73af1945d52`, fileId
  `0e83110a-…`, pending_upload): read-only verification only
  (`FROZEN_E2E_RECORD_PRESENT=true`). No retry/renew/complete/move/restore/
  recycle/purge/cleanup.
- Fresh disposable PV objects must use a clearly prefixed, pre-registered
  naming/ID scheme and are preserved (no cleanup) until the separate
  permanent-delete Owner gate.
