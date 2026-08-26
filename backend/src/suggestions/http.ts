import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseDerivedComputeResult } from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { secureSecretEquals } from "../compute/github-actions-dispatcher.js";
import type { MaterialType } from "../metadata/metadata.js";
import { SuggestionError, type SuggestionAcceptanceInput, type SuggestionService } from "./suggestion-service.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const ID_PATTERN_REGEX = /^[A-Za-z0-9_-]{1,128}$/u;
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;
const metadataVersionSchema = { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 } as const;
const workerIdSchema = { type: "string", pattern: "^[A-Za-z0-9_.-]{1,128}$", minLength: 1, maxLength: 128 } as const;

interface HoldingParams { libraryId: string; fileId: string; }
interface RunParams extends HoldingParams { runId: string; }
interface JobParams extends HoldingParams { jobId: string; }
interface InternalJobParams { jobId: string; }
interface ClaimBody { attemptId: string; }
interface PullBody { workerId: string; waitMilliseconds?: number; }
interface HeartbeatBody { attemptId: string; workerId: string; }
interface SourceAuthorizationBody { attemptId: string; workerId: string; }
interface AcceptBody extends SuggestionAcceptanceInput { metadata?: Record<string, unknown>; }
interface LibraryParams { libraryId: string; }
interface BatchPreviewQuery { fileIds: string; }
interface BatchNamingBody {
  items: Array<{
    fileId: string;
    metadataVersion: string;
    sourceVersion: string;
    canonicalTitle: string;
    materialType: string;
  }>;
}

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new SuggestionError("not_found");
  return account;
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(error.name)) return "Error";
  return error.name;
}

function safeSqliteCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== "SqliteError") return undefined;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^SQLITE_[A-Z_]{1,64}$/u.test(code) ? code : undefined;
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

export async function registerSuggestionHttp(
  app: FastifyInstance,
  service: SuggestionService,
  options: { bootstrapSecret: string | null } = { bootstrapSecret: null },
): Promise<void> {
  const paramsSchema = {
    type: "object",
    required: ["libraryId", "fileId"],
    properties: { libraryId: idSchema, fileId: idSchema },
  } as const;

  app.get<{ Params: LibraryParams; Querystring: BatchPreviewQuery }>(
    "/api/libraries/:libraryId/metadata/suggestion-states",
    {
      preHandler: app.authenticate,
      schema: {
        params: {
          type: "object",
          required: ["libraryId"],
          properties: { libraryId: idSchema },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["fileIds"],
          properties: { fileIds: { type: "string", minLength: 1, maxLength: 13_000 } },
        },
      },
    },
    async (request, reply) => {
      const fileIds = request.query.fileIds.split(",");
      if (fileIds.some((fileId) => !ID_PATTERN_REGEX.test(fileId))) {
        return reply.code(400).send({ error: "invalid_input" });
      }
      try {
        return {
          states: service.getLatestCataloguingStates(
            requireActor(request.authAccount),
            request.params.libraryId,
            fileIds,
          ),
        };
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: HoldingParams }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata/suggestions",
    {
      preHandler: app.authenticate,
      schema: { params: paramsSchema, querystring: emptyQuerySchema },
    },
    async (request, reply) => {
      try {
        const job = await service.requestGeneration(
          requireActor(request.authAccount),
          request.params.libraryId,
          request.params.fileId,
        );
        return reply.code(202).send({ job });
      } catch (error: unknown) {
        return sendSuggestionGenerationError(request, reply, error);
      }
    },
  );

  app.get<{ Params: HoldingParams }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata/suggestion-jobs/latest",
    {
      preHandler: app.authenticate,
      schema: { params: paramsSchema, querystring: emptyQuerySchema },
    },
    async (request, reply) => {
      try {
        return { job: service.getLatestJob(requireActor(request.authAccount), request.params.libraryId, request.params.fileId) };
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.get<{ Params: JobParams }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata/suggestion-jobs/:jobId",
    {
      preHandler: app.authenticate,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId", "jobId"],
          properties: { libraryId: idSchema, fileId: idSchema, jobId: idSchema },
        },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        return { job: service.getJob(requireActor(request.authAccount), request.params.libraryId, request.params.fileId, request.params.jobId) };
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

  const batchParamsSchema = {
    type: "object",
    required: ["libraryId"],
    properties: { libraryId: idSchema },
  } as const;

  app.get<{ Params: LibraryParams; Querystring: BatchPreviewQuery }>(
    "/api/libraries/:libraryId/holdings/batch-naming",
    {
      preHandler: app.authenticate,
      schema: {
        params: batchParamsSchema,
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["fileIds"],
          properties: { fileIds: { type: "string", minLength: 1, maxLength: 6_500 } },
        },
      },
    },
    async (request, reply) => {
      const fileIds = request.query.fileIds.split(",").filter(Boolean);
      if (fileIds.some((fileId) => !ID_PATTERN_REGEX.test(fileId))) {
        return reply.code(400).send({ error: "invalid_input" });
      }
      try {
        return service.previewBatchNaming(
          requireActor(request.authAccount),
          request.params.libraryId,
          fileIds,
        );
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: LibraryParams; Body: BatchNamingBody }>(
    "/api/libraries/:libraryId/holdings/batch-naming",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 48 * 1024,
      schema: {
        params: batchParamsSchema,
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              minItems: 1,
              maxItems: 50,
              uniqueItems: true,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["fileId", "metadataVersion", "sourceVersion", "canonicalTitle", "materialType"],
                properties: {
                  fileId: idSchema,
                  metadataVersion: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 },
                  sourceVersion: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 },
                  canonicalTitle: { type: "string", minLength: 1, maxLength: 512 },
                  materialType: {
                    type: "string",
                    enum: ["book", "article", "manuscript", "inscription", "archival_document"],
                  },
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
          results: service.applyBatchNaming(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.body.items.map((item) => ({ ...item, materialType: item.materialType as MaterialType })),
          ),
        };
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: InternalJobParams; Body: ClaimBody }>(
    "/api/internal/compute/jobs/:jobId/claim",
    {
      preValidation: requireJson,
      bodyLimit: 4 * 1024,
      schema: {
        params: { type: "object", required: ["jobId"], properties: { jobId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["attemptId"],
          properties: { attemptId: idSchema },
        },
      },
    },
    async (request, reply) => {
      const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/u)?.[1];
      if (!secureSecretEquals(options.bootstrapSecret, supplied)) return reply.code(401).send({ error: "unauthorized" });
      try {
        return await service.claimJob(request.params.jobId, request.body.attemptId);
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Body: PullBody }>(
    "/api/internal/compute/pull",
    {
      preValidation: requireJson,
      bodyLimit: 4 * 1024,
      schema: {
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["workerId"],
          properties: {
            workerId: workerIdSchema,
            waitMilliseconds: { type: "integer", minimum: 0, maximum: 25_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/u)?.[1];
      if (!secureSecretEquals(options.bootstrapSecret, supplied)) return reply.code(401).send({ error: "unauthorized" });
      const deadline = Date.now() + (request.body.waitMilliseconds ?? 20_000);
      try {
        do {
          service.recoverExpiredLocalPullLeases();
          await service.reconcileUndispatchedJobs();
          const claim = await service.pullLocalJob(request.body.workerId);
          if (claim) return claim;
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          await new Promise<void>((resolve) => setTimeout(resolve, Math.min(500, remaining)));
        } while (Date.now() < deadline);
        return reply.code(204).send();
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: InternalJobParams; Body: HeartbeatBody }>(
    "/api/internal/compute/jobs/:jobId/heartbeat",
    {
      preValidation: requireJson,
      bodyLimit: 4 * 1024,
      schema: {
        params: { type: "object", required: ["jobId"], properties: { jobId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["attemptId", "workerId"],
          properties: { attemptId: idSchema, workerId: workerIdSchema },
        },
      },
    },
    async (request, reply) => {
      const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/u)?.[1];
      if (!secureSecretEquals(options.bootstrapSecret, supplied)) return reply.code(401).send({ error: "unauthorized" });
      try {
        return service.heartbeatLocalJob(request.params.jobId, request.body.attemptId, request.body.workerId);
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: InternalJobParams; Body: SourceAuthorizationBody }>(
    "/api/internal/compute/jobs/:jobId/source",
    {
      preValidation: requireJson,
      bodyLimit: 4 * 1024,
      schema: {
        params: { type: "object", required: ["jobId"], properties: { jobId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["attemptId", "workerId"],
          properties: { attemptId: idSchema, workerId: workerIdSchema },
        },
      },
    },
    async (request, reply) => {
      const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/u)?.[1];
      if (!secureSecretEquals(options.bootstrapSecret, supplied)) return reply.code(401).send({ error: "unauthorized" });
      try {
        return await service.renewLocalSourceAuthorization(
          request.params.jobId,
          request.body.attemptId,
          request.body.workerId,
        );
      } catch (error: unknown) {
        return sendSuggestionError(reply, error);
      }
    },
  );

  app.post<{ Params: InternalJobParams; Body: unknown }>(
    "/api/internal/compute/jobs/:jobId/result",
    {
      preValidation: requireJson,
      bodyLimit: 512 * 1024,
      schema: {
        params: { type: "object", required: ["jobId"], properties: { jobId: idSchema } },
        querystring: emptyQuerySchema,
        body: { type: "object", additionalProperties: true, maxProperties: 8 },
      },
    },
    async (request, reply) => {
      const capability = request.headers.authorization?.match(/^Bearer\s+(.+)$/u)?.[1];
      if (!capability) return reply.code(401).send({ error: "unauthorized" });
      let result;
      try {
        result = parseDerivedComputeResult(request.body);
      } catch {
        return reply.code(400).send({ error: "invalid_compute_result" });
      }
      if (result.jobId !== request.params.jobId) return reply.code(409).send({ error: "compute_identity_mismatch" });
      try {
        return { job: await service.applyComputeResult(result, capability) };
      } catch (error: unknown) {
        if (error instanceof SuggestionError) return sendSuggestionError(reply, error);
        const errorStack = safeErrorStack(error);
        const sqliteCode = safeSqliteCode(error);
        request.log.error(
          {
            event: "metadata_suggestion.result_failed",
            errorType: safeErrorType(error),
            ...(sqliteCode === undefined ? {} : { sqliteCode }),
            ...(errorStack === undefined ? {} : { errorStack }),
          },
          "metadata suggestion result persistence failed",
        );
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );
}
