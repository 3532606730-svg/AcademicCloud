import assert from "node:assert/strict";
import { test } from "node:test";

import type { BibliographicProfile } from "../../src/bibliography/bibliography.js";
import { composeCatalogueDisplay, composeCatalogueFilename } from "../../src/library/catalogue-display.js";

function profile(overrides: Partial<BibliographicProfile>): BibliographicProfile {
  return {
    recordId: "record",
    ownerDomainId: "library:library",
    contractVersion: 1,
    materialClass: "scholarly_monograph",
    contributors: [],
    publication: {},
    carrierEdition: {},
    sourceEdition: {},
    revision: 1,
    createdByAccountId: "owner",
    updatedByAccountId: "owner",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    ...overrides,
  };
}

test("modern scholarly display composes author and title with a space without mutating either fact", () => {
  const bibliography = profile({
    materialClass: "scholarly_monograph",
    contributors: [{ id: "c1", label: "杉山正明", role: "author" }],
  });
  const display = composeCatalogueDisplay({ canonicalTitle: "モンゴル帝国の興亡", fallbackDisplayName: "scan.pdf", bibliography });
  assert.equal(display.title, "杉山正明 モンゴル帝国の興亡");
  assert.deepEqual(display.secondaryContributorLabels, []);
  assert.equal(bibliography.contributors[0]?.label, "杉山正明");
});

test("stored volumes distinguish the same historical work before its shared edition identity", () => {
  const titles = ["上", "中", "下"].map((volume) => {
    const bibliography = profile({
      materialClass: "primary_source_modern_edition",
      volume,
      publication: { publisher: "風間書房" },
      carrierEdition: { editionStatement: "原文・ローマ字転写・日本語訳・語学的注釈" },
    });
    const display = composeCatalogueDisplay({ canonicalTitle: "元朝秘史全釈", fallbackDisplayName: "scan.pdf", bibliography });
    assert.equal(display.title, `元朝秘史全釈（${volume}） 風間書房原文・ローマ字転写・日本語訳・語学的注釈`);
    assert.equal(display.editionStatement, "風間書房原文・ローマ字転写・日本語訳・語学的注釈");
    assert.equal(bibliography.volume, volume);
    return display.title;
  });
  assert.equal(new Set(titles).size, 3);
});

test("a supported volume does not require a class or imply an author or a guessed unit", () => {
  for (const materialClass of ["scholarly_monograph", "traditional_book", "unknown", "other"] as const) {
    const bibliography = profile({ materialClass, volume: " 上 ", contributors: [{ id: "c1", label: "作者", role: "author" }] });
    const display = composeCatalogueDisplay({ canonicalTitle: "题名", fallbackDisplayName: "scan.pdf", bibliography });
    assert.equal(display.title, materialClass === "scholarly_monograph" ? "作者 题名（上）" : "题名（上）");
    assert.equal(bibliography.volume, " 上 ", "display normalization never modifies a stored fact");
  }
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "题名", fallbackDisplayName: "scan.pdf", bibliography: profile({ volume: " " }) }).title, "题名");
  assert.equal(composeCatalogueDisplay({ canonicalTitle: null, fallbackDisplayName: "original.pdf", bibliography: profile({ volume: "上" }) }).title, "original.pdf");
});

test("container volumes remain bibliographic facts without becoming article or chapter title parts", () => {
  const canonicalTitle = "The Mongols: Ecological and Social Perspectives";
  for (const materialClass of ["journal_article", "book_chapter", "conference_paper", "review"] as const) {
    const bibliography = profile({
      materialClass,
      volume: "46",
      contributors: [{ id: "author", label: "Joseph F. Fletcher", role: "author" }],
    });
    const display = composeCatalogueDisplay({ canonicalTitle, fallbackDisplayName: "scan.pdf", bibliography });
    assert.equal(display.title, `Joseph F. Fletcher ${canonicalTitle}`, materialClass);
    assert.equal(composeCatalogueFilename(display.title, "scan.pdf"), `Joseph F. Fletcher ${canonicalTitle}.pdf`, materialClass);
    assert.equal(bibliography.volume, "46", "container volume stays available to metadata and citation projection");
  }
});

test("volume deduplication recognizes only an exact delimited terminal title component", () => {
  for (const canonicalTitle of ["题名（上）", "题名(上)", "题名[ 上 ]", "题名【上】", "题名 上"]) {
    assert.equal(composeCatalogueDisplay({ canonicalTitle, fallbackDisplayName: "scan.pdf", bibliography: profile({ volume: "上" }) }).title, canonicalTitle);
  }
  for (const canonicalTitle of ["世上", "题名（上篇）", "上部题名", "题名（下）"]) {
    assert.equal(composeCatalogueDisplay({ canonicalTitle, fallbackDisplayName: "scan.pdf", bibliography: profile({ volume: "上" }) }).title, `${canonicalTitle}（上）`);
  }
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "某书", fallbackDisplayName: "scan.pdf", bibliography: profile({ volume: "第二册" }) }).title, "某书（第二册）");
});

test("modern edited and traditional-source displays keep carrier and source facts distinct", () => {
  const modern = composeCatalogueDisplay({
    canonicalTitle: "元史",
    fallbackDisplayName: "yuan-shi.pdf",
    bibliography: profile({
      materialClass: "primary_source_modern_edition",
      contributors: [{ id: "c2", label: "顾颉刚", role: "annotator", roleLabel: "点校" }],
      publication: { publisher: "中华书局", publicationDate: "1976" },
      carrierEdition: { editionType: "annotated_edition" },
      sourceEdition: {},
    }),
  });
  assert.equal(modern.title, "元史 中华书局1976点校本");
  assert.deepEqual(modern.secondaryContributorLabels, ["顾颉刚"]);

  const explicitModern = composeCatalogueDisplay({
    canonicalTitle: "元史",
    fallbackDisplayName: "yuan-shi.pdf",
    bibliography: profile({
      materialClass: "primary_source_modern_edition",
      contributors: [{ id: "c3", label: "顾颉刚", role: "annotator", roleLabel: "点校" }],
      publication: { publisher: "中华书局", publicationDate: "1976" },
      carrierEdition: { editionStatement: "1976年点校本" },
      sourceEdition: {},
    }),
  });
  assert.equal(explicitModern.title, "元史 中华书局1976年点校本");

  const traditional = composeCatalogueDisplay({
    canonicalTitle: "某书",
    fallbackDisplayName: "old.pdf",
    bibliography: profile({
      materialClass: "traditional_book",
      sourceEdition: { dynasty: "明", reignTitle: "万历", reignYear: "二十四", printingPlace: "金陵", imprint: "唐氏", editionType: "recut" },
    }),
  });
  assert.equal(traditional.title, "某书 明万历二十四年金陵唐氏重刻本");

  const facsimile = composeCatalogueDisplay({
    canonicalTitle: "某书",
    fallbackDisplayName: "facsimile.pdf",
    bibliography: profile({
      materialClass: "primary_source_modern_edition",
      publication: { publisher: "某出版社" },
      carrierEdition: { editionType: "facsimile" },
      sourceEdition: { dynasty: "清", reignTitle: "乾隆", reignYear: "十年", editionType: "engraved" },
    }),
  });
  assert.equal(facsimile.title, "某书 某出版社影印清乾隆十年刻本");

  const explicitFacsimile = composeCatalogueDisplay({
    canonicalTitle: "某书",
    fallbackDisplayName: "facsimile.pdf",
    bibliography: profile({
      materialClass: "primary_source_modern_edition",
      publication: { publisher: "某出版社" },
      carrierEdition: { facsimileStatement: "某出版社影印" },
      sourceEdition: { editionStatement: "清乾隆十年刻本" },
    }),
  });
  assert.equal(explicitFacsimile.title, "某书 某出版社影印清乾隆十年刻本");
});

test("secondary contributors use structured authorship and deduplicate without parsing the title", () => {
  const bibliography = profile({ contributors: [
    { id: "author", label: "Author", role: "author" },
    { id: "author-editor", label: "Author", role: "editor" },
    { id: "editor", label: "Editor", role: "editor" },
    { id: "same-editor", label: " Editor ", role: "translator" },
  ] });
  const modern = composeCatalogueDisplay({ canonicalTitle: "Editor in the title", fallbackDisplayName: "Author.pdf", bibliography });
  assert.equal(modern.title, "Author Editor in the title");
  assert.deepEqual(modern.contributorLabels, ["Author", "Editor"]);
  assert.deepEqual(modern.secondaryContributorLabels, ["Editor"], "a title substring never implies an authorship fact");
  const unnamed = composeCatalogueDisplay({ canonicalTitle: null, fallbackDisplayName: "Author.pdf", bibliography });
  assert.deepEqual(unnamed.secondaryContributorLabels, ["Author", "Editor"], "filename fallback does not suppress contributors");
  const unknown = composeCatalogueDisplay({ canonicalTitle: "Author in the title", fallbackDisplayName: "scan.pdf", bibliography: { ...bibliography, materialClass: "unknown" } });
  assert.deepEqual(unknown.secondaryContributorLabels, ["Author", "Editor"]);
});

test("display falls back safely and never invents missing edition placeholders", () => {
  assert.equal(composeCatalogueDisplay({ canonicalTitle: null, fallbackDisplayName: "safe.pdf", bibliography: null }).title, "safe.pdf");
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "已有题名", fallbackDisplayName: "safe.pdf", bibliography: profile({ materialClass: "traditional_book" }) }).title, "已有题名");
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "已有题名", fallbackDisplayName: "safe.pdf", legacyAuthorLabels: ["人物字段"], bibliography: null }).title, "已有题名");
  assert.equal(composeCatalogueDisplay({
    canonicalTitle: "已有题名",
    fallbackDisplayName: "safe.pdf",
    bibliography: profile({ materialClass: "unknown", contributors: [{ id: "c1", label: "人物字段", role: "author" }] }),
  }).title, "已有题名");
});

test("historical display never treats a generic person field as modern authorship", () => {
  const historical = composeCatalogueDisplay({
    canonicalTitle: "元朝秘史",
    fallbackDisplayName: "source.pdf",
    bibliography: profile({
      materialClass: "primary_source_modern_edition",
      contributors: [{ id: "c1", label: "亦邻真", role: "author" }],
      publication: {},
      carrierEdition: {},
      sourceEdition: {},
    }),
  });
  assert.equal(historical.title, "元朝秘史");
  assert.equal(historical.title.includes("亦邻真"), false);
});

test("volume and general editorial responsibilities never manufacture edition statements", () => {
  for (const roleLabel of ["本卷主编", "本卷副主编", "Hrsg.", "Edited by"]) {
    const bibliography = profile({
      materialClass: "primary_source_modern_edition",
      volume: "某地区 下册",
      publication: { publisher: "示例出版社", publicationDate: "2000" },
      contributors: [{ id: "editor", label: "编辑甲", role: "editor", roleLabel }],
    });
    const before = structuredClone(bibliography);
    const display = composeCatalogueDisplay({ canonicalTitle: "史料集成", fallbackDisplayName: "scan.pdf", bibliography });
    assert.equal(display.title, "史料集成（某地区 下册） 示例出版社2000");
    assert.deepEqual(display.secondaryContributorLabels, ["编辑甲"]);
    assert.deepEqual(bibliography, before, "source responsibility is preserved");
  }
});

test("partial translation credits do not label the entire carrier as a translation or annotated edition", () => {
  const bibliography = profile({
    materialClass: "primary_source_modern_edition",
    contributors: [{ id: "translator", label: "译者甲", role: "translator", roleLabel: "英文摘要和目录翻译" }],
    publication: { publisher: "示例出版社" },
  });
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "史料", fallbackDisplayName: "scan.pdf", bibliography }).title, "史料 示例出版社");
  for (const roleLabel of ["constructor", "__proto__"]) {
    bibliography.contributors[0]!.roleLabel = roleLabel;
    assert.equal(composeCatalogueDisplay({ canonicalTitle: "史料", fallbackDisplayName: "scan.pdf", bibliography }).title, "史料 示例出版社");
  }
  bibliography.contributors[0]!.roleLabel = "翻译";
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "史料", fallbackDisplayName: "scan.pdf", bibliography }).title, "史料 示例出版社译本");
  delete bibliography.contributors[0]!.roleLabel;
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "史料", fallbackDisplayName: "scan.pdf", bibliography }).title, "史料 示例出版社译本");
});

test("catalogue download filenames preserve only the authorized extension", () => {
  assert.equal(composeCatalogueFilename("杉山正明 モンゴル帝国の興亡", "scan.pdf"), "杉山正明 モンゴル帝国の興亡.pdf");
  assert.equal(composeCatalogueFilename("元朝秘史 明万历刻本.pdf", "scan.pdf"), "元朝秘史 明万历刻本.pdf");
  assert.equal(composeCatalogueFilename("元朝秘史", "source.bad-extension-too-long"), "元朝秘史");
  const bounded = composeCatalogueFilename(`${"史".repeat(248)}📚附录`, "scan.pdf");
  assert.equal(bounded.length, 255);
  assert.equal(bounded.endsWith(".pdf"), true);
  assert.equal(new TextDecoder().decode(new TextEncoder().encode(bounded)), bounded);
});

test("download truncation retains early volume distinctions before long edition descriptions", () => {
  const filenames = ["上", "中", "下"].map((volume) => {
    const display = composeCatalogueDisplay({
      canonicalTitle: "元朝秘史全釈",
      fallbackDisplayName: "original.pdf",
      bibliography: profile({
        materialClass: "primary_source_modern_edition",
        volume,
        carrierEdition: { editionStatement: `版${"📚".repeat(200)}` },
      }),
    });
    const filename = composeCatalogueFilename(display.title, "original.pdf");
    assert.ok(filename.startsWith(`元朝秘史全釈（${volume}） `));
    assert.ok(filename.length <= 255);
    assert.ok(filename.endsWith(".pdf"));
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(filename)), filename, "no surrogate pair is split");
    return filename;
  });
  assert.equal(new Set(filenames).size, 3);
});
