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
  }), "《蒙古与教廷》（伯希和著、冯承钧译，1994）.pdf");
  assert.equal(filename({
    canonicalTitle: "译本", materialClass: "scholarly_monograph", editionType: "translated_edition",
    contributors: [
      { label: "原作者", role: "author" },
      { label: "甲", role: "translator", roleLabel: "译" },
      { label: "乙", role: "translator", roleLabel: "译" },
    ],
    publicationDate: "2025", filenameStyle: "cjk_book",
  }), "《译本》（原作者著、甲、乙译，2025）.pdf");
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


test("source/version and preserve-original strategies match the Owner-approved library conventions", () => {
  assert.equal(filename({
    canonicalTitle: "元史（全十五册）", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "宋濂", role: "author" }], editionType: "punctuated_edition",
    publisher: "中华书局", publicationDate: "1976", filenameStyle: "cjk_book",
  }), "《元史（全十五册）》（中华书局，1976）.pdf");
  assert.equal(filename({
    canonicalTitle: "三朝北盟会编（上册）", materialClass: "traditional_book",
    contributors: [{ label: "徐梦莘", role: "author" }], editionType: "facsimile",
    publisher: "上海古籍出版社", publicationDate: "1987", filenameStyle: "cjk_book",
  }), "《三朝北盟会编（上册）》（上海古籍出版社，1987）.pdf");
  assert.equal(filename({
    canonicalTitle: "真腊风土记", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "夏鼐", role: "annotator", roleLabel: "校注" }],
    publisher: "中华书局", publicationDate: "1981", filenameStyle: "cjk_book",
  }), "《真腊风土记》（夏鼐校注，1981）.pdf");
  assert.equal(filename({
    canonicalTitle: "基础史料", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "某人", role: "collator", roleLabel: "点校" }],
    publisher: "某出版社", publicationDate: "2000", filenameStyle: "cjk_source",
  }), "《基础史料》（某出版社，2000）.pdf");
  assert.equal(filename({
    canonicalTitle: "关于《历史研究》文献引证标注方式的规定", materialClass: "other", contributors: [],
    currentFilename: "关于《历史研究》文献引证标注方式的规定.pdf", publicationDate: "2005", filenameStyle: "cjk_book",
  }), "关于《历史研究》文献引证标注方式的规定.pdf");
  assert.equal(filename({
    canonicalTitle: "任意元数据题名", materialClass: "other", contributors: [],
    currentFilename: "未出版点校稿.docx", filenameStyle: "preserve_original",
  }), "未出版点校稿.docx");
});

test("source filenames prefer publisher and never surface verbose reproduction provenance", () => {
  assert.equal(filename({
    canonicalTitle: "王国维遗书·第十三册", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "王国维", role: "author" }], editionType: "facsimile",
    editionStatement: "据商务印书馆1940年版影印", publisher: "上海书店",
    publicationDate: "1983", filenameStyle: "cjk_book",
  }), "《王国维遗书·第十三册》（上海书店，1983）.pdf");
  assert.equal(filename({
    canonicalTitle: "心史·上卷", materialClass: "traditional_book",
    contributors: [{ label: "郑思肖", role: "author" }],
    editionStatement: "明崇祯本", publicationDate: "1639", filenameStyle: "cjk_book",
  }), "《心史·上卷》（明崇祯本，1639）.pdf");
  assert.equal(filename({
    canonicalTitle: "某古籍", materialClass: "traditional_book",
    contributors: [{ label: "古人", role: "author" }], editionType: "engraved",
    publicationDate: "1600", filenameStyle: "cjk_book",
  }), "《某古籍》（刻本，1600）.pdf");

  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "王国维遗书·第十三册", materialClass: "primary_source_modern_edition",
    contributors: [{ label: "王国维", role: "author" }], editionType: "facsimile",
    editionStatement: "据商务印书馆1940年版影印", publicationDate: "1983", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "许鲁斋集", materialClass: "traditional_book",
    contributors: [{ label: "许衡", role: "author" }],
    editionStatement: "北京新一版", publicationDate: "1985", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "影印史料", materialClass: "traditional_book",
    contributors: [{ label: "古人", role: "author" }], editionType: "facsimile",
    publicationDate: "1987", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
  assert.deepEqual(formatCatalogFilename({
    canonicalTitle: "无版本来源史料", materialClass: "traditional_book",
    contributors: [{ label: "古人", role: "author" }], publicationDate: "1639", filenameStyle: "cjk_book",
  }), { status: "no_rename", reason: "missing_responsibility" });
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
