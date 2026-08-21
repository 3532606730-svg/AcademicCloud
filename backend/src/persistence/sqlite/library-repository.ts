import type { LibraryRepository } from "../../library/repositories.js";
import type { HoldingCursor } from "../../library/search.js";
import type {
  Library,
  LibraryHolding,
  LibraryHoldingSort,
  LibraryMembership,
  LibraryRecycledHolding,
  LibraryRole,
  NewLibrary,
  NewLibraryMembership,
} from "../../library/library.js";
import { pinyinSortKey } from "../../library/pinyin.js";
import type { StoredFileState } from "../../drive/file.js";
import type { ScholarlyAttachmentState } from "../../research/record.js";
import type BetterSqlite3 from "better-sqlite3";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface LibraryRow {
  id: string;
  owner_domain_id: string;
  name: string;
  is_default: number;
  created_by_account_id: string;
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  library_id: string;
  account_id: string;
  role: LibraryRole;
  created_at: string;
  updated_at: string;
}

interface LibraryWithMembershipRow extends LibraryRow {
  membership_library_id: string;
  membership_account_id: string;
  membership_role: LibraryRole;
  membership_created_at: string;
  membership_updated_at: string;
}

interface HoldingRow {
  library_id: string;
  record_id: string;
  record_label: string;
  canonical_title: string | null;
  author_labels_json: string;
  artifact_id: string;
  artifact_created_at: string;
  version_id: string;
  version_created_at: string;
  file_id: string;
  uploaded_by_account_id: string;
  folder_id: string | null;
  display_name: string;
  media_type: string | null;
  size_bytes: number;
  file_state: "active";
  file_revision: number;
  file_created_at: string;
  file_updated_at: string;
  file_deleted_at: null;
  file_purged_at: null;
}

interface RecycledHoldingRow {
  library_id: string;
  record_id: string;
  record_label: string;
  canonical_title: string | null;
  artifact_id: string;
  version_id: string;
  file_id: string;
  display_name: string;
  media_type: string | null;
  size_bytes: number;
  file_state: "deleted";
  file_revision: number;
  file_updated_at: string;
  file_deleted_at: string;
}

function toLibrary(row: LibraryRow): Library {
  return {
    id: row.id,
    ownerDomainId: row.owner_domain_id,
    name: row.name,
    isDefault: row.is_default === 1,
    createdByAccountId: row.created_by_account_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

function toMembership(row: MembershipRow): LibraryMembership {
  return {
    libraryId: row.library_id,
    accountId: row.account_id,
    role: row.role,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

function toHolding(row: HoldingRow): LibraryHolding {
  const authorLabels = JSON.parse(row.author_labels_json) as unknown;
  if (!Array.isArray(authorLabels) || authorLabels.some((label) => typeof label !== "string")) {
    throw new TypeError("invalid Library author-label projection");
  }
  return {
    libraryId: row.library_id,
    recordId: row.record_id,
    recordLabel: row.record_label,
    canonicalTitle: row.canonical_title,
    authorLabels,
    artifactId: row.artifact_id,
    artifactCreatedAt: fromDatabaseTimestamp(row.artifact_created_at)!,
    versionId: row.version_id,
    versionCreatedAt: fromDatabaseTimestamp(row.version_created_at)!,
    file: {
      id: row.file_id,
      uploadedByAccountId: row.uploaded_by_account_id,
      folderId: row.folder_id,
      displayName: row.display_name,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      state: row.file_state,
      revision: row.file_revision,
      createdAt: fromDatabaseTimestamp(row.file_created_at)!,
      updatedAt: fromDatabaseTimestamp(row.file_updated_at)!,
      deletedAt: null,
      purgedAt: null,
    },
  };
}

function toRecycledHolding(row: RecycledHoldingRow): LibraryRecycledHolding {
  return {
    libraryId: row.library_id,
    recordId: row.record_id,
    recordLabel: row.record_label,
    canonicalTitle: row.canonical_title,
    artifactId: row.artifact_id,
    versionId: row.version_id,
    file: {
      id: row.file_id,
      displayName: row.display_name,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      state: row.file_state,
      revision: row.file_revision,
      updatedAt: fromDatabaseTimestamp(row.file_updated_at)!,
      deletedAt: fromDatabaseTimestamp(row.file_deleted_at)!,
    },
  };
}

const libraryColumns = `
  libraries.id, libraries.owner_domain_id, libraries.name,
  libraries.is_default,
  libraries.created_by_account_id, libraries.created_at, libraries.updated_at
`;

const membershipColumns = `
  library_memberships.library_id, library_memberships.account_id,
  library_memberships.role, library_memberships.created_at, library_memberships.updated_at
`;

const membershipColumnsWithAliases = `
  library_memberships.library_id AS membership_library_id,
  library_memberships.account_id AS membership_account_id,
  library_memberships.role AS membership_role,
  library_memberships.created_at AS membership_created_at,
  library_memberships.updated_at AS membership_updated_at
`;

const holdingColumns = `
  libraries.id AS library_id,
  scholarly_records.id AS record_id,
  scholarly_records.label AS record_label,
  scholarly_record_metadata.canonical_title,
  (
    SELECT json_group_array(ordered_author.canonical_label)
    FROM (
      SELECT scholarly_authorities.canonical_label
      FROM scholarly_record_authority_links
      JOIN scholarly_authorities
        ON scholarly_authorities.id = scholarly_record_authority_links.authority_id
       AND scholarly_authorities.owner_domain_id = scholarly_record_authority_links.owner_domain_id
      WHERE scholarly_record_authority_links.record_id = scholarly_records.id
        AND scholarly_record_authority_links.owner_domain_id = scholarly_records.owner_domain_id
        AND scholarly_record_authority_links.role = 'author'
      ORDER BY scholarly_record_authority_links.position
    ) AS ordered_author
  ) AS author_labels_json,
  scholarly_artifacts.id AS artifact_id,
  scholarly_artifacts.created_at AS artifact_created_at,
  scholarly_artifact_versions.id AS version_id,
  scholarly_artifact_versions.created_at AS version_created_at,
  files.id AS file_id,
  files.uploaded_by_account_id,
  files.folder_id,
  files.display_name,
  files.media_type,
  files.size_bytes,
  files.state AS file_state,
  files.revision AS file_revision,
  files.created_at AS file_created_at,
  files.updated_at AS file_updated_at,
  files.deleted_at AS file_deleted_at,
  files.purged_at AS file_purged_at
`;

const recycledHoldingColumns = `
  libraries.id AS library_id,
  scholarly_records.id AS record_id,
  scholarly_records.label AS record_label,
  scholarly_record_metadata.canonical_title,
  scholarly_artifacts.id AS artifact_id,
  scholarly_artifact_versions.id AS version_id,
  files.id AS file_id,
  files.display_name,
  files.media_type,
  files.size_bytes,
  files.state AS file_state,
  files.revision AS file_revision,
  files.updated_at AS file_updated_at,
  files.deleted_at AS file_deleted_at
`;

/** Shared joins for the active holding projection (list, page, sorted, find). */
const holdingFrom = `
  FROM libraries
  JOIN scholarly_records
    ON scholarly_records.owner_domain_id = libraries.owner_domain_id
  JOIN scholarly_artifacts
    ON scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
   AND scholarly_artifacts.record_id = scholarly_records.id
   AND scholarly_artifacts.attachment_state = 'attached'
  JOIN scholarly_artifact_versions
    ON scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
   AND scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
  LEFT JOIN scholarly_record_metadata
    ON scholarly_record_metadata.owner_domain_id = scholarly_records.owner_domain_id
   AND scholarly_record_metadata.record_id = scholarly_records.id
  JOIN files
    ON files.id = scholarly_artifact_versions.stored_file_id
   AND files.owner_domain_id = libraries.owner_domain_id
   AND files.state = 'active'
`;

/** Effective display title: canonical title when present, otherwise the acquisition filename. */
const effectiveTitle = "COALESCE(NULLIF(scholarly_record_metadata.canonical_title, ''), files.display_name)";

interface SortedAfterParameters {
  libraryId: string;
  afterPrimary: string | number | null;
  afterSecondary: string | null;
  afterFileId: string | null;
  limit: number;
}

/**
 * Keyset continuation clause for one sort direction. `terms` lists the ORDER BY
 * expressions in order; the clause compares them lexicographically against the
 * cursor's primary/secondary/fileId parts. A two-term sort leaves the third
 * comparison out entirely.
 */
function sortedAfterClause(direction: "asc" | "desc", terms: string[]): string {
  const compare = direction === "asc" ? ">" : "<";
  const clauses = [
    `@afterPrimary IS NULL`,
    `${terms[0]} ${compare} @afterPrimary`,
    `(${terms[0]} = @afterPrimary AND ${terms[1]} ${compare} @afterSecondary)`,
  ];
  if (terms.length > 2) {
    clauses.push(
      `(${terms[0]} = @afterPrimary AND ${terms[1]} = @afterSecondary AND ${terms[2]} ${compare} @afterFileId)`,
    );
  }
  return `AND (${clauses.join(" OR ")})`;
}

export class SqliteLibraryRepository implements LibraryRepository {
  readonly #createDomain;
  readonly #create;
  readonly #findById;
  readonly #findDefault;
  readonly #listForAccount;
  readonly #createMembership;
  readonly #findMembership;
  readonly #listMemberships;
  readonly #updateMembershipRole;
  readonly #deleteMembership;
  readonly #listHoldings;
  readonly #listHoldingsPage;
  readonly #findHoldingByFile;
  readonly #hasAvailableNameConflict;
  readonly #listRecycledHoldings;
  readonly #findRecycledHoldingByFile;
  readonly #verifyRecycledHoldingExclusive;
  readonly #listSorted: ReadonlyMap<LibraryHoldingSort, BetterSqlite3.Statement<SortedAfterParameters, HoldingRow>>;

  constructor(database: SqliteDatabase) {
    // Deterministic Han→pinyin sort keys for the title sorts. Registered before
    // any statement that references pinyin_key(...) is prepared.
    database.function("pinyin_key", { deterministic: true }, (value: unknown) => (
      typeof value === "string" ? pinyinSortKey(value) : ""
    ));
    this.#createDomain = database.prepare<{ domainId: string; createdAt: string }>(`
      INSERT INTO ownership_domains (id, kind, account_id, created_at)
      VALUES (@domainId, 'library', NULL, @createdAt)
    `);
    this.#create = database.prepare<{
      id: string;
      domainId: string;
      name: string;
      isDefault: number;
      createdByAccountId: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      INSERT INTO libraries (id, owner_domain_id, name, created_by_account_id, created_at, updated_at, is_default)
      VALUES (@id, @domainId, @name, @createdByAccountId, @createdAt, @updatedAt, @isDefault)
    `);
    this.#findById = database.prepare<[string], LibraryRow>(`
      SELECT ${libraryColumns} FROM libraries WHERE libraries.id = ?
    `);
    this.#findDefault = database.prepare<[], LibraryRow>(`
      SELECT ${libraryColumns} FROM libraries WHERE libraries.is_default = 1
    `);
    this.#listForAccount = database.prepare<[string], LibraryWithMembershipRow>(`
      SELECT ${libraryColumns}, ${membershipColumnsWithAliases}
      FROM libraries
      JOIN library_memberships ON library_memberships.library_id = libraries.id
      WHERE library_memberships.account_id = ?
      ORDER BY libraries.created_at ASC, libraries.id ASC
    `);
    this.#createMembership = database.prepare<{
      libraryId: string;
      accountId: string;
      role: LibraryRole;
      createdAt: string;
      updatedAt: string;
    }>(`
      INSERT INTO library_memberships (library_id, account_id, role, created_at, updated_at)
      VALUES (@libraryId, @accountId, @role, @createdAt, @updatedAt)
    `);
    this.#findMembership = database.prepare<[string, string], MembershipRow>(`
      SELECT ${membershipColumns}
      FROM library_memberships
      WHERE library_id = ? AND account_id = ?
    `);
    this.#listMemberships = database.prepare<[string], MembershipRow>(`
      SELECT ${membershipColumns}
      FROM library_memberships
      WHERE library_id = ?
      ORDER BY created_at ASC, account_id ASC
    `);
    this.#updateMembershipRole = database.prepare<{
      libraryId: string;
      accountId: string;
      expectedRole: LibraryRole;
      role: LibraryRole;
      updatedAt: string;
    }>(`
      UPDATE library_memberships
      SET role = @role, updated_at = @updatedAt
      WHERE library_id = @libraryId AND account_id = @accountId AND role = @expectedRole
    `);
    this.#deleteMembership = database.prepare<[string, string]>(`
      DELETE FROM library_memberships WHERE library_id = ? AND account_id = ?
    `);
    this.#listHoldings = database.prepare<[string, number], HoldingRow>(`
      SELECT ${holdingColumns}
      FROM libraries
      JOIN scholarly_records
        ON scholarly_records.owner_domain_id = libraries.owner_domain_id
      JOIN scholarly_artifacts
        ON scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_artifacts.record_id = scholarly_records.id
       AND scholarly_artifacts.attachment_state = 'attached'
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
       AND scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
      LEFT JOIN scholarly_record_metadata
        ON scholarly_record_metadata.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_record_metadata.record_id = scholarly_records.id
      JOIN files
        ON files.id = scholarly_artifact_versions.stored_file_id
       AND files.owner_domain_id = libraries.owner_domain_id
       AND files.state = 'active'
      WHERE libraries.id = ?
      ORDER BY scholarly_artifacts.created_at DESC, scholarly_artifacts.id DESC
      LIMIT ?
    `);
    this.#listHoldingsPage = database.prepare<{
      libraryId: string;
      afterCreatedAt: string | null;
      afterArtifactId: string | null;
      limit: number;
    }, HoldingRow>(`
      SELECT ${holdingColumns}
      FROM libraries
      JOIN scholarly_records
        ON scholarly_records.owner_domain_id = libraries.owner_domain_id
      JOIN scholarly_artifacts
        ON scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_artifacts.record_id = scholarly_records.id
       AND scholarly_artifacts.attachment_state = 'attached'
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
       AND scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
      LEFT JOIN scholarly_record_metadata
        ON scholarly_record_metadata.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_record_metadata.record_id = scholarly_records.id
      JOIN files
        ON files.id = scholarly_artifact_versions.stored_file_id
       AND files.owner_domain_id = libraries.owner_domain_id
       AND files.state = 'active'
      WHERE libraries.id = @libraryId
        AND (
          @afterCreatedAt IS NULL
          OR scholarly_artifacts.created_at < @afterCreatedAt
          OR (scholarly_artifacts.created_at = @afterCreatedAt AND scholarly_artifacts.id < @afterArtifactId)
        )
      ORDER BY scholarly_artifacts.created_at DESC, scholarly_artifacts.id DESC
      LIMIT @limit
    `);
    const sorted = new Map<LibraryHoldingSort, BetterSqlite3.Statement<SortedAfterParameters, HoldingRow>>();
    const sortedSpecs: ReadonlyArray<{
      sort: LibraryHoldingSort;
      direction: "asc" | "desc";
      /** ORDER BY expressions, first = cursor primary, second = cursor secondary, optional third = file identity. */
      terms: string[];
    }> = [
      { sort: "newest", direction: "desc", terms: ["scholarly_artifacts.created_at", "scholarly_artifacts.id"] },
      { sort: "oldest", direction: "asc", terms: ["scholarly_artifacts.created_at", "scholarly_artifacts.id"] },
      { sort: "title_asc", direction: "asc", terms: [`pinyin_key(${effectiveTitle})`, effectiveTitle, "files.id"] },
      { sort: "title_desc", direction: "desc", terms: [`pinyin_key(${effectiveTitle})`, effectiveTitle, "files.id"] },
      { sort: "size_asc", direction: "asc", terms: ["files.size_bytes", "files.id"] },
      { sort: "size_desc", direction: "desc", terms: ["files.size_bytes", "files.id"] },
    ];
    for (const spec of sortedSpecs) {
      const order = spec.direction.toUpperCase();
      const orderTail = spec.terms.map((term) => `${term} ${order}`).join(", ");
      sorted.set(spec.sort, database.prepare<SortedAfterParameters, HoldingRow>(`
        SELECT ${holdingColumns}
        ${holdingFrom}
        WHERE libraries.id = @libraryId
        ${sortedAfterClause(spec.direction, spec.terms)}
        ORDER BY ${orderTail}
        LIMIT @limit
      `));
    }
    this.#listSorted = sorted;
    this.#findHoldingByFile = database.prepare<[string, string], HoldingRow>(`
      SELECT ${holdingColumns}
      FROM libraries
      JOIN scholarly_records
        ON scholarly_records.owner_domain_id = libraries.owner_domain_id
      JOIN scholarly_artifacts
        ON scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_artifacts.record_id = scholarly_records.id
       AND scholarly_artifacts.attachment_state = 'attached'
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
       AND scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
      LEFT JOIN scholarly_record_metadata
        ON scholarly_record_metadata.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_record_metadata.record_id = scholarly_records.id
      JOIN files
        ON files.id = scholarly_artifact_versions.stored_file_id
       AND files.owner_domain_id = libraries.owner_domain_id
       AND files.state = 'active'
      WHERE libraries.id = ? AND files.id = ?
    `);
    this.#hasAvailableNameConflict = database.prepare<[string, string], { conflict: number }>(`
      SELECT 1 AS conflict
      FROM libraries
      JOIN files
        ON files.owner_domain_id = libraries.owner_domain_id
       AND files.folder_id IS NULL
       AND files.state IN ('pending_upload', 'active')
       AND files.display_name = ? COLLATE NOCASE
      WHERE libraries.id = ?
      LIMIT 1
    `);
    const recycledHoldingJoins = `
      FROM libraries
      JOIN scholarly_records
        ON scholarly_records.owner_domain_id = libraries.owner_domain_id
      JOIN scholarly_artifacts
        ON scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_artifacts.record_id = scholarly_records.id
       AND scholarly_artifacts.attachment_state = 'attached'
      LEFT JOIN scholarly_record_metadata
        ON scholarly_record_metadata.owner_domain_id = scholarly_records.owner_domain_id
       AND scholarly_record_metadata.record_id = scholarly_records.id
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
       AND scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
      JOIN files
        ON files.id = scholarly_artifact_versions.stored_file_id
       AND files.owner_domain_id = libraries.owner_domain_id
       AND files.state = 'deleted'
      JOIN recycle_groups
        ON recycle_groups.id = files.recycle_group_id
       AND recycle_groups.owner_domain_id = files.owner_domain_id
       AND recycle_groups.root_kind = 'file'
       AND recycle_groups.root_id = files.id
    `;
    this.#listRecycledHoldings = database.prepare<[string], RecycledHoldingRow>(`
      SELECT ${recycledHoldingColumns}
      ${recycledHoldingJoins}
      WHERE libraries.id = ?
      ORDER BY files.deleted_at DESC, files.id
    `);
    this.#findRecycledHoldingByFile = database.prepare<[string, string], RecycledHoldingRow>(`
      SELECT ${recycledHoldingColumns}
      ${recycledHoldingJoins}
      WHERE libraries.id = ? AND files.id = ?
    `);
    this.#verifyRecycledHoldingExclusive = database.prepare<{
      libraryId: string;
      groupId: string;
      recordId: string;
      artifactId: string;
      versionId: string;
      fileId: string;
      fileState: Extract<StoredFileState, "deleted" | "purging">;
      attachmentState: ScholarlyAttachmentState;
    }, { exclusive: number }>(`
      SELECT CASE WHEN
        EXISTS (
          SELECT 1
          FROM libraries
          JOIN files
            ON files.owner_domain_id = libraries.owner_domain_id
           AND files.id = @fileId
           AND files.state = @fileState
          JOIN recycle_groups
            ON recycle_groups.id = files.recycle_group_id
           AND recycle_groups.owner_domain_id = files.owner_domain_id
           AND recycle_groups.root_kind = 'file'
           AND recycle_groups.root_id = files.id
          WHERE libraries.id = @libraryId
            AND recycle_groups.id = @groupId
            AND recycle_groups.folder_count = 0
            AND recycle_groups.file_count = 1
        )
        AND (
          SELECT COUNT(*) FROM scholarly_records
          WHERE id = @recordId
            AND owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = @libraryId)
        ) = 1
        AND (
          SELECT COUNT(*) FROM scholarly_artifacts
          WHERE id = @artifactId
            AND record_id = @recordId
            AND owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = @libraryId)
            AND attachment_state = @attachmentState
        ) = 1
        AND (
          SELECT COUNT(*) FROM scholarly_artifacts
          WHERE record_id = @recordId
            AND owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = @libraryId)
        ) = 1
        AND (
          SELECT COUNT(*) FROM scholarly_artifact_versions
          WHERE id = @versionId
            AND artifact_id = @artifactId
            AND stored_file_id = @fileId
            AND owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = @libraryId)
        ) = 1
        AND (
          SELECT COUNT(*) FROM scholarly_artifact_versions
          WHERE artifact_id = @artifactId
            AND owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = @libraryId)
        ) = 1
        AND (
          SELECT COUNT(*) FROM scholarly_artifact_versions
          WHERE stored_file_id = @fileId
        ) = 1
        AND (
          SELECT COUNT(*) FROM files AS same_object
          WHERE same_object.storage_provider = (SELECT storage_provider FROM files WHERE id = @fileId)
            AND same_object.object_key = (SELECT object_key FROM files WHERE id = @fileId)
        ) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM library_ownership_promotions
          WHERE (record_id = @recordId OR artifact_id = @artifactId OR version_id = @versionId OR file_id = @fileId)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM library_contributions
          WHERE artifact_id = @artifactId
            AND (
              state = 'submitted'
              OR (state = 'approved' AND library_id <> @libraryId)
            )
        )
        AND (
          SELECT COUNT(*)
          FROM library_contributions
          WHERE artifact_id = @artifactId
            AND library_id = @libraryId
            AND state = 'approved'
        ) <= 1
        AND (
          (
            SELECT COUNT(*)
            FROM canonical_library_record_transitions
            JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
            WHERE canonical_library_record_transitions.record_id = @recordId
              AND canonical_library_record_transitions.library_id = @libraryId
              AND libraries.owner_domain_id = (SELECT owner_domain_id FROM libraries WHERE id = @libraryId)
          ) = 1
          OR (
            SELECT COUNT(*)
            FROM library_contributions
            WHERE library_contributions.library_id = @libraryId
              AND library_contributions.artifact_id = @artifactId
              AND library_contributions.state = 'approved'
          ) = 1
        )
        AND NOT EXISTS (
          SELECT 1
          FROM canonical_library_record_transitions AS other_transition
          WHERE other_transition.record_id = @recordId
            AND other_transition.library_id <> @libraryId
        )
      THEN 1 ELSE 0 END AS exclusive
    `);
  }

  create(library: NewLibrary): Library {
    this.#createDomain.run({ domainId: library.ownerDomainId, createdAt: toDatabaseTimestamp(library.createdAt)! });
    this.#create.run({
      id: library.id,
      domainId: library.ownerDomainId,
      name: library.name,
      isDefault: library.isDefault ? 1 : 0,
      createdByAccountId: library.createdByAccountId,
      createdAt: toDatabaseTimestamp(library.createdAt)!,
      updatedAt: toDatabaseTimestamp(library.updatedAt)!,
    });
    return this.findById(library.id)!;
  }

  findById(id: string): Library | null {
    const row = this.#findById.get(id);
    return row ? toLibrary(row) : null;
  }

  findDefault(): Library | null {
    const row = this.#findDefault.get();
    return row ? toLibrary(row) : null;
  }

  listForAccount(accountId: string): Array<{ library: Library; membership: LibraryMembership }> {
    return this.#listForAccount.all(accountId).map((row) => ({
      library: toLibrary(row),
      membership: {
        libraryId: row.membership_library_id,
        accountId: row.membership_account_id,
        role: row.membership_role,
        createdAt: fromDatabaseTimestamp(row.membership_created_at)!,
        updatedAt: fromDatabaseTimestamp(row.membership_updated_at)!,
      },
    }));
  }

  createMembership(membership: NewLibraryMembership): LibraryMembership {
    this.#createMembership.run({
      libraryId: membership.libraryId,
      accountId: membership.accountId,
      role: membership.role,
      createdAt: toDatabaseTimestamp(membership.createdAt)!,
      updatedAt: toDatabaseTimestamp(membership.updatedAt)!,
    });
    return this.findMembership(membership.libraryId, membership.accountId)!;
  }

  findMembership(libraryId: string, accountId: string): LibraryMembership | null {
    const row = this.#findMembership.get(libraryId, accountId);
    return row ? toMembership(row) : null;
  }

  listMemberships(libraryId: string): LibraryMembership[] {
    return this.#listMemberships.all(libraryId).map(toMembership);
  }

  updateMembershipRole(libraryId: string, accountId: string, expectedRole: LibraryRole, role: LibraryRole, updatedAt: Date): LibraryMembership | null {
    if (this.#updateMembershipRole.run({
      libraryId,
      accountId,
      expectedRole,
      role,
      updatedAt: toDatabaseTimestamp(updatedAt)!,
    }).changes !== 1) return null;
    return this.findMembership(libraryId, accountId);
  }

  deleteMembership(libraryId: string, accountId: string): boolean {
    return this.#deleteMembership.run(libraryId, accountId).changes === 1;
  }

  listHoldings(libraryId: string, limit: number): LibraryHolding[] {
    return this.#listHoldings.all(libraryId, limit).map(toHolding);
  }

  listHoldingsPage(libraryId: string, after: HoldingCursor | null, limit: number): LibraryHolding[] {
    return this.#listHoldingsPage.all({
      libraryId,
      afterCreatedAt: after ? toDatabaseTimestamp(after.artifactCreatedAt) : null,
      afterArtifactId: after?.artifactId ?? null,
      limit,
    }).map(toHolding);
  }

  listHoldingsSorted(
    libraryId: string,
    sort: LibraryHoldingSort,
    after: { primary: string; secondary: string; fileId: string } | null,
    limit: number,
  ): LibraryHolding[] {
    const statement = this.#listSorted.get(sort)!;
    const primary: string | number | null = sort === "size_asc" || sort === "size_desc"
      ? after ? Number(after.primary) : null
      : after?.primary ?? null;
    return statement.all({
      libraryId,
      afterPrimary: primary,
      afterSecondary: after?.secondary ?? null,
      afterFileId: after?.fileId || null,
      limit,
    }).map(toHolding);
  }

  findHoldingByFile(libraryId: string, fileId: string): LibraryHolding | null {
    const row = this.#findHoldingByFile.get(libraryId, fileId);
    return row ? toHolding(row) : null;
  }

  hasAvailableNameConflict(libraryId: string, displayName: string): boolean {
    return this.#hasAvailableNameConflict.get(displayName, libraryId) !== undefined;
  }

  listRecycledHoldings(libraryId: string): LibraryRecycledHolding[] {
    return this.#listRecycledHoldings.all(libraryId).map(toRecycledHolding);
  }

  findRecycledHoldingByFile(libraryId: string, fileId: string): LibraryRecycledHolding | null {
    const row = this.#findRecycledHoldingByFile.get(libraryId, fileId);
    return row ? toRecycledHolding(row) : null;
  }

  verifyRecycledHoldingExclusive(
    libraryId: string,
    groupId: string,
    recordId: string,
    artifactId: string,
    versionId: string,
    fileId: string,
    fileState: Extract<StoredFileState, "deleted" | "purging">,
    attachmentState: ScholarlyAttachmentState,
  ): boolean {
    return this.#verifyRecycledHoldingExclusive.get({
      libraryId,
      groupId,
      recordId,
      artifactId,
      versionId,
      fileId,
      fileState,
      attachmentState,
    })?.exclusive === 1;
  }
}
