import type {
  NewSuggestionRun,
  SuggestionRunRecord,
  SuggestionStatus,
} from "./suggestion.js";

export interface SuggestionRunStateEvidence {
  id: string;
  fileId: string;
  status: SuggestionStatus;
  pageCount: number | null;
  pageIndices: number[];
  windowComplete: boolean;
  candidateCount: number;
  nonFilenameCandidateCount: number;
  aiReviewable: boolean;
  applied: boolean;
}

/**
 * Persistence boundary for bounded bibliographic suggestion runs.
 *
 * A run is an immutable evidence record.  The only mutable value is its
 * lifecycle status (for example, when a manager accepts candidates or when
 * the source is found to be stale).  Candidate evidence is deliberately
 * returned with the run and is never represented by raw page text or object
 * storage keys.
 */
export interface SuggestionRepository {
  createRun(run: NewSuggestionRun): SuggestionRunRecord;
  findRun(ownerDomainId: string, runId: string): SuggestionRunRecord | null;
  findLatestRun(ownerDomainId: string, libraryId: string, fileId: string): SuggestionRunRecord | null;
  findLatestStateEvidenceMany(ownerDomainId: string, libraryId: string, fileIds: string[]): SuggestionRunStateEvidence[];
  listRuns(ownerDomainId: string, libraryId: string, fileId: string, limit: number): SuggestionRunRecord[];
  updateStatus(
    ownerDomainId: string,
    runId: string,
    expectedStatus: SuggestionStatus,
    status: SuggestionStatus,
  ): SuggestionRunRecord | null;
}
