import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { WorkspaceError, type PageNote, type ReadingState } from "./model.js";
import type { WorkspaceService } from "./service.js";

const id = { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" } as const;
const revision = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 } as const;
const noteText = { body: { type: "string", minLength: 1, maxLength: 20_000 }, locator: { anyOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: 200 }] } } as const;
const params = { type: "object", additionalProperties: false, required: ["id"], properties: { id } } as const;
const pageProperties = { beforeId: id, limit: { type: "integer", minimum: 1, maximum: 100 } } as const;
function account(request: FastifyRequest): string {
  if (!request.authAccount) throw new Error("workspace requires authentication");
  return request.authAccount.id;
}
function result(reply: FastifyReply, work: () => unknown) {
  try { return work(); }
  catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
    return reply.code(error.code === "not_found" ? 404 : error.code === "invalid_input" ? 400 : 409).send({ error: error.code });
  }
}
type PageQuery = { beforeId?: string; limit?: number };
export async function registerWorkspaceHttp(app: FastifyInstance, service: WorkspaceService): Promise<void> {
  app.get("/api/workspace/collections", { preHandler: app.authenticate }, (request, reply) =>
    result(reply, () => ({ collections: service.collections(account(request)) })));
  app.post<{ Body: { name: string } }>("/api/workspace/collections", {
    preHandler: app.authenticate, schema: { body: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 120 } } } },
  }, (request, reply) => result(reply, () => ({ collection: service.createCollection(account(request), request.body.name) })));
  app.patch<{ Params: { id: string }; Body: { name: string; archived: boolean; revision: number } }>("/api/workspace/collections/:id", {
    preHandler: app.authenticate, schema: { params, body: { type: "object", additionalProperties: false, required: ["name", "archived", "revision"], properties: {
      name: { type: "string", minLength: 1, maxLength: 120 }, archived: { type: "boolean" }, revision,
    } } },
  }, (request, reply) => result(reply, () => ({ collection: service.updateCollection(account(request), request.params.id, request.body) })));
  app.get<{ Params: { id: string }; Querystring: PageQuery }>("/api/workspace/collections/:id/items", {
    preHandler: app.authenticate, schema: { params, querystring: { type: "object", additionalProperties: false, properties: pageProperties } },
  }, (request, reply) => result(reply, () => service.collectionItems(account(request), request.params.id, request.query.beforeId, request.query.limit)));
  app.put<{ Params: { id: string; resourceId: string }; Body: { included: boolean; revision: number } }>("/api/workspace/collections/:id/items/:resourceId", {
    preHandler: app.authenticate, schema: {
      params: { type: "object", additionalProperties: false, required: ["id", "resourceId"], properties: { id, resourceId: id } },
      body: { type: "object", additionalProperties: false, required: ["included", "revision"], properties: { included: { type: "boolean" }, revision } },
    },
  }, (request, reply) => result(reply, () => {
    return { collection: service.setCollectionItem(account(request), request.params.id, request.params.resourceId, request.body.included, request.body.revision) };
  }));
  app.get<{ Params: { id: string } }>("/api/workspace/resources/:id", { preHandler: app.authenticate, schema: { params } },
    (request, reply) => result(reply, () => service.resource(account(request), request.params.id)));
  app.put<{ Params: { id: string }; Body: Pick<ReadingState, "status" | "important" | "toCite" | "revision"> }>("/api/workspace/resources/:id/reading", {
    preHandler: app.authenticate, schema: { params, body: { type: "object", additionalProperties: false, required: ["status", "important", "toCite", "revision"], properties: {
      status: { enum: [null, "queued", "reading", "finished"] }, important: { type: "boolean" }, toCite: { type: "boolean" }, revision,
    } } },
  }, (request, reply) => result(reply, () => ({ reading: service.saveReading(account(request), request.params.id, request.body) })));
  app.get<{ Querystring: PageQuery }>("/api/workspace/reading", {
    preHandler: app.authenticate, schema: { querystring: { type: "object", additionalProperties: false, properties: pageProperties } },
  }, (request, reply) => result(reply, () => service.reading(account(request), request.query.beforeId, request.query.limit)));
  app.get<{ Querystring: PageQuery & { resourceId?: string; deleted?: boolean } }>("/api/workspace/notes", {
    preHandler: app.authenticate, schema: { querystring: { type: "object", additionalProperties: false, properties: { ...pageProperties, resourceId: id, deleted: { type: "boolean" } } } },
  }, (request, reply) => result(reply, () => service.notes(account(request), request.query)));
  app.post<{ Body: Pick<PageNote, "resourceId" | "sourceId" | "physicalPage" | "locator" | "body"> }>("/api/workspace/notes", {
    preHandler: app.authenticate, bodyLimit: 96 * 1024, schema: { body: { type: "object", additionalProperties: false, required: ["resourceId", "sourceId", "physicalPage", "locator", "body"], properties: {
      resourceId: id, sourceId: id, physicalPage: { type: "integer", minimum: 1, maximum: 1_000_000 }, ...noteText,
    } } },
  }, (request, reply) => result(reply, () => ({ note: service.createNote(account(request), request.body) })));
  app.patch<{ Params: { id: string }; Body: Pick<PageNote, "body" | "locator" | "revision"> & { deleted: boolean } }>("/api/workspace/notes/:id", {
    preHandler: app.authenticate, bodyLimit: 96 * 1024, schema: { params, body: { type: "object", additionalProperties: false, required: ["body", "locator", "revision", "deleted"], properties: {
      ...noteText, revision, deleted: { type: "boolean" },
    } } },
  }, (request, reply) => result(reply, () => ({ note: service.updateNote(account(request), request.params.id, request.body) })));
  app.get<{ Params: { id: string } }>("/api/workspace/notes/:id", { preHandler: app.authenticate, schema: { params } },
    (request, reply) => result(reply, () => service.note(account(request), request.params.id)));
  app.get("/api/workspace/export", { preHandler: app.authenticate }, (request, reply) => {
    reply.header("content-type", "application/x-ndjson; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="academiccloud-personal-workspace.ndjson"');
    return reply.send(Readable.from(service.exportLines(account(request))));
  });
}
