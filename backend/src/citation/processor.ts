import CSL from "citeproc";

import type { CitationLocator, CitationResult, CitationStyleId, NormalizedCslItem } from "./citation.js";
import { CitationError } from "./citation.js";
import { citationStyleDescriptor, citationStyleXml } from "./styles.js";

const MINIMAL_LOCALE = `<?xml version="1.0" encoding="utf-8"?>
<locale xmlns="http://purl.org/net/xbiblio/csl" xml:lang="en-US">
  <style-options punctuation-in-quote="false"/>
  <dates><date form="text"><date-part name="year"/></date><date form="numeric"><date-part name="year"/></date></dates>
  <terms><term name="and">and</term><term name="et-al">et al.</term><term name="no date">n.d.</term><term name="page">page</term><term name="page" form="short">p.</term><term name="volume">volume</term><term name="issue">issue</term><term name="open-quote">“</term><term name="close-quote">”</term><term name="open-inner-quote">‘</term><term name="close-inner-quote">’</term></terms>
</locale>`;

type LocatorLabels = Readonly<Record<CitationLocator["type"], (locator: CitationLocator) => string>>;

const CHICAGO_LOCATORS: LocatorLabels = {
  page: ({ value }) => `p. ${value}`,
  page_range: ({ value }) => `pp. ${value}`,
  volume: ({ value }) => `vol. ${value}`,
  fascicle: ({ value }) => `fasc. ${value}`,
  chapter: ({ value }) => `chap. ${value}`,
  juan: ({ value }) => `juan ${value}`,
  folio: (locator) => `fol. ${folio(locator)}`,
  line: ({ value }) => `line ${value}`,
  item: ({ value }) => `item ${value}`,
  document_number: ({ value }) => `doc. no. ${value}`,
  archive_call_number: ({ value }) => `archive call no. ${value}`,
  custom: ({ value, label }) => `${label} ${value}`,
};

const CHINESE_LOCATORS: LocatorLabels = {
  page: ({ value }) => `第${value}页`,
  page_range: ({ value }) => `第${value}页`,
  volume: ({ value }) => `第${value}卷`,
  fascicle: ({ value }) => `第${value}册`,
  chapter: ({ value }) => `第${value}章`,
  juan: ({ value }) => `卷${value}`,
  folio: (locator) => `第${folio(locator)}叶`,
  line: ({ value }) => `第${value}行`,
  item: ({ value }) => `第${value}条`,
  document_number: ({ value }) => `文书号${value}`,
  archive_call_number: ({ value }) => `档号${value}`,
  custom: ({ value, label }) => `${label}${value}`,
};

function folio(locator: CitationLocator): string {
  if (!locator.side || /[abrv]$/iu.test(locator.value)) return locator.value;
  return `${locator.value}${locator.side === "recto" ? "a" : "b"}`;
}

function locatorText(style: CitationStyleId, locators: CitationLocator[], item: NormalizedCslItem): string {
  const english = style === "chicago-notes-bibliography" || (item.type === "article-journal"
    && style !== "gb-t-7714-2025" && /^en(?:-|$)/iu.test(item.language ?? ""));
  const labels = english ? CHICAGO_LOCATORS : CHINESE_LOCATORS;
  return locators.map((locator) => labels[locator.type](locator)).join(english ? ", " : "，");
}

function clean(value: string): string {
  return value
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;|\u00a0/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:，。；：])/gu, "$1")
    .trim();
}

function citationText(updates: ArrayLike<readonly [number, string, string]>, citationId: string): string {
  const matching = Array.from(updates).find((update) => update[2] === citationId) ?? Array.from(updates).at(-1);
  if (!matching?.[1]) throw new CitationError("formatting_failed");
  return clean(matching[1]);
}

export function renderCitation(
  style: CitationStyleId,
  item: NormalizedCslItem,
  locators: CitationLocator[],
): Pick<CitationResult, "style" | "outputs"> {
  try {
    const system = {
      retrieveItem: (id: string) => id === item.id ? item : {},
      retrieveLocale: () => MINIMAL_LOCALE,
    };
    const engine = new CSL.Engine(system, citationStyleXml(style), style === "chicago-notes-bibliography" ? "en-US" : "zh-CN", true);
    engine.setOutputFormat("text");
    engine.updateItems([item.id]);
    const locator = locatorText(style, locators, item);
    const fullId = "academiccloud-full";
    const citationItem = { id: item.id, ...(locator ? { locator, label: "page" } : {}) };
    const first = engine.processCitationCluster(
      { citationID: fullId, citationItems: [citationItem], properties: { noteIndex: 1 } },
      [],
      [],
    );
    const full = citationText(first[1], fullId);
    const descriptor = citationStyleDescriptor(style, CSL.PROCESSOR_VERSION);
    let short: string | null = null;
    if (descriptor.supportsShortNote) {
      const shortId = "academiccloud-short";
      const second = engine.processCitationCluster(
        { citationID: shortId, citationItems: [citationItem], properties: { noteIndex: 2 } },
        [[fullId, 1]],
        [],
      );
      short = citationText(second[1], shortId);
    }
    const bibliography = engine.makeBibliography();
    if (!bibliography || !bibliography[1][0]) throw new CitationError("formatting_failed");
    return {
      style: descriptor,
      outputs: {
        citation: full,
        fullNote: descriptor.supportsShortNote ? full : null,
        shortNote: short,
        bibliography: clean(bibliography[1][0]),
      },
    };
  } catch (error: unknown) {
    if (error instanceof CitationError) throw error;
    throw new CitationError("formatting_failed", { cause: error });
  }
}
