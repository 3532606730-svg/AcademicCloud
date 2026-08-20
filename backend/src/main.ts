import { loadSqliteConfig } from "./persistence/sqlite/config.js";
import { createApplication } from "./platform/application.js";
import { loadConfig } from "./platform/config.js";
import { loadStorageAdapter } from "./storage/config.js";
import { loadDerivedComputeRuntime } from "./compute/github-actions-dispatcher.js";

const config = loadConfig();
const app = await createApplication(
  config,
  loadSqliteConfig(),
  loadStorageAdapter(process.env, config.environment),
  loadDerivedComputeRuntime(process.env, config.appOrigin),
);

function stableErrorType(error: unknown): string {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)) {
    return "Error";
  }

  return error.name;
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      app.log.error({ event: "process.shutdown_failed", errorType: stableErrorType(error) }, "graceful shutdown failed");
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error: unknown) {
  app.log.error({ event: "process.start_failed", errorType: stableErrorType(error) }, "failed to start API server");
  await app.close();
  process.exitCode = 1;
}
