import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { stat } from 'node:fs/promises';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import childProcess, { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { PassThrough } from 'node:stream';
import { LOCAL_OCR_BOOK_LIMITS, type LocalOcrBookClaim, type OcrEngineAdapter, type OcrEnginePageResult } from '@academiccloud/compute-contracts';
import { runMemberBookJob, parseMemberBookClaim, type MemberBookOptions } from '../src/member-book-ocr.js';
import { MEMBER_PADDLE_CAPABILITIES, MemberOcrError, MemberPaddleSession, type MemberPaddleConfig } from '../src/member-paddle.js';
import { PaddleOcrSidecarAdapter, PADDLE_OCR_ENGINE_ID } from '../src/paddle-ocr.js';

const bytes = Buffer.from('%PDF-1.7\nsynthetic fixture, decoder injected');
const image = createCanvas(32, 64).toBuffer('image/png');
function claim(count = 10, saved = [4]): LocalOcrBookClaim {
  const expiry = new Date(Date.now() + 89_000).toISOString();
  return { job: { id: 'book1', clientRequestId: 'request1', deviceId: 'device1', resourceId: 'resource1', sourceId: 'source1', pageCount: count,
    state: 'running', errorCode: null, failedPhysicalPage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), leaseExpiresAt: expiry, savedPhysicalPages: saved }, attemptId: 'attempt1',
    leaseExpiresAt: expiry, pageCount: count, savedPhysicalPages: saved, capabilities: MEMBER_PADDLE_CAPABILITIES };
}
function fixture(book = claim()) {
  const controller = new AbortController(), order: string[] = [], captured: number[] = [], recognized: string[] = [], submissions: unknown[] = [];
  const checkpoints = new Set(book.savedPhysicalPages);
  let sourcePath = '', closeFails = false, owned = false;
  const result = (requestId: string): OcrEnginePageResult => ({ requestId, status: 'recognized', text: 'synthetic', confidence: 90, truncated: false,
    provenance: { engineId: MEMBER_PADDLE_CAPABILITIES.engineId, engineVersion: MEMBER_PADDLE_CAPABILITIES.engineVersion, modelVersion: MEMBER_PADDLE_CAPABILITIES.modelVersion } });
  const options: MemberBookOptions = {
    capabilities: MEMBER_PADDLE_CAPABILITIES, signal: controller.signal,
    resourceGuard: { async acquire() { assert.equal(owned, false); order.push('acquire'); owned = true; return { signal: new AbortController().signal, async release() { order.push('release'); owned = false; } }; } },
    sessionFactory: () => { assert.equal(owned, true); order.push('session'); return { async capabilities() { return MEMBER_PADDLE_CAPABILITIES; }, async recognize(request) { recognized.push(request.requestId); return result(request.requestId); }, async close() { order.push('close'); if (closeFails) throw Error('native closure failed'); } }; },
    async pdfFactory(path) { sourcePath = path; return { pageCount: book.pageCount, async capture(page) { assert.equal(owned, true); captured.push(page); return { image, imageWidth: 32, imageHeight: 64, rotation: 0, renderMs: 1 }; }, async close() { order.push('pdfClose'); } }; },
    async delay(ms) { assert.equal(ms, LOCAL_OCR_BOOK_LIMITS.sliceYieldMs); assert.equal(owned, false); order.push('yield'); },
    fetch: async (_url, init) => { assert.equal(init?.headers, undefined); return new Response(bytes); },
    async request(path, body) {
      const input = body as Record<string, unknown>;
      assert.equal(input.bookId, book.job.id); assert.equal(input.attemptId, book.attemptId);
      if (path.endsWith('book-source')) return { resourceId: book.job.resourceId, sourceId: book.job.sourceId, url: 'https://files.ajtlab.top/object?opaque',
        expiresAt: new Date(Date.now() + 299_000).toISOString(), sizeBytes: bytes.length, checksumAlgorithm: 'sha256', checksum: createHash('sha256').update(bytes).digest('hex'), etag: null };
      if (path.endsWith('book-heartbeat')) return { active: true, leaseExpiresAt: new Date(Date.now() + 89_000).toISOString(), savedPhysicalPages: [...checkpoints] };
      if (path.endsWith('book-page')) { submissions.push(body); checkpoints.add(Number(input.physicalPage)); return { accepted: true, resultId: `result${input.physicalPage}`, savedPhysicalPages: [...checkpoints] }; }
      if (path.endsWith('book-finish')) { order.push('finish'); return { job: { ...book.job, state: input.errorCode ? 'failed' : 'succeeded', savedPhysicalPages: [...checkpoints] } }; }
      throw Error('unexpected endpoint');
    },
  };
  return { book, options, controller, order, captured, recognized, submissions, checkpoints, result,
    get sourcePath() { return sourcePath; }, get owned() { return owned; }, set closeFails(value: boolean) { closeFails = value; } };
}
test('claim validates source/task state, declared bound, saved pages, lease and exact engine snapshot', () => {
  const c = claim(); assert.equal(parseMemberBookClaim(c, MEMBER_PADDLE_CAPABILITIES).pageCount, 10);
  for (const value of [{ ...c, pageCount: 501 }, { ...c, savedPhysicalPages: [0] }, { ...c, savedPhysicalPages: [1, 1] },
    { ...c, job: { ...c.job, state: 'paused' } }, { ...c, leaseExpiresAt: new Date(0).toISOString() }, { ...c, capabilities: { ...c.capabilities, modelVersion: 'other' } }]) {
    assert.throws(() => parseMemberBookClaim(value, MEMBER_PADDLE_CAPABILITIES));
  }
});
test('book skips server checkpoints and uses eight-page slices, close-before-release, two-second yield and private cleanup', async () => {
  const f = fixture(); await runMemberBookJob(f.book, f.options);
  assert.deepEqual(f.captured, [1, 2, 3, 5, 6, 7, 8, 9, 10]); assert.equal(f.recognized.length, 9); assert.equal(f.submissions.length, 9);
  assert.deepEqual(f.order, ['acquire', 'session', 'close', 'release', 'yield', 'acquire', 'session', 'close', 'release', 'yield', 'finish', 'pdfClose']);
  await assert.rejects(stat(f.sourcePath));
});
test('uncertain page ack replays identical payload once after authority check, never captures or infers twice', async () => {
  const f = fixture(claim(1, [])); const request = f.options.request; let attempts = 0; const sent: string[] = [];
  f.options.request = async (path, body, signal) => {
    if (path.endsWith('book-page')) { attempts++; sent.push(JSON.stringify(body)); if (attempts === 1) { await request(path, body, signal); throw new MemberOcrError('network_failed'); } }
    return request(path, body, signal);
  };
  await runMemberBookJob(f.book, f.options); assert.equal(attempts, 2); assert.equal(sent[0], sent[1]); assert.equal(f.captured.length, 1); assert.equal(f.recognized.length, 1);
});
test('network loss cannot retry engine or infer another page; failed attempt requires later explicit resume', async () => {
  const f = fixture(claim(2, [])); const request = f.options.request; let acks = 0;
  f.options.request = async (path, body, signal) => { if (path.endsWith('book-page')) { acks++; throw new MemberOcrError('network_failed'); } if (path.endsWith('book-heartbeat') && acks) throw new MemberOcrError('network_failed'); return request(path, body, signal); };
  await runMemberBookJob(f.book, f.options); assert.equal(acks, 1); assert.equal(f.recognized.length, 1); assert.equal(f.order.includes('finish'), false); assert.equal(f.owned, false);
});
test('source hash or decoded page-count mismatch never starts native inference', async () => {
  for (const invalid of ['hash', 'count']) {
    const f = fixture(claim(1, []));
    if (invalid === 'hash') f.options.fetch = async () => new Response(Buffer.from('%PDF-wrong source bytes'));
    else f.options.pdfFactory = async path => ({ pageCount: 2, async capture() { throw Error('must not capture'); }, async close() { await stat(path); } });
    await runMemberBookJob(f.book, f.options); assert.equal(f.recognized.length, 0); assert.equal(f.order.includes('acquire'), false); assert.equal(f.order.includes('finish'), true);
  }
});
test('revoked heartbeat aborts in-flight inference, awaits native close and prevents any completion', async () => {
  const f = fixture(claim(2, [])); const request = f.options.request; let inference = false, aborted = false;
  f.options.heartbeatMs = 1;
  f.options.request = async (path, body, signal) => { if (path.endsWith('book-heartbeat') && inference) throw new MemberOcrError('access_revoked'); return request(path, body, signal); };
  f.options.sessionFactory = () => ({ async capabilities() { return MEMBER_PADDLE_CAPABILITIES; }, async recognize(_request, { signal }) {
    inference = true; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new MemberOcrError('aborted')); }, { once: true })); }, async close() { assert.equal(aborted, true); f.order.push('close'); } });
  await assert.rejects(runMemberBookJob(f.book, f.options), { message: 'access_revoked' }); assert.equal(f.submissions.length, 0); assert.equal(aborted, true); assert.equal(f.owned, false);
});
test('native close failure deliberately retains guard and does not acquire another slice', async () => {
  const f = fixture(); f.closeFails = true; await runMemberBookJob(f.book, f.options);
  assert.equal(f.order.filter(x => x === 'acquire').length, 1); assert.equal(f.order.includes('release'), false); assert.equal(f.owned, true);
});
test('book guard stays owned across exit until the real adapter child close event acknowledges cleanup', async t => {
  const f = fixture(claim(1, []));
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() { return true; } }) as unknown as ChildProcessWithoutNullStreams & { stdout: PassThrough };
  let closing!: () => void; const closingStarted = new Promise<void>(resolve => { closing = resolve; }); child.stdin.on('finish', closing);
  child.stdin.on('data', (bytes: Buffer) => { const request = JSON.parse(bytes.toString()) as { id: string }; child.stdout.write(JSON.stringify({ id: request.id, status: 'recognized', text: 'synthetic', confidence: 90 }) + '\n'); });
  t.mock.method(childProcess, 'spawn', (() => { queueMicrotask(() => child.stdout.write(JSON.stringify({ ready: true, engine: PADDLE_OCR_ENGINE_ID }) + '\n')); return child; }) as unknown as typeof childProcess.spawn); syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const config: MemberPaddleConfig = { pythonPath: '/mock', sidecarPath: '/mock', detectionModelPath: '/mock', recognitionModelPath: '/mock', cachePath: '/mock', device: 'gpu', nativeResource: { pythonPath: '/mock', lockPath: '/mock' } };
  f.options.sessionFactory = () => new MemberPaddleSession(config, c => new PaddleOcrSidecarAdapter(c));
  const running = runMemberBookJob(f.book, f.options); await closingStarted;
  child.emit('exit', null, 'SIGKILL'); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(f.owned, true); assert.equal(f.order.includes('release'), false);
  child.emit('close', null, 'SIGKILL'); await running; assert.equal(f.owned, false); assert.equal(f.submissions.length, 1);
});
test('pause/cancel rejects the next authority check and external connector stop cancels current inference', async () => {
  const f = fixture(claim(2, [])); const request = f.options.request; let firstSaved = false;
  f.options.request = async (path, body, signal) => { if (path.endsWith('book-heartbeat') && firstSaved) throw new MemberOcrError('protocol_invalid'); const output = await request(path, body, signal); if (path.endsWith('book-page')) firstSaved = true; return output; };
  await runMemberBookJob(f.book, f.options); assert.equal(f.recognized.length, 1); assert.equal(f.submissions.length, 1);
  const aborted = fixture(claim(2, [])); aborted.options.sessionFactory = () => ({ async capabilities() { return MEMBER_PADDLE_CAPABILITIES; }, async recognize(_request, { signal }) {
    setImmediate(() => aborted.controller.abort()); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new MemberOcrError('aborted')), { once: true })); }, async close() { aborted.order.push('close'); } });
  await runMemberBookJob(aborted.book, aborted.options); assert.equal(aborted.submissions.length, 0); assert.equal(aborted.owned, false);
});
test('invalid engine output stops after the first page and never publishes it as a saved checkpoint', async () => {
  const f = fixture(claim(2, [])); f.options.sessionFactory = () => ({ async capabilities() { return MEMBER_PADDLE_CAPABILITIES; }, async recognize() { return { ...f.result('foreign'), text: 'private' }; }, async close() { f.order.push('close'); } });
  await runMemberBookJob(f.book, f.options); assert.equal(f.captured.length, 1); assert.equal(f.submissions.length, 0); assert.equal(f.order.includes('finish'), true);
});
test('45-second slice condition yields at page boundary without truncating an active page deadline', async t => {
  const f = fixture(claim(2, [])); let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const create = f.options.sessionFactory;
  f.options.sessionFactory = timing => { const session = create(timing); const recognize = session.recognize.bind(session); session.recognize = async (request, options) => { assert.equal(options.signal.aborted, false); const result = await recognize(request, options); clock += 46_000; return result; }; return session; };
  await runMemberBookJob(f.book, f.options); assert.equal(f.order.filter(x => x === 'acquire').length, 2); assert.equal(f.recognized.length, 2);
});
test('heartbeat crossing the slice deadline closes and yields before rendering another page', async t => {
  const f = fixture(claim(2, [])); let clock = 0, crossings = 0;
  t.mock.method(performance, 'now', () => clock);
  const create = f.options.sessionFactory;
  f.options.sessionFactory = timing => {
    const session = create(timing), recognize = session.recognize.bind(session);
    session.recognize = async (request, options) => {
      const result = await recognize(request, options);
      if (request.requestId === 'book1-1') clock = 44_000;
      return result;
    };
    return session;
  };
  const request = f.options.request;
  f.options.request = async (path, body, signal) => {
    if (path.endsWith('book-heartbeat') && clock === 44_000) { clock = 46_000; crossings++; }
    return request(path, body, signal);
  };
  const openPdf = f.options.pdfFactory!;
  f.options.pdfFactory = async (...args) => {
    const pdf = await openPdf(...args), capture = pdf.capture.bind(pdf);
    pdf.capture = async (page, signal) => {
      if (page === 2) assert.deepEqual(f.order, ['acquire', 'session', 'close', 'release', 'yield', 'acquire', 'session']);
      return capture(page, signal);
    };
    return pdf;
  };
  await runMemberBookJob(f.book, f.options);
  assert.equal(crossings, 1); assert.equal(f.recognized.length, 2);
  assert.equal(f.order.filter(x => x === 'acquire').length, 2);
});
