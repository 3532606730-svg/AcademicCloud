import fastifyCookie, { type FastifyCookieOptions } from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppEnvironment } from "../platform/config.js";
import {
  type AuthenticatedAccount,
  AuthService,
  InvalidCredentialsError,
  SESSION_DURATION_MILLISECONDS,
} from "./auth-service.js";
import { PasswordKdfOverloadedError } from "./password-hasher.js";
import { CredentialResetError, type CredentialResetService } from "./credential-reset-service.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MILLISECONDS / 1_000;

declare module "fastify" {
  interface FastifyRequest {
    authAccount: AuthenticatedAccount | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthHttpOptions {
  authService: AuthService;
  appOrigin: string;
  environment: AppEnvironment;
  loginRateLimitMax?: number;
  credentialResetService?: CredentialResetService;
  credentialResetRateLimitMax?: number;
}

interface LoginBody {
  loginName: string;
  password: string;
}

interface CredentialResetBody {
  token: string;
  newPassword: string;
}

interface SessionCookiePolicy {
  name: string;
  options: FastifyCookieOptions["parseOptions"] & {
    httpOnly: true;
    sameSite: "strict";
    secure: boolean;
    path: string;
  };
}

type AuthAuditEvent =
  | "auth.origin_check"
  | "auth.session_check"
  | "auth.login"
  | "auth.logout"
  | "auth.credential_reset";

type AuthAuditOutcome = "succeeded" | "denied" | "busy" | "noop";

function writeAuthAudit(
  request: FastifyRequest,
  event: AuthAuditEvent,
  outcome: AuthAuditOutcome,
  details: { accountId?: string; reason?: string } = {},
): void {
  const audit = {
    event,
    outcome,
    ...(details.accountId === undefined ? {} : { accountId: details.accountId }),
    ...(details.reason === undefined ? {} : { reason: details.reason }),
  };

  if (outcome === "succeeded" || outcome === "noop") {
    request.log.info({ audit }, "authentication audit event");
  } else {
    request.log.warn({ audit }, "authentication audit event");
  }
}

export function getSessionCookiePolicy(environment: AppEnvironment): SessionCookiePolicy {
  const production = environment === "production";

  return {
    name: production ? "__Host-ac_session" : "ac_session",
    options: {
      httpOnly: true,
      sameSite: "strict",
      secure: production,
      path: production ? "/" : "/api",
    },
  };
}

function isApiRequest(url: string): boolean {
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?");
}

function isComputeInternalRequest(url: string): boolean {
  const path = url.split("?", 1)[0] ?? url;
  return path === "/api/internal/compute/pull"
    || /^\/api\/internal\/compute\/jobs\/[A-Za-z0-9_-]{1,128}\/(?:claim|heartbeat|source|result)$/u.test(path);
}

export async function registerAuthHttp(app: FastifyInstance, options: AuthHttpOptions): Promise<void> {
  const cookiePolicy = getSessionCookiePolicy(options.environment);

  app.addHook("onRequest", async (request, reply) => {
    if (!isApiRequest(request.url) || !UNSAFE_METHODS.has(request.method) || isComputeInternalRequest(request.url)) {
      return;
    }

    if (
      request.headers.origin !== options.appOrigin ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      writeAuthAudit(request, "auth.origin_check", "denied", { reason: "invalid_origin" });
      await reply.code(403).send({ error: "invalid_origin" });
    }
  });

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, {
    global: false,
    hook: "onRequest",
  });

  app.decorateRequest("authAccount", null);
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.cookies[cookiePolicy.name];
    const account = secret ? options.authService.resolveSession(secret) : null;

    if (!account) {
      writeAuthAudit(request, "auth.session_check", "denied", {
        reason: "authentication_required",
      });
      await reply.code(401).send({ error: "authentication_required" });
      return;
    }

    request.authAccount = account;
  });

  app.post<{ Body: LoginBody }>(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: options.loginRateLimitMax ?? 5,
          timeWindow: "1 minute",
          onExceeded: (request: FastifyRequest) => {
            options.authService.recordLoginBusy("rate_limit_exceeded");
            writeAuthAudit(request, "auth.login", "denied", { reason: "rate_limit_exceeded" });
          },
        },
      },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["loginName", "password"],
          properties: {
            loginName: { type: "string", minLength: 1, maxLength: 254, pattern: "^\\S(?:.*\\S)?$" },
            password: { type: "string", minLength: 1, maxLength: 1_024 },
          },
        },
      },
      preValidation: async (request, reply) => {
        const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();

        if (contentType !== "application/json") {
          await reply.code(415).send({ error: "unsupported_media_type" });
        }
      },
    },
    async (request, reply) => {
      try {
        const result = await options.authService.login(request.body.loginName, request.body.password);
        const previousSecret = request.cookies[cookiePolicy.name];

        if (previousSecret) {
          options.authService.logout(previousSecret);
        }

        reply.setCookie(cookiePolicy.name, result.sessionSecret, {
          ...cookiePolicy.options,
          maxAge: SESSION_MAX_AGE_SECONDS,
          expires: result.expiresAt,
        });
        writeAuthAudit(request, "auth.login", "succeeded", { accountId: result.account.id });
        return { account: result.account };
      } catch (error: unknown) {
        if (error instanceof InvalidCredentialsError) {
          writeAuthAudit(request, "auth.login", "denied", { reason: "invalid_credentials" });
          return reply.code(401).send({ error: "invalid_credentials" });
        }

        if (error instanceof PasswordKdfOverloadedError) {
          options.authService.recordLoginBusy("kdf_overloaded");
          writeAuthAudit(request, "auth.login", "busy", { reason: "kdf_overloaded" });
          return reply.header("retry-after", "1").code(429).send({ error: "authentication_busy" });
        }

        throw error;
      }
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const secret = request.cookies[cookiePolicy.name];
    const account = secret ? options.authService.resolveSession(secret) : null;

    if (secret) {
      options.authService.logout(secret);
    }

    writeAuthAudit(
      request,
      "auth.logout",
      account ? "succeeded" : "noop",
      account ? { accountId: account.id } : {},
    );
    reply.clearCookie(cookiePolicy.name, cookiePolicy.options);
    return reply.code(204).send();
  });

  if (options.credentialResetService) {
    app.post<{ Body: CredentialResetBody }>(
      "/api/auth/credential-reset",
      {
        config: {
          rateLimit: {
            max: options.credentialResetRateLimitMax ?? 5,
            timeWindow: "1 minute",
            onExceeded: (request: FastifyRequest) => {
              options.credentialResetService!.recordRedemptionBusy("rate_limit_exceeded");
              writeAuthAudit(request, "auth.credential_reset", "denied", { reason: "rate_limit_exceeded" });
            },
          },
        },
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["token", "newPassword"],
            properties: {
              token: { type: "string", minLength: 1, maxLength: 1_024 },
              newPassword: { type: "string", minLength: 12, maxLength: 1_024 },
            },
          },
        },
        preValidation: async (request, reply) => {
          const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
          if (contentType !== "application/json") {
            await reply.code(415).send({ error: "unsupported_media_type" });
          }
        },
      },
      async (request, reply) => {
        try {
          await options.credentialResetService!.redeem(request.body.token, request.body.newPassword);
          writeAuthAudit(request, "auth.credential_reset", "succeeded");
          return reply.code(204).send();
        } catch (error: unknown) {
          if (error instanceof CredentialResetError) {
            writeAuthAudit(request, "auth.credential_reset", "denied", { reason: "invalid_credential_reset" });
            return reply.code(400).send({ error: "invalid_credential_reset" });
          }
          if (error instanceof PasswordKdfOverloadedError) {
            options.credentialResetService!.recordRedemptionBusy("kdf_overloaded");
            writeAuthAudit(request, "auth.credential_reset", "busy", { reason: "kdf_overloaded" });
            return reply.header("retry-after", "1").code(429).send({ error: "credential_reset_busy" });
          }
          throw error;
        }
      },
    );
  }

  app.get(
    "/api/auth/session",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!request.authAccount) {
        return reply.code(401).send({ error: "authentication_required" });
      }

      return { account: request.authAccount };
    },
  );
}
