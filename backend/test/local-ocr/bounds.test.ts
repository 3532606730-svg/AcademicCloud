import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { LocalOcrService } from '../../src/local-ocr/service.js';
import { driveEntryVersion } from '../../src/drive/bulk.js';
import { LOCAL_OCR_LIMITS as LIMIT } from '@academiccloud/compute-contracts';
import { httpFixture, machine, MEMBER, OWNER, OTHER, ROOT, capabilities, probe } from './helpers.js';

test('coordinator enforces global eight/account one, frees cancelled image slots and bounds terminal metadata without evicting results', async (context) => {
  const f = await httpFixture(context);
  const connections = [];
  for (let index = 0; index < 9; index++) {
    const id = `bounded-member-${index}`;
    f.persistence.repositories.accounts.create({ id, loginName: id, passwordHash: 'test:workspace-password', role: 'member', state: 'active', createdAt: f.now(), updatedAt: f.now() });
    const source = f.file(`bounded-file-${index}`, id), code = f.service.pairing(id, 'Synthetic owned device').pairingCode;
    const connection = f.service.connect({ pairingCode: code, capabilities, probeResult: probe });
    f.service.claim(connection.deviceToken);
    connections.push({ id, source, connection });
  }
  const jobs = connections.slice(0, 8).map(({ id, source, connection }) => f.service.createRequest(id, f.input(connection, source.resourceId, source.sourceId)));
  const ninth = connections[8]!;
  assert.throws(() => f.service.createRequest(ninth.id, f.input(ninth.connection, ninth.source.resourceId, ninth.source.sourceId)), /limit_exceeded/);
  const first = connections[0]!;
  assert.throws(() => f.service.createRequest(first.id, { ...f.input(first.connection, first.source.resourceId, first.source.sourceId), clientRequestId: 'different' }), /limit_exceeded/);
  f.service.cancel(first.id, jobs[0]!.id);
  assert.equal(f.service.createRequest(ninth.id, f.input(ninth.connection, ninth.source.resourceId, ninth.source.sourceId)).state, 'queued');
  for (let index = 1; index < 8; index++) f.service.cancel(connections[index]!.id, jobs[index]!.id);
  for (let index = 0; index < 70; index++) {
    const job = f.service.createRequest(first.id, { ...f.input(first.connection, first.source.resourceId, first.source.sourceId), clientRequestId: `terminal-${index}` });
    f.service.cancel(first.id, job.id);
  }
  f.service.sweep();
  assert.throws(() => f.service.status(first.id, jobs[0]!.id), /not_found/);
  assert.equal(f.localRepository.countResults(first.id), 0);
  f.advance(5 * 60_000); f.service.sweep();
  assert.equal(f.service.claim(ninth.connection.deviceToken), null);
});

test('library membership removal and recoverable recycling prohibit all derived reads and pending device results', async (context) => {
  const f = await httpFixture(context), { source, library } = f.sharedFile(), connection = await f.connect();
  const first = await f.claimed(connection, source.resourceId, source.sourceId);
  const resultId = (await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: first.id, attemptId: first.attemptId, result: machine(first.id) })).json().resultId;
  const second = await f.claimed(connection, source.resourceId, source.sourceId, 'pending');
  f.database.prepare('DELETE FROM library_memberships WHERE library_id = ? AND account_id = ?').run(library.id, MEMBER.id);
  for (const [method, path, payload] of [['GET', `/results/${resultId}`, undefined], ['PATCH', `/results/${resultId}`, { revision: 1, correctedText: 'forbidden' }],
    ['GET', `/requests/${second.id}`, undefined], ['POST', `/requests/${second.id}/cancel`, {}]] as const) assert.equal((await f.request(MEMBER.id, method, `${ROOT}${path}`, payload)).statusCode, 404);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'heartbeat', { jobId: second.id, attemptId: second.attemptId })).statusCode, 404);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: second.id, attemptId: second.attemptId, result: machine(second.id) })).statusCode, 404);
  assert.equal(f.localRepository.countResults(MEMBER.id), 1);
  f.libraries.addMember(OWNER, library.id, MEMBER.id, 'member');
  const file = f.persistence.repositories.files.findByDomainId(`library:${library.id}`, source.resourceId)!;
  f.libraries.recycleHolding(OWNER, library.id, source.resourceId, driveEntryVersion(file));
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/results/${resultId}`)).statusCode, 404);
  assert.equal((await f.request(OWNER.id, 'GET', `${ROOT}/results/${resultId}`)).statusCode, 404);
});

test('disable and password revision invalidate pairings and device endpoints; old result persists across account reactivation', async (context) => {
  const f = await httpFixture(context), source = f.file('disabled-source'), connection = await f.connect();
  const claim = await f.claimed(connection, source.resourceId, source.sourceId);
  const pairingCode = f.service.pairing(MEMBER.id, 'Second device').pairingCode;
  f.persistence.repositories.accounts.updateState(MEMBER.id, 'active', 'disabled', f.now());
  assert.throws(() => f.service.connect({ pairingCode, capabilities, probeResult: probe }), /pairing_invalid/);
  for (const [method, path, payload] of [['GET', 'claim', undefined], ['POST', 'heartbeat', { jobId: claim.id, attemptId: claim.attemptId }],
    ['POST', 'complete', { jobId: claim.id, attemptId: claim.attemptId, result: machine(claim.id) }]] as const) assert.equal((await f.deviceRequest(connection.deviceToken, method, path, payload)).statusCode, 401);
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/devices`)).statusCode, 401);
  f.persistence.repositories.accounts.updateState(MEMBER.id, 'disabled', 'active', f.now());
  assert.throws(() => f.service.claim(connection.deviceToken), /device_authentication_required/);
  assert.throws(() => f.service.status(MEMBER.id, claim.id), /not_found/);
});

test('invalid text, forged request/provenance and malformed geometry never save a new result', async (context) => {
  const f = await httpFixture(context), source = f.file('bad-output-source'), connection = await f.connect();
  const badReplies = [
    (id: string) => machine('different-job'),
    (id: string) => ({ ...machine(id), text: 'bad\u0000text' }),
    (id: string) => ({ ...machine(id), provenance: { ...machine(id).provenance, engineVersion: 'forged' } }),
    (id: string) => ({ ...machine(id), lineBoxes: [{ start: 0, end: 10000, x: 0, y: 0, width: 1, height: 1 }] }),
    (id: string) => ({ ...machine(id), text: 'x'.repeat(16001) }),
    (id: string) => ({ ...machine(id), accountId: OWNER.id }),
  ];
  for (let index = 0; index < badReplies.length; index++) {
    const claim = await f.claimed(connection, source.resourceId, source.sourceId, `bad-${index}`);
    const response = await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: claim.id, attemptId: claim.attemptId, result: badReplies[index]!(claim.id) });
    assert.equal(response.statusCode, 400); assert.deepEqual(response.json(), { error: 'invalid_request' });
  }
  assert.equal(f.localRepository.countResults(MEMBER.id), 0);
  const failed = await f.claimed(connection, source.resourceId, source.sourceId, 'engine-busy');
  assert.deepEqual((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: failed.id, attemptId: failed.attemptId, errorCode: 'engine_busy' })).json(), { accepted: true, resultId: null });
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/requests/${failed.id}`)).json().job.errorCode, 'engine_busy');
});

test('successful rows survive coordinator restart; pending requests become unknown rather than completed', async (context) => {
  const f = await httpFixture(context), source = f.file('restart-real-source'), connection = await f.connect();
  const first = await f.claimed(connection, source.resourceId, source.sourceId);
  const resultId = (await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: first.id, attemptId: first.attemptId, result: machine(first.id) })).json().resultId;
  const pending = await f.claimed(connection, source.resourceId, source.sourceId, 'pending-restart');
  f.service.close();
  const restarted = new LocalOcrService(f.persistence, f.localRepository, f.repository, f.now);
  assert.throws(() => restarted.status(MEMBER.id, pending.id), /not_found/);
  assert.equal(restarted.result(MEMBER.id, resultId).machine.text, 'OCR_PRIVATE_SENTINEL');
  assert.equal(restarted.claim(connection.deviceToken), null);
  assert.throws(() => restarted.complete(connection.deviceToken, { jobId: pending.id, attemptId: pending.attemptId, result: machine(pending.id) }), /not_found/);
  assert.equal(f.localRepository.countResults(MEMBER.id), 1);
});

test('result quota is rechecked inside completion transaction and cannot replace already retained text', async (context) => {
  const f = await httpFixture(context), source = f.file('completion-quota-source'), connection = await f.connect();
  const first = await f.claimed(connection, source.resourceId, source.sourceId);
  const resultId = (await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: first.id, attemptId: first.attemptId, result: machine(first.id) })).json().resultId;
  const pending = await f.claimed(connection, source.resourceId, source.sourceId, 'pending-quota');
  const saved = f.localRepository.result(MEMBER.id, resultId)!;
  for (let index = 1; index < LIMIT.maxResultsPerAccount; index++) f.localRepository.saveResult(MEMBER.id, { ...saved, id: randomUUID() });
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: pending.id, attemptId: pending.attemptId, result: machine(pending.id) })).statusCode, 429);
  assert.equal(f.localRepository.countResults(MEMBER.id), LIMIT.maxResultsPerAccount);
  assert.deepEqual(f.localRepository.result(MEMBER.id, resultId), saved);
});
