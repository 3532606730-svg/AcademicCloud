import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { CITATION_STYLES, type NormalizedCslItem } from "../../src/citation/citation.js";
import { renderCitation } from "../../src/citation/processor.js";
import { citationStyleDescriptor, citationStyleXml, expectedCitationStyleHash } from "../../src/citation/styles.js";

const MODERN: NormalizedCslItem = {
  id: "modern",
  type: "book",
  title: "Interior Chinatown",
  "title-short": "Interior Chinatown",
  author: [{ family: "Yu", given: "Charles" }],
  publisher: "Pantheon Books",
  issued: { "date-parts": [[2020]] },
  genre: "M",
};

const TRADITIONAL: NormalizedCslItem = {
  id: "traditional",
  type: "classic",
  title: "六经奥论",
  "title-short": "六经奥论",
  author: [{ literal: "郑樵" }],
  publisher: "中华书局",
  "publisher-place": "北京",
  issued: { "date-parts": [[2009]] },
  edition: "影印本",
  "original-title": "据明万历二十四年金陵唐氏重刻本",
  note: "阮元校刻",
  genre: "M",
};

const JOURNAL: NormalizedCslItem = {
  id: "journal", type: "article-journal",
  title: "The Mongols: Ecological and Social Perspectives",
  "title-short": "The Mongols: Ecological and Social Perspectives",
  author: [{ family: "Fletcher", given: "Joseph" }],
  "container-title": "Harvard Journal of Asiatic Studies",
  volume: "46", issue: "1", page: "11–50",
  issued: { "date-parts": [[1986, 6]] }, language: "en", genre: "J",
};

test("Chicago Notes and Bibliography emits deterministic full note, short note, and bibliography", () => {
  const result = renderCitation("chicago-notes-bibliography", MODERN, [{ type: "page", value: "45" }]);
  assert.equal(result.outputs.fullNote, "Charles Yu, Interior Chinatown (Pantheon Books, 2020), 45.");
  assert.equal(result.outputs.shortNote, "Yu, Interior Chinatown, 45.");
  assert.equal(result.outputs.bibliography, "Yu, Charles. Interior Chinatown. Pantheon Books. 2020.");
  assert.equal(result.style.supportsShortNote, true);
});

test("历史研究 emits source-faithful traditional-edition notes and structured historical locators", () => {
  const result = renderCitation("lishi-yanjiu", TRADITIONAL, [
    { type: "juan", value: "五" },
    { type: "fascicle", value: "二" },
    { type: "folio", value: "8", side: "recto" },
    { type: "line", value: "12" },
    { type: "archive_call_number", value: "甲-12" },
    { type: "custom", label: "函", value: "三" },
  ]);
  assert.equal(
    result.outputs.fullNote,
    "郑樵：《六经奥论》，影印本，据明万历二十四年金陵唐氏重刻本，阮元校刻，北京：中华书局，2009，卷五，第二册，第8a叶，第12行，档号甲-12，函三。",
  );
  assert.equal(result.outputs.shortNote, "郑樵，《六经奥论》，卷五，第二册，第8a叶，第12行，档号甲-12，函三。");
  assert.match(result.outputs.bibliography, /明万历二十四年金陵唐氏重刻本/u);
});

test("文史哲 and current GB/T 7714—2025 representative outputs remain distinct and deterministic", () => {
  const wenshizhe = renderCitation("wenshizhe", TRADITIONAL, [{ type: "page_range", value: "8a–9b" }]);
  assert.equal(wenshizhe.outputs.fullNote, "郑樵：《六经奥论》，影印本，据明万历二十四年金陵唐氏重刻本，阮元校刻，北京：中华书局，2009，第8a–9b页。");
  assert.equal(wenshizhe.outputs.shortNote, "郑樵，《六经奥论》，第8a–9b页。");

  const gbt = renderCitation("gb-t-7714-2025", MODERN, [{ type: "page", value: "45" }]);
  assert.equal(gbt.outputs.citation, "[1]：第45页");
  assert.equal(gbt.outputs.fullNote, null);
  assert.equal(gbt.outputs.shortNote, null);
  assert.equal(gbt.outputs.bibliography, "[1] Yu, Charles. Interior Chinatown[M]. Pantheon Books. 2020.");
  assert.match(gbt.style.sourceRevision, /effective 2026-07-01/u);
});

test("all four style definitions are offline-pinned by exact revision and SHA-256", () => {
  for (const id of CITATION_STYLES) {
    const actual = createHash("sha256").update(citationStyleXml(id)).digest("hex");
    assert.equal(actual, expectedCitationStyleHash(id));
    const descriptor = citationStyleDescriptor(id, "test-processor");
    assert.equal(descriptor.sha256, actual);
    assert.equal(descriptor.verifiedAt, "2026-10-07");
    assert.equal(descriptor.revision, "academiccloud-2026-10-07.1");
    assert.match(descriptor.source, /^https:\/\//u);
  }
});

test("Chicago journal notes render container and issue, while pinpoint changes never replace the bibliography extent", () => {
  const original = structuredClone(JOURNAL);
  const full = renderCitation("chicago-notes-bibliography", JOURNAL, []);
  const beginning = "Joseph Fletcher, “The Mongols: Ecological and Social Perspectives,” Harvard Journal of Asiatic Studies 46, no. 1 (1986): ";
  assert.equal(full.outputs.fullNote, `${beginning}11–50.`);
  assert.equal(full.outputs.bibliography, "Fletcher, Joseph. “The Mongols: Ecological and Social Perspectives.” Harvard Journal of Asiatic Studies 46, no. 1 (1986): 11–50.");
  const pinpoint = renderCitation("chicago-notes-bibliography", JOURNAL, [{ type: "page", value: "23" }]);
  assert.equal(pinpoint.outputs.fullNote, `${beginning}23.`);
  assert.equal(pinpoint.outputs.shortNote, "Fletcher, “The Mongols: Ecological and Social Perspectives,” 23.");
  assert.equal(pinpoint.outputs.bibliography, full.outputs.bibliography);
  assert.equal(renderCitation("chicago-notes-bibliography", JOURNAL, [{ type: "page_range", value: "23–25" }]).outputs.fullNote, `${beginning}23–25.`);
  assert.deepEqual(JOURNAL, original);
});

test("the Chinese journal styles use their reviewed English article forms and preserve complete bibliography pages", () => {
  const lishi = renderCitation("lishi-yanjiu", JOURNAL, []);
  const beginning = "Joseph Fletcher, “The Mongols: Ecological and Social Perspectives,” Harvard Journal of Asiatic Studies, vol. 46, no. 1 (1986), ";
  assert.equal(lishi.outputs.fullNote, `${beginning}pp. 11–50.`);
  assert.equal(lishi.outputs.bibliography, lishi.outputs.fullNote);
  const pinpoint = renderCitation("lishi-yanjiu", JOURNAL, [{ type: "page", value: "23" }]);
  assert.equal(pinpoint.outputs.fullNote, `${beginning}p. 23.`);
  assert.equal(pinpoint.outputs.bibliography, lishi.outputs.bibliography);
  assert.equal(renderCitation("lishi-yanjiu", JOURNAL, [{ type: "page_range", value: "23–25" }]).outputs.fullNote, `${beginning}pp. 23–25.`);
  for (const locators of [[], [{ type: "page" as const, value: "23" }]]) {
    assert.deepEqual(renderCitation("wenshizhe", JOURNAL, locators).outputs, renderCitation("chicago-notes-bibliography", JOURNAL, locators).outputs);
  }
});

test("Chinese-language journal notes retain volume, issue, date and article pages without fabricated labels", () => {
  const item: NormalizedCslItem = { ...JOURNAL, title: "蒙古史研究", "title-short": "蒙古史研究", author: [{ literal: "张三" }], "container-title": "历史学刊", language: "zh-CN" };
  for (const style of ["lishi-yanjiu", "wenshizhe"] as const) {
    const result = renderCitation(style, item, []);
    assert.equal(result.outputs.fullNote, "张三：《蒙古史研究》，《历史学刊》第46卷第1期，1986年，第11–50页。");
    assert.equal(result.outputs.bibliography, result.outputs.fullNote);
    const pinpoint = renderCitation(style, item, [{ type: "page", value: "23" }]);
    assert.equal(pinpoint.outputs.fullNote, "张三：《蒙古史研究》，《历史学刊》第46卷第1期，1986年，第23页。");
    assert.equal(pinpoint.outputs.bibliography, result.outputs.bibliography);
    const noVolume = { ...item, volume: undefined };
    assert.equal(renderCitation(style, noVolume, []).outputs.fullNote, "张三：《蒙古史研究》，《历史学刊》1986年第1期，第11–50页。");
  }
});

test("English journal author lists and single-page labels follow the selected style", () => {
  const item: NormalizedCslItem = { ...JOURNAL, author: [{ family: "Smith", given: "Ann" }, { family: "Jones", given: "Bob" }], page: "23" };
  for (const style of ["chicago-notes-bibliography", "lishi-yanjiu", "wenshizhe"] as const) {
    const result = renderCitation(style, item, []);
    assert.match(result.outputs.fullNote!, /^Ann Smith and Bob Jones, /u);
    assert.match(result.outputs.shortNote!, /^Smith and Jones, /u);
    assert.doesNotMatch(result.outputs.bibliography, /、/u);
    if (style === "lishi-yanjiu") {
      assert.match(result.outputs.fullNote!, /, p\. 23\.$/u);
      assert.equal(result.outputs.bibliography, result.outputs.fullNote);
    } else {
      assert.match(result.outputs.bibliography, /^Smith, Ann, and Bob Jones\. /u);
    }
  }
});

test("GB/T journal bibliography retains journal-year-volume-issue-pages independently of citation pinpoint", () => {
  const expected = "[1] Fletcher, Joseph. The Mongols: Ecological and Social Perspectives[J]. Harvard Journal of Asiatic Studies, 1986, 46(1): 11–50.";
  const whole = renderCitation("gb-t-7714-2025", JOURNAL, []);
  assert.equal(whole.outputs.bibliography, expected);
  const pinpoint = renderCitation("gb-t-7714-2025", JOURNAL, [{ type: "page", value: "23" }]);
  assert.equal(pinpoint.outputs.citation, "[1]：第23页");
  assert.equal(pinpoint.outputs.bibliography, expected);
});

test("journal citations omit unavailable facts without substituting invented journal metadata", () => {
  const partial: NormalizedCslItem = { id: "partial", type: "article-journal", title: "A partial article", "title-short": "A partial article", author: [{ literal: "Author" }], language: "en" };
  for (const style of CITATION_STYLES) {
    const result = renderCitation(style, partial, []);
    assert.match(result.outputs.bibliography, /A partial article/u);
    assert.doesNotMatch(result.outputs.bibliography, /undefined|null|\(\)|no\.|vol\.|pp\.|Harvard|1986|11–50/u);
  }
});
