import assert from "node:assert/strict";
import { test } from "node:test";

import { extractSuggestions } from "../src/extractor.js";

test("OCR recognition confidence and embedded metadata presence do not bypass evidence usability", () => {
  const result = extractSuggestions({
    pages: [{
      pageIndex: 2,
      text: "ず之 fO v f 107の652 1987",
      evidenceOrigin: "ocr",
      ocrEngine: "academiccloud-paddleocr-test",
      ocrConfidence: 60,
    }],
    embeddedMetadata: { title: "元朝秘史 蒙文", author: "亦郊真" },
    filename: "document.pdf",
    hasUsableTextLayer: false,
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.candidates.map(({ fieldPath, value, sourceType, confidence }) => ({
    fieldPath,
    value,
    sourceType,
    confidence,
  })), [{
    fieldPath: "canonicalTitle",
    value: "元朝秘史 蒙文",
    sourceType: "embedded_pdf_metadata",
    confidence: "low",
  }]);
  assert.equal(result.candidates.some((candidate) => candidate.value === "ず之" || candidate.value === "亦郊真"), false);
  assert.ok(result.candidates.every((candidate) => candidate.rulesetVersion === "rf-frontmatterocr-v2"));
});

test("low-confidence labelled OCR fragments stay unusable even when a label looks bibliographic", () => {
  const result = extractSuggestions({
    pages: [{
      pageIndex: 2,
      text: "题名：ず之",
      evidenceOrigin: "ocr",
      ocrEngine: "academiccloud-paddleocr-test",
      ocrConfidence: 60,
    }],
    embeddedMetadata: {},
    filename: "document.pdf",
    hasUsableTextLayer: false,
  });
  assert.equal(result.status, "no_suggestions");
  assert.equal(result.candidates.length, 0);
});

test("script-neutral OCR evidence admits legitimate scholarly titles across writing systems", () => {
  const titles = [
    "モンゴル帝国史研究",
    "ᠮᠣᠩᠭᠣᠯ ᠤᠯᠤᠰ",
    "История Монголии и Центральной Азии",
    "تاريخ منغوليا وآسيا الوسطى",
    "མོང་གོལ་གྱི་ལོ་རྒྱུས།",
    "Činggis qaγan and Möngke qaɣan",
  ];
  for (const title of titles) {
    const result = extractSuggestions({
      pages: [{
        pageIndex: 1,
        text: title,
        evidenceOrigin: "ocr",
        ocrEngine: "academiccloud-paddleocr-test",
        ocrConfidence: 60,
      }],
      embeddedMetadata: {},
      filename: "document.pdf",
      hasUsableTextLayer: false,
    });
    assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, title, title);
  }
});

test("Chinese title/CIP evidence produces bounded canonical and publication suggestions", () => {
  const result = extractSuggestions({
    pages: [
      { pageIndex: 1, text: "元西域人华化考\n陈垣 著" },
      { pageIndex: 2, text: "图书在版编目（CIP）数据\n出版社：中华书局\n出版时间：2008\nISBN 978-7-101-06428-5\n第一版" },
    ],
    embeddedMetadata: {},
    filename: "yuan-xiyu.pdf",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "元西域人华化考");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "中华书局");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "identifier")?.value, "9787101064285");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.sourcePageIndex, 2);
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "typeField")?.typeFieldName, "editionStatement");
});

test("middle-sliced evidence excerpts remain SQLite-safe after boundary trimming", () => {
  const result = extractSuggestions({
    pages: [{
      pageIndex: 2,
      text: `版权信息 ${"a ".repeat(100)}\n题名：数据库安全题名`,
    }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  const candidate = result.candidates.find((item) => item.value === "数据库安全题名");
  assert.ok(candidate);
  assert.ok(candidate.evidenceExcerpt);
  assert.equal(candidate.evidenceExcerpt, candidate.evidenceExcerpt.trim());
  assert.equal(/[\u0000\u0009\u000a\u000d]/u.test(candidate.evidenceExcerpt), false);
});

test("structured Chinese and English CIP lines preserve title, creator, publication place, publisher, and date precedence", () => {
  const chinese = extractSuggestions({
    pages: [{
      pageIndex: 2,
      text: "图书在版编目（CIP）数据\n元西域人华化考 / 陈垣著. — 北京：中华书局，2008.12\nISBN 978-7-101-06428-5",
    }],
    embeddedMetadata: {},
    filename: "noisy-acquisition.pdf",
  });
  assert.equal(chinese.status, "ready");
  assert.equal(chinese.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "元西域人华化考");
  assert.equal(chinese.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "陈垣");
  assert.equal(chinese.candidates.find((candidate) => candidate.authorityRole === "publication_place")?.value, "北京");
  assert.equal(chinese.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "中华书局");
  assert.equal(chinese.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.value, "2008.12");

  const english = extractSuggestions({
    pages: [{
      pageIndex: 2,
      text: "Library of Congress Cataloging-in-Publication Data\nJackson, Peter.\nThe Mongols and the West, 1221–1410 / Peter Jackson. — New York : Routledge, 2018.\nISBN 978-0-415-15271-6",
    }],
    embeddedMetadata: {},
    filename: "noisy-acquisition.pdf",
  });
  assert.equal(english.status, "ready");
  assert.equal(english.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "The Mongols and the West, 1221–1410");
  assert.equal(english.candidates.filter((candidate) => candidate.authorityRole === "author").map((candidate) => candidate.value).join("|"), "Peter Jackson");
  assert.equal(english.candidates.find((candidate) => candidate.authorityRole === "publication_place")?.value, "New York");
  assert.equal(english.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "Routledge");
  assert.equal(english.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.value, "2018");
});

test("labeled titles, Chinese author suffixes, and ISBN filename cleanup do not create duplicate or noisy facts", () => {
  const labeled = extractSuggestions({
    pages: [{ pageIndex: 1, text: "题名：元西域人华化考\n陈垣 著" }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  assert.equal(labeled.status, "ready");
  assert.deepEqual(labeled.candidates.filter((candidate) => candidate.fieldPath === "canonicalTitle").map((candidate) => candidate.value), ["元西域人华化考"]);
  assert.equal(labeled.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "陈垣");

  const filename = extractSuggestions({
    pages: [{ pageIndex: 8, text: "This ordinary body page contains enough words to remain ordinary and does not provide a title or publication fact." }],
    embeddedMetadata: {},
    filename: "The Book ISBN 978-7-101-06428-5.pdf",
  });
  assert.equal(filename.status, "ready");
  assert.equal(filename.candidates.find((candidate) => candidate.sourceType === "filename")?.value, "The Book");
});

test("English title-page identity outranks embedded metadata while copyright facts use publication precedence", () => {
  const result = extractSuggestions({
    pages: [
      { pageIndex: 1, text: "The Mongols and the West, 1221–1410\nby\nPeter Jackson" },
      { pageIndex: 2, text: "Copyright 2018 Routledge\nFirst published 2018\nISBN 978-0-415-15271-6" },
    ],
    embeddedMetadata: { title: "Scanned collection title", author: "Unknown" },
    filename: "jackson.pdf",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "The Mongols and the West, 1221–1410");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "Peter Jackson");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "Routledge");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.sourceType, "title_page");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.sourcePageIndex, 2);
});

test("older title-page publication statements are accepted without a copyright page", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 1, text: "A History of Ancient Rome\nby Mary Beard\nOxford University Press\nOxford 1998" }],
    embeddedMetadata: {},
    filename: "old-book.pdf",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "A History of Ancient Rome");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "Mary Beard");
});

test("conflicting same-rank title evidence is surfaced, ordinary body cues are ignored, and filename remains weakest", () => {
  const conflict = extractSuggestions({
    pages: [
      { pageIndex: 1, text: "First title" },
      { pageIndex: 2, text: "Second title" },
    ],
    embeddedMetadata: {},
    filename: "Acquisition title [Z-Library] 0123456789abcdef.pdf",
  });
  assert.equal(conflict.status, "ambiguous");
  const body = extractSuggestions({
    pages: [{ pageIndex: 8, text: "The body discusses ISBN 978-7-101-06428-5 and publisher history." }],
    embeddedMetadata: {},
    filename: "Clean Acquisition Title - Anna's Archive abcdef0123456789.pdf",
  });
  assert.equal(body.candidates.some((candidate) => candidate.fieldPath === "identifier"), false);
  assert.equal(body.candidates.some((candidate) => candidate.sourceType === "filename"), true);
  assert.equal(body.candidates.find((candidate) => candidate.sourceType === "filename")?.confidence, "low");
});

test("image-only input returns OCR deferred and does not invent a filename fact", () => {
  const result = extractSuggestions({ pages: [{ pageIndex: 1, text: "" }], embeddedMetadata: {}, filename: "scan-001.pdf" });
  assert.equal(result.status, "ocr_deferred");
  assert.deepEqual(result.candidates, []);
});

test("structured Chinese filename remains independent evidence with separate title, author, publisher, and year", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 9, text: "" }],
    embeddedMetadata: {},
    filename: "张帆《元代宰相制度研究》（北京大学出版社1997）.pdf",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "元代宰相制度研究");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "张帆");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "北京大学出版社");
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.value, "1997");
  assert.equal(result.candidates.some((candidate) => candidate.fieldPath === "canonicalTitle" && candidate.value.includes("张帆")), false);
});

test("numeric-only page text is not treated as a usable text layer", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 3, text: "12345" }],
    embeddedMetadata: {},
    filename: "scan-12345.pdf",
  });
  assert.equal(result.status, "ocr_deferred");
  assert.deepEqual(result.candidates, []);
});

test("front-matter classification stays conservative while admitting common p3/p4 title pages", () => {
  const titlePage = extractSuggestions({
    pages: [{ pageIndex: 3, text: "The Mongols and the West, 1221–1410\nby\nPeter Jackson" }],
    embeddedMetadata: {},
    filename: "acquisition.pdf",
  });
  assert.equal(titlePage.status, "ready");
  assert.equal(titlePage.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.sourcePageIndex, 3);
  assert.equal(titlePage.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "Peter Jackson");

  const labels = extractSuggestions({
    pages: [{ pageIndex: 2, text: "责任编辑：李明\n印次：第 3 次印刷" }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  assert.equal(labels.candidates.some((candidate) => candidate.fieldPath === "canonicalTitle" && candidate.value !== "fallback"), false);
  assert.equal(labels.candidates.find((candidate) => candidate.authorityRole === "editor")?.value, "李明");
  assert.equal(labels.candidates.find((candidate) => candidate.fieldPath === "typeField")?.typeFieldName, "editionStatement");
  assert.equal(labels.candidates.every((candidate) => candidate.pageClass !== "series_page"), true);
});

test("bare English title-page names are admitted only in the bounded front-matter shape", () => {
  for (const authorLine of ["Peter Jackson", "Jackson, Peter"]) {
    const result = extractSuggestions({
      pages: [{ pageIndex: 3, text: `The Mongols and the West, 1221–1410\n${authorLine}` }],
      embeddedMetadata: {},
      filename: "fallback.pdf",
    });
    assert.equal(result.status, "ready", authorLine);
    assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "The Mongols and the West, 1221–1410");
    assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "Peter Jackson", authorLine);
  }
});

test("bare names beside metadata labels cannot become invented titles", () => {
  for (const text of ["Copyright\nJohn Smith", "Publisher\nJohn Smith", "ISBN\nJohn Smith", "责任编辑：李明\nJohn Smith"]) {
    const result = extractSuggestions({
      pages: [{ pageIndex: 2, text }],
      embeddedMetadata: {},
      filename: "fallback.pdf",
    });
    assert.equal(result.candidates.some((candidate) => candidate.fieldPath === "canonicalTitle" && candidate.value === "John Smith"), false, text);
  }
});

test("author markers stay evidence labels rather than canonical titles or names", () => {
  for (const { text, author } of [
    { text: "By\nJohn Smith", author: "John Smith" },
    { text: "作者\n陈垣", author: "陈垣" },
    { text: "Author\nJohn Smith", author: "John Smith" },
    { text: "Author: John Smith", author: "John Smith" },
  ]) {
    const result = extractSuggestions({ pages: [{ pageIndex: 2, text }], embeddedMetadata: {}, filename: "fallback.pdf" });
    assert.equal(result.candidates.some((candidate) => candidate.fieldPath === "canonicalTitle"), false, text);
    assert.deepEqual(result.candidates.filter((candidate) => candidate.authorityRole === "author").map((candidate) => candidate.value), [author], text);
  }
});

test("Chinese publication label splits place and publisher without a composite institution value", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 2, text: "版权页\n出版发行：北京：中华书局\n出版时间：2008" }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publication_place")?.value, "北京");
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "中华书局");
  assert.equal(result.candidates.some((candidate) => candidate.authorityRole === "publisher" && candidate.value.includes("北京：")), false);
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.value, "2008");
});

test("ordinary body prose containing bibliographic words is never treated as a copyright page", () => {
  const result = extractSuggestions({
    pages: [{
      pageIndex: 8,
      text: "This ordinary body page discusses copyright and publisher history in a long paragraph with many words and ISBN 978-7-101-06428-5.",
    }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  assert.equal(result.status, "no_suggestions");
  assert.deepEqual(result.candidates, []);
});

test("CIP author-heading prefixes are not folded into the canonical title", () => {
  const result = extractSuggestions({
    pages: [{
      pageIndex: 2,
      text: "图书在版编目（CIP）数据\n陈垣. 元史西域人华化考 / 陈垣著. — 北京：中华书局，2008.",
    }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "元史西域人华化考");
});

test("generic embedded placeholders do not outrank or invent bibliographic facts", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 8, text: "A body page with no front-matter evidence." }],
    embeddedMetadata: { title: "Untitled", author: "Unknown" },
    filename: "document.pdf",
  });
  assert.equal(result.status, "no_suggestions");
  assert.deepEqual(result.candidates, []);
});

test("imprint and publication-only front matter cannot become a canonical title", () => {
  for (const text of ["Oxford University Press", "中华书局", "Routledge", "First published 2018", "第3版"]) {
    const result = extractSuggestions({
      pages: [{ pageIndex: 1, text }],
      embeddedMetadata: {},
      filename: "fallback.pdf",
    });
    assert.equal(result.candidates.some((candidate) => candidate.fieldPath === "canonicalTitle"), false, text);
  }
});

test("multiple embedded authors remain separate complementary candidates rather than a conflict", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 1, text: "" }],
    embeddedMetadata: { title: "The Mongols and the West, 1221–1410", author: "Peter Jackson; David Morgan" },
    filename: "multi-author.pdf",
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.candidates.filter((candidate) => candidate.authorityRole === "author").map((candidate) => candidate.value),
    ["David Morgan", "Peter Jackson"],
  );
  assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle")?.value, "The Mongols and the West, 1221–1410");
});

test("a Chinese publication label never becomes a spurious publication place", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 2, text: "版权页\n出版发行：北京：北京大学出版社\n出版时间：1997" }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  assert.deepEqual(
    result.candidates.filter((candidate) => candidate.authorityRole === "publication_place").map((candidate) => candidate.value),
    ["北京"],
  );
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value, "北京大学出版社");
});

test("an explicit-label title page after page 4 is still classified as a title page", () => {
  const result = extractSuggestions({
    pages: [{ pageIndex: 6, text: "题名：元代宰相制度研究\n作者：张帆" }],
    embeddedMetadata: {},
    filename: "fallback.pdf",
  });
  const title = result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle");
  assert.equal(result.status, "ready");
  assert.equal(title?.value, "元代宰相制度研究");
  assert.equal(title?.sourceType, "title_page");
  assert.equal(title?.sourcePageIndex, 6);
  assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "author")?.value, "张帆");
});
