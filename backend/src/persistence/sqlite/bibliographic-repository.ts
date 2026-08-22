import type { ScholarlyAuthority } from "../../metadata/metadata.js";
import type {
  BibliographicContributor,
  BibliographicFieldAuthority,
  BibliographicFieldName,
  BibliographicProfile,
  ContributorRole,
  EditionType,
  MaterialClass,
} from "../../bibliography/bibliography.js";
import type {
  BibliographicRepository,
  BibliographicAiRunEvidence,
  SaveBibliographicProfileInput,
  SetFieldAuthorityInput,
} from "../../bibliography/repositories.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface ProfileRow {
  record_id: string;
  owner_domain_id: string;
  contract_version: number;
  material_class: MaterialClass;
  publication_publisher: string | null;
  publication_place: string | null;
  publication_date: string | null;
  edition_number: string | null;
  printing: string | null;
  series_title: string | null;
  volume_part: string | null;
  language_label: string | null;
  carrier_edition_type: EditionType | null;
  carrier_edition_statement: string | null;
  carrier_facsimile_statement: string | null;
  revision: number;
  created_by_account_id: string;
  updated_by_account_id: string;
  created_at: string;
  updated_at: string;
}

interface ContributorRow {
  id: string;
  label: string;
  role: ContributorRole;
  role_label: string | null;
  authority_id: string | null;
}

interface SourceEditionRow {
  dynasty: string | null;
  reign_title: string | null;
  reign_year: string | null;
  absolute_year: number | null;
  printer: string | null;
  imprint: string | null;
  bookshop: string | null;
  institution: string | null;
  printing_place: string | null;
  edition_type: EditionType | null;
  edition_statement: string | null;
  holding_information: string | null;
}

interface FieldAuthorityRow {
  record_id: string;
  owner_domain_id: string;
  field_name: BibliographicFieldName;
  scope_key: string;
  authority_source: "human" | "ai";
  source_run_id: string | null;
  actor_account_id: string | null;
  established_at: string;
}

interface ExactAuthorityRow {
  id: string;
  owner_domain_id: string;
  authority_type: "person";
  canonical_label: string;
  revision: number;
  created_by_account_id: string;
  updated_by_account_id: string;
  created_at: string;
  updated_at: string;
}

interface AliasRow { alias: string; }

interface AiRunRow {
  id: string;
  owner_domain_id: string;
  record_id: string;
  file_id: string;
  suggestion_run_id: string;
  status: BibliographicAiRunEvidence["status"];
  overall_confidence: number;
  structured_output_json: string;
  structured_output_sha256: string;
  prompt_version: BibliographicAiRunEvidence["promptVersion"];
  ocr_engine_id: string;
  reasoning_engine_id: string;
  selected_pages_json: string;
  auto_applied: number;
  applied_fields_json: string;
  created_at: string;
}

const profileColumns = `
  record_id, owner_domain_id, contract_version, material_class,
  publication_publisher, publication_place, publication_date, edition_number,
  printing, series_title, volume_part, language_label, carrier_edition_type,
  carrier_edition_statement, carrier_facsimile_statement, revision,
  created_by_account_id, updated_by_account_id, created_at, updated_at
`;

export class SqliteBibliographicRepository implements BibliographicRepository {
  readonly #database: SqliteDatabase;
  readonly #findProfile;
  readonly #listContributors;
  readonly #findSourceEdition;
  readonly #insertProfile;
  readonly #updateProfile;
  readonly #deleteContributors;
  readonly #insertContributor;
  readonly #deleteSourceEdition;
  readonly #insertSourceEdition;
  readonly #listFieldAuthorities;
  readonly #upsertFieldAuthority;
  readonly #deleteFieldAuthority;
  readonly #findExactAuthorities;
  readonly #listAuthorityAliases;
  readonly #insertAiRunEvidence;
  readonly #findAiRunEvidence;

  constructor(database: SqliteDatabase) {
    this.#database = database;
    this.#findProfile = database.prepare<[string, string], ProfileRow>(`
      SELECT ${profileColumns}
      FROM scholarly_bibliographic_profiles
      WHERE owner_domain_id = ? AND record_id = ?
    `);
    this.#listContributors = database.prepare<[string, string], ContributorRow>(`
      SELECT id, label, role, role_label, authority_id
      FROM scholarly_bibliographic_contributors
      WHERE record_id = ? AND owner_domain_id = ?
      ORDER BY position
    `);
    this.#findSourceEdition = database.prepare<[string, string], SourceEditionRow>(`
      SELECT dynasty, reign_title, reign_year, absolute_year, printer, imprint,
        bookshop, institution, printing_place, edition_type, edition_statement,
        holding_information
      FROM scholarly_bibliographic_source_editions
      WHERE record_id = ? AND owner_domain_id = ?
    `);
    this.#insertProfile = database.prepare(`
      INSERT INTO scholarly_bibliographic_profiles (
        record_id, owner_domain_id, material_class, publication_publisher,
        publication_place, publication_date, edition_number, printing,
        series_title, volume_part, language_label, carrier_edition_type,
        carrier_edition_statement, carrier_facsimile_statement, revision,
        created_by_account_id, updated_by_account_id, created_at, updated_at
      ) VALUES (
        @recordId, @ownerDomainId, @materialClass, @publicationPublisher,
        @publicationPlace, @publicationDate, @editionNumber, @printing,
        @series, @volume, @language, @carrierEditionType,
        @carrierEditionStatement, @carrierFacsimileStatement, 1,
        @actorAccountId, @actorAccountId, @now, @now
      )
    `);
    this.#updateProfile = database.prepare(`
      UPDATE scholarly_bibliographic_profiles
      SET material_class = @materialClass,
          publication_publisher = @publicationPublisher,
          publication_place = @publicationPlace,
          publication_date = @publicationDate,
          edition_number = @editionNumber,
          printing = @printing,
          series_title = @series,
          volume_part = @volume,
          language_label = @language,
          carrier_edition_type = @carrierEditionType,
          carrier_edition_statement = @carrierEditionStatement,
          carrier_facsimile_statement = @carrierFacsimileStatement,
          revision = revision + 1,
          updated_by_account_id = @actorAccountId,
          updated_at = @now
      WHERE record_id = @recordId AND owner_domain_id = @ownerDomainId
        AND revision = @expectedRevision
    `);
    this.#deleteContributors = database.prepare("DELETE FROM scholarly_bibliographic_contributors WHERE record_id = ? AND owner_domain_id = ?");
    this.#insertContributor = database.prepare(`
      INSERT INTO scholarly_bibliographic_contributors (
        id, record_id, owner_domain_id, position, label, role, role_label, authority_id
      ) VALUES (@id, @recordId, @ownerDomainId, @position, @label, @role, @roleLabel, @authorityId)
    `);
    this.#deleteSourceEdition = database.prepare("DELETE FROM scholarly_bibliographic_source_editions WHERE record_id = ? AND owner_domain_id = ?");
    this.#insertSourceEdition = database.prepare(`
      INSERT INTO scholarly_bibliographic_source_editions (
        record_id, owner_domain_id, dynasty, reign_title, reign_year, absolute_year,
        printer, imprint, bookshop, institution, printing_place, edition_type,
        edition_statement, holding_information
      ) VALUES (
        @recordId, @ownerDomainId, @dynasty, @reignTitle, @reignYear, @absoluteYear,
        @printer, @imprint, @bookshop, @institution, @printingPlace, @editionType,
        @editionStatement, @holdingInformation
      )
    `);
    this.#listFieldAuthorities = database.prepare<[string, string], FieldAuthorityRow>(`
      SELECT record_id, owner_domain_id, field_name, scope_key, authority_source,
        source_run_id, actor_account_id, established_at
      FROM scholarly_bibliographic_field_authority
      WHERE owner_domain_id = ? AND record_id = ?
      ORDER BY field_name, scope_key
    `);
    this.#upsertFieldAuthority = database.prepare(`
      INSERT INTO scholarly_bibliographic_field_authority (
        record_id, owner_domain_id, field_name, scope_key, authority_source,
        source_run_id, actor_account_id, established_at
      ) VALUES (
        @recordId, @ownerDomainId, @fieldName, @scopeKey, @source,
        @sourceRunId, @actorAccountId, @now
      )
      ON CONFLICT(record_id, field_name, scope_key) DO UPDATE SET
        authority_source = excluded.authority_source,
        source_run_id = excluded.source_run_id,
        actor_account_id = excluded.actor_account_id,
        established_at = excluded.established_at
    `);
    this.#deleteFieldAuthority = database.prepare(`
      DELETE FROM scholarly_bibliographic_field_authority
      WHERE owner_domain_id = ? AND record_id = ? AND field_name = ? AND scope_key = ?
    `);
    this.#findExactAuthorities = database.prepare<[string, string, string], ExactAuthorityRow>(`
      SELECT DISTINCT a.id, a.owner_domain_id, a.authority_type, a.canonical_label,
        a.revision, a.created_by_account_id, a.updated_by_account_id, a.created_at, a.updated_at
      FROM scholarly_authorities a
      LEFT JOIN scholarly_authority_aliases aliases
        ON aliases.authority_id = a.id AND aliases.owner_domain_id = a.owner_domain_id
      WHERE a.owner_domain_id = ? AND a.authority_type = 'person'
        AND (a.canonical_label = ? OR aliases.alias = ?)
      ORDER BY a.id
    `);
    this.#listAuthorityAliases = database.prepare<[string, string], AliasRow>(`
      SELECT alias FROM scholarly_authority_aliases
      WHERE authority_id = ? AND owner_domain_id = ? ORDER BY position
    `);
    this.#insertAiRunEvidence = database.prepare(`
      INSERT INTO scholarly_bibliographic_ai_runs (
        id, owner_domain_id, record_id, file_id, suggestion_run_id,
        contract_version, ruleset_version, status, overall_confidence,
        structured_output_json, structured_output_sha256, prompt_version,
        ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      ) VALUES (
        @id, @ownerDomainId, @recordId, @fileId, @suggestionRunId,
        1, 'l1-intelligent-library01-v1', @status, @overallConfidence,
        @structuredOutputJson, @structuredOutputSha256, @promptVersion,
        @ocrEngineId, @reasoningEngineId, @selectedPagesJson, @autoApplied,
        @appliedFieldsJson, @createdAt
      )
    `);
    this.#findAiRunEvidence = database.prepare<[string, string], AiRunRow>(`
      SELECT id, owner_domain_id, record_id, file_id, suggestion_run_id,
        status, overall_confidence, structured_output_json,
        structured_output_sha256, prompt_version, ocr_engine_id,
        reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      FROM scholarly_bibliographic_ai_runs
      WHERE owner_domain_id = ? AND id = ?
    `);
  }

  findProfile(ownerDomainId: string, recordId: string): BibliographicProfile | null {
    const row = this.#findProfile.get(ownerDomainId, recordId);
    if (!row) return null;
    const source = this.#findSourceEdition.get(recordId, ownerDomainId);
    const contributors = this.#listContributors.all(recordId, ownerDomainId).map((entry): BibliographicContributor => ({
      id: entry.id,
      label: entry.label,
      role: entry.role,
      ...(entry.role_label === null ? {} : { roleLabel: entry.role_label }),
      ...(entry.authority_id === null ? {} : { authorityId: entry.authority_id }),
    }));
    return {
      recordId: row.record_id,
      ownerDomainId: row.owner_domain_id,
      contractVersion: 1,
      materialClass: row.material_class,
      contributors,
      publication: compact({
        publisher: row.publication_publisher ?? undefined,
        place: row.publication_place ?? undefined,
        publicationDate: row.publication_date ?? undefined,
        editionNumber: row.edition_number ?? undefined,
        printing: row.printing ?? undefined,
      }),
      ...(row.series_title === null ? {} : { series: row.series_title }),
      ...(row.volume_part === null ? {} : { volume: row.volume_part }),
      ...(row.language_label === null ? {} : { language: row.language_label }),
      carrierEdition: compact({
        editionType: row.carrier_edition_type ?? undefined,
        editionStatement: row.carrier_edition_statement ?? undefined,
        facsimileStatement: row.carrier_facsimile_statement ?? undefined,
      }),
      sourceEdition: source ? compact({
        dynasty: source.dynasty ?? undefined,
        reignTitle: source.reign_title ?? undefined,
        reignYear: source.reign_year ?? undefined,
        absoluteYear: source.absolute_year ?? undefined,
        printer: source.printer ?? undefined,
        imprint: source.imprint ?? undefined,
        bookshop: source.bookshop ?? undefined,
        institution: source.institution ?? undefined,
        printingPlace: source.printing_place ?? undefined,
        editionType: source.edition_type ?? undefined,
        editionStatement: source.edition_statement ?? undefined,
        holdingInformation: source.holding_information ?? undefined,
      }) : {},
      revision: row.revision,
      createdByAccountId: row.created_by_account_id,
      updatedByAccountId: row.updated_by_account_id,
      createdAt: fromDatabaseTimestamp(row.created_at)!,
      updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    };
  }

  saveProfile(input: SaveBibliographicProfileInput): BibliographicProfile | null {
    const contributorIds = new Set(input.contributors.flatMap((entry) => entry.id ? [entry.id] : []));
    if (contributorIds.size !== input.contributors.length) throw new Error("bibliographic contributors require stable unique ids");
    const parameters = {
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      materialClass: input.materialClass,
      publicationPublisher: input.publication.publisher ?? null,
      publicationPlace: input.publication.place ?? null,
      publicationDate: input.publication.publicationDate ?? null,
      editionNumber: input.publication.editionNumber ?? null,
      printing: input.publication.printing ?? null,
      series: input.series ?? null,
      volume: input.volume ?? null,
      language: input.language ?? null,
      carrierEditionType: input.carrierEdition.editionType ?? null,
      carrierEditionStatement: input.carrierEdition.editionStatement ?? null,
      carrierFacsimileStatement: input.carrierEdition.facsimileStatement ?? null,
      actorAccountId: input.actorAccountId,
      now: toDatabaseTimestamp(input.now)!,
    };
    if (input.expectedRevision === null) this.#insertProfile.run(parameters);
    else if (this.#updateProfile.run({ ...parameters, expectedRevision: input.expectedRevision }).changes !== 1) return null;

    this.#deleteContributors.run(input.recordId, input.ownerDomainId);
    input.contributors.forEach((contributor, position) => this.#insertContributor.run({
      id: contributor.id!,
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      position,
      label: contributor.label,
      role: contributor.role,
      roleLabel: contributor.roleLabel ?? null,
      authorityId: contributor.authorityId ?? null,
    }));
    for (const authority of this.listFieldAuthorities(input.ownerDomainId, input.recordId)) {
      if (authority.scopeKey && !contributorIds.has(authority.scopeKey)) {
        this.#deleteFieldAuthority.run(input.ownerDomainId, input.recordId, authority.fieldName, authority.scopeKey);
      }
    }

    this.#deleteSourceEdition.run(input.recordId, input.ownerDomainId);
    if (Object.keys(input.sourceEdition).length > 0) this.#insertSourceEdition.run({
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      dynasty: input.sourceEdition.dynasty ?? null,
      reignTitle: input.sourceEdition.reignTitle ?? null,
      reignYear: input.sourceEdition.reignYear ?? null,
      absoluteYear: input.sourceEdition.absoluteYear ?? null,
      printer: input.sourceEdition.printer ?? null,
      imprint: input.sourceEdition.imprint ?? null,
      bookshop: input.sourceEdition.bookshop ?? null,
      institution: input.sourceEdition.institution ?? null,
      printingPlace: input.sourceEdition.printingPlace ?? null,
      editionType: input.sourceEdition.editionType ?? null,
      editionStatement: input.sourceEdition.editionStatement ?? null,
      holdingInformation: input.sourceEdition.holdingInformation ?? null,
    });
    return this.findProfile(input.ownerDomainId, input.recordId);
  }

  listFieldAuthorities(ownerDomainId: string, recordId: string): BibliographicFieldAuthority[] {
    return this.#listFieldAuthorities.all(ownerDomainId, recordId).map((row) => ({
      recordId: row.record_id,
      ownerDomainId: row.owner_domain_id,
      fieldName: row.field_name,
      scopeKey: row.scope_key,
      source: row.authority_source,
      ...(row.source_run_id === null ? {} : { sourceRunId: row.source_run_id }),
      ...(row.actor_account_id === null ? {} : { actorAccountId: row.actor_account_id }),
      establishedAt: fromDatabaseTimestamp(row.established_at)!,
    }));
  }

  setFieldAuthority(input: SetFieldAuthorityInput): void {
    this.#upsertFieldAuthority.run({
      recordId: input.recordId,
      ownerDomainId: input.ownerDomainId,
      fieldName: input.fieldName,
      scopeKey: input.scopeKey,
      source: input.source,
      sourceRunId: input.sourceRunId ?? null,
      actorAccountId: input.actorAccountId ?? null,
      now: toDatabaseTimestamp(input.now)!,
    });
  }

  clearFieldAuthorities(ownerDomainId: string, recordId: string, fields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }>): void {
    for (const field of fields) this.#deleteFieldAuthority.run(ownerDomainId, recordId, field.fieldName, field.scopeKey);
  }

  findExactPersonAuthorities(ownerDomainId: string, label: string): ScholarlyAuthority[] {
    return this.#findExactAuthorities.all(ownerDomainId, label, label).map((row) => ({
      id: row.id,
      ownerDomainId: row.owner_domain_id,
      type: "person",
      canonicalLabel: row.canonical_label,
      aliases: this.#listAuthorityAliases.all(row.id, row.owner_domain_id).map((entry) => entry.alias),
      revision: row.revision,
      createdByAccountId: row.created_by_account_id,
      updatedByAccountId: row.updated_by_account_id,
      createdAt: fromDatabaseTimestamp(row.created_at)!,
      updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    }));
  }

  createAiRunEvidence(evidence: BibliographicAiRunEvidence): BibliographicAiRunEvidence {
    this.#insertAiRunEvidence.run({
      ...evidence,
      selectedPagesJson: JSON.stringify(evidence.selectedPages),
      autoApplied: evidence.autoApplied ? 1 : 0,
      appliedFieldsJson: JSON.stringify(evidence.appliedFields),
      createdAt: toDatabaseTimestamp(evidence.createdAt)!,
    });
    return this.findAiRunEvidence(evidence.ownerDomainId, evidence.id)!;
  }

  findAiRunEvidence(ownerDomainId: string, id: string): BibliographicAiRunEvidence | null {
    const row = this.#findAiRunEvidence.get(ownerDomainId, id);
    if (!row) return null;
    return {
      id: row.id,
      ownerDomainId: row.owner_domain_id,
      recordId: row.record_id,
      fileId: row.file_id,
      suggestionRunId: row.suggestion_run_id,
      status: row.status,
      overallConfidence: row.overall_confidence,
      structuredOutputJson: row.structured_output_json,
      structuredOutputSha256: row.structured_output_sha256,
      promptVersion: row.prompt_version,
      ocrEngineId: row.ocr_engine_id,
      reasoningEngineId: row.reasoning_engine_id,
      selectedPages: JSON.parse(row.selected_pages_json) as number[],
      autoApplied: row.auto_applied === 1,
      appliedFields: JSON.parse(row.applied_fields_json) as BibliographicAiRunEvidence["appliedFields"],
      createdAt: fromDatabaseTimestamp(row.created_at)!,
    };
  }
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
