import type {
  AuthorityRole,
  AuthorityType,
  CanonicalMetadata,
  MaterialType,
  MetadataAuthorityLink,
  MetadataIdentifier,
  NewScholarlyAuthority,
  ScholarlyAuthority,
  TypeFieldName,
} from "../../metadata/metadata.js";
import { TYPE_FIELD_NAMES } from "../../metadata/metadata.js";
import type {
  CanonicalMetadataRepository,
  SaveMetadataInput,
  UpdateAuthorityInput,
} from "../../metadata/repositories.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface MetadataRow {
  record_id: string;
  owner_domain_id: string;
  contract_version: number;
  material_type: MaterialType;
  canonical_title: string;
  subtitle: string | null;
  date_statement: string | null;
  revision: number;
  created_by_account_id: string;
  updated_by_account_id: string;
  created_at: string;
  updated_at: string;
}

interface AlternativeTitleRow { title: string; }
interface IdentifierRow { scheme: string; value: string; }
interface TypeFieldRow { field_name: DatabaseTypeFieldName; value: string; }
interface AuthorityLinkRow { authority_id: string; role: AuthorityRole; }

interface AuthorityRow {
  id: string;
  owner_domain_id: string;
  authority_type: AuthorityType;
  canonical_label: string;
  revision: number;
  created_by_account_id: string;
  updated_by_account_id: string;
  created_at: string;
  updated_at: string;
}

interface AuthorityAliasRow { alias: string; }

type DatabaseTypeFieldName =
  | "edition_statement"
  | "volume_statement"
  | "issue_statement"
  | "locator"
  | "shelfmark"
  | "support_statement"
  | "extent_statement"
  | "script_statement"
  | "object_type"
  | "material_statement"
  | "dimensions_statement"
  | "document_type"
  | "fonds_or_collection"
  | "series_statement"
  | "reference_code";

const FIELD_TO_DATABASE: Readonly<Record<TypeFieldName, DatabaseTypeFieldName>> = {
  editionStatement: "edition_statement",
  volumeStatement: "volume_statement",
  issueStatement: "issue_statement",
  locator: "locator",
  shelfmark: "shelfmark",
  supportStatement: "support_statement",
  extentStatement: "extent_statement",
  scriptStatement: "script_statement",
  objectType: "object_type",
  materialStatement: "material_statement",
  dimensionsStatement: "dimensions_statement",
  documentType: "document_type",
  fondsOrCollection: "fonds_or_collection",
  seriesStatement: "series_statement",
  referenceCode: "reference_code",
};

const FIELD_FROM_DATABASE = Object.fromEntries(
  Object.entries(FIELD_TO_DATABASE).map(([key, value]) => [value, key]),
) as Readonly<Record<DatabaseTypeFieldName, TypeFieldName>>;

const metadataColumns = `
  record_id, owner_domain_id, contract_version, material_type,
  canonical_title, subtitle, date_statement, revision,
  created_by_account_id, updated_by_account_id, created_at, updated_at
`;

const authorityColumns = `
  id, owner_domain_id, authority_type, canonical_label, revision,
  created_by_account_id, updated_by_account_id, created_at, updated_at
`;

export class SqliteCanonicalMetadataRepository implements CanonicalMetadataRepository {
  readonly #findMetadata;
  readonly #listAlternativeTitles;
  readonly #listIdentifiers;
  readonly #listTypeFields;
  readonly #listAuthorityLinks;
  readonly #insertMetadata;
  readonly #updateMetadata;
  readonly #deleteAlternativeTitles;
  readonly #deleteIdentifiers;
  readonly #deleteTypeFields;
  readonly #deleteAuthorityLinks;
  readonly #insertAlternativeTitle;
  readonly #insertIdentifier;
  readonly #insertTypeField;
  readonly #insertAuthorityLink;
  readonly #findAuthority;
  readonly #listAuthorities;
  readonly #listAuthorityAliases;
  readonly #insertAuthority;
  readonly #updateAuthority;
  readonly #deleteAuthorityAliases;
  readonly #insertAuthorityAlias;

  constructor(database: SqliteDatabase) {
    this.#findMetadata = database.prepare<[string, string], MetadataRow>(`
      SELECT ${metadataColumns}
      FROM scholarly_record_metadata
      WHERE owner_domain_id = ? AND record_id = ?
    `);
    this.#listAlternativeTitles = database.prepare<[string, string], AlternativeTitleRow>(`
      SELECT title FROM scholarly_record_alternative_titles
      WHERE record_id = ? AND owner_domain_id = ? ORDER BY position
    `);
    this.#listIdentifiers = database.prepare<[string, string], IdentifierRow>(`
      SELECT scheme, value FROM scholarly_record_identifiers
      WHERE record_id = ? AND owner_domain_id = ? ORDER BY position
    `);
    this.#listTypeFields = database.prepare<[string, string], TypeFieldRow>(`
      SELECT field_name, value FROM scholarly_record_type_fields
      WHERE record_id = ? AND owner_domain_id = ? ORDER BY field_name
    `);
    this.#listAuthorityLinks = database.prepare<[string, string], AuthorityLinkRow>(`
      SELECT authority_id, role FROM scholarly_record_authority_links
      WHERE record_id = ? AND owner_domain_id = ? ORDER BY position
    `);
    this.#insertMetadata = database.prepare<{
      recordId: string;
      ownerDomainId: string;
      materialType: MaterialType;
      canonicalTitle: string;
      subtitle: string | null;
      dateStatement: string | null;
      actorAccountId: string;
      now: string;
    }>(`
      INSERT INTO scholarly_record_metadata (
        record_id, owner_domain_id, contract_version, material_type,
        canonical_title, subtitle, date_statement, revision,
        created_by_account_id, updated_by_account_id, created_at, updated_at
      ) VALUES (
        @recordId, @ownerDomainId, 1, @materialType,
        @canonicalTitle, @subtitle, @dateStatement, 1,
        @actorAccountId, @actorAccountId, @now, @now
      )
    `);
    this.#updateMetadata = database.prepare<{
      recordId: string;
      ownerDomainId: string;
      materialType: MaterialType;
      canonicalTitle: string;
      subtitle: string | null;
      dateStatement: string | null;
      expectedRevision: number;
      actorAccountId: string;
      now: string;
    }>(`
      UPDATE scholarly_record_metadata
      SET material_type = @materialType,
          canonical_title = @canonicalTitle,
          subtitle = @subtitle,
          date_statement = @dateStatement,
          revision = revision + 1,
          updated_by_account_id = @actorAccountId,
          updated_at = @now
      WHERE record_id = @recordId
        AND owner_domain_id = @ownerDomainId
        AND revision = @expectedRevision
    `);
    this.#deleteAlternativeTitles = database.prepare<[string, string]>(`
      DELETE FROM scholarly_record_alternative_titles WHERE record_id = ? AND owner_domain_id = ?
    `);
    this.#deleteIdentifiers = database.prepare<[string, string]>(`
      DELETE FROM scholarly_record_identifiers WHERE record_id = ? AND owner_domain_id = ?
    `);
    this.#deleteTypeFields = database.prepare<[string, string]>(`
      DELETE FROM scholarly_record_type_fields WHERE record_id = ? AND owner_domain_id = ?
    `);
    this.#deleteAuthorityLinks = database.prepare<[string, string]>(`
      DELETE FROM scholarly_record_authority_links WHERE record_id = ? AND owner_domain_id = ?
    `);
    this.#insertAlternativeTitle = database.prepare<{
      recordId: string; ownerDomainId: string; position: number; title: string;
    }>(`
      INSERT INTO scholarly_record_alternative_titles (record_id, owner_domain_id, position, title)
      VALUES (@recordId, @ownerDomainId, @position, @title)
    `);
    this.#insertIdentifier = database.prepare<{
      recordId: string; ownerDomainId: string; position: number; scheme: string; value: string;
    }>(`
      INSERT INTO scholarly_record_identifiers (record_id, owner_domain_id, position, scheme, value)
      VALUES (@recordId, @ownerDomainId, @position, @scheme, @value)
    `);
    this.#insertTypeField = database.prepare<{
      recordId: string; ownerDomainId: string; fieldName: DatabaseTypeFieldName; value: string;
    }>(`
      INSERT INTO scholarly_record_type_fields (record_id, owner_domain_id, field_name, value)
      VALUES (@recordId, @ownerDomainId, @fieldName, @value)
    `);
    this.#insertAuthorityLink = database.prepare<{
      recordId: string; ownerDomainId: string; position: number; authorityId: string; role: AuthorityRole;
    }>(`
      INSERT INTO scholarly_record_authority_links (
        record_id, owner_domain_id, position, authority_id, role
      ) VALUES (@recordId, @ownerDomainId, @position, @authorityId, @role)
    `);
    this.#findAuthority = database.prepare<[string, string], AuthorityRow>(`
      SELECT ${authorityColumns}
      FROM scholarly_authorities
      WHERE owner_domain_id = ? AND id = ?
    `);
    this.#listAuthorities = database.prepare<{
      ownerDomainId: string; type: AuthorityType; beforeId: string | null; limit: number;
    }, AuthorityRow>(`
      SELECT ${authorityColumns}
      FROM scholarly_authorities
      WHERE owner_domain_id = @ownerDomainId
        AND authority_type = @type
        AND (@beforeId IS NULL OR id < @beforeId)
      ORDER BY id DESC
      LIMIT @limit
    `);
    this.#listAuthorityAliases = database.prepare<[string, string], AuthorityAliasRow>(`
      SELECT alias FROM scholarly_authority_aliases
      WHERE authority_id = ? AND owner_domain_id = ? ORDER BY position
    `);
    this.#insertAuthority = database.prepare<{
      id: string;
      ownerDomainId: string;
      type: AuthorityType;
      canonicalLabel: string;
      revision: number;
      createdByAccountId: string;
      updatedByAccountId: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      INSERT INTO scholarly_authorities (
        id, owner_domain_id, authority_type, canonical_label, revision,
        created_by_account_id, updated_by_account_id, created_at, updated_at
      ) VALUES (
        @id, @ownerDomainId, @type, @canonicalLabel, @revision,
        @createdByAccountId, @updatedByAccountId, @createdAt, @updatedAt
      )
    `);
    this.#updateAuthority = database.prepare<{
      ownerDomainId: string;
      authorityId: string;
      canonicalLabel: string;
      expectedRevision: number;
      actorAccountId: string;
      now: string;
    }>(`
      UPDATE scholarly_authorities
      SET canonical_label = @canonicalLabel,
          revision = revision + 1,
          updated_by_account_id = @actorAccountId,
          updated_at = @now
      WHERE owner_domain_id = @ownerDomainId
        AND id = @authorityId
        AND revision = @expectedRevision
    `);
    this.#deleteAuthorityAliases = database.prepare<[string, string]>(`
      DELETE FROM scholarly_authority_aliases WHERE authority_id = ? AND owner_domain_id = ?
    `);
    this.#insertAuthorityAlias = database.prepare<{
      authorityId: string; ownerDomainId: string; position: number; alias: string;
    }>(`
      INSERT INTO scholarly_authority_aliases (authority_id, owner_domain_id, position, alias)
      VALUES (@authorityId, @ownerDomainId, @position, @alias)
    `);
  }

  findMetadata(ownerDomainId: string, recordId: string): CanonicalMetadata | null {
    const row = this.#findMetadata.get(ownerDomainId, recordId);
    if (!row) return null;
    const typeFields: Partial<Record<TypeFieldName, string>> = {};
    for (const field of this.#listTypeFields.all(recordId, ownerDomainId)) {
      typeFields[FIELD_FROM_DATABASE[field.field_name]] = field.value;
    }
    return {
      recordId: row.record_id,
      ownerDomainId: row.owner_domain_id,
      contractVersion: 1,
      materialType: row.material_type,
      canonicalTitle: row.canonical_title,
      ...(row.subtitle === null ? {} : { subtitle: row.subtitle }),
      alternativeTitles: this.#listAlternativeTitles.all(recordId, ownerDomainId).map((entry) => entry.title),
      ...(row.date_statement === null ? {} : { dateStatement: row.date_statement }),
      identifiers: this.#listIdentifiers.all(recordId, ownerDomainId).map((entry): MetadataIdentifier => ({
        scheme: entry.scheme,
        value: entry.value,
      })),
      typeFields,
      authorityLinks: this.#listAuthorityLinks.all(recordId, ownerDomainId).map((entry): MetadataAuthorityLink => ({
        authorityId: entry.authority_id,
        role: entry.role,
      })),
      revision: row.revision,
      createdByAccountId: row.created_by_account_id,
      updatedByAccountId: row.updated_by_account_id,
      createdAt: fromDatabaseTimestamp(row.created_at)!,
      updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    };
  }

  saveMetadata(input: SaveMetadataInput): CanonicalMetadata | null {
    const now = toDatabaseTimestamp(input.now)!;
    const parent = {
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      materialType: input.materialType,
      canonicalTitle: input.canonicalTitle,
      subtitle: input.subtitle ?? null,
      dateStatement: input.dateStatement ?? null,
      actorAccountId: input.actorAccountId,
      now,
    };
    if (input.expectedRevision === null) {
      this.#insertMetadata.run(parent);
    } else if (this.#updateMetadata.run({ ...parent, expectedRevision: input.expectedRevision }).changes !== 1) {
      return null;
    }

    this.#deleteAlternativeTitles.run(input.recordId, input.ownerDomainId);
    this.#deleteIdentifiers.run(input.recordId, input.ownerDomainId);
    this.#deleteTypeFields.run(input.recordId, input.ownerDomainId);
    this.#deleteAuthorityLinks.run(input.recordId, input.ownerDomainId);

    input.alternativeTitles.forEach((title, position) => this.#insertAlternativeTitle.run({
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      position,
      title,
    }));
    input.identifiers.forEach((identifier, position) => this.#insertIdentifier.run({
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      position,
      scheme: identifier.scheme,
      value: identifier.value,
    }));
    for (const fieldName of TYPE_FIELD_NAMES) {
      const value = input.typeFields[fieldName];
      if (value === undefined) continue;
      this.#insertTypeField.run({
        recordId: input.recordId,
        ownerDomainId: input.ownerDomainId,
        fieldName: FIELD_TO_DATABASE[fieldName],
        value,
      });
    }
    input.authorityLinks.forEach((link, position) => this.#insertAuthorityLink.run({
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      position,
      authorityId: link.authorityId,
      role: link.role,
    }));
    return this.findMetadata(input.ownerDomainId, input.recordId);
  }

  findAuthority(ownerDomainId: string, authorityId: string): ScholarlyAuthority | null {
    const row = this.#findAuthority.get(ownerDomainId, authorityId);
    return row ? this.#toAuthority(row) : null;
  }

  listAuthorities(ownerDomainId: string, type: AuthorityType, beforeId: string | null, limit: number): ScholarlyAuthority[] {
    return this.#listAuthorities.all({ ownerDomainId, type, beforeId, limit }).map((row) => this.#toAuthority(row));
  }

  createAuthority(authority: NewScholarlyAuthority): ScholarlyAuthority {
    this.#insertAuthority.run({
      id: authority.id,
      ownerDomainId: authority.ownerDomainId,
      type: authority.type,
      canonicalLabel: authority.canonicalLabel,
      revision: authority.revision,
      createdByAccountId: authority.createdByAccountId,
      updatedByAccountId: authority.updatedByAccountId,
      createdAt: toDatabaseTimestamp(authority.createdAt)!,
      updatedAt: toDatabaseTimestamp(authority.updatedAt)!,
    });
    authority.aliases.forEach((alias, position) => this.#insertAuthorityAlias.run({
      authorityId: authority.id,
      ownerDomainId: authority.ownerDomainId,
      position,
      alias,
    }));
    return this.findAuthority(authority.ownerDomainId, authority.id)!;
  }

  updateAuthority(input: UpdateAuthorityInput): ScholarlyAuthority | null {
    if (this.#updateAuthority.run({
      ownerDomainId: input.ownerDomainId,
      authorityId: input.authorityId,
      canonicalLabel: input.canonicalLabel,
      expectedRevision: input.expectedRevision,
      actorAccountId: input.actorAccountId,
      now: toDatabaseTimestamp(input.now)!,
    }).changes !== 1) return null;
    this.#deleteAuthorityAliases.run(input.authorityId, input.ownerDomainId);
    input.aliases.forEach((alias, position) => this.#insertAuthorityAlias.run({
      authorityId: input.authorityId,
      ownerDomainId: input.ownerDomainId,
      position,
      alias,
    }));
    return this.findAuthority(input.ownerDomainId, input.authorityId);
  }

  #toAuthority(row: AuthorityRow): ScholarlyAuthority {
    return {
      id: row.id,
      ownerDomainId: row.owner_domain_id,
      type: row.authority_type,
      canonicalLabel: row.canonical_label,
      aliases: this.#listAuthorityAliases.all(row.id, row.owner_domain_id).map((entry) => entry.alias),
      revision: row.revision,
      createdByAccountId: row.created_by_account_id,
      updatedByAccountId: row.updated_by_account_id,
      createdAt: fromDatabaseTimestamp(row.created_at)!,
      updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    };
  }
}
