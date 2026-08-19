import type {
  AuthorityRole,
  AuthorityType,
  CanonicalMetadata,
  MaterialType,
} from "../metadata/metadata.js";

/**
 * Deterministic bounded metadata/name search contract for RF-SEARCH01.
 *
 * This module is pure: it never reads storage or authorization state and never
 * persists a query. Effective-authority filtering is the caller's first step;
 * only already-accessible holdings are passed in, so ranking, counting, and
 * pagination can never observe an inaccessible resource.
 */

export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_DEFAULT_LIMIT = 50;
export const SEARCH_MAX_LIMIT = 100;
/** Upper bound on the accessible holdings scanned per request (no migration). */
export const SEARCH_MAX_CORPUS_SCAN = 5_000;

export class SearchInputError extends Error {
  constructor(readonly code: "empty_query" | "query_too_long" | "invalid_cursor" | "invalid_limit") {
    super(code);
    this.name = "SearchInputError";
  }
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
  canonicalTitle: string | null;
  metadata: CanonicalMetadata | null;
  authorLabels: string[];
  authorities: SearchableAuthority[];
}

export interface LibrarySearchResult {
  fileId: string;
  canonicalTitle: string | null;
  authorLabels: string[];
  date: string | null;
  publisher: string | null;
  materialType: MaterialType | null;
  displayName: string;
}

export interface LibrarySearchPage {
  results: LibrarySearchResult[];
  nextCursor: string | null;
}

const PERSON_AUTHORITY_ROLES: readonly AuthorityRole[] = [
  "author",
  "editor",
  "translator",
  "compiler",
  "scribe",
  "sender",
  "recipient",
  "creator",
  "contributor",
];

/** Case/punctuation/whitespace-insensitive matching form. */
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}\p{Z}]+/gu, "");
}

export function normalizeSearchQuery(raw: string): string {
  const normalized = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (normalized.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new SearchInputError("query_too_long");
  }
  return normalized;
}

function authorityLabels(holding: SearchableHolding, roles?: readonly AuthorityRole[]): string[] {
  const labels: string[] = [];
  for (const authority of holding.authorities) {
    if (roles && !roles.includes(authority.role)) continue;
    labels.push(authority.label, ...authority.aliases);
  }
  return labels;
}

function personAuthorityLabels(holding: SearchableHolding): string[] {
  // The projected author labels are the canonical catalogue fact; the resolved
  // person authorities (editor/translator/compiler/…) are additive.
  return [...holding.authorLabels, ...authorityLabels(holding, PERSON_AUTHORITY_ROLES)];
}

function identifierValues(holding: SearchableHolding): string[] {
  return (holding.metadata?.identifiers ?? []).map((identifier) => identifier.value);
}

function otherMetadataValues(holding: SearchableHolding): string[] {
  const metadata = holding.metadata;
  if (!metadata) return [];
  return [
    metadata.subtitle ?? "",
    ...metadata.alternativeTitles,
    metadata.dateStatement ?? "",
    ...Object.values(metadata.typeFields),
    ...authorityLabels(holding),
  ].filter(Boolean);
}

/**
 * Rank a holding against an already-normalized compact query.
 * Lower is better; -1 means no match. The tiers mirror the documented
 * contract: exact title, title prefix/strong title, exact authority,
 * author+title, exact identifier, other canonical metadata, filename.
 */
function rank(holding: SearchableHolding, queryCompact: string): number {
  const titleCompact = holding.canonicalTitle ? normalizeForMatch(holding.canonicalTitle) : "";

  if (titleCompact && titleCompact === queryCompact) return 0;
  if (titleCompact && (titleCompact.startsWith(queryCompact) || titleCompact.includes(queryCompact))) return 1;

  const anyAuthorityExact = authorityLabels(holding).some((label) => normalizeForMatch(label) === queryCompact);
  if (anyAuthorityExact) return 2;

  const personPrefix = personAuthorityLabels(holding).some((label) => {
    const compact = normalizeForMatch(label);
    return compact.startsWith(queryCompact) || compact.includes(queryCompact);
  });
  if (personPrefix && titleCompact && titleCompact.includes(queryCompact)) return 3;

  if (identifierValues(holding).some((value) => normalizeForMatch(value) === queryCompact)) return 4;

  if (otherMetadataValues(holding).some((value) => normalizeForMatch(value).includes(queryCompact))) return 5;

  if (normalizeForMatch(holding.displayName).includes(queryCompact)) return 6;

  return -1;
}

function publisherLabel(holding: SearchableHolding): string | null {
  for (const authority of holding.authorities) {
    if (authority.role === "publisher" && authority.label.trim()) return authority.label;
  }
  return null;
}

function toResult(holding: SearchableHolding): LibrarySearchResult {
  return {
    fileId: holding.fileId,
    canonicalTitle: holding.canonicalTitle,
    authorLabels: [...holding.authorLabels],
    date: holding.metadata?.dateStatement ?? null,
    publisher: publisherLabel(holding),
    materialType: holding.metadata?.materialType ?? null,
    displayName: holding.displayName,
  };
}

function encodeCursor(rankValue: number, fileId: string): string {
  return Buffer.from(`${rankValue}:${fileId}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { rank: number; fileId: string } | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(cursor)) return null;
  try {
    const text = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = text.indexOf(":");
    if (separator < 1) return null;
    const rankText = text.slice(0, separator);
    const fileId = text.slice(separator + 1);
    if (!/^-?\d+$/u.test(rankText) || !fileId || fileId.includes(":")) return null;
    return { rank: Number(rankText), fileId };
  } catch {
    return null;
  }
}

/**
 * Search already-accessible holdings deterministically.
 * `cursor` resumes after the previous page; `limit` bounds each page.
 */
export function searchHoldings(
  holdings: readonly SearchableHolding[],
  rawQuery: string,
  limit: number = SEARCH_DEFAULT_LIMIT,
  cursor: string | null = null,
): LibrarySearchPage {
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw new SearchInputError("invalid_limit");
  }
  const query = normalizeSearchQuery(rawQuery);
  const queryCompact = normalizeForMatch(query);
  if (!queryCompact) throw new SearchInputError("empty_query");

  let after: { rank: number; fileId: string } | null = null;
  if (cursor !== null) {
    after = decodeCursor(cursor);
    if (!after) throw new SearchInputError("invalid_cursor");
  }

  const matched: Array<{ rank: number; fileId: string; holding: SearchableHolding }> = [];
  for (const holding of holdings) {
    const matchRank = rank(holding, queryCompact);
    if (matchRank < 0) continue;
    matched.push({ rank: matchRank, fileId: holding.fileId, holding });
  }
  matched.sort((left, right) => left.rank - right.rank || left.fileId.localeCompare(right.fileId, "en"));

  const start = after
    ? matched.filter((item) => item.rank > after!.rank || (item.rank === after!.rank && item.fileId > after!.fileId))
    : matched;
  const page = start.slice(0, limit);
  const hasMore = start.length > limit;
  const nextCursor = hasMore && page.length > 0
    ? encodeCursor(page[page.length - 1]!.rank, page[page.length - 1]!.fileId)
    : null;

  return {
    results: page.map((item) => toResult(item.holding)),
    nextCursor,
  };
}
