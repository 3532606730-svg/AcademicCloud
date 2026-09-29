import { TextEncoder } from "node:util";

/**
 * Deterministic minimal-PDF generator used by the committed A–L realistic
 * suggestion regression corpus.  The output is small, redistributable, and
 * self-generated: no third-party copyrighted page text or scanned image is
 * checked in.  Every fixture is a truthful PDF whose text layer, embedded Info
 * dictionary, encryption, or structure exercises one realistic branch of the
 * bounded suggestion pipeline.
 *
 * Text is emitted through a Type0 /Identity-H font with an identity ToUnicode
 * CMap, so Chinese, Latin-script, and typographic punctuation all survive
 * PDF.js text extraction byte-for-byte while remaining a valid, parseable PDF.
 */

export interface RealisticPdfInfo {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export interface RealisticPdfOptions {
  mediaBox?: string;
  rotation?: 0 | 90 | 180 | 270;
  /** PDF trailer /Info dictionary (embedded PDF metadata). */
  info?: RealisticPdfInfo;
  /** Emit a /Encrypt trailer entry so PDF.js fails closed as encrypted. */
  encrypt?: boolean;
  /** Emit a binary comment line immediately after the header line. */
  binaryComment?: boolean;
}

function pdfEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function utf16Hex(value: string): string {
  let hex = "";
  for (let index = 0; index < value.length; index += 1) {
    hex += value.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return hex;
}

/** UTF-16BE text string with BOM so PDF.js decodes non-PDFDocEncoding Info values. */
function infoString(value: string): string {
  let hex = "feff";
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code <= 0xffff) {
      hex += code.toString(16).padStart(4, "0");
    } else {
      const adjusted = code - 0x10000;
      hex += (0xd800 + (adjusted >> 10)).toString(16).padStart(4, "0");
      hex += (0xdc00 + (adjusted & 0x3ff)).toString(16).padStart(4, "0");
    }
  }
  return `<${hex}>`;
}

const TO_UNICODE_CMAP = [
  "/CIDInit /ProcSet findresource begin",
  "12 dict begin",
  "begincmap",
  "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
  "/CMapName /Adobe-Identity-UCS def",
  "/CMapType 2 def",
  "1 begincodespacerange",
  "<0000> <FFFF>",
  "endcodespacerange",
  "1 beginbfrange",
  "<0000> <FFFF> <0000>",
  "endbfrange",
  "endcmap",
  "CMapName currentdict /CMap defineresource pop",
  "end",
  "end",
].join("\n");

export function makeRealisticPdf(
  pages: readonly string[],
  options: RealisticPdfOptions = {},
): Uint8Array {
  const fontObject = 3 + pages.length * 2;
  const cmapObject = fontObject + 1;
  const infoObject = cmapObject + 1;
  const encryptObject = infoObject + 1;

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((value, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const lines = value.replace(/\r\n?/g, "\n").split("\n");
    const stream = lines.every((line) => line.length === 0)
      ? ""
      : `BT /F1 12 Tf 72 720 Td ${lines.map((line, lineIndex) => {
          const draw = `<${utf16Hex(line)}> Tj`;
          return lineIndex === 0 ? draw : `0 -18 Td ${draw}`;
        }).join(" ")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [${options.mediaBox ?? "0 0 612 792"}]${options.rotation === undefined ? "" : ` /Rotate ${options.rotation}`} /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });

  objects.push(
    `<< /Type /Font /Subtype /Type0 /BaseFont /AC-UniFont /Encoding /Identity-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AC-UniFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor << /Type /FontDescriptor /FontName /AC-UniFont /Flags 4 /FontBBox [0 -200 1000 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >> /DW 1000 /W [32 [250]] /CIDToGIDMap /Identity >>] /ToUnicode ${cmapObject} 0 R >>`,
    `<< /Length ${Buffer.byteLength(TO_UNICODE_CMAP)} >>\nstream\n${TO_UNICODE_CMAP}\nendstream`,
  );

  const infoEntries = options.info
    ? (["title", "author", "subject", "keywords"] as const)
      .filter((key) => typeof options.info?.[key] === "string" && (options.info?.[key] as string).length > 0)
      .map((key) => {
        const pdfKey = key === "title" ? "Title" : key === "author" ? "Author" : key === "subject" ? "Subject" : "Keywords";
        return `/${pdfKey} ${infoString(options.info![key] as string)}`;
      })
      .join(" ")
    : "";
  objects.push(infoEntries ? `<< ${infoEntries} >>` : "<< >>");

  if (options.encrypt) {
    objects.push("<< /Filter /Standard /V 1 /R 2 /O (owner) /U (user) /P -44 >>");
  }

  let output = "%PDF-1.4\n";
  if (options.binaryComment) output += "%\u0001\u0002\u0003\u0004\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]!).padStart(10, "0")} 00000 n \n`;
  }
  const trailerEntries = [`/Size ${objects.length + 1}`, "/Root 1 0 R"];
  if (options.info) trailerEntries.push(`/Info ${infoObject} 0 R`);
  if (options.encrypt) trailerEntries.push(`/Encrypt ${encryptObject} 0 R`);
  output += `trailer\n<< ${trailerEntries.join(" ")} >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}

/** A PDF whose total size exceeds the whole-object 32 MiB compatibility ceiling. */
export function makeOversizedRealisticPdf(
  pages: readonly string[],
  options: RealisticPdfOptions = {},
  targetBytes = 33 * 1024 * 1024,
): Uint8Array {
  const base = new TextDecoder().decode(makeRealisticPdf(pages, options));
  const startxref = Number(/startxref\n(\d+)/u.exec(base)?.[1] ?? 0);
  const head = base.slice(0, base.indexOf("%%EOF"));
  const padding = "%".repeat(Math.max(0, targetBytes - Buffer.byteLength(base) - 32));
  const tail = `\nstartxref\n${startxref}\n%%EOF`;
  return new TextEncoder().encode(`${head}${padding}${tail}`);
}
