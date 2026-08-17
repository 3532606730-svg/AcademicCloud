import { randomUUID } from "node:crypto";

import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { StoredFile } from "../drive/file.js";
import type {
  ScholarlyArtifact,
  ScholarlyArtifactVersion,
  ScholarlyRecord,
} from "./record.js";

export type ResearchErrorCode = "not_found" | "conflict" | "invalid_state" | "concurrent_change" | "invalid_input";

export class ResearchError extends Error {
  constructor(readonly code: ResearchErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "ResearchError";
  }
}

export interface ScholarlyRecordView {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
  artifacts: ScholarlyArtifactView[];
  nextBeforeArtifactId: string | null;
}

export interface ScholarlyRecordSummary {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
}

export interface ScholarlyRecordPage {
  records: ScholarlyRecordSummary[];
  nextBeforeId: string | null;
}

export interface ScholarlyArtifactView {
  id: string;
  recordId: string;
  attachmentState: ScholarlyArtifact["attachmentState"];
  createdAt: string;
  updatedAt: string;
  version: {
    id: string;
    createdAt: string;
    updatedAt: string;
    file: ScholarlyFileView | null;
  } | null;
}

export interface ScholarlyFileView {
  id: string;
  displayName: string;
  state: StoredFile["state"];
  availability: "available" | "unavailable" | "tombstoned";
}

function validateLabel(label: string): string {
  const normalized = label.normalize("NFC").trim();
  if (
    normalized.length < 1
    || normalized.length > 255
    || /[\x00-\x1f\x7f]/.test(normalized)
  ) {
    throw new ResearchError("invalid_input");
  }
  return normalized;
}

function viewFile(file: StoredFile | null, version: ScholarlyArtifactVersion): ScholarlyFileView | null {
  if (!file) {
    return {
      id: version.storedFileId,
      displayName: "",
      state: "purged",
      availability: "tombstoned",
    };
  }

  return {
    id: file.id,
    displayName: file.displayName,
    state: file.state,
    availability: file.state === "active"
      ? "available"
      : file.state === "purged"
        ? "tombstoned"
        : "unavailable",
  };
}

const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;

function pageLimit(limit: number | undefined): number {
  const resolved = limit ?? DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_PAGE_LIMIT) {
    throw new ResearchError("invalid_input");
  }
  return resolved;
}

function recordSummary(record: ScholarlyRecord, artifactCount: number): ScholarlyRecordSummary {
  return {
    id: record.id,
    label: record.label,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    artifactCount,
  };
}

function recordView(
  repositories: RepositorySet,
  ownerId: string,
  record: ScholarlyRecord,
  beforeArtifactId: string | null = null,
  limit = DEFAULT_PAGE_LIMIT,
): ScholarlyRecordView {
  const research = repositories.research;
  if (!research) throw new ResearchError("invalid_state");

  if (beforeArtifactId && !research.findArtifact(ownerId, record.id, beforeArtifactId)) {
    throw new ResearchError("not_found");
  }
  const artifacts = research.listArtifacts(ownerId, record.id, beforeArtifactId, limit + 1);
  const hasMore = artifacts.length > limit;
  const page = hasMore ? artifacts.slice(0, limit) : artifacts;

  return {
    ...recordSummary(record, research.countArtifacts(ownerId, record.id)),
    artifacts: page.map((artifact) => {
      const version = research.findVersion(ownerId, artifact.id);
      return {
        id: artifact.id,
        recordId: artifact.recordId,
        attachmentState: artifact.attachmentState,
        createdAt: artifact.createdAt.toISOString(),
        updatedAt: artifact.updatedAt.toISOString(),
        version: version
          ? {
              id: version.id,
              createdAt: version.createdAt.toISOString(),
              updatedAt: version.updatedAt.toISOString(),
              file: viewFile(
                repositories.files.findById(ownerId, version.storedFileId),
                version,
              ),
            }
          : null,
      };
    }),
    nextBeforeArtifactId: hasMore ? page.at(-1)!.id : null,
  };
}

function requireResearch(repositories: RepositorySet) {
  if (!repositories.research) throw new ResearchError("invalid_state");
  return repositories.research;
}

export class ScholarlyRecordService {
  readonly #persistence: Persistence;
  readonly #now: () => Date;

  constructor(persistence: Persistence, now: () => Date = () => new Date()) {
    this.#persistence = persistence;
    this.#now = now;
  }

  listRecords(ownerId: string, beforeId: string | null = null, limit?: number): ScholarlyRecordPage {
    const repositories = this.#persistence.repositories;
    const research = requireResearch(repositories);
    const resolvedLimit = pageLimit(limit);
    if (beforeId && !research.findRecord(ownerId, beforeId)) throw new ResearchError("not_found");
    const entries = research.listRecords(ownerId, beforeId, resolvedLimit + 1);
    const hasMore = entries.length > resolvedLimit;
    const page = hasMore ? entries.slice(0, resolvedLimit) : entries;
    return {
      records: page.map(({ record, artifactCount }) => recordSummary(record, artifactCount)),
      nextBeforeId: hasMore ? page.at(-1)!.record.id : null,
    };
  }

  getRecord(
    ownerId: string,
    recordId: string,
    beforeArtifactId: string | null = null,
    limit?: number,
  ): ScholarlyRecordView {
    const repositories = this.#persistence.repositories;
    const record = requireResearch(repositories).findRecord(ownerId, recordId);
    if (!record) throw new ResearchError("not_found");
    return recordView(repositories, ownerId, record, beforeArtifactId, pageLimit(limit));
  }

  createRecord(ownerId: string, label: string): ScholarlyRecordView {
    const normalized = validateLabel(label);
    return this.#persistence.runInTransaction((repositories) => {
      const research = requireResearch(repositories);
      const now = this.#now();
      const record = research.createRecord({
        id: randomUUID(),
        ownerId,
        label: normalized,
        createdAt: now,
        updatedAt: now,
      });
      return recordView(repositories, ownerId, record);
    });
  }

  attachFile(ownerId: string, recordId: string, fileId: string): ScholarlyRecordView {
    try {
      return this.#persistence.runInTransaction((repositories) => {
        const research = requireResearch(repositories);
        const record = research.findRecord(ownerId, recordId);
        if (!record) throw new ResearchError("not_found");
        const file = repositories.files.findById(ownerId, fileId);
        if (!file) throw new ResearchError("not_found");
        if (file.state !== "active") throw new ResearchError("invalid_state");

        const existing = research.findArtifactByStoredFile(ownerId, fileId);
        if (existing) {
          if (existing.recordId !== record.id) throw new ResearchError("conflict");
          if (existing.attachmentState === "detached") {
            const restored = research.updateArtifactState(
              ownerId,
              record.id,
              existing.id,
              "detached",
              "attached",
              this.#now(),
            );
            if (!restored) throw new ResearchError("concurrent_change");
          }
          return recordView(repositories, ownerId, record);
        }

        const now = this.#now();
        const artifact = research.createArtifact({
          id: randomUUID(),
          ownerId,
          recordId: record.id,
          attachmentState: "detached",
          createdAt: now,
          updatedAt: now,
        });
        research.createVersion({
          id: randomUUID(),
          ownerId,
          artifactId: artifact.id,
          storedFileId: file.id,
          createdAt: now,
          updatedAt: now,
        });
        if (!research.updateArtifactState(ownerId, record.id, artifact.id, "detached", "attached", now)) {
          throw new ResearchError("concurrent_change");
        }
        return recordView(repositories, ownerId, record);
      });
    } catch (error: unknown) {
      if (error instanceof ResearchError) throw error;
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        throw new ResearchError("conflict", { cause: error });
      }
      throw error;
    }
  }

  detachArtifact(ownerId: string, recordId: string, artifactId: string): ScholarlyRecordView {
    return this.#persistence.runInTransaction((repositories) => {
      const research = requireResearch(repositories);
      const record = research.findRecord(ownerId, recordId);
      if (!record) throw new ResearchError("not_found");
      const artifact = research.findArtifact(ownerId, record.id, artifactId);
      if (!artifact) throw new ResearchError("not_found");
      if (artifact.attachmentState === "attached") {
        const detached = research.updateArtifactState(
          ownerId,
          record.id,
          artifact.id,
          "attached",
          "detached",
          this.#now(),
        );
        if (!detached) throw new ResearchError("concurrent_change");
      }
      return recordView(repositories, ownerId, record);
    });
  }
}
