import type { ContributorRole, EditionType, MaterialClass } from "../bibliography/bibliography.js";
import type { MetadataDetail, PublicBibliographicProfile, PublicMetadata } from "../metadata/metadata-service.js";
import type { CslDate, CslName, NormalizedCslItem } from "./citation.js";

const MATERIAL_TYPES: Readonly<Record<MaterialClass, string>> = {
  scholarly_monograph: "book",
  edited_volume: "book",
  journal_article: "article-journal",
  book_chapter: "chapter",
  thesis_dissertation: "thesis",
  conference_paper: "paper-conference",
  review: "review",
  reference_work: "entry-encyclopedia",
  dictionary_lexicon: "entry-dictionary",
  primary_source_modern_edition: "book",
  traditional_book: "classic",
  archival_document: "manuscript",
  inscription_epigraphy: "manuscript",
  rubbing: "manuscript",
  manuscript: "manuscript",
  collected_documents: "book",
  catalogue_bibliography: "book",
  other: "book",
  unknown: "book",
};

const GBT_GENRES: Readonly<Record<MaterialClass, string>> = {
  scholarly_monograph: "M",
  edited_volume: "M",
  journal_article: "J",
  book_chapter: "A",
  thesis_dissertation: "D",
  conference_paper: "C",
  review: "J",
  reference_work: "M",
  dictionary_lexicon: "M",
  primary_source_modern_edition: "M",
  traditional_book: "M",
  archival_document: "A",
  inscription_epigraphy: "Z",
  rubbing: "Z",
  manuscript: "Z",
  collected_documents: "M",
  catalogue_bibliography: "M",
  other: "Z",
  unknown: "Z",
};

const ROLE_LABELS: Readonly<Record<ContributorRole, string>> = {
  author: "著",
  editor: "编",
  compiler: "编纂",
  translator: "译",
  annotator: "注",
  collator: "校勘",
  punctuator: "标点",
  commentator: "笺证",
  reviser: "修订",
  selector: "辑",
  organizer: "整理",
  other: "其他责任",
};

const EDITION_LABELS: Readonly<Record<EditionType, string>> = {
  critical_edition: "校勘本",
  annotated_edition: "注释本",
  collated_edition: "校注本",
  punctuated_edition: "点校本",
  translated_edition: "译注本",
  facsimile: "影印本",
  reprint: "重印本",
  engraved: "刻本",
  recut: "重刻本",
  facsimile_engraved: "影刻本",
  movable_type: "活字本",
  multicolor_print: "套印本",
  manuscript_copy: "抄本",
  hand_copy: "钞本",
  draft_manuscript: "稿本",
  facsimile_hand_copy: "影钞本",
  lithograph: "石印本",
  letterpress: "铅印本",
  composite_repaired: "配补本",
  hand_copy_repaired: "钞补本",
  repaired: "修补本",
  other: "其他版本",
  unknown: "",
};

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== "")) as T;
}

function parseName(label: string, language: string | undefined): CslName {
  if (/\p{Script=Han}/u.test(label) || /^(?:zh|ja|ko)(?:-|$)/iu.test(language ?? "")) return { literal: label };
  const comma = label.indexOf(",");
  if (comma > 0) {
    const family = label.slice(0, comma).trim();
    const given = label.slice(comma + 1).trim();
    return compact({ family, given: given || undefined });
  }
  const parts = label.split(/\s+/u);
  if (parts.length < 2) return { literal: label };
  return { family: parts.at(-1)!, given: parts.slice(0, -1).join(" ") };
}

function parseDate(value: string | undefined): CslDate | undefined {
  if (!value) return undefined;
  const match = /^(?<year>-?\d{1,4})(?:-(?<month>\d{1,2})(?:-(?<day>\d{1,2}))?)?$/u.exec(value.trim());
  if (!match?.groups?.year) return { raw: value };
  const parts = [Number(match.groups.year)];
  if (match.groups.month) parts.push(Number(match.groups.month));
  if (match.groups.day) parts.push(Number(match.groups.day));
  return { "date-parts": [parts] };
}

function joinUnique(parts: Array<string | number | undefined>, delimiter = ""): string | undefined {
  const values = parts.flatMap((part) => part === undefined || part === "" ? [] : [String(part)]);
  return [...new Set(values)].join(delimiter) || undefined;
}

function mergeStatements(parts: Array<string | undefined>, delimiter = "，"): string | undefined {
  const values: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (values.some((value) => value.includes(part))) continue;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (part.includes(values[index]!)) values.splice(index, 1);
    }
    values.push(part);
  }
  return values.join(delimiter) || undefined;
}

function carrierEdition(profile: PublicBibliographicProfile | null): string | undefined {
  if (!profile) return undefined;
  return mergeStatements([
    profile.publication.editionNumber,
    profile.publication.printing,
    profile.carrierEdition.editionStatement,
    profile.carrierEdition.editionType ? EDITION_LABELS[profile.carrierEdition.editionType] : undefined,
    profile.carrierEdition.facsimileStatement,
  ]);
}

function sourceEdition(profile: PublicBibliographicProfile | null): string | undefined {
  if (!profile) return undefined;
  const source = profile.sourceEdition;
  const era = joinUnique([source.dynasty, source.reignTitle, source.reignYear]);
  const generatedEdition = joinUnique([
      source.printingPlace,
      source.printer,
      source.imprint,
      source.bookshop,
      source.institution,
      source.editionType ? EDITION_LABELS[source.editionType] : undefined,
    ]);
  const edition = mergeStatements([source.editionStatement, generatedEdition]);
  return joinUnique([era, source.absoluteYear === undefined ? undefined : `${source.absoluteYear}年`, edition, source.holdingInformation], "，");
}

function contributorProjection(profile: PublicBibliographicProfile | null, metadata: PublicMetadata | null): {
  author?: CslName[] | undefined;
  editor?: CslName[] | undefined;
  translator?: CslName[] | undefined;
  note?: string | undefined;
} {
  const language = profile?.language;
  if (profile) {
    const author = profile.contributors.filter((entry) => entry.role === "author").map((entry) => parseName(entry.label, language));
    const editor = profile.contributors.filter((entry) => entry.role === "editor").map((entry) => parseName(entry.label, language));
    const translator = profile.contributors.filter((entry) => entry.role === "translator").map((entry) => parseName(entry.label, language));
    const preciseRoles = profile.contributors
      .filter((entry) => entry.role !== "author" && entry.role !== "editor" && entry.role !== "translator")
      .map((entry) => `${entry.label}${entry.roleLabel ?? ROLE_LABELS[entry.role]}`);
    return compact({
      author: author.length ? author : undefined,
      editor: editor.length ? editor : undefined,
      translator: translator.length ? translator : undefined,
      note: preciseRoles.length ? preciseRoles.join("、") : undefined,
    });
  }
  if (!metadata) return {};
  const author = metadata.authorityLinks.filter((entry) => entry.role === "author").map((entry) => parseName(entry.canonicalLabel, undefined));
  const editor = metadata.authorityLinks.filter((entry) => entry.role === "editor").map((entry) => parseName(entry.canonicalLabel, undefined));
  const translator = metadata.authorityLinks.filter((entry) => entry.role === "translator").map((entry) => parseName(entry.canonicalLabel, undefined));
  return compact({
    author: author.length ? author : undefined,
    editor: editor.length ? editor : undefined,
    translator: translator.length ? translator : undefined,
  });
}

function isbn(metadata: PublicMetadata | null): string | undefined {
  return metadata?.identifiers.find((identifier) => identifier.scheme.toLowerCase() === "isbn")?.value;
}

export function metadataDetailToCsl(detail: MetadataDetail): {
  item: NormalizedCslItem;
  completeness: "structured" | "partial";
  materialClass: MaterialClass | null;
} {
  const metadata = detail.metadata;
  const bibliography = detail.bibliography;
  const materialClass = bibliography?.materialClass ?? null;
  const canonicalTitle = metadata?.canonicalTitle ?? detail.displayTitle;
  const title = metadata?.subtitle ? `${canonicalTitle}: ${metadata.subtitle}` : canonicalTitle;
  const contributors = contributorProjection(bibliography, metadata);
  const source = sourceEdition(bibliography);
  const archivalCollection = metadata?.typeFields.fondsOrCollection ?? metadata?.typeFields.seriesStatement;
  const archiveLocation = metadata?.typeFields.referenceCode ?? metadata?.typeFields.shelfmark;
  const item = compact({
    id: detail.file.id,
    type: materialClass ? MATERIAL_TYPES[materialClass] : "book",
    title,
    "title-short": canonicalTitle,
    ...contributors,
    publisher: bibliography?.publication.publisher,
    "publisher-place": bibliography?.publication.place,
    issued: parseDate(bibliography?.publication.publicationDate ?? metadata?.dateStatement ?? undefined),
    edition: carrierEdition(bibliography) ?? metadata?.typeFields.editionStatement,
    volume: bibliography?.volume ?? metadata?.typeFields.volumeStatement,
    "collection-title": bibliography?.series,
    language: bibliography?.language,
    ISBN: isbn(metadata),
    archive: archivalCollection,
    archive_location: archiveLocation,
    "original-title": source ? `据${source}` : undefined,
    genre: materialClass ? GBT_GENRES[materialClass] : "Z",
  }) as NormalizedCslItem;
  return {
    item,
    completeness: metadata && bibliography ? "structured" : "partial",
    materialClass,
  };
}
