# ADR-037 — Local Pull Worker as the Production Compute Control Plane

**Date:** 2026-08-24
**Status:** Accepted by Owner; pre-corpus code review and local runtime qualification passed at `d1bddb6`; immutable release and production cutover pending

## Context

AcademicCloud's durable Core/Compute separation is correct, but the first
provider adapter executes every production bibliographic job through a
GitHub-hosted Actions runner. Production inventory now contains 93 eligible
PDFs, the final acceptance corpus currently contains 105 unique resources, and
GitHub Actions has consumed 1,701 of 2,000 included hosted minutes while the
Owner's Actions budget remains USD 0. Per-document hosted setup, queueing,
runtime preparation, qualification, and runner allocation are therefore the
wrong normal production control plane for the remaining stabilization work.

The Owner has an existing Windows 11 x64 computer with a Ryzen 9 7945HX,
16 GiB physical RAM, an NVIDIA GeForce RTX 4060 Laptop GPU with approximately
8 GiB dedicated VRAM, and sufficient D-drive capacity. The computer is not an
authority node and is not continuously available. It is suitable only as a
disposable, revocable Compute executor whose absence must not impair Core or
any non-AI product path.

## Decision

### Production provider and preserved authority

The target production control plane is:

```text
PRODUCTION_COMPUTE_CONTROL_PLANE=CORE_PULL_WORKER
LOCAL_PULL_PROVIDER=PRIMARY
GITHUB_HOSTED_PRODUCTION_COMPUTE=false
```

Core remains the sole authority defined by ADR-031, ADR-032, ADR-033, and
ADR-036. It continues to own authentication, Library/resource authorization,
durable queue state, source identity, capability issuance, callback validation,
candidate persistence, human-field authority, canonical CAS writes, and
idempotency. The local worker receives no SQLite access, Library browsing,
Owner/session credential, arbitrary object access, canonical write authority,
or inbound network authority.

The existing GitHub Actions adapter remains behind the provider-neutral
interface for CI, release qualification, and a separately authorized emergency
fallback. It is disabled for normal production document processing and is not
replaced with a GitHub self-hosted runner.

### Pull, claim, lease, and recovery protocol

The worker exposes no public endpoint and opens no inbound firewall or router
path. It initiates bounded outbound HTTPS long polls to Core. Core atomically
offers or claims one eligible attempt only after validating the dedicated
machine credential, provider eligibility, job generation, source fingerprint,
and existing durable state.

Each effective claim has a bounded renewable lease. The worker heartbeats while
the attempt remains active. A missing heartbeat after the lease boundary makes
the attempt recoverable through an explicit durable transition; it never leaves
one resource permanently stuck. Completion remains attempt-bound and
idempotent. The protocol must preserve:

- at-least-once delivery;
- at most one effective claim at any instant; and
- at most one effective result application for one immutable generation.

Sleep, shutdown, WSL termination, network loss, process death, and Windows
update are normal failure cases. Delayed callbacks from an expired or replaced
attempt fail closed. The local machine being offline leaves jobs queued or
recoverable while Auth, Library, upload/download, preview, Search, citation,
metadata, and every other Core path remain available.

The worker uses a dedicated, independently revocable machine credential with
only pull/claim/heartbeat/source-renewal scope. Result submission uses the
separate attempt-bound result capability. The machine credential is stored outside Git and browser
sessions, never printed or logged, and grants neither research-data browsing nor
human or Owner operations.

### Runtime and storage boundary

The preferred runtime is WSL2 with a supported Ubuntu environment, native Linux
Node, a Python virtual environment, the exact Paddle runtime/models, and exact
llama.cpp/Qwen runtime. Docker is not part of the initial design. Large runtime
state must live under `D:\AcademicCloudCompute`, separate from the development
checkout. The conceptual layout is:

```text
D:\AcademicCloudCompute\
  wsl\
  releases\
  models\
  cache\
  logs\
  staging\
  control\
```

The WSL distribution virtual disk, configured swap, immutable releases, models,
and non-sensitive caches must not silently consume material C-drive capacity.
The live worker never runs from `D:\Projects\AcademicCloud` or any dirty Git
checkout.

Every production worker release binds exact Compute source SHA, runtime
manifest, Node/Python/Paddle versions, Paddle model revisions and hashes,
llama.cpp identity and hash, Qwen model identity and hash, and selected CPU/CUDA
backends. Releases are staged, verified, qualified, atomically selected, and
restartable; rollback selects the previous qualified immutable release rather
than pulling into a live tree.

### Resource protection and model lifecycle

Initial whole-job concurrency is one. The worker supports only the minimum
operational modes:

- `NORMAL`: one job, restrained host priority, and no new claim on battery when
  that state is reliably observable;
- `PAUSED`: no new claims; Core safely retains queued work; and
- `BURST`: bounded qualification or corpus work inside a measured safe envelope,
  still at whole-job concurrency one.

Qualification sets an evidence-backed WSL memory, CPU, swap, RSS, VRAM,
utilization, and thermal envelope for the 16 GiB host. It compares exact-model
Qwen CPU versus CUDA and Paddle CPU versus GPU rather than assuming every stage
benefits from GPU execution. Heavy runtimes initialize on demand, may be reused
across consecutive jobs, and are released after a measured bounded idle TTL.
They do not permanently reserve GPU memory while no work exists without new
evidence.

### Source privacy and sparse access

The laptop is Compute, not a second AcademicCloud corpus. Long-lived state may
contain immutable code/runtime/model assets and privacy-safe operational
metrics. It must not intentionally retain production PDFs, rendered production
pages, raw OCR text, signed URLs, capabilities, or canonical metadata mirrors.
Controlled attempt-temporary files use restrictive permissions and are removed
after the attempt and on startup after an unclean exit. Logs contain only safe
identities, states, stage classes, timings, counts, and resource measurements.

Source access remains exact-attempt and bounded. Native text and embedded
metadata precede targeted rendering/OCR; additional pages are opened only when
evidence requires them. Range bytes and object bytes are measured. Permanent
local PDF caching is prohibited. HTTP connections may be reused, while source
capabilities remain short-lived and may be renewed only for the same valid
lease and source generation.

### Qualification and cutover gates

Heavy dependency/model/runtime qualification occurs once per exact local
release, not once per document. It covers runtime identity, tests/build where
applicable, real Paddle inference, real Qwen reasoning, representative
bibliographic fixtures, memory/VRAM envelope, and privacy output scanning.
Normal jobs perform only lightweight release-identity and health checks.

Production cannot switch until all local environment, GPU/runtime, pull,
atomic-claim, heartbeat, lease-expiry, callback, idempotency, forced-loss,
restart, privacy, and resource-envelope gates in the active task pass. Then the
same normal product path must pass a small native-text PDF, ordinary PDF,
scan-heavy PDF, large PDF, and the same previously failed resource. The
105-resource wave begins only after this cutover is green and never runs on
GitHub-hosted Compute.

### Qualified implementation checkpoint — 2026-08-24

The sole `AcademicCloudCompute` Ubuntu 24.04 distribution and its 80 GB virtual
disk are under `D:\AcademicCloudCompute\wsl\AcademicCloudCompute`; registered
C-drive distributions remain zero. WSL2, systemd, the 8-CPU/about-8-GB Normal
envelope, 4 GB D-drive swap, RTX 4060 visibility, CUDA 12.8.2, and an actual
`sm_89` kernel passed. WSL1 remains disabled and unnecessary.

Exact Linux Node 24.16.0, Paddle 3.3.1/PaddleOCR 3.7.0 with pinned PP-OCRv6
small models, llama.cpp `b10218` at full source revision
`de699957b92f490efebad149665b0dccf127eaff`, and Qwen3-1.7B Q8_0 passed real
inference. The accepted llama-server SHA-256 is
`ddfde527958667bf1b29603d8c0abe3a92e25decc5c7b5227b5736c4815c5c30`; its
build disables curl, NCCL, and Web UI downloads. Qwen CUDA reduced the two
generated qualification requests from 944/766 ms at about 23.75 predicted
tokens/s to 174/154 ms at 115–121 tokens/s, with 2,060 MiB peak process RSS and
4,387 MiB peak total GPU memory. The existing seven-case bibliographic gate
passed 7/7. Paddle GPU reduced warm generated-page requests from roughly
750–820 ms on CPU to 36–47 ms, with 1,850 MiB worst observed sanitized-run RSS;
both stages passed with the production child's sanitized environment. The
selected release configuration is Paddle GPU plus `999` llama GPU layers;
whole-job concurrency remains one and the stages release their child runtimes
sequentially.

Core migration 026 and the Local Pull implementation add only additive lease
state and the provider-neutral adapter. Focused tests prove machine-secret
authorization, atomic one-worker claim, renewable heartbeat, expiry-to-new-
attempt recovery, old-worker rejection, rejection of Local attempts on the
legacy claim endpoint, delayed-callback rejection immediately after expiry,
and idempotent matching duplicate terminal success/failure. Full backend acceptance passes
373/373. These are pre-release development facts: production remains exact
release `17fb945…` at schema v25 and provider cutover has not occurred.

### Pre-corpus code-review checkpoint — 2026-08-26

Owner review reopened five gates before immutable release assembly and corpus
execution. Exact checkpoint `d1bddb6d7bd6e66d0ed52586c17dd51afd358d99`
passed them without changing production:

- native PDF text usability is script-neutral and rejects corruption by
  Unicode quality signals rather than a Han/Latin allowlist; Cyrillic,
  Arabic/Persian, Japanese, Tibetan, Unicode Mongolian, and Poppe/Mongolistic
  transliteration tests pass, including a real Unicode Russian/Mongolistic PDF
  fixture that remains on the native-text path;
- the valid current Local Pull attempt may renew a 15-minute authorization for
  only its exact source, while wrong worker/attempt, expired or replaced lease,
  stale fingerprint, and changed account/context authority fail closed;
- pull, heartbeat, source range, source renewal, claim/callback exchange, and
  callback retry have per-request timeouts plus parent cancellation; heartbeat
  I/O is additionally capped by the remaining lease;
- Paddle and Qwen runtimes are lazy, reused at concurrency one while healthy,
  invalidated after component failure, closed on shutdown, and unloaded after
  the default five-minute idle TTL; PAUSED mode stays cold; and
- activation waits 15 seconds and verifies structured systemd state, restart
  count, exact release selection, non-root identity, and environment-file
  permissions before success, with rollback on failure.

The exact reviewed tree passes Backend 374/374, Frontend 283/283, Compute
contracts 2/2, Compute 81/81 with two expected Windows-only release-runtime
skips, all-workspace typecheck/build, migration 0→26 and boundary/restart tests,
compiled acceptance (`firstMigrationCount=26`, redeploy migration count zero),
shell syntax, `CURRENT_STATE.json` parsing, and `git diff --check`. The commit is
pushed and the remote branch was independently verified at the same SHA. These
are code-review facts only: a new immutable release, real cold/warm/idle-unload
benchmark, production cutover, multilingual canaries, forced-loss recovery,
and full-corpus acceptance remain pending.

## Migration and rollback

Implementation adds the smallest provider-neutral Core protocol and durable
lease state required by the accepted job model. Any schema change is additive,
backed up and migrated under the existing production gate. Bibliographic
business logic cannot branch on Local versus GitHub provider identity.

Cutover first disables new normal GitHub dispatch, verifies there is no unsafe
in-flight ambiguity, enables Local Pull claims, and runs bounded canaries. If
Local Compute is unavailable after cutover, the safe default is queued AI work,
not automatic GitHub spend. Rollback may restore the previous exact Core/local
release or use the retained GitHub adapter only under separate explicit
authority. No rollback changes source objects or human/canonical metadata.

## Relationship to earlier decisions

- ADR-031 remains authoritative for Core authority, fault isolation, source and
  callback capabilities, and derived-result boundaries. This ADR supersedes
  only its choice of GitHub Actions as the normal production adapter and its
  clean-runner-per-document execution assumption.
- ADR-033 remains authoritative for exact PP-OCRv6-small → Qwen3-1.7B model
  semantics, deterministic validation, evidence, and privacy. This ADR
  supersedes only GitHub-hosted ephemeral runtime placement and permits a
  qualified warm local runtime with bounded idle release.
- ADR-036 remains authoritative for admission, current-generation projection,
  foreground/background priority, exactly-once effective claim, and the real
  provider-backed Golden gate. Its GitHub dispatch-receipt reconciliation is
  retained only for the disabled fallback adapter; Local Pull uses the lease
  protocol in this ADR.
- ADR-023 requires this decision, implementation checkpoints, authorized push,
  and accessible local/remote equality to become durable before WSL or reboot.

## Consequences

- Normal production AI consumes no GitHub-hosted runner minutes and adds no
  cloud or subscription cost.
- Queue latency and per-document build/download/qualification overhead can be
  removed, while measured local resource use becomes an explicit acceptance
  concern.
- Laptop absence delays AI but cannot reduce Core availability or corrupt one
  job's durable state.
- The new lease and credential surfaces require focused authorization,
  non-disclosure, expiry, duplicate-callback, sleep/loss, and restart tests.
- WSL/GPU installation and any unavoidable reboot occur only after the current
  work is committed, pushed, remotely verified, durably recoverable, and the 12
  Owner sources are preserved on D with verified SHA-256 identities.
- Whole-document OCR/indexing, RAG, new product scope, paid services, public
  inbound laptop access, persistent private-PDF caching, and artifact
  `9405764771` remain unauthorized.
