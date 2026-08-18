import type {
  NewScholarlyArtifact,
  NewScholarlyArtifactVersion,
  NewScholarlyRecord,
  ScholarlyArtifact,
  ScholarlyArtifactVersion,
  ScholarlyRecord,
} from "./record.js";

export interface ScholarlyRecordListItem {
  record: ScholarlyRecord;
  artifactCount: number;
}

export interface ScholarlyRepository {
  createRecord(record: NewScholarlyRecord): ScholarlyRecord;
  findRecord(ownerId: string, recordId: string): ScholarlyRecord | null;
  listRecords(ownerId: string, beforeId: string | null, limit: number): ScholarlyRecordListItem[];
  countArtifacts(ownerId: string, recordId: string): number;
  createArtifact(artifact: NewScholarlyArtifact): ScholarlyArtifact;
  findArtifact(ownerId: string, recordId: string, artifactId: string): ScholarlyArtifact | null;
  findArtifactByStoredFile(ownerId: string, storedFileId: string): ScholarlyArtifact | null;
  findArtifactByStoredFileForDomain(ownerDomainId: string, storedFileId: string): ScholarlyArtifact | null;
  listArtifacts(ownerId: string, recordId: string, beforeId: string | null, limit: number): ScholarlyArtifact[];
  updateArtifactState(
    ownerId: string,
    recordId: string,
    artifactId: string,
    expectedState: ScholarlyArtifact["attachmentState"],
    state: ScholarlyArtifact["attachmentState"],
    updatedAt: Date,
  ): ScholarlyArtifact | null;
  createVersion(version: NewScholarlyArtifactVersion): ScholarlyArtifactVersion;
  findVersion(ownerId: string, artifactId: string): ScholarlyArtifactVersion | null;
  findVersionForDomain(ownerDomainId: string, artifactId: string): ScholarlyArtifactVersion | null;
  isFileAttached(ownerId: string, storedFileId: string): boolean;
  isFileAttachedForDomain(ownerDomainId: string, storedFileId: string): boolean;
  updateArtifactStateForDomain(
    ownerDomainId: string,
    recordId: string,
    artifactId: string,
    expectedState: ScholarlyArtifact["attachmentState"],
    state: ScholarlyArtifact["attachmentState"],
    updatedAt: Date,
  ): ScholarlyArtifact | null;
}
