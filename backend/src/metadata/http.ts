import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AUTHORITY_TYPES, MATERIAL_TYPES } from "./metadata.js";
import { CONTRIBUTOR_ROLES, EDITION_TYPES, MATERIAL_CLASSES } from "../bibliography/bibliography.js";
import { MetadataError, type CanonicalMetadataService } from "./metadata-service.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const emptyQuerySchema = { type: "object", additionalProperties: false, properties: {} } as const;
const metadataVersionSchema = { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 } as const;
const textSchema = { type: "string", minLength: 1, maxLength: 512 } as const;

interface HoldingParams { libraryId: string; fileId: string; }
interface AuthorityParams { libraryId: string; authorityId: string; }
interface MetadataBody {
  metadataVersion: string;
  materialType: string;
  canonicalTitle: string;
  subtitle: string | null;
  alternativeTitles: string[];
  dateStatement: string | null;
  identifiers: Array<{ scheme: string; value: string }>;
  typeFields: Record<string, string>;
  authorityLinks: Array<{ authorityId: string; role: string }>;
}
interface AuthorityBody { type: string; canonicalLabel: string; aliases: string[]; }
interface AuthorityUpdateBody extends AuthorityBody { expectedVersion: string; }
interface AuthorityQuery { type: string; beforeId?: string; limit?: number; }
interface BibliographyBody {
  bibliographyVersion: string;
  materialClass: string;
  contributors: Array<{ id?: string; label: string; role: string; roleLabel?: string | null; authorityId?: string | null }>;
  publication: { publisher?: string | null; place?: string | null; publicationDate?: string | null; editionNumber?: string | null; printing?: string | null };
  series?: string | null;
  volume?: string | null;
  language?: string | null;
  carrierEdition: { editionType?: string | null; editionStatement?: string | null; facsimileStatement?: string | null };
  sourceEdition: {
    dynasty?: string | null; reignTitle?: string | null; reignYear?: string | null; absoluteYear?: number | null;
    printer?: string | null; imprint?: string | null; bookshop?: string | null; institution?: string | null;
    printingPlace?: string | null; editionType?: string | null; editionStatement?: string | null; holdingInformation?: string | null;
  };
}
interface AuthorityResetBody {
  bibliographyVersion: string;
  fields: Array<{ fieldName: string; scopeKey: string }>;
}

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new MetadataError("not_found");
  return account;
}

function sendMetadataError(reply: FastifyReply, error: unknown) {
  if (error instanceof MetadataError) {
    const status = error.code === "invalid_input"
      ? 400
      : error.code === "conflict" || error.code === "concurrent_change" || error.code === "incompatible_type_transition"
        ? 409
        : 404;
    return reply.code(status).send({ error: error.code });
  }
  throw error;
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

export async function registerMetadataHttp(app: FastifyInstance, service: CanonicalMetadataService): Promise<void> {
  app.get<{ Params: HoldingParams }>(
    "/api/libraries/:libraryId/holdings/:fileId/details",
    {
      preHandler: app.authenticate,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: emptyQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        return service.getDetails(requireActor(request.authAccount), request.params.libraryId, request.params.fileId);
      } catch (error: unknown) {
        return sendMetadataError(reply, error);
      }
    },
  );

  app.put<{ Params: HoldingParams; Body: MetadataBody }>(
    "/api/libraries/:libraryId/holdings/:fileId/metadata",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 32 * 1024,
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
          required: ["metadataVersion", "materialType", "canonicalTitle", "subtitle", "alternativeTitles", "dateStatement", "identifiers", "typeFields", "authorityLinks"],
          properties: {
            metadataVersion: metadataVersionSchema,
            materialType: { enum: MATERIAL_TYPES },
            canonicalTitle: textSchema,
            subtitle: { anyOf: [{ type: "string", minLength: 1, maxLength: 512 }, { type: "null" }] },
            alternativeTitles: { type: "array", minItems: 0, maxItems: 8, items: textSchema },
            dateStatement: { anyOf: [{ type: "string", minLength: 1, maxLength: 128 }, { type: "null" }] },
            identifiers: {
              type: "array",
              minItems: 0,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["scheme", "value"],
                properties: {
                  scheme: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9._-]{0,31}$", minLength: 1, maxLength: 32 },
                  value: { type: "string", minLength: 1, maxLength: 128 },
                },
              },
            },
            typeFields: { type: "object", additionalProperties: true, maxProperties: 4 },
            authorityLinks: {
              type: "array",
              minItems: 0,
              maxItems: 32,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["authorityId", "role"],
                properties: { authorityId: idSchema, role: { type: "string", minLength: 1, maxLength: 64 } },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { metadataVersion, ...metadataBody } = request.body;
        return service.updateMetadata(
          requireActor(request.authAccount),
          request.params.libraryId,
          request.params.fileId,
          metadataVersion,
          metadataBody,
        );
      } catch (error: unknown) {
        const actor = request.authAccount;
        if (actor) service.recordAuditAttempt(actor, "libraries.metadata_update", error);
        return sendMetadataError(reply, error);
      }
    },
  );

  const nullableText = (maximum: number) => ({
    anyOf: [{ type: "string", minLength: 1, maxLength: maximum }, { type: "null" }],
  } as const);
  const editionTypeSchema = { anyOf: [{ enum: EDITION_TYPES }, { type: "null" }] } as const;

  app.put<{ Params: HoldingParams; Body: BibliographyBody }>(
    "/api/libraries/:libraryId/holdings/:fileId/bibliography",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 64 * 1024,
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
          required: ["bibliographyVersion", "materialClass", "contributors", "publication", "carrierEdition", "sourceEdition"],
          properties: {
            bibliographyVersion: metadataVersionSchema,
            materialClass: { enum: MATERIAL_CLASSES },
            contributors: {
              type: "array", minItems: 0, maxItems: 64,
              items: {
                type: "object", additionalProperties: false, required: ["label", "role"],
                properties: {
                  id: idSchema,
                  label: { type: "string", minLength: 1, maxLength: 255 },
                  role: { enum: CONTRIBUTOR_ROLES },
                  roleLabel: nullableText(64),
                  authorityId: { anyOf: [idSchema, { type: "null" }] },
                },
              },
            },
            publication: {
              type: "object", additionalProperties: false,
              properties: {
                publisher: nullableText(255), place: nullableText(255), publicationDate: nullableText(64),
                editionNumber: nullableText(128), printing: nullableText(128),
              },
            },
            series: nullableText(255),
            volume: nullableText(128),
            language: nullableText(128),
            carrierEdition: {
              type: "object", additionalProperties: false,
              properties: {
                editionType: editionTypeSchema,
                editionStatement: nullableText(512),
                facsimileStatement: nullableText(512),
              },
            },
            sourceEdition: {
              type: "object", additionalProperties: false,
              properties: {
                dynasty: nullableText(64), reignTitle: nullableText(64), reignYear: nullableText(64),
                absoluteYear: { anyOf: [{ type: "integer", minimum: -9999, maximum: 9999 }, { type: "null" }] },
                printer: nullableText(255), imprint: nullableText(255), bookshop: nullableText(255),
                institution: nullableText(255), printingPlace: nullableText(255), editionType: editionTypeSchema,
                editionStatement: nullableText(512), holdingInformation: nullableText(512),
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { bibliographyVersion, ...body } = request.body;
        return service.updateBibliography(
          requireActor(request.authAccount), request.params.libraryId, request.params.fileId, bibliographyVersion, body,
        );
      } catch (error: unknown) {
        const actor = request.authAccount;
        if (actor) service.recordAuditAttempt(actor, "libraries.metadata_update", error);
        return sendMetadataError(reply, error);
      }
    },
  );

  app.post<{ Params: HoldingParams; Body: AuthorityResetBody }>(
    "/api/libraries/:libraryId/holdings/:fileId/bibliography/restore-ai",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 16 * 1024,
      schema: {
        params: {
          type: "object", required: ["libraryId", "fileId"],
          properties: { libraryId: idSchema, fileId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: {
          type: "object", additionalProperties: false, required: ["bibliographyVersion", "fields"],
          properties: {
            bibliographyVersion: metadataVersionSchema,
            fields: {
              type: "array", minItems: 1, maxItems: 64,
              items: {
                type: "object", additionalProperties: false, required: ["fieldName", "scopeKey"],
                properties: {
                  fieldName: { type: "string", minLength: 1, maxLength: 64 },
                  scopeKey: { type: "string", maxLength: 128 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return service.resetBibliographicFieldAuthority(
          requireActor(request.authAccount), request.params.libraryId, request.params.fileId,
          request.body.bibliographyVersion, request.body.fields,
        );
      } catch (error: unknown) {
        const actor = request.authAccount;
        if (actor) service.recordAuditAttempt(actor, "libraries.metadata_update", error);
        return sendMetadataError(reply, error);
      }
    },
  );

  app.get<{ Params: { libraryId: string }; Querystring: AuthorityQuery }>(
    "/api/libraries/:libraryId/authorities",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["libraryId"], properties: { libraryId: idSchema } },
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["type"],
          properties: {
            type: { enum: AUTHORITY_TYPES },
            beforeId: idSchema,
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return service.listAuthorities(
          requireActor(request.authAccount),
          request.params.libraryId,
          request.query.type as (typeof AUTHORITY_TYPES)[number],
          request.query.beforeId ?? null,
          request.query.limit,
        );
      } catch (error: unknown) {
        return sendMetadataError(reply, error);
      }
    },
  );

  app.post<{ Params: { libraryId: string }; Body: AuthorityBody }>(
    "/api/libraries/:libraryId/authorities",
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
          required: ["type", "canonicalLabel", "aliases"],
          properties: {
            type: { enum: AUTHORITY_TYPES },
            canonicalLabel: { type: "string", minLength: 1, maxLength: 255 },
            aliases: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 255 } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return { authority: service.createAuthority(requireActor(request.authAccount), request.params.libraryId, request.body) };
      } catch (error: unknown) {
        const actor = request.authAccount;
        if (actor) service.recordAuditAttempt(actor, "libraries.authority_create", error);
        return sendMetadataError(reply, error);
      }
    },
  );

  app.put<{ Params: AuthorityParams; Body: AuthorityUpdateBody }>(
    "/api/libraries/:libraryId/authorities/:authorityId",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 8 * 1024,
      schema: {
        params: {
          type: "object",
          required: ["libraryId", "authorityId"],
          properties: { libraryId: idSchema, authorityId: idSchema },
        },
        querystring: emptyQuerySchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["expectedVersion", "type", "canonicalLabel", "aliases"],
          properties: {
            expectedVersion: metadataVersionSchema,
            type: { enum: AUTHORITY_TYPES },
            canonicalLabel: { type: "string", minLength: 1, maxLength: 255 },
            aliases: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 255 } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          authority: service.updateAuthority(
            requireActor(request.authAccount),
            request.params.libraryId,
            request.params.authorityId,
            request.body.expectedVersion,
            { type: request.body.type, canonicalLabel: request.body.canonicalLabel, aliases: request.body.aliases },
          ),
        };
      } catch (error: unknown) {
        const actor = request.authAccount;
        if (actor) service.recordAuditAttempt(actor, "libraries.authority_update", error);
        return sendMetadataError(reply, error);
      }
    },
  );
}
