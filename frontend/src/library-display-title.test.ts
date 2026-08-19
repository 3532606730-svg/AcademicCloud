import { describe, expect, it } from "vitest";

import { composeLibraryDisplayTitle } from "./library-display-title.ts";

describe("ordinary Library catalogue display titles", () => {
  it("composes one author and the canonical title without changing either fact", () => {
    const input = {
      canonicalTitle: "疾驰的草原征服者",
      authorLabels: ["杉山正明"],
      fallbackDisplayName: "scan-001.pdf",
    };

    expect(composeLibraryDisplayTitle(input, "zh-CN")).toBe("杉山正明 · 疾驰的草原征服者");
    expect(input.canonicalTitle).toBe("疾驰的草原征服者");
    expect(input.authorLabels).toEqual(["杉山正明"]);
  });

  it("preserves author order and uses locale-appropriate separators", () => {
    const input = {
      canonicalTitle: "书名",
      authorLabels: ["作者甲", "作者乙"],
      fallbackDisplayName: "book.pdf",
    };

    expect(composeLibraryDisplayTitle(input, "zh-CN")).toBe("作者甲、作者乙 · 书名");
    expect(composeLibraryDisplayTitle(input, "en")).toBe("作者甲, 作者乙 · 书名");
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
});
