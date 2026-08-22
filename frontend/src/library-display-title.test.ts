import { describe, expect, it } from "vitest";

import { composeLibraryDisplayTitle } from "./library-display-title.ts";

describe("ordinary Library catalogue display titles", () => {
  it("composes one author and the canonical title without changing either fact", () => {
    const input = {
      canonicalTitle: "疾驰的草原征服者",
      authorLabels: ["杉山正明"],
      fallbackDisplayName: "scan-001.pdf",
    };

    expect(composeLibraryDisplayTitle(input, "zh-CN")).toBe("杉山正明 疾驰的草原征服者");
    expect(input.canonicalTitle).toBe("疾驰的草原征服者");
    expect(input.authorLabels).toEqual(["杉山正明"]);
  });

  it("preserves author order and uses the scholarly space composition", () => {
    const input = {
      canonicalTitle: "书名",
      authorLabels: ["作者甲", "作者乙"],
      fallbackDisplayName: "book.pdf",
    };

    expect(composeLibraryDisplayTitle(input, "zh-CN")).toBe("作者甲、作者乙 书名");
    expect(composeLibraryDisplayTitle(input, "en")).toBe("作者甲、作者乙 书名");
  });

  it("uses the canonical title alone when no author is linked", () => {
    expect(composeLibraryDisplayTitle({
      canonicalTitle: "疾驰的草原征服者",
      authorLabels: [],
      fallbackDisplayName: "scan-001.pdf",
    }, "zh-CN")).toBe("疾驰的草原征服者");
  });

  it("falls back to the file display name when canonical metadata is absent", () => {
    expect(composeLibraryDisplayTitle({
      canonicalTitle: null,
      authorLabels: ["杉山正明"],
      fallbackDisplayName: "book.pdf",
    }, "zh-CN")).toBe("book.pdf");
  });

  it("prefers the server-composed scholarly label and can compose an edition fallback", () => {
    expect(composeLibraryDisplayTitle({
      canonicalTitle: "元史",
      authorLabels: ["不应前置"],
      catalogueDisplayTitle: "元史 中华书局1976年点校本",
      fallbackDisplayName: "yuan.pdf",
    }, "zh-CN")).toBe("元史 中华书局1976年点校本");
    expect(composeLibraryDisplayTitle({
      canonicalTitle: "某书",
      editionStatement: "明万历二十四年金陵唐氏重刻本",
      fallbackDisplayName: "old.pdf",
    }, "zh-CN")).toBe("某书 明万历二十四年金陵唐氏重刻本");
  });
});
