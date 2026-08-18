import type { Persistence } from "../persistence/contracts.js";
import type { StorageAdapter, StorageObjectMetadata } from "../storage/storage-adapter.js";
import {
  DriveError,
  DriveService,
  storageMetadataMatches,
} from "../drive/drive-service.js";
import type { StoredFile } from "../drive/file.js";
import { multipartUploadVersion } from "../transfer/multipart-transfer.js";

const MIN_PENDING_AGE_MILLISECONDS = 60 * 60 * 1_000;
const MIN_PURGING_AGE_MILLISECONDS = 60 * 1_000;

export interface ReliabilityMaintenanceOptions {
  apply?: boolean;
  limit?: number;
  pendingAgeMilliseconds?: number;
  purgingAgeMilliseconds?: number;
}

export type ReliabilityMaintenanceOutcome =
  | "would_activate"
  | "activated"
  | "would_remove_missing_pending"
  | "removed_missing_pending"
  | "multipart_resumable"
  | "would_abort_stale_multipart"
  | "aborted_stale_multipart"
  | "would_finish_purge"
  | "purged"
  | "ambiguous_metadata"
  | "provider_mismatch"
  | "storage_unavailable"
  | "changed";

export interface ReliabilityMaintenanceResult {
  mode: "dry_run" | "apply";
  limit: number;
  expiredSessions: { selected: number; pruned: number };
  files: Array<{
    fileId: string;
    state: "pending_upload" | "purging";
    outcome: ReliabilityMaintenanceOutcome;
  }>;
}

export class ReliabilityMaintenance {
  readonly #driveService: DriveService;

  constructor(
    private readonly persistence: Persistence,
    private readonly storage: StorageAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#driveService = new DriveService(persistence, storage, now);
  }

  async run(options: ReliabilityMaintenanceOptions = {}): Promise<ReliabilityMaintenanceResult> {
    const apply = options.apply ?? false;
    const limit = options.limit ?? 100;
    const pendingAge = options.pendingAgeMilliseconds ?? 24 * 60 * 60 * 1_000;
    const purgingAge = options.purgingAgeMilliseconds ?? 15 * 60 * 1_000;
    assertLimit(limit);
    assertAge("pending age", pendingAge, MIN_PENDING_AGE_MILLISECONDS);
    assertAge("purging age", purgingAge, MIN_PURGING_AGE_MILLISECONDS);

    const now = this.now();
    const sessionCount = this.persistence.repositories.sessions.countExpired(now, limit);
    const pending = this.persistence.repositories.files.listStale(
      "pending_upload",
      new Date(now.getTime() - pendingAge),
      limit,
    );
    const purging = this.persistence.repositories.files.listStale(
      "purging",
      new Date(now.getTime() - purgingAge),
      limit,
    );
    const files: ReliabilityMaintenanceResult["files"] = [];
    const staleMultipart = this.persistence.repositories.multipartUploads?.listStale(now, limit) ?? [];

    for (const file of pending) {
      const transfer = this.persistence.repositories.multipartUploads?.findByFileId(file.ownerId, file.id) ?? null;
      if (transfer) {
        const isStale = staleMultipart.some((item) => item.fileId === transfer.fileId && item.ownerId === transfer.ownerId);
        if (!isStale) {
          files.push({ fileId: file.id, state: "pending_upload", outcome: "multipart_resumable" });
          continue;
        }
        if (!apply) {
          files.push({ fileId: file.id, state: "pending_upload", outcome: "would_abort_stale_multipart" });
          continue;
        }
        try {
          await this.#driveService.abandonUpload(
            file.ownerId,
            file.id,
            multipartUploadVersion(transfer),
            "system",
          );
          files.push({ fileId: file.id, state: "pending_upload", outcome: "aborted_stale_multipart" });
        } catch (error: unknown) {
          files.push({ fileId: file.id, state: "pending_upload", outcome: maintenanceErrorOutcome(error) });
        }
        continue;
      }
      files.push({
        fileId: file.id,
        state: "pending_upload",
        outcome: await this.#reconcilePending(file, apply),
      });
    }

    for (const file of purging) {
      files.push({
        fileId: file.id,
        state: "purging",
        outcome: await this.#reconcilePurging(file, apply),
      });
    }

    return {
      mode: apply ? "apply" : "dry_run",
      limit,
      expiredSessions: {
        selected: sessionCount,
        pruned: apply ? this.persistence.repositories.sessions.pruneExpired(now, limit) : 0,
      },
      files,
    };
  }

  async #reconcilePending(
    file: StoredFile,
    apply: boolean,
  ): Promise<ReliabilityMaintenanceOutcome> {
    const metadata = await this.#safeStat(file);

    if (metadata === "provider_mismatch" || metadata === "storage_unavailable") return metadata;

    if (metadata === null) {
      if (!apply) return "would_remove_missing_pending";
      return this.persistence.repositories.files.deletePending(file.ownerId, file.id, file.revision)
        ? "removed_missing_pending"
        : "changed";
    }

    if (!storageMetadataMatches(file, metadata)) return "ambiguous_metadata";
    if (!apply) return "would_activate";

    try {
      await this.#driveService.completeUpload(file.ownerId, file.id, "system");
      return "activated";
    } catch (error: unknown) {
      return maintenanceErrorOutcome(error);
    }
  }

  async #reconcilePurging(
    file: StoredFile,
    apply: boolean,
  ): Promise<ReliabilityMaintenanceOutcome> {
    const metadata = await this.#safeStat(file);

    if (metadata === "provider_mismatch" || metadata === "storage_unavailable") return metadata;
    if (metadata !== null && !storageMetadataMatches(file, metadata)) return "ambiguous_metadata";
    if (!apply) return "would_finish_purge";

    try {
      await this.#driveService.permanentlyDeleteFile(file.ownerId, file.id, "system");
      return "purged";
    } catch (error: unknown) {
      return maintenanceErrorOutcome(error);
    }
  }

  async #safeStat(
    file: StoredFile,
  ): Promise<StorageObjectMetadata | null | "provider_mismatch" | "storage_unavailable"> {
    if (file.storageProvider !== this.storage.provider) return "provider_mismatch";

    try {
      return await this.storage.statObject(file.objectKey);
    } catch {
      return "storage_unavailable";
    }
  }
}

function maintenanceErrorOutcome(error: unknown): ReliabilityMaintenanceOutcome {
  if (!(error instanceof DriveError)) return "storage_unavailable";
  if (error.code === "storage_unavailable") return "storage_unavailable";
  if (error.code === "upload_metadata_mismatch") return "ambiguous_metadata";
  return "changed";
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new RangeError("maintenance limit must be an integer from 1 to 1000");
  }
}

function assertAge(name: string, value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer of at least ${minimum} milliseconds`);
  }
}
