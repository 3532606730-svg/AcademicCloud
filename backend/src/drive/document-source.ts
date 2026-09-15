import type { StoredFile } from "./file.js";

/** Safe identity only. Possession does not grant read or write authority. */
export interface DocumentSourceDescriptor {
  resourceId: string;
  sourceId: string;
}

/** Internal recorded storage facts. Never serialize this object to a client. */
export interface DocumentSource extends DocumentSourceDescriptor {
  storageProvider: string;
  objectKey: string;
  sizeBytes: number;
  checksumAlgorithm: string;
  checksum: string;
  recordedAt: string;
}

export interface DocumentLocation extends DocumentSourceDescriptor {
  /** One-based physical page, distinct from a printed citation locator. */
  physicalPage: number;
}

export function sourceMatchesFile(source: DocumentSource, file: StoredFile): boolean {
  return source.resourceId === file.id && source.storageProvider === file.storageProvider
    && source.objectKey === file.objectKey && source.sizeBytes === file.sizeBytes
    && source.checksumAlgorithm === file.checksumAlgorithm && source.checksum === file.checksum;
}
