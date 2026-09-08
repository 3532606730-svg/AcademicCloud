import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { CatalogBatchError, type CatalogBatchService } from "./catalog-batch-service.js";
import { MAX_CATALOG_BATCH_RESOURCES, MAX_CATALOG_RESULTS_BYTES, MAX_CATALOG_APPLY_BYTES } from "./contracts.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;

interface LibraryParams { libraryId: string; }
interface SourceParams { batchId: string; resourceId: string; }
interface ExportBody { fileIds: string[]; }
interface ApplyBody { planId: unknown; selections: unknown; }

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new CatalogBatchError("not_found");
  return account;
}

function sendError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof CatalogBatchError)) throw error;
  const status = error.code === "invalid_input" ? 400
    : error.code === "plan_too_large" ? 413
    : error.code === "stale" || error.code === "conflict" || error.code === "plan_expired" ? 409
      : error.code === "storage_unavailable" ? 503 : 404;
  return reply.code(status).send({ error: error.code });
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const mediaType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

export async function registerCatalogBatchHttp(app: FastifyInstance, service: CatalogBatchService): Promise<void> {
  app.post<{ Params: LibraryParams; Body: ExportBody }>(
    "/api/libraries/:libraryId/catalog-batches/export-request",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 128 * 1024,
      schema: {
        params: { type: "object", additionalProperties: false, required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object", additionalProperties: false, required: ["fileIds"],
          properties: { fileIds: { type: "array", minItems: 1, maxItems: MAX_CATALOG_BATCH_RESOURCES, uniqueItems: true, items: idSchema } },
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.prepareExport(requireActor(request.authAccount), request.params.libraryId, request.body.fileIds);
      } catch (error: unknown) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: SourceParams }>(
    "/api/catalog-batches/:batchId/resources/:resourceId/source",
    {
      schema: {
        params: {
          type: "object", additionalProperties: false, required: ["batchId", "resourceId"],
          properties: { batchId: idSchema, resourceId: idSchema },
        },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const token = request.headers.authorization?.match(/^Bearer\s+([^\s]+)$/u)?.[1];
        if (!token || token.length < 32 || token.length > 512) throw new CatalogBatchError("not_found");
        return {
          source: await service.authorizeExportSource(request.params.batchId, request.params.resourceId, token),
        };
      } catch (error: unknown) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{ Params: LibraryParams; Body: unknown }>(
    "/api/libraries/:libraryId/catalog-batches/preview",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: MAX_CATALOG_RESULTS_BYTES,
      schema: {
        params: { type: "object", additionalProperties: false, required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: emptyQuerySchema,
        body: { type: "object" },
      },
    },
    async (request, reply) => {
      try {
        return service.preview(requireActor(request.authAccount), request.params.libraryId, request.body);
      } catch (error: unknown) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{ Params: LibraryParams; Body: ApplyBody }>(
    "/api/libraries/:libraryId/catalog-batches/apply",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: MAX_CATALOG_APPLY_BYTES,
      schema: {
        params: { type: "object", additionalProperties: false, required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object", additionalProperties: false, required: ["planId", "selections"],
          properties: {
            planId: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 },
            selections: {
              type: "array", minItems: 1, maxItems: MAX_CATALOG_BATCH_RESOURCES,
              items: {
                type: "object", additionalProperties: false, required: ["resourceId", "previewVersion"],
                properties: {
                  resourceId: idSchema,
                  previewVersion: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 },
                  acknowledgeHumanConflict: { const: true },
                  acknowledgeClear: { const: true },
                  acknowledgeEvidence: { const: true },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          results: service.apply(
            requireActor(request.authAccount), request.params.libraryId,
            request.body.planId, request.body.selections,
          ),
        };
      } catch (error: unknown) {
        return sendError(reply, error);
      }
    },
  );
}
