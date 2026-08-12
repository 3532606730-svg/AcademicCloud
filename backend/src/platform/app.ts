import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

export interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "academiccloud-api",
  }));

  return app;
}
