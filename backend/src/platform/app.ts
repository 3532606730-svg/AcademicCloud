import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
  LogController,
} from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { registerAuthHttp } from "../auth/http.js";
import type { DriveService } from "../drive/drive-service.js";
import { registerDriveHttp } from "../drive/http.js";
import type { AppConfig } from "./config.js";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "body.password",
  "password",
  "*.password",
  "sessionSecret",
  "*.sessionSecret",
  "accessKeyId",
  "*.accessKeyId",
  "accessKeySecret",
  "*.accessKeySecret",
  "stsToken",
  "*.stsToken",
  "signedUrl",
  "*.signedUrl",
  "download.url",
  "upload.url",
  "upload.fields",
  "fields.policy",
  "fields.Signature",
  "fields.signature",
  "fields.OSSAccessKeyId",
  "fields.x-oss-signature",
  "fields.x-oss-credential",
  "fields.x-oss-security-token",
] as const;

function isApiRequest(url: string): boolean {
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?");
}

function secureLogger(logger: FastifyServerOptions["logger"]): NonNullable<FastifyServerOptions["logger"]> {
  if (logger === false) {
    return false;
  }

  const base = logger === undefined || logger === true ? {} : logger;
  return {
    ...base,
    redact: { paths: [...LOGGER_REDACT_PATHS], censor: "[REDACTED]" },
  };
}

function routeTemplate(request: FastifyRequest): string {
  const route = request.routeOptions.url;
  return route ? route.split("?", 1)[0]! : "unmatched";
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)) {
    return "Error";
  }

  return error.name;
}

export interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  auth?: {
    service: AuthService;
    appOrigin: string;
    environment: AppConfig["environment"];
    loginRateLimitMax?: number;
  };
  drive?: { service: DriveService };
  readinessCheck?: () => boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: secureLogger(options.logger),
    ajv: { customOptions: { removeAdditional: false } },
    bodyLimit: 16 * 1024,
    connectionTimeout: 10_000,
    logController: new LogController({ disableRequestLogging: true }),
    requestTimeout: 30_000,
    trustProxy: "127.0.0.1",
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!isApiRequest(request.url)) return;
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        event: "http.request_completed",
        method: request.method,
        route: routeTemplate(request),
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request completed",
    );
  });

  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({ error: "not_found" }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation || error.statusCode === 400) {
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

    request.log.error(
      {
        event: "http.unhandled_error",
        route: routeTemplate(request),
        errorType: safeErrorType(error),
      },
      "unhandled request error",
    );
    void reply.code(500).send({ error: "internal_error" });
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "academiccloud-api",
  }));

  app.get("/api/ready", async (_request, reply) => {
    try {
      if (options.readinessCheck?.() ?? true) {
        return { status: "ready", service: "academiccloud-api" };
      }
    } catch {
      // The response remains stable and deliberately omits database details.
    }

    return reply.code(503).send({ status: "unavailable", service: "academiccloud-api" });
  });

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
