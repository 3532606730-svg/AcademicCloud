import { canonicalCatalogJson } from "@academiccloud/compute-contracts";

import {
  normalizeBibliographicProfileInput,
  type BibliographicFieldAuthority,
  type BibliographicProfile,
  type BibliographicProfileInput,
} from "../bibliography/bibliography.js";
import type { CanonicalMetadata, CanonicalMetadataInput, MaterialType } from "../metadata/metadata.js";
import {
  CATALOG_PATCH_FIELDS,
  catalogFieldValue,
  setCatalogField,
  type CatalogEvidenceSummary,
  type ImportedCatalogBibliography,
} from "./contracts.js";
import { formatCatalogFilename, type CatalogFilenameOutcome } from "./filename-policy.js";

export interface CatalogFieldDiff {
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  operation: "unchanged" | "set" | "clear" | "preserve" | "conflict" | "unsupported";
  currentAuthority: "human" | "ai" | "unattributed" | "none";
  proposedAuthority: "human" | "unchanged";
  evidenceState: CatalogEvidenceSummary["state"];
  notes: string | null;
}

export function catalogMetadataInput(metadata: CanonicalMetadata | null): CanonicalMetadataInput | null {
  if (!metadata) return null;
  const { materialType, canonicalTitle, subtitle, alternativeTitles, dateStatement, identifiers, typeFields, authorityLinks } = metadata;
  return structuredClone({ materialType, canonicalTitle, ...(subtitle === undefined ? {} : { subtitle }), alternativeTitles,
    ...(dateStatement === undefined ? {} : { dateStatement }), identifiers, typeFields, authorityLinks });
}

export function catalogBibliographyInput(profile: BibliographicProfile | null): BibliographicProfileInput | null {
  if (!profile) return null;
  const { materialClass, contributors, publication, series, volume, language, carrierEdition, sourceEdition } = profile;
  return structuredClone({ materialClass, contributors, publication, ...(series === undefined ? {} : { series }),
    ...(volume === undefined ? {} : { volume }), ...(language === undefined ? {} : { language }), carrierEdition, sourceEdition });
}

function materialTypeFor(materialClass: string): MaterialType | null {
  if (["journal_article", "book_chapter", "conference_paper", "review"].includes(materialClass)) return "article";
  if (["traditional_book", "manuscript"].includes(materialClass)) return "manuscript";
  if (["inscription_epigraphy", "rubbing"].includes(materialClass)) return "inscription";
  if (materialClass === "archival_document") return "archival_document";
  return ["scholarly_monograph", "edited_volume", "thesis_dissertation", "reference_work", "dictionary_lexicon",
    "primary_source_modern_edition", "collected_documents", "catalogue_bibliography"].includes(materialClass) ? "book" : null;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return canonicalCatalogJson(left ?? null) === canonicalCatalogJson(right ?? null);
}

export function compileCatalogBibliography(options: {
  imported: ImportedCatalogBibliography;
  metadata: CanonicalMetadata | null;
  bibliography: BibliographicProfile | null;
  authorities: readonly BibliographicFieldAuthority[];
  currentFilename: string;
  evidence: CatalogEvidenceSummary;
  notes: string | null;
  createId: () => string;
}): {
  metadata: CanonicalMetadataInput;
  bibliography: BibliographicProfileInput;
  fields: CatalogFieldDiff[];
  filename: CatalogFilenameOutcome;
} | null {
  const currentMetadata = catalogMetadataInput(options.metadata);
  const currentBibliography = catalogBibliographyInput(options.bibliography);
  const before: Record<string, unknown> = { ...currentMetadata, ...currentBibliography };
  const next: Record<string, unknown> = structuredClone(before);
  const patch = options.imported.patch;
  if (!patch) throw new Error("Catalog input must retain explicit patch intent");
  for (const [field, value] of Object.entries(patch.set)) setCatalogField(next, field, value);
  for (const field of patch.clear) setCatalogField(next, field,
    ["contributors", "alternativeTitles", "identifiers"].includes(field) ? [] : undefined);
  if (typeof next.canonicalTitle !== "string" || !next.canonicalTitle) return null;
  next.materialClass ??= "unknown";
  next.contributors ??= [];
  next.publication ??= {};
  next.carrierEdition ??= {};
  next.sourceEdition ??= {};
  next.materialType ??= materialTypeFor(next.materialClass as string);
  if (!next.materialType) return null;

  // Broad type edits cannot silently erase subtype-specific canonical facts.
  const unsupportedType = Boolean(currentMetadata && next.materialType !== currentMetadata.materialType
    && Object.keys(currentMetadata.typeFields).length > 0);
  if (unsupportedType) next.materialType = currentMetadata!.materialType;

  const existingByIdentity = new Map<string, NonNullable<typeof currentBibliography>["contributors"]>();
  for (const contributor of currentBibliography?.contributors ?? []) {
    const key = canonicalCatalogJson([contributor.label, contributor.role, contributor.roleLabel ?? null]);
    existingByIdentity.set(key, [...existingByIdentity.get(key) ?? [], contributor]);
  }
  const contributors = (next.contributors as BibliographicProfileInput["contributors"]).map((entry) => {
    const key = canonicalCatalogJson([entry.label, entry.role, entry.roleLabel ?? null]);
    const prior = existingByIdentity.get(key)?.shift();
    // External data never supplies internal identities. Retaining an unchanged
    // person/role must retain both its stable contributor ID and authority link.
    return { ...entry, id: prior?.id ?? options.createId(), ...(prior?.authorityId ? { authorityId: prior.authorityId } : {}) };
  });
  const bibliography = normalizeBibliographicProfileInput({
    materialClass: next.materialClass, contributors, publication: next.publication,
    ...(next.series === undefined ? {} : { series: next.series }),
    ...(next.volume === undefined ? {} : { volume: next.volume }),
    ...(next.language === undefined ? {} : { language: next.language }),
    carrierEdition: next.carrierEdition, sourceEdition: next.sourceEdition,
  });
  const metadata: CanonicalMetadataInput = {
    materialType: next.materialType as MaterialType, canonicalTitle: next.canonicalTitle,
    ...(next.subtitle === undefined ? {} : { subtitle: next.subtitle as string }),
    alternativeTitles: next.alternativeTitles as string[] | undefined ?? [],
    ...(next.dateStatement === undefined ? {} : { dateStatement: next.dateStatement as string }),
    identifiers: next.identifiers as CanonicalMetadataInput["identifiers"] | undefined ?? [],
    typeFields: currentMetadata?.typeFields ?? {}, authorityLinks: currentMetadata?.authorityLinks ?? [],
  };
  const after: Record<string, unknown> = { ...metadata, ...bibliography };
  const fields = CATALOG_PATCH_FIELDS.map((field): CatalogFieldDiff => {
    const oldValue = catalogFieldValue(before, field) ?? null;
    const newValue = catalogFieldValue(after, field) ?? null;
    const supplied = Object.hasOwn(patch.set, field) || patch.clear.includes(field);
    const authority = options.authorities.filter((entry) => field === "contributors"
      ? entry.fieldName === "contributors" || entry.fieldName.startsWith("contributor.") : entry.fieldName === field && entry.scopeKey === "");
    const currentAuthority = authority.some((entry) => entry.source === "human") ? "human"
      : authority.some((entry) => entry.source === "ai") ? "ai"
        : oldValue === null || Array.isArray(oldValue) && oldValue.length === 0 ? "none" : "unattributed";
    const equal = jsonEqual(oldValue, newValue);
    const adoptsContributorDecision = field === "contributors" && supplied
      && !authority.some((entry) => entry.fieldName === "contributors" && entry.source === "human");
    // Required empty storage defaults are not an external assertion. A known
    // scholarly class can determine broad type, but unknown/other cannot.
    const hasIntent = supplied || field === "materialType" && !currentMetadata;
    const operation = field === "materialType" && unsupportedType ? "unsupported"
      : !hasIntent ? "preserve" : equal && !adoptsContributorDecision ? "unchanged"
      : currentAuthority === "human" ? "conflict" : patch.clear.includes(field) ? "clear" : "set";
    return {
      field, currentValue: oldValue, proposedValue: newValue, operation, currentAuthority,
      proposedAuthority: !hasIntent || equal && !adoptsContributorDecision ? "unchanged" : "human", evidenceState: options.evidence.state,
      notes: field === "materialType" && unsupportedType ? "material_type_preserved_with_type_fields" : null,
    };
  });
  for (const field of ["typeFields", "authorityLinks"] as const) fields.push({
    field, currentValue: currentMetadata?.[field] ?? (field === "typeFields" ? {} : []), proposedValue: metadata[field],
    operation: "preserve", currentAuthority: currentMetadata ? "unattributed" : "none",
    proposedAuthority: "unchanged", evidenceState: options.evidence.state, notes: null,
  });
  const filename = formatCatalogFilename({
    canonicalTitle: metadata.canonicalTitle, materialClass: bibliography.materialClass, contributors: bibliography.contributors,
    currentFilename: options.currentFilename, filenameStyle: options.imported.filenameStyle,
    editionType: bibliography.carrierEdition.editionType, editionStatement: bibliography.carrierEdition.editionStatement,
    sourceEditionType: bibliography.sourceEdition.editionType, sourceEditionStatement: bibliography.sourceEdition.editionStatement,
    sourceDynasty: bibliography.sourceEdition.dynasty, sourceReignTitle: bibliography.sourceEdition.reignTitle,
    publisher: bibliography.publication.publisher, dateStatement: metadata.dateStatement,
    publicationDate: bibliography.publication.publicationDate, responsibilityStatement: options.imported.responsibilityStatement,
  });
  const proposedFilename = filename.status === "proposed" ? filename.filename : options.currentFilename;
  fields.push({
    field: "displayName", currentValue: options.currentFilename, proposedValue: proposedFilename,
    operation: proposedFilename === options.currentFilename ? "unchanged" : "set", currentAuthority: "unattributed",
    proposedAuthority: proposedFilename === options.currentFilename ? "unchanged" : "human",
    evidenceState: options.evidence.state, notes: null,
  });
  return { metadata, bibliography, fields, filename };
}
