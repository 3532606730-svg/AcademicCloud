import { createHash } from "node:crypto";

import type { CitationStyleDescriptor, CitationStyleId } from "./citation.js";

interface StyleProfile {
  id: CitationStyleId;
  title: string;
  className: "note" | "in-text";
  label: string;
  language: "en-US" | "zh-CN";
  source: string;
  sourceRevision: string;
  revision: string;
  compliance: "official" | "production_subset";
  supportsShortNote: boolean;
  titlePrefix: string;
  titleSuffix: string;
  nameDelimiter: string;
  nameAnd: string;
  fullDelimiter: string;
  bibliographyDelimiter: string;
  citationPrefix: string;
  citationSuffix: string;
}

const STYLE_PROFILES: Readonly<Record<CitationStyleId, StyleProfile>> = {
  "chicago-notes-bibliography": {
    id: "chicago-notes-bibliography",
    title: "AcademicCloud Chicago Notes and Bibliography",
    className: "note",
    label: "Chicago Notes & Bibliography",
    language: "en-US",
    source: "https://www.chicagomanualofstyle.org/tools_citationguide/citation-guide-1.html",
    sourceRevision: "Chicago Manual of Style 18th edition public Notes and Bibliography guide; edited-book parts reviewed 2026-10-12",
    revision: "academiccloud-2026-10-12.1",
    compliance: "production_subset",
    supportsShortNote: true,
    titlePrefix: "",
    titleSuffix: "",
    nameDelimiter: ", ",
    nameAnd: "text",
    fullDelimiter: ", ",
    bibliographyDelimiter: ". ",
    citationPrefix: "",
    citationSuffix: ".",
  },
  "lishi-yanjiu": {
    id: "lishi-yanjiu",
    title: "AcademicCloud 历史研究",
    className: "note",
    label: "《历史研究》",
    language: "zh-CN",
    source: "https://www.ynu.edu.cn/__local/3/C4/E8/48C0EFB258EA4A95C7F446EC740_06110F24_37381.pdf?e=.pdf",
    sourceRevision: "历史研究 journal-authored guide: Chinese journals pp. 4–5, foreign journals pp. 7–8 reviewed 2026-10-07; collected-book parts pp. 2 and 7 reviewed 2026-10-12",
    revision: "academiccloud-2026-10-12.1",
    compliance: "production_subset",
    supportsShortNote: true,
    titlePrefix: "《",
    titleSuffix: "》",
    nameDelimiter: "、",
    nameAnd: "",
    fullDelimiter: "，",
    bibliographyDelimiter: "，",
    citationPrefix: "",
    citationSuffix: "。",
  },
  wenshizhe: {
    id: "wenshizhe",
    title: "AcademicCloud 文史哲",
    className: "note",
    label: "《文史哲》",
    language: "zh-CN",
    source: "https://www.lhp.sdu.edu.cn/info/1011/1396.htm",
    sourceRevision: "山东大学《文史哲》撰稿格式 official DOCX, sections 二（四）期刊 and 二（六）English Chicago references; reviewed 2026-10-07",
    revision: "academiccloud-2026-10-12.1",
    compliance: "production_subset",
    supportsShortNote: true,
    titlePrefix: "《",
    titleSuffix: "》",
    nameDelimiter: "、",
    nameAnd: "",
    fullDelimiter: "，",
    bibliographyDelimiter: "，",
    citationPrefix: "",
    citationSuffix: "。",
  },
  "gb-t-7714-2025": {
    id: "gb-t-7714-2025",
    title: "AcademicCloud GB/T 7714—2025",
    className: "in-text",
    label: "GB/T 7714—2025",
    language: "zh-CN",
    source: "https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=C6CE52E55AC09B9C79A20AEA77CEDD14",
    sourceRevision: "GB/T 7714—2025 effective 2026-07-01; journal articles reviewed 2026-10-07; sections 8.3 extracted book parts and 8.6 proceedings reviewed 2026-10-12 in university-hosted reproduction",
    revision: "academiccloud-2026-10-12.1",
    compliance: "production_subset",
    supportsShortNote: false,
    titlePrefix: "",
    titleSuffix: "",
    nameDelimiter: "，",
    nameAnd: "",
    fullDelimiter: ". ",
    bibliographyDelimiter: ". ",
    citationPrefix: "[",
    citationSuffix: "]",
  },
};

const XML_ESCAPE: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" };

function xml(value: string): string {
  return value.replace(/[&<>"]/gu, (character) => XML_ESCAPE[character]!);
}

function names(profile: StyleProfile, form: "long" | "short", sort: false | "all" | "first" = false): string {
  const and = profile.nameAnd ? ` and="${profile.nameAnd}"` : "";
  const sorting = sort ? ` name-as-sort-order="${sort}" sort-separator=", "${sort === "first" ? " delimiter-precedes-last=\"always\"" : ""}` : "";
  return `<names variable="author"><name form="${form}" delimiter="${xml(profile.nameDelimiter)}"${and}${sorting}/><substitute><names variable="editor"><name form="${form}" delimiter="${xml(profile.nameDelimiter)}"${and}${sorting}/></names></substitute></names>`;
}

function commonMacros(profile: StyleProfile): string {
  return `
  <macro name="author-long">${names(profile, "long")}</macro>
  <macro name="author-short">${names(profile, "short")}</macro>
  <macro name="author-bibliography">${names(profile, "long", "all")}</macro>
  <macro name="title"><text variable="title" prefix="${xml(profile.titlePrefix)}" suffix="${xml(profile.titleSuffix)}"/></macro>
  <macro name="publication"><group delimiter="${profile.language === "zh-CN" ? "：" : ", "}"><text variable="publisher-place"/><text variable="publisher"/></group></macro>
  <macro name="issued"><date variable="issued"><date-part name="year"/></date></macro>
  <macro name="version"><group delimiter="${xml(profile.fullDelimiter)}"><text variable="edition"/><text variable="original-title"/><text variable="note"/><text variable="archive"/><text variable="archive_location"/></group></macro>`;
}

// These are the journal-article branches of the pinned production subset.
// The Chinese journals prescribe notes, so bibliography uses their full-note
// form with the article's complete page range. Existing non-journal branches
// and subsequent-note policy remain unchanged.
function journalNote(profile: StyleProfile, bibliography: boolean): string {
  const englishProfile = { ...profile, nameDelimiter: ", ", nameAnd: "text" };
  const pages = bibliography ? `<text variable="page"/>`
    : `<choose><if variable="locator"><text variable="locator"/></if><else><text variable="page"/></else></choose>`;
  const chicago = `<group delimiter="${bibliography ? ". " : ", "}" suffix=".">${names(englishProfile, "long", bibliography ? "first" : false)}<text variable="title" quotes="true"/><group delimiter=": "><group delimiter=" "><group delimiter=", "><group delimiter=" "><text variable="container-title" font-style="italic"/><number variable="volume"/></group><number variable="issue" prefix="no. "/></group><text macro="issued" prefix="(" suffix=")"/></group>${pages}</group></group>`;
  if (profile.language === "en-US") return chicago;
  const chinesePages = bibliography ? `<text variable="page" prefix="第" suffix="页"/>`
    : `<choose><if variable="locator"><text variable="locator"/></if><else><text variable="page" prefix="第" suffix="页"/></else></choose>`;
  const chinese = `<group delimiter="，" suffix="。"><group delimiter="："><text macro="author-long"/><text macro="title"/></group><choose><if variable="volume"><group delimiter="，"><group delimiter=""><text variable="container-title" prefix="《" suffix="》"/><number variable="volume" prefix="第" suffix="卷"/><number variable="issue" prefix="第" suffix="期"/></group><text macro="issued" suffix="年"/></group></if><else><group delimiter=""><text variable="container-title" prefix="《" suffix="》"/><text macro="issued" suffix="年"/><number variable="issue" prefix="第" suffix="期"/></group></else></choose>${chinesePages}</group>`;
  const articlePages = `<group delimiter=" "><label variable="page" form="short"/><text variable="page"/></group>`;
  const foreignPages = bibliography ? articlePages
    : `<choose><if variable="locator"><group delimiter=" "><choose><if is-numeric="locator"><label variable="locator" form="short"/></if></choose><text variable="locator"/></group></if><else>${articlePages}</else></choose>`;
  const lishi = `<group delimiter=", " suffix=".">${names(englishProfile, "long")}<text variable="title" quotes="true"/><text variable="container-title" font-style="italic"/><group delimiter=" "><group delimiter=", "><number variable="volume" prefix="vol. "/><number variable="issue" prefix="no. "/></group><text macro="issued" prefix="(" suffix=")"/></group>${foreignPages}</group>`;
  // citeproc-js's pinned locale condition selects the source-language form;
  // English 文史哲 follows the journal's explicit Chicago instruction.
  return `<choose><if locale="en">${profile.id === "lishi-yanjiu" ? lishi : chicago}</if><else>${chinese}</else></choose>`;
}

function journalShortNote(profile: StyleProfile): string {
  const english = `<group delimiter=", " suffix=".">${names({ ...profile, nameDelimiter: ", ", nameAnd: "text" }, "short")}<text variable="title-short" quotes="true"/><text variable="locator"/></group>`;
  if (profile.language === "en-US") return english;
  return `<choose><if locale="en">${english}</if><else><group delimiter="${xml(profile.fullDelimiter)}" suffix="${xml(profile.citationSuffix)}"><text macro="author-short"/><text variable="title-short" prefix="${xml(profile.titlePrefix)}" suffix="${xml(profile.titleSuffix)}"/><text variable="locator"/></group></else></choose>`;
}

function partNote(profile: StyleProfile, bibliography: boolean): string {
  const englishProfile = { ...profile, nameDelimiter: ", ", nameAnd: "text" };
  const chicago = profile.id === "chicago-notes-bibliography" || profile.id === "wenshizhe";
  const pageExtent = chicago ? `<text variable="page"/>`
    : `<group delimiter=" "><label variable="page" form="short"/><text variable="page"/></group>`;
  // Chicago18 does not require chapter ranges in bibliography entries. Other
  // formats retain the complete extent independently of a citation pinpoint.
  const pages = bibliography ? chicago ? "" : pageExtent
    : `<choose><if variable="locator"><text variable="locator"/></if><else>${pageExtent}</else></choose>`;
  const publication = `<group delimiter=", "><group delimiter=": "><text variable="publisher-place"/><text variable="publisher"/></group><text macro="issued"/></group>`;
  const containerPublication = chicago
    ? `<group delimiter=" "><text variable="container-title" prefix="in " font-style="italic"/><group prefix="(" suffix=")">${publication}</group></group>`
    : `<group delimiter=", "><text variable="container-title" prefix="in " font-style="italic"/>${publication}</group>`;
  const english = bibliography && chicago
    ? `<group delimiter=". " suffix=".">${names(englishProfile, "long", "first")}<text variable="title" quotes="true"/><text variable="container-title" prefix="In " font-style="italic"/><text macro="version"/>${publication}</group>`
    : `<group delimiter=", " suffix=".">${names(englishProfile, "long")}<text variable="title" quotes="true"/>${containerPublication}<text macro="version"/>${pages}</group>`;
  if (profile.language === "en-US") return english;
  const chinesePages = bibliography ? `<text variable="page" prefix="第" suffix="页"/>`
    : `<choose><if variable="locator"><text variable="locator"/></if><else><text variable="page" prefix="第" suffix="页"/></else></choose>`;
  const chinese = `<group delimiter="，" suffix="。"><group delimiter="："><text macro="author-long"/><text macro="title"/></group><text variable="container-title" prefix="《" suffix="》"/><text macro="version"/><text macro="publication"/><text macro="issued" suffix="年"/>${chinesePages}</group>`;
  return `<choose><if locale="en">${english}</if><else>${chinese}</else></choose>`;
}

function noteStyle(profile: StyleProfile): string {
  const firstNote = profile.language === "en-US"
    ? `<group delimiter=", "><text macro="author-long"/><group delimiter=" "><text macro="title"/><group delimiter=", " prefix="(" suffix=")"><text macro="publication"/><text macro="issued"/></group></group><text macro="version"/><text variable="locator"/></group>`
    : `<group delimiter="${xml(profile.fullDelimiter)}"><group delimiter="："><text macro="author-long"/><text macro="title"/></group><text macro="version"/><group delimiter="，"><text macro="publication"/><text macro="issued"/></group><text variable="locator"/></group>`;
  const bibliography = profile.language === "en-US"
    ? `<group delimiter="${xml(profile.bibliographyDelimiter)}"><text macro="author-bibliography"/><text macro="title"/><text macro="version"/><text macro="publication"/><text macro="issued"/></group>`
    : `<group delimiter="${xml(profile.bibliographyDelimiter)}"><group delimiter="："><text macro="author-bibliography"/><text macro="title"/></group><text macro="version"/><text macro="publication"/><text macro="issued"/></group>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0" default-locale="${profile.language}">
  <info><title>${xml(profile.title)}</title><id>https://academiccloud.local/styles/${profile.id}</id><link href="${xml(profile.source)}" rel="documentation"/><updated>2026-10-12T00:00:00+08:00</updated><rights>AcademicCloud production-subset implementation; source styles/guides retain their own rights.</rights></info>
  <locale xml:lang="en"><style-options punctuation-in-quote="true"/><terms><term name="and">and</term><term name="page" form="short"><single>p.</single><multiple>pp.</multiple></term></terms></locale>
  <locale xml:lang="zh"><style-options punctuation-in-quote="true"/><terms><term name="and">和</term></terms></locale>
  ${commonMacros(profile)}
  <citation>
    <layout>
      <choose>
        <if type="article-journal"><choose><if position="subsequent">${journalShortNote(profile)}</if><else>${journalNote(profile, false)}</else></choose></if>
        <else-if type="chapter paper-conference" match="any"><choose><if position="subsequent">${journalShortNote(profile)}</if><else>${partNote(profile, false)}</else></choose></else-if>
        <else>
          <group suffix="${xml(profile.citationSuffix)}"><choose><if position="subsequent"><group delimiter="${xml(profile.fullDelimiter)}"><text macro="author-short"/><text variable="title-short" prefix="${xml(profile.titlePrefix)}" suffix="${xml(profile.titleSuffix)}"/><text variable="locator"/></group></if><else>${firstNote}</else></choose></group>
        </else>
      </choose>
    </layout>
  </citation>
  <bibliography>
    <layout><choose><if type="article-journal">${journalNote(profile, true)}</if><else-if type="chapter paper-conference" match="any">${partNote(profile, true)}</else-if><else><group suffix="${xml(profile.citationSuffix)}">${bibliography}</group></else></choose></layout>
  </bibliography>
</style>`;
}

function gbtStyle(profile: StyleProfile): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="zh-CN">
  <info><title>${xml(profile.title)}</title><id>https://academiccloud.local/styles/${profile.id}</id><link href="${xml(profile.source)}" rel="documentation"/><updated>2026-10-12T00:00:00+08:00</updated><rights>AcademicCloud production-subset implementation based on the current national standard.</rights></info>
  <locale xml:lang="zh"><terms><term name="and">，</term></terms></locale>
  ${commonMacros(profile)}
  <citation collapse="citation-number"><layout delimiter="，"><group delimiter=""><text variable="citation-number" prefix="${profile.citationPrefix}" suffix="${profile.citationSuffix}"/><text variable="locator" prefix="："/></group></layout></citation>
  <bibliography>
    <layout suffix="."><text variable="citation-number" prefix="[" suffix="] "/><choose><if type="article-journal"><group delimiter=". "><text macro="author-bibliography"/><text variable="title" suffix="[J]"/><group delimiter=": "><group delimiter=", "><text variable="container-title"/><text macro="issued"/><group delimiter=""><number variable="volume"/><number variable="issue" prefix="(" suffix=")"/></group></group><text variable="page"/></group></group></if><else-if type="chapter paper-conference" match="any"><group delimiter=". "><text macro="author-bibliography"/><group delimiter=""><text variable="title"/><text variable="genre" prefix="[" suffix="]"/><text variable="container-title" prefix="//"/></group><text macro="version"/><group delimiter=": "><group delimiter=", "><text macro="publication"/><text macro="issued"/></group><text variable="page"/></group></group></else-if><else><group delimiter="${xml(profile.bibliographyDelimiter)}"><text macro="author-bibliography"/><group delimiter=""><text macro="title"/><text variable="genre" prefix="[" suffix="]"/></group><text macro="version"/><text macro="publication"/><text macro="issued"/></group></else></choose></layout>
  </bibliography>
</style>`;
}

export function citationStyleXml(id: CitationStyleId): string {
  const profile = STYLE_PROFILES[id];
  return profile.className === "note" ? noteStyle(profile) : gbtStyle(profile);
}

const EXPECTED_STYLE_HASHES: Readonly<Record<CitationStyleId, string>> = {
  "chicago-notes-bibliography": "b0ec25148181b1c81ad55cb452a821225167780f7624510431c570e2c58e68fb",
  "lishi-yanjiu": "940f49d8bba9ca88999b4528ebeb7b7f953632d3570c1524a7b531140b95720f",
  wenshizhe: "993438d18b9d42bdb51ca6d126763093b758f31d0125855c5e3af9cacff502bb",
  "gb-t-7714-2025": "495a06c105bd6983c1ead5ed1ee2a1bfd64f912d604c383135b4ff4d9b6933d8",
};

export function citationStyleDescriptor(id: CitationStyleId, processorVersion: string): CitationStyleDescriptor {
  const profile = STYLE_PROFILES[id];
  const sha256 = createHash("sha256").update(citationStyleXml(id)).digest("hex");
  if (EXPECTED_STYLE_HASHES[id] !== sha256) {
    throw new Error(`citation style hash mismatch: ${id}`);
  }
  return {
    id,
    label: profile.label,
    processor: "citeproc-js",
    processorVersion,
    revision: profile.revision,
    source: profile.source,
    sourceRevision: profile.sourceRevision,
    sha256,
    verifiedAt: "2026-10-12",
    compliance: profile.compliance,
    supportsShortNote: profile.supportsShortNote,
  };
}

export function expectedCitationStyleHash(id: CitationStyleId): string {
  return EXPECTED_STYLE_HASHES[id];
}
