import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { DriveError, type DriveService } from "./drive-service.js";
import type { StoredFile } from "./file.js";
import type { Folder } from "./folder.js";

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const idSchema = { type: "string", pattern: ID_PATTERN, minLength: 1, maxLength: 128 } as const;
const nullableIdSchema = { anyOf: [idSchema, { type: "null" }] } as const;
const nameSchema = { type: "string", minLength: 1, maxLength: 255 } as const;

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

function requireOwnerId(account: { id: string } | null): string {
  if (!account) {
    throw new DriveError("not_found");
  }

  return account.id;
}

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    await reply.code(415).send({ error: "unsupported_media_type" });
  }
}

function folderDto(folder: Folder) {
  return {
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    state: folder.state,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
    deletedAt: folder.deletedAt?.toISOString() ?? null,
  };
}

function fileDto(file: StoredFile) {
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
    : error.code === "storage_unavailable"
      ? 503
      : 409;

  return reply.code(status).send({ error: error.code });
}

export async function registerDriveHttp(app: FastifyInstance, driveService: DriveService): Promise<void> {
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
        return { file: fileDto(await driveService.completeUpload(requireOwnerId(request.authAccount), request.params.fileId)) };
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );

  app.get<{ Params: FileIdParams }>(
    "/api/drive/files/:fileId/download",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } } } },
    async (request, reply) => {
      try {
        return { download: await driveService.createDownload(requireOwnerId(request.authAccount), request.params.fileId) };
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

  app.delete<{ Params: FileIdParams }>(
    "/api/drive/files/:fileId/permanent",
    { preHandler: app.authenticate, schema: { params: { type: "object", required: ["fileId"], properties: { fileId: idSchema } } } },
    async (request, reply) => {
      try {
        await driveService.permanentlyDeleteFile(requireOwnerId(request.authAccount), request.params.fileId);
        return reply.code(204).send();
      } catch (error: unknown) {
        return sendDriveError(reply, error);
      }
    },
  );
}
