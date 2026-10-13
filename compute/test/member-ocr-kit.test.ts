import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { makeRealisticPdf } from './fixtures/realistic-pdf.js';
import { inspectRenderedPng } from '../src/rendered-png.js';
import { makeCcittBookPdf, assertCcittBodyPainted } from './fixtures/ccitt-book-pdf.js';

test('relocated standalone connector kit paints CCITT scans and fails before capture when local PDF assets are missing', async t => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await promisify(execFile)(process.execPath, ['compute/scripts/build-member-ocr-kit.mjs'], { cwd: root, windowsHide: true });
  const kit = join(root, 'output/vnext/member-local-ocr-connector/kit');
  const manifest = JSON.parse(await readFile(join(kit, 'SHA256SUMS.json'), 'utf8')) as { files: Record<string, string> };
  assert.ok(manifest.files['compute/dist/member-book-pdf-worker.js']);
  assert.ok(manifest.files['compute/dist/member-host-memory.js']);
  assert.equal(Object.keys(manifest.files).length, 9);
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(await readFile(join(kit, name))).digest('hex'), hash);
  const dependencies = JSON.parse(await readFile(join(kit, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(dependencies.dependencies['pdfjs-dist'], '6.2.108'); assert.equal(dependencies.dependencies['@napi-rs/canvas'], '1.0.7');
  const directory = await mkdtemp(join(tmpdir(), 'academiccloud-kit-synthetic-')), path = join(directory, 'source.pdf');
  const standalone = join(directory, 'connector'), require = createRequire(import.meta.url);
  const installed = (name: string) => dirname(require.resolve(`${name}/package.json`));
  const pdfAssets = join(standalone, 'node_modules/pdfjs-dist');
  try {
    await cp(kit, standalone, { recursive: true });
    // Simulate the documented pinned npm install without a network call, symlink,
    // workspace ancestor or member OCR/model dependency.
    for (const name of ['pdfjs-dist', '@napi-rs/canvas']) await cp(installed(name), join(standalone, 'node_modules', name), { recursive: true });
    const canvas = JSON.parse(await readFile(join(installed('@napi-rs/canvas'), 'package.json'), 'utf8')) as { optionalDependencies: Record<string, string> };
    for (const name of Object.keys(canvas.optionalDependencies)) {
      let dependency: string; try { dependency = installed(name); } catch { continue; }
      await cp(dependency, join(standalone, 'node_modules', name), { recursive: true });
    }
    await t.test('relocated diagnostic reads only host memory without importing an engine or PDF dependency', async () => {
      // No model/config/credentials exist in this relocated synthetic kit.
      const output = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
        `import { checkWindowsHostMemory } from ${JSON.stringify(pathToFileURL(join(standalone, 'compute/dist/member-host-memory.js')).href)};
         process.stdout.write(JSON.stringify(await checkWindowsHostMemory()));`],
        { cwd: standalone, windowsHide: true, timeout: 10_000, maxBuffer: 4096 });
      const result = JSON.parse(output.stdout) as { event: string; status: string };
      assert.equal(result.event, 'member_ocr.host_memory');
      assert.ok((process.platform === 'win32' ? ['observed', 'pressure', 'unknown'] : ['unsupported']).includes(result.status));
    });
    async function shipped(requests: object[]): Promise<Array<Record<string, unknown>>> {
      // A child process lets Windows unload the copied canvas DLL before cleanup.
      // The real isolated PDF worker, not a test replacement, still handles pages.
      const script = `
        import { Worker } from 'node:worker_threads';
        const worker = new Worker(process.argv[1], { stdout: true, stderr: true, execArgv: [] });
        worker.stdout.resume(); worker.stderr.resume();
        const results = [];
        try {
          for (const value of JSON.parse(process.argv[2])) {
            const message = await new Promise((resolve, reject) => {
              worker.once('message', resolve); worker.once('error', reject); worker.postMessage(value);
            });
            if (message.frame) message.frame.image = Buffer.from(message.frame.image).toString('base64');
            results.push(message);
          }
          process.stdout.write(JSON.stringify(results));
        } finally { await worker.terminate(); }
      `;
      const result = await promisify(execFile)(process.execPath,
        ['--input-type=module', '-e', script, join(standalone, 'compute/dist/member-book-pdf-worker.js'), JSON.stringify(requests)],
        { cwd: standalone, windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
      return JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    }
    await t.test('bundled worker uses its installed assets after relocation', async () => {
      const bytes = makeCcittBookPdf(); await writeFile(path, bytes);
      const responses = await shipped([{ type: 'open', id: 1, path, size: bytes.length }, { type: 'page', id: 2, physicalPage: 1 }]);
      assert.equal(responses[0]?.pageCount, 1);
      const captured = responses[1]?.frame as { image: string; imageWidth: number; imageHeight: number };
      const frame = { ...captured, image: new Uint8Array(Buffer.from(captured.image, 'base64')) };
      assert.deepEqual(inspectRenderedPng(frame.image), { width: frame.imageWidth, height: frame.imageHeight });
      await assertCcittBodyPainted(frame);
    });
    for (const asset of ['wasm/jbig2.wasm', 'wasm/openjpeg.wasm', 'standard_fonts/LiberationSans-Regular.ttf', 'cmaps/Adobe-GB1-UCS2.bcmap']) {
      await t.test(`missing ${asset} rejects even a simple PDF without returning a partial frame`, async () => {
        const bytes = makeRealisticPdf(['']); await writeFile(path, bytes);
        const assetPath = join(pdfAssets, asset); await rename(assetPath, assetPath + '.unavailable');
        try {
          assert.deepEqual(await shipped([{ type: 'open', id: 1, path, size: bytes.length }, { type: 'page', id: 2, physicalPage: 1 }]),
            [{ id: 1, error: true }, { id: 2, error: true }]);
        } finally { await rename(assetPath + '.unavailable', assetPath); }
      });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
