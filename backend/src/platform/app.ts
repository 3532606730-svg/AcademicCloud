import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { registerAuthHttp } from "../auth/http.js";
import type { AppConfig } from "./config.js";

export interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  auth?: {
    service: AuthService;
    appOrigin: string;
    environment: AppConfig["environment"];
    loginRateLimitMax?: number;
  };
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "academiccloud-api",
  }));

  if (options.auth) {
    await registerAuthHttp(app, {
      authService: options.auth.service,
      appOrigin: options.auth.appOrigin,
      environment: options.auth.environment,
      ...(options.auth.loginRateLimitMax === undefined
        ? {}
        : { loginRateLimitMax: options.auth.loginRateLimitMax }),
    });
  }

  return app;
}
