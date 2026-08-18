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
      try {
        return { run: await service.generate(requireActor(request.authAccount), request.params.libraryId, request.params.fileId) };
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
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
