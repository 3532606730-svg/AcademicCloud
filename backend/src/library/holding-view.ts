import { driveEntryVersion } from "../drive/bulk.js";
import type { LibraryHolding } from "./library.js";

export interface LibraryHoldingView {
  recordId: string;
  recordLabel: string;
  canonicalTitle: string | null;
  authorLabels: string[];
  artifactId: string;
  versionId: string;
  version: string;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    updatedAt: string;
  };
}

/** Shared active-holding DTO for Library and private Favorites catalogue views. */
export function libraryHoldingView(holding: LibraryHolding): LibraryHoldingView {
  return {
    recordId: holding.recordId,
    recordLabel: holding.recordLabel,
    canonicalTitle: holding.canonicalTitle,
    authorLabels: [...holding.authorLabels],
    artifactId: holding.artifactId,
    versionId: holding.versionId,
    version: driveEntryVersion(holding.file),
    file: {
      id: holding.file.id,
      displayName: holding.file.displayName,
      mediaType: holding.file.mediaType,
      sizeBytes: holding.file.sizeBytes,
      updatedAt: holding.file.updatedAt.toISOString(),
    },
  };
}
