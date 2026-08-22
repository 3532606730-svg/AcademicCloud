import type { LibraryHolding } from "./api.ts";
import type { Language } from "./i18n.ts";

export interface LibraryDisplayTitleInput {
  canonicalTitle: string | null;
  authorLabels?: readonly string[];
  catalogueDisplayTitle?: string | undefined;
  editionStatement?: string | null | undefined;
  fallbackDisplayName: string;
}

/**
 * Compose the ordinary catalogue label from normalized scholarly facts.
 * This is presentation-only: callers must never persist the returned value as
 * canonical metadata or use it as the physical download filename.
 */
export function composeLibraryDisplayTitle(
  input: LibraryDisplayTitleInput,
  _language: Language,
): string {
  const serverComposition = input.catalogueDisplayTitle?.trim();
  if (serverComposition) return serverComposition;
  const canonicalTitle = input.canonicalTitle?.trim();
  if (!canonicalTitle) return input.fallbackDisplayName;

  const editionStatement = input.editionStatement?.trim();
  if (editionStatement) return `${canonicalTitle} ${editionStatement}`;

  const authorLabels = (input.authorLabels ?? [])
    .map((label) => label.trim())
    .filter(Boolean);
  if (authorLabels.length === 0) return canonicalTitle;

  return `${authorLabels.join("、")} ${canonicalTitle}`;
}

export function libraryHoldingDisplayTitle(holding: LibraryHolding, language: Language): string {
  return composeLibraryDisplayTitle({
    canonicalTitle: holding.canonicalTitle,
    authorLabels: holding.authorLabels,
    catalogueDisplayTitle: holding.catalogueDisplayTitle,
    editionStatement: holding.editionStatement,
    fallbackDisplayName: holding.file.displayName,
  }, language);
}
