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
}

interface LoginBody {
  loginName: string;
  password: string;
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

export async function registerAuthHttp(app: FastifyInstance, options: AuthHttpOptions): Promise<void> {
  const cookiePolicy = getSessionCookiePolicy(options.environment);

  app.addHook("onRequest", async (request, reply) => {
    if (!isApiRequest(request.url) || !UNSAFE_METHODS.has(request.method)) {
      return;
    }

    if (
      request.headers.origin !== options.appOrigin ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
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
        return { account: result.account };
      } catch (error: unknown) {
        if (error instanceof InvalidCredentialsError) {
          return reply.code(401).send({ error: "invalid_credentials" });
        }

        if (error instanceof PasswordKdfOverloadedError) {
          return reply.header("retry-after", "1").code(429).send({ error: "authentication_busy" });
        }

        throw error;
      }
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const secret = request.cookies[cookiePolicy.name];

    if (secret) {
      options.authService.logout(secret);
    }

    reply.clearCookie(cookiePolicy.name, cookiePolicy.options);
    return reply.code(204).send();
  });

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
