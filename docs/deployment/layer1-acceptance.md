# Layer 1 Acceptance Record

## Deterministic local acceptance

The repository test suite covers the approved Layer 1 success definition:

1. opaque-session authentication and restart persistence;
2. folder creation and browsing;
3. representative PDF reservation with exact MD5/size/type and simulated provider metadata;
4. active listing;
5. owner-authorized attachment and safe inline authorization;
6. metadata-only rename/move with unchanged object key;
7. recycle-bin soft deletion;
8. provider-verified restore;
9. cross-owner 404 isolation and full protected/origin route matrices;
10. persistence restart with unchanged logical metadata and object reference.

Representative deterministic cases include PDF, PNG, UTF-8 text, and ZIP/binary. A local test-only HTTP object store exercises the actual multipart byte path, rejects authorization replay, and verifies downloaded bytes with an independent SHA-256; it never contacts a cloud service. Browser tests cover incremental MD5, multipart policy fields, upload progress/failure/recovery, sessions, navigation, move, preview, recycle/restore/permanent actions, accessibility, and 320 px layout.

The final local gate is:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run acceptance:compiled
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
npm.cmd run auth:benchmark
```

`acceptance:compiled` uses a temporary SQLite database and random local-only credentials to exercise compiled migration, first-account provisioning, two application processes, a session across restart, maintenance dry-run, non-overwriting online backup, isolated restore verification, and repeat migration. Also verify the secret scan, deployment artifact tests, and `git diff --check`.

On the recorded Windows workstation, ordinary `npm ci` reaches npm's implicit
`node-gyp` configuration for `better-sqlite3` and requires the absent Visual
Studio C++ workload even though the pinned package contains a working Windows
prebuild. The reproducible local gate therefore uses `npm ci --ignore-scripts`,
then proves the packaged `better-sqlite3` and Argon2 native modules through the
database suite and benchmark. This exception does not apply to production:
Ubuntu preparation must supply the native build toolchain and pass ordinary
`npm ci --omit=dev` on the target Node 24 platform.

## Production approval gate

Local acceptance is not evidence of a real Alibaba Cloud deployment. Before production exposure, execute and record the approval-gated steps in the production runbook and OSS checklist:

- Ubuntu 24.04/Node 24 native dependency installation and Nginx/systemd validation;
- real DNS, certificate issuance/renewal, TLS, redirect, headers, firewall, and loopback listener;
- private bucket/Block Public Access, exact CORS, Versioning Disabled, and least-privilege RAM;
- representative byte-level direct upload/download/preview/delete with external checksum comparison;
- actual 512 MB host headroom and systemd resource-limit measurement;
- encrypted off-host backup plus isolated production-format restore rehearsal;
- rollback pairing of application release and compatible database backup.

Any failed item means Layer 1 is code-complete and deployment-ready, but not live-accepted. Do not silently waive, simulate, or mark these operations executed.

Live permanent-delete evidence may use only a pre-registered, newly created,
disposable acceptance object containing no academic or production data, with a
separate irreversible-operation confirmation immediately before deletion.
