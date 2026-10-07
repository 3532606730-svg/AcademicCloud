import type { MaterialClass } from "../bibliography/bibliography.js";

export const CITATION_STYLES = ["chicago-notes-bibliography", "lishi-yanjiu", "wenshizhe", "gb-t-7714-2025"] as const;
export type CitationStyleId = (typeof CITATION_STYLES)[number];

export const CITATION_LOCATOR_TYPES = [
  "page",
  "page_range",
  "volume",
  "fascicle",
  "chapter",
  "juan",
  "folio",
  "line",
  "item",
  "document_number",
  "archive_call_number",
  "custom",
] as const;
export type CitationLocatorType = (typeof CITATION_LOCATOR_TYPES)[number];
export type FolioSide = "recto" | "verso";

export interface CitationLocator {
  type: CitationLocatorType;
  value: string;
  side?: FolioSide | undefined;
  label?: string | undefined;
}

export interface CitationRequest {
  style: CitationStyleId;
  locators: CitationLocator[];
}

export interface CitationStyleDescriptor {
  id: CitationStyleId;
  label: string;
  processor: "citeproc-js";
  processorVersion: string;
  revision: string;
  source: string;
  sourceRevision: string;
  sha256: string;
  verifiedAt: string;
  compliance: "official" | "production_subset";
  supportsShortNote: boolean;
}

export interface CslName {
  literal?: string | undefined;
  family?: string | undefined;
  given?: string | undefined;
}

export interface CslDate {
  raw?: string | undefined;
  "date-parts"?: number[][] | undefined;
}

export interface NormalizedCslItem extends Record<string, unknown> {
  id: string;
  type: string;
  title: string;
  "title-short": string;
  author?: CslName[] | undefined;
  editor?: CslName[] | undefined;
  translator?: CslName[] | undefined;
  publisher?: string | undefined;
  "publisher-place"?: string | undefined;
  issued?: CslDate | undefined;
  edition?: string | undefined;
  volume?: string | undefined;
  issue?: string | undefined;
  page?: string | undefined;
  "container-title"?: string | undefined;
  "collection-title"?: string | undefined;
  language?: string | undefined;
  ISBN?: string | undefined;
  archive?: string | undefined;
  "archive_location"?: string | undefined;
  "original-title"?: string | undefined;
  note?: string | undefined;
  genre?: string | undefined;
}

export interface CitationResult {
  style: CitationStyleDescriptor;
  completeness: "structured" | "partial";
  materialClass: MaterialClass | null;
  locators: CitationLocator[];
  cslItem: NormalizedCslItem;
  outputs: {
    citation: string;
    fullNote: string | null;
    shortNote: string | null;
    bibliography: string;
  };
}

export class CitationError extends Error {
  constructor(readonly code: "invalid_input" | "unsupported_style" | "formatting_failed", options?: ErrorOptions) {
    super(code, options);
    this.name = "CitationError";
  }
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new CitationError("invalid_input");
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > maximum || CONTROL_CHARACTERS.test(normalized)) {
    throw new CitationError("invalid_input");
  }
  return normalized;
}

export function normalizeCitationRequest(value: unknown): CitationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CitationError("invalid_input");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "style" && key !== "locators")) throw new CitationError("invalid_input");
  if (typeof input.style !== "string" || !(CITATION_STYLES as readonly string[]).includes(input.style)) {
    throw new CitationError("unsupported_style");
  }
  if (!Array.isArray(input.locators) || input.locators.length > 12) throw new CitationError("invalid_input");
  const locators = input.locators.map((value): CitationLocator => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CitationError("invalid_input");
    const locator = value as Record<string, unknown>;
    if (Object.keys(locator).some((key) => !["type", "value", "side", "label"].includes(key))) {
      throw new CitationError("invalid_input");
    }
    if (typeof locator.type !== "string" || !(CITATION_LOCATOR_TYPES as readonly string[]).includes(locator.type)) {
      throw new CitationError("invalid_input");
    }
    const type = locator.type as CitationLocatorType;
    const side = locator.side === undefined ? undefined : locator.side;
    const label = locator.label === undefined ? undefined : requiredText(locator.label, 32);
    if (side !== undefined && (type !== "folio" || (side !== "recto" && side !== "verso"))) {
      throw new CitationError("invalid_input");
    }
    if ((type === "custom") !== (label !== undefined)) throw new CitationError("invalid_input");
    if (type !== "custom" && label !== undefined) throw new CitationError("invalid_input");
    return {
      type,
      value: requiredText(locator.value, 128),
      ...(side === undefined ? {} : { side: side as FolioSide }),
      ...(label === undefined ? {} : { label }),
    };
  });
  return { style: input.style as CitationStyleId, locators };
}
