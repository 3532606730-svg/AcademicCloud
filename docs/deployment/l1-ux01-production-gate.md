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
- `files.ajtlab.top`: NO explicit DNS record pre-cutover — parking behavior
  was inherited from wildcard `*.ajtlab.top CNAME pixie.porkbun.com` TTL 600;
  OSS custom domain unbound; TLS absent; `OSS_BROWSER_ENDPOINT` absent; live CSP
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

- [ ] DNS: exact current `files.ajtlab.top` record set — pre-cutover there
      was NO explicit record; parking was inherited from wildcard
      `*.ajtlab.top CNAME pixie.porkbun.com` TTL 600 — plus the
      `cloud.ajtlab.top` reference record
- [ ] CAA: query BOTH `files.ajtlab.top` AND `ajtlab.top` (parent policy can
      apply); record results; no CAA mutation
- [ ] OSS: current custom-domain binding state (expected: none)
- [ ] TLS: current certificate state for both hostnames
- [ ] env: safe-field snapshot of `/etc/academiccloud/academiccloud.env`
      (names + non-secret values; secrets presence-only)
- [ ] Nginx: full copy + hashes of the live site file and the security-headers
      snippet; the SERVED CSP header captured verbatim
- [ ] service: `systemctl is-active/is-enabled`, MainPID, NRestarts
- [ ] release: `readlink -f /opt/academiccloud/current`
- [ ] backup: current `/var/lib/academiccloud/backups/` inventory

## PRE-MUTATION ARTIFACT GATE (before ANY cloud/DNS/TLS mutation)

The exact reviewed source artifact must exist and be cryptographically proven
BEFORE any OSS/Porkbun/TLS mutation (builds happen in CI, never on the host):

- [x] `B0` GitHub Actions `production-build.yml` builds the EXACT reviewed
      source commit (record run id + commit) — executed 2026-08-16 by the
      Owner for `codex/prod-03c2` @ `15181f90d6eecbb0ddb977a0168536a445802ec7`;
      both jobs PASS (`linux-production-artifact` + independent
      `verify-downloaded-artifact`). GitHub Actions run id: 31927613398 (Run #7).
- [x] `B1` artifact identity chain: ZIP SHA-256 → four-file bundle → archive
      SHA-256 → manifest (sourceCommit/platform/arch/node) →
      `scripts/production-artifact.mjs verify` on Linux x64 Node 24 → status ok
      — ZIP `d16e969d…`, archive `0f47bb5d…`, manifest `2342aeba…`, verifier
      `c62c98c1…` (reviewed, byte-identical), independent verify exit 0 on the
      production host Node v24.19.0 (evidence in `output/prod05a-transaction-a-state-capture.json`)

Failure of the artifact gate: **no cloud mutation**.

---

## TRANSACTION A — files.ajtlab.top INFRASTRUCTURE

| # | Step | Type |
|---|------|------|
| A1 | OSS console: bind custom domain `files.ajtlab.top` to bucket `ajt-academiccloud-kl-8f3c`; no ACL/public/versioning/policy change; Block Public Access stays enabled | `OWNER-GATED MUTATION` |
| A1a | **Conditional domain-ownership verification.** If Alibaba requests ownership proof (NeedVerifyDomainOwnership): capture the EXACT OSS-provided `_dnsauth` TXT hostname/value, add the exact TXT record via Porkbun (Owner-gated), wait for propagation, verify ownership in the console, complete the mapping, and remove the TXT only after Alibaba confirms it is no longer required (verify removal). NEVER touch the main `files` CNAME during ownership verification; never invent the token/hostname | `OWNER-GATED MUTATION` (conditional) |
| A2 | Record the ACTUAL CNAME target the OSS console assigns/requires for this bucket/region (do NOT reuse the old hard-coded endpoint assumption) | read-only |
| A3 | Issue/import + bind a certificate for exactly `files.ajtlab.top` per the TLS lifecycle decision in `files-ajtlab-top-plan.md` (record: certificate type, hosting/renewal status, validation method, deployment association, expiry monitoring/notification, cost Owner confirmation; else `CERTIFICATE_LIFECYCLE_CLOSED=false`) | `OWNER-GATED MUTATION` |
| A4 | **Pre-cutover validation before DNS moves** (where technically possible): resolve the actual OSS target, then operator-side probe with `curl --resolve files.ajtlab.top:443:<target-IP> https://files.ajtlab.top/<known-test-key>` — verify certificate SAN, TLS, custom-domain routing, unsigned access denied. Never permanently edit hosts; never treat the target IP as configuration. If the OSS edge cannot be reliably prevalidated: mark A4 = `NOT-PROVABLE-PRE-DNS`, then add the explicit DNS record, verify immediately, and on failure DELETE ONLY the added explicit record (the untouched wildcard resumes parking) | read-only probe |
| A5 | Porkbun: ADD the explicit `files.ajtlab.top CNAME <actual-OSS-target>` (record new TTL; never add a conflicting second record). Pre-cutover `files.ajtlab.top` had NO explicit record — parking was inherited from wildcard `*.ajtlab.top CNAME pixie.porkbun.com`, which remains untouched | `OWNER-GATED MUTATION` |
| A6 | DNS convergence: confirm resolution to the OSS target (TTL wait + recheck) | read-only |
| A7 | Anonymous unsigned request to a known key must stay 403; bucket listing 403; TLS serves with the correct certificate | read-only |
| A8 | Record exact rollback info: explicit `files.ajtlab.top` CNAME to delete on rollback, untouched wildcard `*.ajtlab.top → pixie.porkbun.com` TTL 600, certificate id, OSS binding state, TXT record state | record |

Gate A PASS criteria: pre-mutation artifact gate green; A4/A6/A7 green (or
A4 explicitly NOT-PROVABLE-PRE-DNS with immediate post-DNS verification);
A8 recorded; no public access introduced; `cloud.ajtlab.top` untouched.
**Transaction A proves only domain mapping, CNAME, TLS, and the private
unsigned boundary — NOT application signed-GET behavior.**

---

## TRANSACTION A EXECUTION RECORD — L1-PROD05A (2026-08-16, Owner-authorized)

**A. Authorization & scope.** Transaction A only (OSS custom-domain binding,
conditional ownership TXT, TLS certificate, DNS cutover, private-boundary
verification). No UX01 app deployment, no env edit, no Nginx/systemd/DB
mutation. `TRANSACTION_A_PASS=true`; `TRANSACTION_B_AUTHORIZED=false`.

**B. Read-only live production audit (baseline profile).** Auditor origin
`5a1b008` (`codex/l1-ops01-readiness-auditor`), run against
`academiccloud-prod`: **OVERALL=READY, exit 0**. All required checks PASS —
resources (MemAvailable 504,380 KiB ≥ 256 MiB heavy-guard; disk 12,709,816 KiB
≥ 10 GiB; 0 OOM; 0 failed units), loopback-only `127.0.0.1:3000`, service
active+disabled pid 44122 NRestarts 0, DB integrity/FK/schema v4, backups
present, OSS anon listing 403, cloud TLS valid (expiry 2026-11-13), public
health/ready/HTTPS/redirect PASS. Non-PASS items pre-explained: advisory
`DNS_NS`/`DNS_CAA` UNKNOWN (operator-network c-ares block; NS cross-checked via
system resolver = 4 Porkbun NS; CAA unqueryable in this network), informational
`FILES_DNS_TARGET` FAIL (same c-ares block; system resolver showed the
pre-cutover parking state), advisory WARNs out of scope per PROD-03C2
(autostart disabled, backup cadence, certbot timer) and expected
`PRODUCTION_DRIFT` (development ahead). Evidence:
`output/prod05a-live-audit-final.json`,
`output/prod05a-dns-system-resolver-evidence.json`.

**C. Auditor hardening committed during preflight.** `journalctl -q` added to
both remote aggregation pipelines (fixes the `-- No entries --` sentinel
false-positive that made `NO_ERROR_OOM_ACTIVITY` FAIL on a clean host);
regression assertions added; 42/42 tests pass; pushed as `da2c8e2` + `5a1b008`
on the auditor branch (never merged into `codex/prod-03c2`).

**D. Pre-mutation artifact gate (PASS).** See B0/B1 above; full identity chain
recorded in `output/prod05a-transaction-a-state-capture.json` (`artifactGate`
section). Independent `production-artifact.mjs verify` executed on the
production host's Node v24.19.0 with complete temp isolation (exit 0; evidence
byte-identical to CI); production service untouched (same pid, 0 restarts).

**E. A1/A1a — OSS binding + ownership (PASS, Owner console).** Custom domain
`files.ajtlab.top` bound to private bucket `ajt-academiccloud-kl-8f3c` with no
ACL/policy/versioning/public-access change; ownership verification PASS via
`_dnsauth.files` TXT; the TXT is now ABSENT (NXDOMAIN re-verified) and the
wildcard parking record was never touched.

**F. A2 — Assigned CNAME target (recorded).**
`ajt-academiccloud-kl-8f3c.ap-southeast-3.thepacificqlx.com` (console-assigned;
not the old hard-coded endpoint assumption).

**G. A3 — Certificate (PASS, lifecycle OPEN).** DV single-domain
`files.ajtlab.top`, RSA 2048, SAN `files.ajtlab.top` + `www.files.ajtlab.top`,
issuer DigiCert "Encryption Everywhere DV TLS CA - G2" (Alibaba DV partner),
valid 2026-08-16T08:00Z → 2026-11-14T07:59:59Z, hosted/deployed to OSS.
Manual renewal required ⇒ `CERTIFICATE_LIFECYCLE_CLOSED=false`; renewal
handled by PROD-03C3 hardening (hard deadline before 2026-11-14).

**H. A4 — Pre-cutover validation.** `NOT-PROVABLE-PRE-DNS` (Owner-reported);
immediate post-DNS verification performed instead (below) — permitted by the
gate rule.

**I. A5 — DNS cutover (Owner Porkbun).** The parking behavior came from
wildcard `*.ajtlab.top CNAME pixie.porkbun.com` (TTL 600) — there was NO
pre-existing explicit `files.ajtlab.top` record; the wildcard was NOT
modified. Owner ADDED explicit `files.ajtlab.top CNAME
ajt-academiccloud-kl-8f3c.ap-southeast-3.thepacificqlx.com` TTL 600 (no
conflicting second record; `cloud.ajtlab.top` untouched).

**J. A6 — Convergence (PASS).** Independent `Resolve-DnsName`:
`files.ajtlab.top` → the OSS target (observed TTL 271 at check time);
wildcard probe name still resolves to `pixie.porkbun.com` TTL 600;
`cloud.ajtlab.top` A unchanged (`47.250.126.42`).

**K. A7 — Private boundary (PASS, independently re-verified).** Anonymous
unsigned GET `https://files.ajtlab.top/<probe>` → **403**; anonymous bucket
listing (`?list-type=2`) → **403**; `Server: AliyunOSS` (custom domain routed
at OSS); TLS handshake serves the correct certificate (SslStream-verified SAN).
No public read permission introduced.

**L. A8 — Exact rollback state (recorded).** Rollback DNS = **DELETE ONLY the
explicit `files.ajtlab.top` CNAME** (wildcard parking remains and resumes
serving); certificate = OSS-hosted DV cert (unbind optionally, after DNS
restore); OSS binding = custom domain bound (unbind in console if required);
TXT state = absent. `cloud.ajtlab.top` Nginx/backend state unchanged.

**M. Production-unchanged flags.**
`PRODUCTION_APPLICATION_CHANGED=false`, `DATABASE_CHANGED=false`,
`FROZEN_E2E_CHANGED=false`, `PUBLIC_ACCESS_CHANGED=false` (anonymous access
denied before AND after), `OSS_BROWSER_ENDPOINT` still unset (env occurrences
0), served CSP unchanged (no files domain — expected until Transaction B),
`cloud.ajtlab.top` HTTPS/health 200 and cert expiry 2026-11-13 unchanged,
service active+disabled pid 44122 NRestarts 0.

**N. OSS console domain status** reported as `待检测` (pending detection) —
data-plane DNS/TLS/403 evidence PASS ⇒ `PENDING_NONBLOCKING` (Owner-reported;
no console access from the harness).

**O. Certificate lifecycle.** Issued + hosted; manual renewal;
`CERTIFICATE_LIFECYCLE_CLOSED=false` (tracked for PROD-03C3).

**P. No public access introduced.** Listing and unsigned object reads remain
403 on both the native bucket endpoint and the new custom domain.

**Q. Evidence files.** `output/prod05a-live-audit-final.json`,
`output/prod05a-dns-system-resolver-evidence.json`,
`output/prod05a-transaction-a-state-capture.json`,
`output/prod05a-post-cutover-verification.json` (and earlier baseline captures
`output/prod05a-live-audit-baseline.json` / `-v2.json`).

**R. STOP — Transaction B NOT authorized.** B0 GitHub Actions run id
`31927613398` (Run #7) recorded; UX01 app deployment, `OSS_BROWSER_ENDPOINT`
install, CSP activation, and Owner browser PV are all Transaction B steps and
were NOT started. `TRANSACTION_B_AUTHORIZED=false`.

---

## TRANSACTION B — UX01 APPLICATION DEPLOYMENT

| # | Step | Type |
|---|------|------|
| B0 | (already performed in the PRE-MUTATION ARTIFACT GATE — do not rebuild) | — |
| B1 | (already performed — artifact identity chain recorded) | — |
| B2 | Pre-deploy DB backup via `academiccloud_op` `backup-main.js create` + `verify` (record sha256/bytes/schemaVersion/counts) | `OWNER-GATED MUTATION` (protective) |
| B3 | Age-encrypt the verified backup (public recipient only) + non-secret manifest; push to private `AcademicCloud-Backups`; verify remote | `OWNER-GATED MUTATION` (off-host, protective) |
| B4 | Transfer the verified bundle; stage the new immutable release at `/opt/academiccloud/releases/<new-commit>` (root-owned, service-write denied); Linux verifier PASS; migrations byte-identical to the v4 set | `OWNER-GATED MUTATION` (staging only) |
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
| B15a | **Application signed-GET proof (NEW release only)**: with the UX01 release active and `OSS_BROWSER_ENDPOINT` loaded — authenticated inline authorization returns a URL whose host is EXACTLY `files.ajtlab.top`; a safe GET returns 200/206 with correct Content-Type/bytes; the unsigned equivalent stays denied. Do NOT print the signed URL; do NOT log the query or object key. Failure: **STOP before CSP activation** | Owner-assisted read-only (authenticated) |
| B16 | `nginx -s reload` ONLY after `nginx -t` passed (CSP change) | `OWNER-GATED MUTATION` |
| B17 | Final smoke: served CSP header contains `files.ajtlab.top` ONLY in img-src/frame-src; frontend index references the NEW asset; public JS hash == staged file | read-only verify |
| B18 | Owner browser Product Verification (PV matrix below) | Owner-driven |

Gate B PASS criteria: pre-mutation artifact gate green; B2–B17 all green
(including B15a application signed-GET proof on the NEW release BEFORE CSP
activation); B18 PV matrix completed with PASS on every row (or documented
known-limitation outcomes for the preview-expiry item); frozen evidence
untouched; no permanent deletion during PV.

---

## TRANSACTION B EXECUTION RECORD — L1-PROD05B (FINAL: B2–B17 PASS, STOP at B18 Owner PV)

**Status: B2–B17 all PASS after the ChatGPT review lifted the B15a STOP;
B16 CSP activated and browser inline Preview re-verified PASS; machine
deployment complete; STOPPED at B18 Owner Product Verification (UX01 NOT yet
accepted).**

- Authorization: `PROD05B_OWNER_AUTHORIZED=true`. Docs HEAD verified
  `806d232f1916fdc9fa3b3569f5019f89391d6596`; release source
  `15181f90d6eecbb0ddb977a0168536a445802ec7` (NOT the docs commit); Actions run
  `31927613398` (Run #7, both jobs PASS). Artifact identity chain re-verified
  fresh: ZIP `d16e969d…`, exactly the 4 bundle files, archive `0f47bb5d…`,
  manifest `2342aeba…` (linux/x64/node v24.19.0, 4619 files), runtime evidence
  status ok, reviewed verifier `c62c98c1…`.
- Precheck (fresh, read-only): all gates PASS — service active+disabled pid
  44122 NRestarts 0, loopback-only `127.0.0.1:3000`, health/ready 200, 0 failed
  units, MemAvailable 499,812 KiB, disk 12,700,500 KiB free, kernel/cgroup OOM
  0, DB integrity ok / FK 0 / schema v4, frozen record intact (`0e83110a`,
  checksum prefix `GvL9/U7a`, 1 pending_upload), env root:root 600 without
  `OSS_BROWSER_ENDPOINT`, Nginx site `0686a461…` + snippet `d9a1125b…`, public
  edge 200/301/200/200/401, old asset `index-wvVJNBv8.js`, files domain CNAME →
  OSS target with anonymous 403 `Server: AliyunOSS`, cloud cert valid to
  2026-11-13.
- B2 (PASS): fresh backup `academiccloud-pre-15181f90-20260816T061600Z.sqlite`
  — 122,880 B, sha256 `94e653ecd78004963b8dabf029671079f3a6b7de3246737aaf8d7c4d99b7b7d4`,
  schemaVersion 4, counts `{accounts:1, folders:4, files:6, sessions:7}`,
  create + verify ok, `academiccloud:academiccloud` 0600.
- B3 (PASS): age-encrypted (public recipient only) to
  `database-pre-15181f90-20260816T061600Z.age` — 123,096 B, sha256
  `90f4588fecbd346349f09db078f15d0cb95f2089964479625302949895b0e637`; non-secret
  manifest; pushed to private `AcademicCloud-Backups` commit
  `1249e1276921b23e5c2edd0f78f4b66851e8f14d` (main `564fc13..1249e12`); remote
  main re-verified and both files present; ciphertext byte-identical on host,
  staging, and remote.
- B4 (PASS): release staged and verified on the host — checksum OK; the
  archive's own reviewed verifier exit 0 (status ok, argon2id/better-sqlite3/
  ELF64 x86-64/compiled acceptance ok, isolated temp DB + ephemeral port); the
  4 migrations byte-identical to the old release's schema-v4 set (no 005+);
  new asset `index-DUJfeHJu.js` (+`index-DIrtnQk5.css`); no forbidden files;
  atomically placed at `/opt/academiccloud/releases/15181f90…` root:root 755,
  service write DENIED; `current` untouched at that point.
- B5 (PASS): env captured (0 occurrences) → exactly one
  `OSS_BROWSER_ENDPOINT=https://files.ajtlab.top` added; root:root 600; set-diff
  proof: ADDED_ONLY = that one line, REMOVED_COUNT = 0; rollback copy at
  `/root/academiccloud-rollback-prod05b/academiccloud.env.pre-b5`.
- B6–B9 (PASS): live site + snippet captured (rollback copies stored);
  candidate CSP = ONLY two semantic additions (`https://files.ajtlab.top` in
  img-src AND frame-src; removed = none; exactly one line replaced); candidate
  hash `4f1f9059…`; `nginx -t` successful; **no reload**.
- B10–B13 (PASS): stop clean (inactive, MainPID 0, no listener, Nginx
  untouched) → atomic temp-symlink + `mv -Tf` (`current` →
  `15181f90…`; old release preserved) → migration STRICT NO-OP
  `{"appliedVersions":[],"currentVersion":4}` → start (NOT enabled): active+
  disabled pid `66326`, NRestarts 0, single `127.0.0.1:3000`.
- B14 (PASS): loopback health/ready 200; journal 0 err/0 warn; kernel/cgroup
  OOM 0; cgroup current ~88 MiB / peak ~92 MiB within service bounds;
  MemAvailable 529,320 KiB; failed units 0; NRestarts 0.
- B15 (PASS): public 200, HTTP→301, /api/health 200, /api/ready 200, anon
  session 401; NEW frontend served (`index-DUJfeHJu.js`, old asset absent);
  public JS sha256 `27a3c787…` == staged `27a3c787…`, CSS `4fe1dcb9…` == staged;
  files anonymous 403 AliyunOSS; cloud TLS valid.
- **B15a (initially FAIL, then machine-proof PASS + post-B16 browser PASS)** —
  Owner real-browser evidence BEFORE B16: embedded Preview did not render; the
  new-tab PDF viewer showed "Failed to load PDF document" for BOTH the
  disposable E2E PDF (`d25e0f21…`, valid `%PDF-1.4`) and the known-good user
  PDF (`01951f40…`, 240,174,253 B, `%PDF-1.4`). No URL/query/cookie/credential/
  key was exposed.
  - App-side: the Owner's click produced a download authorization 200
    (structured log, new pid).
  - Bounded read-only diagnosis (host + operator public path): signed GET on
    `files.ajtlab.top` returns 200/206 with the EXACT PDF bytes (sha prefix
    `72bf1f6f` disposable; `57222e7acc17`/`d0d9ed064be8` user-PDF ranges);
    Content-Type `application/pdf`; Accept-Ranges `bytes`; Content-Range
    correct; **custom-domain Content-Disposition = `inline`** vs native
    endpoint = `attachment` (documented forced-download behavior); Range
    semantics identical across both paths; public-path fresh-URL fetch also
    200 with correct bytes.
  - ChatGPT review decision: the bounded diagnosis satisfies every technical
    signed-GET requirement ⇒ `B15a_SIGNED_GET_MACHINE_PROOF=PASS`,
    `B15a_CUSTOM_DOMAIN_PATH=PASS`, `B15a_PRIVATE_BOUNDARY=PASS`,
    `PRE_B16_EMBEDDED_PREVIEW_BLOCKED_BY_CSP=EXPECTED`,
    `B16_CSP_ACTIVATION_ALLOWED=true`; STOP lifted for the controlled
    continuation (B16 → verify → Owner retest → conditional B17/rollback);
    rollback-b15a.sh NOT executed.
- B16 (PASS): fresh safety check all green (release `15181f90…`, service
  active+disabled pid 66326 NRestarts 0, health/ready 200, single loopback
  listener, DB integrity ok/FK 0/schema 4/frozen `0e83110a`+`GvL9/U7a`
  intact, env exactly one `OSS_BROWSER_ENDPOINT=https://files.ajtlab.top`,
  files anon 403 AliyunOSS, candidate diff still exactly the two additions,
  rollback artifacts intact) → `nginx -t` PASS → `systemctl reload nginx`
  (pid unchanged, reload-only) → served CSP now contains
  `https://files.ajtlab.top` in img-src AND frame-src ONLY (native OSS
  allowances preserved; connect-src/form-action unchanged) → public 200.
- **Post-B16 Owner browser retest: PASS** — fresh Preview click (new 300 s
  signed URL) renders the known-good PDF INLINE inside the AcademicCloud
  Preview modal ⇒ `POST_B16_BROWSER_INLINE_PREVIEW=PASS`,
  `B15a_PRODUCT_RETEST=PASS`. The pre-B16 embedded failure is thereby proven
  to have been solely the not-yet-activated served CSP.
- B17 (PASS, items A–N): public home 200; /api/health 200; /api/ready 200;
  service active+disabled pid 66326 NRestarts 0; `current` =
  `15181f90…`; env exactly once `https://files.ajtlab.top`; served CSP has the
  files domain in img-src + frame-src with no other semantic change and native
  OSS allowances preserved; frontend references the NEW asset
  `index-DUJfeHJu.js` (old asset absent) with public JS sha256 `27a3c787…` ==
  staged; files domain TLS valid (CN=files.ajtlab.top, expires 2026-11-14) +
  `Server: AliyunOSS` + anonymous 403; B15a remains PASS (fresh bounded signed
  GET: files.ajtlab.top, https, 200, `application/pdf`, `inline`, sha
  `72bf1f6f`, `%PDF-`); DB integrity ok / FK 0 / schema 4 / frozen record
  `0e83110a`+`GvL9/U7a` untouched / counts unchanged (accounts 1, folders 4,
  files 6, sessions 7); no permanent delete; no service OOM (service cgroup
  events all 0), 0 failed units, 0 restarts, journal err 0.
- Rollback state (NOT executed; retained as the reviewed safety net): env
  pre-B5 copy (REMOVED_COUNT=0 proof), snippet pre-B7 copy (`d9a1125b…`),
  old release `e5217e8…` intact root:root write-denied, B2 backup + B3
  off-host copy available, staged script `rollback-b15a.sh` (moot after the
  post-B16 PASS; left in place as evidence). DNS/TLS/OSS stayed untouched
  throughout.
- Transparency note: three diagnostic probe units (uid 0, ~600 MB anon-rss
  each — full-object buffers before the Range-limited rewrite:
  `run-u1518`, `run-u1523`, `run-u1533`, all pre-B16) were kernel-OOM-killed;
  the kernel log names those probe units (task_memcg `/system.slice/run-uXXXX.service`),
  NOT the academiccloud service — the service cgroup OOM counters remained all
  0 and the service stayed active; no OOM event of any kind after B16.
  Evidence: `output/prod05b-*.txt|json`
  (`precheck-remote`, `precheck-public`, `b2-backup`, `b4-verify`,
  `b5-env`, `b6-capture`, `b7b8-csp`, `preswitch-snapshot`, `b10-stop`,
  `b11-switch`, `b12-migrate`, `b13-start`, `b14-loopback`, `b15-smoke`,
  `b15a-diagnosis`, `b15a-diagnosis2`, `b15a-baseline`, `b15a-compare`,
  `b17-remote`, `b17-public`, `b17-signedget`).
- Machine verdict: **`TRANSACTION_B_MACHINE_PASS=true`**,
  `OWNER_BROWSER_PV_REQUIRED=true`, **`UX01_FINAL_ACCEPTED=false`** (B18 PV
  not yet performed). Mutation flags: `PRODUCTION_APPLICATION_CHANGED=true`,
  `PRODUCTION_RELEASE_CHANGED=true`, `PRODUCTION_ENV_CHANGED=true`,
  `NGINX_CSP_CHANGED=true` (served via reload after B16),
  `SYSTEMD_ENABLE_CHANGED=false`, `DATABASE_CHANGED=false`,
  `FROZEN_E2E_CHANGED=false`, `DNS_CHANGED_DURING_TRANSACTION_B=false`,
  `TLS_CHANGED_DURING_TRANSACTION_B=false`, `OSS_PUBLIC_ACCESS_CHANGED=false`,
  `PERMANENT_DELETE_PERFORMED=false`, `ROLLBACK_NOT_NEEDED=true`.

---

## ROLLBACK MATRIX (exact, in preferred order)

| Component | Rollback action | Trigger |
|---|---|---|
| Env | Remove `OSS_BROWSER_ENDPOINT` (restore captured previous line state) + restart via reviewed transaction | any Preview/env regression |
| CSP | Restore the EXACT captured snippet file + served header; `nginx -t`; reload | CSP blocks Preview or loses native upload host |
| Application | Stop → temp-symlink + `mv -Tf` back to the exact previous release → start → verify health/ready | startup/smoke/frontend-proof failure (migration was no-op) |
| DNS | DELETE ONLY the explicit `files.ajtlab.top` CNAME; the untouched wildcard `*.ajtlab.top → pixie.porkbun.com` then resumes control | custom domain must stop serving |
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
| Wrong DNS CNAME target | A6 convergence mismatch | Preview 404/SSL error; app unaffected (fails safe) | MEDIUM (A2 discipline) | A2 records console target before DNS edit | A8 recorded rollback state + rollback matrix (parking restore) |
| Certificate not bound | A4 TLS probe fails | Preview unreachable | MEDIUM | A3+A4 ordering | unbind/rebind cert; DNS restore if needed |
| TLS name mismatch | A4 served-cert SAN check | Browser warning/block | LOW | SAN pinned to files.ajtlab.top only | rebind correct cert |
| DNS cache propagation lag | A6 delayed resolution | Temporary mixed behavior | HIGH (inherent) | TTL wait + convergence recheck | parking restore |
| Custom domain accidentally public | A7 unsigned 403 check | Data exposure | LOW | A7 mandatory; no ACL changes | unbind domain immediately |
| Signed URL broken on custom domain | B15a / B17 | Preview/download failure | LOW | B15a signed-GET proof on the NEW release before CSP activation | env+release rollback |
| OSS cname signing mismatch | B15a signed GET failure | Preview unavailable | LOW | verifier + B15a before CSP activation | env rollback → fail-safe preview_unavailable |
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
| Rollback DNS ambiguity | A8 record quality | wrong restore | LOW | A8 exact recorded rollback state + TTL + rollback matrix | A8 restore |

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
| files DNS capture | GO (no explicit files record pre-cutover; wildcard `*.ajtlab.top → pixie.porkbun.com` TTL 600 recorded) |
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
6. Documentation reconciliation (README/PROJECT_SPEC current-state statements) —
   DONE 2026-08-16 (overnight reconciliation); only re-verify after the UX01
   deployment changes current state again.
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
