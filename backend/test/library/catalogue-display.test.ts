import assert from "node:assert/strict";
import { test } from "node:test";

import type { BibliographicProfile } from "../../src/bibliography/bibliography.js";
import { composeCatalogueDisplay } from "../../src/library/catalogue-display.js";

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

test("display falls back safely and never invents missing edition placeholders", () => {
  assert.equal(composeCatalogueDisplay({ canonicalTitle: null, fallbackDisplayName: "safe.pdf", bibliography: null }).title, "safe.pdf");
  assert.equal(composeCatalogueDisplay({ canonicalTitle: "已有题名", fallbackDisplayName: "safe.pdf", bibliography: profile({ materialClass: "traditional_book" }) }).title, "已有题名");
});
