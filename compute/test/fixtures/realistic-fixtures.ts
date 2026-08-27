import { makeOversizedRealisticPdf, makeRealisticPdf } from "./realistic-pdf.js";

/**
 * The committed A–L realistic regression corpus for RF-METASUGGEST-HARDEN01.
 * Each entry is a self-generated, deterministic, redistributable PDF plus the
 * exact bibliographic facts the pipeline must produce. The corpus is the
 * single source of truth consumed by both the focused full-pipeline test and
 * the release-local real-Tesseract E2E.
 */

export type FixtureKind =
  | "chinese-native"
  | "english-native"
  | "chinese-ocr"
  | "mixed-native-ocr"
  | "large-range"
  | "filename-only"
  | "embedded-only"
  | "encrypted"
  | "malformed"
  | "multi-author-embedded"
  | "labelled-after-page4"
  | "binary-comment-header"
  | "corrupt-ocr-metadata";

export interface OcrScriptEntry {
  text: string;
  confidence: number;
}

export interface RealisticFixture {
  id: string;
  kind: FixtureKind;
  label: string;
  filename: string;
  /** Build the exact fixture PDF. */
  build(): Uint8Array;
  /** Scripted OCR output keyed by 1-based page index (for fake/real OCR). */
  ocrScript?: Readonly<Record<number, OcrScriptEntry>>;
  expected: {
    status: string;
    title?: string | null;
    subtitle?: string | null;
    authors?: string[];
    editors?: string[];
    translators?: string[];
    publisher?: string | null;
    publicationPlace?: string | null;
    dateStatement?: string | null;
    identifiers?: string[];
    editionStatement?: string | null;
    titleSourceType?: string | null;
    filenameConfidence?: string | null;
    /** Fixtures that must fail closed during inspection. */
    inspectionError?: string;
    /** Range-path bounds for the oversized fixture. */
    minRangeRequests?: number;
    maxChunkBytes?: number;
  };
}

const mongolsTitle = "The Mongols and the West, 1221–1410";
const yuandaiTitle = "元代宰相制度研究";
const publisherBeijing = "北京大学出版社";

export const REALISTIC_FIXTURES: readonly RealisticFixture[] = [
  {
    id: "A",
    kind: "chinese-native",
    label: "Chinese native-text book (title page + copyright/出版发行/出版时间/ISBN)",
    filename: "zhangfan-yuandai-zaixiang.pdf",
    build: () => makeRealisticPdf([
      `${yuandaiTitle}\n张帆 著`,
      "版权页\n出版发行：北京：北京大学出版社\n出版时间：1997\nISBN 978-7-301-03214-5",
    ]),
    expected: {
      status: "ready",
      title: yuandaiTitle,
      authors: ["张帆"],
      publisher: publisherBeijing,
      publicationPlace: "北京",
      dateStatement: "1997",
      identifiers: ["9787301032145"],
    },
  },
  {
    id: "B",
    kind: "english-native",
    label: "English native-text book (title page + copyright/imprint/ISBN)",
    filename: "mongols-west.pdf",
    build: () => makeRealisticPdf([
      `${mongolsTitle}\nby\nPeter Jackson`,
      "Copyright 2018 Routledge\nFirst published 2018\nISBN 978-0-415-15271-6",
    ]),
    expected: {
      status: "ready",
      title: mongolsTitle,
      authors: ["Peter Jackson"],
      publisher: "Routledge",
      dateStatement: "2018",
      identifiers: ["9780415152716"],
      titleSourceType: "title_page",
    },
  },
  {
    id: "C",
    kind: "chinese-ocr",
    label: "Chinese image-only scan (OCR title + author suffix)",
    filename: "scan-chinese.pdf",
    build: () => makeRealisticPdf([""]),
    ocrScript: { 1: { text: `${yuandaiTitle}\n张帆 著`, confidence: 86 } },
    expected: {
      status: "ready",
      title: yuandaiTitle,
      authors: ["张帆"],
    },
  },
  {
    id: "D",
    kind: "mixed-native-ocr",
    label: "Mixed native title page + scanned copyright page (independent OCR branch)",
    filename: "mixed.pdf",
    build: () => makeRealisticPdf([
      `${mongolsTitle}\nby\nPeter Jackson`,
      "",
    ]),
    ocrScript: { 2: { text: "Copyright 2018 Routledge\nISBN 978-0-415-15271-6", confidence: 81 } },
    expected: {
      status: "ready",
      title: mongolsTitle,
      authors: ["Peter Jackson"],
      publisher: "Routledge",
      identifiers: ["9780415152716"],
    },
  },
  {
    id: "E",
    kind: "large-range",
    label: "Large (>32 MiB) native-text PDF via bounded random-access reads",
    filename: "large-book.pdf",
    build: () => makeOversizedRealisticPdf([`${mongolsTitle}\nby\nPeter Jackson`]),
    expected: {
      status: "ready",
      title: mongolsTitle,
      authors: ["Peter Jackson"],
      minRangeRequests: 1,
      maxChunkBytes: 2 * 1024 * 1024,
    },
  },
  {
    id: "F",
    kind: "filename-only",
    label: "Structured Chinese filename fallback (no usable text layer)",
    filename: "张帆《元代宰相制度研究》（北京大学出版社1997）.pdf",
    build: () => makeRealisticPdf(["", ""]),
    expected: {
      status: "ready",
      title: yuandaiTitle,
      authors: ["张帆"],
      publisher: publisherBeijing,
      dateStatement: "1997",
      titleSourceType: "filename",
      filenameConfidence: "low",
    },
  },
  {
    id: "G",
    kind: "embedded-only",
    label: "Embedded PDF Info metadata only (no text layer)",
    filename: "embedded.pdf",
    build: () => makeRealisticPdf(["", ""], { info: { title: mongolsTitle, author: "Peter Jackson" } }),
    expected: {
      status: "ready",
      title: mongolsTitle,
      authors: ["Peter Jackson"],
      titleSourceType: "embedded_pdf_metadata",
    },
  },
  {
    id: "H",
    kind: "encrypted",
    label: "Encrypted PDF fails closed",
    filename: "encrypted-book.pdf",
    build: () => makeRealisticPdf(["Hidden title"], { encrypt: true }),
    expected: { status: "unsupported", inspectionError: "encrypted_pdf" },
  },
  {
    id: "I",
    kind: "malformed",
    label: "Degraded/truncated PDF fails closed",
    filename: "broken.pdf",
    build: () => {
      const bytes = makeRealisticPdf(["Truncated title"]);
      return bytes.subarray(0, 48);
    },
    expected: { status: "unsupported", inspectionError: "invalid_pdf" },
  },
  {
    id: "J",
    kind: "multi-author-embedded",
    label: "Multi-author embedded metadata is split conservatively",
    filename: "multi-author.pdf",
    build: () => makeRealisticPdf(["", ""], { info: { title: mongolsTitle, author: "Peter Jackson; David Morgan" } }),
    expected: {
      status: "ready",
      title: mongolsTitle,
      authors: ["David Morgan", "Peter Jackson"],
    },
  },
  {
    id: "K",
    kind: "labelled-after-page4",
    label: "Explicit-label title page after page 4 (题名/作者) plus later colophon",
    filename: "labelled-title.pdf",
    build: () => makeRealisticPdf([
      "", "", "", "",
      `题名：${yuandaiTitle}\n作者：张帆`,
      "出版发行：北京：北京大学出版社\n出版时间：1997",
    ]),
    expected: {
      status: "ready",
      title: yuandaiTitle,
      authors: ["张帆"],
      publisher: publisherBeijing,
      publicationPlace: "北京",
      dateStatement: "1997",
      titleSourceType: "title_page",
    },
  },
  {
    id: "L",
    kind: "binary-comment-header",
    label: "Unusual but safe header (binary comment line after %PDF-) with native title",
    filename: "binary-header.pdf",
    build: () => makeRealisticPdf([`${mongolsTitle}\nby\nPeter Jackson`], { binaryComment: true }),
    expected: {
      status: "ready",
      title: mongolsTitle,
      authors: ["Peter Jackson"],
    },
  },
  {
    id: "M",
    kind: "corrupt-ocr-metadata",
    label: "Corrupt OCR and suspicious embedded metadata remain provenance but produce no normal candidate",
    filename: "document.pdf",
    build: () => makeRealisticPdf([""], { info: { title: "Ã¥ÂÂ", author: "亦郊真" } }),
    ocrScript: { 1: { text: "ず之 fO v f 107の652 1987", confidence: 60 } },
    expected: {
      status: "no_suggestions",
      title: null,
      authors: [],
    },
  },
];
