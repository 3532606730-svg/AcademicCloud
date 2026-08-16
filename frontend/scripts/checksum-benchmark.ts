// L1-PERF01 evidence harness — local synthetic checksum benchmark.
// Measures the client-side MD5 stage wall time and throughput at the five
// required sizes (1/10/50/100/250 MiB) across several chunk sizes, using
// generated in-memory data (nothing large is committed to the repository).
//
// This is a measurement tool, NOT a unit test: it prints results and never
// asserts timing thresholds. Run with: npx tsx frontend/scripts/checksum-benchmark.ts
import { performance } from "node:perf_hooks";

import { calculateFileMd5 } from "../src/md5.ts";

const SIZES_MIB = [1, 10, 50, 100, 250];
const CHUNK_SIZES = [4 * 1024 * 1024, 8 * 1024 * 1024, 16 * 1024 * 1024];

// A single 1 MiB pattern reused as N Blob parts. MD5 speed is not data
// dependent, and this keeps the harness memory-bounded to roughly one file.
function makeBlob(mib: number): Blob {
  const part = new Uint8Array(1024 * 1024);
  for (let i = 0; i < part.length; i += 4096) part[i] = i % 251;
  const parts: BlobPart[] = [];
  for (let i = 0; i < mib; i += 1) parts.push(part);
  return new Blob(parts);
}

console.log("checksum-benchmark: synthetic, local, generated data");
console.log("node", process.version);
console.log("");

for (const mib of SIZES_MIB) {
  const blob = makeBlob(mib);
  for (const chunkSize of CHUNK_SIZES) {
    const started = performance.now();
    const digest = await calculateFileMd5(blob, { chunkSize });
    const ended = performance.now();
    const seconds = (ended - started) / 1000;
    const mibPerSec = mib / seconds;
    console.log(
      `size=${String(mib).padStart(3)}MiB chunk=${String(chunkSize >> 20).padStart(2)}MiB ` +
      `time=${seconds.toFixed(2)}s throughput=${mibPerSec.toFixed(1)}MiB/s digest=${digest.slice(0, 12)}…`,
    );
  }
  console.log("");
}
