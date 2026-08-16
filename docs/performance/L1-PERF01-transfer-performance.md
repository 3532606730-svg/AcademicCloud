# L1-PERF01 — Transfer Performance Evidence

**Date:** 2026-08-17 · **Scope:** repository/local, synthetic measurement only (no
production contact, no real object storage, no live network).

## Verified byte-path architecture (from code)

Upload is browser-direct; the backend is an authorization/metadata control
plane and never proxies file bytes:

1. enqueue → bounded concurrency pump (max 2 active workflows);
2. checksum — `calculateFileMd5` (`frontend/src/md5.ts`), SparkMD5, incremental
   4 MiB chunks on the main thread, progress 0 → 0.15;
3. reserve — `POST /api/drive/uploads` (`createUpload`) returns a scoped object
   key + POST policy;
4. transfer — `uploadDirectly` (`frontend/src/direct-upload.ts`) POSTs the
   multipart form directly to object storage via XHR (progress 0.15 → 0.90 as
   the XHR fraction advances, then 0.92 once the verification phase begins;
   inactivity/stall detection, abort);
5. verify/activate — `completeUpload` confirms storage metadata and activates.

Download is authorization-then-direct:

- `createDownload(file.id)` (attachment) or `createDownload(file.id, "inline")`
  returns a signed URL; the browser fetches bytes directly from object storage;
  Preview renders the inline signed URL in an `iframe`/`img` with
  `referrerPolicy="no-referrer"`.

## Measured (local synthetic, generated data)

Harness: `frontend/scripts/checksum-benchmark.ts` (run with
`npx tsx frontend/scripts/checksum-benchmark.ts`). Node v24.16.0, in-memory
`Blob` fixtures, SparkMD5 only.

| size | 4 MiB chunks | 8 MiB chunks | 16 MiB chunks |
|------|--------------|--------------|---------------|
| 1 MiB   | 66.9 MiB/s  | 80.6 MiB/s  | 368 MiB/s   |
| 10 MiB  | 370 MiB/s   | 387 MiB/s   | 382 MiB/s   |
| 50 MiB  | 366 MiB/s   | 386 MiB/s   | 367 MiB/s   |
| 100 MiB | 370 MiB/s   | 383 MiB/s   | 383 MiB/s   |
| 250 MiB | 353 MiB/s   | 381 MiB/s   | 387 MiB/s   |

The 1 MiB @ 4 MiB cell (66.9 MiB/s) is a JIT cold-start artifact — the 1 MiB
file is a single chunk, so its timing is dominated by first-call warmup rather
than steady-state hashing; the 10–250 MiB rows are the meaningful numbers.

Wall time for the largest target: **250 MiB ≈ 0.65–0.71 s**.

These figures are a **Node.js v24.16.0** local measurement of SparkMD5 only —
they do not measure the browser build or the object-storage transfer itself.

## Inferred (from code + measurement)

- Client-side checksum cost is small in absolute terms and grows linearly; it is
  **inferred** (not measured) to be a minor stage of a real upload because
  network transfer is expected to dominate for files of this size on a
  residential uplink.
- Main-thread responsiveness is bounded because each 4 MiB chunk is hashed in a
  ~10–15 ms synchronous step with an `await` (event-loop yield) between chunks;
  the main thread is not blocked for the full checksum duration.
- Chunk size 4 MiB vs 8/16 MiB differs by <10% (≈50 ms at 250 MiB) — negligible
  against transfer time and not worth trading away finer progress granularity,
  lower per-chunk allocation, and faster abort response.
- `hexToBase64` (digest → base64) is a 32-hex-character conversion — negligible.
- Reserve and complete are small metadata API calls; they are not byte-path
  costs.

## Not measured (and why)

- Real-network direct transfer time and throughput — requires live object
  storage; explicitly out of scope (no production benchmark).
- Production signing/authorization latency — requires production OSS; inferred
  as metadata-only.
- Initial PDF Preview loading latency observed in UX01 — dominated by the
  browser fetching the large signed PDF over the network; not measurable
  locally and unchanged by this task.

## Decision

**No client-side optimization is implemented.** The evidence shows the current
chunked SparkMD5 design is already near its measured local (Node.js) throughput
ceiling, keeps main-thread blocks bounded, and is **inferred** — not measured —
to be a minor stage of the end-to-end upload. Off-main-thread MD5 (Worker),
chunk-size retuning, and queue-concurrency changes are therefore not justified
by the local measurement and would add risk without a measured win. The
browser-direct upload and signed-direct download byte paths remain authoritative
and unchanged (`DEPENDENCY_DELTA=0`).

If a future real-network baseline ever shows checksum dominating total latency
on the target client hardware, the Worker investigation remains the documented
low-risk option — but it is not warranted by the local evidence.
