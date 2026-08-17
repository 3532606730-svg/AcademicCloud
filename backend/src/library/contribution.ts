export const CONTRIBUTION_STATES = ["submitted", "approved", "rejected", "withdrawn"] as const;
export type ContributionState = (typeof CONTRIBUTION_STATES)[number];

export interface LibraryContribution {
  id: string;
  libraryId: string;
  artifactId: string;
  contributorAccountId: string;
  state: ContributionState;
  revision: number;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedByAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewLibraryContribution extends Omit<LibraryContribution, "state" | "revision" | "reviewedAt" | "reviewedByAccountId"> {
  state: "submitted";
  revision: 0;
  reviewedAt: null;
  reviewedByAccountId: null;
}

export interface ContributionCandidate {
  contribution: LibraryContribution;
  libraryDomainId: string;
  recordId: string;
  recordLabel: string;
  artifactState: "attached" | "detached";
  versionId: string;
  file: {
    id: string;
    ownerDomainId: string;
    uploadedByAccountId: string;
    folderId: string | null;
    displayName: string;
    storageProvider: string;
    objectKey: string;
    mediaType: string | null;
    sizeBytes: number;
    state: "active" | "deleted" | "purging" | "purged" | "pending_upload";
  };
  submitterLoginName: string | null;
}
