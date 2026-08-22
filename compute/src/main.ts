import { runComputeWorker } from "./worker.js";

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

const bootstrapSecret = process.env.ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET;
if (!bootstrapSecret) throw new Error("ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET is required");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 420_000);
try {
  const outcome = await runComputeWorker({
    coreBaseUrl: argument("core-base-url"),
    jobId: argument("job-id"),
    attemptId: argument("attempt-id"),
    bootstrapSecret,
  }, { signal: controller.signal });
  process.stdout.write(`${JSON.stringify({
    event: "compute.job_completed",
    jobId: outcome.result.jobId,
    attemptId: outcome.result.attemptId,
    state: outcome.result.state,
    memory: outcome.memory,
  })}\n`);
  if (outcome.result.state === "failed") process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
