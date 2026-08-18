import type {
  NewSuggestionRun,
  EvidenceOrigin,
  PageClass,
  SuggestionCandidate,
  SuggestionConfidence,
  SuggestionFieldPath,
  SuggestionRunRecord,
  SuggestionStatus,
  SuggestionSourceType,
  SuggestionRulesetVersion,
} from "../../suggestions/suggestion.js";
import { SUGGESTION_RULESET_VERSION } from "../../suggestions/suggestion.js";
import type { SuggestionRepository } from "../../suggestions/repositories.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface RunRow {
  id: string;
  owner_domain_id: string;
  library_id: string;
  record_id: string;
  file_id: string;
  status: SuggestionStatus;
  ruleset_version: string;
  source_version: string;
  source_file_revision: number;
  source_checksum_algorithm: string | null;
  source_checksum: string | null;
  first_pages: 15;
  last_pages: 5;
  page_count: number | null;
  page_indices: string;
  window_complete: 0 | 1;
  created_by_account_id: string;
  created_at: string;
}

interface CandidateRow {
  id: string;
  run_id: string;
  owner_domain_id: string;
  position: number;
  field_path: SuggestionFieldPath;
  type_field_name: SuggestionCandidate["typeFieldName"];
  authority_type: SuggestionCandidate["authorityType"];
  authority_role: SuggestionCandidate["authorityRole"];
  identifier_scheme: string | null;
  value: string;
  source_type: SuggestionSourceType;
  source_page_index: number | null;
  page_class: PageClass | null;
  confidence: SuggestionConfidence;
  precedence_rank: number;
  evidence_excerpt: string | null;
  evidence_origin: EvidenceOrigin | "legacy_v1";
  ocr_engine: string | null;
  ocr_confidence: number | null;
  ruleset_version: string;
}

const runColumns = `
  id, owner_domain_id, library_id, record_id, file_id, status,
  ruleset_version, source_version, source_file_revision,
  source_checksum_algorithm, source_checksum, first_pages, last_pages,
  page_count, page_indices, window_complete, created_by_account_id, created_at
`;

const candidateColumns = `
  id, run_id, owner_domain_id, position, field_path, type_field_name,
  authority_type, authority_role, identifier_scheme, value, source_type,
  source_page_index, page_class, confidence, precedence_rank,
  evidence_excerpt, evidence_origin, ocr_engine, ocr_confidence,
  ruleset_version
`;

function publicEvidenceOrigin(row: CandidateRow): EvidenceOrigin {
  if (row.evidence_origin !== "legacy_v1") return row.evidence_origin;
  if (row.source_type === "embedded_pdf_metadata") return "embedded_pdf_metadata";
  if (row.source_type === "filename") return "filename";
  return "native_text";
}

function parsePageIndices(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((entry) => !Number.isInteger(entry) || entry < 1)) {
      return [];
    }
    return parsed as number[];
  } catch {
    return [];
  }
}

export class SqliteSuggestionRepository implements SuggestionRepository {
  readonly #insertRun;
  readonly #insertCandidate;
  readonly #findRun;
  readonly #findLatestRun;
  readonly #listRuns;
  readonly #listCandidates;
  readonly #updateStatus;

  constructor(database: SqliteDatabase) {
    this.#insertRun = database.prepare<{
      id: string;
      ownerDomainId: string;
      libraryId: string;
      recordId: string;
      fileId: string;
      status: SuggestionStatus;
      rulesetVersion: string;
      sourceVersion: string;
      sourceFileRevision: number;
      sourceChecksumAlgorithm: string | null;
      sourceChecksum: string | null;
      firstPages: 15;
      lastPages: 5;
      pageCount: number | null;
      pageIndices: string;
      windowComplete: 0 | 1;
      createdByAccountId: string;
      createdAt: string;
    }>(`
      INSERT INTO scholarly_metadata_suggestion_runs (
        id, owner_domain_id, library_id, record_id, file_id, status,
        ruleset_version, source_version, source_file_revision,
        source_checksum_algorithm, source_checksum, first_pages, last_pages,
        page_count, page_indices, window_complete, created_by_account_id, created_at
      ) VALUES (
        @id, @ownerDomainId, @libraryId, @recordId, @fileId, @status,
        @rulesetVersion, @sourceVersion, @sourceFileRevision,
        @sourceChecksumAlgorithm, @sourceChecksum, @firstPages, @lastPages,
        @pageCount, @pageIndices, @windowComplete, @createdByAccountId, @createdAt
      )
    `);
    this.#insertCandidate = database.prepare<{
      id: string;
      runId: string;
      ownerDomainId: string;
      position: number;
      fieldPath: SuggestionCandidate["fieldPath"];
      typeFieldName: SuggestionCandidate["typeFieldName"];
      authorityType: SuggestionCandidate["authorityType"];
      authorityRole: SuggestionCandidate["authorityRole"];
      identifierScheme: string | null;
      value: string;
      sourceType: SuggestionCandidate["sourceType"];
      sourcePageIndex: number | null;
      pageClass: SuggestionCandidate["pageClass"];
      confidence: SuggestionCandidate["confidence"];
      precedenceRank: number;
      evidenceExcerpt: string | null;
      evidenceOrigin: EvidenceOrigin;
      ocrEngine: string | null;
      ocrConfidence: number | null;
      rulesetVersion: string;
    }>(`
      INSERT INTO scholarly_metadata_suggestion_candidates (
        id, run_id, owner_domain_id, position, field_path, type_field_name,
        authority_type, authority_role, identifier_scheme, value, source_type,
        source_page_index, page_class, confidence, precedence_rank,
        evidence_excerpt, evidence_origin, ocr_engine, ocr_confidence,
        ruleset_version
      ) VALUES (
        @id, @runId, @ownerDomainId, @position, @fieldPath, @typeFieldName,
        @authorityType, @authorityRole, @identifierScheme, @value, @sourceType,
        @sourcePageIndex, @pageClass, @confidence, @precedenceRank,
        @evidenceExcerpt, @evidenceOrigin, @ocrEngine, @ocrConfidence,
        @rulesetVersion
      )
    `);
    this.#findRun = database.prepare<[string, string], RunRow>(`
      SELECT ${runColumns}
      FROM scholarly_metadata_suggestion_runs
      WHERE owner_domain_id = ? AND id = ?
    `);
    this.#findLatestRun = database.prepare<[string, string, string], RunRow>(`
      SELECT ${runColumns}
      FROM scholarly_metadata_suggestion_runs
      WHERE owner_domain_id = ? AND library_id = ? AND file_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);
    this.#listRuns = database.prepare<{ ownerDomainId: string; libraryId: string; fileId: string; limit: number }, RunRow>(`
      SELECT ${runColumns}
      FROM scholarly_metadata_suggestion_runs
      WHERE owner_domain_id = @ownerDomainId
        AND library_id = @libraryId
        AND file_id = @fileId
      ORDER BY created_at DESC, id DESC
      LIMIT @limit
    `);
    this.#listCandidates = database.prepare<[string, string], CandidateRow>(`
      SELECT ${candidateColumns}
      FROM scholarly_metadata_suggestion_candidates
      WHERE owner_domain_id = ? AND run_id = ?
      ORDER BY position
    `);
    this.#updateStatus = database.prepare<{
      ownerDomainId: string;
      runId: string;
      expectedStatus: SuggestionStatus;
      status: SuggestionStatus;
    }>(`
      UPDATE scholarly_metadata_suggestion_runs
      SET status = @status
      WHERE owner_domain_id = @ownerDomainId
        AND id = @runId
        AND status = @expectedStatus
    `);
  }

  createRun(run: NewSuggestionRun): SuggestionRunRecord {
    this.#insertRun.run({
      id: run.id,
      ownerDomainId: run.ownerDomainId,
      libraryId: run.libraryId,
      recordId: run.recordId,
      fileId: run.fileId,
      status: run.status,
      rulesetVersion: SUGGESTION_RULESET_VERSION,
      sourceVersion: run.sourceFingerprint.value,
      sourceFileRevision: run.sourceFingerprint.fileRevision,
      sourceChecksumAlgorithm: run.sourceFingerprint.checksumAlgorithm,
      sourceChecksum: run.sourceFingerprint.checksum,
      firstPages: run.window.firstPages,
      lastPages: run.window.lastPages,
      pageCount: run.window.pageCount,
      pageIndices: JSON.stringify(run.window.pageIndices),
      windowComplete: run.window.complete ? 1 : 0,
      createdByAccountId: run.createdByAccountId,
      createdAt: toDatabaseTimestamp(run.createdAt)!,
    });
    run.candidates.forEach((candidate, position) => {
      this.#insertCandidate.run({
        id: `${run.id}:${position}`,
        runId: run.id,
        ownerDomainId: run.ownerDomainId,
        position: candidate.position,
        fieldPath: candidate.fieldPath,
        typeFieldName: candidate.typeFieldName,
        authorityType: candidate.authorityType,
        authorityRole: candidate.authorityRole,
        identifierScheme: candidate.identifierScheme,
        value: candidate.value,
        sourceType: candidate.sourceType,
        sourcePageIndex: candidate.sourcePageIndex,
        pageClass: candidate.pageClass,
        confidence: candidate.confidence,
        precedenceRank: candidate.precedenceRank,
        evidenceExcerpt: candidate.evidenceExcerpt,
        evidenceOrigin: candidate.evidenceOrigin,
        ocrEngine: candidate.ocrEngine,
        ocrConfidence: candidate.ocrConfidence,
        rulesetVersion: SUGGESTION_RULESET_VERSION,
      });
    });
    return this.findRun(run.ownerDomainId, run.id)!;
  }

  findRun(ownerDomainId: string, runId: string): SuggestionRunRecord | null {
    const row = this.#findRun.get(ownerDomainId, runId);
    return row ? this.#toRun(row) : null;
  }

  findLatestRun(ownerDomainId: string, libraryId: string, fileId: string): SuggestionRunRecord | null {
    const row = this.#findLatestRun.get(ownerDomainId, libraryId, fileId);
    return row ? this.#toRun(row) : null;
  }

  listRuns(ownerDomainId: string, libraryId: string, fileId: string, limit: number): SuggestionRunRecord[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    return this.#listRuns.all({ ownerDomainId, libraryId, fileId, limit: boundedLimit }).map((row) => this.#toRun(row));
  }

  updateStatus(
    ownerDomainId: string,
    runId: string,
    expectedStatus: SuggestionStatus,
    status: SuggestionStatus,
  ): SuggestionRunRecord | null {
    if (expectedStatus === status) return this.findRun(ownerDomainId, runId);
    if (this.#updateStatus.run({ ownerDomainId, runId, expectedStatus, status }).changes !== 1) return null;
    return this.findRun(ownerDomainId, runId);
  }

  #toRun(row: RunRow): SuggestionRunRecord {
    const candidates = this.#listCandidates.all(row.owner_domain_id, row.id).map((candidate): SuggestionCandidate => ({
      id: candidate.id,
      position: candidate.position,
      fieldPath: candidate.field_path,
      typeFieldName: candidate.type_field_name,
      authorityType: candidate.authority_type,
      authorityRole: candidate.authority_role,
      identifierScheme: candidate.identifier_scheme,
      value: candidate.value,
      sourceType: candidate.source_type,
      sourcePageIndex: candidate.source_page_index,
      pageClass: candidate.page_class,
      confidence: candidate.confidence,
      precedenceRank: candidate.precedence_rank,
      evidenceExcerpt: candidate.evidence_excerpt,
      evidenceOrigin: publicEvidenceOrigin(candidate),
      ocrEngine: candidate.ocr_engine,
      ocrConfidence: candidate.ocr_confidence,
      rulesetVersion: candidate.ruleset_version as SuggestionRulesetVersion,
    }));
    return {
      id: row.id,
      ownerDomainId: row.owner_domain_id,
      libraryId: row.library_id,
      recordId: row.record_id,
      fileId: row.file_id,
      status: row.status,
      rulesetVersion: row.ruleset_version as SuggestionRulesetVersion,
      sourceVersion: row.source_version,
      window: {
        firstPages: 15,
        lastPages: 5,
        pageCount: row.page_count,
        pageIndices: parsePageIndices(row.page_indices),
        complete: row.window_complete === 1,
      },
      candidates,
      createdAt: fromDatabaseTimestamp(row.created_at)!.toISOString(),
      sourceFingerprint: {
        value: row.source_version,
        fileRevision: row.source_file_revision,
        checksumAlgorithm: row.source_checksum_algorithm,
        checksum: row.source_checksum,
      },
      createdByAccountId: row.created_by_account_id,
    };
  }
}
