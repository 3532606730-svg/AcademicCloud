import type { LibraryRepository } from "../../library/repositories.js";
import type { Library, LibraryHolding, LibraryMembership, LibraryRole, NewLibrary, NewLibraryMembership } from "../../library/library.js";
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
  return {
    libraryId: row.library_id,
    recordId: row.record_id,
    recordLabel: row.record_label,
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
  readonly #findHoldingByFile;

  constructor(database: SqliteDatabase) {
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
      JOIN files
        ON files.id = scholarly_artifact_versions.stored_file_id
       AND files.owner_domain_id = libraries.owner_domain_id
       AND files.state = 'active'
      WHERE libraries.id = ?
      ORDER BY scholarly_artifacts.created_at DESC, scholarly_artifacts.id DESC
      LIMIT ?
    `);
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
      JOIN files
        ON files.id = scholarly_artifact_versions.stored_file_id
       AND files.owner_domain_id = libraries.owner_domain_id
       AND files.state = 'active'
      WHERE libraries.id = ? AND files.id = ?
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

  findHoldingByFile(libraryId: string, fileId: string): LibraryHolding | null {
    const row = this.#findHoldingByFile.get(libraryId, fileId);
    return row ? toHolding(row) : null;
  }
}
