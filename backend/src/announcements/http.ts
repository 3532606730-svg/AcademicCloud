import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";
import type { Announcement, AnnouncementSeverity } from "./announcement.js";
import {
  AnnouncementAdministrationError,
  AnnouncementService,
  AnnouncementValidationError,
} from "./announcement-service.js";

interface AnnouncementBody {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  linkUrl: string | null;
  expiresAt: string | null;
}

interface IdParameters {
  id: string;
}

const announcementBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body", "severity", "linkUrl", "expiresAt"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    body: { type: "string", minLength: 1, maxLength: 4000 },
    severity: { type: "string", enum: ["info", "warning", "critical"] },
    linkUrl: { anyOf: [{ type: "string", minLength: 9, maxLength: 2048 }, { type: "null" }] },
    expiresAt: { anyOf: [{ type: "string", minLength: 24, maxLength: 24 }, { type: "null" }] },
  },
} as const;

const idParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
} as const;

function announcementDto(announcement: Announcement) {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    severity: announcement.severity,
    linkUrl: announcement.linkUrl,
    isActive: announcement.isActive,
    publishedAt: announcement.publishedAt?.toISOString() ?? null,
    expiresAt: announcement.expiresAt?.toISOString() ?? null,
    createdByAccountId: announcement.createdByAccountId,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
  };
}

function parseBody(body: AnnouncementBody) {
  const expiresAt = body.expiresAt === null ? null : new Date(body.expiresAt);
  return { ...body, expiresAt };
}

function writeAudit(
  request: FastifyRequest,
  event: string,
  outcome: "succeeded" | "denied",
  details: { actorAccountId?: string; announcementId?: string; reason?: string } = {},
) {
  const audit = { event, outcome, ...details };
  (outcome === "succeeded" ? request.log.info : request.log.warn).call(
    request.log,
    { audit },
    "announcement administration audit event",
  );
}

function requireOwnerRequest(request: FastifyRequest, reply: FastifyReply): boolean {
  try {
    requireOwner(request.authAccount);
    return true;
  } catch {
    writeAudit(request, "announcements.owner_guard", "denied", { reason: "forbidden" });
    void reply.code(403).send({ error: "forbidden" });
    return false;
  }
}

function mapError(error: unknown, reply: FastifyReply) {
  if (error instanceof AuthorizationDeniedError) return reply.code(403).send({ error: "forbidden" });
  if (error instanceof AnnouncementValidationError) return reply.code(400).send({ error: "invalid_announcement" });
  if (error instanceof AnnouncementAdministrationError) {
    return error.code === "not_found"
      ? reply.code(404).send({ error: "not_found" })
      : reply.code(409).send({ error: "invalid_state" });
  }
  throw error;
}

export async function registerAnnouncementsHttp(app: FastifyInstance, service: AnnouncementService): Promise<void> {
  app.get(
    "/api/announcements",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        return { announcements: service.listEffective(request.authAccount!).map(announcementDto) };
      } catch (error: unknown) {
        return mapError(error, reply);
      }
    },
  );

  app.get(
    "/api/announcements/admin",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply)) return;
      try {
        return { announcements: service.listAll(request.authAccount!).map(announcementDto) };
      } catch (error: unknown) {
        return mapError(error, reply);
      }
    },
  );

  app.post<{ Body: AnnouncementBody }>(
    "/api/announcements",
    { preHandler: app.authenticate, schema: { body: announcementBodySchema } },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply)) return;
      try {
        const announcement = service.create(request.authAccount!, parseBody(request.body));
        writeAudit(request, "announcements.create", "succeeded", {
          actorAccountId: request.authAccount!.id,
          announcementId: announcement.id,
        });
        return reply.code(201).send({ announcement: announcementDto(announcement) });
      } catch (error: unknown) {
        return mapError(error, reply);
      }
    },
  );

  app.patch<{ Params: IdParameters; Body: AnnouncementBody }>(
    "/api/announcements/:id",
    { preHandler: app.authenticate, schema: { params: idParametersSchema, body: announcementBodySchema } },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply)) return;
      try {
        const announcement = service.edit(request.authAccount!, request.params.id, parseBody(request.body));
        writeAudit(request, "announcements.edit", "succeeded", {
          actorAccountId: request.authAccount!.id,
          announcementId: announcement.id,
        });
        return { announcement: announcementDto(announcement) };
      } catch (error: unknown) {
        return mapError(error, reply);
      }
    },
  );

  for (const action of ["publish", "unpublish"] as const) {
    app.post<{ Params: IdParameters }>(
      `/api/announcements/:id/${action}`,
      { preHandler: app.authenticate, schema: { params: idParametersSchema } },
      async (request, reply) => {
        if (!requireOwnerRequest(request, reply)) return;
        try {
          const announcement = service[action](request.authAccount!, request.params.id);
          writeAudit(request, `announcements.${action}`, "succeeded", {
            actorAccountId: request.authAccount!.id,
            announcementId: announcement.id,
          });
          return { announcement: announcementDto(announcement) };
        } catch (error: unknown) {
          return mapError(error, reply);
        }
      },
    );
  }
}
