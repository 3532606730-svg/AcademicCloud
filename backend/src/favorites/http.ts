import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { fileDto, folderDto } from "../drive/http.js";
import { FavoriteError } from "./favorite.js";
import type { FavoriteService } from "./favorite-service.js";

interface ResourceParams {
  id: string;
}

function requireAccountId(account: { id: string } | null): string {
  if (!account) {
    throw new Error("authenticated account missing on favorites route");
  }
  return account.id;
}

function sendFavoriteError(reply: FastifyReply, error: unknown) {
  if (error instanceof FavoriteError) {
    return reply.code(error.code === "not_found" ? 404 : 409).send({ error: error.code });
  }
  throw error;
}

export async function registerFavoritesHttp(app: FastifyInstance, favoriteService: FavoriteService): Promise<void> {
  app.get("/api/favorites", {
    preHandler: app.authenticate,
  }, async (request) => {
    const snapshot = favoriteService.listFavorites(requireAccountId(request.authAccount));
    return {
      files: snapshot.files.map(fileDto),
      libraryHoldings: snapshot.libraryHoldings.map(({ library, role, view }) => ({
        library: {
          id: library.id,
          name: library.name,
          role,
          isDefault: library.isDefault,
          createdAt: library.createdAt.toISOString(),
        },
        holding: view,
      })),
      folders: snapshot.folders.map((entry) => ({
        ...folderDto(entry.folder),
        ancestors: entry.ancestors.map(folderDto),
      })),
    };
  });

  // Bodyless, idempotent writes. account_id comes ONLY from the authenticated
  // session; the global origin guard covers these unsafe methods.
  app.put<{ Params: ResourceParams }>("/api/favorites/files/:id", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest<{ Params: ResourceParams }>, reply) => {
    try {
      favoriteService.setFileFavorite(requireAccountId(request.authAccount), request.params.id, true);
      return reply.code(204).send();
    } catch (error: unknown) {
      return sendFavoriteError(reply, error);
    }
  });

  app.delete<{ Params: ResourceParams }>("/api/favorites/files/:id", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest<{ Params: ResourceParams }>, reply) => {
    try {
      favoriteService.setFileFavorite(requireAccountId(request.authAccount), request.params.id, false);
      return reply.code(204).send();
    } catch (error: unknown) {
      return sendFavoriteError(reply, error);
    }
  });

  app.put<{ Params: ResourceParams }>("/api/favorites/folders/:id", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest<{ Params: ResourceParams }>, reply) => {
    try {
      favoriteService.setFolderFavorite(requireAccountId(request.authAccount), request.params.id, true);
      return reply.code(204).send();
    } catch (error: unknown) {
      return sendFavoriteError(reply, error);
    }
  });

  app.delete<{ Params: ResourceParams }>("/api/favorites/folders/:id", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest<{ Params: ResourceParams }>, reply) => {
    try {
      favoriteService.setFolderFavorite(requireAccountId(request.authAccount), request.params.id, false);
      return reply.code(204).send();
    } catch (error: unknown) {
      return sendFavoriteError(reply, error);
    }
  });
}
