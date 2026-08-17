import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { DriveError } from "../drive/drive-service.js";
import { LIBRARY_ROLES, type LibraryRole } from "./library.js";
import { LibraryError, type LibraryService } from "./library-service.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const nameSchema = { type: "string", minLength: 1, maxLength: 255 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;

interface LibraryParams { libraryId: string; }
interface MemberParams extends LibraryParams { accountId: string; }
interface HoldingParams extends LibraryParams { fileId: string; }
interface CreateLibraryBody { name: string; }
interface MembershipBody { accountId: string; role: LibraryRole; }
interface RoleBody { role: LibraryRole; }
interface HoldingsQuery { limit?: number; }
interface DownloadQuery { disposition?: "attachment" | "inline"; }

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new LibraryError("not_found");
  return account;
}

function sendLibraryError(reply: FastifyReply, error: unknown) {
  if (error instanceof LibraryError) {
    const status = error.code === "invalid_input" ? 400 : error.code === "conflict" || error.code === "invalid_state" ? 409 : 404;
    return reply.code(status).send({ error: error.code === "authorization_denied" ? "not_found" : error.code });
  }
  if (error instanceof DriveError) {
    const status = error.code === "storage_unavailable" ? 503 : error.code === "not_found" ? 404 : 409;
    return reply.code(status).send({ error: error.code });
  }
  throw error;
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

async function requireBodyless(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.body !== undefined) await reply.code(400).send({ error: "invalid_request" });
}

export async function registerLibraryHttp(app: FastifyInstance, service: LibraryService): Promise<void> {
  app.get(
    "/api/libraries",
    { preHandler: app.authenticate },
    async (request) => ({ libraries: service.listLibraries(requireActor(request.authAccount).id) }),
  );

  app.post<{ Body: CreateLibraryBody }>(
    "/api/libraries",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        querystring: emptyQuerySchema,
        body: { type: "object", additionalProperties: false, required: ["name"], properties: { name: nameSchema } },
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send({ library: service.createLibrary(requireActor(request.authAccount), request.body.name) });
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams }>(
    "/api/libraries/:libraryId",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } } } },
    async (request, reply) => {
      try {
        const accountId = requireActor(request.authAccount).id;
        const library = service.listLibraries(accountId).find((entry) => entry.id === request.params.libraryId);
        if (!library) throw new LibraryError("not_found");
        return { library };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams }>(
    "/api/libraries/:libraryId/members",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } } } },
    async (request, reply) => {
      try {
        return { members: service.listMembers(requireActor(request.authAccount), request.params.libraryId) };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.post<{ Params: LibraryParams; Body: MembershipBody }>(
    "/api/libraries/:libraryId/members",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["accountId", "role"],
          properties: { accountId: idSchema, role: { enum: LIBRARY_ROLES } },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          member: service.addMember(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.body.accountId,
            request.body.role,
          ),
        };
      } catch (error: unknown) {
        service.recordAuditAttempt(requireActor(request.authAccount), "libraries.membership_add", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.patch<{ Params: MemberParams; Body: RoleBody }>(
    "/api/libraries/:libraryId/members/:accountId",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "accountId"],
          properties: { libraryId: idSchema, accountId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: { type: "object", additionalProperties: false, required: ["role"], properties: { role: { enum: LIBRARY_ROLES } } },
      },
    },
    async (request, reply) => {
      try {
        return {
          member: service.changeMemberRole(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.params.accountId,
            request.body.role,
          ),
        };
      } catch (error: unknown) {
        service.recordAuditAttempt(requireActor(request.authAccount), "libraries.membership_change", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.delete<{ Params: MemberParams }>(
    "/api/libraries/:libraryId/members/:accountId",
    {
      preHandler: app.authenticate,
      preValidation: requireBodyless,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "accountId"],
          properties: { libraryId: idSchema, accountId: idSchema },
        },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        service.removeMember(requireActor(request.authAccount), request.params.libraryId, request.params.accountId);
        return reply.code(204).send();
      } catch (error: unknown) {
        service.recordAuditAttempt(requireActor(request.authAccount), "libraries.membership_remove", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams; Querystring: HoldingsQuery }>(
    "/api/libraries/:libraryId/holdings",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
      },
    },
    async (request, reply) => {
      try {
        return {
          holdings: service.listHoldings(requireActor(request.authAccount).id, request.params.libraryId, request.query.limit),
        };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: HoldingParams; Querystring: DownloadQuery }>(
    "/api/libraries/:libraryId/holdings/:fileId/download",
    {
      preHandler: app.authenticate,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { disposition: { enum: ["attachment", "inline"] } },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          download: await service.createDownload(
            requireActor(request.authAccount).id,
            request.params.libraryId,
            request.params.fileId,
            request.query.disposition,
          ),
        };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );
}
