import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { SuggestionError, type SuggestionAcceptanceInput, type SuggestionService } from "./suggestion-service.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;
const metadataVersionSchema = { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 } as const;

interface HoldingParams { libraryId: string; fileId: string; }
interface RunParams extends HoldingParams { runId: string; }
interface AcceptBody extends SuggestionAcceptanceInput { metadata?: Record<string, unknown>; }

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new SuggestionError("not_found");
  return account;
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(error.name)) return "Error";
  return error.name;
}

/**
 * Keep real call frames for server-side diagnosis without retaining the error
 * message, cause, request parameters, or dependency-provided free-form text.
 */
function safeErrorStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || typeof error.stack !== "string") return undefined;
  const safeFrame = /^at\s+(?:(?:async\s+)?[A-Za-z0-9_.$<>\[\] /\\-]+\s+\()?((?:file:\/\/\/|\/|[A-Za-z]:[\\/])[A-Za-z0-9_@.\/\\: -]+\.(?:[cm]?[jt]sx?):[0-9]+:[0-9]+|node:[A-Za-z0-9_.\/-]+:[0-9]+:[0-9]+)\)?$/u;
  const frames = error.stack
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => safeFrame.test(line))
    .map((line) => line.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "").slice(0, 512))
    .filter((line) => line.length > 3)
    .slice(0, 24);
  if (frames.length === 0) return undefined;
  return frames.join("\n").slice(0, 8_192);
}

function sendSuggestionError(reply: FastifyReply, error: unknown) {
  if (error instanceof SuggestionError) {
    const status = error.code === "invalid_input"
      ? 400
      : error.code === "conflict" || error.code === "concurrent_change" || error.code === "stale"
        ? 409
        : error.code === "unsupported"
          ? 422
          : 404;
    return reply.code(status).send({ error: error.code });
  }
  throw error;
}

function sendSuggestionGenerationError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof SuggestionError) return sendSuggestionError(reply, error);
  const errorStack = safeErrorStack(error);
  request.log.error(
    {
      event: "metadata_suggestion.generation_failed",
      errorType: safeErrorType(error),
      ...(errorStack === undefined ? {} : { errorStack }),
    },
    "metadata suggestion generation failed",
  );
  return reply.code(500).send({ error: "metadata_suggestion_internal_error" });
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

export async function registerSuggestionHttp(app: FastifyInstance, service: SuggestionService): Promise<void> {
  const paramsSchema = {
    type: "object",
    required: ["libraryId", "fileId"],
    properties: { libraryId: idSchema, fileId: idSchema },
  } as const;

  app.post<{ Params: HoldingParams }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata/suggestions",
    {
      preHandler: app.authenticate,
      schema: { params: paramsSchema, querystring: emptyQuerySchema },
    },
    async (request, reply) => {
      const controller = new AbortController();
      const onAborted = (): void => controller.abort();
      request.raw.once("aborted", onAborted);
      try {
        return {
          run: await service.generate(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.params.fileId,
            controller.signal,
          ),
        };
      } catch (error: unknown) {
        return sendSuggestionGenerationError(request, reply, error);
      } finally {
        request.raw.removeListener("aborted", onAborted);
      }
    },
  );

  app.get<{ Params: HoldingParams }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata/suggestions",
    {
      preHandler: app.authenticate,
      schema: { params: paramsSchema, querystring: emptyQuerySchema },
    },
    async (request, reply) => {
      try {
        return { run: service.getLatest(requireActor(request.authAccount), request.params.libraryId, request.params.fileId) };
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: RunParams; Body: AcceptBody }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata/suggestions/:runId/accept",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 48 * 1024,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId", "runId"],
          properties: { libraryId: idSchema, fileId: idSchema, runId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["acceptedCandidateIds", "metadataVersion"],
          properties: {
            acceptedCandidateIds: {
              type: "array",
              minItems: 1,
              maxItems: 64,
              uniqueItems: true,
              items: { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}:[0-9]{1,3}$", maxLength: 192 },
            },
            metadataVersion: metadataVersionSchema,
            metadata: { type: "object", additionalProperties: true, maxProperties: 16 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          ...(await service.accept(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.params.fileId,
            request.params.runId,
            request.body,
          )),
        };
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );
}
