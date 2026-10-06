import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LocalOcrBookProgress, LocalOcrBookQuery, LocalOcrResult } from '@academiccloud/compute-contracts';
import { LOCAL_OCR_LIMITS as LIMIT } from '@academiccloud/compute-contracts';
import { LocalOcrService } from '../../src/local-ocr/service.js';
import { driveEntryVersion } from '../../src/drive/bulk.js';
import { httpFixture, machine, MEMBER, OWNER, OTHER, ROOT, ORIGIN } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof httpFixture>>;
const url = (path: string, query: LocalOcrBookQuery) => `${ROOT}/${path}?resourceId=${query.resourceId}&sourceId=${query.sourceId}&pageCount=${query.pageCount}`;
const bookQuery = (source: Pick<LocalOcrBookQuery, 'resourceId' | 'sourceId'>, pageCount: number): LocalOcrBookQuery => ({ resourceId: source.resourceId, sourceId: source.sourceId, pageCount });
async function retained(f: Fixture, query: LocalOcrBookQuery): Promise<LocalOcrResult> {
  const connection = await f.connect();
  const claim = await f.claimed(connection, query.resourceId, query.sourceId);
  const completed = await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: claim.id, attemptId: claim.attemptId, result: machine(claim.id) });
  assert.equal(completed.statusCode, 200);
  return f.localRepository.result(MEMBER.id, completed.json().resultId)!;
}

test('book metadata is account-private, source-bound, bounded and carries no OCR text or images', async (context) => {
  const f = await httpFixture(context), { source, library } = f.sharedFile();
  f.libraries.addMember(OWNER, library.id, OTHER.id, 'member');
  const query = bookQuery(source, 3);
  const saved = await retained(f, query);
  const response = await f.request(MEMBER.id, 'GET', url('book-progress', query));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.deepEqual(response.json(), { ...query, pages: [{ physicalPage: 1, resultId: saved.id, rotation: 0, status: 'recognized',
    truncated: false, hasCorrection: false, createdAt: saved.createdAt }], quota: { used: 1, limit: 500, remaining: 499 }, activeJob: null, accountBusy: false });
  assert.doesNotMatch(response.body, /OCR_PRIVATE_SENTINEL|imageBase64|machine|correctedText|imageSha256/);
  for (const actor of [OWNER, OTHER]) {
    const progress = (await f.request(actor.id, 'GET', url('book-progress', query))).json<LocalOcrBookProgress>();
    assert.deepEqual(progress.pages, []);
    assert.deepEqual(progress.quota, { used: 0, limit: 500, remaining: 500 });
    assert.equal(progress.activeJob, null);
    const exported = await f.request(actor.id, 'GET', `${url('book-export', query)}&format=jsonl`);
    assert.equal(exported.statusCode, 200);
    assert.doesNotMatch(exported.body, /OCR_PRIVATE_SENTINEL/);
    assert.equal(JSON.parse(exported.body.trim().split('\n').at(-1)!).missingPages, 3);
  }
  assert.equal((await f.app.inject({ method: 'GET', url: url('book-progress', query), headers: { origin: ORIGIN } })).statusCode, 401);
  assert.equal((await f.app.inject({ method: 'GET', url: `${url('book-export', query)}&format=txt`, headers: { origin: ORIGIN } })).statusCode, 401);
  for (const pageCount of [0, 501, 1.5]) assert.equal((await f.request(MEMBER.id, 'GET', url('book-progress', { ...query, pageCount }))).statusCode, 400);
  assert.equal((await f.request(MEMBER.id, 'GET', `${url('book-progress', query)}&accountId=${OWNER.id}`)).statusCode, 400);
  assert.equal((await f.request(MEMBER.id, 'GET', `${url('book-export', query)}&format=csv`)).statusCode, 400);
  assert.equal((await f.request(MEMBER.id, 'GET', `${url('book-export', query)}&format=txt&imageBase64=unexpected`)).statusCode, 400);
  assert.throws(() => f.service.bookProgress(MEMBER.id, { ...query, pageCount: 501 }), /invalid_request/);
});

test('latest physical-page summaries retain explicit quality, rotation and correction semantics', async (context) => {
  const f = await httpFixture(context), source = f.file('quality-book');
  const query = bookQuery(source, 5), saved = await retained(f, query);
  f.advance(1000);
  const newer: LocalOcrResult = { ...saved, id: 'newer-machine', rotation: 90, createdAt: f.now().toISOString(), updatedAt: f.now().toISOString(),
    machine: { ...machine('newer'), status: 'low_confidence', truncated: true } };
  f.localRepository.saveResult(MEMBER.id, newer);
  f.advance(1000);
  f.service.correct(MEMBER.id, saved.id, { revision: 1, correctedText: 'Preserve this older correction' });
  for (const [physicalPage, status, text] of [[2, 'no_text', null], [3, 'unsupported_script', null], [4, 'low_confidence', 'uncertain']] as const) {
    f.localRepository.saveResult(MEMBER.id, { ...saved, id: `quality-${physicalPage}`, physicalPage,
      correctedText: physicalPage === 4 ? 'Explicit private correction' : null,
      machine: { requestId: `quality-${physicalPage}`, status, text, truncated: false, confidence: null, provenance: saved.machine.provenance } });
  }
  // Results outside the browser-declared extent still count against account quota.
  f.localRepository.saveResult(MEMBER.id, { ...saved, id: 'outside-extent', physicalPage: 20 });
  const progress = (await f.request(MEMBER.id, 'GET', url('book-progress', query))).json<LocalOcrBookProgress>();
  assert.deepEqual(progress.pages.map((p) => [p.physicalPage, p.resultId, p.status, p.truncated, p.rotation, p.hasCorrection]), [
    [1, newer.id, 'low_confidence', true, 90, false], [2, 'quality-2', 'no_text', false, 0, false],
    [3, 'quality-3', 'unsupported_script', false, 0, false], [4, 'quality-4', 'low_confidence', false, 0, true],
  ]);
  assert.equal(progress.quota.used, 6);
  assert.equal(f.service.result(MEMBER.id, saved.id).correctedText, 'Preserve this older correction');
});

test('book progress reconciles owned active work, reports other-source busy without disclosing it, and sweeps cancellation/expiry/restart', async (context) => {
  const f = await httpFixture(context), source = f.file('active-book'), other = f.file('other-active-book');
  const query = bookQuery(source, 2), connection = await f.connect();
  const job = f.service.createRequest(MEMBER.id, f.input(connection, source.resourceId, source.sourceId));
  assert.equal(f.service.bookProgress(MEMBER.id, query).activeJob?.id, job.id);
  assert.equal(f.service.bookProgress(MEMBER.id, query).accountBusy, true);
  const claim = f.service.claim(connection.deviceToken)!;
  assert.equal(f.service.bookProgress(MEMBER.id, query).activeJob?.state, 'running');
  const otherProgress = f.service.bookProgress(MEMBER.id, bookQuery(other, 1));
  assert.equal(otherProgress.accountBusy, true); assert.equal(otherProgress.activeJob, null);
  assert.doesNotMatch(JSON.stringify(otherProgress), /"resourceId":"active-book"|imageBase64|attemptId/);
  f.service.cancel(MEMBER.id, claim.id);
  assert.equal(f.service.bookProgress(MEMBER.id, query).accountBusy, false);
  const pending = f.service.createRequest(MEMBER.id, { ...f.input(connection, source.resourceId, source.sourceId), clientRequestId: 'expired' });
  f.advance(LIMIT.requestLifetimeMs);
  assert.equal(f.service.bookProgress(MEMBER.id, query).activeJob, null);
  assert.equal(f.service.status(MEMBER.id, pending.id).errorCode, 'expired');
  f.service.close();
  const restarted = new LocalOcrService(f.persistence, f.localRepository, f.repository, f.now);
  assert.equal(restarted.bookProgress(MEMBER.id, query).accountBusy, false);
  assert.deepEqual(restarted.bookProgress(MEMBER.id, query).pages, []);
});

test('500-page progress is metadata-only and the retained quota includes other books and retries without eviction', async (context) => {
  const f = await httpFixture(context), source = f.file('full-book');
  const query = bookQuery(source, LIMIT.maxResultsPerAccount), saved = await retained(f, query);
  for (let physicalPage = 2; physicalPage <= 500; physicalPage++) {
    f.localRepository.saveResult(MEMBER.id, { ...saved, id: `retained-${physicalPage}`, physicalPage, machine: machine(`page-${physicalPage}`, 'x'.repeat(16_000)) });
  }
  const response = await f.request(MEMBER.id, 'GET', url('book-progress', query));
  assert.equal(response.statusCode, 200);
  const progress = response.json<LocalOcrBookProgress>();
  assert.equal(progress.pages.length, 500); assert.equal(progress.pages.at(-1)?.physicalPage, 500);
  assert.deepEqual(progress.quota, { used: 500, limit: 500, remaining: 0 });
  assert.ok(response.body.length < 150_000);
  assert.doesNotMatch(response.body, /OCR_PRIVATE_SENTINEL|xxxxxxxx/);
  const connection = { device: { id: saved.deviceId } } as Parameters<Fixture['input']>[0];
  assert.throws(() => f.service.createRequest(MEMBER.id, { ...f.input(connection, source.resourceId, source.sourceId), clientRequestId: 'over-quota' }), /limit_exceeded/);
  assert.equal(f.localRepository.countResults(MEMBER.id), 500);
});

test('book export preserves raw/corrected provenance and includes every page, explicit missing markers and an end record', async (context) => {
  const f = await httpFixture(context), source = f.file('export-book');
  const query = bookQuery(source, 3), saved = await retained(f, query);
  f.service.correct(MEMBER.id, saved.id, { revision: 1, correctedText: 'MY_PRIVATE_CORRECTION\nSecond line' });
  f.localRepository.saveResult(MEMBER.id, { ...saved, id: 'unsupported-export-page', physicalPage: 3,
    machine: { requestId: 'unsupported-page', status: 'unsupported_script', text: null, truncated: false, confidence: null, provenance: saved.machine.provenance } });
  const response = await f.request(MEMBER.id, 'GET', `${url('book-export', query)}&format=jsonl`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/x-ndjson; charset=utf-8');
  assert.equal(response.headers['content-disposition'], 'attachment; filename="academiccloud-private-ocr-book.jsonl"');
  assert.equal(response.headers['cache-control'], 'private, no-store');
  const rows = response.body.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(rows[0], { type: 'book', ...query, origin: 'client_rendered_unverified' });
  assert.equal(rows[1].physicalPage, 1); assert.equal(rows[1].resultId, saved.id); assert.equal(rows[1].rawText, 'OCR_PRIVATE_SENTINEL');
  assert.equal(rows[1].correctedText, 'MY_PRIVATE_CORRECTION\nSecond line'); assert.equal(rows[1].revision, 2);
  assert.deepEqual(rows[1].provenance, saved.machine.provenance);
  assert.equal(rows[1].imageSha256, saved.imageSha256); assert.equal(rows[1].imageWidth, 100); assert.equal(rows[1].imageHeight, 200);
  assert.equal(rows[1].confidence, saved.machine.confidence); assert.deepEqual(rows[1].lineBoxes, saved.machine.lineBoxes);
  assert.deepEqual(rows[2], { type: 'page', resourceId: source.resourceId, sourceId: source.sourceId, physicalPage: 2, state: 'missing' });
  assert.equal(rows[3].status, 'unsupported_script'); assert.equal(rows[3].rawText, null); assert.equal(rows[3].truncated, false);
  assert.deepEqual(rows[4], { type: 'end', ...query, savedPages: 2, missingPages: 1 });
  const text = await f.request(MEMBER.id, 'GET', `${url('book-export', query)}&format=txt`);
  assert.equal(text.statusCode, 200); assert.equal(text.headers['content-type'], 'text/plain; charset=utf-8');
  assert.ok(text.body.includes(`Resource: ${source.resourceId}\nSource: ${source.sourceId}`));
  for (let page = 1; page <= 3; page++) assert.ok(text.body.includes(`=== Physical page ${page} ===`));
  assert.match(text.body, /Text kind: corrected\nText:\nMY_PRIVATE_CORRECTION\nSecond line\nRaw machine text:\nOCR_PRIVATE_SENTINEL/);
  assert.match(text.body, /=== Physical page 2 ===\nStatus: missing/);
  assert.match(text.body, /Status: unsupported_script\nTruncated: false/);
  assert.match(text.body, /=== End of export ===/);
  assert.doesNotMatch(text.body + response.body, /imageBase64|objectKey|storageProvider|signedUrl|canonical/);
  assert.doesNotMatch(f.logs.join(''), /OCR_PRIVATE_SENTINEL|MY_PRIVATE_CORRECTION/);
});

test('book exports snapshot latest IDs, load one payload at a time and reauthorize on every row including missing pages', async (context) => {
  const f = await httpFixture(context), source = f.file('stream-book');
  const query = bookQuery(source, 3), saved = await retained(f, query);
  f.localRepository.saveResult(MEMBER.id, { ...saved, id: 'third-page', physicalPage: 3 });
  let reads = 0;
  const read = f.localRepository.result.bind(f.localRepository);
  f.localRepository.result = (accountId, id) => { reads++; return read(accountId, id); };
  const iterator = f.service.bookExport(MEMBER.id, query, 'jsonl')[Symbol.iterator]();
  assert.equal(reads, 0);
  assert.equal(JSON.parse(iterator.next().value!).type, 'book'); assert.equal(reads, 0);
  assert.equal(JSON.parse(iterator.next().value!).physicalPage, 1); assert.equal(reads, 1);
  // New successful history after the snapshot must not silently enter this export.
  f.advance(1000);
  f.localRepository.saveResult(MEMBER.id, { ...saved, id: 'later-third-page', physicalPage: 3, createdAt: f.now().toISOString(), updatedAt: f.now().toISOString() });
  assert.equal(JSON.parse(iterator.next().value!).state, 'missing'); assert.equal(reads, 1);
  assert.equal(JSON.parse(iterator.next().value!).resultId, 'third-page'); assert.equal(reads, 2);
  const account = f.persistence.repositories.accounts.findById(MEMBER.id)!;
  f.persistence.repositories.accounts.updatePassword(MEMBER.id, account.passwordHash, account.authRevision, 'test:changed-password', f.now());
  assert.throws(() => iterator.next(), /not_found/); // No successful end marker after authority loss.
  assert.equal(reads, 2);
});

test('book progress and exports deny inaccessible, replaced, recycled and membership-revoked sources while retaining private rows', async (context) => {
  const f = await httpFixture(context), { source, library } = f.sharedFile();
  const query = bookQuery(source, 2), saved = await retained(f, query);
  const iterator = f.service.bookExport(MEMBER.id, query, 'txt')[Symbol.iterator]();
  iterator.next(); iterator.next();
  f.database.prepare('DELETE FROM library_memberships WHERE library_id = ? AND account_id = ?').run(library.id, MEMBER.id);
  assert.throws(() => iterator.next(), /not_found/);
  for (const path of ['book-progress', 'book-export']) {
    const suffix = path === 'book-export' ? '&format=txt' : '';
    const response = await f.request(MEMBER.id, 'GET', url(path, query) + suffix);
    assert.equal(response.statusCode, 404); assert.deepEqual(response.json(), { error: 'not_found' });
  }
  f.libraries.addMember(OWNER, library.id, MEMBER.id, 'member');
  const file = f.persistence.repositories.files.findByDomainId(`library:${library.id}`, source.resourceId)!;
  f.libraries.recycleHolding(OWNER, library.id, source.resourceId, driveEntryVersion(file));
  assert.throws(() => f.service.bookProgress(MEMBER.id, query), /not_found/);
  assert.equal(f.localRepository.result(MEMBER.id, saved.id)?.machine.text, 'OCR_PRIVATE_SENTINEL');
  const privateSource = f.file('replacement-book'), privateQuery = bookQuery(privateSource, 1);
  assert.equal((await f.request(OWNER.id, 'GET', url('book-progress', privateQuery))).statusCode, 404);
  assert.equal((await f.request(OWNER.id, 'GET', `${url('book-export', privateQuery)}&format=txt`)).statusCode, 404);
  const replacing = f.service.bookExport(MEMBER.id, privateQuery, 'jsonl')[Symbol.iterator]();
  replacing.next();
  f.database.prepare("UPDATE files SET object_key = 'objects/replaced-book' WHERE id = ?").run(privateSource.resourceId);
  assert.throws(() => replacing.next(), /not_found/);
  assert.throws(() => f.service.bookProgress(MEMBER.id, privateQuery), /not_found/);
  assert.throws(() => f.service.bookExport(MEMBER.id, privateQuery, 'txt'), /not_found/);
});
