import type { LibraryHolding } from "./api.ts";
import type { Language } from "./i18n.ts";
import type { Translator } from "./i18n-react.tsx";

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

/** Server-supplied facts only; never recover metadata by splitting a title. */
export function libraryHoldingSecondaryLine(holding: LibraryHolding, t: Translator): string | null {
  // Historical edition titles already carry the publication/source statement.
  // Keep that statement together instead of reconstructing it in the subtitle.
  const historicalEdition = Boolean(holding.canonicalTitle && holding.editionStatement)
    && ["primary_source_modern_edition", "traditional_book", "archival_document",
      "inscription_epigraphy", "rubbing", "manuscript", "collected_documents"].includes(holding.materialClass ?? "");
  const parts = [
    ...(holding.secondaryContributorLabels ?? []),
    historicalEdition ? null : holding.date,
    historicalEdition ? null : holding.publisher,
    holding.materialClass && holding.materialClass !== "unknown" ? t(`materialClass.${holding.materialClass}`) : null,
  ].flatMap((part) => part?.trim() ? [part.trim()] : []);
  return [...new Set(parts)].join(" · ") || null;
}
