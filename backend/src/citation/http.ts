import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { MetadataError } from "../metadata/metadata-service.js";
import { CITATION_LOCATOR_TYPES, CITATION_STYLES, CitationError } from "./citation.js";
import type { CitationService } from "./citation-service.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
interface HoldingParams { libraryId: string; fileId: string; }

function actor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new MetadataError("not_found");
  return account;
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof MetadataError) {
    return reply.code(error.code === "invalid_input" ? 400 : 404).send({ error: error.code === "invalid_input" ? "invalid_input" : "not_found" });
  }
  if (error instanceof CitationError) {
    const status = error.code === "formatting_failed" ? 500 : 400;
    return reply.code(status).send({ error: error.code });
  }
  throw error;
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

export async function registerCitationHttp(app: FastifyInstance, service: CitationService): Promise<void> {
  app.post<{ Params: HoldingParams; Body: { style: string; locators: Array<{ type: string; value: string; side?: string; label?: string }> } }>(
    "/api/libraries/:libraryId/holdings/:fileId/citation",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 16 * 1024,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: { type: "object", additionalProperties: false, properties: {} },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["style", "locators"],
          properties: {
            style: { enum: CITATION_STYLES },
            locators: {
              type: "array",
              minItems: 0,
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "value"],
                properties: {
                  type: { enum: CITATION_LOCATOR_TYPES },
                  value: { type: "string", minLength: 1, maxLength: 128 },
                  side: { enum: ["recto", "verso"] },
                  label: { type: "string", minLength: 1, maxLength: 32 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return service.generate(actor(request.authAccount), request.params.libraryId, request.params.fileId, request.body);
      } catch (error: unknown) {
        return sendError(reply, error);
      }
    },
  );
}
