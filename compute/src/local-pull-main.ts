import { loadLocalPullWorkerConfig, runLocalPullWorker } from "./local-pull.js";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

await runLocalPullWorker(loadLocalPullWorkerConfig(), {
  signal: controller.signal,
  onEvent: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
});
