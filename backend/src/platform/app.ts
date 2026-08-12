import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { registerAuthHttp } from "../auth/http.js";
import type { DriveService } from "../drive/drive-service.js";
import { registerDriveHttp } from "../drive/http.js";
import type { AppConfig } from "./config.js";

export interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  auth?: {
    service: AuthService;
    appOrigin: string;
    environment: AppConfig["environment"];
    loginRateLimitMax?: number;
  };
  drive?: { service: DriveService };
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      void reply.code(400).send({ error: "invalid_request" });
      return;
    }

    if (error.statusCode === 413) {
      void reply.code(413).send({ error: "payload_too_large" });
      return;
    }

    if (error.statusCode === 415) {
      void reply.code(415).send({ error: "unsupported_media_type" });
      return;
    }

    if (error.statusCode === 429) {
      void reply.code(429).send({ error: "rate_limit_exceeded" });
      return;
    }

    request.log.error({ err: error }, "unhandled request error");
    void reply.code(500).send({ error: "internal_error" });
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

  if (options.drive) {
    if (!options.auth) {
      throw new Error("drive routes require authentication composition");
    }

    await registerDriveHttp(app, options.drive.service);
  }

  return app;
}
