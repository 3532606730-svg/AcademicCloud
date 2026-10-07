import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';

/** Self-generated Group-4 scan plus a separate footer, with no acquired book bytes. */
export function makeCcittBookPdf(options: { footer?: boolean } = {}): Uint8Array {
  // T.6 horizontal mode: white run 8, black run 8. Subsequent identical rows
  // use two vertical-zero codes; finish with the two-EOL end-of-facsimile block.
  const bits = '001' + '10011' + '000101' + '11'.repeat(15) + '000000000001000000000001';
  const encoded = Buffer.from(bits.padEnd(Math.ceil(bits.length / 8) * 8, '0').match(/.{8}/gu)!.map(byte => Number.parseInt(byte, 2)));
  const content = 'q 64 0 0 80 18 45 cm /Scan Do Q' + (options.footer === false ? '' : '\nBT /F1 7 Tf 20 12 Td (SYNTHETIC FOOTER) Tj ET');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 140] /Resources << /XObject << /Scan 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 16 /Rows 16 /BlackIs1 false >> /Length ${encoded.length} >>\nstream\n`), encoded, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  const chunks = [Buffer.from('%PDF-1.7\n')], offsets = [0]; let size = chunks[0]!.length;
  for (const [index, object] of objects.entries()) {
    offsets.push(size); const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    chunks.push(part); size += part.length;
  }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
  return Buffer.concat(chunks);
}

/** A valid PNG containing only the footer must fail this body-paint assertion. */
export async function assertCcittBodyPainted(frame: { image: Uint8Array; imageWidth: number; imageHeight: number }, requireFooter = true): Promise<void> {
  const image = await loadImage(Buffer.from(frame.image));
  const canvas = createCanvas(frame.imageWidth, frame.imageHeight), context = canvas.getContext('2d');
  try {
    context.drawImage(image, 0, 0);
    const pixel = (x: number, y: number) => context.getImageData(Math.floor(frame.imageWidth * x), Math.floor(frame.imageHeight * y), 1, 1).data;
    for (const y of [0.2, 0.4, 0.6]) {
      assert.ok(pixel(0.65, y)[0]! < 20, `CCITT body missing at ${y}`);
      assert.ok(pixel(0.3, y)[0]! > 235, `CCITT white region corrupted at ${y}`);
    }
    if (requireFooter) {
      const footer = context.getImageData(0, Math.floor(frame.imageHeight * 0.87), frame.imageWidth, Math.floor(frame.imageHeight * 0.1)).data;
      let dark = 0; for (let offset = 0; offset < footer.length; offset += 4) if (footer[offset]! < 100) dark++;
      assert.ok(dark > 100, 'separate standard-font footer missing');
    }
  } finally { canvas.width = 1; canvas.height = 1; }
}
