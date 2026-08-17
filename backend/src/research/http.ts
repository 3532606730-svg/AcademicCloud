import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { ResearchError, type ScholarlyRecordService } from "./service.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const labelSchema = { type: "string", minLength: 1, maxLength: 255 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;

interface RecordParams {
  recordId: string;
}

interface ArtifactParams {
  recordId: string;
  artifactId: string;
}

interface RecordListQuery {
  beforeId?: string;
  limit?: number;
}

interface RecordDetailQuery {
  beforeArtifactId?: string;
  limit?: number;
}

interface CreateRecordBody {
  label: string;
}

interface AttachFileBody {
  fileId: string;
}

function requireOwnerId(account: { id: string } | null): string {
  if (!account) throw new ResearchError("not_found");
  return account.id;
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

async function requireBodyless(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.body !== undefined) await reply.code(400).send({ error: "invalid_request" });
}

function sendResearchError(reply: FastifyReply, error: unknown) {
  if (error instanceof ResearchError) {
    const status = error.code === "not_found" ? 404 : error.code === "invalid_input" ? 400 : 409;
    return reply.code(status).send({ error: error.code });
  }
  throw error;
}

export async function registerResearchHttp(
  app: FastifyInstance,
  service: ScholarlyRecordService,
): Promise<void> {
  app.get<{ Querystring: RecordListQuery }>(
    "/api/research/records",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            beforeId: idSchema,
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return service.listRecords(
          requireOwnerId(request.authAccount),
          request.query.beforeId ?? null,
          request.query.limit,
        );
      } catch (error: unknown) {
        return sendResearchError(reply, error);
      }
    },
  );

  app.get<{ Params: RecordParams; Querystring: RecordDetailQuery }>(
    "/api/research/records/:recordId",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["recordId"], properties: { recordId: idSchema } },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            beforeArtifactId: idSchema,
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          record: service.getRecord(
            requireOwnerId(request.authAccount),
            request.params.recordId,
            request.query.beforeArtifactId ?? null,
            request.query.limit,
          ),
        };
      } catch (error: unknown) {
        return sendResearchError(reply, error);
      }
    },
  );

  app.post<{ Body: CreateRecordBody }>(
    "/api/research/records",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: { label: labelSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send({
          record: service.createRecord(requireOwnerId(request.authAccount), request.body.label),
        });
      } catch (error: unknown) {
        return sendResearchError(reply, error);
      }
    },
  );

  app.post<{ Params: RecordParams; Body: AttachFileBody }>(
    "/api/research/records/:recordId/artifacts",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: { type: "object", required: ["recordId"], properties: { recordId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["fileId"],
          properties: { fileId: idSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          record: service.attachFile(
            requireOwnerId(request.authAccount),
            request.params.recordId,
            request.body.fileId,
          ),
        };
      } catch (error: unknown) {
        return sendResearchError(reply, error);
      }
    },
  );

  app.delete<{ Params: ArtifactParams }>(
    "/api/research/records/:recordId/artifacts/:artifactId",
    {
      preHandler: app.authenticate,
      preValidation: requireBodyless,
      schema: {
        querystring: emptyQuerySchema,
        params: {
          type: "object",
          required: ["recordId", "artifactId"],
          properties: { recordId: idSchema, artifactId: idSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          record: service.detachArtifact(
            requireOwnerId(request.authAccount),
            request.params.recordId,
            request.params.artifactId,
          ),
        };
      } catch (error: unknown) {
        return sendResearchError(reply, error);
      }
    },
  );
}
