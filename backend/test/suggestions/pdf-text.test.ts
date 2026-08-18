import assert from "node:assert/strict";
import { test } from "node:test";

import { inspectPdfText, PdfTextInspectionError } from "../../src/suggestions/pdf-text.js";

function makePdf(pages: string[]): Uint8Array {
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  const fontObject = 3 + pages.length * 2;
  pages.forEach((value, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const escaped = value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}

test("inspector reads exactly first 15 plus last 5 pages with 1-based evidence indices", async () => {
  const bytes = makePdf(Array.from({ length: 25 }, (_, index) => `Page ${index + 1} title evidence`));
  const inspection = await inspectPdfText(bytes);
  assert.equal(inspection.pageCount, 25);
  assert.deepEqual(inspection.pageIndices, [
    ...Array.from({ length: 15 }, (_, index) => index + 1),
    21, 22, 23, 24, 25,
  ]);
  assert.equal(inspection.pages.length, 20);
  assert.equal(inspection.pages[0]?.pageIndex, 1);
  assert.equal(inspection.pages.at(-1)?.pageIndex, 25);
  assert.equal(inspection.hasUsableTextLayer, true);
});

test("inspector rejects malformed and oversized input without rendering/OCR", async () => {
  await assert.rejects(
    () => inspectPdfText(new TextEncoder().encode("not a pdf")),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "invalid_pdf",
  );
  const oversized = new Uint8Array(32 * 1024 * 1024 + 1);
  oversized.set(new TextEncoder().encode("%PDF-"));
  await assert.rejects(
    () => inspectPdfText(oversized),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "too_large",
  );
});

test("a valid image-only/textless PDF is reported as OCR deferred", async () => {
  const inspection = await inspectPdfText(makePdf(["", ""]));
  assert.deepEqual(inspection.pageIndices, [1, 2]);
  assert.equal(inspection.hasUsableTextLayer, false);
  assert.deepEqual(inspection.pages.map((page) => page.text), ["", ""]);
});

test("malformed control characters are removed before evidence limits are applied", async () => {
  const inspection = await inspectPdfText(makePdf(["Title\u0085\u0090 page"]));
  assert.equal(inspection.hasUsableTextLayer, true);
  assert.equal(/[\u0080-\u009f]/u.test(inspection.pages[0]?.text ?? ""), false);
});
