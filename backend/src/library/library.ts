export const LIBRARY_ROLES = ["manager", "member"] as const;
export type LibraryRole = (typeof LIBRARY_ROLES)[number];

export interface Library {
  id: string;
  ownerDomainId: string;
  name: string;
  isDefault: boolean;
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
  canonicalTitle: string | null;
  artifactId: string;
  artifactCreatedAt: Date;
  versionId: string;
  versionCreatedAt: Date;
  file: {
    id: string;
    uploadedByAccountId: string;
    folderId: string | null;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    state: "active";
    revision: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: null;
    purgedAt: null;
  };
}

export interface LibraryRecycledHolding {
  libraryId: string;
  recordId: string;
  recordLabel: string;
  canonicalTitle: string | null;
  artifactId: string;
  versionId: string;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    state: "deleted";
    revision: number;
    updatedAt: Date;
    deletedAt: Date;
  };
}
