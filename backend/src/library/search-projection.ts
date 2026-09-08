import {
  contributorLabels, identifierValues, normalizeForMatch, otherMetadataValues,
  publisherValues, type SearchableHolding,
} from "./search.js";
import { pinyinSortKey } from "./pinyin.js";

/** Rebuild when this changes; the source metadata remains the only authority. */
export const SEARCH_PROJECTION_VERSION = 1;

export interface SearchProjection {
  canonicalTitle: string | null;
  titleCompact: string;
  titlePinyin: string;
  titleOrder: string;
  pinyinOrder: string;
  peopleJson: string;
  peopleText: string;
  identifiersText: string;
  otherText: string;
  filtersJson: string;
}

/** SQLite BINARY text order differs from JS for supplementary Unicode characters. */
export function searchTextOrder(value: string): string {
  return Buffer.from(value, "utf16le").swap16().toString("hex");
}

export function projectSearchHolding(holding: SearchableHolding): SearchProjection {
  const profile = holding.bibliography;
  const normalized = (values: readonly (string | undefined)[]) => values
    .filter((value): value is string => value !== undefined).map(normalizeForMatch);
  const title = holding.canonicalTitle?.trim() || null;
  const titlePinyin = title ? pinyinSortKey(title) : "";
  return {
    canonicalTitle: title,
    titleCompact: title ? normalizeForMatch(title) : "",
    titlePinyin,
    titleOrder: title ? searchTextOrder(title) : "",
    pinyinOrder: searchTextOrder(titlePinyin),
    peopleJson: JSON.stringify(contributorLabels(holding).map(normalizeForMatch)),
    // Normalized values contain no whitespace. Space delimiters retain exact
    // element boundaries without reparsing JSON for every candidate row.
    peopleText: ` ${contributorLabels(holding).map(normalizeForMatch).join(" ")} `,
    identifiersText: ` ${identifierValues(holding).map(normalizeForMatch).join(" ")} `,
    otherText: otherMetadataValues(holding).map(normalizeForMatch).join(" "),
    filtersJson: JSON.stringify({
      materialClass: profile?.materialClass ?? null,
      contributor: normalized(contributorLabels(holding)),
      language: normalized([profile?.language]),
      publisher: normalized(publisherValues(holding)),
      year: normalized([profile?.publication.publicationDate, profile?.sourceEdition.absoluteYear?.toString(),
        profile?.sourceEdition.reignYear, holding.metadata?.dateStatement ?? undefined]),
      editionType: [profile?.carrierEdition.editionType, profile?.sourceEdition.editionType].filter((value) => value !== undefined),
      dynasty: normalized([profile?.sourceEdition.dynasty]),
      reignTitle: normalized([profile?.sourceEdition.reignTitle]),
      editorialRoleExact: normalized(profile?.contributors.map((entry) => entry.role) ?? []),
      editorialRoleLabel: normalized(profile?.contributors.map((entry) => entry.roleLabel) ?? []),
      series: normalized([profile?.series]),
      volume: normalized([profile?.volume]),
    }),
  };
}

/** Preserve the reference search's person-first token classification exactly. */
export function matchesCombinedSearch(peopleJson: string, titleCompact: string, query: string): number {
  const parts = query.split(/\s+/u).filter(Boolean);
  if (parts.length < 2 || !titleCompact) return 0;
  const people = (JSON.parse(peopleJson) as string[]).filter((value) => value.length >= 2);
  let personMatched = false;
  let titleMatched = false;
  for (const part of parts) {
    const compact = normalizeForMatch(part);
    if (!compact) continue;
    if (people.some((value) => value.includes(compact))) personMatched = true;
    else if (titleCompact.includes(compact)) titleMatched = true;
    else return 0;
  }
  return personMatched && titleMatched ? 1 : 0;
}
