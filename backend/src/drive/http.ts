import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";

import { DriveError, type DriveService } from "./drive-service.js";
import type { StoredFile } from "./file.js";
import type { Folder } from "./folder.js";
import {
  driveEntryVersion,
  MAX_BULK_ITEMS,
  type BulkOperationInput,
} from "./bulk.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const nullableIdSchema = { anyOf: [idSchema, { type: "null" }] } as const;
const nameSchema = { type: "string", minLength: 1, maxLength: 255 } as const;
const versionSchema = { type: "string", pattern: "^[A-Za-z0-9_-]{43}$", minLength: 43, maxLength: 43 } as const;

const LIFECYCLE_AUDIT_EVENTS = new Map([
  ["DELETE /api/drive/folders/:folderId", "drive.folder_soft_delete"],
  ["POST /api/drive/folders/:folderId/restore", "drive.folder_restore"],
  ["POST /api/drive/uploads/:fileId/complete", "drive.upload_complete"],
  ["DELETE /api/drive/files/:fileId", "drive.file_soft_delete"],
  ["POST /api/drive/files/:fileId/restore", "drive.file_restore"],
  ["DELETE /api/drive/files/:fileId/permanent", "drive.file_permanent_delete"],
]);

interface FolderBody {
  name: string;
  parentId?: string | null;
}

interface FolderPatchBody {
  name?: string;
  parentId?: string | null;
}

interface FilePatchBody {
  displayName?: string;
  folderId?: string | null;
}

interface PermanentDeleteBody {
  version: string;
}

interface UploadBody {
  folderId?: string | null;
  displayName: string;
  mediaType: string;
  sizeBytes: number;
  checksum: { algorithm: "md5"; value: string };
}

interface IdParams {
  folderId: string;
}

interface FileIdParams {
  fileId: string;
}

interface EntriesQuery {
  folderId?: string;
}

interface DownloadQuery {
  disposition?: "attachment" | "inline";
}

function requireOwnerId(account: { id: string } | null): string {
  if (!account) {
    throw new DriveError("not_found");
  }

  return account.id;
}

function requireGlobalOwner(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new DriveError("not_found");
  try {
    return requireOwner(account);
  } catch (error: unknown) {
    if (error instanceof AuthorizationDeniedError) throw new DriveError("not_found", { cause: error });
    throw error;
  }
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    await reply.code(415).send({ error: "unsupported_media_type" });
  }
}

export function folderDto(folder: Folder) {
  return {
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    state: folder.state,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
    deletedAt: folder.deletedAt?.toISOString() ?? null,
    version: driveEntryVersion(folder),
  };
}

export function fileDto(file: StoredFile) {
  return {
    id: file.id,
    folderId: file.folderId,
    displayName: file.displayName,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
    checksumAlgorithm: file.checksumAlgorithm,
    checksum: file.checksum,
    state: file.state,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    activatedAt: file.activatedAt?.toISOString() ?? null,
    deletedAt: file.deletedAt?.toISOString() ?? null,
    purgedAt: file.purgedAt?.toISOString() ?? null,
    version: driveEntryVersion(file),
  };
}

function sendDriveError(reply: FastifyReply, error: unknown) {
  if (error instanceof TypeError || error instanceof RangeError) {
    return reply.code(400).send({ error: "invalid_request" });
  }

  if (!(error instanceof DriveError)) {
    throw error;
  }

  const status = error.code === "not_found"
    ? 404
    : error.code === "storage_unavailable" || error.code === "preview_unavailable" || error.code === "preview_too_large"
      ? 503
      : 409;

  return reply.code(status).send({ error: error.code });
}

function requireActor(account: AuthenticatedAccount | null): AuthenticatedAccount {
  if (!account) throw new DriveError("not_found");
  return account;
}

function recordDriveAttempt(
  request: FastifyRequest,
  service: DriveService,
  action: Parameters<DriveService["recordAuditAttempt"]>[1],
  error: unknown,
): void {
  const actor = request.authAccount?.id;
  if (actor) service.recordAuditAttempt(actor, action, error);
}

export async function registerDriveHttp(
  app: FastifyInstance,
  driveService: DriveService,
  completeUpload: (actor: AuthenticatedAccount, fileId: string) => Promise<StoredFile> =
    (actor, fileId) => driveService.completeUpload(actor.id, fileId),
): Promise<void> {
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url;
    const accountId = request.authAccount?.id;

    if (!route?.startsWith("/api/drive") || !accountId) return;

    if (reply.statusCode === 404) {
      request.log.warn(
        {
          audit: {
            event: "drive.owner_scope_check",
            outcome: "not_found",
            accountId,
            method: request.method,
            route,
          },
        },
        "drive audit event",
      );
    }

    const event = LIFECYCLE_AUDIT_EVENTS.get(`${request.method} ${route}`);

    if (event) {
      const outcome = reply.statusCode < 400
        ? "succeeded"
        : reply.statusCode < 500
          ? "denied"
          : "failed";
      const details = { audit: { event, outcome, accountId } };
      if (outcome === "succeeded") request.log.info(details, "drive audit event");
      else request.log.warn(details, "drive audit event");
    }
  });

  app.post<{ Body: FolderBody }>(
    "/api/drive/folders",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: { name: nameSchema, parentId: nullableIdSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        const folder = driveService.createFolder(
          requireOwnerId(request.authAccount),
          request.body.name,
          request.body.parentId ?? null,
        );
        return reply.code(201).send({ folder: folderDto(folder) });
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.get<{ Querystring: EntriesQuery }>(
    "/api/drive/entries",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { folderId: idSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        const entries = driveService.listEntries(
          requireOwnerId(request.authAccount),
          request.query.folderId ?? null,
        );
        return {
          folder: entries.folder && folderDto(entries.folder),
          folders: entries.folders.map(folderDto),
          files: entries.files.map(fileDto),
        };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.patch<{ Params: IdParams; Body: FolderPatchBody }>(
    "/api/drive/folders/:folderId",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      schema: {
        params: { type: "object", required: ["folderId"], properties: { folderId: idSchema } },
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: { name: nameSchema, parentId: nullableIdSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        const folder = driveService.updateFolder(
          requireOwnerId(request.authAccount),
          request.params.folderId,
          request.body,
        );
        return { folder: folderDto(folder) };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.delete<{ Params: IdParams }>(
    "/api/drive/folders/:folderId",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["folderId"], properties: { folderId: idSchema } } } },
    async (request, reply) => {
      try {
        driveService.deleteFolder(requireOwnerId(request.authAccount), request.params.folderId);
        return reply.code(204).send();
      } catch (error: unknown) {
        recordDriveAttempt(request, driveService, "drive.folder_recycle", error);
        return sendDriveError(reply, error);
      }
    },
  );

  app.post<{ Params: IdParams }>(
    "/api/drive/folders/:folderId/restore",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["folderId"], properties: { folderId: idSchema } } } },
    async (request, reply) => {
      try {
        return { folder: folderDto(driveService.restoreFolder(requireOwnerId(request.authAccount), request.params.folderId)) };
      } catch (error: unknown) {
        recordDriveAttempt(request, driveService, "drive.folder_restore", error);
        return sendDriveError(reply, error);
      }
    },
  );

  app.post<{ Body: UploadBody }>(
    "/api/drive/uploads",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 16 * 1024,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["displayName", "mediaType", "sizeBytes", "checksum"],
          properties: {
            folderId: nullableIdSchema,
            displayName: nameSchema,
            mediaType: { type: "string", minLength: 3, maxLength: 255 },
            sizeBytes: { type: "integer", minimum: 1, maximum: 5 * 1024 * 1024 * 1024 },
            checksum: {
              type: "object",
              additionalProperties: false,
              required: ["algorithm", "value"],
              properties: {
                algorithm: { const: "md5" },
                value: { type: "string", pattern: "^[A-Za-z0-9+/]{22}==$" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await driveService.createUpload(requireOwnerId(request.authAccount), {
          ...request.body,
          folderId: request.body.folderId ?? null,
        });
        return reply.code(201).send({ file: fileDto(result.file), upload: result.upload });
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.post<{ Params: FileIdParams }>(
    "/api/drive/uploads/:fileId/authorization",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } } } },
    async (request, reply) => {
      try {
        return { upload: await driveService.renewUploadAuthorization(requireOwnerId(request.authAccount), request.params.fileId) };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.get<{ Querystring: EntriesQuery }>(
    "/api/drive/uploads",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { folderId: idSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          files: driveService
            .listPendingUploads(requireOwnerId(request.authAccount), request.query.folderId ?? null)
            .map(fileDto),
        };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.post<{ Params: FileIdParams }>(
    "/api/drive/uploads/:fileId/complete",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } } } },
    async (request, reply) => {
      try {
        return { file: fileDto(await completeUpload(requireActor(request.authAccount), request.params.fileId)) };
      } catch (error: unknown) {
        recordDriveAttempt(request, driveService, "drive.upload_activate", error);
        return sendDriveError(reply, error);
      }
    },
  );

  app.get<{ Params: FileIdParams; Querystring: DownloadQuery }>(
    "/api/drive/files/:fileId/download",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } },
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
          download: await driveService.createDownload(
            requireOwnerId(request.authAccount),
            request.params.fileId,
            request.query.disposition ?? "attachment",
          ),
        };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.patch<{ Params: FileIdParams; Body: FilePatchBody }>(
    "/api/drive/files/:fileId",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      schema: {
        params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } },
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: { displayName: nameSchema, folderId: nullableIdSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        return { file: fileDto(driveService.updateFile(requireOwnerId(request.authAccount), request.params.fileId, request.body)) };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.delete<{ Params: FileIdParams }>(
    "/api/drive/files/:fileId",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } } } },
    async (request, reply) => {
      try {
        driveService.deleteFile(requireOwnerId(request.authAccount), request.params.fileId);
        return reply.code(204).send();
      } catch (error: unknown) {
        recordDriveAttempt(request, driveService, "drive.file_recycle", error);
        return sendDriveError(reply, error);
      }
    },
  );

  app.delete<{ Params: IdParams; Body: PermanentDeleteBody }>(
    "/api/drive/folders/:folderId/permanent",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      schema: {
        params: { type: "object", required: ["folderId"], properties: { folderId: idSchema } },
        querystring: { type: "object", additionalProperties: false, properties: {} },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["version"],
          properties: { version: versionSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        const actor = requireGlobalOwner(request.authAccount);
        await driveService.permanentlyDeleteFolder(
          actor.id,
          request.params.folderId,
          request.body.version,
        );
        return reply.code(204).send();
      } catch (error: unknown) {
        recordDriveAttempt(request, driveService, "drive.file_purge_request", error);
        return sendDriveError(reply, error);
      }
    },
  );

  app.post<{ Params: FileIdParams }>(
    "/api/drive/files/:fileId/restore",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } } } },
    async (request, reply) => {
      try {
        return { file: fileDto(await driveService.restoreFile(requireOwnerId(request.authAccount), request.params.fileId)) };
      } catch (error: unknown) {
        recordDriveAttempt(request, driveService, "drive.file_restore", error);
        return sendDriveError(reply, error);
      }
    },
  );

  app.get(
    "/api/drive/recycle",
    { preHandler: app.authenticate },
    async (request) => {
      const recycle = driveService.listRecycle(requireOwnerId(request.authAccount));
      return { folders: recycle.folders.map(folderDto), files: recycle.files.map(fileDto) };
    },
  );

  app.post<{ Body: BulkOperationInput }>(
    "/api/drive/bulk",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      bodyLimit: 32 * 1024,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["action", "items"],
          properties: {
            action: { enum: ["move", "recycle", "restore", "favorite_add", "favorite_remove"] },
            items: {
              type: "array",
              minItems: 1,
              maxItems: MAX_BULK_ITEMS,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["kind", "id", "version"],
                properties: {
                  kind: { enum: ["folder", "file"] },
                  id: idSchema,
                  version: versionSchema,
                },
              },
            },
            destinationFolderId: nullableIdSchema,
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await driveService.bulkOperation(requireOwnerId(request.authAccount), request.body);
      } catch (error: unknown) {
        if (request.body.action === "recycle" || request.body.action === "restore") {
          const eventKinds = new Set<Parameters<DriveService["recordAuditAttempt"]>[1]>();
          for (const item of request.body.items) {
            if (item.kind === "folder") {
              eventKinds.add(request.body.action === "recycle" ? "drive.folder_recycle" : "drive.folder_restore");
            } else {
              eventKinds.add(request.body.action === "recycle" ? "drive.file_recycle" : "drive.file_restore");
            }
          }
          for (const action of eventKinds) recordDriveAttempt(request, driveService, action, error);
        }
        return sendDriveError(reply, error);
      }
    },
  );

  app.delete<{ Params: FileIdParams; Body: PermanentDeleteBody }>(
    "/api/drive/files/:fileId/permanent",
    {
      preHandler: app.authenticate,
      preValidation: requireJson,
      schema: {
        params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } },
        querystring: { type: "object", additionalProperties: false, properties: {} },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["version"],
          properties: { version: versionSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        const actor = requireGlobalOwner(request.authAccount);
        const current = driveService.listRecycle(actor.id).files.find((file) => file.id === request.params.fileId);
        if (!current || driveEntryVersion(current) !== request.body.version) {
          throw new DriveError(current ? "concurrent_change" : "not_found");
        }
        await driveService.permanentlyDeleteFile(actor.id, request.params.fileId);
        return reply.code(204).send();
      } catch (error: unknown) {
        const action = error instanceof DriveError && ["storage_unavailable", "upload_metadata_mismatch"].includes(error.code)
          ? "drive.file_purge_complete"
          : "drive.file_purge_request";
        recordDriveAttempt(request, driveService, action, error);
        return sendDriveError(reply, error);
      }
    },
  );
}
