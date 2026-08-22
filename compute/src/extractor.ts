import {
  SUGGESTION_RULESET_VERSION,
  type EvidenceOrigin,
  type PageClass,
  type PdfEmbeddedMetadata,
  type PdfTextPage,
  type SuggestionCandidate,
  type SuggestionConfidence,
  type SuggestionFieldPath,
  type SuggestionSourceType,
  type SuggestionStatus,
  type AuthorityRole,
  type AuthorityType,
  type TypeFieldName,
} from "./suggestion.js";

export interface SuggestionExtractionInput {
  pages: readonly PdfTextPage[];
  embeddedMetadata: PdfEmbeddedMetadata;
  filename: string;
  mediaType?: string;
  /** Set by the PDF inspector. False means OCR is intentionally deferred. */
  hasUsableTextLayer?: boolean;
}

export interface SuggestionExtractionResult {
  status: SuggestionStatus;
  candidates: Omit<SuggestionCandidate, "id">[];
}

interface PageContext {
  page: PdfTextPage;
  pageClass: PageClass;
  sourceType: SuggestionSourceType | null;
  lines: string[];
}

interface CandidateSeed {
  fieldPath: SuggestionFieldPath;
  typeFieldName?: TypeFieldName | null;
  authorityType?: AuthorityType | null;
  authorityRole?: AuthorityRole | null;
  identifierScheme?: string | null;
  value: string;
  sourceType: SuggestionSourceType;
  sourcePageIndex: number | null;
  pageClass: PageClass | null;
  confidence: SuggestionConfidence;
  evidenceExcerpt: string | null;
  evidenceOrigin: EvidenceOrigin;
  ocrEngine: string | null;
  ocrConfidence: number | null;
}

const TITLEISH_RANK: Readonly<Record<SuggestionSourceType, number>> = {
  title_page: 10,
  cip_page: 20,
  colophon: 25,
  copyright_page: 30,
  series_page: 35,
  embedded_pdf_metadata: 45,
  filename: 60,
};

const BIBLIOGRAPHIC_RANK: Readonly<Record<SuggestionSourceType, number>> = {
  copyright_page: 10,
  cip_page: 12,
  colophon: 15,
  title_page: 25,
  series_page: 35,
  embedded_pdf_metadata: 45,
  filename: 60,
};

const PAGE_SOURCE: Readonly<Partial<Record<PageClass, SuggestionSourceType>>> = {
  title_page: "title_page",
  copyright_page: "copyright_page",
  cip_page: "cip_page",
  colophon: "colophon",
  series_page: "series_page",
  cover: "title_page",
};

const AUTHOR_MARKER_PATTERN = /^(?:by|author|作者|著者|著|编著|主编|编者)(?:\b|(?=[\s:：]|$))/iu;
const EDITOR_MARKER_PATTERN = /^(?:editor|edited\s+by|编者|主编|责任编辑)(?:\b|(?=[\s:：]|$))/iu;
const TRANSLATOR_MARKER_PATTERN = /^(?:translator|translated\s+by|译者|翻译)(?:\b|(?=[\s:：]|$))/iu;
const BARE_AUTHOR_MARKER_PATTERN = /^(?:by|author|作者|著者|著|编著|主编|编者)\s*[:：]?\s*$/iu;
const SUFFIX_AUTHOR_PATTERN = /^(.{2,120}?)\s+(著|著者|编著|主编|编者|译|译者|翻译)[.。；;，,]?$/u;
const TITLE_LABEL_PATTERN = /^(?:title|book\s+title|题名|书名)\s*[:：]\s*(.+)$/iu;
// These labels carry bibliographic facts but are never titles on their own.
// Keeping this list explicit prevents a sparse copyright/edition page from
// becoming a false title-page suggestion merely because it is in the first
// four pages of a book.
const NON_TITLE_LABEL_PATTERN = /^(?:印次|版次|版本|责任编辑|出版时间|出版日期|出版发行|出版地|出版地点|出版社|出版者|copyright|isbn|edition|volume|issue|number|publisher|published|imprint|by|author|作者|著者|著|编著|主编|编者|editor|translator|译者|翻译|contents|目录|preface|序言|版权页|图书在版编目(?:数据)?)\s*[:：]?/iu;

const CONTROL_OR_BREAKS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f]/g;
const ISBN_PATTERN = /\b(?:ISBN(?:-1[03])?\s*[:：#]?\s*)?((?:97[89][\s-]?)?\d[\d\s-]{8,16}[\dXx])\b/gi;
const YEAR_PATTERN = /(?:18|19|20)\d{2}/g;

function clean(value: string, max = 512): string {
  return value
    .normalize("NFC")
    .replace(CONTROL_OR_BREAKS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/^[\s\u3000:：;,，。·•|/\\]+|[\s\u3000:：;,，。·•|/\\]+$/g, "")
    .trim()
    .slice(0, max)
    .trim();
}

function matchingText(value: string): string {
  return value.normalize("NFC").replace(/[\s\u00a0]+/g, " ").trim().toLocaleLowerCase();
}

function excerpt(text: string, value: string): string {
  const bounded = clean(text, 512);
  if (!bounded) return "";
  const index = matchingText(bounded).indexOf(matchingText(value));
  if (index < 0) return bounded.slice(0, 240);
  const start = Math.max(0, index - 80);
  return bounded.slice(start, start + 320);
}

export function classifySuggestionPage(page: PdfTextPage): PageClass {
  const text = page.text.normalize("NFC");
  const lower = text.toLocaleLowerCase();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const cip = /图书在版编目\s*[（(]?\s*cip\s*[)）]?\s*数据|catalog(?:ing|uing)[- ]in[- ]publication/.test(lower);
  if (cip) return "cip_page";
  const colophon = lines.some((line) => /^\s*(?:出版发行|出版说明|印刷发行|printed\s+and\s+bound|colophon|printing\s+information)(?:\b|(?=\s|[:：]|$))/iu.test(line));
  const copyrightSignals = [
    /copyright|©|版权所有|版权信息/i,
    /all\s+rights\s+reserved|isbn|出版社|publisher|imprint/i,
    /版次|印次|first\s+published|published\s+by|出版时间/i,
  ].filter((pattern) => pattern.test(text)).length;
  const explicitCopyrightStatement = lines.some((line) =>
    /^\s*(?:copyright|版权所有|©)(?:\b|(?=\s|[:：]|$))[^\n]{0,180}(?:18|19|20)\d{2}[^\n]{0,96}(?:\bby\b|出版社|出版者|publisher)/iu.test(line));
  const structuredFrontMatter = lines.length <= 12 && words <= 120 && text.length <= 1_000;
  const explicitFrontMatterLabel = lines.some((line) => /^\s*(?:copyright|©|版权所有|版权页|isbn|出版社|出版者|出版发行|出版时间|版次|印次|first\s+published|published\s+by|publisher|imprint|all\s+rights\s+reserved)(?:\b|(?=\s|[:：]|$))/iu.test(line));
  if (/^\s*版权页\s*$/mu.test(text)) return "copyright_page";
  if (colophon && copyrightSignals >= 1 && structuredFrontMatter && explicitFrontMatterLabel) return "colophon";
  if (explicitCopyrightStatement && structuredFrontMatter) return "copyright_page";
  if (copyrightSignals >= 2 && structuredFrontMatter && explicitFrontMatterLabel) return "copyright_page";
  // Do not match the bare character `辑`: it is part of common labels such
  // as `责任编辑`, not a series cue.  Series evidence must be explicit.
  if (/(?:\bseries\b|丛书|文库|第\s*[一二三四五六七八九十\d]+\s*辑)/iu.test(text) && page.pageIndex <= 5) return "series_page";
  const titleSignals = lines.reduce((count, line) => count + ([
    TITLE_LABEL_PATTERN,
    AUTHOR_MARKER_PATTERN,
    EDITOR_MARKER_PATTERN,
    TRANSLATOR_MARKER_PATTERN,
  ].some((pattern) => pattern.test(line)) ? 1 : 0), 0);
  const sparseFrontMatter = lines.length >= 2 && lines.length <= 8 && words <= 40 && text.length <= 240;
  const sparseStrong = sparseFrontMatter && (
    lines.some((line) => AUTHOR_MARKER_PATTERN.test(line) || EDITOR_MARKER_PATTERN.test(line) || TRANSLATOR_MARKER_PATTERN.test(line))
    || lines.some((line) => SUFFIX_AUTHOR_PATTERN.test(line))
    // A common English title page has only the title and a bare
    // `Given Family`/`Family, Given` author line.  Keep this admission
    // limited to the first four sparse pages and the conservative person
    // shape below; ordinary prose and publisher labels do not qualify.
    || (lines.every((line) => !isNonTitleEvidenceLine(line)) && lines.some((line) => looksLikePerson(line)))
    || lines.some((line) => /(?:university\s+press|\bpress\b|publishing\b|出版社|出版发行|书局|印书馆)$/iu.test(line))
    || (lines.length >= 3 && !/[.!?。！？]$/.test(lines.at(-1) ?? ""))
  );
  const oneLineCover = page.pageIndex <= 2 && lines.length === 1 && text.length <= 180 && !/[.!?。！？]$/.test(text.trim()) && !isNonTitleEvidenceLine(text);
  if (page.pageIndex <= 4 && (titleSignals > 0 || sparseStrong || oneLineCover)) return "title_page";
  // Explicit bibliographic labels (题名/书名/Title/作者/Author/副题名/…)
  // are admissible anywhere in the exact selected window; unlabeled title-page
  // inference stays limited to the first four pages. This covers a labelled
  // title page that appears after page 4 or in the last-five window.
  if (titleSignals > 0 && (sparseFrontMatter || (lines.length === 1 && text.length <= 240))) return "title_page";
  if (words > 20 || text.length > 240) return "ordinary_body";
  return "unknown";
}

function pageContexts(pages: readonly PdfTextPage[]): PageContext[] {
  return pages
    .slice()
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((page) => {
      const pageClass = classifySuggestionPage(page);
      return {
        page,
        pageClass,
        sourceType: PAGE_SOURCE[pageClass] ?? null,
        lines: page.text
          .replace(/\r\n?/g, "\n")
          .split(/\n+/)
          .map((line) => clean(line, 512))
          .filter(Boolean),
      };
    });
}

const PERSON_AUTHORITY_ROLES: readonly string[] = [
  "author",
  "editor",
  "translator",
  "compiler",
  "scribe",
  "sender",
  "recipient",
  "creator",
  "contributor",
];

function sourceRank(
  fieldPath: SuggestionFieldPath,
  source: SuggestionSourceType,
  authorityRole: AuthorityRole | null = null,
): number {
  const titleAuthority = fieldPath === "authority" && PERSON_AUTHORITY_ROLES.includes(authorityRole ?? "");
  return fieldPath === "canonicalTitle" || fieldPath === "subtitle" || titleAuthority
    ? TITLEISH_RANK[source]
    : BIBLIOGRAPHIC_RANK[source];
}

function confidenceFor(
  source: SuggestionSourceType,
  explicit: boolean,
  page: PdfTextPage | undefined,
): SuggestionConfidence {
  let confidence: SuggestionConfidence;
  if (source === "filename") confidence = "low";
  else if (explicit || source === "cip_page" || source === "copyright_page") confidence = "high";
  else confidence = "medium";
  if (page?.evidenceOrigin !== "ocr") return confidence;
  if ((page.ocrConfidence ?? 0) < 75) return "low";
  return confidence === "high" ? "medium" : confidence;
}

function evidenceOrigin(context: PageContext | null, sourceType: SuggestionSourceType): EvidenceOrigin {
  if (context) return context.page.evidenceOrigin ?? "native_text";
  return sourceType === "embedded_pdf_metadata" ? "embedded_pdf_metadata" : "filename";
}

function originRank(origin: EvidenceOrigin): number {
  switch (origin) {
    case "native_text": return 0;
    case "ocr": return 1;
    case "embedded_pdf_metadata": return 2;
    case "filename": return 3;
  }
}

function labelValue(line: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match?.[1]) {
      const value = clean(match[1]);
      if (value) return value;
    }
  }
  return null;
}

function isGenericPlaceholder(value: string): boolean {
  const normalized = clean(value, 180).toLocaleLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:unknown|untitled|scanned?(?:\s+document)?|scan|document|file|acquisition|fallback|book|download(?:ed)?)(?:\s+\d+)?$/iu.test(normalized);
}

function isNonTitleEvidenceLine(value: string): boolean {
  const line = clean(value, 512);
  if (!line) return true;
  if (NON_TITLE_LABEL_PATTERN.test(line)) return true;
  if (/^(?:first\s+published|published\s+by|all\s+rights\s+reserved|copyright|isbn|edition|volume|issue|number|出版时间|出版日期|出版发行|出版地|出版地点|出版社|出版者|版次|印次|责任编辑)(?:\b|(?=\s|[:：]|$))/iu.test(line)) return true;
  if (/^(?:第\s*[一二三四五六七八九十\d]+\s*(?:版|次印刷|辑)|(?:18|19|20)\d{2}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?)$/u.test(line)) return true;
  if (/^.{2,160}(?:university\s+press|\bpress\b|publishing\b|出版社|出版发行|书局|印书馆)\s*[.,;:：，。；]*$/iu.test(line)) return true;
  if (/^(?:routledge|penguin|elsevier|springer|palgrave|brill|wiley|macmillan|cambridge|oxford)$/iu.test(line)) return true;
  return false;
}

function plausibleTitle(value: string): boolean {
  const candidate = clean(value, 512);
  if (candidate.length < 2 || candidate.length > 180) return false;
  if (/^(?:copyright|isbn|出版社|publisher|published|contents|目录|preface|序言|版权页|图书在版编目(?:数据)?|题名|书名|作者|著|page|第\s*\d+页)$/iu.test(candidate)) return false;
  if (/^\d+[\s./-]*$/.test(candidate)) return false;
  return /[\p{L}]/u.test(candidate) || /[\u3400-\u9fff]/u.test(candidate);
}

function firstTitleLine(context: PageContext): string | null {
  const hasMetadataLine = context.lines.some((line) => isNonTitleEvidenceLine(line));
  const bareAuthorMarkerIndex = context.lines.findIndex((line) => BARE_AUTHOR_MARKER_PATTERN.test(line));
  for (const [lineIndex, line] of context.lines.slice(0, 12).entries()) {
    const labeled = line.match(TITLE_LABEL_PATTERN)?.[1] ?? line;
    if (isNonTitleEvidenceLine(line)) continue;
    // A bare name can be the author line on a sparse title page, but when a
    // page also contains copyright/publisher/edition labels it is metadata
    // noise, never a canonical title.
    const markerFollowedPerson = bareAuthorMarkerIndex >= 0
      && lineIndex > bareAuthorMarkerIndex
      && (looksLikePerson(line) || /^[\u3400-\u9fff]{2,4}$/u.test(line));
    if ((hasMetadataLine && looksLikePerson(line)) || markerFollowedPerson) continue;
    if (!plausibleTitle(labeled)) continue;
    if (/isbn|copyright|出版社|出版发行|published\s+by|all\s+rights/i.test(labeled)) continue;
    if (AUTHOR_MARKER_PATTERN.test(line) || EDITOR_MARKER_PATTERN.test(line) || TRANSLATOR_MARKER_PATTERN.test(line)) continue;
    if (/^(?:the|this|these|a|an)\s+(?:collection|chapter|study|following|text|book|article)\b|^(?:本书|本文|本章|介绍|研究)/iu.test(labeled)) continue;
    // A title-page line ending in a sentence is usually a subtitle/body line;
    // preserving it is less safe than withholding a suggestion.
    if (/[。！？.!?]$/.test(line) && line.length > 80) continue;
    const inline = labeled.match(/^(.+?)\s+(?:by|作者|著者|著)\s+(.+)$/iu);
    return clean(inline?.[1] ?? labeled);
  }
  return null;
}

function looksLikePerson(value: string): boolean {
  const candidate = clean(value);
  if (!candidate || /[\d:：;；]/.test(candidate)) return false;
  if (/^[A-Z][A-Za-z'’.-]{1,40},\s*[A-Z][A-Za-z'’ .-]{1,80}$/.test(candidate)) return true;
  // A conservative English name shape; Chinese names are handled only when
  // introduced by an explicit author/著者 label to avoid guessing a publisher
  // or collection name as a person.
  return /^(?:[A-Z][A-Za-z'’.-]{1,30})(?:\s+[A-Z][A-Za-z'’.-]{1,30}){1,3}$/.test(candidate);
}

function normalizedIsbn(raw: string): string | null {
  const value = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^(?:97[89])?\d{9}[\dX]$/.test(value)) return null;
  if (value.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) sum += (value[i] === "X" ? 10 : Number(value[i])) * (10 - i);
    if (sum % 11 !== 0) return null;
  } else {
    let sum = 0;
    for (let i = 0; i < 13; i += 1) sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
    if (sum % 10 !== 0) return null;
  }
  return value;
}

function isbnValues(text: string): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(ISBN_PATTERN)) {
    const value = normalizedIsbn(match[1] ?? "");
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function yearsNear(text: string, keywords: RegExp): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(YEAR_PATTERN)) {
    const start = Math.max(0, (match.index ?? 0) - 80);
    const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 80);
    if (keywords.test(text.slice(start, end))) values.push(match[0]);
  }
  return [...new Set(values)];
}

interface FilenameFacts {
  title: string | null;
  author: string | null;
  publisher: string | null;
  dateStatement: string | null;
}

function cleanedFilenameStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  let value = base.replace(/\.(?:pdf|PDF)$/i, "");
  // Only a finite, documented set of acquisition suffixes is stripped. This
  // avoids turning arbitrary punctuation or meaningful edition labels into a
  // fabricated title.
  value = value
    .replace(/[\s._-]*[[(](?:anna['’]?s?[\s._-]*archive|z[\s._-]*library|libgen|genlib)[^\])}]*[\])][\s._-]*.*$/i, "")
    .replace(/[\s._-]+(?:anna['’]?s?[\s._-]*archive|z[\s._-]*library|libgen|genlib)(?:[\s._-]+[A-Za-z0-9_-]{4,})?$/i, "")
    .replace(/[\s._-]+(?:[0-9a-f]{16,}|(?=[A-Za-z0-9_-]{24,}$)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+)$/i, "")
    .replace(/[\s._-]+(?:isbn(?:-1[03])?[\s._-]*)?((?:97[89][\s-]?)?\d[\d\s-]{8,16}[\dXx])$/i, (whole, raw: string) => {
      return normalizedIsbn(raw ?? "") ? "" : whole;
    })
    .replace(/(?:[_ .-]+(?:scan(?:ned)?|ocr|copy|final|draft|acquired|downloaded))$/i, "")
    .replace(/(?:[_ .-]+v\d{1,2})$/i, "")
    .replace(/[+_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value;
}

function filenameFacts(filename: string): FilenameFacts {
  const stem = cleanedFilenameStem(filename);
  const structured = stem.match(/^(.{1,120}?)\s*[《<]\s*(.{2,180}?)\s*[》>]\s*[（(]\s*(.{2,180}?)\s*[）)]\s*$/u);
  if (structured) {
    const author = cleanPersonValue(structured[1] ?? "");
    const title = clean(structured[2] ?? "");
    const tail = clean(structured[3] ?? "");
    const date = tail.match(/(?:^|[^\d])((?:18|19|20)\d{2}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?)(?:$|[^\d])/u)?.[1] ?? null;
    const publisher = clean(tail.replace(date ?? "", "").replace(/[，,;；:：]+$/u, ""));
    return {
      title: plausibleTitle(title) && !isGenericPlaceholder(title) ? title : null,
      author: plausibleTitle(author) && !isGenericPlaceholder(author) ? author : null,
      publisher: plausibleTitle(publisher) && !isGenericPlaceholder(publisher) ? publisher : null,
      dateStatement: date,
    };
  }
  const title = plausibleTitle(stem) && !isGenericPlaceholder(stem)
    && !/^(?:img|dsc|scan|document|file)[ _-]?\d{2,}$/i.test(stem)
    && !/^[0-9a-f]{16,}$/i.test(stem)
    ? stem
    : null;
  return { title, author: null, publisher: null, dateStatement: null };
}

function cleanPersonValue(value: string): string {
  const cleaned = clean(value)
    .replace(/[.。]+$/u, "")
    .replace(/\s*(?:著者|著|编著|主编|编者|译者|翻译|,?\s*author|,?\s*editor|,?\s*translator)\s*[.;。；，,]*$/iu, "")
    .trim();
  const commaName = cleaned.match(/^([^,，]{1,64})[,，]\s*(.{1,96})$/u);
  return commaName ? clean(`${commaName[2]} ${commaName[1]}`) : cleaned;
}

function cleanPublisherValue(value: string): string {
  return clean(value)
    .replace(/^\s*(?:by|由)\s+/iu, "")
    .replace(/\s*(?:all\s+rights\s+reserved|isbn\b|第一版|第\s*[一二三四五六七八九十\d]+\s*版).*$/iu, "")
    .replace(/[.;,，。；：:]+$/u, "")
    .trim();
}

function stripCipPersonHeading(value: string): string {
  const candidate = clean(value);
  const chinese = candidate.match(/^[\u3400-\u9fff]{2,8}[.。]\s*(.+)$/u)?.[1];
  if (chinese && plausibleTitle(chinese)) return clean(chinese);
  const latin = candidate.match(/^[A-Z][A-Za-z'’.-]{1,40},\s*[A-Z][A-Za-z'’ .-]{1,80}\.\s+(.+)$/u)?.[1];
  if (latin && plausibleTitle(latin)) return clean(latin);
  return candidate;
}

function addPublicationStatement(
  context: PageContext,
  seeds: CandidateSeed[],
  line: string,
): void {
  const normalized = clean(line);
  if (!normalized || /\d{4}\s*[-–—]\s*\d{4}/u.test(normalized)) return;
  const publicationText = normalized.match(/[—–]\s*(.+)$/u)?.[1] ?? normalized;
  // English and Chinese CIP/colophon forms such as
  // `New York : Routledge, 2018` and `北京：中华书局，2008.12`.
  const match = publicationText.match(/^([^,;:：]{2,96})\s*[:：]\s*(.+?)\s*[,，]\s*((?:18|19|20)\d{2}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?)\s*[.;。；]*$/u);
  if (!match) return;
  const place = clean(match[1] ?? "");
  const publisher = cleanPublisherValue(match[2] ?? "");
  const date = clean(match[3] ?? "");
  if (plausibleTitle(place) && place.length <= 96) {
    addSeed(seeds, context, {
      fieldPath: "authority",
      authorityType: "place",
      authorityRole: "publication_place",
      value: place,
      explicit: true,
    });
  }
  if (plausibleTitle(publisher) && publisher.length <= 128) {
    addSeed(seeds, context, {
      fieldPath: "authority",
      authorityType: "institution",
      authorityRole: "publisher",
      value: publisher,
      explicit: true,
    });
  }
  if (/^(?:18|19|20)\d{2}/u.test(date)) {
    addSeed(seeds, context, { fieldPath: "dateStatement", value: date, explicit: true });
  }
}

function parseCipPage(context: PageContext, seeds: CandidateSeed[]): void {
  if (context.pageClass !== "cip_page") return;
  const { lines } = context;
  let personLineIndex = -1;
  for (const [index, line] of lines.entries()) {
    const names = line.match(/^(?:names?|contributors?)\s*[:：]\s*(.+)$/iu)?.[1];
    if (names) {
      const person = cleanPersonValue(names);
      if (plausibleTitle(person)) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "person",
          authorityRole: /translator|译/iu.test(names) ? "translator" : "author",
          value: person,
          explicit: true,
        });
        personLineIndex = index;
      }
    }

    // Structured CIP records commonly put identity and publication facts on
    // one line: `Title / Author. — Place : Publisher, Year`.
    const slash = line.match(/^(.{2,180}?)\s*\/\s*(.{2,180}?)(?:\s*[.;。；]|\s*[—–-]\s*|$)(.*)$/u);
    if (slash) {
      const title = stripCipPersonHeading(slash[1] ?? "");
      const author = cleanPersonValue(slash[2] ?? "");
      if (plausibleTitle(title)) {
        addSeed(seeds, context, { fieldPath: "canonicalTitle", value: title, explicit: true });
      }
      if (plausibleTitle(author)) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "person",
          authorityRole: /译|translat/iu.test(slash[2] ?? "") ? "translator" : "author",
          value: author,
          explicit: true,
        });
      }
      const tail = [slash[2], slash[3]].filter(Boolean).join(" ");
      const dash = tail.match(/[—–-]\s*(.+)$/u)?.[1];
      if (dash) addPublicationStatement(context, seeds, dash);
    }

    const person = line.match(/^[A-Z][A-Za-z'’.-]{1,40},\s*[A-Z][A-Za-z'’ .-]{1,80}\.?$/u);
    if (person && !/^isbn\b/iu.test(line)) {
      const value = cleanPersonValue(person[0]!);
      if (plausibleTitle(value)) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "person",
          authorityRole: "author",
          value,
          explicit: true,
        });
        personLineIndex = index;
      }
    }

    const publicationTail = line.match(/[—–]\s*(.+)$/u)?.[1];
    if (publicationTail) addPublicationStatement(context, seeds, publicationTail);
    addPublicationStatement(context, seeds, line);
  }

  // In Library-of-Congress style text, the cataloguer often places the
  // person heading immediately before the unlabelled title line.
  if (personLineIndex >= 0) {
    const titleLine = lines.slice(personLineIndex + 1).find((line) => {
      if (/^(?:isbn|names?|contributors?|identifiers?|description|subjects?|classification|includes?)\b/iu.test(line)) return false;
      return plausibleTitle(line)
        && !/[\/]/u.test(line)
        && !/^[^:：]{2,96}\s*[:：].*(?:,|，)\s*(?:18|19|20)\d{2}\b/iu.test(line)
        && !/^[^:：]{2,96}\s*[:：].*(?:press|publisher|publishing|出版社|出版|书局|印书馆)\b/iu.test(line)
        && !/^(?:copyright|publisher|published|出版|出版社|图书在版编目)/iu.test(line);
    });
    if (titleLine) addSeed(seeds, context, { fieldPath: "canonicalTitle", value: titleLine, explicit: true });
  }
}

type SeedInput = Pick<CandidateSeed, "fieldPath" | "value"> & Partial<Pick<CandidateSeed, "typeFieldName" | "authorityType" | "authorityRole" | "identifierScheme">> & {
  sourceType?: SuggestionSourceType;
  explicit?: boolean;
};

function addSeed(seeds: CandidateSeed[], context: PageContext | null, seed: SeedInput): void {
  const value = clean(seed.value);
  if (!value) return;
  const sourceType = seed.sourceType ?? context?.sourceType;
  if (!sourceType) return;
  if (context?.pageClass === "ordinary_body") return;
  const pageText = context?.page.text ?? value;
  const candidate: CandidateSeed = {
    fieldPath: seed.fieldPath,
    typeFieldName: seed.typeFieldName ?? null,
    authorityType: seed.authorityType ?? null,
    authorityRole: seed.authorityRole ?? null,
    identifierScheme: seed.identifierScheme ?? null,
    value,
    sourceType,
    sourcePageIndex: context?.page.pageIndex ?? null,
    pageClass: context?.pageClass ?? null,
    confidence: confidenceFor(sourceType, seed.explicit ?? false, context?.page),
    evidenceExcerpt: excerpt(pageText, value),
    evidenceOrigin: evidenceOrigin(context, sourceType),
    ocrEngine: context?.page.evidenceOrigin === "ocr" ? context.page.ocrEngine ?? null : null,
    ocrConfidence: context?.page.evidenceOrigin === "ocr" ? context.page.ocrConfidence ?? null : null,
  };
  seeds.push(candidate);
}

function parsePage(context: PageContext, seeds: CandidateSeed[]): void {
  if (!context.sourceType || context.pageClass === "ordinary_body") return;
  const { lines, page } = context;
  const text = page.text;
  const titlePatterns = [/^(?:title|book\s+title|题名|书名)\s*[:：]\s*(.+)$/i];
  const subtitlePatterns = [/^(?:subtitle|副题名|副标题)\s*[:：]\s*(.+)$/i];
  const authorPatterns = [
    /^(?:author|作者|著者|著|编著|主编|编者)\s*[:：]\s*(.+)$/iu,
    /^(?:author|作者|著者|著|编著|主编|编者)\s+(.+)$/iu,
    /^by\s*[:：]\s*(.+)$/iu,
    /^by\s+(.+)$/iu,
  ];
  const editorPatterns = [/^(?:editor|edited\s+by|编者|主编|责任编辑)(?:\b|(?=[\s:：]|$))\s*[:：]?\s*(.+)$/iu];
  const translatorPatterns = [/^(?:translator|translated\s+by|译者|翻译)(?:\b|(?=[\s:：]|$))\s*[:：]?\s*(.+)$/iu];
  const publisherPatterns = [/^(?:publisher|published\s+by|imprint|出版社|出版者|出版发行)\s*[:：]?\s*(.+)$/i];
  const placePatterns = [/^(?:place\s+of\s+publication|publication\s+place|出版地|出版地点)\s*[:：]?\s*(.+)$/i];
  const datePatterns = [/^(?:date|year|publication\s+date|出版时间|出版日期|年份)\s*[:：]?\s*((?:18|19|20)\d{2}(?:[-/.]\d{1,2})?(?:[-/.]\d{1,2})?)$/i];
  const editionPatterns = [/^(?:edition|edition\s+statement|版次|版本|印次)\s*[:：]?\s*(.+)$/iu];

  for (const line of lines) {
    const title = labelValue(line, titlePatterns);
    if (title && plausibleTitle(title)) addSeed(seeds, context, { fieldPath: "canonicalTitle", value: title, explicit: true });
    const subtitle = labelValue(line, subtitlePatterns);
    if (subtitle && plausibleTitle(subtitle)) addSeed(seeds, context, { fieldPath: "subtitle", value: subtitle, explicit: true });
    const author = labelValue(line, authorPatterns);
    if (author) addSeed(seeds, context, { fieldPath: "authority", authorityType: "person", authorityRole: "author", value: author, explicit: true });
    const editor = labelValue(line, editorPatterns);
    if (editor) addSeed(seeds, context, { fieldPath: "authority", authorityType: "person", authorityRole: "editor", value: editor, explicit: true });
    const translator = labelValue(line, translatorPatterns);
    if (translator) addSeed(seeds, context, { fieldPath: "authority", authorityType: "person", authorityRole: "translator", value: translator, explicit: true });
    const suffixAuthor = line.match(SUFFIX_AUTHOR_PATTERN);
    if (suffixAuthor?.[1] && plausibleTitle(suffixAuthor[1])) {
      addSeed(seeds, context, {
        fieldPath: "authority",
        authorityType: "person",
        authorityRole: /译|翻译/u.test(suffixAuthor[2] ?? "") ? "translator" : "author",
        value: suffixAuthor[1],
        explicit: true,
      });
    }
    const publisher = labelValue(line, publisherPatterns);
    if (publisher) {
      // Chinese publication statements are often written as
      // `出版发行：北京：中华书局`.  Split the place and imprint rather than
      // treating the whole statement as an institution label.
      const splitPublication = publisher.match(/^([^:：]{2,64})\s*[:：]\s*(.+)$/u);
      if (splitPublication && plausibleTitle(splitPublication[1] ?? "")) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "place",
          authorityRole: "publication_place",
          value: splitPublication[1]!,
          explicit: true,
        });
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "institution",
          authorityRole: "publisher",
          value: cleanPublisherValue(splitPublication[2] ?? ""),
          explicit: true,
        });
      } else {
        addSeed(seeds, context, { fieldPath: "authority", authorityType: "institution", authorityRole: "publisher", value: publisher, explicit: true });
      }
    }
    const place = labelValue(line, placePatterns);
    if (place) addSeed(seeds, context, { fieldPath: "authority", authorityType: "place", authorityRole: "publication_place", value: place, explicit: true });
    const date = labelValue(line, datePatterns);
    if (date) addSeed(seeds, context, { fieldPath: "dateStatement", value: date, explicit: true });
    const edition = labelValue(line, editionPatterns);
    if (edition) addSeed(seeds, context, { fieldPath: "typeField", typeFieldName: "editionStatement", value: edition, explicit: true });
    const volume = labelValue(line, [/^(?:volume|卷)\s*[:：#]?\s*(.+)$/i]);
    if (volume) addSeed(seeds, context, { fieldPath: "typeField", typeFieldName: "volumeStatement", value: volume, explicit: true });
    const issue = labelValue(line, [/^(?:issue|number|期)\s*[:：#]?\s*(.+)$/i]);
    if (issue) addSeed(seeds, context, { fieldPath: "typeField", typeFieldName: "issueStatement", value: issue, explicit: true });
  }

  if (context.pageClass === "title_page" || context.pageClass === "cover") {
    const title = firstTitleLine(context);
    if (title) {
      const split = title.split(/\s*[:：]\s*/, 2);
      addSeed(seeds, context, { fieldPath: "canonicalTitle", value: split[0] ?? title });
      if (split[1] && plausibleTitle(split[1])) addSeed(seeds, context, { fieldPath: "subtitle", value: split[1] });
    }
    const byIndex = lines.findIndex((line) => AUTHOR_MARKER_PATTERN.test(line));
    const byLine = byIndex >= 0 ? lines[byIndex] : null;
    if (byLine) {
      const author = clean(byLine.replace(/^(?:by|author|作者|著者|著|编著|主编|编者)\s*[:：]?\s*/iu, ""))
        || clean(lines[byIndex + 1] ?? "");
      if (author && plausibleTitle(author)) addSeed(seeds, context, { fieldPath: "authority", authorityType: "person", authorityRole: "author", value: author });
    }
    if (!byLine) {
      const inlineAuthor = lines
        .map((line) => line.match(/^.+?\s+(?:by|作者|著者|著)\s+(.+)$/i)?.[1] ?? null)
        .find((value): value is string => Boolean(value && plausibleTitle(value)));
      if (inlineAuthor) addSeed(seeds, context, { fieldPath: "authority", authorityType: "person", authorityRole: "author", value: inlineAuthor });
    }
    if (!byLine && title) {
      const titleIndex = lines.indexOf(title);
      const following = lines.slice(titleIndex + 1, titleIndex + 4);
      const inferredAuthor = following.find((line) => looksLikePerson(line));
      if (inferredAuthor) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "person",
          authorityRole: "author",
          value: cleanPersonValue(inferredAuthor),
        });
      }
    }
  }

  for (const isbn of isbnValues(text)) {
    addSeed(seeds, context, { fieldPath: "identifier", identifierScheme: "isbn", value: isbn });
  }

  for (const year of yearsNear(text, /出版|published|copyright|edition|版次|first\s+published/i)) {
    addSeed(seeds, context, { fieldPath: "dateStatement", value: year });
  }

  // Conservative unlabeled bibliographic forms. These are only admitted on
  // front/back matter classes, never ordinary body pages.
  if (context.pageClass === "copyright_page" || context.pageClass === "cip_page" || context.pageClass === "colophon") {
    for (const line of lines) {
      const publisher = line.match(/(?:出版社|出版者|出版发行)\s*[:：]?\s*([^，,；;。]+)/i)?.[1]
        ?? line.match(/(?:published\s+by|publisher|imprint)\s*[:：]?\s*([^,.;]+)/i)?.[1];
      if (publisher) {
        const splitPublication = publisher.match(/^([^:：]{2,64})\s*[:：]\s*(.+)$/u);
        if (splitPublication && plausibleTitle(splitPublication[1] ?? "")) {
          addSeed(seeds, context, {
            fieldPath: "authority",
            authorityType: "place",
            authorityRole: "publication_place",
            value: splitPublication[1]!,
            explicit: true,
          });
          addSeed(seeds, context, {
            fieldPath: "authority",
            authorityType: "institution",
            authorityRole: "publisher",
            value: cleanPublisherValue(splitPublication[2] ?? ""),
            explicit: true,
          });
        } else {
          addSeed(seeds, context, {
            fieldPath: "authority",
            authorityType: "institution",
            authorityRole: "publisher",
            value: cleanPublisherValue(publisher),
          });
        }
      }
      const copyrightPublisher = line.match(/(?:copyright|©|版权所有)[^\n]{0,80}?(?:19|20)\d{2}\s+([^,.;，。；;]+)/i)?.[1];
      if (copyrightPublisher) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "institution",
          authorityRole: "publisher",
          value: cleanPublisherValue(copyrightPublisher),
        });
      }
      // A publication label such as `出版发行：北京：…出版社` is not a place;
      // only a leading non-label segment followed by a colon is treated as one.
      const labelledPublication = /^(?:出版发行|出版者|出版社|出版|published(?:\s+by)?|publisher|imprint)\s*[:：]/iu.test(line);
      const place = !line.includes("/") && !labelledPublication
        ? line.match(/^([^，,：:]{1,64})\s*[:：]\s*[^，,。；;]*(?:出版社|出版|published)/i)?.[1]
        : undefined;
      if (place) addSeed(seeds, context, { fieldPath: "authority", authorityType: "place", authorityRole: "publication_place", value: place });
      const edition = line.match(/(?:第\s*[一二三四五六七八九十\d]+\s*版|\b(?:first|second|third|\d+(?:st|nd|rd|th))\s+edition\b)/i)?.[0];
      if (edition) addSeed(seeds, context, { fieldPath: "typeField", typeFieldName: "editionStatement", value: edition });
    }
  }

  parseCipPage(context, seeds);

  // Older title pages often carry a compact publication statement rather than
  // a modern copyright page.  Admit only explicit, conservative shapes: a
  // labelled publisher/place, a recognizable publishing imprint suffix, or a
  // place followed by a single four-digit year.  A title containing a date
  // range (for example, 1221–1410) is never treated as a publication year.
  if (context.pageClass === "title_page" || context.pageClass === "cover") {
    for (const line of lines) {
      if (/\d{4}\s*[-–—]\s*\d{4}/u.test(line)) continue;
      const publication = line.match(/^([^,;:：]{2,96})\s*[,;:：]\s*(.+)$/u);
      if (publication && /(?:press|publisher|publishing|出版|出版社|出版发行|印书馆|书局|imprint)/iu.test(publication[2] ?? "")) {
        const place = clean(publication[1] ?? "");
        const publisher = clean((publication[2] ?? "").replace(/(?:,|，)?\s*(?:19|20)\d{2}\b.*$/u, ""));
        if (plausibleTitle(place) && place.length <= 96) {
          addSeed(seeds, context, {
            fieldPath: "authority",
            authorityType: "place",
            authorityRole: "publication_place",
            value: place,
          });
        }
        if (plausibleTitle(publisher) && publisher.length <= 128) {
          addSeed(seeds, context, {
            fieldPath: "authority",
            authorityType: "institution",
            authorityRole: "publisher",
            value: publisher,
          });
        }
      }
      const placeYear = line.match(/^([^,;:：\d]{2,64})\s+((?:18|19|20)\d{2})\s*$/u);
      if (placeYear && plausibleTitle(placeYear[1] ?? "")) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "place",
          authorityRole: "publication_place",
          value: placeYear[1]!,
        });
        addSeed(seeds, context, { fieldPath: "dateStatement", value: placeYear[2]! });
      }
      const imprint = line.match(/^(.{2,128}(?:university\s+press|\bpress\b|publishing\b|出版社|出版发行|书局|印书馆))\s*[,，;；:]?\s*$/iu);
      if (imprint && plausibleTitle(imprint[1] ?? "")) {
        addSeed(seeds, context, {
          fieldPath: "authority",
          authorityType: "institution",
          authorityRole: "publisher",
          value: imprint[1]!,
        });
      }
    }
  }
}

function embeddedCandidates(metadata: PdfEmbeddedMetadata, seeds: CandidateSeed[]): void {
  if (metadata.title && plausibleTitle(metadata.title) && !isGenericPlaceholder(metadata.title)) {
    addSeed(seeds, null, { fieldPath: "canonicalTitle", value: metadata.title, sourceType: "embedded_pdf_metadata" });
  }
  if (metadata.author && clean(metadata.author) && !isGenericPlaceholder(metadata.author)) {
    // Map explicitly: passing `clean` straight to `map` would bind the array
    // index to its `max` argument and truncate authors.
    const authors = metadata.author.split(/\s*(?:;|；|\||\band\b|和)\s*/iu).map((author) => clean(author)).filter(Boolean).slice(0, 8);
    for (const author of authors) {
      addSeed(seeds, null, {
        fieldPath: "authority",
        authorityType: "person",
        authorityRole: "author",
        value: author,
        sourceType: "embedded_pdf_metadata",
      });
    }
  }
}

function dedupeAndRank(seeds: CandidateSeed[]): Omit<SuggestionCandidate, "id">[] {
  const map = new Map<string, CandidateSeed>();
  for (const seed of seeds) {
    const key = [seed.fieldPath, seed.typeFieldName ?? "", seed.authorityType ?? "", seed.authorityRole ?? "", seed.identifierScheme ?? "", matchingText(seed.value)].join("|");
    const previous = map.get(key);
    const rank = sourceRank(seed.fieldPath, seed.sourceType, seed.authorityRole);
    const previousRank = previous
      ? sourceRank(previous.fieldPath, previous.sourceType, previous.authorityRole)
      : Number.MAX_SAFE_INTEGER;
    if (!previous || rank < previousRank || (rank === previousRank && originRank(seed.evidenceOrigin) < originRank(previous.evidenceOrigin))) {
      map.set(key, seed);
    }
  }
  const values = [...map.values()].sort((a, b) => {
    const rankDifference = sourceRank(a.fieldPath, a.sourceType, a.authorityRole) - sourceRank(b.fieldPath, b.sourceType, b.authorityRole);
    if (rankDifference !== 0) return rankDifference;
    const pageDifference = (a.sourcePageIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourcePageIndex ?? Number.MAX_SAFE_INTEGER);
    if (pageDifference !== 0) return pageDifference;
    const originDifference = originRank(a.evidenceOrigin) - originRank(b.evidenceOrigin);
    if (originDifference !== 0) return originDifference;
    return matchingText(a.value).localeCompare(matchingText(b.value));
  });
  return values.map((seed, position) => ({
    fieldPath: seed.fieldPath,
    typeFieldName: seed.typeFieldName ?? null,
    authorityType: seed.authorityType ?? null,
    authorityRole: seed.authorityRole ?? null,
    identifierScheme: seed.identifierScheme ?? null,
    value: seed.value,
    sourceType: seed.sourceType,
    sourcePageIndex: seed.sourcePageIndex,
    pageClass: seed.pageClass,
    confidence: seed.confidence,
    precedenceRank: sourceRank(seed.fieldPath, seed.sourceType, seed.authorityRole),
    evidenceExcerpt: seed.evidenceExcerpt,
    evidenceOrigin: seed.evidenceOrigin,
    ocrEngine: seed.ocrEngine,
    ocrConfidence: seed.ocrConfidence,
    rulesetVersion: SUGGESTION_RULESET_VERSION,
    position,
  }));
}

function hasTopRankConflict(candidates: readonly Omit<SuggestionCandidate, "id">[]): boolean {
  const groups = new Map<string, Omit<SuggestionCandidate, "id">[]>();
  for (const candidate of candidates) {
    // Multiple person authorities (co-authors, editors, translators) are
    // complementary proposals, never conflicting evidence for one fact.
    if (candidate.fieldPath === "authority" && PERSON_AUTHORITY_ROLES.includes(candidate.authorityRole ?? "")) continue;
    const key = [candidate.fieldPath, candidate.typeFieldName ?? "", candidate.authorityType ?? "", candidate.authorityRole ?? "", candidate.identifierScheme ?? ""].join("|");
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const minimum = Math.min(...group.map((candidate) => candidate.precedenceRank));
    const topValues = new Set(group.filter((candidate) => candidate.precedenceRank === minimum).map((candidate) => matchingText(candidate.value)));
    if (topValues.size > 1) return true;
  }
  return false;
}

/**
 * Extract only supported RF-META01 fields from already-inspected page text.
 * This function is pure and deterministic: same pages/metadata/filename yield
 * byte-for-byte equivalent candidate ordering and evidence.
 */
export function extractSuggestions(input: SuggestionExtractionInput): SuggestionExtractionResult {
  const nativeTextUsable = input.hasUsableTextLayer ?? input.pages.some((page) => {
    const compact = page.text.replace(/\s+/gu, "");
    return compact.length >= 2 && /[\p{L}]/u.test(compact) && !/^\d+$/u.test(compact);
  });
  const ocrRan = input.pages.some((page) => page.evidenceOrigin === "ocr");
  const hasText = nativeTextUsable || ocrRan;
  const seeds: CandidateSeed[] = [];
  const contexts = pageContexts(input.pages);
  for (const context of contexts) parsePage(context, seeds);
  embeddedCandidates(input.embeddedMetadata, seeds);
  const filename = filenameFacts(input.filename);
  if (filename.title && !seeds.some((seed) => seed.fieldPath === "canonicalTitle")) {
    addSeed(seeds, null, { fieldPath: "canonicalTitle", value: filename.title, sourceType: "filename" });
  }
  if (filename.author) addSeed(seeds, null, { fieldPath: "authority", authorityType: "person", authorityRole: "author", value: filename.author, sourceType: "filename" });
  if (filename.publisher) addSeed(seeds, null, { fieldPath: "authority", authorityType: "institution", authorityRole: "publisher", value: filename.publisher, sourceType: "filename" });
  if (filename.dateStatement) addSeed(seeds, null, { fieldPath: "dateStatement", value: filename.dateStatement, sourceType: "filename" });
  const candidates = dedupeAndRank(seeds);
  if (candidates.length === 0) return { status: hasText ? "no_suggestions" : "ocr_deferred", candidates: [] };
  return { status: hasTopRankConflict(candidates) ? "ambiguous" : "ready", candidates };
}

export const extractBibliographicSuggestions = extractSuggestions;
