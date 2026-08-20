# OPS-STORAGE-HOTFIX01 — Production-Baseline ListParts Hotfix

## State
HISTORICAL PREREQUISITE PASS — exact artifact `9409511861` / source `988bdbf052de1a39b47a1e22ac761c977eec72c8` was safely deployed and verified without Search. R3 now runs `08657727…`; `988bdbf…` is the immediate same-schema application rollback release.

## Why this task exists
The first storage-repair artifact (`9405764771`, source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6`) was technically valid but release-scope invalid: that source was 50 commits ahead of production and contained the frozen RF-SEARCH01 UI/API. The Owner-authorized deployment correctly failed closed and rolled back to `604cb8d…`.

That artifact is therefore **INVALID_FOR_PRODUCTION_SCOPE while the no-Search boundary remains in force** and must not be selected again.

## Exact hotfix construction
A new branch `hotfix/storage-listparts-from-prod-20260820` was created directly from the exact live/rollback production release:

```text
BASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
HOTFIX_SOURCE=988bdbf052de1a39b47a1e22ac761c977eec72c8
```

The compare against production is exact and bounded:

```text
COMMITS_AHEAD=2
FILES_CHANGED=2
backend/src/storage/aliyun/client.ts
backend/test/storage/aliyun-client-normalization.test.ts
```

No Search, frontend, database, migration, configuration, deployment/runbook, RAM, credential, metadata, or unrelated product code is present in the hotfix delta.

The storage implementation is the same proven narrow `ali-oss@6.23.0` `ListParts` runtime normalization already reviewed in OPS-STORAGE-APP-REPAIR01: singleton `<Part>` object -> canonical array; decimal string `PartNumber`/`Size`/marker -> safe integers; boolean string truncation flag -> boolean; malformed values fail closed; every non-`listParts` SDK path remains unchanged.

## Verification
The repository's existing `production-build.yml` was run through temporary draft PR #6 only as a CI trigger. PR #6 was closed unmerged after success.

```text
ARTIFACT_WORKFLOW=32376005391
ARTIFACT_BUILD_JOB=96447439723 PASS
ARTIFACT_INDEPENDENT_VERIFY_JOB=96451515693 PASS
```

The build job passed all established production gates:

- exact source checkout;
- clean dependency install;
- backend + frontend tests;
- repository typechecks;
- backend + frontend production builds;
- compiled application acceptance;
- full and production dependency audits;
- Linux Argon2id benchmark;
- isolated production package preparation;
- production dependency install;
- pinned release-local Tesseract build;
- realistic OCR E2E;
- release manifest finalization;
- deterministic archive + checksum;
- clean deterministic rebuild and byte-for-byte archive proof;
- extracted production runtime verification;
- immutable artifact upload.

A fresh independent Ubuntu 24.04 / x64 / Node 24 runner then downloaded the uploaded artifact and re-verified the archive checksum, manifest, compiled acceptance, native modules, PDF.js/canvas runtime, release-local Tesseract closure/models/synthetic OCR, and source identity.

## Authorized candidate identity

```text
SOURCE_COMMIT=988bdbf052de1a39b47a1e22ac761c977eec72c8
ARTIFACT_WORKFLOW=32376005391
ARTIFACT_ID=9409511861
ARTIFACT_NAME=academiccloud-linux-x64-node24-988bdbf052de1a39b47a1e22ac761c977eec72c8
GITHUB_ARTIFACT_SHA256=dec7ef47249e8d148aa7d31b8e0ddf3861dbceb2319dec4aaaa83b94c612b150
RELEASE_ARCHIVE_SHA256=79cea866533e9da1b7d00fb0b3e62a3a3123a90bc20138b8c4d9d40141ed5f33
MANIFEST_SHA256=d6d8b22077d79e9018c6e3eef2cb4454e452995dbc3c1127e574257914e8ce30
MANIFEST_FILE_COUNT=5384
MANIFEST_TOTAL_BYTES=125853632
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

## Production safety state

```text
PRE_DEPLOY_PRODUCTION=604cb8daf310696353e99c30ce7a924dc71ef9d2
DEPLOYED_AT_THAT_CHECKPOINT=988bdbf052de1a39b47a1e22ac761c977eec72c8
PREVIOUS_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
SCHEMA=v21
MIGRATIONS=001-021
MIGRATIONS_RUN=false
RAM_CHANGED=false
CREDENTIALS_CHANGED=false
CONFIG_CHANGED=false
DATABASE_MUTATED=false
PENDING_UPLOADS_MANUALLY_MUTATED=false
RF_SEARCH01_INCLUDED_IN_HOTFIX_DELTA=false
PRODUCTION_TOUCHED_BY_HOTFIX_BUILD=false
RELEASE_SCOPE_CHECK=PASS
RELEASE_SWITCH=PASS
PROCESS_RELEASE_IDENTITY=PASS
SERVICE=PASS
LOOPBACK_HEALTH=PASS
LOOPBACK_READINESS=PASS
PUBLIC_HEALTH=PASS
PUBLIC_READINESS=PASS
ROLLBACK_REQUIRED=false
RF_SEARCH01_DEPLOYED=false
```

The previous rolled-back release directory `8d289702…` may remain installed inactive, but it must not be selected under the current no-Search deployment boundary.

## Production deployment evidence (2026-08-20)

The Owner explicitly authorized deployment of only the existing immutable artifact above. Before mutation, live production was re-proven at exact `604cb8d…`, schema v21/history 001–021. The exact Git compare to `988bdbf…` remained two commits and two files, with no Search/frontend/database/migration/configuration/dependency/unrelated product delta. GitHub workflow/artifact identity and all three supplied SHA-256 values matched.

The downloaded artifact passed local and host-side archive/manifest/runtime verification. It was installed as root-owned immutable `/opt/academiccloud/releases/988bdbf052de1a39b47a1e22ac761c977eec72c8`; direct old/new manifest comparison proved that only the compiled Aliyun client JavaScript and source map differ in the payload. The release pointer was switched atomically and only `academiccloud.service` was restarted.

Post-cutover verification passed exact release and process CWD identity, active/running service with `NRestarts=0`, one `127.0.0.1:3000` listener, and loopback/public health/readiness 200. Nginx remained untouched with the same PID/start identity. Environment, systemd, Nginx site, and security-header hashes remained exact. Schema remained v21/history 001–021 with fingerprint `573fe6fb8b16cd644a41e48e12b8e1dfa416a9e551762849ae1864393b46ef63`; no migration command ran. Five multipart rows remain `uploading` and six file rows remain `pending_upload`. A fresh provider API readback returned status 200 and confirmed `AcademicCloudProdOSS` v2 remains default with exactly Put/Get/Delete/ListParts/AbortMultipartUpload on the same `objects/*` resource and no `ListMultipartUploads`. The new service invocation contains zero warning-or-higher journal entries. No RAM, credential, configuration, SQLite, metadata, OSS object/part, pending-upload, or RF-SEARCH01 mutation occurred.

## Next action
This historical hotfix requires no further action. `OPS-STORAGE-INCIDENT01` R3
deployed exact `08657727…` after the later empty-marker, CORS, and
abandon-routing evidence; Owner-reported browser storage acceptance subsequently
passed and the incident is closed. Do not reselect or mutate this hotfix, churn
RAM/OSS/CORS policy, or progress RF-SEARCH01 without new explicit authorization.
