import type { EvidenceOrigin, PdfEmbeddedMetadata, SuggestionFieldPath } from "./suggestion.js";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const REPLACEMENT_CHARACTER = /\uFFFD/u;
const PRIVATE_USE_CHARACTER = /\p{Co}/u;
const MOJIBAKE = /(?:ï¿½|â(?:€|€™|€œ|€¦|€“|€”|„|œ|ž)|Ã[\u0080-\u00ff]|Â[\u0080-\u00ff]|Ð[\u0080-\u00bf]|Ñ[\u0080-\u00bf])/u;
const BIBLIOGRAPHIC_STRUCTURE = /(?:^|[\r\n])\s*(?:title|book\s+title|author|editor|translator|publisher|isbn|题名|題名|书名|書名|作者|著者|撰者|编者|編者|主编|主編|译者|譯者|出版社|出版者|出版地|出版年|出版日期)\s*[:：]/iu;
const LABELLED_BIBLIOGRAPHIC_VALUE = /(?:^|[\r\n])\s*(?:title|book\s+title|author|editor|translator|publisher|题名|題名|书名|書名|作者|著者|撰者|编者|編者|主编|主編|译者|譯者|出版社|出版者|出版地)\s*[:：]\s*([^\r\n]+)/giu;

function compactCharacters(value: string): string[] {
  return [...value.normalize("NFC")].filter((character) => !/\s/u.test(character));
}

function repeatedTinyPattern(characters: readonly string[]): boolean {
  for (let width = 1; width <= 3; width += 1) {
    if (characters.length < width * 8 || characters.length % width !== 0) continue;
    const pattern = characters.slice(0, width);
    if (characters.every((character, index) => character === pattern[index % width])) return true;
  }
  return false;
}

function scriptFamily(character: string): string | null {
  if (!/\p{L}/u.test(character)) return null;
  // Japanese legitimately combines Han, Hiragana, and Katakana. Grouping
  // those scripts prevents a script-neutral corruption check from becoming a
  // Japanese-denial list. Every unlisted Unicode script remains admissible as
  // `other`; this classification is used only to detect fragmented mixing.
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) return "cjk-japanese";
  if (/\p{Script=Latin}/u.test(character)) return "latin";
  if (/\p{Script=Cyrillic}/u.test(character)) return "cyrillic";
  if (/\p{Script=Arabic}/u.test(character)) return "arabic";
  if (/\p{Script=Tibetan}/u.test(character)) return "tibetan";
  if (/\p{Script=Mongolian}/u.test(character)) return "mongolian";
  return "other";
}

function fragmentedMixedScript(value: string, letterCount: number, digitCount: number): boolean {
  const letterTokens = value.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
  const families = new Set([...value].map(scriptFamily).filter((family): family is string => family !== null));
  const shortTokens = letterTokens.filter((token) => [...token].filter((character) => /\p{L}/u.test(character)).length <= 2).length;
  const singletonTokens = letterTokens.filter((token) => [...token].filter((character) => /\p{L}/u.test(character)).length === 1).length;
  if (families.size >= 3 && letterCount < 24 && shortTokens / Math.max(1, letterTokens.length) >= 0.5) return true;
  if (families.size >= 2 && letterCount < 16 && letterTokens.length >= 4
    && shortTokens / letterTokens.length >= 0.75) return true;
  return letterCount < 16 && singletonTokens >= 2 && digitCount >= Math.ceil(letterCount / 2);
}

/**
 * Script-neutral corruption/usability gate for text offered as bibliographic
 * evidence. OCR confidence is deliberately absent: recognition confidence is
 * not bibliographic confidence.
 */
export function isUsableBibliographicEvidence(
  value: string,
  origin: Extract<EvidenceOrigin, "native_text" | "ocr" | "embedded_pdf_metadata">,
  options: { ocrConfidence?: number | null | undefined } = {},
): boolean {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || CONTROL_CHARACTERS.test(normalized) || REPLACEMENT_CHARACTER.test(normalized)
    || PRIVATE_USE_CHARACTER.test(normalized) || MOJIBAKE.test(normalized)) return false;
  const compact = compactCharacters(normalized);
  if (compact.length < 2 || repeatedTinyPattern(compact)) return false;
  const letters = compact.filter((character) => /\p{L}/u.test(character)).length;
  const numbers = compact.filter((character) => /\p{N}/u.test(character)).length;
  const marks = compact.filter((character) => /\p{M}/u.test(character)).length;
  const punctuationOrSymbols = compact.filter((character) => /[\p{P}\p{S}]/u.test(character)).length;
  const linguistic = letters + numbers + marks;
  if (letters < 2 || linguistic / compact.length < 0.3 || punctuationOrSymbols > linguistic * 2) return false;
  if (/([^\s])\1{5,}/u.test(normalized)) return false;
  if (fragmentedMixedScript(normalized, letters, numbers)) return false;
  if (origin === "ocr" && letters < 4 && !BIBLIOGRAPHIC_STRUCTURE.test(normalized)) return false;
  if (origin === "ocr" && (options.ocrConfidence ?? 0) < 85) {
    for (const match of normalized.matchAll(LABELLED_BIBLIOGRAPHIC_VALUE)) {
      const labelledLetters = [...(match[1] ?? "")].filter((character) => /\p{L}/u.test(character)).length;
      if (labelledLetters < 4) return false;
    }
  }
  return true;
}

export function isUsableCandidateValue(input: {
  value: string;
  origin: EvidenceOrigin;
  fieldPath: SuggestionFieldPath;
  explicit: boolean;
  ocrConfidence?: number | null | undefined;
  contextText?: string;
}): boolean {
  if (input.origin === "filename") return true;
  if (input.contextText !== undefined
    && !isUsableBibliographicEvidence(
      input.contextText,
      input.origin === "embedded_pdf_metadata" ? "embedded_pdf_metadata" : input.origin,
      { ocrConfidence: input.ocrConfidence },
    )) {
    return false;
  }
  if (!["canonicalTitle", "subtitle", "authority"].includes(input.fieldPath)) return true;
  const valueOrigin = input.origin === "ocr" && input.explicit ? "native_text" : input.origin;
  if (!isUsableBibliographicEvidence(input.value, valueOrigin)) return false;
  const letters = [...input.value.normalize("NFC")].filter((character) => /\p{L}/u.test(character)).length;
  if (input.origin === "ocr" && ["canonicalTitle", "authority"].includes(input.fieldPath) && letters < 4
    && (!input.explicit || (input.ocrConfidence ?? 0) < 85)) return false;
  return true;
}

function embeddedAuthorUsable(value: string, corroboratingText: string): boolean {
  if (!isUsableBibliographicEvidence(value, "embedded_pdf_metadata")) return false;
  const compact = value.replace(/[\s\p{P}\p{S}]+/gu, "");
  const corroborated = compact.length >= 2
    && corroboratingText.normalize("NFC").replace(/[\s\p{P}\p{S}]+/gu, "").includes(compact);
  // A bare two-to-four-character value can be a real personal name, but the
  // embedded Info field alone cannot distinguish it from corrupt producer
  // metadata. Keep it as raw provenance and require page corroboration before
  // exposing it as a normal author candidate.
  return corroborated || [...compact].length > 4 || /[\s;；|,，]/u.test(value);
}

/** Return a safe reasoning/candidate view without mutating raw PDF metadata. */
export function usableEmbeddedMetadata(
  metadata: Readonly<PdfEmbeddedMetadata>,
  corroboratingText = "",
): PdfEmbeddedMetadata {
  const result: PdfEmbeddedMetadata = {};
  if (metadata.title && isUsableBibliographicEvidence(metadata.title, "embedded_pdf_metadata")) result.title = metadata.title;
  if (metadata.author) {
    const authors = metadata.author.split(/\s*(?:;|；|\||\band\b|和)\s*/iu)
      .map((author) => author.trim())
      .filter((author) => author.length > 0 && embeddedAuthorUsable(author, corroboratingText));
    if (authors.length > 0) result.author = authors.join("; ");
  }
  if (metadata.subject && isUsableBibliographicEvidence(metadata.subject, "embedded_pdf_metadata")) result.subject = metadata.subject;
  if (metadata.keywords && isUsableBibliographicEvidence(metadata.keywords, "embedded_pdf_metadata")) result.keywords = metadata.keywords;
  return result;
}
