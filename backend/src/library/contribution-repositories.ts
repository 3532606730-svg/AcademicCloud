import type { ContributionCandidate, LibraryContribution, ContributionState, NewLibraryContribution } from "./contribution.js";

export interface ContributionRepository {
  create(contribution: NewLibraryContribution): LibraryContribution;
  findById(libraryId: string, contributionId: string): LibraryContribution | null;
  findLatestByArtifact(libraryId: string, artifactId: string): LibraryContribution | null;
  findSubmittedByArtifact(libraryId: string, artifactId: string): LibraryContribution | null;
  listSubmitted(libraryId: string, limit: number): ContributionCandidate[];
  listForContributor(libraryId: string, accountId: string, limit: number): ContributionCandidate[];
  findCandidateForSubmission(artifactId: string, accountId: string): Omit<ContributionCandidate, "contribution"> | null;
  findCandidate(libraryId: string, contributionId: string): ContributionCandidate | null;
  updateState(
    libraryId: string,
    contributionId: string,
    expectedRevision: number,
    state: Extract<ContributionState, "rejected" | "withdrawn">,
    reviewedByAccountId: string,
    reviewedAt: Date,
  ): LibraryContribution | null;
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
  ): LibraryContribution | null;
}
