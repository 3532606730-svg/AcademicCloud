import type {
  NewScholarlyArtifact,
  NewScholarlyArtifactVersion,
  NewScholarlyRecord,
  ScholarlyArtifact,
  ScholarlyArtifactVersion,
  ScholarlyAttachmentState,
  ScholarlyRecord,
} from "../../research/record.js";
import type { ScholarlyRecordListItem, ScholarlyRepository } from "../../research/repositories.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface RecordRow {
  id: string;
  owner_id: string;
  label: string;
  created_at: string;
  updated_at: string;
}

interface RecordListRow extends RecordRow {
  artifact_count: number;
}

interface ArtifactRow {
  id: string;
  owner_id: string;
  record_id: string;
  attachment_state: ScholarlyAttachmentState;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  owner_id: string;
  artifact_id: string;
  stored_file_id: string;
  created_at: string;
  updated_at: string;
}

interface RecordParameters {
  id: string;
  ownerId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactParameters {
  id: string;
  ownerId: string;
  recordId: string;
  attachmentState: ScholarlyAttachmentState;
  createdAt: string;
  updatedAt: string;
}

interface VersionParameters {
  id: string;
  ownerId: string;
  artifactId: string;
  storedFileId: string;
  createdAt: string;
  updatedAt: string;
}

interface RecordListParameters {
  ownerId: string;
  beforeId: string | null;
  limit: number;
}

interface ArtifactListParameters extends RecordListParameters {
  recordId: string;
}

function toRecord(row: RecordRow): ScholarlyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    label: row.label,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

function toArtifact(row: ArtifactRow): ScholarlyArtifact {
  return {
    id: row.id,
    ownerId: row.owner_id,
    recordId: row.record_id,
    attachmentState: row.attachment_state,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

function toVersion(row: VersionRow): ScholarlyArtifactVersion {
  return {
    id: row.id,
    ownerId: row.owner_id,
    artifactId: row.artifact_id,
    storedFileId: row.stored_file_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

const recordColumns = `
  scholarly_records.id, ownership_domains.account_id AS owner_id,
  scholarly_records.label, scholarly_records.created_at, scholarly_records.updated_at
`;

const artifactColumns = `
  scholarly_artifacts.id, ownership_domains.account_id AS owner_id,
  scholarly_artifacts.record_id, scholarly_artifacts.attachment_state,
  scholarly_artifacts.created_at, scholarly_artifacts.updated_at
`;

const versionColumns = `
  scholarly_artifact_versions.id, ownership_domains.account_id AS owner_id,
  scholarly_artifact_versions.artifact_id, scholarly_artifact_versions.stored_file_id,
  scholarly_artifact_versions.created_at, scholarly_artifact_versions.updated_at
`;

export class SqliteScholarlyRepository implements ScholarlyRepository {
  readonly #createRecord;
  readonly #findRecord;
  readonly #listRecords;
  readonly #countArtifacts;
  readonly #createArtifact;
  readonly #findArtifact;
  readonly #findArtifactByStoredFile;
  readonly #listArtifacts;
  readonly #updateArtifactState;
  readonly #createVersion;
  readonly #findVersion;
  readonly #isFileAttached;

  constructor(database: SqliteDatabase) {
    this.#createRecord = database.prepare<RecordParameters>(`
      INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
      SELECT @id, ownership_domains.id, @ownerId, @label, @createdAt, @updatedAt
      FROM ownership_domains
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = @ownerId
    `);
    this.#findRecord = database.prepare<[string, string], RecordRow>(`
      SELECT ${recordColumns}
      FROM scholarly_records
      JOIN ownership_domains ON ownership_domains.id = scholarly_records.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
        AND scholarly_records.id = ?
    `);
    this.#listRecords = database.prepare<RecordListParameters, RecordListRow>(`
      SELECT ${recordColumns}, (
        SELECT count(*)
        FROM scholarly_artifacts
        WHERE scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
          AND scholarly_artifacts.record_id = scholarly_records.id
      ) AS artifact_count
      FROM scholarly_records
      JOIN ownership_domains ON ownership_domains.id = scholarly_records.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = @ownerId
        AND (
          @beforeId IS NULL
          OR scholarly_records.created_at < (
            SELECT cursor.created_at
            FROM scholarly_records AS cursor
            WHERE cursor.id = @beforeId
              AND cursor.owner_domain_id = scholarly_records.owner_domain_id
          )
          OR (
            scholarly_records.created_at = (
              SELECT cursor.created_at
              FROM scholarly_records AS cursor
              WHERE cursor.id = @beforeId
                AND cursor.owner_domain_id = scholarly_records.owner_domain_id
            )
            AND scholarly_records.id < @beforeId
          )
        )
      ORDER BY scholarly_records.created_at DESC, scholarly_records.id DESC
      LIMIT @limit
    `);
    this.#countArtifacts = database.prepare<[string, string], { count: number }>(`
      SELECT count(*) AS count
      FROM scholarly_artifacts
      JOIN ownership_domains ON ownership_domains.id = scholarly_artifacts.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
        AND scholarly_artifacts.record_id = ?
    `);
    this.#createArtifact = database.prepare<ArtifactParameters>(`
      INSERT INTO scholarly_artifacts (
        id, owner_domain_id, record_id, attachment_state, created_at, updated_at
      )
      SELECT @id, ownership_domains.id, @recordId, @attachmentState, @createdAt, @updatedAt
      FROM ownership_domains
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = @ownerId
    `);
    this.#findArtifact = database.prepare<[string, string, string], ArtifactRow>(`
      SELECT ${artifactColumns}
      FROM scholarly_artifacts
      JOIN ownership_domains ON ownership_domains.id = scholarly_artifacts.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
        AND scholarly_artifacts.record_id = ?
        AND scholarly_artifacts.id = ?
    `);
    this.#findArtifactByStoredFile = database.prepare<[string, string], ArtifactRow>(`
      SELECT ${artifactColumns}
      FROM scholarly_artifacts
      JOIN ownership_domains ON ownership_domains.id = scholarly_artifacts.owner_domain_id
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
       AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
        AND scholarly_artifact_versions.stored_file_id = ?
    `);
    this.#listArtifacts = database.prepare<ArtifactListParameters, ArtifactRow>(`
      SELECT ${artifactColumns}
      FROM scholarly_artifacts
      JOIN ownership_domains ON ownership_domains.id = scholarly_artifacts.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = @ownerId
        AND scholarly_artifacts.record_id = @recordId
        AND (
          @beforeId IS NULL
          OR scholarly_artifacts.created_at < (
            SELECT cursor.created_at
            FROM scholarly_artifacts AS cursor
            WHERE cursor.id = @beforeId
              AND cursor.owner_domain_id = scholarly_artifacts.owner_domain_id
              AND cursor.record_id = scholarly_artifacts.record_id
          )
          OR (
            scholarly_artifacts.created_at = (
              SELECT cursor.created_at
              FROM scholarly_artifacts AS cursor
              WHERE cursor.id = @beforeId
                AND cursor.owner_domain_id = scholarly_artifacts.owner_domain_id
                AND cursor.record_id = scholarly_artifacts.record_id
            )
            AND scholarly_artifacts.id < @beforeId
          )
        )
      ORDER BY scholarly_artifacts.created_at DESC, scholarly_artifacts.id DESC
      LIMIT @limit
    `);
    this.#updateArtifactState = database.prepare<{
      ownerId: string;
      recordId: string;
      artifactId: string;
      expectedState: ScholarlyAttachmentState;
      state: ScholarlyAttachmentState;
      updatedAt: string;
    }>(`
      UPDATE scholarly_artifacts
      SET attachment_state = @state, updated_at = @updatedAt
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = @ownerId
      )
        AND record_id = @recordId
        AND id = @artifactId
        AND attachment_state = @expectedState
    `);
    this.#createVersion = database.prepare<VersionParameters>(`
      INSERT INTO scholarly_artifact_versions (
        id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at
      )
      SELECT @id, ownership_domains.id, @artifactId, @storedFileId, @createdAt, @updatedAt
      FROM ownership_domains
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = @ownerId
    `);
    this.#findVersion = database.prepare<[string, string], VersionRow>(`
      SELECT ${versionColumns}
      FROM scholarly_artifact_versions
      JOIN ownership_domains ON ownership_domains.id = scholarly_artifact_versions.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
        AND scholarly_artifact_versions.artifact_id = ?
    `);
    this.#isFileAttached = database.prepare<[string, string], { attached: number }>(`
      SELECT 1 AS attached
      FROM scholarly_artifact_versions
      JOIN scholarly_artifacts
        ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
       AND scholarly_artifacts.owner_domain_id = scholarly_artifact_versions.owner_domain_id
      JOIN ownership_domains ON ownership_domains.id = scholarly_artifact_versions.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
        AND scholarly_artifact_versions.stored_file_id = ?
        AND scholarly_artifacts.attachment_state = 'attached'
      LIMIT 1
    `);
  }

  createRecord(record: NewScholarlyRecord): ScholarlyRecord {
    this.#createRecord.run({
      id: record.id,
      ownerId: record.ownerId,
      label: record.label,
      createdAt: toDatabaseTimestamp(record.createdAt)!,
      updatedAt: toDatabaseTimestamp(record.updatedAt)!,
    });
    return this.findRecord(record.ownerId, record.id)!;
  }

  findRecord(ownerId: string, recordId: string): ScholarlyRecord | null {
    const row = this.#findRecord.get(ownerId, recordId);
    return row ? toRecord(row) : null;
  }

  listRecords(ownerId: string, beforeId: string | null, limit: number): ScholarlyRecordListItem[] {
    return this.#listRecords.all({ ownerId, beforeId, limit }).map((row) => ({
      record: toRecord(row),
      artifactCount: row.artifact_count,
    }));
  }

  countArtifacts(ownerId: string, recordId: string): number {
    return this.#countArtifacts.get(ownerId, recordId)!.count;
  }

  createArtifact(artifact: NewScholarlyArtifact): ScholarlyArtifact {
    this.#createArtifact.run({
      id: artifact.id,
      ownerId: artifact.ownerId,
      recordId: artifact.recordId,
      attachmentState: artifact.attachmentState,
      createdAt: toDatabaseTimestamp(artifact.createdAt)!,
      updatedAt: toDatabaseTimestamp(artifact.updatedAt)!,
    });
    return this.findArtifact(artifact.ownerId, artifact.recordId, artifact.id)!;
  }

  findArtifact(ownerId: string, recordId: string, artifactId: string): ScholarlyArtifact | null {
    const row = this.#findArtifact.get(ownerId, recordId, artifactId);
    return row ? toArtifact(row) : null;
  }

  findArtifactByStoredFile(ownerId: string, storedFileId: string): ScholarlyArtifact | null {
    const row = this.#findArtifactByStoredFile.get(ownerId, storedFileId);
    return row ? toArtifact(row) : null;
  }

  listArtifacts(ownerId: string, recordId: string, beforeId: string | null, limit: number): ScholarlyArtifact[] {
    return this.#listArtifacts.all({ ownerId, recordId, beforeId, limit }).map(toArtifact);
  }

  updateArtifactState(
    ownerId: string,
    recordId: string,
    artifactId: string,
    expectedState: ScholarlyAttachmentState,
    state: ScholarlyAttachmentState,
    updatedAt: Date,
  ): ScholarlyArtifact | null {
    const result = this.#updateArtifactState.run({
      ownerId,
      recordId,
      artifactId,
      expectedState,
      state,
      updatedAt: toDatabaseTimestamp(updatedAt)!,
    });
    if (result.changes !== 1) return null;
    return this.findArtifact(ownerId, recordId, artifactId);
  }

  createVersion(version: NewScholarlyArtifactVersion): ScholarlyArtifactVersion {
    this.#createVersion.run({
      id: version.id,
      ownerId: version.ownerId,
      artifactId: version.artifactId,
      storedFileId: version.storedFileId,
      createdAt: toDatabaseTimestamp(version.createdAt)!,
      updatedAt: toDatabaseTimestamp(version.updatedAt)!,
    });
    return this.findVersion(version.ownerId, version.artifactId)!;
  }

  findVersion(ownerId: string, artifactId: string): ScholarlyArtifactVersion | null {
    const row = this.#findVersion.get(ownerId, artifactId);
    return row ? toVersion(row) : null;
  }

  isFileAttached(ownerId: string, storedFileId: string): boolean {
    return this.#isFileAttached.get(ownerId, storedFileId) !== undefined;
  }
}
