import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

test('shutdown interrupts hidden pairing input promptly without printing its partial code', async () => {
  const moduleUrl = new URL('../src/member-ocr-main.ts', import.meta.url).href;
  const partialCode = 'synthetic-private-pairing-code';
  const source = `import { readPairingCode } from ${JSON.stringify(moduleUrl)};
    const controller = new AbortController();
    process.once('SIGTERM', () => controller.abort());
    setTimeout(() => controller.abort(), 50);
    try { await readPairingCode(controller.signal); process.exitCode=2; }
    catch (error) { if(error.code !== 'aborted') process.exitCode=3; }
  `;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const chunks: Buffer[] = [];
  child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => chunks.push(chunk));
  child.stdin.on('error', () => {}); child.stdin.write(partialCode);
  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('pairing input did not close')); }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', value => { clearTimeout(timeout); resolve(value); });
  });
  assert.equal(code, 0); assert.ok(!Buffer.concat(chunks).toString('utf8').includes(partialCode));
});
