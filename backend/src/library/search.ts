import { createHash } from "node:crypto";

import {
  CONTRIBUTOR_ROLES,
  EDITION_TYPES,
  MATERIAL_CLASSES,
  type BibliographicProfile,
  type ContributorRole,
  type EditionType,
  type MaterialClass,
} from "../bibliography/bibliography.js";
import type {
  AuthorityRole,
  AuthorityType,
  CanonicalMetadata,
  MaterialType,
} from "../metadata/metadata.js";
import { composeCatalogueDisplay, editionTypeDisplayLabel } from "./catalogue-display.js";
import type { LibraryHoldingSort } from "./library.js";
import type { LibraryHoldingView } from "./holding-view.js";
import { pinyinSortKey } from "./pinyin.js";

/**
 * Deterministic bounded metadata search. Effective-authority filtering is the
 * caller's first step; this module only receives already-accessible holdings.
 */

export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_FILTER_MAX_LENGTH = 128;
export const SEARCH_DEFAULT_LIMIT = 50;
export const SEARCH_MAX_LIMIT = 100;
export const SEARCH_SCAN_PAGE_SIZE = 200;
export const SEARCH_MAX_SCAN_PAGES = 500;

export interface HoldingCursor {
  artifactCreatedAt: Date;
  artifactId: string;
}

export function collectAllHoldings<T extends HoldingCursor>(
  listPage: (after: HoldingCursor | null, limit: number) => T[],
  pageSize: number = SEARCH_SCAN_PAGE_SIZE,
  maxPages: number = SEARCH_MAX_SCAN_PAGES,
): T[] | null {
  const collected: T[] = [];
  let after: HoldingCursor | null = null;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const rows = listPage(after, pageSize);
    if (rows.length === 0) return collected;
    collected.push(...rows);
    if (rows.length < pageSize) return collected;
    const last = rows[rows.length - 1]!;
    after = { artifactCreatedAt: last.artifactCreatedAt, artifactId: last.artifactId };
  }
  return null;
}

export class SearchInputError extends Error {
  constructor(readonly code:
    | "empty_query"
    | "query_too_long"
    | "invalid_cursor"
    | "invalid_limit"
    | "invalid_filter"
    | "invalid_sort") {
    super(code);
    this.name = "SearchInputError";
  }
}

export type LibrarySearchSort = "relevance" | LibraryHoldingSort;

export interface LibrarySearchFilters {
  materialClass?: MaterialClass | undefined;
  contributor?: string | undefined;
  language?: string | undefined;
  publisher?: string | undefined;
  year?: string | undefined;
  editionType?: EditionType | undefined;
  dynasty?: string | undefined;
  reignTitle?: string | undefined;
  editorialRole?: ContributorRole | string | undefined;
  series?: string | undefined;
  volume?: string | undefined;
}

export interface NormalizedSearchFilters {
  materialClass?: MaterialClass | undefined;
  contributor?: string | undefined;
  language?: string | undefined;
  publisher?: string | undefined;
  year?: string | undefined;
  editionType?: EditionType | undefined;
  dynasty?: string | undefined;
  reignTitle?: string | undefined;
  editorialRole?: string | undefined;
  series?: string | undefined;
  volume?: string | undefined;
}

export interface SearchableAuthority {
  type: AuthorityType;
  role: AuthorityRole;
  label: string;
  aliases: string[];
}

export interface SearchableHolding {
  fileId: string;
  displayName: string;
  mediaType?: string | null;
  sizeBytes: number;
  artifactId: string;
  artifactCreatedAt: Date;
  canonicalTitle: string | null;
  metadata: CanonicalMetadata | null;
  bibliography: BibliographicProfile | null;
  authorLabels: string[];
  authorities: SearchableAuthority[];
}

export interface LibrarySearchSummary {
  fileId: string;
  mediaType: string | null;
  sizeBytes: number;
  canonicalTitle: string | null;
  authorLabels: string[];
  contributorLabels: string[];
  date: string | null;
  publisher: string | null;
  materialClass: MaterialClass | null;
  /** Compatibility-only legacy metadata template type. */
  materialType: MaterialType | null;
  language: string | null;
  editionStatement: string | null;
  catalogueDisplayTitle: string;
  displayName: string;
}

export interface LibrarySearchResult extends LibrarySearchSummary {
  holding: LibraryHoldingView;
}

export interface LibrarySearchPage<Result extends LibrarySearchSummary = LibrarySearchResult> {
  results: Result[];
  nextCursor: string | null;
}

const PERSON_AUTHORITY_ROLES: readonly AuthorityRole[] = [
  "author", "editor", "translator", "compiler", "scribe", "sender",
  "recipient", "creator", "contributor",
];

const MATERIAL_CLASS_SEARCH_LABELS: Readonly<Record<MaterialClass, readonly string[]>> = {
  scholarly_monograph: ["学术著作", "专著", "monograph"],
  edited_volume: ["论文集", "编著", "edited volume"],
  journal_article: ["期刊论文", "论文", "journal article"],
  book_chapter: ["书籍章节", "章节", "book chapter"],
  thesis_dissertation: ["学位论文", "thesis", "dissertation"],
  conference_paper: ["会议论文", "conference paper"],
  review: ["评论", "书评", "review"],
  reference_work: ["工具书", "reference work"],
  dictionary_lexicon: ["词典", "字典", "dictionary", "lexicon"],
  primary_source_modern_edition: ["现代整理史料", "现代点校本", "史料", "modern edition"],
  traditional_book: ["古籍", "传统古籍", "traditional book"],
  archival_document: ["档案", "archival document"],
  inscription_epigraphy: ["碑刻", "铭文", "inscription", "epigraphy"],
  rubbing: ["拓片", "rubbing"],
  manuscript: ["手稿", "稿本", "manuscript"],
  collected_documents: ["史料汇编", "文献汇编", "collected documents"],
  catalogue_bibliography: ["目录", "书目", "catalogue", "bibliography"],
  other: ["其他", "other"],
  unknown: ["未分类", "unknown"],
};

export function normalizeForMatch(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}\p{Z}]+/gu, "");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeSearchQuery(raw: string): string {
  const normalized = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  if ([...normalized].length > SEARCH_QUERY_MAX_LENGTH) throw new SearchInputError("query_too_long");
  return normalized;
}

function normalizeFilterText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new SearchInputError("invalid_filter");
  const normalized = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalized || [...normalized].length > SEARCH_FILTER_MAX_LENGTH) throw new SearchInputError("invalid_filter");
  return normalized;
}

export function normalizeSearchFilters(filters: LibrarySearchFilters = {}): NormalizedSearchFilters {
  if (filters.materialClass !== undefined && !MATERIAL_CLASSES.includes(filters.materialClass)) {
    throw new SearchInputError("invalid_filter");
  }
  if (filters.editionType !== undefined && !EDITION_TYPES.includes(filters.editionType)) {
    throw new SearchInputError("invalid_filter");
  }
  const editorialRole = normalizeFilterText(filters.editorialRole);
  if (editorialRole && /^[a-z_]+$/u.test(editorialRole) && !CONTRIBUTOR_ROLES.includes(editorialRole as ContributorRole)) {
    throw new SearchInputError("invalid_filter");
  }
  return {
    materialClass: filters.materialClass,
    contributor: normalizeFilterText(filters.contributor),
    language: normalizeFilterText(filters.language),
    publisher: normalizeFilterText(filters.publisher),
    year: normalizeFilterText(filters.year),
    editionType: filters.editionType,
    dynasty: normalizeFilterText(filters.dynasty),
    reignTitle: normalizeFilterText(filters.reignTitle),
    editorialRole,
    series: normalizeFilterText(filters.series),
    volume: normalizeFilterText(filters.volume),
  };
}

function hasFilters(filters: NormalizedSearchFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

function authorityLabels(holding: SearchableHolding, roles?: readonly AuthorityRole[]): string[] {
  const labels: string[] = [];
  for (const authority of holding.authorities) {
    if (roles && !roles.includes(authority.role)) continue;
    labels.push(authority.label, ...authority.aliases);
  }
  return labels;
}

export function contributorLabels(holding: SearchableHolding): string[] {
  return [
    ...holding.authorLabels,
    ...(holding.bibliography?.contributors.flatMap((contributor) => [contributor.label, contributor.roleLabel ?? ""]) ?? []),
    ...authorityLabels(holding, PERSON_AUTHORITY_ROLES),
  ].filter(Boolean);
}

export function identifierValues(holding: SearchableHolding): string[] {
  return (holding.metadata?.identifiers ?? []).map((identifier) => identifier.value);
}

export function publisherValues(holding: SearchableHolding): string[] {
  return [
    holding.bibliography?.publication.publisher ?? "",
    ...holding.authorities.filter((authority) => authority.role === "publisher").flatMap((authority) => [authority.label, ...authority.aliases]),
  ].filter(Boolean);
}

function bibliographyValues(holding: SearchableHolding): string[] {
  const profile = holding.bibliography;
  if (!profile) return [];
  const source = profile.sourceEdition;
  const carrier = profile.carrierEdition;
  const roleLabels = profile.contributors.flatMap((contributor) => [contributor.role, contributor.roleLabel ?? ""]);
  const editionLabels = [source.editionType, carrier.editionType]
    .filter((type): type is EditionType => type !== undefined)
    .flatMap((type) => [type, editionTypeDisplayLabel(type)]);
  const materialLabels = [profile.materialClass, ...MATERIAL_CLASS_SEARCH_LABELS[profile.materialClass]];
  const base = [
    ...materialLabels,
    ...profile.contributors.flatMap((contributor) => [contributor.label, contributor.role, contributor.roleLabel ?? ""]),
    profile.publication.publisher ?? "", profile.publication.place ?? "", profile.publication.publicationDate ?? "",
    profile.publication.editionNumber ?? "", profile.publication.printing ?? "", profile.series ?? "", profile.volume ?? "",
    profile.language ?? "", carrier.editionStatement ?? "", carrier.facsimileStatement ?? "", ...editionLabels,
    source.dynasty ?? "", source.reignTitle ?? "", source.reignYear ?? "", source.absoluteYear?.toString() ?? "",
    source.printer ?? "", source.imprint ?? "", source.bookshop ?? "", source.institution ?? "",
    source.printingPlace ?? "", source.editionStatement ?? "", source.holdingInformation ?? "",
  ].filter(Boolean);
  const dynasty = source.dynasty ? `${source.dynasty.replace(/代$/u, "")}代` : "";
  const publisher = profile.publication.publisher ?? "";
  const publicationDate = profile.publication.publicationDate ?? "";
  const historicalAgent = source.institution ?? source.imprint ?? source.bookshop ?? source.printer ?? "";
  const composites = editionLabels.flatMap((edition) => [
    `${dynasty}${edition}`,
    `${source.reignTitle ?? ""}${edition}`,
    `${historicalAgent}${edition}`,
    `${historicalAgent}本`,
  ]);
  for (const role of roleLabels) {
    if (!role) continue;
    composites.push(`${publisher}${role}${role.endsWith("本") ? "" : "本"}`);
    composites.push(`${publisher}${publicationDate}${role}${role.endsWith("本") ? "" : "本"}`);
    composites.push(`现代${role}${role.endsWith("本") ? "" : "本"}`);
  }
  return [...base, ...composites.filter(Boolean), base.join("")];
}

export function otherMetadataValues(holding: SearchableHolding): string[] {
  const metadata = holding.metadata;
  return [
    ...(metadata ? [
      metadata.subtitle ?? "", ...metadata.alternativeTitles, metadata.dateStatement ?? "",
      ...Object.values(metadata.typeFields),
    ] : []),
    ...authorityLabels(holding),
    ...bibliographyValues(holding),
  ].filter(Boolean);
}

function combinedContributorTitle(holding: SearchableHolding, query: string, titleCompact: string): boolean {
  const parts = query.split(/\s+/u).filter(Boolean);
  if (parts.length < 2 || !titleCompact) return false;
  const people = contributorLabels(holding).map(normalizeForMatch).filter((label) => label.length >= 2);
  let personMatched = false;
  let titleMatched = false;
  for (const part of parts) {
    const compact = normalizeForMatch(part);
    if (!compact) continue;
    const person = people.some((label) => label === compact || label.startsWith(compact) || label.includes(compact));
    const title = titleCompact === compact || titleCompact.startsWith(compact) || titleCompact.includes(compact);
    if (person) personMatched = true;
    else if (title) titleMatched = true;
    else return false;
  }
  return personMatched && titleMatched;
}

function rank(holding: SearchableHolding, query: string, queryCompact: string): number {
  if (!queryCompact) return 0;
  const titleCompact = holding.canonicalTitle ? normalizeForMatch(holding.canonicalTitle) : "";
  if (titleCompact && titleCompact === queryCompact) return 0;
  if (titleCompact && (titleCompact.startsWith(queryCompact) || titleCompact.includes(queryCompact))) return 1;
  const people = contributorLabels(holding).map(normalizeForMatch);
  if (people.some((label) => label === queryCompact)) return 2;
  if (combinedContributorTitle(holding, query, titleCompact)) return 3;
  if (people.some((label) => label.includes(queryCompact))) return 3;
  if (identifierValues(holding).some((value) => normalizeForMatch(value) === queryCompact)) return 4;
  if (otherMetadataValues(holding).some((value) => normalizeForMatch(value).includes(queryCompact))) return 5;
  if (normalizeForMatch(holding.displayName).includes(queryCompact)) return 6;
  return -1;
}

function includesFilter(values: readonly (string | undefined)[], filter: string | undefined): boolean {
  if (!filter) return true;
  const compact = normalizeForMatch(filter);
  return values.some((value) => value !== undefined && normalizeForMatch(value).includes(compact));
}

function matchesFilters(holding: SearchableHolding, filters: NormalizedSearchFilters): boolean {
  const profile = holding.bibliography;
  if (filters.materialClass && profile?.materialClass !== filters.materialClass) return false;
  if (!includesFilter(contributorLabels(holding), filters.contributor)) return false;
  if (!includesFilter([profile?.language], filters.language)) return false;
  if (!includesFilter(publisherValues(holding), filters.publisher)) return false;
  if (!includesFilter([
    profile?.publication.publicationDate,
    profile?.sourceEdition.absoluteYear?.toString(),
    profile?.sourceEdition.reignYear,
    holding.metadata?.dateStatement,
  ], filters.year)) return false;
  if (filters.editionType && profile?.carrierEdition.editionType !== filters.editionType && profile?.sourceEdition.editionType !== filters.editionType) return false;
  if (!includesFilter([profile?.sourceEdition.dynasty], filters.dynasty)) return false;
  if (!includesFilter([profile?.sourceEdition.reignTitle], filters.reignTitle)) return false;
  if (filters.editorialRole) {
    const role = normalizeForMatch(filters.editorialRole);
    const matched = profile?.contributors.some((contributor) =>
      normalizeForMatch(contributor.role) === role
      || (contributor.roleLabel !== undefined && normalizeForMatch(contributor.roleLabel).includes(role)));
    if (!matched) return false;
  }
  if (!includesFilter([profile?.series], filters.series)) return false;
  if (!includesFilter([profile?.volume], filters.volume)) return false;
  return true;
}

function isSearchSort(value: string): value is LibrarySearchSort {
  return ["relevance", "newest", "oldest", "title_asc", "title_desc", "size_asc", "size_desc"].includes(value);
}

interface RankedHolding { rank: number; holding: SearchableHolding }
export type SearchSortKey = Array<string | number>;

function effectiveTitle(holding: SearchableHolding): string {
  return holding.canonicalTitle?.trim() || holding.displayName;
}

function sortKey(item: RankedHolding, sort: LibrarySearchSort): SearchSortKey {
  if (sort === "relevance") return [item.rank, item.holding.fileId];
  if (sort === "newest" || sort === "oldest") return [item.holding.artifactCreatedAt.getTime(), item.holding.artifactId, item.holding.fileId];
  if (sort === "title_asc" || sort === "title_desc") {
    const title = effectiveTitle(item.holding);
    return [pinyinSortKey(title), title, item.holding.fileId];
  }
  return [item.holding.sizeBytes, item.holding.fileId];
}

function compareSortKeys(left: SearchSortKey, right: SearchSortKey, sort: LibrarySearchSort): number {
  const direction = sort === "newest" || sort === "title_desc" || sort === "size_desc" ? -1 : 1;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    const compared = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : compareText(String(leftValue), String(rightValue));
    if (compared !== 0) return direction * compared;
  }
  return left.length - right.length;
}

function compareRanked(left: RankedHolding, right: RankedHolding, sort: LibrarySearchSort): number {
  return compareSortKeys(sortKey(left, sort), sortKey(right, sort), sort);
}

export interface SearchCursorPayload { v: 2; identity: string; key: SearchSortKey }

function searchIdentity(query: string, filters: NormalizedSearchFilters, sort: LibrarySearchSort): string {
  return createHash("sha256").update(JSON.stringify({ query, filters, sort }), "utf8").digest("hex");
}

export function encodeSearchCursor(identity: string, key: SearchSortKey): string {
  const payload: SearchCursorPayload = { v: 2, identity, key };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): SearchCursorPayload | null {
  if (!/^[A-Za-z0-9_-]{1,8000}$/u.test(cursor)) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<SearchCursorPayload>;
    if (value.v !== 2 || !/^[a-f0-9]{64}$/u.test(value.identity ?? "") || !Array.isArray(value.key)
      || value.key.length < 2 || value.key.length > 3
      || value.key.some((part) => (typeof part !== "string" && typeof part !== "number")
        || (typeof part === "string" && part.length > 4000)
        || (typeof part === "number" && !Number.isFinite(part)))) return null;
    return value as SearchCursorPayload;
  } catch {
    return null;
  }
}

function validCursorKey(key: SearchSortKey, sort: LibrarySearchSort): boolean {
  if (sort === "relevance" || sort === "size_asc" || sort === "size_desc") {
    return key.length === 2 && typeof key[0] === "number" && typeof key[1] === "string";
  }
  if (sort === "newest" || sort === "oldest") {
    return key.length === 3 && typeof key[0] === "number" && typeof key[1] === "string" && typeof key[2] === "string";
  }
  return key.length === 3 && key.every((part) => typeof part === "string");
}

function publisherLabel(holding: SearchableHolding): string | null {
  return publisherValues(holding)[0] ?? null;
}

export function toSearchResult(holding: SearchableHolding): LibrarySearchSummary {
  const composed = composeCatalogueDisplay({
    canonicalTitle: holding.canonicalTitle,
    fallbackDisplayName: holding.displayName,
    legacyAuthorLabels: holding.authorLabels,
    bibliography: holding.bibliography,
  });
  return {
    fileId: holding.fileId,
    mediaType: holding.mediaType ?? null,
    sizeBytes: holding.sizeBytes,
    canonicalTitle: holding.canonicalTitle,
    authorLabels: [...holding.authorLabels],
    contributorLabels: composed.contributorLabels,
    date: holding.bibliography?.publication.publicationDate ?? holding.metadata?.dateStatement ?? null,
    publisher: publisherLabel(holding),
    materialClass: holding.bibliography?.materialClass ?? null,
    materialType: holding.metadata?.materialType ?? null,
    language: holding.bibliography?.language ?? null,
    editionStatement: composed.editionStatement,
    catalogueDisplayTitle: composed.title,
    displayName: holding.displayName,
  };
}

export function prepareSearch(
  rawQuery: string,
  limit: number = SEARCH_DEFAULT_LIMIT,
  cursor: string | null = null,
  rawFilters: LibrarySearchFilters = {},
  rawSort: string = "relevance",
): {
  query: string;
  queryCompact: string;
  filters: NormalizedSearchFilters;
  identity: string;
  after: SearchCursorPayload | null;
  sort: LibrarySearchSort;
  limit: number;
} {
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) throw new SearchInputError("invalid_limit");
  if (!isSearchSort(rawSort)) throw new SearchInputError("invalid_sort");
  const query = normalizeSearchQuery(rawQuery);
  const queryCompact = normalizeForMatch(query);
  const filters = normalizeSearchFilters(rawFilters);
  if (!queryCompact && !hasFilters(filters)) throw new SearchInputError("empty_query");
  const identity = searchIdentity(query, filters, rawSort);
  const after = cursor === null ? null : decodeCursor(cursor);
  if (cursor !== null && (!after || after.identity !== identity || !validCursorKey(after.key, rawSort))) {
    throw new SearchInputError("invalid_cursor");
  }
  return { query, queryCompact, filters, identity, after, sort: rawSort, limit };
}

export type PreparedSearch = ReturnType<typeof prepareSearch>;

/** Pure reference implementation retained as the semantic oracle for SQL search. */
export function searchHoldings(
  holdings: readonly SearchableHolding[],
  rawQuery: string,
  limit: number = SEARCH_DEFAULT_LIMIT,
  cursor: string | null = null,
  rawFilters: LibrarySearchFilters = {},
  rawSort: string = "relevance",
): LibrarySearchPage<LibrarySearchSummary> {
  const { query, queryCompact, filters, identity, after, sort } = prepareSearch(rawQuery, limit, cursor, rawFilters, rawSort);

  const matched: RankedHolding[] = [];
  for (const holding of holdings) {
    if (!matchesFilters(holding, filters)) continue;
    const matchRank = rank(holding, query, queryCompact);
    if (matchRank < 0) continue;
    matched.push({ rank: matchRank, holding });
  }
  matched.sort((left, right) => compareRanked(left, right, sort));

  const remaining = after
    ? matched.filter((item) => compareSortKeys(sortKey(item, sort), after.key, sort) > 0)
    : matched;
  const page = remaining.slice(0, limit);
  const hasMore = remaining.length > limit;
  return {
    results: page.map((item) => toSearchResult(item.holding)),
    nextCursor: hasMore && page.length > 0 ? encodeSearchCursor(identity, sortKey(page[page.length - 1]!, sort)) : null,
  };
}
