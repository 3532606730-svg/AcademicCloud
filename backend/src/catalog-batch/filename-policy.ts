import type { CatalogFilenameStyle } from "@academiccloud/compute-contracts";

import type { BibliographicContributorInput, EditionType, MaterialClass } from "../bibliography/bibliography.js";

export const MAX_CATALOG_FILENAME_CHARACTERS = 240;

export interface CatalogFilenameInput {
  canonicalTitle: string;
  materialClass: MaterialClass;
  contributors: BibliographicContributorInput[];
  editionType?: EditionType | undefined;
  editionStatement?: string | undefined;
  sourceEditionType?: EditionType | undefined;
  sourceEditionStatement?: string | undefined;
  sourceDynasty?: string | undefined;
  sourceReignTitle?: string | undefined;
  publisher?: string | undefined;
  currentFilename?: string | undefined;
  dateStatement?: string | undefined;
  publicationDate?: string | undefined;
  responsibilityStatement?: string | undefined;
  filenameStyle: CatalogFilenameStyle;
}

export type CatalogFilenameOutcome =
  | { status: "proposed"; filename: string; responsibility: string | null; year: string | null }
  | { status: "no_rename"; reason: "missing_title" | "missing_responsibility" | "missing_year" | "missing_original_filename" | "unsafe_filename" };

const INVALID_FILENAME_CHARACTER = /[<>:"/\\|?*]/gu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/gu;
const HAS_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const INVALID_REPLACEMENTS: Readonly<Record<string, string>> = {
  "<": "＜", ">": "＞", ":": "：", "\"": "＂", "/": "／",
  "\\": "＼", "|": "｜", "?": "？", "*": "＊",
};
const SOURCE_MATERIAL_CLASSES = new Set<MaterialClass>([
  "primary_source_modern_edition", "traditional_book", "collected_documents", "manuscript",
]);
const HISTORICAL_SOURCE_MATERIAL_CLASSES = new Set<MaterialClass>([
  "traditional_book", "manuscript",
]);
const HISTORICAL_EDITION_TYPE_LABELS: Partial<Record<EditionType, string>> = {
  engraved: "刻本",
  recut: "重刻本",
  facsimile_engraved: "影刻本",
  movable_type: "活字本",
  multicolor_print: "套印本",
  manuscript_copy: "抄本",
  hand_copy: "手抄本",
  facsimile_hand_copy: "影抄本",
  lithograph: "石印本",
  letterpress: "铅印本",
};
const MAX_CONCISE_SOURCE_VERSION_CHARACTERS = 32;
const VERBOSE_SOURCE_VERSION = /(?:据|影印(?:自|据)?|重印|翻印|复印|底本|原版|新一版|新版|复制)/u;
const CONCISE_HISTORICAL_EDITION = /(?:刻本|刊本|抄本|写本|稿本|活字本|套印本|石印本|影刻本|影抄本|本)$/u;

function cleanComponent(value: string): string | null {
  const normalized = value.normalize("NFC")
    .replace(CONTROL_CHARACTER, " ")
    .replace(INVALID_FILENAME_CHARACTER, (character) => INVALID_REPLACEMENTS[character] ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[ .]+$/gu, "");
  return normalized ? normalized : null;
}

function authorLabels(contributors: BibliographicContributorInput[]): string[] {
  return contributors.filter((entry) => entry.role === "author").map((entry) => entry.label);
}

function roleResponsibility(contributors: BibliographicContributorInput[]): string | null {
  const relevant = contributors.filter((entry) => entry.role !== "author" && entry.roleLabel);
  if (relevant.length === 0) return null;
  const roleLabels = new Set(relevant.map((entry) => entry.roleLabel));
  if (roleLabels.size === 1) {
    return `${relevant.map((entry) => entry.label).join("、")}${relevant[0]!.roleLabel}`;
  }
  return relevant.map((entry) => `${entry.label}${entry.roleLabel}`).join("、");
}

function translatedResponsibility(contributors: BibliographicContributorInput[]): string | null {
  const authors = authorLabels(contributors);
  const translators = contributors.filter((entry) => entry.role === "translator");
  if (authors.length === 0 || translators.length === 0 || translators.some((entry) => !entry.roleLabel)) return null;
  const roleLabels = new Set(translators.map((entry) => entry.roleLabel));
  if (roleLabels.size !== 1) return null;
  return `${authors.join("、")}著、${translators.map((entry) => entry.label).join("、")}${translators[0]!.roleLabel}`;
}

function conciseHistoricalEditionStatement(value: string | undefined): string | null {
  const normalized = cleanComponent(value ?? "");
  if (!normalized) return null;
  if ([...normalized].length > MAX_CONCISE_SOURCE_VERSION_CHARACTERS) return null;
  if (VERBOSE_SOURCE_VERSION.test(normalized)) return null;
  return CONCISE_HISTORICAL_EDITION.test(normalized) ? normalized : null;
}

function structuredHistoricalSourceLabel(input: Pick<CatalogFilenameInput,
  "editionType" | "editionStatement" | "sourceEditionType" | "sourceEditionStatement" | "sourceDynasty" | "sourceReignTitle">): string | null {
  const dynasty = cleanComponent(input.sourceDynasty ?? "");
  const reignTitle = cleanComponent(input.sourceReignTitle ?? "");
  if (dynasty && reignTitle) return cleanComponent(`${dynasty}${reignTitle}本`);
  if (reignTitle) return cleanComponent(`${reignTitle}本`);

  const sourceStatement = conciseHistoricalEditionStatement(input.sourceEditionStatement);
  if (sourceStatement) return sourceStatement;
  const carrierStatement = conciseHistoricalEditionStatement(input.editionStatement);
  if (carrierStatement) return carrierStatement;

  const editionType = input.sourceEditionType ?? input.editionType;
  if (!editionType) return null;
  return cleanComponent(HISTORICAL_EDITION_TYPE_LABELS[editionType] ?? "");
}

function sourceVersionLabel(input: Pick<CatalogFilenameInput,
  "materialClass" | "editionType" | "editionStatement" | "sourceEditionType" | "sourceEditionStatement" |
  "sourceDynasty" | "sourceReignTitle" | "publisher">): string | null {
  const publisher = cleanComponent(input.publisher ?? "");
  if (publisher) return publisher;
  if (!HISTORICAL_SOURCE_MATERIAL_CLASSES.has(input.materialClass)) return null;
  return structuredHistoricalSourceLabel(input);
}

function safeFilename(filename: string): boolean {
  return [...filename].length <= MAX_CATALOG_FILENAME_CHARACTERS
    && !HAS_CONTROL_CHARACTER.test(filename)
    && !/[<>:"/\\|?*]/u.test(filename)
    && !/[ .]\.pdf$/u.test(filename);
}

export function deriveCatalogResponsibility(input: Pick<CatalogFilenameInput, "materialClass" | "contributors" | "editionType" | "filenameStyle">): string | null {
  if (input.filenameStyle === "preserve_original" || input.filenameStyle === "cjk_source") return null;
  if (input.filenameStyle === "cjk_article" || input.filenameStyle === "foreign_book") {
    const authors = authorLabels(input.contributors);
    return authors.length > 0 ? authors.join(input.filenameStyle === "cjk_article" ? "、" : ", ") : null;
  }
  if (input.editionType === "translated_edition") return translatedResponsibility(input.contributors);
  if (SOURCE_MATERIAL_CLASSES.has(input.materialClass)) return roleResponsibility(input.contributors);
  const authors = authorLabels(input.contributors);
  return authors.length > 0 ? authors.join("、") : roleResponsibility(input.contributors);
}

export function formatCatalogFilename(input: CatalogFilenameInput): CatalogFilenameOutcome {
  if (input.filenameStyle === "preserve_original") {
    const current = input.currentFilename?.normalize("NFC").trim();
    if (!current) return { status: "no_rename", reason: "missing_original_filename" };
    return { status: "proposed", filename: current, responsibility: null, year: null };
  }

  const title = cleanComponent(input.canonicalTitle);
  if (!title) return { status: "no_rename", reason: "missing_title" };

  if (input.filenameStyle === "cjk_book" && input.materialClass === "other" && input.contributors.length === 0 && input.currentFilename) {
    const current = input.currentFilename.normalize("NFC").trim();
    if (current) return { status: "proposed", filename: current, responsibility: null, year: null };
  }

  const year = cleanComponent(input.dateStatement ?? input.publicationDate ?? "");
  const responsibility = deriveCatalogResponsibility(input);
  const suppliedResponsibility = input.responsibilityStatement?.normalize("NFC").trim();
  const hasModernResponsibilityCandidate = input.contributors.some((entry) => entry.role !== "author");

  const useSourceVersion = input.filenameStyle === "cjk_source"
    || input.filenameStyle === "cjk_book"
      && SOURCE_MATERIAL_CLASSES.has(input.materialClass)
      && responsibility === null
      && !hasModernResponsibilityCandidate;
  if (useSourceVersion) {
    const version = sourceVersionLabel(input);
    if (!version) return { status: "no_rename", reason: "missing_responsibility" };
    if (!year) return { status: "no_rename", reason: "missing_year" };
    const filename = `《${title}》（${version}，${year}）.pdf`;
    if (!safeFilename(filename)) return { status: "no_rename", reason: "unsafe_filename" };
    return { status: "proposed", filename, responsibility: null, year };
  }

  if (!responsibility) return { status: "no_rename", reason: "missing_responsibility" };
  if (suppliedResponsibility !== undefined && suppliedResponsibility !== responsibility) {
    return { status: "no_rename", reason: "missing_responsibility" };
  }
  if (!year) return { status: "no_rename", reason: "missing_year" };
  const safeResponsibility = cleanComponent(responsibility);
  if (!safeResponsibility) return { status: "no_rename", reason: "missing_responsibility" };

  const filename = input.filenameStyle === "cjk_article"
    ? `${safeResponsibility}：《${title}》（${year}）.pdf`
    : input.filenameStyle === "foreign_book"
      ? `${title} (${safeResponsibility}, ${year}).pdf`
      : `《${title}》（${safeResponsibility}，${year}）.pdf`;
  if (!safeFilename(filename)) return { status: "no_rename", reason: "unsafe_filename" };
  return { status: "proposed", filename, responsibility: safeResponsibility, year };
}
