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
    assert.equal(descriptor.verifiedAt, "2026-08-22");
    assert.match(descriptor.source, /^https:\/\//u);
  }
});
