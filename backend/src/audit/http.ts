import type { FastifyInstance, FastifyReply } from "fastify";

import { AuthorizationDeniedError } from "../auth/authorization.js";
import type { AuditEvent } from "./audit-event.js";
import { AuditService } from "./audit-service.js";

interface AuditQuery {
  beforeId?: number;
  limit?: number;
}

function auditDto(event: AuditEvent) {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    action: event.action,
    outcome: event.outcome,
    actorKind: event.actorKind,
    actorAccountId: event.actorAccountId,
    targetKind: event.targetType,
    targetId: event.targetId,
    reason: event.reason,
  };
}

function mapAuditError(error: unknown, reply: FastifyReply) {
  if (error instanceof AuthorizationDeniedError) return reply.code(403).send({ error: "forbidden" });
  if (error instanceof TypeError || error instanceof RangeError) {
    return reply.code(400).send({ error: "invalid_request" });
  }
  throw error;
}

export async function registerAuditHttp(app: FastifyInstance, service: AuditService): Promise<void> {
  app.get<{ Querystring: AuditQuery }>(
    "/api/audit/events",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            beforeId: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const page = service.list(
          request.authAccount!,
          request.query.beforeId ?? null,
          request.query.limit,
        );
        return {
          events: page.events.map(auditDto),
          nextBeforeId: page.nextBeforeId,
          retentionPolicy: page.retentionPolicy,
        };
      } catch (error: unknown) {
        return mapAuditError(error, reply);
      }
    },
  );
}
