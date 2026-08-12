import { loadSqliteConfig } from "./persistence/sqlite/config.js";
import { createApplication } from "./platform/application.js";
import { loadConfig } from "./platform/config.js";
import { loadStorageAdapter } from "./storage/config.js";

const config = loadConfig();
const app = await createApplication(config, loadSqliteConfig(), loadStorageAdapter(process.env, config.environment));

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      app.log.error(error, "graceful shutdown failed");
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error: unknown) {
  app.log.error(error, "failed to start API server");
  await app.close();
  process.exitCode = 1;
}
