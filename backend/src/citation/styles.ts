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
    sourceRevision: "Chicago Manual of Style 18th edition public Notes and Bibliography guide",
    revision: "academiccloud-2026-08-22.1",
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
    source: "https://github.com/zotero-chinese/styles/blob/main/src/%E5%8E%86%E5%8F%B2%E7%A0%94%E7%A9%B6/%E5%8E%86%E5%8F%B2%E7%A0%94%E7%A9%B6.csl",
    sourceRevision: "maintained CSL updated 2024-12-25; official journal documentation reviewed 2026-08-22",
    revision: "academiccloud-2026-08-22.1",
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
    source: "https://www.lhp.sdu.edu.cn/__local/7/D1/C5/C04AFCBBE80F73FB89CA183F624_20FB7745_3C32A.pdf",
    sourceRevision: "山东大学《文史哲》撰稿格式 published 2021-03-01; verified 2026-08-22",
    revision: "academiccloud-2026-08-22.1",
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
    sourceRevision: "GB/T 7714—2025 effective 2026-07-01; maintained CSL reviewed 2026-08-22",
    revision: "academiccloud-2026-08-22.1",
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

function names(profile: StyleProfile, form: "long" | "short", sort = false): string {
  const and = profile.nameAnd ? ` and="${profile.nameAnd}"` : "";
  const sorting = sort ? " name-as-sort-order=\"all\" sort-separator=\", \"" : "";
  return `<names variable="author"><name form="${form}" delimiter="${xml(profile.nameDelimiter)}"${and}${sorting}/><substitute><names variable="editor"><name form="${form}" delimiter="${xml(profile.nameDelimiter)}"${and}${sorting}/></names></substitute></names>`;
}

function commonMacros(profile: StyleProfile): string {
  return `
  <macro name="author-long">${names(profile, "long")}</macro>
  <macro name="author-short">${names(profile, "short")}</macro>
  <macro name="author-bibliography">${names(profile, "long", true)}</macro>
  <macro name="title"><text variable="title" prefix="${xml(profile.titlePrefix)}" suffix="${xml(profile.titleSuffix)}"/></macro>
  <macro name="publication"><group delimiter="${profile.language === "zh-CN" ? "：" : ", "}"><text variable="publisher-place"/><text variable="publisher"/></group></macro>
  <macro name="issued"><date variable="issued"><date-part name="year"/></date></macro>
  <macro name="version"><group delimiter="${xml(profile.fullDelimiter)}"><text variable="edition"/><text variable="original-title"/><text variable="note"/><text variable="archive"/><text variable="archive_location"/></group></macro>`;
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
  <info><title>${xml(profile.title)}</title><id>https://academiccloud.local/styles/${profile.id}</id><link href="${xml(profile.source)}" rel="documentation"/><updated>2026-08-22T00:00:00+08:00</updated><rights>AcademicCloud production-subset implementation; source styles/guides retain their own rights.</rights></info>
  <locale xml:lang="en"><terms><term name="and">and</term></terms></locale>
  <locale xml:lang="zh"><terms><term name="and">和</term></terms></locale>
  ${commonMacros(profile)}
  <citation>
    <layout suffix="${xml(profile.citationSuffix)}">
      <choose>
        <if position="subsequent">
          <group delimiter="${xml(profile.fullDelimiter)}"><text macro="author-short"/><text variable="title-short" prefix="${xml(profile.titlePrefix)}" suffix="${xml(profile.titleSuffix)}"/><text variable="locator"/></group>
        </if>
        <else>
          ${firstNote}
        </else>
      </choose>
    </layout>
  </citation>
  <bibliography>
    <layout suffix="${xml(profile.citationSuffix)}">${bibliography}</layout>
  </bibliography>
</style>`;
}

function gbtStyle(profile: StyleProfile): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="zh-CN">
  <info><title>${xml(profile.title)}</title><id>https://academiccloud.local/styles/${profile.id}</id><link href="${xml(profile.source)}" rel="documentation"/><updated>2026-08-22T00:00:00+08:00</updated><rights>AcademicCloud production-subset implementation based on the current national standard.</rights></info>
  <locale xml:lang="zh"><terms><term name="and">，</term></terms></locale>
  ${commonMacros(profile)}
  <citation collapse="citation-number"><layout delimiter="，"><group delimiter=""><text variable="citation-number" prefix="${profile.citationPrefix}" suffix="${profile.citationSuffix}"/><text variable="locator" prefix="："/></group></layout></citation>
  <bibliography>
    <layout suffix="."><text variable="citation-number" prefix="[" suffix="] "/><group delimiter="${xml(profile.bibliographyDelimiter)}"><text macro="author-bibliography"/><group delimiter=""><text macro="title"/><text variable="genre" prefix="[" suffix="]"/></group><text macro="version"/><text macro="publication"/><text macro="issued"/></group></layout>
  </bibliography>
</style>`;
}

export function citationStyleXml(id: CitationStyleId): string {
  const profile = STYLE_PROFILES[id];
  return profile.className === "note" ? noteStyle(profile) : gbtStyle(profile);
}

const EXPECTED_STYLE_HASHES: Readonly<Record<CitationStyleId, string>> = {
  "chicago-notes-bibliography": "decf6aa5bde13e8f52e7674d421bb1a20b5bfd18fe588b9160ce260ac0e7d514",
  "lishi-yanjiu": "54d40e14b8171047200f42021c2506d308bf20b1d79e4d54afeccc56df083478",
  wenshizhe: "1cbb0cb635739c1233ea69b369ee3c9aaa6ce20370f0d1dc8208b80325670be8",
  "gb-t-7714-2025": "e41c757ffc1a5230f60e03cd829fb0c13c1556373d87f586cf6a98f0fd8d0599",
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
    verifiedAt: "2026-08-22",
    compliance: profile.compliance,
    supportsShortNote: profile.supportsShortNote,
  };
}

export function expectedCitationStyleHash(id: CitationStyleId): string {
  return EXPECTED_STYLE_HASHES[id];
}
