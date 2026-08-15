## Task ID

PROD-03C1 — Public HTTPS/Nginx Edge Cutover and Minimum Machine Verification

## Goal

Enable the reviewed public HTTPS/Nginx edge for `cloud.ajtlab.top` (the exact prepared AcademicCloud site on the existing TLS certificate) and complete its minimum machine verification over the public HTTPS path — only after the durable encrypted off-host backup/restore gate and this task's independent review pass — while keeping rollback to the current loopback-only state immediate and safe.

## Scope

- recover the synchronized PROD-03B completion checkpoint, exact release/unit/environment/database/account identities, and the loopback-ready host baseline before any change
- first honor the durable pre-cutover gate recorded in the PROD-03C backlog: complete an encrypted off-host backup and isolated restore rehearsal of the production database and environment (destination, key custody, and any new cost remain Owner gates); the public route is enabled only after that gate passes
- render the exact prepared `deployment/nginx/academiccloud.conf` and `academiccloud-security-headers.conf` into the active Nginx tree, run `nginx -t`, and reload Nginx atomically; keep the prior default-only tree and listener state recorded for rollback
- verify the public HTTPS path with minimum machine checks: exact hostname/TLS chain, HTTP→HTTPS behavior, security headers, static asset serving, `/api/health` and `/api/ready` through the edge, login/session over HTTPS, and the approved browser CORS/upload preflight boundary unchanged
- keep the systemd unit unchanged (still disabled-but-active, loopback-only backend), measure whole-host memory/swap and cgroup/kernel OOM evidence during the HTTPS verification, and confirm no secret, cookie, or signed URL enters chat, Git, logs, or evidence
- define and record the exact rollback (remove the active site, reload Nginx, verify loopback state) and stop before any live OSS object acceptance, permanent deletion, or renewal activation

## Non-goals

- live OSS object upload/download/delete, browser E2E with real production material, permanent deletion, or bucket deletion (later PROD-03C steps)
- certificate renewal activation, firewall/security-group changes, DNS changes, or any new paid resource
- changing the systemd unit, SQLite durability, Argon2id parameters, TLS verification, or any accepted hardening boundary
- Layer 2, OCR, RAG, AI, connectors, mobile, desktop sync, or architecture expansion

## Acceptance Criteria

- [x] repository/Git/GitHub and the loopback-ready host baseline pass a read-only preflight before the first task write
- [x] the durable encrypted off-host backup and isolated restore gate passes before the public route is enabled, or the task stops at that Owner gate without cutover
- [x] independent read-only Reviewer approves the exact edge files, Nginx procedure, verification plan, and rollback behavior before the active Nginx tree is changed
- [x] `nginx -t` passes, the active tree contains exactly the reviewed AcademicCloud site, and the service/host/OSS/CORS state is otherwise unchanged
- [x] public HTTPS checks pass: exact certificate chain/hostname, HTTP→HTTPS handling, security headers, static assets, `/api/health`/`/api/ready`, and one real login/session round trip without exposing credentials or cookies
- [x] whole-host memory/swap headroom and cgroup/kernel OOM evidence remain zero during the HTTPS verification
- [x] exact rollback instructions and pre-change Nginx/unit/listener records are retained and the task remains fully reversible
- [x] applicable syntax/diff/secret checks and independent read-only review pass
- [x] durable state is updated, the task card moves to `tasks/done/`, a clean task-level commit is pushed through strict SSH, and local/private GitHub refs plus the connected default branch match

Evidence reconciliation (recorded by PROD-03R, 2026-08-15): at PROD-03C1 completion the "real login/session round trip" criterion was evidenced by (a) the Owner's real run against the external harness (login `200` with login-name match and session `200` with login-name match) and (b) wire-level production probes plus the PROD-03B embedded acceptance for logout/revocation (browser-shape logout `204`, revocation `401`). The external harness's logout `415` was proven by PROD-03R to be a PowerShell 5.1 `Invoke-WebRequest` defect (it injects `Content-Type: application/x-www-form-urlencoded` on body-less POSTs, which Fastify rejects with 415), not a production defect; production logout is NOT defective. A single full authenticated run with the corrected repository-owned tool `scripts/production-https-acceptance.mjs` remains a Class-A gate recorded in `PROD-03C2`.

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `deployment/nginx/academiccloud.conf`
- `deployment/nginx/academiccloud-security-headers.conf`
- `deployment/logrotate/academiccloud-nginx`
- `deployment/backup/academiccloud-backup-age.pub`
- `deployment/systemd/academiccloud.service`
- `docs/deployment/production-runbook.md`
- `docs/deployment/encrypted-backup.md`
- `docs/deployment/backup-recovery.md`
- `docs/deployment/oss-deployment-checklist.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/done/PROD-03C1.md`

## Current State

Complete. The public HTTPS/Nginx edge for `cloud.ajtlab.top` is live and fully verified; the backend remains loopback-only on `127.0.0.1:3000` (disabled-but-active, unchanged `MainPID=34558`); the active Nginx tree contains exactly the reviewed `academiccloud` site; the encrypted off-host backup gate passed before cutover; the exact rollback state is retained.

## Completed

- Recovered the synchronized PROD-03B completion checkpoint and created the bounded task branch.
- Completed the read-only preflight (loopback-ready baseline, nginx default-only, exact release/unit identities, certificate valid, 13 GiB free, zero failed units).
- Installed `age` 1.1.1 from the existing Ubuntu repository (zero cost; apt clean).
- Generated the production `age` keypair with the official age implementation: public recipient `age1s4aqa7gpkeeg52rl8efrqzp7ml77skslfjh882e0klrpuhrzsqpsnvqsq0` committed at `deployment/backup/academiccloud-backup-age.pub`; the private identity was vaulted by the Owner in Bitwarden (fingerprint independently verified) and the local key file was deleted; no identity material ever entered chat, Git, logs, or the host.
- Verified interop both directions between the local official age implementation and the host's official `age` 1.1.1 binary.
- Created and verified the production consistent backup `academiccloud-20260815T110907Z.sqlite`: bytes `122880`, SHA-256 `a457628a32996217930934a61ab3cd9f3351eda3135ccda68dd5ca0a8972e5a1`, schemaVersion `4`, counts `{accounts:1, folders:0, files:0, sessions:2}`.
- Encrypted on the host with the production public recipient: `database.age` (SHA-256 `753897f0e43f3cc72c73441cfe9e0b75025b3f3b89500a0f518bffa5b51fac28`) and `configuration.age` (SHA-256 `40150e21ba4893e775f8a98c0d177e275815c4c74d39ef33b7ed760d2a2e99b7`); decrypted both locally with the production identity and matched every recorded hash; all plaintext staging copies removed.
- Ran the isolated restore rehearsal with a temporary unit mirroring the production hardening: restored database integrity/foreign-key/migration checks pass, compiled app health/ready `200` with `STORAGE_PROVIDER=memory`, compiled maintenance dry-run clean, production untouched. Rehearsal staging must live under `/var/lib`, never `/var/tmp` (`PrivateTmp=true` masks the latter inside the unit namespace; documented in `docs/deployment/encrypted-backup.md`).
- Published only `README.md`, `database.age`, `configuration.age`, and `manifest.txt` to the private `AcademicCloud-Backups` repository at commit `d2483369ab01c1484d9b0dbf1d2a1e89ca8de227`; fresh-clone blob comparison confirmed byte-for-byte identity; independent backup-repo review PASS (only encrypted artifacts plus non-secret metadata, no identity/plaintext material).
- Verified all three prepared edge files are byte-identical renderings of the committed templates (site `0686a461…`, headers `d9a1125b…`, logrotate `1a04b8ef…`) and confirmed the distro logrotate rule does not overlap `/var/log/academiccloud`.
- Independent pre-cutover review PASS over the exact site file, headers file, cutover procedure, rollback procedure, and public verification plan.
- Executed the atomic cutover: installed the rendered site/snippet/logrotate files, moved the `default` symlink aside to `/var/lib/nginx-cutover-rollback/`, enabled `academiccloud`, `nginx -t` passed, `logrotate --debug` passed, and Nginx reloaded cleanly.
- Completed the full verification battery: public `https://cloud.ajtlab.top/` returns `200` (HTTP/2) with every reviewed security header exact (nosniff, no-referrer, DENY, permissions-policy, COOP/CORP same-origin, exact CSP with the OSS bucket hosts); public HTTP returns `301` to HTTPS; Windows-side public HTTPS certificate verification passed (`tls=0`); `/api/health` and `/api/ready` return `200` through the edge; the login round trip with an intentionally invalid probe login returned the stable `401 invalid_credentials` JSON and the cookie-less session endpoint returned `401` (no credential or cookie exposed); `index.html` serves with `Cache-Control: no-store`; unknown clear-text host gets `444` and unknown TLS SNI gets a handshake rejection; the backend remains exactly `127.0.0.1:3000` and port 3000 stays unreachable publicly; the OSS CORS boundary is unchanged (positive preflight `200` with the exact rule and platform-emitted credentials header; negative probes `403`).
- Post-cutover resources: `MemAvailable=503,040 KiB`, `SwapFree=1,048,572 KiB`, cgroup high/max/oom events `0/0/0/0`, cgroup peak `118,497,280` bytes, kernel OOM current boot `0`, zero failed units; backup directory intact; rollback state retained.

## Remaining

None for PROD-03C1. HSTS stays disabled until certificate renewal and rollback are proven (runbook step 9); certificate-renewal activation, live OSS E2E with disposable objects, and the exact disposable-object permanent-delete confirmation belong to the PROD-03C remainder.

## Blockers

None.

## Last Verification

2026-08-15 (final): independent pre-cutover review PASS; cutover executed with pre-state record, exact rendered files, `nginx -t` + reload, and rollback retained; the complete host-local and public verification battery passed as recorded above; `git diff --check` and secret scans clean; no DNS/firewall/security-group change, no renewal activation, no live OSS operation, no permanent deletion, and no hardening change occurred.

## Next Action

Stop PROD-03C1. The PROD-03C remainder (live browser E2E with pre-registered disposable objects, then the exact disposable-object permanent-delete confirmation) is the next bounded backlog task and requires its own review/cutover boundary before any live OSS object operation.
