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
    canonicalTitle: "元代宰相制度研究",
    metadata: metadata(),
    authorLabels: ["张帆"],
    authorities: [
      { type: "person", role: "author", label: "张帆", aliases: [] },
      { type: "institution", role: "publisher", label: "北京大学出版社", aliases: [] },
    ],
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
    "authorLabels", "canonicalTitle", "date", "displayName", "fileId", "materialType", "publisher",
  ]);
  assert.equal(result.publisher, "北京大学出版社");
  assert.equal(result.date, "1997");
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
