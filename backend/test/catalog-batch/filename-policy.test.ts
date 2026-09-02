import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCatalogFilename } from "../../src/catalog-batch/filename-policy.js";

function filename(input: Parameters<typeof formatCatalogFilename>[0]): string {
  const result = formatCatalogFilename(input);
  assert.equal(result.status, "proposed");
  return result.status === "proposed" ? result.filename : "";
}

test("academiccloud.filename.v1 emits the exact Owner-approved bibliographic forms", () => {
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "蒙元史研究", materialClass: "scholarly_monograph",
    contributors: [{ label: "刘晓", role: "author" }], publicationDate: "2009", filenameStyle: "cjk_book",
  }), { status: "proposed", filename: "《蒙元史研究》（刘晓，2009）.pdf", responsibility: "刘晓", year: "2009" });
  assert.equal(filename({
    canonicalTitle: "蒙古与教廷", materialClass: "scholarly_monograph", editionType: "translated_edition",
    contributors: [{ label: "伯希和", role: "author" }, { label: "冯承钧", role: "translator", roleLabel: "译" }],
    publicationDate: "1994", filenameStyle: "cjk_book",
  }), "《蒙古与教廷》（冯承钧译，1994）.pdf");
  assert.equal(filename({
    canonicalTitle: "译本", materialClass: "scholarly_monograph", editionType: "translated_edition",
    contributors: [
      { label: "原作者", role: "author" },
      { label: "甲", role: "translator", roleLabel: "译" },
      { label: "乙", role: "translator", roleLabel: "译" },
    ],
    publicationDate: "2025", filenameStyle: "cjk_book",
  }), "《译本》（甲、乙译，2025）.pdf");
  assert.equal(filename({
    canonicalTitle: "蒙古秘史", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "余大钧", role: "annotator", roleLabel: "译注" }], publicationDate: "2005", filenameStyle: "cjk_book",
  }), "《蒙古秘史》（余大钧译注，2005）.pdf");
  assert.equal(filename({
    canonicalTitle: "世界征服者史", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "何高济", role: "translator", roleLabel: "译" }], publicationDate: "2004", filenameStyle: "cjk_book",
  }), "《世界征服者史》（何高济译，2004）.pdf");
  assert.equal(filename({
    canonicalTitle: "某书", materialClass: "primary_source_modern_edition",
    contributors: [
      { label: "甲", role: "collator", roleLabel: "校注" },
      { label: "乙", role: "collator", roleLabel: "校注" },
    ], publicationDate: "年份", filenameStyle: "cjk_book",
  }), "《某书》（甲、乙校注，年份）.pdf");
  assert.equal(filename({
    canonicalTitle: "论文名", materialClass: "journal_article",
    contributors: [{ label: "作者", role: "author" }], publicationDate: "年份", filenameStyle: "cjk_article",
  }), "作者：《论文名》（年份）.pdf");
  assert.equal(filename({
    canonicalTitle: "The Mongols", materialClass: "scholarly_monograph",
    contributors: [{ label: "David Morgan", role: "author" }], publicationDate: "2007", filenameStyle: "foreign_book",
  }), "The Mongols (David Morgan, 2007).pdf");
});

test("filename policy preserves Unicode, conservatively maps invalid characters, and never invents missing fields", () => {
  const sanitized = formatCatalogFilename({
    canonicalTitle: "书名:卷一/卷二?", materialClass: "scholarly_monograph",
    contributors: [{ label: "甲|乙", role: "author" }], publicationDate: "2026", filenameStyle: "cjk_book",
  });
  assert.equal(sanitized.status === "proposed" && sanitized.filename, "《书名：卷一／卷二？》（甲｜乙，2026）.pdf");
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "无年书", materialClass: "scholarly_monograph",
    contributors: [{ label: "作者", role: "author" }], filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_year" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "史料", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "某人", role: "translator" }], publicationDate: "2001", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "译本", materialClass: "scholarly_monograph", editionType: "translated_edition",
    contributors: [{ label: "原作者", role: "author" }, { label: "译者", role: "translator" }],
    publicationDate: "2001", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "译本", materialClass: "scholarly_monograph", editionType: "translated_edition",
    contributors: [
      { label: "甲", role: "translator", roleLabel: "译" },
      { label: "乙", role: "translator", roleLabel: "编译" },
    ],
    publicationDate: "2001", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "史料", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "某人", role: "translator", roleLabel: "译" }], publicationDate: "2001",
    responsibilityStatement: "某人编", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
});
