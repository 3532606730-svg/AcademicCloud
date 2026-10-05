# ADR-049 — Paired local devices and private current-page OCR

Date: 2026-10-01. Status: Accepted implementation decision within ADR-048's bounded Owner continuation; production activation follows the coordinated release gate.

## Context

The Owner explicitly requested checking the installed local engine, connecting it to their account, continuing the approved features and pushing. Existing pinned Paddle GPU passes the frozen eight-page sample; the account/Reader transport is still absent. Members must use their own engines. The existing Owner Catalog worker is not a member OCR dispatcher. The first vertical slice implements local current-page OCR and saved private corrections. The internal online PP adapter remains selected but online credentials, billing and activation are separate unfinished work.

## Decision

Core remains the authorization/control plane. A browser renders exactly the currently painted physical PDF page into a static PNG within2000×2800/5.6Mpx and2MiB. An explicitly paired outbound-only connector pulls only its account's request and runs its selected installed engine. No browser localhost proxy, arbitrary engine URL, Core native decoder, cloud dispatch, Owner token or implicit fallback is introduced.

Pairing uses a cryptographically random one-time10-minute code created by the signed-in account. Each account has at most one pending code; creating another invalidates the previous code. The connector reads it from standard input, runs a built-in synthetic engine test without document content, and exchanges it for a30-day device bearer. SQLite stores only code/token digests plus account auth revision and expiry. Codes are single-use, constant-time comparisons apply where appropriate, endpoints are rate/body limited and tokens never enter URLs or logs. The first CLI keeps its token in session memory and prints no token; restart explicitly re-pairs. At most three active devices belong to an account. Revocation cancels outstanding requests and makes every device endpoint fail closed. Account disable/auth revision changes also revoke effective access. Engine identity/test claims are advisory and cannot confer canonical authority.

Rendered page bytes live only in a bounded process-local coordinator: at most eight active requests globally and one per account,2MiB retained bytes each, five-minute overall expiry. JSON/base64 transport overhead is bounded separately. Only an online device with a recent authenticated poll can receive a new request. A claim has one opaque attempt and90-second lease; heartbeats recheck cancellation/authority but never extend the deadline. There is no automatic page retry. Request idempotency binds account/clientRequestId to the exact resource/source/page/device/frame digest; different input under that key conflicts. Terminal requests have a bounded short metadata cache, with image bytes discarded immediately. Server restart invalidates pending requests and the UI offers explicit retry; it cannot report them completed. This is a bounded interactive coordinator, not a second corpus queue.

Every create, claim, heartbeat, completion, status and result read/write rechecks active account, current resource/Library authority and immutable source generation. Owner has no special access to another account's result. A client image digest proves transport equality, not PDF provenance; results explicitly retain `client_rendered_unverified`. Device output is validated against the claim's request/capability snapshot, including text/geometry bounds. Result completion and account/source checks are atomic. Invalid/foreign/late/revoked output never becomes a saved result. Page/source/document changes abort the UI request and cancel outstanding work; late UI responses cannot replace the new selection.

Additive migration040 stores account-owned device/pairing digests and private successful OCR results. Original machine text/provenance/rectangles are immutable. A separate correctedText field uses revision CAS; retries append a new machine result and never overwrite a correction. No result is automatically a note, shared text, human-verified statement or canonical bibliography. Results retain source/page/image-frame lineage; original PNGs/PDF bytes are never persisted here. The initial quota is500 retained results per account, with no silent eviction or destructive cleanup. Quota errors stop new processing. No delete lifecycle is added in this slice; future recovery/retention changes require a separate explicit decision. Result reads require current source authority; stale/revoked sources cannot expose derived text.

The connection dialog explains local versus online choices, shows actual devices/test/online state and revocation, provides simple installation/pairing/troubleshooting steps, and says whose device/data is used. No fake engine-download action is shown. The available CLI/package is a real connector; engine/model installation links lead to official documentation and are described separately. An online-information tab may explain the selected provider but cannot collect credentials or claim an enabled connection until that path is implemented. Mobile layout, keyboard/focus, source changes, failed tests, expiry/offline/busy and correction conflicts are acceptance paths.

## Local resource coordination

The installed Owner environment is shared by Local Pull and CatalogBridge; both can launch native OCR and the worker can also load the reasoner. A standalone connector lock, CPU selection or idle-memory probe is not sufficient mutual exclusion. Implement a common cooperative native-resource lease covering all participating execution/lifecycle paths, held until native engines are closed. The member connector fails closed if the shared-host cooperation contract is absent or cannot be verified. Preserve existing Catalog model/parser/validator/authority semantics and unrelated configurations. Catalog dispatch must not claim new work while that resource is owned elsewhere; Bridge uses a stable busy response. Do not release a lease while warm children still consume the resource. The connector uses a total cold-start-inclusive deadline and closes a fresh adapter per page in finally; this also avoids stale sidecar frames and idle GPU residency.

The member engine uses only its pinned installed model files and a Linux seccomp wrapper that denies native-process network sends/connections before engine imports; an unavailable guard fails closed. The connector's Node process retains outbound Core transport. Exact package and model checks precede inference. This guard applies to the member adapter and does not silently change Catalog's existing runtime.

Guarded Catalog pulls are immediate; an empty/busy poll waits two seconds after releasing the native lease. Connector idle polls likewise release before waiting. This avoids idle long-poll ownership and lets the other participants acquire the shared resource. Unguarded historical CI/fallback behavior retains its existing long-poll/warm lifecycle.

The shared lock and live registrations reside in `/srv/academiccloud-compute/coordination`, a private directory owned by the existing `academiccloud` Linux service user. Both candidate service units add only that directory to their existing writable paths and load the same guard JSON. The Owner connector runs as this existing Linux user; other members use their own installations. No group/credential expansion is required. Provision the directory mode0700 and guard JSON mode0600 before coordinated activation; deployment must not replace an active lock inode.

The helper ignores group SIGINT/SIGTERM while it holds the lock. Only an explicit release acknowledgement after native cleanup clears its bounded `owned` marker. Lost helper/parent or bare EOF leaves that marker and all subsequent native acquisitions fail closed even after the OS lock is freed. Recovery requires all three participants stopped, native children verified closed and an exclusive maintenance lock on the same inode before clearing the marker. Do not delete the lock file or automatically clear stale ownership. This deliberately trades native availability for preventing overlap; Core and queued work remain recoverable. Forced-loss/recovery qualification remains a separate coordinated production gate.

The current production7e runtime does not implement this cooperation. No persistent Owner connector activation is permitted until the exact cooperating Compute/Bridge candidate is qualified and installed in the single coordinated release. An isolated idle-window engine qualification is not that gate. Other members' isolated installations need no Owner runtime and must never connect to its privileged bootstrap credential.

## HTTP boundary

Shared transport DTOs live in `compute-contracts/src/local-ocr.ts`; they are not source-authority claims. Root `/api/reader/local-ocr`:

| Route | Authority and shape |
|---|---|
| GET `/devices` | Session; `{devices}` for this account |
| POST `/pairing` | Session; `{label}` → `{pairingCode,expiresAt}` |
| POST `/connect` | One-time pairing; `{pairingCode,capabilities,probeResult}` → `{deviceToken,tokenExpiresAt,device}` |
| POST `/devices/:id/revoke` | Session, owning account; `{}` → `{device}` |
| POST `/requests` | Session; LocalOcrRequestInput → `{job}` |
| GET `/requests/:id` | Session, source-bound owning account; `{job}` |
| POST `/requests/:id/cancel` | Session, owning account; `{}` → `{job}` |
| GET `/results?resourceId&sourceId&physicalPage` | Session, current source; newest maximum20 `{items}` |
| GET `/results/:id` | Session, current source/owning account; `{result}` |
| PATCH `/results/:id` | Session; `{revision,correctedText}` → `{result}` |
| GET `/device/claim` | Device bearer; `{job:LocalOcrDeviceJob|null}` |
| POST `/device/heartbeat` | Device bearer; `{jobId,attemptId}` → `{active:true}` or stable denial |
| POST `/device/complete` | Device bearer; LocalOcrCompletion → `{accepted:true,resultId:string|null}` |

Responses and errors omit raw input, token, paths, source URLs, engine traces and provider payloads. Protected account/source absence is non-disclosing. Existing deferred reader-ocr.v1 single/range endpoint remains unchanged; this local single-page namespace has its own actual enabled path and no range/whole-book execution.

## Verification and rollback

Use meaningful cross-account, Owner-without-exception, account revision, recycle/source replacement, idempotency, limits, cancellation/expiry, forged/late completion and correction-CAS tests; real HTTP/Auth/SQLite tests; frontend render/source races, mobile/focus and reload persistence; connector cold-start/abort/output and real cooperative-process lock tests. Retain the frozen oversized comparison scores; qualify the actual bounded Reader/adapter frame separately without replacing that baseline. No cloud request or whole-book run is required.

Schema040 is append-only and retains all pre-existing source/private/catalog data. Startup verifies exact migration history. Compatible application rollback must use the complete040 migration directory, disable these routes/device dispatch and preserve private rows; no database downgrade or table drop. Compute rollback stops the member connector before removing cooperation and restores the exact previous runtime. No main merge or independent deployment follows from a repository checkpoint.
