import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataDetailToCsl } from "../../src/citation/csl-mapping.js";
import type { MetadataDetail } from "../../src/metadata/metadata-service.js";

function detail(): MetadataDetail {
  return {
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
