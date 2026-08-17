export const LIBRARY_ROLES = ["manager", "member"] as const;
export type LibraryRole = (typeof LIBRARY_ROLES)[number];

export interface Library {
  id: string;
  ownerDomainId: string;
  name: string;
  createdByAccountId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewLibrary extends Library {}

export interface LibraryMembership {
  libraryId: string;
  accountId: string;
  role: LibraryRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewLibraryMembership extends LibraryMembership {}

export interface LibraryHolding {
  libraryId: string;
  recordId: string;
  recordLabel: string;
  artifactId: string;
  artifactCreatedAt: Date;
  versionId: string;
  versionCreatedAt: Date;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    createdAt: Date;
  };
}
