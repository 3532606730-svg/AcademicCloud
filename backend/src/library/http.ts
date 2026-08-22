import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError } from "../auth/authorization.js";
import { CONTRIBUTOR_ROLES, EDITION_TYPES, MATERIAL_CLASSES, type ContributorRole, type EditionType, type MaterialClass } from "../bibliography/bibliography.js";
import { DriveError } from "../drive/drive-service.js";
import { LIBRARY_ROLES, type LibraryRole } from "./library.js";
import { LibraryError, type LibraryService } from "./library-service.js";
import { SearchInputError } from "./search.js";
import { HoldingSortError } from "./holding-sort.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;

interface LibraryParams { libraryId: string; }
interface MemberParams extends LibraryParams { accountId: string; }
interface HoldingParams extends LibraryParams { fileId: string; }
interface MembershipBody { accountId: string; role: LibraryRole; }
interface RoleBody { role: LibraryRole; }
interface HoldingsQuery { limit?: number; sort?: string; cursor?: string; }
interface DownloadQuery { disposition?: "attachment" | "inline"; }
interface ContributionParams extends LibraryParams { contributionId: string; }
interface ContributionBody { artifactId: string; }
interface HoldingVersionBody { version: string; }
interface SearchQuery {
  q?: string;
  limit?: number;
  cursor?: string;
  sort?: string;
  materialClass?: MaterialClass;
  contributor?: string;
  language?: string;
  publisher?: string;
  year?: string;
  editionType?: EditionType;
  dynasty?: string;
  reignTitle?: string;
  editorialRole?: ContributorRole;
  series?: string;
  volume?: string;
}

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new LibraryError("not_found");
  return account;
}

function sendLibraryError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationDeniedError) {
    return reply.code(404).send({ error: "not_found" });
  }
  if (error instanceof SearchInputError || error instanceof HoldingSortError) {
    return reply.code(400).send({ error: error.code === "invalid_cursor" ? "invalid_cursor" : "invalid_input" });
  }
  if (error instanceof LibraryError) {
    const status = error.code === "invalid_input"
      ? 400
      : error.code === "conflict" || error.code === "invalid_state" || error.code === "concurrent_change"
        ? 409
        : 404;
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
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            sort: { type: "string", enum: ["newest", "oldest", "title_asc", "title_desc", "size_desc", "size_asc"] },
            cursor: { type: "string", minLength: 1, maxLength: 8000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (request.query.sort !== undefined) {
          const page = service.listHoldingsSorted(
            requireActor(request.authAccount).id,
            request.params.libraryId,
            request.query.sort,
            request.query.cursor ?? null,
            request.query.limit ?? 50,
          );
          return { holdings: page.holdings, nextCursor: page.nextCursor };
        }
        return {
          holdings: service.listHoldings(requireActor(request.authAccount).id, request.params.libraryId, request.query.limit),
          nextCursor: null,
        };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams; Querystring: SearchQuery }>(
    "/api/libraries/:libraryId/holdings/search",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            q: { type: "string", maxLength: 100 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", minLength: 1, maxLength: 8000 },
            sort: { type: "string", enum: ["relevance", "newest", "oldest", "title_asc", "title_desc", "size_desc", "size_asc"] },
            materialClass: { type: "string", enum: MATERIAL_CLASSES },
            contributor: { type: "string", minLength: 1, maxLength: 128 },
            language: { type: "string", minLength: 1, maxLength: 128 },
            publisher: { type: "string", minLength: 1, maxLength: 128 },
            year: { type: "string", minLength: 1, maxLength: 128 },
            editionType: { type: "string", enum: EDITION_TYPES },
            dynasty: { type: "string", minLength: 1, maxLength: 128 },
            reignTitle: { type: "string", minLength: 1, maxLength: 128 },
            editorialRole: { type: "string", enum: CONTRIBUTOR_ROLES },
            series: { type: "string", minLength: 1, maxLength: 128 },
            volume: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return service.searchHoldings(
          requireActor(request.authAccount).id,
          request.params.libraryId,
          request.query.q ?? "",
          request.query.limit ?? 50,
          request.query.cursor ?? null,
          {
            ...(request.query.materialClass ? { materialClass: request.query.materialClass } : {}),
            ...(request.query.contributor ? { contributor: request.query.contributor } : {}),
            ...(request.query.language ? { language: request.query.language } : {}),
            ...(request.query.publisher ? { publisher: request.query.publisher } : {}),
            ...(request.query.year ? { year: request.query.year } : {}),
            ...(request.query.editionType ? { editionType: request.query.editionType } : {}),
            ...(request.query.dynasty ? { dynasty: request.query.dynasty } : {}),
            ...(request.query.reignTitle ? { reignTitle: request.query.reignTitle } : {}),
            ...(request.query.editorialRole ? { editorialRole: request.query.editorialRole } : {}),
            ...(request.query.series ? { series: request.query.series } : {}),
            ...(request.query.volume ? { volume: request.query.volume } : {}),
          },
          request.query.sort ?? "relevance",
        );
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

  app.post<{ Params: HoldingParams; Body: HoldingVersionBody }>(
    "/api/libraries/:libraryId/holdings/:fileId/recycle",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["version"],
          properties: { version: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } },
        },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request.authAccount);
      try {
        service.recycleHolding(actor, request.params.libraryId, request.params.fileId, request.body.version);
        return reply.code(204).send();
      } catch (error: unknown) {
        service.recordHoldingRecycleAuditAttempt(actor, error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.delete<{ Params: HoldingParams; Body: HoldingVersionBody }>(
    "/api/libraries/:libraryId/recycle/:fileId/permanent",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["version"],
          properties: { version: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } },
        },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request.authAccount);
      try {
        await service.permanentlyDeleteHolding(
          actor,
          request.params.libraryId,
          request.params.fileId,
          request.body.version,
        );
        return reply.code(204).send();
      } catch (error: unknown) {
        service.recordHoldingPurgeAuditAttempt(actor, error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams }>(
    "/api/libraries/:libraryId/recycle",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        return { files: service.listRecycle(requireActor(request.authAccount), request.params.libraryId) };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.post<{ Params: HoldingParams; Body: HoldingVersionBody }>(
    "/api/libraries/:libraryId/recycle/:fileId/restore",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["version"],
          properties: { version: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } },
        },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request.authAccount);
      try {
        await service.restoreHolding(actor, request.params.libraryId, request.params.fileId, request.body.version);
        return reply.code(204).send();
      } catch (error: unknown) {
        service.recordHoldingRestoreAuditAttempt(actor, error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.post<{ Params: LibraryParams; Body: ContributionBody }>(
    "/api/libraries/:libraryId/contributions",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: emptyQuerySchema,
        body: { type: "object", additionalProperties: false, required: ["artifactId"], properties: { artifactId: idSchema } },
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send({
          contribution: service.submitContribution(requireActor(request.authAccount), request.params.libraryId, request.body.artifactId),
        });
      } catch (error: unknown) {
        service.recordContributionAuditAttempt(requireActor(request.authAccount), "libraries.contribution_submit", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams; Querystring: HoldingsQuery }>(
    "/api/libraries/:libraryId/contributions",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
      },
    },
    async (request, reply) => {
      try {
        return { contributions: service.listContributions(requireActor(request.authAccount), request.params.libraryId, request.query.limit) };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: LibraryParams; Querystring: HoldingsQuery }>(
    "/api/libraries/:libraryId/contributions/mine",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
      },
    },
    async (request, reply) => {
      try {
        return { contributions: service.listMyContributions(requireActor(request.authAccount), request.params.libraryId, request.query.limit) };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );

  app.post<{ Params: ContributionParams }>(
    "/api/libraries/:libraryId/contributions/:contributionId/approve",
    {
      preHandler: app.authenticate,
      preValidation: requireBodyless,
      schema: {
        params: { type: "object", required: ["libraryId", "contributionId"], properties: { libraryId: idSchema, contributionId: idSchema } },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        return { contribution: service.reviewContribution(requireActor(request.authAccount), request.params.libraryId, request.params.contributionId, "approve") };
      } catch (error: unknown) {
        service.recordContributionAuditAttempt(requireActor(request.authAccount), "libraries.contribution_approve", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.post<{ Params: ContributionParams }>(
    "/api/libraries/:libraryId/contributions/:contributionId/reject",
    {
      preHandler: app.authenticate,
      preValidation: requireBodyless,
      schema: {
        params: { type: "object", required: ["libraryId", "contributionId"], properties: { libraryId: idSchema, contributionId: idSchema } },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        return { contribution: service.reviewContribution(requireActor(request.authAccount), request.params.libraryId, request.params.contributionId, "reject") };
      } catch (error: unknown) {
        service.recordContributionAuditAttempt(requireActor(request.authAccount), "libraries.contribution_reject", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.post<{ Params: ContributionParams }>(
    "/api/libraries/:libraryId/contributions/:contributionId/withdraw",
    {
      preHandler: app.authenticate,
      preValidation: requireBodyless,
      schema: {
        params: { type: "object", required: ["libraryId", "contributionId"], properties: { libraryId: idSchema, contributionId: idSchema } },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        return { contribution: service.withdrawContribution(requireActor(request.authAccount), request.params.libraryId, request.params.contributionId) };
      } catch (error: unknown) {
        service.recordContributionAuditAttempt(requireActor(request.authAccount), "libraries.contribution_withdraw", error);
        return sendLibraryError(reply, error);
      }
    },
  );

  app.get<{ Params: ContributionParams; Querystring: DownloadQuery }>(
    "/api/libraries/:libraryId/contributions/:contributionId/download",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId", "contributionId"], properties: { libraryId: idSchema, contributionId: idSchema } },
        querystring: {
          type: "object", additionalProperties: false,
          properties: { disposition: { enum: ["attachment", "inline"] } },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          download: await service.createContributionDownload(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.params.contributionId,
            request.query.disposition,
          ),
        };
      } catch (error: unknown) {
        return sendLibraryError(reply, error);
      }
    },
  );
}
