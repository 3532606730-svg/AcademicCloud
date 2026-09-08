import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectAllHoldings,
  searchHoldings,
  SEARCH_QUERY_MAX_LENGTH,
  SearchInputError,
  type HoldingCursor,
  type SearchableHolding,
} from "../../src/library/search.js";
import type { CanonicalMetadata } from "../../src/metadata/metadata.js";
import type { BibliographicProfile } from "../../src/bibliography/bibliography.js";

function metadata(overrides: Partial<CanonicalMetadata> = {}): CanonicalMetadata {
  return {
    recordId: "record",
    ownerDomainId: "library:lib",
    contractVersion: 1,
    revision: 1,
    createdByAccountId: "owner",
    updatedByAccountId: "owner",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    materialType: "book",
    canonicalTitle: "元代宰相制度研究",
    alternativeTitles: [],
    dateStatement: "1997",
    identifiers: [{ scheme: "isbn", value: "9787301032145" }],
    typeFields: {},
    authorityLinks: [],
    ...overrides,
  };
}

function holding(overrides: Partial<SearchableHolding> = {}): SearchableHolding {
  return {
    fileId: "file-a",
    displayName: "zhangfan-yuandai-zaixiang.pdf",
    sizeBytes: 12,
    mediaType: "application/pdf",
    artifactId: "artifact-a",
    artifactCreatedAt: new Date("2026-08-18T00:00:00.000Z"),
    canonicalTitle: "元代宰相制度研究",
    metadata: metadata(),
    bibliography: null,
    authorLabels: ["张帆"],
    authorities: [
      { type: "person", role: "author", label: "张帆", aliases: [] },
      { type: "institution", role: "publisher", label: "北京大学出版社", aliases: [] },
    ],
    ...overrides,
  };
}

function bibliography(overrides: Partial<BibliographicProfile> = {}): BibliographicProfile {
  return {
    recordId: "record",
    ownerDomainId: "library:lib",
    contractVersion: 1,
    materialClass: "scholarly_monograph",
    contributors: [],
    publication: {},
    carrierEdition: {},
    sourceEdition: {},
    revision: 1,
    createdByAccountId: "owner",
    updatedByAccountId: "owner",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    ...overrides,
  };
}

function results(rawQuery: string, holdings: SearchableHolding[]) {
  return searchHoldings(holdings, rawQuery, 100, null).results;
}

test("exact canonical title outranks authority and filename matches", () => {
  const exact = holding({ fileId: "exact", canonicalTitle: "张帆", authorLabels: [], authorities: [] });
  const byAuthor = holding({ fileId: "author", canonicalTitle: "另一个书名", authorLabels: ["张帆"], authorities: [{ type: "person", role: "author", label: "张帆", aliases: [] }] });
  const filename = holding({ fileId: "filename", canonicalTitle: null, metadata: null, authorLabels: [], authorities: [], displayName: "张帆扫描件.pdf" });
  const page = searchHoldings([filename, byAuthor, exact], "张帆", 100, null);
  assert.deepEqual(page.results.map((item) => item.fileId), ["exact", "author", "filename"]);
});

test("title prefix and normalized title match rank above authors", () => {
  const prefix = holding({ fileId: "prefix", canonicalTitle: "元代宰相制度研究", authorLabels: [] });
  const prefixOnly = holding({ fileId: "prefix-only", canonicalTitle: "元代宰相制度研究（修订本）", authorLabels: [] });
  const byAuthor = holding({ fileId: "by-author", canonicalTitle: "无关书名", authorLabels: ["元代宰相"], authorities: [{ type: "person", role: "author", label: "元代宰相", aliases: [] }] });
  const page = searchHoldings([byAuthor, prefixOnly, prefix], "元代宰相", 100, null);
  assert.deepEqual(page.results.map((item) => item.fileId), ["prefix", "prefix-only", "by-author"]);
});

test("author and publisher authority labels are searchable", () => {
  const byAuthor = holding({ fileId: "a", canonicalTitle: "疾驰的草原征服者", authorLabels: ["杉山正明"], authorities: [{ type: "person", role: "author", label: "杉山正明", aliases: [] }] });
  const byPublisher = holding({ fileId: "p", canonicalTitle: "另一个书名", authorLabels: [], authorities: [{ type: "institution", role: "publisher", label: "北京大学出版社", aliases: [] }] });
  assert.deepEqual(results("杉山正明", [byAuthor, byPublisher]).map((item) => item.fileId), ["a"]);
  assert.deepEqual(results("北京大学出版社", [byAuthor, byPublisher]).map((item) => item.fileId), ["p"]);
});

test("identifier exact match and original filename fallback are searchable", () => {
  const byIsbn = holding({ fileId: "isbn", canonicalTitle: "一个书名", metadata: metadata({ identifiers: [{ scheme: "isbn", value: "9787301032145" }] }) });
  const byFilename = holding({ fileId: "fn", canonicalTitle: null, metadata: null, authorLabels: [], authorities: [], displayName: "扫描件-元代宰相.pdf" });
  assert.deepEqual(results("9787301032145", [byFilename, byIsbn]).map((item) => item.fileId), ["isbn"]);
  assert.deepEqual(results("扫描件", [byFilename, byIsbn]).map((item) => item.fileId), ["fn"]);
});

test("Unicode Chinese and English case behavior are deterministic", () => {
  const chinese = holding({ fileId: "zh", canonicalTitle: "元代宰相制度研究" });
  const english = holding({
    fileId: "en",
    canonicalTitle: "The Mongols and the West",
    authorLabels: ["Peter Jackson"],
    authorities: [{ type: "person", role: "author", label: "Peter Jackson", aliases: [] }],
  });
  assert.deepEqual(results("元代宰相", [chinese]).map((item) => item.fileId), ["zh"]);
  assert.deepEqual(results("the mongols AND the west", [english]).map((item) => item.fileId), ["en"]);
  assert.deepEqual(results("peter jackson", [english]).map((item) => item.fileId), ["en"]);
});

test("pagination is stable and cursor resumes deterministically", () => {
  const holdings = Array.from({ length: 7 }, (_, index) => holding({
    fileId: `file-${String(index).padStart(2, "0")}`,
    canonicalTitle: `元代宰相制度研究 ${index}`,
  }));
  const first = searchHoldings(holdings, "元代宰相制度研究", 3, null);
  assert.equal(first.results.length, 3);
  assert.ok(first.nextCursor);
  const second = searchHoldings(holdings, "元代宰相制度研究", 3, first.nextCursor);
  assert.equal(second.results.length, 3);
  const third = searchHoldings(holdings, "元代宰相制度研究", 3, second.nextCursor);
  assert.equal(third.results.length, 1);
  assert.equal(third.nextCursor, null);
  const all = [...first.results, ...second.results, ...third.results].map((item) => item.fileId);
  assert.deepEqual(all, [...all].sort());
  assert.equal(new Set(all).size, 7);
});

test("query length and limit bounds are enforced", () => {
  assert.throws(() => searchHoldings([], "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1), 10, null), (error) => (
    error instanceof SearchInputError && error.code === "query_too_long"
  ));
  assert.throws(() => searchHoldings([], "   ", 10, null), (error) => (
    error instanceof SearchInputError && error.code === "empty_query"
  ));
  assert.throws(() => searchHoldings([], "valid", 0, null), (error) => (
    error instanceof SearchInputError && error.code === "invalid_limit"
  ));
  assert.throws(() => searchHoldings([], "valid", 10, "!!!bad"), (error) => (
    error instanceof SearchInputError && error.code === "invalid_cursor"
  ));
});

test("result DTO exposes only presentation fields, never internal identity", () => {
  const page = searchHoldings([holding()], "元代宰相制度研究", 10, null);
  const result = page.results[0]!;
  assert.deepEqual(Object.keys(result).sort(), [
    "authorLabels", "canonicalTitle", "catalogueDisplayTitle", "contributorLabels", "date", "displayName",
    "editionStatement", "fileId", "language", "materialClass", "materialType", "mediaType", "publisher", "sizeBytes",
  ]);
  assert.equal(result.publisher, "北京大学出版社");
  assert.equal(result.date, "1997");
  assert.equal(result.mediaType, "application/pdf");
  assert.equal(result.sizeBytes, 12);
  assert.equal("recordId" in result, false);
  assert.equal("artifactId" in result, false);
  assert.equal("ownerDomainId" in result, false);
  assert.equal("rank" in result, false);
});

test("combined author + title queries hit the author+title tier deterministically", () => {
  const chinese = holding({
    fileId: "zh-combined",
    canonicalTitle: "元代宰相制度研究",
    authorLabels: ["张帆"],
    authorities: [{ type: "person", role: "author", label: "张帆", aliases: [] }],
  });
  const english = holding({
    fileId: "en-combined",
    canonicalTitle: "The Mongols and the West",
    authorLabels: ["Peter Jackson"],
    authorities: [{ type: "person", role: "author", label: "Peter Jackson", aliases: [] }],
  });
  const exactAuthor = holding({
    fileId: "exact-author",
    canonicalTitle: "另一本书",
    authorLabels: ["张帆"],
    authorities: [{ type: "person", role: "author", label: "张帆", aliases: [] }],
  });

  assert.deepEqual(results("张帆 元代宰相制度研究", [chinese]).map((item) => item.fileId), ["zh-combined"]);
  assert.deepEqual(results("Peter Jackson The Mongols and the West", [english]).map((item) => item.fileId), ["en-combined"]);

  // Exact authority still outranks the combined author+title tier.
  const page = searchHoldings([chinese, exactAuthor], "张帆", 10, null);
  assert.deepEqual(page.results.map((item) => item.fileId), ["exact-author", "zh-combined"]);

  // An unseparated Chinese string is never segmented into invented words.
  assert.deepEqual(results("张帆元代宰相制度研究", [chinese]).map((item) => item.fileId), []);
});

test("collectAllHoldings enumerates the whole corpus and fails closed instead of truncating", () => {
  interface Row extends HoldingCursor { id: string }
  const rows: Row[] = Array.from({ length: 5 }, (_, index) => ({
    id: `h${index}`,
    artifactCreatedAt: new Date(2026, 0, 1, 0, 0, 5 - index),
    artifactId: `artifact-${index}`,
  }));
  function paginator(after: HoldingCursor | null, limit: number): Row[] {
    const rest = after ? rows.filter((row) => (
      row.artifactCreatedAt < after.artifactCreatedAt
      || (row.artifactCreatedAt.getTime() === after.artifactCreatedAt.getTime() && row.artifactId < after.artifactId)
    )) : rows;
    return rest.slice(0, limit);
  }

  assert.deepEqual(collectAllHoldings(paginator, 2, 100)?.map((row) => row.id), ["h0", "h1", "h2", "h3", "h4"]);
  assert.equal(collectAllHoldings(paginator, 2, 2), null, "exceeding the page guard must fail closed, not truncate");
});

test("structured bibliography search preserves title priority and supports historical and modern edition concepts", () => {
  const exactTitle = holding({ fileId: "title", canonicalTitle: "中华书局点校本", bibliography: null });
  const modern = holding({
    fileId: "modern",
    canonicalTitle: "元史",
    bibliography: bibliography({
      materialClass: "primary_source_modern_edition",
      contributors: [{ id: "c-modern", label: "宋濂", role: "annotator", roleLabel: "点校" }],
      publication: { publisher: "中华书局", place: "北京", publicationDate: "1976" },
      carrierEdition: { editionType: "annotated_edition" },
    }),
  });
  const traditional = holding({
    fileId: "traditional",
    canonicalTitle: "某书",
    bibliography: bibliography({
      materialClass: "traditional_book",
      sourceEdition: { dynasty: "明", reignTitle: "万历", reignYear: "二十四", institution: "武英殿", editionType: "engraved" },
    }),
  });

  assert.deepEqual(results("中华书局点校本", [modern]).map((item) => item.fileId), ["modern"]);
  assert.deepEqual(results("现代点校本", [modern]).map((item) => item.fileId), ["modern"]);
  assert.deepEqual(results("明代刻本", [traditional]).map((item) => item.fileId), ["traditional"]);
  assert.deepEqual(results("万历刻本", [traditional]).map((item) => item.fileId), ["traditional"]);
  assert.deepEqual(results("武英殿本", [traditional]).map((item) => item.fileId), ["traditional"]);
  assert.deepEqual(searchHoldings([modern, exactTitle], "中华书局点校本", 10).results.map((item) => item.fileId), ["title", "modern"]);
});

test("material and advanced filters are server-authoritative and compose conjunctively", () => {
  const modern = holding({
    fileId: "modern-filter",
    bibliography: bibliography({
      materialClass: "primary_source_modern_edition",
      contributors: [{ id: "c-filter", label: "顾颉刚", role: "annotator", roleLabel: "点校" }],
      publication: { publisher: "中华书局", publicationDate: "1976" },
      series: "二十四史",
      volume: "第一册",
      language: "汉语",
      carrierEdition: { editionType: "annotated_edition" },
      sourceEdition: { dynasty: "元", reignTitle: "至正" },
    }),
  });
  const traditional = holding({
    fileId: "traditional-filter",
    bibliography: bibliography({ materialClass: "traditional_book", language: "汉语", sourceEdition: { dynasty: "明", editionType: "engraved" } }),
  });
  const filters = {
    materialClass: "primary_source_modern_edition" as const,
    contributor: "顾颉刚",
    language: "汉语",
    publisher: "中华书局",
    year: "1976",
    editionType: "annotated_edition" as const,
    dynasty: "元",
    reignTitle: "至正",
    editorialRole: "annotator" as const,
    series: "二十四史",
    volume: "第一册",
  };
  assert.deepEqual(searchHoldings([traditional, modern], "", 10, null, filters).results.map((item) => item.fileId), ["modern-filter"]);
  assert.deepEqual(searchHoldings([traditional, modern], "", 10, null, { materialClass: "traditional_book" }).results.map((item) => item.fileId), ["traditional-filter"]);
  assert.throws(() => searchHoldings([modern], "", 10), (error) => error instanceof SearchInputError && error.code === "empty_query");
});

test("cursor identity binds query, filters, and sort while every search sort paginates without duplicates", () => {
  const corpus = Array.from({ length: 5 }, (_, index) => holding({
    fileId: `sorted-${index}`,
    artifactId: `artifact-${index}`,
    artifactCreatedAt: new Date(`2026-08-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`),
    sizeBytes: 10 + index,
    canonicalTitle: `书 ${index}`,
    bibliography: bibliography({ materialClass: "traditional_book", sourceEdition: { dynasty: index % 2 === 0 ? "明" : "清" } }),
  }));
  for (const sort of ["relevance", "newest", "oldest", "title_asc", "title_desc", "size_asc", "size_desc"] as const) {
    const first = searchHoldings(corpus, "书", 2, null, { materialClass: "traditional_book" }, sort);
    const second = searchHoldings(corpus, "书", 2, first.nextCursor, { materialClass: "traditional_book" }, sort);
    const third = searchHoldings(corpus, "书", 2, second.nextCursor, { materialClass: "traditional_book" }, sort);
    const ids = [...first.results, ...second.results, ...third.results].map((item) => item.fileId);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
  }
  const page = searchHoldings(corpus, "书", 2, null, { dynasty: "明" }, "newest");
  assert.ok(page.nextCursor);
  assert.throws(() => searchHoldings(corpus, "书", 2, page.nextCursor, { dynasty: "清" }, "newest"), (error) => error instanceof SearchInputError && error.code === "invalid_cursor");
  assert.throws(() => searchHoldings(corpus, "书", 2, page.nextCursor, { dynasty: "明" }, "oldest"), (error) => error instanceof SearchInputError && error.code === "invalid_cursor");
});
