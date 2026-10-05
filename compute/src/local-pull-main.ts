import { loadLocalPullWorkerConfig, runLocalPullWorker } from "./local-pull.js";
import { registerNativeCooperation } from "./native-resource.js";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

const unregister = await registerNativeCooperation("localPull");
try { await runLocalPullWorker(loadLocalPullWorkerConfig(), {
  signal: controller.signal,
  onEvent: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
}); } finally { await unregister(); }
