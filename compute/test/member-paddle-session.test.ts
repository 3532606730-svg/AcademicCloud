import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { EventEmitter } from 'node:events';
import childProcess, { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { MemberPaddleSession, type MemberPaddleConfig } from '../src/member-paddle.js';
import { PaddleOcrSidecarAdapter, PADDLE_OCR_ENGINE_ID } from '../src/paddle-ocr.js';

const config: MemberPaddleConfig = { pythonPath: '/mock', sidecarPath: '/mock', detectionModelPath: '/mock', recognitionModelPath: '/mock', cachePath: '/mock', device: 'gpu', nativeResource: { pythonPath: '/mock', lockPath: '/mock' } };
const image = () => createCanvas(32, 64).toBuffer('image/png');
test('warm session reuses exactly one adapter for sequential pages, preserves per-page validation, closes once', async () => {
  let starts = 0, closes = 0;
  const session = new MemberPaddleSession(config, () => { starts++; return { async recognizePage() { return { status: 'recognized', text: 'text', confidence: 99, engine: 'ignored' }; }, async close() { closes++; } }; });
  for (const requestId of ['one', 'two']) assert.equal((await session.recognize({ requestId, image: image(), mimeType: 'image/png', languageHints: [] }, { signal: new AbortController().signal })).requestId, requestId);
  assert.equal(starts, 1); assert.equal(closes, 0); await session.close(); await session.close(); assert.equal(closes, 1);
  await assert.rejects(session.recognize({ requestId: 'three', image: image(), mimeType: 'image/png', languageHints: [] }, { signal: new AbortController().signal }));
});
test('warm close aborts active inference and remains pending until real native child close acknowledgement', async t => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() { return true; } }) as unknown as ChildProcessWithoutNullStreams & { stdout: PassThrough };
  t.mock.method(childProcess, 'spawn', (() => child) as unknown as typeof childProcess.spawn); syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  let received!: () => void;
  const request = new Promise<void>(resolve => { received = resolve; }); child.stdin.on('data', received);
  const session = new MemberPaddleSession(config, c => new PaddleOcrSidecarAdapter(c));
  const operation = session.recognize({ requestId: 'one', image: image(), mimeType: 'image/png', languageHints: [] }, { signal: new AbortController().signal });
  const rejected = assert.rejects(operation);
  child.stdout.write(JSON.stringify({ ready: true, engine: PADDLE_OCR_ENGINE_ID }) + '\n'); await request;
  let closed = false; const closing = session.close().then(() => { closed = true; }); await rejected;
  child.emit('exit', null, 'SIGKILL'); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(closed, false);
  child.emit('close', null, 'SIGKILL'); await closing; assert.equal(closed, true);
});
test('invalid input never launches session, engine failure forbids another recognition and close rejection is retained', async () => {
  let starts = 0;
  const session = new MemberPaddleSession(config, () => { starts++; return { async recognizePage() { throw Error('private'); }, async close() { throw Error('closure failed'); } }; });
  await assert.rejects(session.recognize({ requestId: 'one', image: Buffer.from('bad'), mimeType: 'image/png', languageHints: [] }, { signal: new AbortController().signal })); assert.equal(starts, 0);
  await assert.rejects(session.recognize({ requestId: 'one', image: image(), mimeType: 'image/png', languageHints: [] }, { signal: new AbortController().signal }));
  await assert.rejects(session.recognize({ requestId: 'two', image: image(), mimeType: 'image/png', languageHints: [] }, { signal: new AbortController().signal })); assert.equal(starts, 1);
  await assert.rejects(session.close()); await assert.rejects(session.close());
});
