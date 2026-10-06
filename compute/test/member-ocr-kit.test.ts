import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import test from 'node:test';
import { makeRealisticPdf } from './fixtures/realistic-pdf.js';
import { inspectRenderedPng } from '../src/rendered-png.js';

test('connector kit manifest contains its separately bundled PDF worker and the shipped worker opens a synthetic PDF', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await promisify(execFile)(process.execPath, ['compute/scripts/build-member-ocr-kit.mjs'], { cwd: root, windowsHide: true });
  const kit = join(root, 'output/vnext/member-local-ocr-connector/kit');
  const manifest = JSON.parse(await readFile(join(kit, 'SHA256SUMS.json'), 'utf8')) as { files: Record<string, string> };
  assert.ok(manifest.files['compute/dist/member-book-pdf-worker.js']);
  assert.equal(Object.keys(manifest.files).length, 8);
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(await readFile(join(kit, name))).digest('hex'), hash);
  const dependencies = JSON.parse(await readFile(join(kit, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(dependencies.dependencies['pdfjs-dist'], '6.2.108'); assert.equal(dependencies.dependencies['@napi-rs/canvas'], '1.0.7');
  const directory = await mkdtemp(join(tmpdir(), 'academiccloud-kit-synthetic-')), path = join(directory, 'source.pdf');
  const bytes = makeRealisticPdf(['']); await writeFile(path, bytes);
  const worker = new Worker(join(kit, 'compute/dist/member-book-pdf-worker.js'), { stdout: true, stderr: true });
  worker.stdout.resume(); worker.stderr.resume();
  async function request(value: object): Promise<Record<string, unknown>> {
    return await new Promise((resolve, reject) => {
      const done = (message: unknown) => { cleanup(); resolve(message as Record<string, unknown>); };
      const failed = (error: Error) => { cleanup(); reject(error); };
      const timeout = setTimeout(() => failed(Error('shipped worker timeout')), 10_000);
      const cleanup = () => { clearTimeout(timeout); worker.off('message', done); worker.off('error', failed); };
      worker.once('message', done); worker.once('error', failed); worker.postMessage(value);
    });
  }
  try {
    assert.equal((await request({ type: 'open', id: 1, path, size: bytes.length })).pageCount, 1);
    const frame = (await request({ type: 'page', id: 2, physicalPage: 1 })).frame as { image: Uint8Array; imageWidth: number; imageHeight: number };
    assert.deepEqual(inspectRenderedPng(frame.image), { width: frame.imageWidth, height: frame.imageHeight });
  } finally { await worker.terminate(); await unlink(path); await rmdir(directory); }
});
