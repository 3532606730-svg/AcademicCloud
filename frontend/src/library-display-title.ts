import type { LibraryHolding } from "./api.ts";
import type { Language } from "./i18n.ts";

export interface LibraryDisplayTitleInput {
  canonicalTitle: string | null;
  authorLabels?: readonly string[];
  fallbackDisplayName: string;
}

/**
 * Compose the ordinary catalogue label from normalized scholarly facts.
 * This is presentation-only: callers must never persist the returned value as
 * canonical metadata or use it as the physical download filename.
 */
export function composeLibraryDisplayTitle(
  input: LibraryDisplayTitleInput,
  language: Language,
): string {
  const canonicalTitle = input.canonicalTitle?.trim();
  if (!canonicalTitle) return input.fallbackDisplayName;

  const authorLabels = (input.authorLabels ?? [])
    .map((label) => label.trim())
    .filter(Boolean);
  if (authorLabels.length === 0) return canonicalTitle;

  const authorSeparator = language === "zh-CN" ? "、" : ", ";
  return `${authorLabels.join(authorSeparator)} · ${canonicalTitle}`;
}

export function libraryHoldingDisplayTitle(holding: LibraryHolding, language: Language): string {
  return composeLibraryDisplayTitle({
    canonicalTitle: holding.canonicalTitle,
    authorLabels: holding.authorLabels,
    fallbackDisplayName: holding.file.displayName,
  }, language);
}
