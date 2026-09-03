from pathlib import Path

service = Path('backend/src/catalog-batch/catalog-batch-service.ts')
text = service.read_text(encoding='utf-8')
old = '''    const filename = formatCatalogFilename({
      canonicalTitle: imported.canonicalTitle,
      materialClass: imported.profile.materialClass,
      contributors: imported.profile.contributors,
      ...(imported.profile.carrierEdition.editionType ? { editionType: imported.profile.carrierEdition.editionType } : {}),
      ...(imported.dateStatement ? { dateStatement: imported.dateStatement } : {}),
      ...(imported.profile.publication.publicationDate ? { publicationDate: imported.profile.publication.publicationDate } : {}),
      ...(imported.responsibilityStatement ? { responsibilityStatement: imported.responsibilityStatement } : {}),
      filenameStyle: imported.filenameStyle,
    });'''
new = '''    const filename = formatCatalogFilename({
      canonicalTitle: imported.canonicalTitle,
      materialClass: imported.profile.materialClass,
      contributors: imported.profile.contributors,
      currentFilename,
      ...(imported.profile.carrierEdition.editionType ? { editionType: imported.profile.carrierEdition.editionType } : {}),
      ...(imported.profile.carrierEdition.editionStatement ? { editionStatement: imported.profile.carrierEdition.editionStatement } : {}),
      ...(imported.profile.publication.publisher ? { publisher: imported.profile.publication.publisher } : {}),
      ...(imported.dateStatement ? { dateStatement: imported.dateStatement } : {}),
      ...(imported.profile.publication.publicationDate ? { publicationDate: imported.profile.publication.publicationDate } : {}),
      ...(imported.responsibilityStatement ? { responsibilityStatement: imported.responsibilityStatement } : {}),
      filenameStyle: imported.filenameStyle,
    });'''
if old not in text:
    raise SystemExit('service target not found')
service.write_text(text.replace(old, new, 1), encoding='utf-8')

tests = Path('backend/test/catalog-batch/filename-policy.test.ts')
t = tests.read_text(encoding='utf-8')
t = t.replace('"《蒙古与教廷》（冯承钧译，1994）.pdf"', '"《蒙古与教廷》（伯希和著、冯承钧译，1994）.pdf"')
t = t.replace('"《译本》（甲、乙译，2025）.pdf"', '"《译本》（原作者著、甲、乙译，2025）.pdf"')
marker = '\ntest("filename policy preserves Unicode'
insert = r'''

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
'''
if 'source/version and preserve-original strategies' not in t:
    if marker not in t:
        raise SystemExit('test marker not found')
    t = t.replace(marker, insert + marker, 1)
tests.write_text(t, encoding='utf-8')

service_tests = Path('backend/test/catalog-batch/catalog-batch-service.test.ts')
s = service_tests.read_text(encoding='utf-8')
s = s.replace('《蒙古与教廷》（冯承钧译，1994）.pdf', '《蒙古与教廷》（伯希和著、冯承钧译，1994）.pdf')
service_tests.write_text(s, encoding='utf-8')
