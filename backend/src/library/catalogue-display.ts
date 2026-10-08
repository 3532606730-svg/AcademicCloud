import type {
  ContributorRole,
  EditionType,
  MaterialClass,
} from "../bibliography/bibliography.js";

/**
 * Presentation-only catalogue composition.  The returned title is never a
 * canonical metadata value and must never be used as an object-storage key.
 */

const MODERN_SCHOLARLY_CLASSES: ReadonlySet<MaterialClass> = new Set([
  "scholarly_monograph",
  "edited_volume",
  "journal_article",
  "book_chapter",
  "thesis_dissertation",
  "conference_paper",
  "review",
  "reference_work",
  "dictionary_lexicon",
  "catalogue_bibliography",
]);

const CONTAINER_VOLUME_CLASSES: ReadonlySet<MaterialClass> = new Set([
  "journal_article",
  "book_chapter",
  "conference_paper",
  "review",
]);

const HISTORICAL_SOURCE_CLASSES: ReadonlySet<MaterialClass> = new Set([
  "primary_source_modern_edition",
  "traditional_book",
  "archival_document",
  "inscription_epigraphy",
  "rubbing",
  "manuscript",
  "collected_documents",
]);

const EDITION_TYPE_LABELS: Readonly<Record<EditionType, string>> = {
  critical_edition: "校勘本",
  annotated_edition: "校注本",
  collated_edition: "汇校本",
  punctuated_edition: "标点本",
  translated_edition: "译注本",
  facsimile: "影印本",
  reprint: "重印本",
  engraved: "刻本",
  recut: "重刻本",
  facsimile_engraved: "影刻本",
  movable_type: "活字本",
  multicolor_print: "套印本",
  manuscript_copy: "抄本",
  hand_copy: "钞本",
  draft_manuscript: "稿本",
  facsimile_hand_copy: "影钞本",
  lithograph: "石印本",
  letterpress: "铅印本",
  composite_repaired: "配补本",
  hand_copy_repaired: "钞补本",
  repaired: "修补本",
  other: "其他版本",
  unknown: "版本未详",
};

const CONTRIBUTOR_ROLE_LABELS: Readonly<Partial<Record<ContributorRole, string>>> = {
  editor: "编辑",
  compiler: "编纂",
  translator: "译注",
  annotator: "校注",
  collator: "汇校",
  punctuator: "标点",
  commentator: "笺证",
  reviser: "整理",
  selector: "辑校",
  organizer: "整理",
};

export interface CatalogueDisplayInput {
  canonicalTitle: string | null;
  fallbackDisplayName: string;
  legacyAuthorLabels?: readonly string[];
  bibliography: CatalogueBibliography | null;
}

/**
 * The catalogue identity rule consumes only bibliographic facts. Keeping this
 * view structural lets immutable AI suggestions use the exact same display
 * projection as persisted canonical profiles without fabricating record ids,
 * revisions, or actor provenance.
 */
export interface CatalogueBibliography {
  materialClass: MaterialClass;
  volume?: string | null | undefined;
  contributors: ReadonlyArray<{
    label: string;
    role: ContributorRole;
    roleLabel?: string | null | undefined;
  }>;
  publication: {
    publisher?: string | null | undefined;
    place?: string | null | undefined;
    publicationDate?: string | null | undefined;
    editionNumber?: string | null | undefined;
    printing?: string | null | undefined;
  };
  carrierEdition: {
    editionType?: EditionType | null | undefined;
    editionStatement?: string | null | undefined;
    facsimileStatement?: string | null | undefined;
  };
  sourceEdition: {
    dynasty?: string | null | undefined;
    reignTitle?: string | null | undefined;
    reignYear?: string | null | undefined;
    absoluteYear?: number | null | undefined;
    printer?: string | null | undefined;
    imprint?: string | null | undefined;
    bookshop?: string | null | undefined;
    institution?: string | null | undefined;
    printingPlace?: string | null | undefined;
    editionType?: EditionType | null | undefined;
    editionStatement?: string | null | undefined;
  };
}

export interface CatalogueDisplay {
  title: string;
  contributorLabels: string[];
  /** Contributors not already composed into the presentation title. */
  secondaryContributorLabels: string[];
  editionStatement: string | null;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw?.normalize("NFC").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function appendUnique(parts: string[], raw: string | number | null | undefined): void {
  if (raw === undefined || raw === null) return;
  const value = String(raw).normalize("NFC").trim();
  if (!value) return;
  const compact = parts.join("").replace(/[\s\p{P}\p{S}]+/gu, "");
  const candidate = value.replace(/[\s\p{P}\p{S}]+/gu, "");
  if (!compact.includes(candidate)) parts.push(value);
}

function mergeStatements(values: readonly (string | null | undefined)[]): string | null {
  let result = "";
  for (const raw of values) {
    const value = raw?.normalize("NFC").trim();
    if (!value) continue;
    const resultCompact = result.replace(/[\s\p{P}\p{S}]+/gu, "");
    const valueCompact = value.replace(/[\s\p{P}\p{S}]+/gu, "");
    if (resultCompact.includes(valueCompact)) continue;
    result = valueCompact.includes(resultCompact) ? value : `${result}${value}`;
  }
  return result || null;
}

function editionTypeLabel(type: EditionType | null | undefined): string | undefined {
  if (!type || type === "unknown") return undefined;
  return EDITION_TYPE_LABELS[type];
}

function titleWithVolume(title: string, rawVolume: string | null | undefined): string {
  const volume = rawVolume?.normalize("NFC").trim();
  if (!volume) return title;
  // Only a complete, delimited terminal value is already a volume label.
  // A title substring (especially a single character) is not sufficient.
  const brackets = [["（", "）"], ["(", ")"], ["[", "]"], ["【", "】"]] as const;
  if (brackets.some(([open, close]) => {
    if (!title.endsWith(close)) return false;
    const start = title.lastIndexOf(open);
    return start >= 0 && title.slice(start + open.length, -close.length).trim() === volume;
  })) return title;
  if (title.endsWith(volume) && /\s$/u.test(title.slice(0, -volume.length))) return title;
  return `${title}（${volume}）`;
}

function sourceEditionStatement(profile: CatalogueBibliography): string | null {
  const source = profile.sourceEdition;
  const parts: string[] = [];
  appendUnique(parts, source.dynasty);
  appendUnique(parts, source.reignTitle);
  if (source.reignYear) {
    appendUnique(parts, /年$/u.test(source.reignYear) ? source.reignYear : `${source.reignYear}年`);
  } else if (source.absoluteYear !== undefined && source.absoluteYear !== null) {
    appendUnique(parts, `${source.absoluteYear}年`);
  }
  appendUnique(parts, source.printingPlace);
  appendUnique(parts, source.printer);
  appendUnique(parts, source.imprint);
  appendUnique(parts, source.bookshop);
  appendUnique(parts, source.institution);
  appendUnique(parts, source.editionStatement);
  if (!source.editionStatement) appendUnique(parts, editionTypeLabel(source.editionType));
  return mergeStatements(parts);
}

function editorialRoleLabels(profile: CatalogueBibliography): string[] {
  return unique(profile.contributors.flatMap((contributor) => {
    if (contributor.role === "author" || contributor.role === "other") return [];
    return contributor.roleLabel
      ? [contributor.roleLabel]
      : [CONTRIBUTOR_ROLE_LABELS[contributor.role]];
  }));
}

function carrierEditionStatement(profile: CatalogueBibliography): string | null {
  const carrier = profile.carrierEdition;
  const parts: string[] = [];
  appendUnique(parts, profile.publication.publisher);
  if (carrier.editionStatement) {
    appendUnique(parts, carrier.editionStatement);
  } else {
    appendUnique(parts, profile.publication.publicationDate);
    const roles = editorialRoleLabels(profile);
    for (const role of roles) appendUnique(parts, role.endsWith("本") ? role : `${role}本`);
    if (roles.length === 0) appendUnique(parts, editionTypeLabel(carrier.editionType));
  }
  appendUnique(parts, profile.publication.editionNumber);
  appendUnique(parts, profile.publication.printing);
  return mergeStatements(parts);
}

function historicalEditionStatement(profile: CatalogueBibliography): string | null {
  const source = sourceEditionStatement(profile);
  const carrier = carrierEditionStatement(profile);
  if (profile.carrierEdition.facsimileStatement) {
    return mergeStatements([carrier, profile.carrierEdition.facsimileStatement, source]);
  }
  if (profile.carrierEdition.editionType === "facsimile" && source) {
    const prefix = carrier && carrier !== "影印本" ? carrier.replace(/影印本$/u, "") : "";
    return `${prefix}影印${source}`;
  }
  if (profile.materialClass === "traditional_book" || profile.materialClass === "manuscript") {
    return source ?? carrier;
  }
  return carrier ?? source;
}

export function composeCatalogueDisplay(input: CatalogueDisplayInput): CatalogueDisplay {
  const canonicalTitle = input.canonicalTitle?.normalize("NFC").trim() || null;
  const profile = input.bibliography;
  const contributorLabels = unique(profile
    ? profile.contributors.map((contributor) => contributor.label)
    : input.legacyAuthorLabels ?? []);
  if (!canonicalTitle) {
    return { title: input.fallbackDisplayName, contributorLabels, secondaryContributorLabels: contributorLabels, editionStatement: null };
  }
  if (!profile) {
    return {
      title: canonicalTitle,
      contributorLabels,
      secondaryContributorLabels: contributorLabels,
      editionStatement: null,
    };
  }
  const title = CONTAINER_VOLUME_CLASSES.has(profile.materialClass)
    ? canonicalTitle
    : titleWithVolume(canonicalTitle, profile.volume);
  if (MODERN_SCHOLARLY_CLASSES.has(profile.materialClass)) {
    const authors = unique(profile.contributors
      .filter((contributor) => contributor.role === "author")
      .map((contributor) => contributor.label));
    return {
      title: authors.length > 0 ? `${authors.join("、")} ${title}` : title,
      contributorLabels,
      secondaryContributorLabels: contributorLabels.filter((label) => !authors.includes(label)),
      editionStatement: carrierEditionStatement(profile),
    };
  }
  if (!HISTORICAL_SOURCE_CLASSES.has(profile.materialClass)) {
    return { title, contributorLabels, secondaryContributorLabels: contributorLabels, editionStatement: null };
  }
  const editionStatement = historicalEditionStatement(profile);
  return {
    title: editionStatement ? `${title} ${editionStatement}` : title,
    contributorLabels,
    secondaryContributorLabels: contributorLabels,
    editionStatement,
  };
}

export function editionTypeDisplayLabel(type: EditionType): string {
  return EDITION_TYPE_LABELS[type];
}

const SAFE_EXTENSION = /^\.[A-Za-z0-9]{1,16}$/u;

function truncateFilenameBase(value: string, maximumCodeUnits: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maximumCodeUnits) break;
    result += character;
  }
  return result.trim();
}

/**
 * Project a catalogue identity into a download filename while preserving only
 * the original, already-authorized file extension. Object storage identity is
 * deliberately absent from this presentation-only function.
 */
export function composeCatalogueFilename(catalogueTitle: string, originalFilename: string): string {
  const dot = originalFilename.lastIndexOf(".");
  const extension = dot > 0 ? originalFilename.slice(dot) : "";
  const safeExtension = SAFE_EXTENSION.test(extension) ? extension : "";
  const titleAlreadyHasExtension = safeExtension !== "" && catalogueTitle.toLowerCase().endsWith(safeExtension.toLowerCase());
  const projectedExtension = titleAlreadyHasExtension ? "" : safeExtension;
  const base = truncateFilenameBase(catalogueTitle, 255 - projectedExtension.length);
  return `${base}${projectedExtension}`;
}
