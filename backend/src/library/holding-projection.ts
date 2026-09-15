import type { RepositorySet } from "../persistence/contracts.js";
import { libraryHoldingView, type LibraryHoldingView } from "./holding-view.js";
import type { LibraryHolding } from "./library.js";
import type { SearchableAuthority, SearchableHolding } from "./search.js";

/** Hydrate only an already-authorized page, once per metadata repository. */
export function projectLibraryHoldings(
  ownerDomainId: string,
  holdings: readonly LibraryHolding[],
  repositories: RepositorySet,
): Array<{ holding: LibraryHoldingView; searchable: SearchableHolding }> {
  if (holdings.length === 0) return [];
  const recordIds = [...new Set(holdings.map((holding) => holding.recordId))];
  const metadataByRecord = new Map(repositories.metadata
    .findMetadataMany(ownerDomainId, recordIds)
    .map((metadata) => [metadata.recordId, metadata]));
  const bibliographyByRecord = new Map(repositories.bibliography
    .findProfiles(ownerDomainId, recordIds)
    .map((profile) => [profile.recordId, profile]));
  const authorityIds = [...new Set([...metadataByRecord.values()]
    .flatMap((metadata) => metadata.authorityLinks.map((link) => link.authorityId)))];
  const authoritiesById = new Map(repositories.metadata
    .findAuthorities(ownerDomainId, authorityIds)
    .map((authority) => [authority.id, authority]));
  return holdings.map((holding) => {
    const metadata = metadataByRecord.get(holding.recordId) ?? null;
    const bibliography = bibliographyByRecord.get(holding.recordId) ?? null;
    const authorities: SearchableAuthority[] = [];
    for (const link of metadata?.authorityLinks ?? []) {
      const authority = authoritiesById.get(link.authorityId);
      if (!authority) continue;
      authorities.push({
        type: authority.type,
        role: link.role,
        label: authority.canonicalLabel,
        aliases: [...authority.aliases],
      });
    }
    return {
      holding: libraryHoldingView(holding, bibliography, {
        publisher: authorities.find((authority) => authority.role === "publisher")?.label ?? null,
        date: metadata?.dateStatement ?? null,
      }),
      searchable: {
        fileId: holding.file.id,
        displayName: holding.file.displayName,
        sizeBytes: holding.file.sizeBytes,
        mediaType: holding.file.mediaType,
        artifactId: holding.artifactId,
        artifactCreatedAt: holding.artifactCreatedAt,
        canonicalTitle: holding.canonicalTitle,
        metadata,
        bibliography,
        authorLabels: [...holding.authorLabels],
        authorities,
      },
    };
  });
}
