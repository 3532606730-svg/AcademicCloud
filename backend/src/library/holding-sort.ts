import type { LibraryHoldingSort } from "./library.js";

export const LIBRARY_HOLDING_SORTS = [
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "size_desc",
  "size_asc",
] as const;

export function isLibraryHoldingSort(value: unknown): value is LibraryHoldingSort {
  return typeof value === "string" && (LIBRARY_HOLDING_SORTS as readonly string[]).includes(value);
}

export class HoldingSortError extends Error {
  constructor(readonly code: "invalid_sort" | "invalid_cursor") {
    super(code);
    this.name = "HoldingSortError";
  }
}

/**
 * Opaque keyset cursor for sorted holding pages. The cursor carries the exact
 * sort it belongs to; a cursor from a different sort is rejected as invalid so
 * the client restarts pagination instead of silently mis-ordering.
 */
export interface HoldingSortCursor {
  sort: LibraryHoldingSort;
  primary: string;
  secondary: string;
  fileId: string;
}

const CURSOR_SORT_FIELDS: Readonly<Record<LibraryHoldingSort, { usesFileId: boolean }>> = {
  newest: { usesFileId: false },
  oldest: { usesFileId: false },
  title_asc: { usesFileId: true },
  title_desc: { usesFileId: true },
  size_desc: { usesFileId: false },
  size_asc: { usesFileId: false },
};

export function encodeHoldingSortCursor(cursor: HoldingSortCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeHoldingSortCursor(
  raw: string,
  sort: LibraryHoldingSort,
): HoldingSortCursor | null {
  // Cursors carry the pinyin sort key of the effective title, which can reach
  // several thousand characters for long CJK titles; 8000 keeps every valid
  // cursor well inside the URL/proxy request-line budget while still bounding
  // the opaque input.
  if (!/^[A-Za-z0-9_-]{1,8000}$/u.test(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.sort !== sort) return null;
  if (typeof candidate.primary !== "string" || candidate.primary.length < 1 || candidate.primary.length > 4096) return null;
  if (typeof candidate.secondary !== "string" || candidate.secondary.length < 1 || candidate.secondary.length > 4096) return null;
  const expectsFileId = CURSOR_SORT_FIELDS[sort].usesFileId;
  if (expectsFileId) {
    if (typeof candidate.fileId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(candidate.fileId)) return null;
  } else if (typeof candidate.fileId !== "string") {
    return null;
  }
  return {
    sort,
    primary: candidate.primary,
    secondary: candidate.secondary,
    fileId: expectsFileId ? candidate.fileId : "",
  };
}
