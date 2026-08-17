import type { ContributionRepository } from "../../library/contribution-repositories.js";
import type { ContributionCandidate, ContributionState, LibraryContribution, NewLibraryContribution } from "../../library/contribution.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface ContributionRow {
  id: string;
  library_id: string;
  artifact_id: string;
  contributor_account_id: string;
  state: ContributionState;
  revision: number;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by_account_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CandidateRow extends ContributionRow {
  library_domain_id: string;
  record_id: string;
  record_label: string;
  artifact_state: "attached" | "detached";
  version_id: string;
  file_id: string;
  file_owner_domain_id: string;
  uploaded_by_account_id: string;
  folder_id: string | null;
  display_name: string;
  storage_provider: string;
  object_key: string;
  media_type: string | null;
  size_bytes: number;
  file_state: "active" | "deleted" | "purging" | "purged" | "pending_upload";
  submitter_login_name: string | null;
}

interface SubmissionCandidateRow extends Omit<CandidateRow, keyof ContributionRow> {}

function toContribution(row: ContributionRow): LibraryContribution {
  return {
    id: row.id,
    libraryId: row.library_id,
    artifactId: row.artifact_id,
    contributorAccountId: row.contributor_account_id,
    state: row.state,
    revision: row.revision,
    submittedAt: fromDatabaseTimestamp(row.submitted_at)!,
    reviewedAt: fromDatabaseTimestamp(row.reviewed_at),
    reviewedByAccountId: row.reviewed_by_account_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

function toCandidate(row: CandidateRow): ContributionCandidate {
  return {
    contribution: toContribution(row),
    libraryDomainId: row.library_domain_id,
    recordId: row.record_id,
    recordLabel: row.record_label,
    artifactState: row.artifact_state,
    versionId: row.version_id,
    file: {
      id: row.file_id,
      ownerDomainId: row.file_owner_domain_id,
      uploadedByAccountId: row.uploaded_by_account_id,
      folderId: row.folder_id,
      displayName: row.display_name,
      storageProvider: row.storage_provider,
      objectKey: row.object_key,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      state: row.file_state,
    },
    submitterLoginName: row.submitter_login_name,
  };
}

const contributionColumns = `
  library_contributions.id, library_contributions.library_id,
  library_contributions.artifact_id, library_contributions.contributor_account_id,
  library_contributions.state, library_contributions.revision,
  library_contributions.submitted_at, library_contributions.reviewed_at,
  library_contributions.reviewed_by_account_id, library_contributions.created_at,
  library_contributions.updated_at
`;

const candidateColumns = `
  libraries.owner_domain_id AS library_domain_id,
  scholarly_records.id AS record_id,
  scholarly_records.label AS record_label,
  scholarly_artifacts.attachment_state AS artifact_state,
  scholarly_artifact_versions.id AS version_id,
  files.id AS file_id,
  files.owner_domain_id AS file_owner_domain_id,
  files.uploaded_by_account_id,
  files.folder_id,
  files.display_name,
  files.storage_provider,
  files.object_key,
  files.media_type,
  files.size_bytes,
  files.state AS file_state,
  accounts.login_name AS submitter_login_name
`;

const candidateJoins = `
  JOIN libraries ON libraries.id = library_contributions.library_id
  JOIN scholarly_artifacts
    ON scholarly_artifacts.id = library_contributions.artifact_id
  JOIN scholarly_records
    ON scholarly_records.id = scholarly_artifacts.record_id
   AND scholarly_records.owner_domain_id = scholarly_artifacts.owner_domain_id
  JOIN scholarly_artifact_versions
    ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
   AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
  JOIN files
    ON files.id = scholarly_artifact_versions.stored_file_id
   AND files.owner_domain_id = scholarly_artifacts.owner_domain_id
  JOIN accounts ON accounts.id = library_contributions.contributor_account_id
`;

const candidateOwnershipGuard = `
  (
    library_contributions.state IN ('submitted', 'rejected', 'withdrawn')
    AND scholarly_artifacts.owner_domain_id = 'account:' || library_contributions.contributor_account_id
  ) OR (
    library_contributions.state = 'approved'
    AND scholarly_artifacts.owner_domain_id = libraries.owner_domain_id
  )
`;

export class SqliteContributionRepository implements ContributionRepository {
  readonly #create;
  readonly #findById;
  readonly #findSubmittedByArtifact;
  readonly #listSubmitted;
  readonly #listForContributor;
  readonly #findCandidateForSubmission;
  readonly #findCandidate;
  readonly #updateState;
  readonly #insertIntent;
  readonly #updateRecordDomain;
  readonly #updateArtifactDomain;
  readonly #updateVersionDomain;
  readonly #updateFileDomain;
  readonly #deleteIntent;

  constructor(private readonly database: SqliteDatabase) {
    this.#create = database.prepare<{
      id: string;
      libraryId: string;
      artifactId: string;
      contributorAccountId: string;
      state: "submitted";
      revision: 0;
      submittedAt: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      INSERT INTO library_contributions (
        id, library_id, artifact_id, contributor_account_id, state, revision,
        submitted_at, reviewed_at, reviewed_by_account_id, created_at, updated_at
      ) VALUES (@id, @libraryId, @artifactId, @contributorAccountId, @state, @revision,
        @submittedAt, NULL, NULL, @createdAt, @updatedAt)
    `);
    this.#findById = database.prepare<[string, string], ContributionRow>(`
      SELECT ${contributionColumns}
      FROM library_contributions
      WHERE library_id = ? AND id = ?
    `);
    this.#findSubmittedByArtifact = database.prepare<[string, string], ContributionRow>(`
      SELECT ${contributionColumns}
      FROM library_contributions
      WHERE library_id = ? AND artifact_id = ? AND state = 'submitted'
    `);
    this.#listSubmitted = database.prepare<[string, number], CandidateRow>(`
      SELECT ${contributionColumns}, ${candidateColumns}
      FROM library_contributions
      ${candidateJoins}
      JOIN ownership_domains
        ON ownership_domains.id = scholarly_records.owner_domain_id
      WHERE library_contributions.library_id = ?
        AND library_contributions.state = 'submitted'
        AND (${candidateOwnershipGuard})
      ORDER BY library_contributions.submitted_at ASC, library_contributions.id ASC
      LIMIT ?
    `);
    this.#listForContributor = database.prepare<[string, string, number], CandidateRow>(`
      SELECT ${contributionColumns}, ${candidateColumns}
      FROM library_contributions
      ${candidateJoins}
      WHERE library_contributions.library_id = ?
        AND library_contributions.contributor_account_id = ?
        AND (${candidateOwnershipGuard})
      ORDER BY library_contributions.submitted_at DESC, library_contributions.id DESC
      LIMIT ?
    `);
    this.#findCandidateForSubmission = database.prepare<[string, string], SubmissionCandidateRow>(`
      SELECT
        '' AS library_domain_id,
        scholarly_records.id AS record_id,
        scholarly_records.label AS record_label,
        scholarly_artifacts.attachment_state AS artifact_state,
        scholarly_artifact_versions.id AS version_id,
        files.id AS file_id,
        files.owner_domain_id AS file_owner_domain_id,
        files.uploaded_by_account_id,
        files.folder_id,
        files.display_name,
        files.storage_provider,
        files.object_key,
        files.media_type,
        files.size_bytes,
        files.state AS file_state,
        NULL AS submitter_login_name
      FROM scholarly_artifacts
      JOIN scholarly_records
        ON scholarly_records.id = scholarly_artifacts.record_id
       AND scholarly_records.owner_domain_id = scholarly_artifacts.owner_domain_id
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
       AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
      JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
      JOIN ownership_domains
        ON ownership_domains.id = scholarly_artifacts.owner_domain_id
      WHERE scholarly_artifacts.id = ?
        AND ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ?
      LIMIT 1
    `);
    this.#findCandidate = database.prepare<[string, string], CandidateRow>(`
      SELECT ${contributionColumns}, ${candidateColumns}
      FROM library_contributions
      ${candidateJoins}
      WHERE library_contributions.library_id = ?
        AND library_contributions.id = ?
        AND (${candidateOwnershipGuard})
    `);
    this.#updateState = database.prepare<{
      libraryId: string;
      contributionId: string;
      expectedRevision: number;
      state: Exclude<ContributionState, "submitted">;
      reviewedByAccountId: string;
      reviewedAt: string;
      updatedAt: string;
    }>(`
      UPDATE library_contributions
      SET state = @state,
          revision = revision + 1,
          reviewed_at = @reviewedAt,
          reviewed_by_account_id = @reviewedByAccountId,
          updated_at = @updatedAt
      WHERE library_id = @libraryId
        AND id = @contributionId
        AND state = 'submitted'
        AND revision = @expectedRevision
    `);
    this.#insertIntent = database.prepare<{
      id: string;
      contributionId: string;
      libraryId: string;
      reviewedByAccountId: string;
      recordId: string;
      artifactId: string;
      versionId: string;
      fileId: string;
      createdAt: string;
    }>(`
      INSERT INTO library_ownership_promotions (id, contribution_id, library_id, reviewed_by_account_id, record_id, artifact_id, version_id, file_id, created_at)
      VALUES (@id, @contributionId, @libraryId, @reviewedByAccountId, @recordId, @artifactId, @versionId, @fileId, @createdAt)
    `);
    this.#updateRecordDomain = database.prepare<[string, string, string]>(`
      UPDATE scholarly_records
      SET owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = ?)
      WHERE id = ? AND owner_domain_id = 'account:' || ?
    `);
    this.#updateArtifactDomain = database.prepare<[string, string, string]>(`
      UPDATE scholarly_artifacts
      SET owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = ?)
      WHERE id = ? AND owner_domain_id = 'account:' || ?
    `);
    this.#updateVersionDomain = database.prepare<[string, string, string]>(`
      UPDATE scholarly_artifact_versions
      SET owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = ?)
      WHERE id = ? AND owner_domain_id = 'account:' || ?
    `);
    this.#updateFileDomain = database.prepare<[string, string, string]>(`
      UPDATE files
      SET owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = ?), folder_id = NULL
      WHERE id = ? AND owner_domain_id = 'account:' || ?
    `);
    this.#deleteIntent = database.prepare<[string]>("DELETE FROM library_ownership_promotions WHERE id = ?");
  }

  create(contribution: NewLibraryContribution): LibraryContribution {
    this.#create.run({
      id: contribution.id,
      libraryId: contribution.libraryId,
      artifactId: contribution.artifactId,
      contributorAccountId: contribution.contributorAccountId,
      state: contribution.state,
      revision: contribution.revision,
      submittedAt: toDatabaseTimestamp(contribution.submittedAt)!,
      createdAt: toDatabaseTimestamp(contribution.createdAt)!,
      updatedAt: toDatabaseTimestamp(contribution.updatedAt)!,
    });
    return this.findById(contribution.libraryId, contribution.id)!;
  }

  findById(libraryId: string, contributionId: string): LibraryContribution | null {
    const row = this.#findById.get(libraryId, contributionId);
    return row ? toContribution(row) : null;
  }

  findSubmittedByArtifact(libraryId: string, artifactId: string): LibraryContribution | null {
    const row = this.#findSubmittedByArtifact.get(libraryId, artifactId);
    return row ? toContribution(row) : null;
  }

  listSubmitted(libraryId: string, limit: number): ContributionCandidate[] {
    return this.#listSubmitted.all(libraryId, limit).map(toCandidate);
  }

  listForContributor(libraryId: string, accountId: string, limit: number): ContributionCandidate[] {
    return this.#listForContributor.all(libraryId, accountId, limit).map(toCandidate);
  }

  findCandidateForSubmission(artifactId: string, accountId: string): Omit<ContributionCandidate, "contribution"> | null {
    const row = this.#findCandidateForSubmission.get(artifactId, accountId);
    if (!row) return null;
    return {
      libraryDomainId: row.library_domain_id,
      recordId: row.record_id,
      recordLabel: row.record_label,
      artifactState: row.artifact_state,
      versionId: row.version_id,
      file: {
        id: row.file_id,
        ownerDomainId: row.file_owner_domain_id,
        uploadedByAccountId: row.uploaded_by_account_id,
        folderId: row.folder_id,
        displayName: row.display_name,
        storageProvider: row.storage_provider,
        objectKey: row.object_key,
        mediaType: row.media_type,
        sizeBytes: row.size_bytes,
        state: row.file_state,
      },
      submitterLoginName: null,
    };
  }

  findCandidate(libraryId: string, contributionId: string): ContributionCandidate | null {
    const row = this.#findCandidate.get(libraryId, contributionId);
    return row ? toCandidate(row) : null;
  }

  updateState(
    libraryId: string,
    contributionId: string,
    expectedRevision: number,
    state: Extract<ContributionState, "rejected" | "withdrawn">,
    reviewedByAccountId: string,
    reviewedAt: Date,
  ): LibraryContribution | null {
    const timestamp = toDatabaseTimestamp(reviewedAt)!;
    if (this.#updateState.run({
      libraryId,
      contributionId,
      expectedRevision,
      state,
      reviewedByAccountId,
      reviewedAt: timestamp,
      updatedAt: timestamp,
    }).changes !== 1) return null;
    return this.findById(libraryId, contributionId);
  }

  promote(
    libraryId: string,
    contributionId: string,
    expectedRevision: number,
    contributorAccountId: string,
    recordId: string,
    artifactId: string,
    versionId: string,
    fileId: string,
    reviewedByAccountId: string,
    reviewedAt: Date,
  ): LibraryContribution | null {
    const intentId = `promotion-${contributionId}-${expectedRevision}`;
    const timestamp = toDatabaseTimestamp(reviewedAt)!;
    this.#insertIntent.run({
      id: intentId,
      contributionId,
      libraryId,
      reviewedByAccountId,
      recordId,
      artifactId,
      versionId,
      fileId,
      createdAt: timestamp,
    });
    this.database.pragma("defer_foreign_keys = ON");
    if (this.#updateRecordDomain.run(libraryId, recordId, contributorAccountId).changes !== 1) throw new Error("promotion record ownership changed");
    if (this.#updateArtifactDomain.run(libraryId, artifactId, contributorAccountId).changes !== 1) throw new Error("promotion artifact ownership changed");
    if (this.#updateVersionDomain.run(libraryId, versionId, contributorAccountId).changes !== 1) throw new Error("promotion version ownership changed");
    if (this.#updateFileDomain.run(libraryId, fileId, contributorAccountId).changes !== 1) throw new Error("promotion file ownership changed");
    if (this.#updateState.run({
      libraryId,
      contributionId,
      expectedRevision,
      state: "approved",
      reviewedByAccountId,
      reviewedAt: timestamp,
      updatedAt: timestamp,
    }).changes !== 1) throw new Error("promotion contribution state changed");
    this.#deleteIntent.run(intentId);
    return this.findById(libraryId, contributionId);
  }
}
