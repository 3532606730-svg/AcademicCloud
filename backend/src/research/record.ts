export const SCHOLARLY_ATTACHMENT_STATES = ["attached", "detached"] as const;
export type ScholarlyAttachmentState = (typeof SCHOLARLY_ATTACHMENT_STATES)[number];

export interface ScholarlyRecord {
  id: string;
  ownerId: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScholarlyArtifact {
  id: string;
  ownerId: string;
  recordId: string;
  attachmentState: ScholarlyAttachmentState;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScholarlyArtifactVersion {
  id: string;
  ownerId: string;
  artifactId: string;
  storedFileId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewScholarlyRecord extends ScholarlyRecord {}
export interface NewScholarlyArtifact extends ScholarlyArtifact {}
export interface NewScholarlyArtifactVersion extends ScholarlyArtifactVersion {}
