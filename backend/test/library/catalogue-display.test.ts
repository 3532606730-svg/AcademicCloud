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

test("catalogue download filenames preserve only the authorized extension", () => {
  assert.equal(composeCatalogueFilename("杉山正明 モンゴル帝国の興亡", "scan.pdf"), "杉山正明 モンゴル帝国の興亡.pdf");
  assert.equal(composeCatalogueFilename("元朝秘史 明万历刻本.pdf", "scan.pdf"), "元朝秘史 明万历刻本.pdf");
  assert.equal(composeCatalogueFilename("元朝秘史", "source.bad-extension-too-long"), "元朝秘史");
  const bounded = composeCatalogueFilename(`${"史".repeat(248)}📚附录`, "scan.pdf");
  assert.equal(bounded.length, 255);
  assert.equal(bounded.endsWith(".pdf"), true);
  assert.equal(new TextDecoder().decode(new TextEncoder().encode(bounded)), bounded);
});
