import { performance } from "node:perf_hooks";

import {
  ARGON2ID_PARAMETERS,
  Argon2idPasswordHasher,
  PASSWORD_KDF_CONCURRENCY,
  PASSWORD_KDF_MAX_QUEUED,
} from "../src/auth/password-hasher.js";

const MEBIBYTE = 1024 * 1024;
const password = "local-benchmark-password";
const hasher = new Argon2idPasswordHasher();
let peakRss = process.memoryUsage().rss;
const baselineRss = peakRss;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 5);

try {
  const hashStartedAt = performance.now();
  const encodedHash = await hasher.hash(password);
  const hashMilliseconds = performance.now() - hashStartedAt;

  const verifyStartedAt = performance.now();
  const verified = await hasher.verify(encodedHash, password);
  const verifyMilliseconds = performance.now() - verifyStartedAt;

  peakRss = Math.max(peakRss, process.memoryUsage().rss);

  if (!verified) {
    throw new Error("Argon2id benchmark verification failed");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        node: process.version,
        algorithm: "argon2id",
        parameters: ARGON2ID_PARAMETERS,
        concurrency: PASSWORD_KDF_CONCURRENCY,
        maxQueued: PASSWORD_KDF_MAX_QUEUED,
        hashMilliseconds: Math.round(hashMilliseconds),
        verifyMilliseconds: Math.round(verifyMilliseconds),
        baselineRssMiB: Number((baselineRss / MEBIBYTE).toFixed(1)),
        peakRssMiB: Number((peakRss / MEBIBYTE).toFixed(1)),
        sampledRssIncreaseMiB: Number(((peakRss - baselineRss) / MEBIBYTE).toFixed(1)),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  clearInterval(sampler);
}
