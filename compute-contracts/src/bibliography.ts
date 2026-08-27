export const INTELLIGENT_MATERIAL_CLASSES = [
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
export type IntelligentMaterialClass = (typeof INTELLIGENT_MATERIAL_CLASSES)[number];

export const INTELLIGENT_CONTRIBUTOR_ROLES = [
  "author", "editor", "compiler", "translator", "annotator", "collator",
  "punctuator", "commentator", "reviser", "selector", "organizer", "other",
] as const;
export type IntelligentContributorRole = (typeof INTELLIGENT_CONTRIBUTOR_ROLES)[number];

export const INTELLIGENT_EDITION_TYPES = [
  "critical_edition", "annotated_edition", "collated_edition", "punctuated_edition",
  "translated_edition", "facsimile", "reprint", "engraved", "recut",
  "facsimile_engraved", "movable_type", "multicolor_print", "manuscript_copy",
  "hand_copy", "draft_manuscript", "facsimile_hand_copy", "lithograph",
  "letterpress", "composite_repaired", "hand_copy_repaired", "repaired", "other", "unknown",
] as const;
export type IntelligentEditionType = (typeof INTELLIGENT_EDITION_TYPES)[number];

export const INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES = [
  "materialClass", "canonicalTitle", "subtitle", "alternativeTitles", "dateStatement", "identifiers",
  "publication.publisher", "publication.place", "publication.publicationDate", "publication.editionNumber",
  "publication.printing", "series", "volume", "language", "carrierEdition.editionType",
  "carrierEdition.editionStatement", "carrierEdition.facsimileStatement", "sourceEdition.dynasty",
  "sourceEdition.reignTitle", "sourceEdition.reignYear", "sourceEdition.absoluteYear", "sourceEdition.printer",
  "sourceEdition.imprint", "sourceEdition.bookshop", "sourceEdition.institution", "sourceEdition.printingPlace",
  "sourceEdition.editionType", "sourceEdition.editionStatement", "sourceEdition.holdingInformation",
  "contributor.label", "contributor.role", "contributor.roleLabel",
] as const;
export type IntelligentBibliographicFieldName = (typeof INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES)[number];

export const INTELLIGENT_BIBLIOGRAPHY_STATUSES = ["auto_apply", "ambiguous", "no_bibliography"] as const;
export type IntelligentBibliographyStatus = (typeof INTELLIGENT_BIBLIOGRAPHY_STATUSES)[number];

export interface IntelligentIdentifier { scheme: string; value: string }
export interface IntelligentContributor {
  label: string;
  role: IntelligentContributorRole;
  roleLabel: string | null;
}
export interface IntelligentCanonicalBibliography {
  materialClass: IntelligentMaterialClass;
  canonicalTitle: string;
  subtitle: string | null;
  alternativeTitles: string[];
  dateStatement: string | null;
  identifiers: IntelligentIdentifier[];
  contributors: IntelligentContributor[];
  publication: {
    publisher: string | null;
    place: string | null;
    publicationDate: string | null;
    editionNumber: string | null;
    printing: string | null;
  };
  series: string | null;
  volume: string | null;
  language: string | null;
  carrierEdition: {
    editionType: IntelligentEditionType | null;
    editionStatement: string | null;
    facsimileStatement: string | null;
  };
  sourceEdition: {
    dynasty: string | null;
    reignTitle: string | null;
    reignYear: string | null;
    absoluteYear: number | null;
    printer: string | null;
    imprint: string | null;
    bookshop: string | null;
    institution: string | null;
    printingPlace: string | null;
    editionType: IntelligentEditionType | null;
    editionStatement: string | null;
    holdingInformation: string | null;
  };
}

export interface IntelligentFieldEvidence {
  fieldName: IntelligentBibliographicFieldName;
  /** Empty for scalar fields; `contributor:N` for contributor fields. */
  scopeKey: string;
  confidence: number;
  sourceType: "title_page" | "copyright_page" | "cip_page" | "colophon" | "series_page" | "embedded_pdf_metadata";
  sourcePageIndex: number | null;
  pageClass: "cover" | "half_title" | "title_page" | "copyright_page" | "cip_page" | "colophon" | "series_page" | "contents_preface" | "ordinary_body" | "unknown" | null;
  evidenceOrigin: "native_text" | "ocr" | "embedded_pdf_metadata";
  /** SHA-256 of bounded process-local evidence; raw OCR/native text is not returned. */
  evidenceSha256: string;
}

export interface IntelligentBibliographyProvenance {
  ocr: {
    used: boolean;
    family: "PaddleOCR";
    packageVersion: "3.7.0";
    runtimeFamily: "PaddlePaddle";
    runtimeVersion: "3.3.1";
    detectionModel: { name: "PP-OCRv6_small_det"; revision: string; sha256: string };
    recognitionModel: { name: "PP-OCRv6_small_rec"; revision: string; sha256: string };
    legacyFallback: boolean;
  };
  reasoning: {
    family: "Qwen3";
    name: "Qwen3-1.7B-GGUF";
    revision: string;
    sha256: string;
    quantization: "Q8_0";
    runtimeFamily: "llama.cpp";
    runtimeVersion: string;
    runtimeRevision: string;
    runtimeSha256: string;
  };
  selectedPages: number[];
  promptVersion:
    | "l1-intelligent-library01-prompt-v1"
    | "l1-intelligent-library01-prompt-v2"
    | "l1-intelligent-library01-prompt-v3";
}

export interface IntelligentBibliographyResult {
  contractVersion: 1;
  rulesetVersion:
    | "l1-intelligent-library01-v1"
    | "l1-intelligent-library01-v2"
    | "l1-intelligent-library01-v3";
  status: IntelligentBibliographyStatus;
  overallConfidence: number;
  canonical: IntelligentCanonicalBibliography | null;
  fields: IntelligentFieldEvidence[];
  warnings: string[];
  provenance: IntelligentBibliographyProvenance;
}

const SOURCES = ["title_page", "copyright_page", "cip_page", "colophon", "series_page", "embedded_pdf_metadata"] as const;
const PAGE_CLASSES = ["cover", "half_title", "title_page", "copyright_page", "cip_page", "colophon", "series_page", "contents_preface", "ordinary_body", "unknown"] as const;
const ORIGINS = ["native_text", "ocr", "embedded_pdf_metadata"] as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const CONTRIBUTOR_SCOPE = /^contributor:(\d|[1-5]\d|6[0-3])$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const registry = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !registry.has(key));
  if (unexpected) throw new TypeError(`${label} contains unsupported field ${unexpected}`);
  const missing = allowed.find((key) => !(key in value));
  if (missing) throw new TypeError(`${label} is missing field ${missing}`);
}

function oneOf<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new TypeError(`${label} is invalid`);
  return value as T[number];
}

function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} is invalid`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > maximum || CONTROL.test(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}

function nullableText(value: unknown, maximum: number, label: string): string | null {
  return value === null ? null : text(value, maximum, label);
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError(`${label} is invalid`);
  return value as number;
}

function stringList(value: unknown, maximumItems: number, maximumLength: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new TypeError(`${label} is invalid`);
  const parsed = value.map((entry, index) => text(entry, maximumLength, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) throw new TypeError(`${label} contains duplicates`);
  return parsed;
}

export function parseIntelligentCanonicalBibliography(value: unknown): IntelligentCanonicalBibliography {
  const input = record(value, "bibliography.canonical");
  keys(input, ["materialClass", "canonicalTitle", "subtitle", "alternativeTitles", "dateStatement", "identifiers", "contributors", "publication", "series", "volume", "language", "carrierEdition", "sourceEdition"], "bibliography.canonical");
  if (!Array.isArray(input.identifiers) || input.identifiers.length > 32 || !Array.isArray(input.contributors) || input.contributors.length > 64) {
    throw new TypeError("bibliography canonical arrays are invalid");
  }
  const identifiers = input.identifiers.map((entry, index): IntelligentIdentifier => {
    const item = record(entry, `identifier[${index}]`);
    keys(item, ["scheme", "value"], `identifier[${index}]`);
    const identifier = { scheme: text(item.scheme, 32, "identifier.scheme").toLowerCase(), value: text(item.value, 128, "identifier.value") };
    if (identifier.scheme === "isbn" && !validIsbn(identifier.value)) throw new TypeError("identifier ISBN checksum is invalid");
    return identifier;
  });
  const contributors = input.contributors.map((entry, index): IntelligentContributor => {
    const item = record(entry, `contributor[${index}]`);
    keys(item, ["label", "role", "roleLabel"], `contributor[${index}]`);
    return {
      label: text(item.label, 255, "contributor.label"),
      role: oneOf(item.role, INTELLIGENT_CONTRIBUTOR_ROLES, "contributor.role"),
      roleLabel: nullableText(item.roleLabel, 64, "contributor.roleLabel"),
    };
  });
  const publication = record(input.publication, "bibliography.publication");
  keys(publication, ["publisher", "place", "publicationDate", "editionNumber", "printing"], "bibliography.publication");
  const carrier = record(input.carrierEdition, "bibliography.carrierEdition");
  keys(carrier, ["editionType", "editionStatement", "facsimileStatement"], "bibliography.carrierEdition");
  const source = record(input.sourceEdition, "bibliography.sourceEdition");
  keys(source, ["dynasty", "reignTitle", "reignYear", "absoluteYear", "printer", "imprint", "bookshop", "institution", "printingPlace", "editionType", "editionStatement", "holdingInformation"], "bibliography.sourceEdition");
  return {
    materialClass: oneOf(input.materialClass, INTELLIGENT_MATERIAL_CLASSES, "bibliography.materialClass"),
    canonicalTitle: text(input.canonicalTitle, 512, "bibliography.canonicalTitle"),
    subtitle: nullableText(input.subtitle, 512, "bibliography.subtitle"),
    alternativeTitles: stringList(input.alternativeTitles, 32, 512, "bibliography.alternativeTitles"),
    dateStatement: nullableText(input.dateStatement, 64, "bibliography.dateStatement"),
    identifiers,
    contributors,
    publication: {
      publisher: nullableText(publication.publisher, 255, "publication.publisher"),
      place: nullableText(publication.place, 255, "publication.place"),
      publicationDate: nullableText(publication.publicationDate, 64, "publication.publicationDate"),
      editionNumber: nullableText(publication.editionNumber, 128, "publication.editionNumber"),
      printing: nullableText(publication.printing, 128, "publication.printing"),
    },
    series: nullableText(input.series, 255, "bibliography.series"),
    volume: nullableText(input.volume, 128, "bibliography.volume"),
    language: nullableText(input.language, 128, "bibliography.language"),
    carrierEdition: {
      editionType: carrier.editionType === null ? null : oneOf(carrier.editionType, INTELLIGENT_EDITION_TYPES, "carrierEdition.editionType"),
      editionStatement: nullableText(carrier.editionStatement, 512, "carrierEdition.editionStatement"),
      facsimileStatement: nullableText(carrier.facsimileStatement, 512, "carrierEdition.facsimileStatement"),
    },
    sourceEdition: {
      dynasty: nullableText(source.dynasty, 64, "sourceEdition.dynasty"),
      reignTitle: nullableText(source.reignTitle, 64, "sourceEdition.reignTitle"),
      reignYear: nullableText(source.reignYear, 64, "sourceEdition.reignYear"),
      absoluteYear: source.absoluteYear === null ? null : integer(source.absoluteYear, -9999, 9999, "sourceEdition.absoluteYear"),
      printer: nullableText(source.printer, 255, "sourceEdition.printer"),
      imprint: nullableText(source.imprint, 255, "sourceEdition.imprint"),
      bookshop: nullableText(source.bookshop, 255, "sourceEdition.bookshop"),
      institution: nullableText(source.institution, 255, "sourceEdition.institution"),
      printingPlace: nullableText(source.printingPlace, 255, "sourceEdition.printingPlace"),
      editionType: source.editionType === null ? null : oneOf(source.editionType, INTELLIGENT_EDITION_TYPES, "sourceEdition.editionType"),
      editionStatement: nullableText(source.editionStatement, 512, "sourceEdition.editionStatement"),
      holdingInformation: nullableText(source.holdingInformation, 512, "sourceEdition.holdingInformation"),
    },
  };
}

function parseFields(value: unknown, contributorCount: number): IntelligentFieldEvidence[] {
  if (!Array.isArray(value) || value.length > 128) throw new TypeError("bibliography.fields is invalid");
  const unique = new Set<string>();
  return value.map((entry, index): IntelligentFieldEvidence => {
    const field = record(entry, `bibliography.fields[${index}]`);
    keys(field, ["fieldName", "scopeKey", "confidence", "sourceType", "sourcePageIndex", "pageClass", "evidenceOrigin", "evidenceSha256"], `bibliography.fields[${index}]`);
    const fieldName = oneOf(field.fieldName, INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES, "fieldName");
    const scopeKey = typeof field.scopeKey === "string" ? field.scopeKey : "invalid";
    const contributorField = fieldName.startsWith("contributor.");
    if (contributorField !== CONTRIBUTOR_SCOPE.test(scopeKey)) throw new TypeError("bibliography field scope is invalid");
    if (contributorField && Number(scopeKey.slice("contributor:".length)) >= contributorCount) throw new TypeError("bibliography contributor scope is invalid");
    if (!contributorField && scopeKey !== "") throw new TypeError("bibliography scalar field scope must be empty");
    const uniqueKey = `${fieldName}:${scopeKey}`;
    if (unique.has(uniqueKey)) throw new TypeError("bibliography fields contain duplicates");
    unique.add(uniqueKey);
    const sourcePageIndex = field.sourcePageIndex === null ? null : integer(field.sourcePageIndex, 1, 1_000_000, "field.sourcePageIndex");
    const evidenceOrigin = oneOf(field.evidenceOrigin, ORIGINS, "field.evidenceOrigin");
    if ((evidenceOrigin === "native_text" || evidenceOrigin === "ocr") !== (sourcePageIndex !== null)) {
      throw new TypeError("bibliography page evidence provenance is invalid");
    }
    if (evidenceOrigin === "embedded_pdf_metadata"
      ? field.sourceType !== "embedded_pdf_metadata" || field.pageClass !== null
      : field.sourceType === "embedded_pdf_metadata" || field.pageClass === null) {
      throw new TypeError("bibliography evidence source is inconsistent");
    }
    const evidenceSha256 = typeof field.evidenceSha256 === "string" ? field.evidenceSha256 : "";
    if (!SHA256.test(evidenceSha256)) throw new TypeError("bibliography evidence digest is invalid");
    return {
      fieldName,
      scopeKey,
      confidence: integer(field.confidence, 0, 100, "field.confidence"),
      sourceType: oneOf(field.sourceType, SOURCES, "field.sourceType"),
      sourcePageIndex,
      pageClass: field.pageClass === null ? null : oneOf(field.pageClass, PAGE_CLASSES, "field.pageClass"),
      evidenceOrigin,
      evidenceSha256,
    };
  });
}

function parseProvenance(value: unknown): IntelligentBibliographyProvenance {
  const provenance = record(value, "bibliography.provenance");
  keys(provenance, ["ocr", "reasoning", "selectedPages", "promptVersion"], "bibliography.provenance");
  const ocr = record(provenance.ocr, "bibliography.provenance.ocr");
  keys(ocr, ["used", "family", "packageVersion", "runtimeFamily", "runtimeVersion", "detectionModel", "recognitionModel", "legacyFallback"], "bibliography.provenance.ocr");
  const detection = record(ocr.detectionModel, "bibliography.provenance.ocr.detectionModel");
  const recognition = record(ocr.recognitionModel, "bibliography.provenance.ocr.recognitionModel");
  keys(detection, ["name", "revision", "sha256"], "detectionModel");
  keys(recognition, ["name", "revision", "sha256"], "recognitionModel");
  const reasoning = record(provenance.reasoning, "bibliography.provenance.reasoning");
  keys(reasoning, ["family", "name", "revision", "sha256", "quantization", "runtimeFamily", "runtimeVersion", "runtimeRevision", "runtimeSha256"], "bibliography.provenance.reasoning");
  if (!Array.isArray(provenance.selectedPages) || provenance.selectedPages.length > 20
    || typeof ocr.used !== "boolean" || typeof ocr.legacyFallback !== "boolean") {
    throw new TypeError("bibliography provenance is invalid");
  }
  const selectedPages = provenance.selectedPages.map((entry, index) => integer(entry, 1, 1_000_000, `selectedPages[${index}]`));
  if (new Set(selectedPages).size !== selectedPages.length || selectedPages.some((entry, index) => index > 0 && entry <= selectedPages[index - 1]!)) {
    throw new TypeError("bibliography selected pages must be ordered and unique");
  }
  return {
    ocr: {
      used: ocr.used,
      family: oneOf(ocr.family, ["PaddleOCR"] as const, "ocr.family"),
      packageVersion: oneOf(ocr.packageVersion, ["3.7.0"] as const, "ocr.packageVersion"),
      runtimeFamily: oneOf(ocr.runtimeFamily, ["PaddlePaddle"] as const, "ocr.runtimeFamily"),
      runtimeVersion: oneOf(ocr.runtimeVersion, ["3.3.1"] as const, "ocr.runtimeVersion"),
      detectionModel: {
        name: oneOf(detection.name, ["PP-OCRv6_small_det"] as const, "detectionModel.name"),
        revision: oneOf(detection.revision, ["106c97591b235f607453300d9fc8c1cad1b25488"] as const, "detectionModel.revision"),
        sha256: oneOf(detection.sha256, ["5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da"] as const, "detectionModel.sha256"),
      },
      recognitionModel: {
        name: oneOf(recognition.name, ["PP-OCRv6_small_rec"] as const, "recognitionModel.name"),
        revision: oneOf(recognition.revision, ["bd619643acac4b9650c040234da8d944476ee3f1"] as const, "recognitionModel.revision"),
        sha256: oneOf(recognition.sha256, ["406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907"] as const, "recognitionModel.sha256"),
      },
      legacyFallback: ocr.legacyFallback,
    },
    reasoning: {
      family: oneOf(reasoning.family, ["Qwen3"] as const, "reasoning.family"),
      name: oneOf(reasoning.name, ["Qwen3-1.7B-GGUF"] as const, "reasoning.name"),
      revision: oneOf(reasoning.revision, ["90862c4b9d2787eaed51d12237eafdfe7c5f6077"] as const, "reasoning.revision"),
      sha256: oneOf(reasoning.sha256, ["061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a"] as const, "reasoning.sha256"),
      quantization: oneOf(reasoning.quantization, ["Q8_0"] as const, "reasoning.quantization"),
      runtimeFamily: oneOf(reasoning.runtimeFamily, ["llama.cpp"] as const, "reasoning.runtimeFamily"),
      runtimeVersion: oneOf(reasoning.runtimeVersion, ["b10218"] as const, "reasoning.runtimeVersion"),
      runtimeRevision: oneOf(reasoning.runtimeRevision, ["de69995"] as const, "reasoning.runtimeRevision"),
      runtimeSha256: oneOf(reasoning.runtimeSha256, ["78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b"] as const, "reasoning.runtimeSha256"),
    },
    selectedPages,
    promptVersion: oneOf(provenance.promptVersion, [
      "l1-intelligent-library01-prompt-v1",
      "l1-intelligent-library01-prompt-v2",
      "l1-intelligent-library01-prompt-v3",
    ] as const, "promptVersion"),
  };
}

export function parseIntelligentBibliographyResult(value: unknown): IntelligentBibliographyResult {
  const input = record(value, "bibliography");
  keys(input, ["contractVersion", "rulesetVersion", "status", "overallConfidence", "canonical", "fields", "warnings", "provenance"], "bibliography");
  if (input.contractVersion !== 1) throw new TypeError("bibliography contract is invalid");
  const rulesetVersion = oneOf(input.rulesetVersion, [
    "l1-intelligent-library01-v1",
    "l1-intelligent-library01-v2",
    "l1-intelligent-library01-v3",
  ] as const, "bibliography.rulesetVersion");
  const status = oneOf(input.status, INTELLIGENT_BIBLIOGRAPHY_STATUSES, "bibliography.status");
  const canonical = input.canonical === null ? null : parseIntelligentCanonicalBibliography(input.canonical);
  if ((status === "no_bibliography") !== (canonical === null)) {
    throw new TypeError("bibliography canonical result is inconsistent with its status");
  }
  const fields = parseFields(input.fields, canonical?.contributors.length ?? 0);
  const provenance = parseProvenance(input.provenance);
  const overallConfidence = integer(input.overallConfidence, 0, 100, "bibliography.overallConfidence");
  const warnings = stringList(input.warnings, 32, 160, "bibliography.warnings");
  const requiredFields = canonical === null ? new Set<string>() : populatedFieldKeys(canonical);
  const suppliedFields = new Map(fields.map((field) => [`${field.fieldName}:${field.scopeKey}`, field]));
  if (requiredFields.size !== suppliedFields.size || [...requiredFields].some((key) => !suppliedFields.has(key))) {
    throw new TypeError("bibliography field evidence does not exactly cover populated facts");
  }
  if (status === "auto_apply" && (overallConfidence < 85 || warnings.length > 0
    || [...suppliedFields.values()].some((field) => field.confidence < 85))) {
    throw new TypeError("auto-apply bibliography must pass the deterministic confidence gate");
  }
  if (status === "no_bibliography" && fields.length > 0) throw new TypeError("no-bibliography result cannot carry field evidence");
  if (provenance.ocr.legacyFallback && !provenance.ocr.used) {
    throw new TypeError("legacy OCR fallback cannot be reported when OCR was not used");
  }
  const selectedPages = new Set(provenance.selectedPages);
  if (fields.some((field) => field.sourcePageIndex !== null && !selectedPages.has(field.sourcePageIndex))) {
    throw new TypeError("bibliography field evidence falls outside the selected pages");
  }
  if (!provenance.ocr.used && fields.some((field) => field.evidenceOrigin === "ocr")) {
    throw new TypeError("OCR field evidence requires OCR-used provenance");
  }
  return {
    contractVersion: 1,
    rulesetVersion,
    status,
    overallConfidence,
    canonical,
    fields,
    warnings,
    provenance,
  };
}

function validIsbn(value: string): boolean {
  const compact = value.normalize("NFKC").replace(/[^0-9X]/giu, "").toUpperCase();
  if (compact.length === 10) {
    return [...compact].reduce((sum, character, index) => sum + (character === "X" ? 10 : Number(character)) * (10 - index), 0) % 11 === 0;
  }
  if (compact.length === 13) {
    const sum = [...compact.slice(0, 12)].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - sum % 10) % 10 === Number(compact[12]);
  }
  return false;
}

function populatedFieldKeys(canonical: IntelligentCanonicalBibliography): Set<string> {
  const fields = new Set<string>(["materialClass:", "canonicalTitle:"]);
  if (canonical.subtitle !== null) fields.add("subtitle:");
  if (canonical.alternativeTitles.length > 0) fields.add("alternativeTitles:");
  if (canonical.dateStatement !== null) fields.add("dateStatement:");
  if (canonical.identifiers.length > 0) fields.add("identifiers:");
  for (const [key, value] of Object.entries(canonical.publication)) if (value !== null) fields.add(`publication.${key}:`);
  for (const key of ["series", "volume", "language"] as const) if (canonical[key] !== null) fields.add(`${key}:`);
  for (const [key, value] of Object.entries(canonical.carrierEdition)) if (value !== null) fields.add(`carrierEdition.${key}:`);
  for (const [key, value] of Object.entries(canonical.sourceEdition)) if (value !== null) fields.add(`sourceEdition.${key}:`);
  canonical.contributors.forEach((contributor, index) => {
    fields.add(`contributor.label:contributor:${index}`);
    fields.add(`contributor.role:contributor:${index}`);
    if (contributor.roleLabel !== null) fields.add(`contributor.roleLabel:contributor:${index}`);
  });
  return fields;
}
