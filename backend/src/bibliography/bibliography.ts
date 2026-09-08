export const MATERIAL_CLASSES = [
  "scholarly_monograph",
  "edited_volume",
  "journal_article",
  "book_chapter",
  "thesis_dissertation",
  "conference_paper",
  "review",
  "reference_work",
  "dictionary_lexicon",
  "primary_source_modern_edition",
  "traditional_book",
  "archival_document",
  "inscription_epigraphy",
  "rubbing",
  "manuscript",
  "collected_documents",
  "catalogue_bibliography",
  "other",
  "unknown",
] as const;
export type MaterialClass = (typeof MATERIAL_CLASSES)[number];

export const CONTRIBUTOR_ROLES = [
  "author",
  "editor",
  "compiler",
  "translator",
  "annotator",
  "collator",
  "punctuator",
  "commentator",
  "reviser",
  "selector",
  "organizer",
  "other",
] as const;
export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number];

export const EDITION_TYPES = [
  "critical_edition",
  "annotated_edition",
  "collated_edition",
  "punctuated_edition",
  "translated_edition",
  "facsimile",
  "reprint",
  "engraved",
  "recut",
  "facsimile_engraved",
  "movable_type",
  "multicolor_print",
  "manuscript_copy",
  "hand_copy",
  "draft_manuscript",
  "facsimile_hand_copy",
  "lithograph",
  "letterpress",
  "composite_repaired",
  "hand_copy_repaired",
  "repaired",
  "other",
  "unknown",
] as const;
export type EditionType = (typeof EDITION_TYPES)[number];

export const BIBLIOGRAPHIC_FIELD_NAMES = [
  "contributors",
  "materialClass",
  "canonicalTitle",
  "subtitle",
  "alternativeTitles",
  "dateStatement",
  "identifiers",
  "publication.publisher",
  "publication.place",
  "publication.publicationDate",
  "publication.editionNumber",
  "publication.printing",
  "series",
  "volume",
  "language",
  "carrierEdition.editionType",
  "carrierEdition.editionStatement",
  "carrierEdition.facsimileStatement",
  "sourceEdition.dynasty",
  "sourceEdition.reignTitle",
  "sourceEdition.reignYear",
  "sourceEdition.absoluteYear",
  "sourceEdition.printer",
  "sourceEdition.imprint",
  "sourceEdition.bookshop",
  "sourceEdition.institution",
  "sourceEdition.printingPlace",
  "sourceEdition.editionType",
  "sourceEdition.editionStatement",
  "sourceEdition.holdingInformation",
  "contributor.label",
  "contributor.role",
  "contributor.roleLabel",
  "contributor.authorityId",
] as const;
export type BibliographicFieldName = (typeof BIBLIOGRAPHIC_FIELD_NAMES)[number];

export type FieldAuthoritySource = "human" | "ai";

export interface BibliographicPublication {
  publisher?: string | undefined;
  place?: string | undefined;
  publicationDate?: string | undefined;
  editionNumber?: string | undefined;
  printing?: string | undefined;
}

export interface CarrierEdition {
  editionType?: EditionType | undefined;
  editionStatement?: string | undefined;
  facsimileStatement?: string | undefined;
}

export interface SourceEdition {
  dynasty?: string | undefined;
  reignTitle?: string | undefined;
  reignYear?: string | undefined;
  absoluteYear?: number | undefined;
  printer?: string | undefined;
  imprint?: string | undefined;
  bookshop?: string | undefined;
  institution?: string | undefined;
  printingPlace?: string | undefined;
  editionType?: EditionType | undefined;
  editionStatement?: string | undefined;
  holdingInformation?: string | undefined;
}

export interface BibliographicContributorInput {
  id?: string | undefined;
  label: string;
  role: ContributorRole;
  roleLabel?: string | undefined;
  authorityId?: string | undefined;
}

export interface BibliographicContributor extends Omit<BibliographicContributorInput, "id"> {
  id: string;
}

export interface BibliographicProfileInput {
  materialClass: MaterialClass;
  contributors: BibliographicContributorInput[];
  publication: BibliographicPublication;
  series?: string | undefined;
  volume?: string | undefined;
  language?: string | undefined;
  carrierEdition: CarrierEdition;
  sourceEdition: SourceEdition;
}

export interface BibliographicProfile extends Omit<BibliographicProfileInput, "contributors"> {
  recordId: string;
  ownerDomainId: string;
  contractVersion: 1;
  contributors: BibliographicContributor[];
  revision: number;
  createdByAccountId: string;
  updatedByAccountId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BibliographicFieldAuthority {
  recordId: string;
  ownerDomainId: string;
  fieldName: BibliographicFieldName;
  scopeKey: string;
  source: FieldAuthoritySource;
  sourceRunId?: string | undefined;
  actorAccountId?: string | undefined;
  establishedAt: Date;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const ISBN_10 = /^(?:\d[ -]?){9}[\dX]$/iu;
const ISBN_13 = /^(?:\d[ -]?){13}$/u;

export class BibliographyValidationError extends Error {
  constructor(readonly code: "invalid_input" | "unsafe_authority_match") {
    super(code);
    this.name = "BibliographyValidationError";
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BibliographyValidationError("invalid_input");
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const registry = new Set(allowed);
  if (Object.keys(value).some((key) => !registry.has(key))) throw new BibliographyValidationError("invalid_input");
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new BibliographyValidationError("invalid_input");
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > maximum || CONTROL_CHARACTERS.test(normalized)) {
    throw new BibliographyValidationError("invalid_input");
  }
  return normalized;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  return value === undefined || value === null ? undefined : text(value, maximum);
}

function enumValue<T extends readonly string[]>(value: unknown, registry: T): T[number] {
  if (typeof value !== "string" || !(registry as readonly string[]).includes(value)) {
    throw new BibliographyValidationError("invalid_input");
  }
  return value as T[number];
}

function normalizePublication(value: unknown): BibliographicPublication {
  const input = object(value);
  keys(input, ["publisher", "place", "publicationDate", "editionNumber", "printing"]);
  return compact({
    publisher: optionalText(input.publisher, 255),
    place: optionalText(input.place, 255),
    publicationDate: optionalText(input.publicationDate, 64),
    editionNumber: optionalText(input.editionNumber, 128),
    printing: optionalText(input.printing, 128),
  });
}

function normalizeCarrier(value: unknown): CarrierEdition {
  const input = object(value);
  keys(input, ["editionType", "editionStatement", "facsimileStatement"]);
  return compact({
    editionType: input.editionType === undefined || input.editionType === null ? undefined : enumValue(input.editionType, EDITION_TYPES),
    editionStatement: optionalText(input.editionStatement, 512),
    facsimileStatement: optionalText(input.facsimileStatement, 512),
  });
}

function normalizeSource(value: unknown): SourceEdition {
  const input = object(value);
  keys(input, [
    "dynasty", "reignTitle", "reignYear", "absoluteYear", "printer", "imprint", "bookshop",
    "institution", "printingPlace", "editionType", "editionStatement", "holdingInformation",
  ]);
  const absoluteYear = input.absoluteYear;
  if (absoluteYear !== undefined && absoluteYear !== null && (!Number.isInteger(absoluteYear) || (absoluteYear as number) < -9999 || (absoluteYear as number) > 9999)) {
    throw new BibliographyValidationError("invalid_input");
  }
  return compact({
    dynasty: optionalText(input.dynasty, 64),
    reignTitle: optionalText(input.reignTitle, 64),
    reignYear: optionalText(input.reignYear, 64),
    absoluteYear: absoluteYear === undefined || absoluteYear === null ? undefined : absoluteYear as number,
    printer: optionalText(input.printer, 255),
    imprint: optionalText(input.imprint, 255),
    bookshop: optionalText(input.bookshop, 255),
    institution: optionalText(input.institution, 255),
    printingPlace: optionalText(input.printingPlace, 255),
    editionType: input.editionType === undefined || input.editionType === null ? undefined : enumValue(input.editionType, EDITION_TYPES),
    editionStatement: optionalText(input.editionStatement, 512),
    holdingInformation: optionalText(input.holdingInformation, 512),
  });
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function normalizeBibliographicProfileInput(value: unknown): BibliographicProfileInput {
  const input = object(value);
  keys(input, ["materialClass", "contributors", "publication", "series", "volume", "language", "carrierEdition", "sourceEdition"]);
  if (!Array.isArray(input.contributors) || input.contributors.length > 64) throw new BibliographyValidationError("invalid_input");
  const contributors = input.contributors.map((entry): BibliographicContributorInput => {
    const contributor = object(entry);
    keys(contributor, ["id", "label", "role", "roleLabel", "authorityId"]);
    if (contributor.id !== undefined && (typeof contributor.id !== "string" || !SAFE_ID.test(contributor.id))) {
      throw new BibliographyValidationError("invalid_input");
    }
    if (contributor.authorityId !== undefined && (typeof contributor.authorityId !== "string" || !SAFE_ID.test(contributor.authorityId))) {
      throw new BibliographyValidationError("invalid_input");
    }
    return compact({
      id: contributor.id as string | undefined,
      label: text(contributor.label, 255),
      role: enumValue(contributor.role, CONTRIBUTOR_ROLES),
      roleLabel: optionalText(contributor.roleLabel, 64),
      authorityId: contributor.authorityId as string | undefined,
    });
  });
  const ids = contributors.flatMap((entry) => entry.id ? [entry.id] : []);
  if (new Set(ids).size !== ids.length) throw new BibliographyValidationError("invalid_input");

  return compact({
    materialClass: enumValue(input.materialClass, MATERIAL_CLASSES),
    contributors,
    publication: normalizePublication(input.publication),
    series: optionalText(input.series, 255),
    volume: optionalText(input.volume, 128),
    language: optionalText(input.language, 128),
    carrierEdition: normalizeCarrier(input.carrierEdition),
    sourceEdition: normalizeSource(input.sourceEdition),
  });
}

export function isValidIsbn(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  if (!ISBN_10.test(normalized) && !ISBN_13.test(normalized)) return false;
  const compactValue = normalized.replace(/[ -]/gu, "").toUpperCase();
  if (compactValue.length === 10) {
    const sum = [...compactValue].reduce((total, character, index) => total + (character === "X" ? 10 : Number(character)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  const sum = [...compactValue.slice(0, 12)].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(compactValue[12]);
}

export function bibliographicScalarFields(profile: BibliographicProfileInput): ReadonlyMap<BibliographicFieldName, unknown> {
  return new Map<BibliographicFieldName, unknown>([
    ["materialClass", profile.materialClass],
    ["publication.publisher", profile.publication.publisher],
    ["publication.place", profile.publication.place],
    ["publication.publicationDate", profile.publication.publicationDate],
    ["publication.editionNumber", profile.publication.editionNumber],
    ["publication.printing", profile.publication.printing],
    ["series", profile.series],
    ["volume", profile.volume],
    ["language", profile.language],
    ["carrierEdition.editionType", profile.carrierEdition.editionType],
    ["carrierEdition.editionStatement", profile.carrierEdition.editionStatement],
    ["carrierEdition.facsimileStatement", profile.carrierEdition.facsimileStatement],
    ["sourceEdition.dynasty", profile.sourceEdition.dynasty],
    ["sourceEdition.reignTitle", profile.sourceEdition.reignTitle],
    ["sourceEdition.reignYear", profile.sourceEdition.reignYear],
    ["sourceEdition.absoluteYear", profile.sourceEdition.absoluteYear],
    ["sourceEdition.printer", profile.sourceEdition.printer],
    ["sourceEdition.imprint", profile.sourceEdition.imprint],
    ["sourceEdition.bookshop", profile.sourceEdition.bookshop],
    ["sourceEdition.institution", profile.sourceEdition.institution],
    ["sourceEdition.printingPlace", profile.sourceEdition.printingPlace],
    ["sourceEdition.editionType", profile.sourceEdition.editionType],
    ["sourceEdition.editionStatement", profile.sourceEdition.editionStatement],
    ["sourceEdition.holdingInformation", profile.sourceEdition.holdingInformation],
  ]);
}

export function changedBibliographicFields(
  previous: BibliographicProfileInput | null,
  next: BibliographicProfileInput,
): Array<{ fieldName: BibliographicFieldName; scopeKey: string }> {
  const changed: Array<{ fieldName: BibliographicFieldName; scopeKey: string }> = [];
  const contributorValues = (entries: BibliographicContributorInput[]) => entries.map((entry) => [
    entry.id ?? null, entry.label, entry.role, entry.roleLabel ?? null, entry.authorityId ?? null,
  ]);
  if (JSON.stringify(contributorValues(previous?.contributors ?? [])) !== JSON.stringify(contributorValues(next.contributors))) {
    changed.push({ fieldName: "contributors", scopeKey: "" });
  }
  const before = previous ? bibliographicScalarFields(previous) : new Map<BibliographicFieldName, unknown>();
  for (const [fieldName, value] of bibliographicScalarFields(next)) {
    if ((!previous && value !== undefined) || (previous && before.get(fieldName) !== value)) {
      changed.push({ fieldName, scopeKey: "" });
    }
  }
  const previousById = new Map(previous?.contributors.flatMap((entry) => entry.id ? [[entry.id, entry] as const] : []) ?? []);
  for (const contributor of next.contributors) {
    if (!contributor.id) continue;
    const old = previousById.get(contributor.id);
    for (const [fieldName, value] of [
      ["contributor.label", contributor.label],
      ["contributor.role", contributor.role],
      ["contributor.roleLabel", contributor.roleLabel],
      ["contributor.authorityId", contributor.authorityId],
    ] as const) {
      const oldValue = old?.[fieldName.slice("contributor.".length) as "label" | "role" | "roleLabel" | "authorityId"];
      if (!old || oldValue !== value) changed.push({ fieldName, scopeKey: contributor.id });
    }
  }
  return changed;
}
