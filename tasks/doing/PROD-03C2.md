## Task ID

PROD-03C2 — Live Disposable-Object E2E and First-Usable Production Gates

## Goal

Complete the remaining Class-A live gates to reliable First Usable Production: one real authenticated HTTPS login/session/logout/revocation run with the corrected repository-owned acceptance tool, the live browser/API E2E over pre-registered disposable objects (upload, provider verification/activation, listing, signed download with independent byte/hash verification, rename/move, recycle, restore), and the exact disposable-object permanent-delete Owner confirmation — without touching any existing production material.

## Scope

- recover the synchronized PROD-03R reconciliation checkpoint and the loopback-ready/public-edge baseline before any change
- Owner runs `node scripts/production-https-acceptance.mjs` once locally (hidden password prompt; only non-secret status/boolean output) and the recorded output must show `VERDICT=true`
- pre-register a unique disposable acceptance prefix, logical file IDs, expected sizes/types/checksums, operator, and time window; every object is newly created for this acceptance run and contains no academic or production data
- through the public HTTPS edge: create folders, upload small PDF/PNG/UTF-8-text/binary via the exact browser-direct multipart flow, verify provider metadata and activation, list active and pending entries, signed download with independent SHA-256 comparison, rename/move, soft delete to recycle, restore, and confirm exact object references
- stop at the exact disposable-object permanent-delete Owner confirmation naming the pre-registered file ID, object checksum, and test prefix; permanent deletion proceeds only on that exact newly created object from recycle state and reaches `purged` only after exact verification
- measure memory/swap/cgroup/kernel OOM evidence during the E2E and confirm the backend remains loopback-only and the OSS CORS boundary unchanged
- decide the host reboot/autostart question with the Owner (enable the unit with the exact reviewed procedure, or record an explicitly accepted manual-start procedure) and verify the chosen behavior
- update durable state, move the card to `tasks/done/`, and push a clean checkpoint

## Non-goals

- touching existing production objects, folders, accounts, or data
- any permanent deletion beyond the single pre-registered disposable acceptance object with the exact Owner confirmation
- certificate renewal activation, DNS/firewall/security-group changes, or any new paid resource
- changing Argon2id, SQLite durability, systemd hardening, TLS verification, or owner isolation
- Layer 2/3, OCR, RAG, connectors, mobile, desktop sync

## Acceptance Criteria

- [x] repository/Git/GitHub and the production baseline pass a read-only preflight before the first live action
- [x] the corrected acceptance tool run records `VERDICT=true` with login/session/logout/revocation statuses and no secret output
- [ ] every live object is pre-registered, newly created, disposable, and verified against the pre-registered checksum/type/size; no existing object is touched
- [ ] upload/activation/listing/signed-download/rename/move/recycle/restore pass through the public HTTPS edge with independent byte/hash verification
- [ ] the exact disposable-object permanent-delete Owner confirmation is obtained before that deletion, and only that exact object is deleted
- [ ] whole-host memory/swap headroom and cgroup/kernel OOM evidence remain zero; the backend stays loopback-only and the CORS boundary unchanged
- [ ] the reboot/autostart decision is recorded and verified (or explicitly accepted as manual)
- [ ] applicable tests/checks, secret scan, diff review, and independent read-only review pass
- [ ] durable state is updated, the card moves to `tasks/done/`, a clean commit is pushed through strict SSH, and local/private GitHub refs match

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `scripts/production-https-acceptance.mjs`
- `scripts/production-e2e-acceptance.mjs`
- `frontend/src/api.ts`, `frontend/src/direct-upload.ts`
- `backend/src/auth/`, `backend/src/drive/`, `backend/src/storage/aliyun/aliyun-oss-adapter.ts`
- `docs/deployment/oss-deployment-checklist.md`
- `docs/deployment/production-runbook.md`
- `docs/deployment/encrypted-backup.md`
- `CURRENT_STATUS.md`, `TASK_BOARD.md`
- `tasks/doing/PROD-03C2.md`

## Current State

In progress on `codex/prod-03c2` from the synchronized PROD-03R checkpoint `fd0cd13f4c4c492ba27193b3e3d571e4a4a8138d`. Gate 1 PASS: the Owner ran the repository-owned `scripts/production-https-acceptance.mjs` with the real production account and obtained `VERDICT=true` (login `200` match, session `200` match, logout `204` with `Max-Age=0`, revoked session `401`, cookie name/secure/httpOnly/sameSite/path/domain checks all true). Read-only preflight passed: phase `loopback-ready`, service disabled-but-active `MainPID=34558` on exactly `127.0.0.1:3000` (health/ready `200`), Nginx `academiccloud` only, public HTTPS `200`, environment/database identities unchanged, both encrypted backup artifacts present, certificate valid beyond 30 days, `MemAvailable=517,220 KiB`, swap intact, kernel OOM `0`, zero failed units, exactly one account. The E2E tooling is committed; the Owner run is the next mandatory step.

## Completed

- Recorded Gate 1 (authenticated HTTPS session acceptance) as PASS with the Owner's non-secret output.
- Completed the read-only preflight above.
- Added `scripts/production-e2e-acceptance.mjs` (deterministic disposable payloads, exact `api.ts`/`direct-upload.ts` request semantics, hidden credential entry, non-secret status/hash output only, never permanently deletes) with `--plan` pre-registration mode.
- Corrected the E2E tool after an independent repository audit found contract defects against `backend/src/drive/http.ts` and `frontend/src/md5.ts`: folder creation and upload reservation now require `201` (not `200`); the checksum is Base64 MD5 (`^[A-Za-z0-9+/]{22}==$`, mirroring `md5.ts` hex→Base64) instead of hex; the pending-upload listing (`GET /api/drive/uploads`) is now exercised; `logout_status=204`, folder/subfolder `201` statuses, and the pending-listing boolean are now gated into `VERDICT`. Added deterministic contract tests (`scripts/production-e2e-acceptance.test.mjs`, `npm run test:acceptance-tools`) pinning the payload identities, the status-code contract, the `--plan` output, and the absence of any permanent-delete reference; backend suite 88/88 passes.
- **PROD-03C2B verifier-hardening checkpoint (verdict completeness)**: audited all 17 network steps in `scripts/production-e2e-acceptance.mjs`; every step now stores its HTTP status explicitly and asserts it against its own `CONTRACT` member inside a pure exported `computeVerdict(results, specCount)` — login, session, folder create, subfolder create, upload reservation, pending-upload list, direct OSS POST, upload complete, active entries list, download authorization, **signed OSS object GET (distinct `CONTRACT.signedDownload`, no longer conflated with `downloadAuthorization`)**, rename, move, recycle/delete, recycle list, restore, and logout; the existing semantic body checks remain as additional requirements. Output now prints each distinct status. Acceptance-tool tests: `computeVerdict` accepts a fully valid run and rejects when ANY single one of the 29 status/semantic mutations is flipped (table-driven), pins the distinct download-authorization vs signed-download steps, and retains the `/permanent` absence and bodyless-semantics tests. Frontend/backend/OSS code untouched.
- **PROD-03C2A corrective checkpoint (real integration failure `runId=e73af1945d52`)**: the first live E2E failed at `POST /api/drive/uploads/:fileId/complete` with HTTP `400 invalid_request` in 2 ms (parser layer, handler never ran). Read-only diagnosis proved the OSS object and the DB reservation metadata match field-by-field, and a local real-Fastify reproduction isolated the defect: Fastify 5 rejects `Content-Type: application/json` with a zero-byte body before any handler — the exact shape `frontend/src/api.ts`'s optional-body `#json` helper produced for the bodyless actions (completeUpload, renewUpload, restoreFolder, restoreFile; logout was already bodyless). This is a systemic frontend abstraction defect that would break real browser uploads, not a verifier-only issue. Fixed the abstraction: `#jsonBody` (required body, JSON semantics) and `#action` (bodyless, no Content-Type, no body) with every caller reclassified; the E2E tool now mirrors the same split (`requestInit`, no `jsonTypeOnly`), consumes `CONTRACT` constants in every runtime assertion, retains the current file result before throwing, prints `fileId`/status/`{error}` on complete failure, and performs best-effort non-masking logout in `finally`. Tests: frontend `api.test.ts` pins the body-bearing shape and all five bodyless actions (method/body undefined/no Content-Type/Accept); the acceptance-tool tests pin the `requestInit` split and assert `jsonTypeOnly` is gone; a new real-loopback HTTP transport regression test (`backend/test/transport/http-transport.test.ts`) starts the actual Fastify app and proves with real fetch that a correct bodyless action reaches the handler (409 `upload_incomplete`) and that the JSON-header-empty-body boundary is rejected with 400 `invalid_request`. Verification: frontend 24/24, backend 89/89 (including the transport regression), acceptance-tool tests 5/5, typecheck and build pass, `node --check` clean. The preserved failed live object remains frozen (fileId `0e83110a-d095-46ba-ac5d-fb174e7d5269`, checksum `GvL9/U7aoQyRRZXavZXUiw==`); the next live E2E must use a new runId after the frontend fix is deployed via the normal release path.

## Pre-registration record (disposable acceptance objects, operator = Owner, window = single 2026-08-15 run)

Unique prefix `prod03c2-e2e-<runId>-`; every object is newly created by this run and contains no academic or production material. Deterministic payload identities:

- `sample.pdf` — `application/pdf`, 4,096 bytes, md5Base64 `GvL9/U7aoQyRRZXavZXUiw==`, sha256 `72bf1f6f5873dad6afb9cdc121d831d3f23be71e7836e72d4553ff825c830d49`
- `sample.png` — `image/png`, 2,048 bytes, md5Base64 `dcMLvbSMMqsDYPl7G354lg==`, sha256 `8ac1a17273ea8a556144a9fcfe4bd642437888ab082884a7f91798cc8efd0309`
- `sample.txt` — `text/plain`, 512 bytes, md5Base64 `bm0r4c+F742ow8KJleaJdw==`, sha256 `61bcc644615d8948dbe6af96314a2096481426d528e31d340d8e1b5c7f4c263a`
- `sample.bin` — `application/octet-stream`, 8,192 bytes, md5Base64 `alb7C4fKRWh9VXAPF48fmA==`, sha256 `3a06cffa607bd3ecfcb3361b62171ed268224840304cca4e29ef63aeae2199cb`

## Deployment plan (PROD-03C2D, plan + read-only preflight only)

Approved release identity: source `e5217e8c73bab4941a56599b8be97a34ebf1e06b`; GitHub Actions run `31889548297`; artifact `9248184597` named `academiccloud-linux-x64-node24-e5217e8c73bab4941a56599b8be97a34ebf1e06b`; GitHub artifact digest `sha256:1f560c8764ed42dcb95f81e5aaa300edde832cb97943719a2a712000cb856f82`; release archive SHA-256 `9f9fdc9ca1387397cec03e33c114a4bccf41d6abcfe67862f2a4ee54a52af0b8`; manifest SHA-256 `18983a2494891f2d79ef3307ab8b83376628d5fee56564a993f2c53b8bf8f9a6`; runtime verification status=ok (linux/x64/node v24.19.0, better-sqlite3/argon2id ok, ELF64 native, compiled acceptance ok); both CI jobs passed.

Preflight (2026-08-15, read-only): current target `/opt/academiccloud/releases/639baa9596a17f4160521f31440d9e3ac3b12eda` (the only release present; root:root, service cannot write it; backend dist/frontend dist/4 migrations/native modules all readable); service disabled-but-active pid `34558`, single listener `127.0.0.1:3000`, loopback health/ready `200`; public HTTPS `200` + HTTP→`301`; **current served frontend JS = `index-KoSWW-jk.js`** (old release asset — the deployment must replace this reference); CSS `index-BKjdxwzJ.css`; 13 GiB disk free; env root:root 600; DB path `/var/lib/academiccloud/academiccloud.sqlite`, migrations resolve through `current`; backup tool present with 2 encrypted `.age` files; preserved failed evidence still `pending_upload` with checksum `GvL9/U7aoQyRRZXavZXUiw==`.

**No migration is pending**: `database/migrations` is byte-identical between `639baa95…` and `e5217e8…` (the release change is frontend `api.ts` + tests + acceptance scripts only), so the compiled migration step is a no-op assertion and runbook Case B (application-only rollback) is pre-authorized.

Artifact acquisition + identity chain (fail closed; no rebuilds anywhere): download artifact `9248184597` → ZIP SHA-256 must equal the GitHub artifact digest → unzip must yield exactly the four files → `.tar.gz.sha256` must equal `9f9fdc9c…` → `node scripts/production-artifact.mjs verify` (repo verifier, Node 24, local) must pass with status ok → manifest `sourceCommit`/platform/architecture/nodeVersion must equal the approved identity → runtime-verification fields must match the recorded status=ok. Staging destination `/opt/academiccloud/releases/e5217e8c73bab4941a56599b8be97a34ebf1e06b` (must not pre-exist with unrelated files): extract, verify manifest vs tree, backend/dist + frontend/dist (expected new asset `index-wvVJNBv8.js`, authority = staged `frontend/dist/index.html` + manifest), 4 migrations, production node_modules with ELF64 native modules, no `.env`/SQLite/backups/caches, root-owned immutable, service account cannot write. `current` is NOT switched during staging.

Pre-deploy backup gate (before any switch): `academiccloud_op` (current release env) runs the CURRENT compiled `backup-main.js create --output=/var/lib/academiccloud/backups/pre-e5217e8.sqlite` then `verify`; then encrypt with the committed age recipient as `database-pre-e5217e8.age` and push it plus an updated manifest to `AcademicCloud-Backups`; backup PASS only after local verify AND off-host confirmation.

Deployment transaction (in order; stop on any gate failure): PRECHECK → `systemctl stop academiccloud.service` (success: inactive, MainPID 0, no :3000 listener) → `ln -sfn` the new release to `/opt/academiccloud/current` (old release dir untouched) → redefine `academiccloud_op` against the new `current` → compiled `migrate.js` (no-op, currentVersion 4) → `systemctl start academiccloud.service` → loopback health/ready `200` retry, single `127.0.0.1:3000` listener, zero new journal errors/OOM → public HTTPS `200`, HTTP→`301`, security headers, `/api/health` `200`, auth-negative probes (`401 invalid_credentials` login, `401` cookie-less session) → frontend proof: public `index.html` must reference `index-wvVJNBv8.js` (NOT `index-KoSWW-jk.js`), fetch that JS over HTTPS `200`, byte-hash vs the staged file → confirm Nginx tree unchanged (no reload), systemd still disabled, HSTS/renewal unchanged, failed E2E evidence unchanged. Expected downtime ≈ 5–15 s. Rollback (Case B, schema unchanged): stop → `ln -sfn` back to `639baa95…` → start → verify health/ready; never ad-hoc SQL, never delete the new release directory, never restore DB unless compatibility is proven absent.

Mutation classification: artifact download/staging = reversible mutation; SQLite backup = stateful but protective; service stop/start = reversible production mutation; `current` symlink switch = reversible production mutation; migration = stateful production mutation (here a no-op); permanent deletion = NOT AUTHORIZED; systemd enable = NOT AUTHORIZED; credential/Nginx/TLS/CORS changes = NOT AUTHORIZED.

- **PROD-03C2F harness-hardening checkpoint (final E2E harness only; production runtime source remains `e5217e8c73bab4941a56599b8be97a34ebf1e06b`)**: independent audit found (1) a fake subfolder — the "nested" folder was created with `parentId: null` (a second root folder); (2) `renewUpload` and `restoreFolder` live-coverage gaps; (3) no bounded network timeouts; (4) missing fail-fast after intermediate gates; (5) the Node fetch harness is not equivalent to real-browser execution (Owner browser Product Verification is a separate later step). C2F resolution: the nested folder is now a REAL child (`parentId` = root folder ID) with the parent relationship validated and gated; every file flow now renews its upload authorization bodylessly (`POST /uploads/:id/authorization`, no Content-Type, no body) and the RENEWED authorization is the only one passed to the direct OSS POST (behaviorally proven by tests using distinguishable initial/renewed URLs); the folder lifecycle exercises bodyless `restoreFolder` after emptying the real child folder (files moved back to root via the public API), soft folder delete, recycle verification, and restored-parent verification; every external request has an explicit bounded timeout (`api`/`signedDownload` 30 s, `directUpload` 60 s) via an injectable `fetchWithTimeout` (AbortController timer, always cleared, fails closed with only the logical step name); every step fails fast with immediate validation and logical-step errors; `CONTRACT` gained `uploadRenew`/`folderDelete`/`folderRestore`; `computeVerdict` now gates every new status and semantic result (44 table-driven mutations, all must flip false); timeout/fail-fast/no-`/permanent` behaviors are deterministically tested. No browser-automation framework added; `production-build.yml` intentionally unchanged (recorded CI-coverage note: the workflow does not run `test:acceptance-tools`). The corrected live sequence is: C2F → ChatGPT independent review → deployment (`e5217e8` artifact) → deployment smoke → fresh-runId live E2E → Owner real-browser Product Verification. Deployment remains blocked until the independent C2F review passes. The old failed live evidence (`e73af1945d52` / `0e83110a-…` / `GvL9/U7aoQyRRZXavZXUiw==`) remains frozen and untouched; production was not deployed or mutated during C2F.

## Remaining

- ChatGPT independent C2F review of the hardened harness commit.
- Owner download of artifact `9248184597` into a known local staging path for identity verification.
- After the review PASS and Owner authorization: execute the PROD-03C2D deployment transaction (`e5217e8` artifact; no migration pending) and the deployment smoke (including the public frontend asset proof: `index-wvVJNBv8.js` served, not `index-KoSWW-jk.js`).
- Fresh-runId live E2E via `node scripts/production-e2e-acceptance.mjs` (Owner hidden input once) — never resume the old failed run.
- Owner real-browser Product Verification (separate from the Node harness).
- Stop at the mandatory Owner gates: the exact disposable-object permanent-delete confirmation and the autostart/enable decision.

## Blockers

None for planning. The Owner's one-time E2E tool run (hidden input), the permanent-delete confirmation, and the autostart decision are mandatory Owner steps reached only at their defined points.

## Last Verification

2026-08-15 (Gate 1 + preflight): session acceptance `VERDICT=true`; preflight facts above; `node --check` passes on both acceptance tools; `--plan` pre-registration table reproduced above.

## Next Action

Wait for the independent read-only review of the E2E tooling, then have the Owner run the tool once and paste the non-secret output; afterwards complete the host-side resource/CORS checks and stop at the permanent-delete and autostart Owner gates.
