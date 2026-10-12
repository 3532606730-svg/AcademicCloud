import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataDetailToCsl } from "../../src/citation/csl-mapping.js";
import type { MetadataDetail } from "../../src/metadata/metadata-service.js";

function detail(): MetadataDetail {
  return {
    holding: {
      recordId: "record-1", recordLabel: "scan.pdf", artifactId: "artifact-1", versionId: "version-1", version: "v".repeat(43),
      canonicalTitle: "资治通鉴", authorLabels: [], materialClass: "primary_source_modern_edition",
      contributorLabels: ["司马光", "胡三省", "顾颉刚"], secondaryContributorLabels: ["司马光", "胡三省", "顾颉刚"],
      publisher: "中华书局", date: "1956", editionStatement: "现代点校本", catalogueDisplayTitle: "备用题名",
      file: { id: "file-1", displayName: "scan.pdf", mediaType: "application/pdf", sizeBytes: 12, updatedAt: "2026-08-22T00:00:00.000Z" },
    },
    displayTitle: "备用题名",
    originalFilename: "scan.pdf",
    metadataVersion: "m".repeat(43),
    metadata: {
      contractVersion: 1,
      materialType: "book",
      canonicalTitle: "资治通鉴",
      subtitle: "点校本",
      alternativeTitles: [],
      dateStatement: "1956",
      identifiers: [{ scheme: "isbn", value: "9787101001839" }],
      typeFields: {},
      authorityLinks: [],
    },
    bibliographyVersion: "b".repeat(43),
    bibliography: {
      contractVersion: 1,
      materialClass: "primary_source_modern_edition",
      contributors: [
        { id: "c1", label: "司马光", role: "author" },
        { id: "c2", label: "胡三省", role: "annotator", roleLabel: "音注" },
        { id: "c3", label: "顾颉刚", role: "organizer", roleLabel: "点校" },
      ],
      publication: { publisher: "中华书局", place: "北京", publicationDate: "1956", editionNumber: "第一版" },
      series: "中国史学基本典籍丛刊",
      volume: "第一册",
      language: "zh-CN",
      carrierEdition: { editionType: "punctuated_edition", editionStatement: "现代点校本" },
      sourceEdition: { dynasty: "宋", reignTitle: "元祐", editionType: "engraved", editionStatement: "宋刻本" },
    },
    fieldAuthorities: [],
    canEditMetadata: true,
    file: { id: "file-1", mediaType: "application/pdf", sizeBytes: 12, updatedAt: "2026-08-22T00:00:00.000Z" },
  };
}

test("canonical bibliography maps to stable CSL JSON without flattening roles or source/carrier editions", () => {
  const projection = metadataDetailToCsl(detail());
  assert.equal(projection.completeness, "structured");
  assert.equal(projection.materialClass, "primary_source_modern_edition");
  assert.equal(projection.item.type, "book");
  assert.equal(projection.item.title, "资治通鉴: 点校本");
  assert.deepEqual(projection.item.author, [{ literal: "司马光" }]);
  assert.equal(projection.item.note, "胡三省音注、顾颉刚点校");
  assert.equal(projection.item.edition, "第一版，现代点校本");
  assert.equal(projection.item["original-title"], "据宋元祐，宋刻本");
  assert.deepEqual(projection.item.issued, { "date-parts": [[1956]] });
  assert.equal(projection.item.ISBN, "9787101001839");
});

test("citation mapping falls back explicitly when structured bibliography is absent", () => {
  const value = detail();
  value.metadata = null;
  value.bibliography = null;
  const projection = metadataDetailToCsl(value);
  assert.equal(projection.completeness, "partial");
  assert.equal(projection.materialClass, null);
  assert.equal(projection.item.title, "备用题名");
  assert.equal(projection.item.genre, "Z");
});

test("citation issued dates use publication facts and preserve copyright, preface and source-date statements", () => {
  for (const statement of ["Copyright © 2014 by the author", "2014年版权所有", "1993年整理序", "1956"]) {
    const value = detail();
    delete value.bibliography!.publication.publicationDate;
    value.metadata!.dateStatement = statement;
    const before = structuredClone(value);
    assert.equal(Object.hasOwn(metadataDetailToCsl(value).item, "issued"), false, statement);
    value.bibliography = null;
    assert.equal(Object.hasOwn(metadataDetailToCsl(value).item, "issued"), false, `metadata-only:${statement}`);
    value.bibliography = before.bibliography;
    assert.deepEqual(value, before, "projection must not rewrite source facts");
    value.bibliography!.publication.publicationDate = "1993-06";
    assert.deepEqual(metadataDetailToCsl(value).item.issued, { "date-parts": [[1993, 6]] });
    assert.equal(value.metadata!.dateStatement, statement);
  }
});

test("journal metadata keeps its authorized container, issue and article extent separate from pinpoint locators", () => {
  const value = detail();
  value.metadata!.materialType = "article";
  value.metadata!.canonicalTitle = "The Mongols: Ecological and Social Perspectives";
  value.metadata!.subtitle = null;
  value.metadata!.typeFields = { volumeStatement: "46", issueStatement: "1", locator: "11–50" };
  value.metadata!.authorityLinks = [
    { id: "unrelated", type: "work", canonicalLabel: "An unrelated source work", aliases: [], version: "s".repeat(43), role: "source_work" },
    { id: "journal", type: "work", canonicalLabel: "Harvard Journal of Asiatic Studies", aliases: [], version: "j".repeat(43), role: "container_work" },
  ];
  value.bibliography!.materialClass = "journal_article";
  value.bibliography!.contributors = [{ id: "author", label: "Joseph Fletcher", role: "author" }];
  value.bibliography!.publication = { publicationDate: "1986-06" };
  value.bibliography!.volume = undefined;
  value.bibliography!.language = "en";
  const { item } = metadataDetailToCsl(value);
  assert.equal(item.type, "article-journal");
  assert.equal(item["container-title"], "Harvard Journal of Asiatic Studies");
  assert.equal(item.volume, "46");
  assert.equal(item.issue, "1");
  assert.equal(item.page, "11–50");
  assert.deepEqual(item.issued, { "date-parts": [[1986, 6]] });
  assert.deepEqual(item.author, [{ family: "Fletcher", given: "Joseph" }]);
  value.bibliography!.volume = "47";
  assert.equal(metadataDetailToCsl(value).item.volume, "47");
  value.metadata!.authorityLinks = [];
  value.metadata!.typeFields = {};
  const missing = metadataDetailToCsl(value).item;
  for (const field of ["container-title", "issue", "page"]) assert.equal(Object.hasOwn(missing, field), false);
});

test("book-part and conference citation genres preserve their source class and authorized container", () => {
  for (const [materialClass, type, genre] of [["book_chapter", "chapter", "M"], ["conference_paper", "paper-conference", "C"]] as const) {
    const value = detail();
    value.metadata!.materialType = "article";
    value.metadata!.typeFields = { locator: "11–20" };
    value.metadata!.authorityLinks = [{ id:"container",type:"work",canonicalLabel:"示例文集",aliases:[],version:"c".repeat(43),role:"container_work" }];
    value.bibliography!.materialClass = materialClass;
    const before = structuredClone(value);
    const { item } = metadataDetailToCsl(value);
    assert.equal(item.type,type);
    assert.equal(item.genre,genre);
    assert.equal(item.page,"11–20");
    assert.equal(item["container-title"],"示例文集");
    assert.deepEqual(value,before);
  }
});
