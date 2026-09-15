import { driveEntryVersion } from "../drive/bulk.js";
import type { BibliographicProfile, MaterialClass } from "../bibliography/bibliography.js";
import { composeCatalogueDisplay } from "./catalogue-display.js";
import type { LibraryHolding } from "./library.js";

export interface LibraryHoldingView {
  recordId: string;
  recordLabel: string;
  canonicalTitle: string | null;
  authorLabels: string[];
  materialClass: MaterialClass | null;
  contributorLabels: string[];
  secondaryContributorLabels: string[];
  publisher: string | null;
  date: string | null;
  editionStatement: string | null;
  catalogueDisplayTitle: string;
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
export function libraryHoldingView(
  holding: LibraryHolding,
  bibliography: BibliographicProfile | null = null,
  legacyPublication: { publisher: string | null; date: string | null } = { publisher: null, date: null },
): LibraryHoldingView {
  const display = composeCatalogueDisplay({
    canonicalTitle: holding.canonicalTitle,
    fallbackDisplayName: holding.file.displayName,
    legacyAuthorLabels: holding.authorLabels,
    bibliography,
  });
  return {
    recordId: holding.recordId,
    recordLabel: holding.recordLabel,
    canonicalTitle: holding.canonicalTitle,
    authorLabels: [...holding.authorLabels],
    materialClass: bibliography?.materialClass ?? null,
    contributorLabels: display.contributorLabels,
    secondaryContributorLabels: display.secondaryContributorLabels,
    publisher: bibliography?.publication.publisher || legacyPublication.publisher,
    date: bibliography?.publication.publicationDate ?? legacyPublication.date,
    editionStatement: display.editionStatement,
    catalogueDisplayTitle: display.title,
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
