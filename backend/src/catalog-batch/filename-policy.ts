import type { CatalogFilenameStyle } from "@academiccloud/compute-contracts";

import type { BibliographicContributorInput, EditionType, MaterialClass } from "../bibliography/bibliography.js";

export const MAX_CATALOG_FILENAME_CHARACTERS = 240;

export interface CatalogFilenameInput {
  canonicalTitle: string;
  materialClass: MaterialClass;
  contributors: BibliographicContributorInput[];
  editionType?: EditionType | undefined;
  dateStatement?: string | undefined;
  publicationDate?: string | undefined;
  responsibilityStatement?: string | undefined;
  filenameStyle: CatalogFilenameStyle;
}

export type CatalogFilenameOutcome =
  | { status: "proposed"; filename: string; responsibility: string; year: string }
  | { status: "no_rename"; reason: "missing_title" | "missing_responsibility" | "missing_year" | "unsafe_filename" };

const INVALID_FILENAME_CHARACTER = /[<>:"/\\|?*]/gu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/gu;
const HAS_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const INVALID_REPLACEMENTS: Readonly<Record<string, string>> = {
  "<": "＜", ">": "＞", ":": "：", "\"": "＂", "/": "／",
  "\\": "＼", "|": "｜", "?": "？", "*": "＊",
};

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
  const translators = contributors.filter((entry) => entry.role === "translator");
  if (translators.length === 0 || translators.some((entry) => !entry.roleLabel)) return null;
  const roleLabels = new Set(translators.map((entry) => entry.roleLabel));
  if (roleLabels.size !== 1) return null;
  return `${translators.map((entry) => entry.label).join("、")}${translators[0]!.roleLabel}`;
}

export function deriveCatalogResponsibility(input: Pick<CatalogFilenameInput, "materialClass" | "contributors" | "editionType" | "filenameStyle">): string | null {
  if (input.filenameStyle === "cjk_article" || input.filenameStyle === "foreign_book") {
    const authors = authorLabels(input.contributors);
    return authors.length > 0 ? authors.join(input.filenameStyle === "cjk_article" ? "、" : ", ") : null;
  }
  if (input.editionType === "translated_edition") return translatedResponsibility(input.contributors);
  if (["primary_source_modern_edition", "traditional_book", "collected_documents", "manuscript"].includes(input.materialClass)) {
    return roleResponsibility(input.contributors);
  }
  const authors = authorLabels(input.contributors);
  return authors.length > 0 ? authors.join("、") : roleResponsibility(input.contributors);
}

export function formatCatalogFilename(input: CatalogFilenameInput): CatalogFilenameOutcome {
  const title = cleanComponent(input.canonicalTitle);
  if (!title) return { status: "no_rename", reason: "missing_title" };
  const responsibility = deriveCatalogResponsibility(input);
  if (!responsibility) return { status: "no_rename", reason: "missing_responsibility" };
  const suppliedResponsibility = input.responsibilityStatement?.normalize("NFC").trim();
  if (suppliedResponsibility !== undefined && suppliedResponsibility !== responsibility) {
    return { status: "no_rename", reason: "missing_responsibility" };
  }
  const year = cleanComponent(input.dateStatement ?? input.publicationDate ?? "");
  if (!year) return { status: "no_rename", reason: "missing_year" };
  const safeResponsibility = cleanComponent(responsibility);
  if (!safeResponsibility) return { status: "no_rename", reason: "missing_responsibility" };

  const filename = input.filenameStyle === "cjk_article"
    ? `${safeResponsibility}：《${title}》（${year}）.pdf`
    : input.filenameStyle === "foreign_book"
      ? `${title} (${safeResponsibility}, ${year}).pdf`
      : `《${title}》（${safeResponsibility}，${year}）.pdf`;
  if ([...filename].length > MAX_CATALOG_FILENAME_CHARACTERS || HAS_CONTROL_CHARACTER.test(filename)
    || /[<>:"/\\|?*]/u.test(filename) || /[ .]\.pdf$/u.test(filename)) {
    return { status: "no_rename", reason: "unsafe_filename" };
  }
  return { status: "proposed", filename, responsibility: safeResponsibility, year };
}
