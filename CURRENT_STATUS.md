# AcademicCloud Current Status

**Last reconciled:** 2026-08-30

`CURRENT_STATE.json` is the compact machine-readable pointer. ADRs and task
cards preserve the complete implementation, incident, release, and rollback
evidence without duplicating it here.

## Active program: ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE

The Owner reopened the Layer-1 AI production incident and superseded every
earlier whole-product closure, production-acceptance, Internal Beta readiness,
hard 30-second AI SLA, and stale next-task pointer. The active program repairs
and optimizes existing product paths only, processes every available
Owner-supplied relevant source plus every AI-eligible production Library
resource through the normal product path, and ends with a frozen full-corpus
clean sweep and whole-product production regression. Zero additional one-time
or monthly infrastructure cost and zero new billable GitHub usage are hard
gates.

```text
INCIDENT_L1_AI_PRODUCTION01=OPEN
PRODUCTION_USER_ACCEPTANCE=FAIL
AUTONOMOUS_FULL_CORPUS_ACCEPTANCE=PENDING
WHOLE_PRODUCT_PERFORMANCE_ACCEPTANCE=PENDING
INTERNAL_BETA_READY=false
INTERNAL_BETA_STARTED=false
```

The Local Compute Owner override continues this program and changes only the
production Compute strategy. Live production is exact frontend/Core
`b3debfbeb5fd63c969229b6645cdabef779cdd9d` at schema/history 33 with
`COMPUTE_PROVIDER=local_pull`. Schema33 and final v8/prompt-v5 are deployed.
The main Local Compute symlink still selects exact `58b8468…`, systemd remains
`disabled`/`inactive`, and the environment remains `PAUSED`; this old release
must not be enabled. Immutable Compute release `6b68d1a…` is hash-verified and
is reserved for the next isolated B retry.

The first normal-UI v7 A run exposed a bounded llama.cpp transport defect,
not an authority or persistence escape: the deeply nested fact schema could not
be used as a reliable grammar, and an otherwise useful result could mis-address
the selected-page array. The pending v8/prompt-v5 correction keeps the generic
fact transport but validates every field against exact page text, permits only
exact-excerpt ordinal repair, and moves class selection to a shallow schema-
bound candidate-ID pass whose evidence is resolved and positively validated by
trusted runtime. Unsupported facts and structurally incompatible source-edition
facts are removed. Migration 033 only registers the immutable v8 identity; it
does not rebuild or alter historical evidence. Full repository tests,
typecheck/build, compiled acceptance (33 migrations, 0 on redeploy), and a real
local GPU qualification on a modern scholarly monograph pass. Exact checkpoint
`b349595…`, immutable Core/Compute releases, the fresh encrypted schema32
off-host backup, and the one append-only schema33 cutover all completed.

Rulesets v4–v6 are deployed historical attempts, not final acceptance. The
Owner's FINAL ARCHITECTURE CORRECTION and ADR-038 block the v6 single-book
canary, NORMAL, forced-loss, and corpus execution. Code review confirmed that
the runtime had become a second semantic classifier through a finite analytical
title vocabulary and whole-inspection edition markers; single-page evidence
could synthesize provenance for facts Qwen never evidenced; an existing empty
unowned contributor set could not receive its first valid AI contributor; and
migrations 029–031 rebuilt immutable AI evidence only to extend version checks.
Final ruleset v7/prompt-v4 and the schema32 registry migration repair all four
boundaries and are live. The first isolated modern-scholarship canary did not
reach a terminal callback because its Local Pull lease expired during compute.
Three-canary acceptance and normal-browser product acceptance remain pending.

The corrupt-evidence defect is repaired, deployed, and canary-verified at exact
checkpoint `6c71ac94c60d49e65e7eca59305b59ba6e461167`.
OCR recognition confidence is no longer treated as bibliographic confidence;
embedded metadata presence is no longer treated as trust. Script-neutral
corruption/usability gates with v2 ruleset/prompt provenance withhold the
reported `ず之` OCR fragment and suspicious `亦郊真` embedded author while
preserving raw bounded embedded provenance and admitting legitimate Japanese,
Mongolian, Cyrillic, Arabic/Persian, Tibetan, and Poppe transliteration. The
two untracked workspace roots `%SystemDrive%/` and `scratch/` remain preserved.

Exact deployed checkpoint `5d4fddd542d352b2570d01feebda14c871be1d04`
connects immutable Qwen structured output to a primary
`AI 建议书目记录`, keeps field candidates as secondary conflict/evidence review,
applies the Owner display rule (modern scholarship `author + title`, historical
source `title + supported version`, unknown/unprofiled title-only), and projects
only the display/download filename while leaving original filename and
`objectKey` unchanged. Qwen ruleset/prompt v3 classifies intellectual work before
modern manifestation and person metadata; migration 028 admits exact v3
provenance while preserving immutable v1/v2 evidence. Unknown classification
cannot auto-apply. The real UI correctly rendered the complete record shell,
but its old v2 result remained `scholarly_monograph` and therefore still showed
the old person prefix. The new `cee8dec…` admission repair is required so the
canary actually executes v3 classification instead of reusing that historical
result.

All 12 Owner-supplied PDFs named in the active task remain locally available and
have immutable SHA-256 identities recorded in the active task card. The current
manifest is 12 Owner PDFs plus 93 production-eligible PDFs, zero exact production
duplicates among the 12, and 105 unique acceptance resources. No paid usage,
source-byte mutation, OSS identity mutation, or human-authority rewrite
occurred.

## Local Compute pivot — production v32 active; A retry failed on network path

ADR-037 changes the normal production provider from per-document GitHub-hosted
Actions to an outbound-only Local Pull worker on the Owner's existing Windows
machine. Core durable queue, authorization, source/callback capabilities,
candidate validation, human-field authority, and canonical CAS remain
unchanged. The laptop is a disposable executor: if it is offline, asleep,
paused, rebooting, or broken, AI work remains queued/recoverable and all non-AI
Core functions remain available.

```text
PRODUCTION_COMPUTE_CONTROL_PLANE=CORE_PULL_WORKER
LOCAL_PULL_PROVIDER=PRIMARY
GITHUB_HOSTED_PRODUCTION_COMPUTE=false
NEW_BILLABLE_GITHUB_USAGE=false
ACTIONS_BUDGET_USD=0
CURRENT_WORK_CHECKPOINTED=true
CURRENT_WORK_PUSHED=true
REMOTE_HEAD_CONFIRMED=true
DURABLE_NEXT_STEP_RECORDED=true
OWNER_SOURCES_STAGED_ON_D=true
OWNER_SOURCE_COPY_SHA256_VERIFIED=true
```

The preserved shared fixes are local checkpoints `a4a1c4b` (eight-state
current-generation projection plus exact AI evidence and batch Activity/Details
state), `1497bec` (SQLite batch Library/Search hydration), and `c9ab369`
(privacy-safe Compute stage/result diagnostics). Backend typecheck and 371/371
tests, frontend typecheck and 283/283 tests, Compute typecheck and 68 passing
plus 2 expected runtime skips, full workspace build, and diff check passed. No
new GitHub-hosted production probe was launched. All 12 source files were copied
without renaming to `D:\AcademicCloudCompute\staging\acceptance-sources`; target
count is 12, target bytes are 199,835,281, and every target length/SHA-256
matches the immutable task manifest. At that pre-reboot checkpoint WSL had not
yet been installed or enabled by this program, and all recovery gates were
complete before the read-only host/WSL/GPU/disk inspection.

That preflight confirmed Windows 11 Home x64 build 26200, Ryzen 9 7945HX
16-core/32-thread CPU, 16.84 GB physical RAM, firmware virtualization enabled,
Hypervisor present, RTX 4060 Laptop GPU with 8,188 MiB VRAM and driver 572.83,
15.55 GB free on C, and 113.55 GB free on D. Windows Node is v24.16.0 and Git is
2.55.0. At that time WSL was absent, and both WSL status and optional-feature
inspection showed that elevation was required; no OS feature had yet changed.
The one legitimate Owner UAC/reboot boundary was an elevated
`wsl.exe --install --no-distribution` plus restart; `--no-distribution`
prevented a default Ubuntu/VHDX installation on C.
After the Owner completed that one action, reboot recovery reverified local and
remote-tracking HEAD `380fb05…` plus all 12 files, 199,835,281 bytes, and 12/12
SHA-256 identities.

The only registered distribution is now `AcademicCloudCompute`, Ubuntu 24.04.4
LTS on WSL2. Registry `BasePath` and the physical 80 GB sparse `ext4.vhdx` are
both under `D:\AcademicCloudCompute\wsl\AcademicCloudCompute`; registered
C-drive distributions remain zero. WSL1 remains intentionally disabled.
Systemd is running, the non-privileged `academiccloud` user owns the worker
state directories, and the Normal envelope is 8 processors, approximately
8 GB RAM, and 4 GB swap at `D:\AcademicCloudCompute\wsl\swap.vhdx`; no default
C-drive swap exists. The audited `.wslconfig` SHA-256 is
`0f94c64e111057528ea267ace77cdcf43d5bcc091bd731e6613651f1ffe213e6`.

`/dev/dxg`, WSL `libcuda.so.1`, and the RTX 4060 Laptop GPU are visible inside
Ubuntu with driver 572.83, 8,188 MiB VRAM, and compute capability 8.9.
`LOCAL_WSL_INSTALLED_ON_D=PASS`, `LOCAL_GPU_VISIBLE=PASS`, and an actual CUDA
12.8.2 `sm_89` kernel passed. The CUDA package inventory SHA-256 is
`b74a97dc2d1f02c4312abca3134c67660ccf55b87b8dd5b850e9ad13f7433696`.

Exact Linux Node 24.16.0, Paddle 3.3.1/PaddleOCR 3.7.0 with pinned PP-OCRv6
small models, llama.cpp `b10218` at full revision
`de699957b92f490efebad149665b0dccf127eaff`, and Qwen3-1.7B Q8_0 all pass real
execution. The accepted no-network-UI CUDA llama-server SHA-256 is
`ddfde527958667bf1b29603d8c0abe3a92e25decc5c7b5227b5736c4815c5c30`.
Paddle GPU reduced warm requests from roughly 750–820 ms on CPU to 36–47 ms.
Qwen CUDA reduced requests from 944/766 ms at about 23.75 predicted tokens/s to
174/154 ms at 115–121 tokens/s, with 2,060 MiB peak RSS and 4,387 MiB peak total
VRAM. The representative bibliographic qualification passed 7/7. Sanitized
production-child environment repeats passed for both GPU runtimes, so the
selected release settings are Paddle GPU and 999 llama GPU layers; stages remain
sequential at whole-job concurrency one.

Migration 026 and the outbound-only Local Pull worker are deployed. Core issues
an atomic one-worker claim with a 90-second renewable
lease and 30-second heartbeat; expiry queues a new attempt generation. The old
worker, delayed callbacks immediately after expiry, wrong-worker heartbeats,
and Local attempts presented to the legacy claim route fail closed. A duplicate
successful callback remains idempotent. The service exposes no laptop inbound
endpoint and retains separate machine and result capabilities.

The failed A-canary attempt
`f876257a-d5f5-4509-80de-b89145caba16` proved a scheduling defect rather than
a Core or network rejection. Claim completed at 01:13:46.755Z; heartbeats at
01:14:18.838Z and 01:14:50.830Z both returned HTTP 200 and renewed the lease to
approximately 01:16:20.829Z. No third heartbeat reached Core. Attempt 8 then
tested immutable worker-thread release `be2e26d…`: heartbeats at 10:08:53,
10:09:25, and 10:09:57 all returned HTTP 200, but no fourth request reached
Core and the thread reported expiry at 10:11:27, exactly 90 seconds after the
last renewal. This is still category A, now proven at the same-process worker-
thread boundary; no rejection, HTTP timeout, or 5xx was observed. Exact
Paddle/Qwen timestamps were not emitted and are not inferred. The next
correction moves lease maintenance into a lightweight independent Node child
process, retains the 90-second lease, and actively probes lease state over IPC
before every callback attempt. Deterministic tests prove repeated renewal
beyond the original lease under main-process starvation and zero callbacks
after real lease failure.

The v3 admission repair and v4/v5/v6 classification attempts are now historical
evidence. Production advanced through exact encrypted off-host gates and
append-only migration 032 to exact `58b8468…`/schema32. ADR-038 replaces the
per-book correction loop: Qwen proposes
class and facts; the trusted runtime validates positive page-bound class
support and exact field-value support, otherwise class becomes unknown and
unsupported facts cannot receive provenance. Human contributor authority is
preserved while an empty unowned profile may receive its first valid AI
contributor. Schema32 introduces an append-only composite ruleset registry,
preserves immutable v1–v6 evidence, admits final v7/prompt-v4, and removes the
need to rebuild the evidence table for later bounded admissions.

The architecture checkpoint is deployed; the child-process lease correction passes
Compute typecheck/build, Local Pull 12/12, full Compute 107/107 plus 2 expected
release-runtime skips, Compute contracts 3/3, and focused Backend 28/28. The
main worker remains disabled/inactive/PAUSED.

The process-isolated retry for attempt
`53f1e1c7-3fe0-4a2b-b780-44b4e88e3612` claimed the exact identity and received
four Core HTTP-200 heartbeat renewals at 10:59:21.910Z, 10:59:53.828Z,
11:00:26.003Z, and 11:00:58.184Z. No callback was sent. The worker then failed
with a direct `UND_ERR_CONNECT_TIMEOUT` to `cloud.ajtlab.top:443` at 11:02:08Z;
Core recovered attempt `ca2f3aa1-886a-4ee3-b2ea-affc54a9df15` and left it
queued. A subsequent read-only WSL curl reproduced a 10-second TCP connect
timeout to the same host, while the production SSH path also timed out. This
is category C (network/HTTP connect failure) with no evidence of Core rejection;
the current live queue and health cannot be reverified until connectivity
returns. No further claim or retry is authorized in this window.

The latest isolated retry of attempt
`ca2f3aa1-886a-4ee3-b2ea-affc54a9df15` on exact release `64d2136…` started at
11:27:38+08:00. Core received three HTTP-200 heartbeats at 11:28:13.536,
11:28:46.218, and 11:29:19.208+08:00; no fourth request arrived before the
worker failed closed at 11:30:49+08:00 with `Local Pull lease expired`. No
callback was sent. During the same window a production SSH probe timed out;
subsequent bounded WSL HTTPS probes recovered with HTTP 200 and approximately
2-second TTFB. The synchronized transport interruption supports category C,
while the child currently reports only the generic fail-closed expiry because
network errors are intentionally not surfaced as secrets. Core then left job
`11efe8d0-c2e9-424f-aa64-804bd90919b4` failed/`compute_timeout` at attempts 11
with no eligible local_pull job. Production remains last-known healthy at
`58b8468…`/schema32 and the main worker remains `58b8468…`,
PAUSED/disabled/inactive. Do not claim another attempt or enter B/C, NORMAL,
forced-loss, or corpus execution until network and disk readiness gates pass;
only then may the ordinary product UI create a fresh normal-product A target.

The fresh read-only production readiness audit (2026-08-29T03:22:09Z) also
returned `NOT_READY` for separate release-engineering findings: root-disk
availability 9,741,028 KiB below the 10,485,760 KiB gate; a kernel OOM counter
of 9 despite zero cgroup `oom_kill` and zero recent service errors; and a
post-UX01 CSP profile mismatch for the files domain. The worktree cleanliness
check also fails only because preserved untracked task diagnostics remain.
These findings were not changed or used to reinterpret the canary failure.

The required low-frequency network qualification then ran independently on the
Windows host and in `AcademicCloudCompute` WSL. Windows sampled 65 probes over
approximately 15.5 minutes: 57 complete successes, 3 TCP connect-timeout
events, 5 probes with an HTTP error, DNS failures 0, health/ready median TTFB
about 1.83/1.80 seconds, maximum observed TTFB 5.02 seconds, and a longest
failure streak of about 20 seconds. WSL sampled 60 probes over 1,347.7 seconds
(timeouts extended the wall clock): only 7 complete successes, 52 TCP
connect-timeout events, 43 probes with an HTTP error, DNS failures 0, health
median TTFB about 1.92 seconds among numeric samples, and a longest failure
streak of about 230 seconds. Several Windows and WSL failures occurred within
seconds of one another, so the former absolute-zero-timeout gate recorded
`FAIL`; that criterion is historical and has since been superseded by the
Owner's transient-network resilience contract. The following bounded
differential isolates the observed layers.

The differential diagnosis now identifies the shared failing path more
precisely. `cloud.ajtlab.top` has one A record (`47.250.126.42`) and no AAAA;
Windows and WSL resolve the same address, neither has a proxy environment, and
curl/OpenSSL/Windows Node/exact WSL Node all succeed when the path is healthy.
Windows routes the target through the active `sing-tun` adapter; WSL uses NAT
through that Windows route. Paired source-bound probes kept the physical WLAN
green for HTTPS 12/12 and SSH 5/5 while the TUN path independently produced one
TCP connect timeout in each series (HTTPS 11/12, SSH 4/5). TUN and WSL MTU are
both 1400, DF behavior is correct, and there is no PMTU black-hole evidence.
The current restarted WSL sample was 12/12, so the prior WSL amplification is
localized to NAT traversing the unstable TUN but no second DNS/IPv6/MTU/proxy/
client/vSwitch cause is proven. WSL configuration remains unchanged.

The Owner-authorized temporary `47.250.126.42/32` physical-WLAN route test ran
90 paired Windows/WSL probes over 15 minutes. Eighty-nine probes were complete
successes; DNS and SSH were 90/90, WSL remained green, and one Windows
`/ready` connection timed out. The ActiveStore route was then automatically
removed with zero exact route remaining. This evidence confirms ordinary
transient path loss rather than a persistent WSL fault. The Owner subsequently
superseded the absolute-zero-timeout gate: network acceptance now requires
fail-safe handling, no false callback or metadata promotion, automatic
requeue/recovery, and eventual success in an available window. Broad network
diagnosis is closed.

After live reference, manifest, pushed-checkpoint, artifact-hash, and projected-
space preflight, the approved exact disk set was removed: 34 unreferenced Core
releases, ten task-owned verified staging directories, and apt cache. No WSL
release was removed. Current `58b8468…`, rollback `fd97542…`, the production
database, backups, corpus, logs/journal, diagnostics, Owner/unknown files, and
Compute `64d2136…` were preserved. Root available space rose from
`9,935,462,400` to `12,535,619,584` bytes and later re-read as
`12,568,662,016`; `PRODUCTION_DISK_HARD_GATE=PASS`. Core remains
`active/running` with zero restarts, schema 32, SQLite integrity `ok`, and
zero foreign-key violations.

The separate D-backed WSL filesystem currently has 4,479,467,520 bytes
available of 269,965,701,120. Its current `58b8468…`, rollback `fd97542…`, and
exact candidate `64d2136…` are protected; 22 other manifest-verified, pushed,
reconstructible releases have 187,428,646,130 apparent bytes. This is not part
of the production-root gate and no WSL release deletion is authorized.

The OOM counter is historical host-wide evidence: three kernel `oom_kill`
events on 2026-08-16 (nine matching journal lines) killed `MainThread` outside
the AcademicCloud cgroup. Current Core cgroup `oom_kill=0`, Local Compute OOM
counter `0`, and no memory-limit change was made. Direct Nginx/public CSP
headers currently include `https://files.ajtlab.top` in both `img-src` and
`frame-src`; the readiness profile discrepancy does not block the AI API path
and remains a browser/display gate finding only.

The first fresh schema32/v7 A job created through the normal production website
was exact job `746866b2-9c67-441d-9751-39805dbc836a`, attempt
`e0f03b31-1ccb-4e90-9eaa-947467d795a0`. Isolated release `64d2136…` claimed
that identity, completed seven bounded range requests, renewed its lease twice
with Core HTTP 200, and failed closed at `bibliographic_reasoning` because the
Qwen result did not pass trusted runtime validation. Core persisted
`compute_invalid_result`; there was no success callback, structured evidence,
or canonical metadata promotion. The main worker remained
PAUSED/disabled/inactive. This proves the tightened fail-safe boundary but is
not an A PASS. Use another clean modern-scholarly resource through the ordinary
UI; B/C remain blocked on A. Forced-loss follows all three canaries, then the
exact worker may enter NORMAL, enabled/active, concurrency one. Final browser
acceptance and full-corpus execution remain as previously defined; GitHub-
hosted production Compute remains unused.

The bounded v8/prompt-v5 successor passed local full-pipeline GPU qualification
and then the fresh production A canary on `Mongolia: politics, economics and
society`. Normal UI created exact job `7496e55d-ce63-4fc6-aeba-853622d0aa37`
/ attempt `e37f03a9-8d36-40b1-b9b5-b3c7efb5f9ef`; isolated exact Compute
`b349595…` completed and Core persisted the current attempt. The structured
digest, v8/prompt-v5 identity, page-bound positive scholarly class evidence,
all 11 populated fact evidence rows, no invented contributor, no incompatible
source-edition facts, no human-authority write, unchanged object identity, and
title-only modern display (missing author omitted) passed. After reload the
normal website still showed `AI 编目已成功——已有可复核证据` and the complete
`AI 建议书目记录` with expandable field evidence. `A_CANARY=PASS`.

The normal website then created B job
`d127fb0e-2bdd-4eb2-a44a-f6a25768ae0f` / attempt
`dabf828b-9d86-47df-a3b4-cf39646e7c7c` for `敦煌变文校注`. Exact isolated
Compute `b349595…` received Core HTTP-200 heartbeat renewals at 22:55:42,
22:56:14, 22:56:45, and 22:57:17+08:00. The following public-network window
prevented renewal through the former 90-second lease; the worker failed closed
at 22:58:47, sent no callback, and Core atomically requeued attempt
`e2194dca-7f9d-4e1e-a8b6-66616de595ce` at 22:58:57. This proves safe recovery
but not B completion. The initial 180-second tolerance was also exhausted after
four further HTTP-200 heartbeats and another continuous transport gap, again
without a callback and with atomic recovery. The evidence-calibrated correction
changes only the lease from 90 to 270 seconds, covering the measured 230-second
historical outage with margin while retaining the 30-second cadence,
independent child keeper, stale-attempt rejection, and fail-closed callback
checks. Backend 381/381, workspace typecheck/build, and compiled acceptance
pass. Exact Core `b3debfb…` deployed the 270-second correction without a schema
change. A subsequent normal-UI B target, 《元朝秘史》（校勘本）, was claimed on
exact isolated `b3debfb…`; extraction completed and the failed callback
persisted, but Qwen returned `content_truncated` after reaching the 8,192-token
completion bound. No evidence or canonical metadata was promoted. A generic
transport audit reproduced that the former 64 KiB page payload could make a
Chinese prompt itself exceed the pinned 16K context. Exact pushed Compute
`6b68d1a…` now distributes an 8 KiB page budget across selected pages, pins a
32K context, and explicitly disables reasoning while preserving v8/prompt-v5,
all evidence/authority gates, and the 8,192-token completion bound. Compute
114/114 (plus two expected runtime skips), contracts 3/3, workspace
typecheck/build, immutable file verification, and a real CUDA run with no
truncation pass. One isolated B retry is next; C, forced-loss, NORMAL, and
corpus work remain blocked meanwhile.

## Historical incident evidence (superseded as current acceptance)

Owner real-browser production acceptance earlier on 2026-08-24 overrode every earlier
synthetic fixture, harness, CI, worker, and repository acceptance claim. The
same normal deployed-website path now passes after live-boundary diagnosis and
bounded repair. This remains valid historical path evidence, but its closure and
Internal Beta conclusions were superseded by the active full-corpus contract;
Internal Beta and invitations have still not started.

```text
PRODUCTION_USER_ACCEPTANCE=PASS
INCIDENT_L1_AI_PRODUCTION01=CLOSED
INTERNAL_BETA_READY=true
OWNER_REAL_BROWSER_PATH=PASS
```

Live production identity and the first failure boundary are now established:

```text
PRODUCTION_FRONTEND_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
PRODUCTION_FRONTEND_JS=index-OhtI0cc3.js
PRODUCTION_FRONTEND_JS_SHA256=5e64a5c4c34aebbb1fe8c68ab18172a8a31c0243efebe708b34a0f08d20f0689
PRODUCTION_CORE_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
SCHEMA_VERSION=v25
MIGRATION_HISTORY=001-025
FIRST_FAILURE_BOUNDARY=H. WORKER_COMPUTE
ROOT_CAUSE=fixed aggregate PDF range ceiling was sized to fixtures instead of the admitted object, and the aggregate OCR deadline discarded already-completed bounded evidence
FIX_COMMIT=ccde12d0f1aadff484b42841eb1136061f86cb9b
```

The normal signed-in Owner UI opened the real canonical-Library resource
`ad0cc21f-dd8e-48be-b223-d2576ab0d33f` (62,990,004 bytes). The retry request
returned `202`; authenticated job polling returned `200`; the durable job,
attempt, provider receipt, dispatch, and worker claim all existed. The prior
attempt then became `failed/compute_timeout` 5.606 seconds after claim, with no
browser console error. Multiple other real Library PDFs failed in the same
5–6-second interval, while the 60,585-byte golden fixture passed. The deployed
Compute constant was exactly 5,000 ms. A first 30,000 ms bounded adjustment was
published as exact worker `8e687343f83706c1caa6c0e466b3494bca3d96fb`
and tested from the same UI/resource in run `32693793765`, attempt
`fcf08f10-00c1-4ca4-ae92-4c4eb918f0e6`. It advanced farther (peak RSS
222,720,000 bytes versus 185,860,096 bytes on a five-second control) but again
ended `compute_timeout` exactly 30.948 seconds after claim. This proves the
failure remains the same parser deadline and rejects 30 seconds as insufficient.
The next bounded value of 120,000 ms was published as exact worker
`478098904ac23bca9d9d99f43309acdfa3221ea1` and tested from the same
UI/resource in run `32694218980`, attempt
`8c262ac5-bd35-46f2-bebf-e20e2a2d16b0`. It again ended
`compute_timeout` exactly 120.646 seconds after claim. Repeated exhaustion of
every supplied aggregate deadline rules out ordinary latency headroom. A
privacy-safe diagnostic now reports only the bounded operation stage and range
request/byte counters outside the durable callback; source URLs, PDF content,
candidate content, and metadata remain absent. Exact diagnostic worker
`aafb608a2e52ab2a36b679def6f0ac9e1697ce68`, run `32694721068`, attempt
`34327558-fae8-4359-af66-1c18f8507090` reported
`stage=document_load`, `rangeRequests=31`, and `rangeBytes=31,532,724`. With
the 1 MiB initial prefix, this reaches the 32 MiB aggregate ceiling; the next
request is replaced by an empty chunk and PDF.js cannot finish document load.
The smallest repair raises only the aggregate range ceiling to 64 MiB while
retaining range-only access, the 1 MiB request cap, 64-request cap, 4 GiB object
cap, 120-second parser, 180-second request, and 420-second worker ceilings. The
same-resource run on exact worker
`61692e9df22c5f063d79e98a37a065987599e5d6`, run `32695272586`, attempt
`e12ea293-1e99-4892-aa64-50813c42d1b0` cleared `document_load`, read 60 ranges /
61,941,428 bytes, and continued past the prior parser termination. It then
ended `compute_timeout` exactly at the 180-second total extraction deadline.
Because page load/render failures are already stage-labelled, the only
remaining unlabelled timeout path in the source is OCR recognition; the next
exact worker labels that path and extends only the total extraction window to
300 seconds inside the unchanged 420-second worker and 10-minute capability.
The incident stays open pending that same-resource result.

That same-resource result is now green but is only the first of two required
acceptance boundaries. Exact worker `c9b87babb32899f01ef3162a42a0c4b52cd7437f`,
run `32695881291`, worker job `97337737363`, and attempt
`91975c39-aa9e-462a-b78d-0d55af5e34fb` completed in 5m05s. Core persisted
`succeeded`, a complete 20-page selected window, and a reviewable candidate;
the real resource-details UI displays it with no console error. Peak worker RSS
was 279,941,120 bytes. `CURRENT_62_99MB_OWNER_PATH=PASS`.

That result did not by itself close the incident because it consumed 61,941,428
later range bytes plus its initial prefix, almost the entire 64 MiB allowance.
PDFs above 64 MiB are expected: uploads admit 5 GiB, Compute descriptors retain
a 4 GiB source bound, and approved production PDFs observed read-only extend
from 72,459,070 to 922,469,003 bytes. The repair now derives aggregate range
bytes and request count from exact object length at 1 MiB per request. It
separately caps PDF.js's full-length backing buffer at 1 GiB, covering the
observed corpus inside the qualified <6 GiB worker envelope; larger signed
sources fail before object read and leave the admitted file untouched.

The >64 MiB gate is now green. A first 72,459,070-byte control failed only at
later strict reasoner validation and was not counted as acceptance. The normal
Owner retry for existing resource `1b36e0fc-e0ac-4cbb-a49c-ff6be1959141`
(76,097,594 bytes) then proved aggregate access above 64 MiB: run `32698078764`
read all 76,097,594 bytes in 73 bounded requests before reaching the unchanged
300-second aggregate OCR deadline. The follow-up repair uses the existing
explicit incomplete-window contract to retain already-completed pages at that
aggregate boundary; it does not increase timeout, memory, page-count, or
concurrency limits, and first-page, earlier per-page, and non-timeout failures
still fail closed.

Exact Compute source `ccde12d0f1aadff484b42841eb1136061f86cb9b`, run
`32699116627`, worker job `97346899192`, attempt
`783309ad-12aa-48be-ae90-e9259c960531` then succeeded on the same resource. It
read 76,097,594 bytes in 73 bounded requests, peaked at 384,147,456 bytes RSS,
and durably persisted result digest
`efb16937ba71a18edbacc964c50903d56537a563720ccae465e9dcede12e31f9`
with two candidates and `windowComplete=0`. The real signed-in production UI
shows `AI 编目 · 可审阅`, both page-specific OCR suggestions, and the incomplete-
content warning with no console error. No candidate was accepted and no source
bytes, OSS identity, or human-authoritative metadata changed.

```text
CURRENT_62_99MB_OWNER_PATH=PASS
LARGE_PDF_OVER_64MB_PATH=PASS
OWNER_REAL_BROWSER_PATH=PASS
REAL_BROWSER_E2E=PASS
INCIDENT_CLOSED=true
```

Execution-access recovery `ACADEMICCLOUD-EXECUTION-ACCESS-RECOVERY01` is
resolved for the incident: the production SSH route, Git checkpoint/push path,
and authorized GitHub Actions browser evidence are available. Frontend/Core and
schema releases did not change; only the authorized derived job/result state was
persisted, while source bytes and canonical metadata remained unchanged.

The production-wide AI cataloguing incident is **CLOSED / OWNER REAL-BROWSER
PATH PASS**. The historical diagnosis below remains preserved.
Representative new-upload and legacy re-catalogue jobs both dispatched to
GitHub Actions/Compute and failed at the same PDF.js range transport callback:
`#onReceiveData - no PDFDataTransportStreamRangeReader instance found.` The
failure occurs before OCR/Qwen; a successful historical worker run is the
control. The proven common cause is a stale/late range response racing PDF.js
range-reader removal. No `COMPUTE_PROVIDER` inference or configuration change
is implicated or deployed.

The bounded repair is implemented in `compute/src/pdf-text.ts`: range transport
callbacks are lifecycle-guarded, stale PDF.js reader assertions are ignored
narrowly, and transport disposal precedes `loadingTask.destroy()`. Focused
Compute regression and full Compute gates are green. The independent repaired-
release PDF.js gate is green against the existing 60,585-byte Library PDF and
is recorded separately from the migration-025 automatic-admission release.

Migration 025 adds durable admission origin/priority and bounded
undispatched-job reconciliation. Core's atomic attempt claim is the durable
exactly-once provider-execution gate across a lost GitHub dispatch receipt and
Core restart; the restart regression is green.

The established `academiccloud-prod` SSH route is restored through the
approved path. A bounded read-only probe confirmed exact release
`017a47dbd837264175d8cbcb3f469a01e3e62c92`, active service with `NRestarts=0`,
loopback/public health `200`, and readiness `200`. The earlier alias failure
was `SSH_CONFIG_NOT_VISIBLE` in the restricted execution sandbox, not DNS or
host unavailability. GitHub Actions API access remains blocked by the
restricted CLI/keyring path and the in-app browser security policy. The later
automatic-admission release still needs deployment and a real new-upload AI
E2E; the independent existing-resource PDF.js repair gate is recorded below.

```text
PDFJS_REPAIRED_RELEASE_E2E=PASS
PDFJS_REPAIRED_RELEASE_LEGACY_E2E=PASS
RESOURCE_ALREADY_EXISTED=true
PRE_FIX_FAILURE_BOUNDARY=PDFJS_RANGE_READER
NEW_JOB_CREATED=true
DISPATCH=PASS
WORKER_CLAIM=PASS
PDF_RANGE_ACCESS=PASS
PDFJS_STALE_READER_ERROR_ABSENT=true
OCR_OR_DOWNSTREAM_EXTRACTION_REACHED=true
CALLBACK=PASS
TERMINAL_STATE=succeeded
PDFJS_REPAIRED_RELEASE=3a88cfef7a4083ebe2a0277bd50b356e5fb86f46
PDFJS_REPAIRED_RELEASE_RUN=32634435946
PDFJS_REPAIRED_RELEASE_WORKER_JOB=97181965279
DUPLICATE_DURABLE_JOBS=0
DUPLICATE_PROVIDER_EXECUTIONS=0
AMBIGUOUS_DISPATCH_RECOVERY=PASS
```

The safe local UX portion is complete: Owner navigation exposes `待审核投稿 · N`
and opens the existing contribution review flow; Activity Center and resource
details show normalized AI failure categories with a durable retry action.

## Current situation

`L1-INTELLIGENT-LIBRARY01` is complete across mandatory checkpoints A–F and
deployed as one exact integrated production release. Layer 1 now includes the
ADR-032 normalized bibliographic domain, ADR-033 ephemeral sequential
PP-OCRv6-small → Qwen3-1.7B pipeline, ADR-034 metadata-aware Search/filter/
display composition, ADR-035 deterministic offline citation output for Chicago
Notes & Bibliography, 《历史研究》, 《文史哲》, and GB/T 7714—2025, plus the
compact Library/Activity/details/edit/citation experience. Core remains the
only authority for Library access, canonical data, CAS, field authority, and AI
application; human fields are never silently replaced and AI failure never
invalidates an admitted file.

Exact source `017a47dbd837264175d8cbcb3f469a01e3e62c92`, artifact
`9477785607` from run `32580834900`, passed deterministic Linux build,
independent download/manifest verification, isolated Alibaba-host runtime
acceptance, full backend/frontend/Compute/contract tests, workspace typecheck,
production build, compiled acceptance, audit, and private-artifact/config
review. The stopped-service v22 backup was verified, encrypted, published to
the private off-host repository, and independently rehashed before exactly
migrations 023–024 were applied.

Production is healthy on schema v24/history 001–024: SQLite integrity `ok`,
foreign-key violations 0, exact process/frontend identity, public and loopback
health/readiness green, `NRestarts=0`, one loopback listener, clean journal/OOM
evidence, and protected configuration unchanged. Backup/live comparison proves
no full-Library AI wave or historical backfill. The immediate rollback pair is
exact previous application `53317bb…` plus
`academiccloud-pre-l1-20260822T152800Z.sqlite`; rollback was not required.
`UPLOAD-PERF01` is the next approved task but has not started. Internal Beta
remains unstarted and no users were invited.

Current production after the migration-025 release and Owner real-browser
acceptance:

```text
PRODUCTION_RELEASE=17fb945220c44df71e4846a0ccd5f54e98f43858
PREVIOUS_RELEASE=3a88cfef7a4083ebe2a0277bd50b356e5fb86f46
SCHEMA=v25
MIGRATIONS=001-025
MIGRATION_025_PRODUCTION_APPLIED=true
AUTOMATIC_ADMISSION_RELEASE_PENDING=false
LAYER1_COMPLETE=true
INTERNAL_BETA_READY=true
INTERNAL_BETA_STARTED=false
NEXT_ACTION=STOP for Owner Internal Beta decision
```

## Storage incident closure

`OPS-STORAGE-INCIDENT01` is closed after the exact least-privilege RAM v2 repair,
bounded runtime/CORS/R3 application repairs, verified release `08657727…`, and
Owner-reported real-browser storage acceptance. Historical provider, artifact,
failed-closed deployment, rollback, CORS, pending-upload, and production
verification evidence remains unchanged in the completed incident,
application-repair, and hotfix cards.

No further RAM/OSS/CORS policy mutation is part of GOAL-BETA-PREP01. The
incompatible Search-bearing artifact `9405764771` / source `8d289702…` must never
be selected.

## Metadata Suggestion memory incident closure

The Metadata Suggestion failure was not a reopened storage incident. Before the
Compute cutover, production reached the heavy PDF/render/OCR path inside Core. With
`MemoryHigh=320MiB`, observed usage around 328 MiB, and `MemoryMax=384MiB`, cgroup
reclaim blocked the Node event loop and globally stalled the backend even though
the process stayed alive with zero OOM, OOM-kill, or restart.

The diagnosis classified this as a single-document working-set spike against the
Core runtime limit. No repeating leak was established; concurrency amplification
was latent in the old in-process design. Phase 2 removed that heavy path from
Core and the real canary proved fault isolation, so the incident is closed. The
diagnostic record remains `tasks/done/OPS-METADATA-MEMORY01-DIAGNOSIS.md`.

## ARCH-COMPUTE01 development checkpoint

The Owner authorized `JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01` to
physically separate the first two heavy workloads while preserving existing OCR,
Metadata Suggestion, and canonical-authority semantics.

Delivered:

- SQLite-backed durable jobs with opaque identity, attempt correlation,
  idempotency, strict transitions, stable error codes, result digest, and durable
  deadline/stale classification;
- provider-neutral Compute contracts plus the first GitHub Actions dispatcher;
- a clean concurrency-one worker that receives only opaque routing, claims one
  short-lived exact source capability, and returns strictly validated candidates;
- the existing PDF.js/native-text/page-selection/canvas/Tesseract/extraction
  implementation and fixtures moved into the Compute workspace;
- sequential one-page render/OCR/cleanup with bounded Range reads and no retained
  page-proxy collection through the OCR pass;
- Metadata Suggestion POST changed from request-lifetime compute to HTTP 202
  durable job creation, with only queued/processing/succeeded/failed UI states;
- Core remains sole authority for Auth, Library, SQLite, source validation,
  suggestion persistence/review, and canonical metadata CAS writes;
- the Core package/artifact/CI path no longer installs, packages, imports, or
  verifies PDF.js, native canvas, Tesseract, trained data, or OCR E2E solely for
  Metadata Suggestion; the dedicated Compute workflow owns those checks.

The local vertical slice proves:

```text
Core authorization/job
→ opaque adapter dispatch identity
→ worker claim
→ bounded PDF Range read and recognition
→ authenticated candidate callback
→ Core validation and persisted reviewable suggestion
→ unchanged manager canonical acceptance path
```

Verification at this checkpoint:

```text
BACKEND=326/326 PASS
FRONTEND=247/247 PASS
COMPUTE=52 PASS / 0 FAIL / 1 EXPECTED LOCAL-RUNTIME SKIP
COMPUTE_CONTRACTS=1/1 PASS
BUILD=PASS
COMPILED_ACCEPTANCE=PASS
```

## COMPUTE-GHA02 hosted qualification

Exact base `7389fc3d5c8b94ffce8a1a2aaf3d29fbcbcaa106` was qualified through
workflow-only source `19e4d047b50263536f46d11bb5075698c479d73f` on GitHub-hosted
`ubuntu-24.04`. Final run `32403834659`, job `96538104436`, passed exact
source/ref verification, Compute contracts typecheck/test/build, Compute
typecheck/test/build, the pinned Tesseract 5.5.3 runtime build, real OCR E2E
with zero skips, the existing five-run memory assertion, and the independent
output/production-shell safety step. The protected production Compute job was
skipped, no artifact was uploaded, no production secret was supplied, and only
repository fixtures/synthetic pages were processed.

Final exact-run memory evidence:

```text
CLEAN_START_RSS_BYTES=267780096
PEAK_RSS_BYTES=533995520
POST_JOB_RSS_BYTES=504348672
RUN1_TO_RUN5_POST_RSS_DRIFT_BYTES=4247552
GNU_TIME_MAX_RSS_KIB=521480
NODE_PEAK_GATE_BYTES=536870912
FINAL_RUN_HEADROOM_BYTES=2875392
```

This one pass is not a reproducible 512 MiB qualification. Two immediately
preceding clean hosted probes of the unchanged Compute code peaked at
547,672,064 and 549,146,624 bytes and failed the same fixed gate. No threshold,
memory limit, or Compute code was changed. The durable evidence is
`tasks/done/COMPUTE-GHA02.md`.

The first hosted failure also exposed the protected production-workflow staging
mismatch: the builder rejects targets outside repository `output/`, while the
protected production job still requests `runtime/tesseract`. The qualification
job uses a valid `output/qualification` staging path. That protected path was
never executed or repaired during qualification.

COMPUTE-PRECUTOVER01 has now superseded those two blockers without rewriting
their history. ADR-031 records the provider-specific `<768 MiB` GitHub-hosted
decision and first-use high-water classification. The protected job now uses
verified `output/` staging/promotion, and exact run `32407660640` passed the
real-runtime, memory, drift, privacy, output, and zero-artifact gates. Full
evidence is in `tasks/done/COMPUTE-PRECUTOVER01.md`.

ADR-031 remains authoritative for the architecture/security/callback model.

## Active Owner-authorized program — GOAL-BETA-PREP01

Codex Goal Mode is authorized to proceed in this exact order:

1. **COMPUTE-PRECUTOVER01 — COMPLETE** — provider-specific GitHub-hosted memory contract and protected Tesseract staging repair passed without production mutation;
2. **Core/Compute production cutover — COMPLETE** — exact artifact, verified backup/off-host copy, migration 022, least-scoped credentials/environment, exact deployment, Core invariants, and one bounded real canary passed;
3. **RF-SEARCH01 production closure — COMPLETE** — ancestry-backed composition, focused tests, production browser gate, new exact artifact `9424397852`, independent/local/host verification, and same-schema application cutover passed; historical artifact was not used;
4. **L1-UX08 beta-minimum Activity Center v0.1 + Source Recovery — COMPLETE** — shipped through same-schema app-only releases `156660d…` → `01747d9…` → `c741455…`; the replacement-release browser journey exposed and `c741455…` repaired a canonical duplicate-name completion defect (early `name_conflict` pre-flight, clean status mapping, orphan-object discard on abandon); the exact-release 46/46 browser journey passed multipart resume, real GitHub Compute suggestion, wrong-file fail-closed, mobile, and the stub-picker path with zero residue;
5. **QA-GOLDEN01 — COMPLETE** — the exact-release golden journey `golden-202608211339-u8o6iv` passed 32/32 on production `c741455…`: authenticated session → Library → Search (no-result, stale-safety, clear-restores, live filename fallback) → immediate Activity Center state → controlled 64 MiB pause/continue → stable duplicate-name failure → details/preview/byte-verified download → Metadata Suggestion 202 → queued → processing → real GitHub Compute run `32488192994` → succeeded with reviewable candidates while canonical metadata stayed unchanged and Core stayed healthy → favorite → recycle/restore → 390×844 mobile smoke → zero residue.

When all are green, set `INTERNAL_BETA_READY=true`, reconcile exact release,
schema, rollback pointer and durable repository state, then STOP for the Owner's
actual internal-beta decision.

## Credential/privacy/cost boundaries

Phase 2 cutover evidence:

```text
REPOSITORY_HEAD=a3af736e36b3830f728e60e92cfb483e26a0b28f
ARTIFACT_SOURCE=1c3bb10a48082995924a2d9ec41a48d6d3d34acd
PRODUCTION_BUILD_RUN=32407660568
ARTIFACT_ID=9421010643
ARTIFACT_DIGEST_SHA256=48abdc8b2ebfb5484358d6983f83d2f7c7dcb7956d9a2b028d484f668a9e7836
ARCHIVE_SHA256=1b78cf47ea1938cbed5e1247f27dc5be392596287ae02eb0f4ec0475c5b78e1c
MANIFEST_SHA256=7dfed78239ef60f012b0865715eb78a9a5e0553c7dee6017b68fbd1fa445df7e
PRODUCTION_RELEASE=1c3bb10a48082995924a2d9ec41a48d6d3d34acd
PREVIOUS_RELEASE=08657727a17a7ea766ad0d74cc663fa40f91eee1
PRODUCTION_SCHEMA=v22 / 001-022
SQLITE_INTEGRITY=ok
FOREIGN_KEY_VIOLATIONS=0
BACKUP_SHA256=1c00b6bcb9fe7e5aaf30a28c9e0b797753626d0ec99f79d2ebe799d097a8609a
OFF_HOST_BACKUP_COMMIT=22b05321febe6bfceb7d1bd609b30b499937b7d2
COMPUTE_ENV_KEYS=seven root-only minimum keys
GITHUB_PROTECTED_ENVIRONMENT=academiccloud-compute-production
FINE_GRAINED_PAT=single repository / Actions write / 30 days
CANARY_RUN=32415058752 / PASS / ZERO ARTIFACTS
CANONICAL_METADATA_CHANGED=false
OSS_RAM_CORS_MEMORY_LIMIT_CHANGED=false
COST_CHANGED=false
```

- Codex may generate/install one strong bootstrap secret without printing or logging it.
- A least-scoped workflow-dispatch credential may be used if already available/provisionable without broad account privilege. Do not repurpose/store a broad personal GitHub token on production. If a compliant dispatch credential requires Owner interaction, STOP only at that exact credential gate.
- The Owner accepts one bounded production canary PDF being transiently processed by a GitHub-hosted runner through the ADR-031 short-lived single-object capability model, with no raw PDF/text/candidates/source URL/capability in logs or workflow artifacts.
- No paid infrastructure, second server, cost-bearing object-backup work, broad provider-policy mutation, or unrelated roadmap work is authorized.
- Do not change production `MemoryHigh`/`MemoryMax` merely to hide a Compute defect.

## RF-SEARCH01

RF-SEARCH01 is complete and remains frozen in behavior. Its exact historical candidate is
`7bba7b869fd1234c1e7c67002cb93368c299209b`. Post-checkpoint ancestry
verification proved that Phase 2 source `1c3bb10…` already descends that
candidate, and the production UI exposes Search. The historical artifact was
not reused, but the prior durable claim that Search was absent was wrong and the
required Phase 3 browser-before-final-release sequence therefore had to be
re-established on a new release.

All Search-specific backend service/HTTP files and the dedicated frontend
component/tests are byte-identical to the frozen candidate; newer shared
`App`/API/i18n changes retain that behavior. Focused checks pass 14/14 backend
and 137/137 frontend, plus all-workspace typecheck. The production desktop
browser gate passes Chinese title, author, author+title, original-filename
fallback, no result, Escape/clear folder restoration, rapid-query stale safety,
and opening the existing details surface. Exact integrated source `b19f9dc5…`
then produced artifact `9424397852` in run `32417182890`; its build and
independent jobs, local hashes, and host verifier passed. The 4,789-file runtime
tree is byte-identical to previous release `1c3bb10…` except artifact-manifest
identity. At the Phase-3 checkpoint production selected `b19f9dc5…`; health/readiness, process identity,
schema v22, SQLite counts/integrity/FK, and the post-deploy browser journey pass.
The historical artifact remains permanently forbidden.

## INTERNAL_BETA_READY — historical gate reached; still not started

All five GOAL-BETA-PREP01 phases first reached green on the then-current exact
production release `c741455…`; the later Layer-1 release preserves this gate:

```text
CORE_COMPUTE_CUTOVER=COMPLETE (schema v22 / 001-022)
REAL_GITHUB_COMPUTE=PASS (canary 32415058752; golden 32488192994; Core responsive)
SEARCH_PRODUCTION=PASS (browser gate green on the composed baseline)
ACTIVITY_CENTER_V0_1=PASS (46/46 exact-release browser journey)
GOLDEN_JOURNEY=PASS (32/32 exact-release browser journey, zero residue)
UNRESOLVED_BLOCKERS=none
PRODUCTION_RELEASE=c741455d7aa631d5b8c37149e8643a6a75b1cae8
ROLLBACK_POINTER=01747d929cb42e4c107d47c10ad66047377f6bcd (same-schema app-only)
INTERNAL_BETA_READY=true
NEXT=OWNER_INTERNAL_BETA_DECISION
```

Internal beta itself is NOT started and no users are invited. Starting/inviting
remains exclusively the Owner's decision.

## HOTFIX-META-UX01 — Owner-authorized product-usability hotfix

Owner-authorized on 2026-08-21 as one bounded same-schema hotfix on production
`c741455…` / schema v22: (A) fast lightweight canonical-title suggestions
available ≤2 s independent of GitHub Compute/OCR (idempotent, stale/CAS-safe,
no auto-accept, junk filenames rejected, no OSS rename); (B) manager-only batch
naming for selected Library holdings (preview → edit/select/deselect →
"select reliable suggestions" → explicit confirm → per-item results; one
stale/conflict item never rolls back others; existing canonical metadata
authority/CAS; OCR not required; no physical rename); (C) server-authoritative
Library sorting (newest/oldest/title/size) with Chinese Han ordered by
normalized Hanyu Pinyin, punctuation/brackets/spacing never dominant, Latin A–Z
in the same key system, one deterministic numeric policy, Unicode fallback,
title-then-file-identity tie-breaks, and stable keyset cursor pagination;
Search ranking unchanged.

Key design decision: the migration-019 append-only evidence model is preserved
exactly. Fast naming persists one immutable run per job; the OCR/Compute
callback persists a second immutable superseding run (`suggestion-<jobId>-computed`),
latest-run resolution surfaces it, and an accepted run stays frozen. No trigger
change, no migration, no candidate delete/update.

Verification and deployment:

```text
BACKEND_SUITE=343/343 PASS (6 sorting + fast/batch naming tests)
FRONTEND_SUITE=259/259 PASS
WORKSPACE_TYPECHECK=PASS
PRODUCTION_BUILD=PASS
GIT_DIFF_CHECK=PASS
MIGRATION_CHANGE=none (schema v22 / 001-022)
OSS_RAM_CORS_PROVIDER_CREDENTIAL_COST_CHANGE=none
PRODUCTION_BUILD_RUN=32500123948
ARTIFACT_ID=9453231114
ARCHIVE_SHA256=620f2c95185e5764ce0f050fc54ba737e45860b1a314e93960f6c954bc70c14f
MANIFEST_SHA256=dee1539139ccdfbc26baf4d8392534ebde7f07dedb6befa4618844fc0044da57
HOST_VERIFIER=PASS (archive/manifest/checksum, tree match, release policy,
native ELF64, compiled acceptance; evidence at
/root/academiccloud-verify-53317bb/output/53317bb-stage/host-evidence.json)
RUNTIME_DELTA=exactly the bounded feature surface (39 added / 1 removed / 16
changed; no database/deployment/scripts/compute change)
DEPLOYED_RELEASE=53317bb0156589baa21bc69c22e199d200c49840 (same-schema app-only)
PREVIOUS_RELEASE=c741455d7aa631d5b8c37149e8643a6a75b1cae8 (rollback pointer)
MIGRATION_RUNNER={"appliedVersions":[],"currentVersion":22}
SERVICE=active / NRestarts=0 / one loopback listener
HEALTH_READINESS=ok/ready loopback and public
SCHEMA_AFTER=v22 / 001-022
SQLITE_INTEGRITY=ok
FOREIGN_KEY_VIOLATIONS=0
PROTECTED_CONFIG_HASHES=unchanged (env, systemd unit, nginx site, security headers)
JOURNAL_SCAN=clean (zero error/fatal/unhandled/exception since restart)
PENDING_FIXTURES=unchanged durable state (6 pending_upload files, 5 multipart rows)
DATABASE_MUTATED=false
OWNER_MANUAL_ACCEPTANCE=PENDING (Owner performs manual product acceptance
in production after deployment; no browser automation was run per Owner override)
```

## Next action

STOP for the Owner's manual product acceptance of HOTFIX-META-UX01 (fast
naming, batch naming, sorting, regression surfaces) and the internal-beta
decision. Do not begin internal beta or invite users.
