import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test, type TestContext } from "node:test";
import { DriveService } from "../../src/drive/drive-service.js";
import { LibraryService } from "../../src/library/library-service.js";
import { collectAllHoldings, searchHoldings, type LibrarySearchFilters, type LibrarySearchSort, type SearchableHolding } from "../../src/library/search.js";
import { initializeLibrarySearchProjection } from "../../src/persistence/sqlite/search-projection.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-09-06T00:00:00.000Z");
const OWNER = { id: "search-owner", loginName: "search-owner", role: "owner" as const };
const SORTS: LibrarySearchSort[] = ["relevance", "newest", "oldest", "title_asc", "title_desc", "size_asc", "size_desc"];

function fixture(context: TestContext, count: number, rich = true) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({ ...OWNER, passwordHash: "test", state: "active", createdAt: NOW, updatedAt: NOW });
  const library = persistence.repositories.libraries.findDefault()!;
  const domain = library.ownerDomainId;
  const libraries = new LibraryService(persistence, new DriveService(persistence, new InMemoryStorageAdapter(() => NOW)));
  persistence.repositories.metadata.createAuthority({
    id: "alias-person", ownerDomainId: domain, type: "person", canonicalLabel: "张帆", aliases: ["Zhang Fan", "子扬"], revision: 1,
    createdByAccountId: OWNER.id, updatedByAccountId: OWNER.id, createdAt: NOW, updatedAt: NOW,
  });
  const file = database.prepare(`INSERT INTO files (id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
    storage_provider, object_key, media_type, size_bytes, checksum_algorithm, checksum, state, revision, created_at, updated_at, activated_at)
    VALUES (?, ?, ?, NULL, ?, 'memory', ?, ?, ?, 'md5', 'YWNhZGVtaWM=', 'active', 0, ?, ?, ?)`);
  const record = database.prepare("INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  const artifact = database.prepare("INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at) VALUES (?, ?, ?, 'detached', ?, ?)");
  const version = database.prepare("INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  const attach = database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?");
  const titles = ["元史研究", "张帆", "The Mongols and the West", "École française", "E\u0301cole française", "𠀀学文献", "\uE000学文献", "蒙古秘史", "武英殿本", "明代刻本"];
  database.transaction(() => {
    for (let index = 0; index < count; index++) {
      const id = String(index).padStart(5, "0"); const filename = `scan-${id}.pdf`;
      const timestamp = new Date(NOW.getTime() + (index % 9) * 1000).toISOString();
      file.run(`file-${id}`, domain, OWNER.id, filename, `objects/aa/${createHash("sha256").update(id).digest("hex").slice(2)}`,
        index === 1 ? "image/png" : "application/pdf", (index % 7) * 123 + 1, timestamp, timestamp, timestamp);
      record.run(`record-${id}`, domain, OWNER.id, filename, timestamp, timestamp);
      artifact.run(`artifact-${id}`, domain, `record-${id}`, timestamp, timestamp);
      version.run(`version-${id}`, domain, `artifact-${id}`, `file-${id}`, timestamp, timestamp);
      attach.run(`artifact-${id}`);
      if (!rich && index % 100 !== 0) continue;
      persistence.repositories.metadata.saveMetadata({
        recordId: `record-${id}`, ownerDomainId: domain, actorAccountId: OWNER.id, expectedRevision: null, now: NOW,
        materialType: "book", canonicalTitle: titles[index % titles.length]!, subtitle: `副题 ${id}`, alternativeTitles: ["別題"],
        dateStatement: "1997", identifiers: [{ scheme: "doi", value: `10.1000/${id}` }], typeFields: { volumeStatement: "旧册" },
        authorityLinks: index % 2 === 0 ? [{ authorityId: "alias-person", role: "author" }] : [],
      });
      persistence.repositories.bibliography.saveProfile({
        recordId: `record-${id}`, ownerDomainId: domain, actorAccountId: OWNER.id, expectedRevision: null, now: NOW,
        materialClass: index % 2 === 0 ? "traditional_book" : "primary_source_modern_edition",
        contributors: [{ id: `person-${id}`, label: index % 2 === 0 ? "刘晓" : "Peter Jackson", role: "author" },
          { id: `editor-${id}`, label: "顾颉刚", role: "collator", roleLabel: "点校" }],
        publication: { publisher: "中华书局", publicationDate: "1976", place: "北京" },
        language: "汉语", series: "二十四史", volume: index % 2 === 0 ? "卷一" : "卷二",
        carrierEdition: { editionType: "punctuated_edition" },
        sourceEdition: { dynasty: "明", reignTitle: "万历", reignYear: "三年", absoluteYear: 1575, editionType: "engraved", institution: "武英殿" },
      });
    }
  })();
  return { database, persistence, library, domain, libraries };
}

/** Previous full-scan path, deliberately retaining its hydration cost. */
function referenceHoldings(state: ReturnType<typeof fixture>): SearchableHolding[] {
  const repositories = state.persistence.repositories;
  const holdings = collectAllHoldings((after, limit) => repositories.libraries.listHoldingsPage(state.library.id, after, limit))!;
  const ids = holdings.map((holding) => holding.recordId);
  const metadata = new Map(repositories.metadata.findMetadataMany(state.domain, ids).map((item) => [item.recordId, item]));
  const profiles = new Map(repositories.bibliography.findProfiles(state.domain, ids).map((item) => [item.recordId, item]));
  const authorityIds = [...new Set([...metadata.values()].flatMap((item) => item.authorityLinks.map((link) => link.authorityId)))];
  const authorities = new Map(repositories.metadata.findAuthorities(state.domain, authorityIds).map((item) => [item.id, item]));
  return holdings.map((holding) => {
    const canonical = metadata.get(holding.recordId) ?? null;
    return { fileId: holding.file.id, displayName: holding.file.displayName, mediaType: holding.file.mediaType,
      sizeBytes: holding.file.sizeBytes, artifactId: holding.artifactId, artifactCreatedAt: holding.artifactCreatedAt,
      canonicalTitle: holding.canonicalTitle, metadata: canonical, bibliography: profiles.get(holding.recordId) ?? null,
      authorLabels: [...holding.authorLabels], authorities: (canonical?.authorityLinks ?? []).flatMap((link) => {
        const authority = authorities.get(link.authorityId);
        return authority ? [{ type: authority.type, role: link.role, label: authority.canonicalLabel, aliases: authority.aliases }] : [];
      }) };
  });
}

test("SQL search equals the full-scan oracle for multilingual ranks, all sorts, filters and every cursor page", (context) => {
  const state = fixture(context, 105);
  initializeLibrarySearchProjection(state.database);
  const reference = referenceHoldings(state);
  const cases: Array<[string, LibrarySearchFilters]> = [
    ["元史", {}], ["张帆", {}], ["Zhang Fan", {}], ["子扬", {}], ["刘晓 元史", {}], ["Peter Mongols", {}],
    ["ÉCOLE", {}], ["e\u0301cole", {}], ["𠀀", {}], ["\uE000", {}], ["scan", {}], ["10.1000/00001", {}],
    ["中华书局点校本", {}], ["现代点校本", {}], ["明代刻本", {}], ["万历刻本", {}], ["武英殿本", {}], ["无此结果", {}],
    ["", { materialClass: "traditional_book", contributor: "子扬", publisher: "中华", year: "1575", dynasty: "明", reignTitle: "万历", editorialRole: "点校", series: "二十四", volume: "卷一", language: "汉语", editionType: "engraved" }],
    ["", { publisher: "中华书局" }],
  ];
  for (const [query, filters] of cases) for (const sort of SORTS) {
    let cursor: string | null = null; let pages = 0;
    do {
      const expected = searchHoldings(reference, query, 7, cursor, filters, sort);
      const actual = state.libraries.searchHoldings(OWNER.id, state.library.id, query, 7, cursor, filters, sort);
      assert.deepEqual(actual, expected, `${query}/${JSON.stringify(filters)}/${sort}/page ${pages}`);
      cursor = actual.nextCursor; pages++;
      assert.ok(pages < 30, "cursor must advance");
    } while (cursor);
  }
  const first = state.libraries.searchHoldings(OWNER.id, state.library.id, "scan", 1, null);
  assert.throws(() => state.libraries.searchHoldings(OWNER.id, state.library.id, "元史", 1, first.nextCursor));
  assert.throws(() => state.libraries.searchHoldings(OWNER.id, state.library.id, "scan", 1, first.nextCursor, {}, "oldest"));
  assert.equal(state.libraries.searchHoldings(OWNER.id, state.library.id, "scan-00001", 1, null).results[0]!.mediaType, "image/png");
});

test("projection invalidation follows aliases and canonical edits atomically, while live holdings and membership govern access", (context) => {
  const state = fixture(context, 12);
  initializeLibrarySearchProjection(state.database);
  const search = (query: string) => state.libraries.searchHoldings(OWNER.id, state.library.id, query, 100, null).results;
  assert.equal(search("新别名").length, 0);
  const authority = state.persistence.repositories.metadata.findAuthority(state.domain, "alias-person")!;
  state.persistence.repositories.metadata.updateAuthority({ ...authority, authorityId: authority.id, aliases: ["新别名"], expectedRevision: authority.revision, actorAccountId: OWNER.id, now: NOW });
  assert.equal(search("新别名").length, 6);
  assert.equal(search("子扬").length, 0);
  assert.throws(() => state.database.transaction(() => {
    state.database.prepare("UPDATE scholarly_record_metadata SET canonical_title = '未提交新题' WHERE record_id = 'record-00000'").run();
    assert.equal(search("未提交新题").length, 1);
    throw new Error("roll back both canonical value and derived refresh");
  })());
  assert.equal(search("未提交新题").length, 0);
  state.database.prepare("UPDATE scholarly_record_metadata SET canonical_title = '已提交新题' WHERE record_id = 'record-00000'").run();
  assert.equal(search("已提交新题")[0]!.fileId, "file-00000");
  state.database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'detached' WHERE id = 'artifact-00000'").run();
  assert.equal(search("已提交新题").length, 0);
  assert.equal(state.database.prepare<[], { n: number }>("SELECT count(*) AS n FROM scholarly_search_projection").get()!.n, 12, "projection is not an authorization cache");
  state.persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", NOW);
  assert.throws(() => search("scan"));
});

test("100/1,000/10,000 search benchmarks compare the old path and bound hydration to the requested page", (context) => {
  const report: Array<Record<string, unknown>> = [];
  for (const rich of [false, true]) for (const count of [100, 1000, 10000]) {
    const state = fixture(context, count, rich);
    const started = performance.now();
    const initialization = initializeLibrarySearchProjection(state.database);
    const buildMs = performance.now() - started;
    assert.equal(initialization.refreshed, count);
    for (const [query, sort] of [["scan", "relevance"], ["元史", "title_asc"], ["scan", "newest"]] as const) {
      let oldMs = 0; let newMs = 0;
      for (let repeat = 0; repeat < 3; repeat++) {
        const oldStart = performance.now();
        const expected = searchHoldings(referenceHoldings(state), query, 50, null, {}, sort);
        oldMs += performance.now() - oldStart;
        const newStart = performance.now();
        const actual = state.libraries.searchHoldings(OWNER.id, state.library.id, query, 50, null, {}, sort);
        newMs += performance.now() - newStart;
        assert.deepEqual(actual, expected);
      }
      report.push({ records: count, profile: rich ? "rich" : "sparse", query, sort, buildMs: Math.round(buildMs), oldMs: +(oldMs / 3).toFixed(2), newMs: +(newMs / 3).toFixed(2) });
    }
    const metadata = state.persistence.repositories.metadata;
    const find = metadata.findMetadataMany.bind(metadata); let hydrated = 0;
    const spy = context.mock.method(metadata, "findMetadataMany", (...args: Parameters<typeof find>) => { hydrated += args[1].length; return find(...args); });
    state.libraries.searchHoldings(OWNER.id, state.library.id, "scan", 50, null);
    assert.equal(hydrated, 50);
    spy.mock.restore();
    state.persistence.close();
  }
  for (const row of report) context.diagnostic(JSON.stringify(row));
  if (process.env.ACADEMICCLOUD_SEARCH_BENCHMARK_OUTPUT) {
    mkdirSync(dirname(process.env.ACADEMICCLOUD_SEARCH_BENCHMARK_OUTPUT), { recursive: true });
    writeFileSync(process.env.ACADEMICCLOUD_SEARCH_BENCHMARK_OUTPUT, JSON.stringify({ runtime: process.version, platform: process.platform, report }, null, 2));
  }
});
