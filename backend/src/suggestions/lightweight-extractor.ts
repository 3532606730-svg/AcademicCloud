import { SUGGESTION_RULESET_VERSION, type SuggestionCandidate, type SuggestionStatus } from "./suggestion.js";

type Candidate = Omit<SuggestionCandidate, "id">;

const PERSON_AUTHORITY_ROLES = new Set(["author", "editor", "translator", "compiler", "scribe", "sender", "recipient", "creator", "contributor"]);

function clean(value: string, maximum = 512): string {
  return value.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/[ \u00a0]+/gu, " ")
    .replace(/^[\s\u3000:：;,，。·•|/\\]+|[\s\u3000:：;,，。·•|/\\]+$/gu, "")
    .trim().slice(0, maximum).trim();
}

function normalizedIsbn(raw: string): string | null {
  const value = raw.replace(/[\s-]/gu, "").toUpperCase();
  if (!/^(?:97[89])?\d{9}[\dX]$/u.test(value)) return null;
  if (value.length === 10) {
    let sum = 0;
    for (let index = 0; index < 10; index += 1) sum += (value[index] === "X" ? 10 : Number(value[index])) * (10 - index);
    if (sum % 11 !== 0) return null;
  } else {
    let sum = 0;
    for (let index = 0; index < 13; index += 1) sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
    if (sum % 10 !== 0) return null;
  }
  return value;
}

function plausible(value: string): boolean {
  const candidate = clean(value);
  if (candidate.length < 2 || candidate.length > 180 || /^\d+[\s./-]*$/u.test(candidate)) return false;
  if (/^(?:unknown|untitled|scanned?(?:\s+document)?|scan|document|file|book|download(?:ed)?)(?:\s+\d+)?$/iu.test(candidate)) return false;
  // Generic capture/device/sequence junk: scan123, IMG_20260821, DSC_0001,
  // document001, file12345, page7, screenshot_2024. These must never become a
  // fabricated canonical title.
  if (/^(?:scan|img|dsc|doc(?:ument)?|file|photo|pic(?:ture)?|image|screenshot|screen[_-]?shot|page|attachment|untitled|unknown|p\d+)\s*[\s._-]*\d*$/iu.test(candidate)) return false;
  return /[\p{L}]/u.test(candidate);
}

function stem(filename: string): string {
  const base = filename.split(/[\\/]/u).pop() ?? filename;
  return base.replace(/\.pdf$/iu, "")
    .replace(/[\s._-]*[[(](?:anna['’]?s?[\s._-]*archive|z[\s._-]*library|libgen|genlib)[^\])}]*[\])][\s._-]*.*$/iu, "")
    .replace(/[\s._-]+(?:anna['’]?s?[\s._-]*archive|z[\s._-]*library|libgen|genlib)(?:[\s._-]+[A-Za-z0-9_-]{4,})?$/iu, "")
    .replace(/[\s._-]+(?:[0-9a-f]{16,}|(?=[A-Za-z0-9_-]{24,}$)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+)$/iu, "")
    .replace(/[\s._-]+(?:isbn(?:-1[03])?[\s._-]*)?((?:97[89][\s-]?)?\d[\d\s-]{8,16}[\dXx])$/iu, (whole, raw: string) => normalizedIsbn(raw) ? "" : whole)
    .replace(/[_ .-]+(?:scan(?:ned)?|ocr|copy|final|draft|acquired|downloaded)$/iu, "")
    .replace(/[_ .-]+v\d{1,2}$/iu, "")
    .replace(/[+_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function candidate(
  position: number,
  fieldPath: Candidate["fieldPath"],
  value: string,
  extra: Partial<Candidate> = {},
): Candidate {
  return {
    position,
    fieldPath,
    typeFieldName: null,
    authorityType: null,
    authorityRole: null,
    identifierScheme: null,
    value,
    sourceType: "filename",
    sourcePageIndex: null,
    pageClass: null,
    confidence: "low",
    precedenceRank: 60,
    evidenceExcerpt: value,
    evidenceOrigin: "filename",
    ocrEngine: null,
    ocrConfidence: null,
    rulesetVersion: SUGGESTION_RULESET_VERSION,
    ...extra,
  };
}

export function extractLightweightSuggestions(filename: string): Candidate[] {
  const value = stem(filename);
  const structured = value.match(/^(.{1,120}?)\s*[《<]\s*(.{2,180}?)\s*[》>]\s*[（(]\s*(.{2,180}?)\s*[）)]\s*$/u);
  if (!structured) return plausible(value) ? [candidate(0, "canonicalTitle", clean(value))] : [];
  const results: Candidate[] = [];
  const author = clean(structured[1] ?? "").replace(/\s*(?:著者|著|编著|主编|编者|译者|翻译|,?\s*author|,?\s*editor|,?\s*translator)\s*[.;。；，,]*$/iu, "");
  const title = clean(structured[2] ?? "");
  const tail = clean(structured[3] ?? "");
  const date = tail.match(/(?:^|[^\d])((?:18|19|20)\d{2}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?)(?:$|[^\d])/u)?.[1] ?? null;
  const publisher = clean(tail.replace(date ?? "", "").replace(/[，,;；:：]+$/u, ""));
  if (plausible(title)) {
    // A deliberate 《题名》（出版项）structure is stronger evidence than a bare
    // filename stem: it is the reliable signal the batch-naming workflow uses.
    results.push(candidate(results.length, "canonicalTitle", title, { confidence: "medium" }));
  }
  if (plausible(author)) results.push(candidate(results.length, "authority", author, { authorityType: "person", authorityRole: "author" }));
  if (plausible(publisher)) results.push(candidate(results.length, "authority", publisher, { authorityType: "institution", authorityRole: "publisher" }));
  if (date) results.push(candidate(results.length, "dateStatement", date));
  return results;
}

function identity(candidate: Candidate): string {
  return [candidate.fieldPath, candidate.typeFieldName ?? "", candidate.authorityType ?? "", candidate.authorityRole ?? "", candidate.identifierScheme ?? "", candidate.value.normalize("NFC").toLocaleLowerCase()].join("|");
}

function conflict(candidates: readonly Candidate[]): boolean {
  const groups = new Map<string, Candidate[]>();
  for (const item of candidates) {
    if (item.fieldPath === "authority" && PERSON_AUTHORITY_ROLES.has(item.authorityRole ?? "")) continue;
    const key = [item.fieldPath, item.typeFieldName ?? "", item.authorityType ?? "", item.authorityRole ?? "", item.identifierScheme ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].some((group) => {
    const rank = Math.min(...group.map((item) => item.precedenceRank));
    return new Set(group.filter((item) => item.precedenceRank === rank).map((item) => item.value.normalize("NFC").toLocaleLowerCase())).size > 1;
  });
}

export function mergeSuggestionCandidates(
  computed: readonly Candidate[],
  lightweight: readonly Candidate[],
  emptyStatus: SuggestionStatus,
): { status: SuggestionStatus; candidates: Candidate[] } {
  const hasComputedTitle = computed.some((item) => item.fieldPath === "canonicalTitle");
  const map = new Map<string, Candidate>();
  for (const item of [...computed, ...lightweight.filter((candidate) => !(hasComputedTitle && candidate.fieldPath === "canonicalTitle"))]) {
    const key = identity(item);
    const previous = map.get(key);
    if (!previous || item.precedenceRank < previous.precedenceRank) map.set(key, item);
  }
  const candidates = [...map.values()].sort((left, right) =>
    left.precedenceRank - right.precedenceRank
    || (left.sourcePageIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourcePageIndex ?? Number.MAX_SAFE_INTEGER)
    || left.position - right.position,
  ).map((item, position) => ({ ...item, position }));
  return {
    status: candidates.length === 0 ? emptyStatus : conflict(candidates) ? "ambiguous" : "ready",
    candidates,
  };
}
