import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { openBookPdf } from '../src/member-book-pdf.js';
import { inspectRenderedPng } from '../src/rendered-png.js';
import { LOCAL_OCR_LIMITS } from '@academiccloud/compute-contracts';
import { makeRealisticPdf } from './fixtures/realistic-pdf.js';

async function source(bytes: Uint8Array) { const dir = await mkdtemp(join(tmpdir(), 'academiccloud-synthetic-book-')); const path = join(dir, 'source.pdf'); await writeFile(path, bytes); return { path, size: bytes.length, async close() { await unlink(path); await rmdir(dir); } }; }
test('real isolated PDF session reuses document across pages, applies intrinsic rotation, returns bounded actual PNG and closes', async () => {
  const file = await source(makeRealisticPdf(['', ''], { rotation: 90 }));
  const pdf = await openBookPdf(file.path, file.size, new AbortController().signal);
  try {
    assert.equal(pdf.pageCount, 2);
    for (const page of [1, 2]) { const frame = await pdf.capture(page, new AbortController().signal); assert.equal(frame.rotation, 90); assert.deepEqual(inspectRenderedPng(frame.image), { width: frame.imageWidth, height: frame.imageHeight }); assert.ok(frame.imageWidth <= 2000); assert.ok(frame.imageHeight <= 2800); }
  } finally { await pdf.close(); await pdf.close(); await file.close(); }
});
function noisyPdf(): Uint8Array {
  const width = 2000, height = 2800, pixels = Buffer.alloc(width * height);
  let state = 17; for (let i = 0; i < pixels.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; pixels[i] = state >>> 24; }
  const encoded = deflateSync(pixels);
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 2800] /Resources << /XObject << /Image 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from('<< /Length 36 >>\nstream\nq 2000 0 0 2800 0 0 cm /Image Do Q\nendstream'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${encoded.length} >>\nstream\n`), encoded, Buffer.from('\nendstream')])];
  const chunks = [Buffer.from('%PDF-1.7\n')], offsets = [0]; let size = chunks[0]!.length;
  objects.forEach((object, i) => { offsets.push(size); const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]); chunks.push(part); size += part.length; });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
  return Buffer.concat(chunks);
}
test('oversized PNG is fitted locally before engine submission and CPU rendering leaves main-thread timers responsive', async () => {
  const file = await source(noisyPdf()); const pdf = await openBookPdf(file.path, file.size, new AbortController().signal);
  let ticks = 0; const timer = setInterval(() => { ticks++; }, 10);
  try { const frame = await pdf.capture(1, new AbortController().signal); assert.ok(frame.image.byteLength <= LOCAL_OCR_LIMITS.maxImageBytes); assert.ok(frame.imageWidth < 2000 || frame.imageHeight < 2800); assert.ok(ticks > 0); assert.deepEqual(inspectRenderedPng(frame.image), { width: frame.imageWidth, height: frame.imageHeight }); }
  finally { clearInterval(timer); await pdf.close(); await file.close(); }
});
test('invalid source and aborted open terminate isolated worker without OCR or file retention', async () => {
  const file = await source(Buffer.from('%PDF-broken'));
  try { await assert.rejects(openBookPdf(file.path, file.size, new AbortController().signal)); const c = new AbortController(); c.abort(); await assert.rejects(openBookPdf(file.path, file.size, c.signal)); }
  finally { await file.close(); }
});
test('abort during a page render terminates the PDF worker and repeated close waits for cleanup', async () => {
  const file = await source(noisyPdf()); const pdf = await openBookPdf(file.path, file.size, new AbortController().signal);
  try { const c = new AbortController(); const rendering = pdf.capture(1, c.signal); setTimeout(() => c.abort(), 5); await assert.rejects(rendering, { message: 'aborted' }); await pdf.close(); await pdf.close(); }
  finally { await pdf.close(); await file.close(); }
});
