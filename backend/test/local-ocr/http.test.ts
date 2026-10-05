import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCAL_OCR_LIMITS as LIMIT, LOCAL_OCR_PROBE_REQUEST_ID } from '@academiccloud/compute-contracts';
import { httpFixture, capabilities, probe, machine, png, MEMBER, OWNER, OTHER, ROOT, ORIGIN } from './helpers.js';

test('real Auth/HTTP/SQLite pairing, claim and immutable private results with correction CAS and append-only retry', async (context) => {
  const f = await httpFixture(context), { source } = f.sharedFile();
  const connection = await f.connect();
  assert.equal(connection.device.online, false); // Only authenticated polling establishes online presence.
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/devices`)).json().devices[0].online, true);
  const claim = await f.claimed(connection, source.resourceId, source.sourceId);
  assert.equal(claim.imageBase64, png().toString('base64'));
  assert.equal(claim.imageSha256.length, 64);
  assert.deepEqual((await f.deviceRequest(connection.deviceToken, 'GET', 'claim')).json(), { job: null });
  assert.deepEqual((await f.deviceRequest(connection.deviceToken, 'POST', 'heartbeat', { jobId: claim.id, attemptId: claim.attemptId })).json(), { active: true });
  const completion = await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: claim.id, attemptId: claim.attemptId, result: machine(claim.id) });
  assert.equal(completion.statusCode, 200);
  const resultId = completion.json().resultId;
  const saved = (await f.request(MEMBER.id, 'GET', `${ROOT}/results/${resultId}`)).json().result;
  assert.equal(saved.origin, 'client_rendered_unverified');
  assert.equal(saved.correctedText, null);
  assert.deepEqual(saved.machine, machine(claim.id));
  const corrected = await f.request(MEMBER.id, 'PATCH', `${ROOT}/results/${resultId}`, { revision: 1, correctedText: 'MY_PRIVATE_CORRECTION' });
  assert.equal(corrected.statusCode, 200); assert.equal(corrected.json().result.revision, 2);
  assert.equal((await f.request(MEMBER.id, 'PATCH', `${ROOT}/results/${resultId}`, { revision: 1, correctedText: 'old draft' })).statusCode, 409);
  const next = await f.claimed(connection, source.resourceId, source.sourceId, 'client-retry');
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: next.id, attemptId: next.attemptId, result: machine(next.id, 'RETRY_MACHINE') })).statusCode, 200);
  const items = (await f.request(MEMBER.id, 'GET', `${ROOT}/results?resourceId=${source.resourceId}&sourceId=${source.sourceId}&physicalPage=1`)).json().items;
  assert.equal(items.length, 2);
  assert.equal(items.find((r: { id: string }) => r.id === resultId).correctedText, 'MY_PRIVATE_CORRECTION');
  for (const actor of [OWNER, OTHER]) {
    assert.deepEqual((await f.request(actor.id, 'GET', `${ROOT}/devices`)).json(), { devices: [] });
    for (const [method, url, payload] of [
      ['GET', `${ROOT}/results/${resultId}`, undefined], ['PATCH', `${ROOT}/results/${resultId}`, { revision: 2, correctedText: 'stolen' }],
      ['GET', `${ROOT}/requests/${claim.id}`, undefined], ['POST', `${ROOT}/requests/${claim.id}/cancel`, {}], ['POST', `${ROOT}/devices/${connection.device.id}/revoke`, {}],
    ] as const) {
      const response = await f.request(actor.id, method, url, payload);
      assert.equal(response.statusCode, 404); assert.deepEqual(response.json(), { error: 'not_found' });
    }
  }
  const terminal = await f.request(MEMBER.id, 'GET', `${ROOT}/requests/${claim.id}`);
  assert.equal(terminal.json().job.state, 'succeeded');
  assert.doesNotMatch(terminal.body, /imageBase64|OCR_PRIVATE_SENTINEL/);
  const persistentRows = JSON.stringify(f.database.prepare('SELECT * FROM personal_local_ocr_devices').all()) + JSON.stringify(f.database.prepare('SELECT * FROM personal_local_ocr_pairings').all());
  assert.doesNotMatch(persistentRows, new RegExp(connection.deviceToken));
  assert.doesNotMatch(f.logs.join(''), /OCR_PRIVATE_SENTINEL|MY_PRIVATE_CORRECTION|RETRY_MACHINE/);
  assert.ok(!f.logs.join('').includes(connection.deviceToken));
  assert.throws(() => f.database.prepare('UPDATE personal_local_ocr_results SET machine_json = ? WHERE id = ?').run('{}', resultId), /immutable/);
  assert.throws(() => f.database.prepare('DELETE FROM personal_local_ocr_results WHERE id = ?').run(resultId), /retained/);
  assert.deepEqual(f.database.prepare('PRAGMA foreign_key_check').all(), []);
});

test('session endpoints have no anonymous or Owner fallback; origin, body, bearer URL and synthetic probe gates fail closed', async (context) => {
  const f = await httpFixture(context), source = f.file('private-source');
  for (const [method, path, payload] of [['GET', '/devices', undefined], ['POST', '/pairing', { label: 'test' }],
    ['GET', '/requests/unknown', undefined], ['POST', '/requests/unknown/cancel', {}], ['GET', '/results/unknown', undefined],
    ['POST', '/devices/unknown/revoke', {}], ['PATCH', '/results/unknown', { revision: 1, correctedText: 'test' }],
  ] as const) assert.equal((await f.app.inject({ method, url: `${ROOT}${path}`, headers: { origin: ORIGIN }, ...(payload ? { payload } : {}) })).statusCode, 401);
  assert.equal((await f.request(OWNER.id, 'GET', `${ROOT}/results?resourceId=${source.resourceId}&sourceId=${source.sourceId}&physicalPage=1`)).statusCode, 404);
  const connection = await f.connect();
  assert.equal((await f.app.inject({ method: 'POST', url: `${ROOT}/pairing`, headers: { cookie: f.cookies[MEMBER.id]! }, payload: { label: 'test' } })).statusCode, 403);
  assert.equal((await f.app.inject({ method: 'GET', url: `${ROOT}/device/claim?token=${connection.deviceToken}` })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'GET', url: `${ROOT}/device/claim`, headers: { cookie: f.cookies[MEMBER.id]! } })).statusCode, 401);
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/pairing`, { label: 'test', accountId: OWNER.id })).statusCode, 400);
  const pairing = (await f.request(MEMBER.id, 'POST', `${ROOT}/pairing`, { label: 'second device' })).json();
  const connect = (patch: object) => f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: pairing.pairingCode, capabilities, probeResult: probe, ...patch } });
  for (const patch of [{ probeResult: machine(LOCAL_OCR_PROBE_REQUEST_ID, 'different text') }, { capabilities: { ...capabilities, inputMimeTypes: ['image/jpeg'] } },
    { probeResult: { ...probe, provenance: { ...probe.provenance, engineVersion: 'other' } } }, { capabilities: { ...capabilities, ownerToken: 'secret' } }]) assert.equal((await connect(patch)).statusCode, 400);
  assert.equal((await connect({})).statusCode, 200);
  assert.equal((await connect({})).statusCode, 401);
  assert.equal((await f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: 'SECRET_INPUT', capabilities, probeResult: probe } })).json().error, 'pairing_invalid');
  const secretFields = { pairingCode: pairing.pairingCode, deviceToken: connection.deviceToken, imageBase64: 'RAW_IMAGE_SENTINEL',
    probeResult: { text: 'PROBE_TEXT_SENTINEL' }, result: { text: 'OCR_OUTPUT_SENTINEL' }, machine: { text: 'SAVED_MACHINE_SENTINEL' }, correctedText: 'CORRECTED_TEXT_SENTINEL' };
  // Exercise the redactor independently of today's body-free serializers.
  f.app.log.info({ ...secretFields, body: secretFields, nested: secretFields }, 'synthetic redaction boundary');
  assert.doesNotMatch(f.logs.join(''), /SECRET_INPUT/);
  for (const value of [pairing.pairingCode, connection.deviceToken, 'RAW_IMAGE_SENTINEL', 'PROBE_TEXT_SENTINEL', 'OCR_OUTPUT_SENTINEL', 'SAVED_MACHINE_SENTINEL', 'CORRECTED_TEXT_SENTINEL']) assert.ok(!f.logs.join('').includes(value));
});

test('idempotency binds exact frame and current source; one account request and no automatic reclaims after cancel or lease expiry', async (context) => {
  const f = await httpFixture(context), source = f.file('idempotent-source'), connection = await f.connect();
  const input = f.input(connection, source.resourceId, source.sourceId);
  const first = await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, input);
  assert.equal(first.statusCode, 200); const job = first.json().job;
  assert.deepEqual((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, input)).json(), first.json());
  for (const patch of [{ physicalPage: 2 }, { rotation: 90 }, { imageBase64: png(100, 200, 34).toString('base64') }])
    assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, { ...input, ...patch })).json().error, 'idempotency_conflict');
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, { ...input, clientRequestId: 'second' })).statusCode, 429);
  const claim = (await f.deviceRequest(connection.deviceToken, 'GET', 'claim')).json().job;
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'heartbeat', { jobId: claim.id, attemptId: 'forged-attempt' })).statusCode, 409);
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests/${job.id}/cancel`, {})).json().job.state, 'cancelled');
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: claim.id, attemptId: claim.attemptId, result: machine(claim.id) })).statusCode, 409);
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, input)).json().job.state, 'cancelled');
  const next = await f.claimed(connection, source.resourceId, source.sourceId, 'next');
  f.advance(60_000);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'heartbeat', { jobId: next.id, attemptId: next.attemptId })).statusCode, 200);
  f.advance(30_000);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'heartbeat', { jobId: next.id, attemptId: next.attemptId })).statusCode, 409);
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/requests/${next.id}`)).json().job.errorCode, 'expired');
  assert.deepEqual((await f.deviceRequest(connection.deviceToken, 'GET', 'claim')).json(), { job: null });
  assert.equal(f.localRepository.countResults(MEMBER.id), 0);
});

test('recycled/replaced/revoked source, device and account revisions stop status, claim, heartbeat, completion and private result access', async (context) => {
  const f = await httpFixture(context), source = f.file('source-changing'), connection = await f.connect();
  const completed = await f.claimed(connection, source.resourceId, source.sourceId);
  const resultId = (await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: completed.id, attemptId: completed.attemptId, result: machine(completed.id) })).json().resultId;
  const running = await f.claimed(connection, source.resourceId, source.sourceId, 'running-source-change');
  f.database.prepare("UPDATE files SET object_key = 'objects/replacement' WHERE id = ?").run(source.resourceId);
  for (const [method, path, payload] of [['GET', `/requests/${running.id}`, undefined], ['GET', `/results/${resultId}`, undefined],
    ['PATCH', `/results/${resultId}`, { revision: 1, correctedText: 'stale' }]] as const) assert.equal((await f.request(MEMBER.id, method, `${ROOT}${path}`, payload)).statusCode, 404);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: running.id, attemptId: running.attemptId, result: machine(running.id) })).statusCode, 404);
  assert.deepEqual((await f.deviceRequest(connection.deviceToken, 'GET', 'claim')).json(), { job: null });
  const fresh = f.persistence.repositories.files.findCurrentDocumentSource(source.resourceId)!;
  const revoked = await f.claimed(connection, fresh.resourceId, fresh.sourceId, 'device-revocation');
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/devices/${connection.device.id}/revoke`, {})).statusCode, 200);
  for (const [method, path, payload] of [['GET', 'claim', undefined], ['POST', 'heartbeat', { jobId: revoked.id, attemptId: revoked.attemptId }],
    ['POST', 'complete', { jobId: revoked.id, attemptId: revoked.attemptId, result: machine(revoked.id) }]] as const)
    assert.equal((await f.deviceRequest(connection.deviceToken, method, path, payload)).statusCode, 401);
  const replacement = await f.connect(); const revisionJob = await f.claimed(replacement, fresh.resourceId, fresh.sourceId, 'account-revision');
  const account = f.persistence.repositories.accounts.findById(MEMBER.id)!;
  f.persistence.repositories.accounts.updatePassword(MEMBER.id, account.passwordHash, account.authRevision, 'test:changed-password', f.now());
  assert.equal((await f.deviceRequest(replacement.deviceToken, 'GET', 'claim')).statusCode, 401);
  assert.equal((await f.deviceRequest(replacement.deviceToken, 'POST', 'complete', { jobId: revisionJob.id, attemptId: revisionJob.attemptId, result: machine(revisionJob.id) })).statusCode, 401);
  assert.equal(f.localRepository.countResults(MEMBER.id), 1);
});

test('malformed or foreign completion never overwrites previous good machine text or corrections', async (context) => {
  const f = await httpFixture(context), source = f.file('malformed-source'), connection = await f.connect();
  const good = await f.claimed(connection, source.resourceId, source.sourceId);
  const resultId = (await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: good.id, attemptId: good.attemptId, result: machine(good.id) })).json().resultId;
  await f.request(MEMBER.id, 'PATCH', `${ROOT}/results/${resultId}`, { revision: 1, correctedText: 'preserved correction' });
  const bad = await f.claimed(connection, source.resourceId, source.sourceId, 'malformed-retry');
  const foreignDevice = await f.connect(OTHER.id);
  assert.equal((await f.deviceRequest(foreignDevice.deviceToken, 'POST', 'complete', { jobId: bad.id, attemptId: bad.attemptId, result: machine(bad.id) })).statusCode, 404);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: bad.id, attemptId: bad.attemptId, result: { ...machine(bad.id), lineBoxes: [{ start: 0, end: 2, x: .9, y: 0, width: .5, height: .2 }] } })).statusCode, 400);
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/requests/${bad.id}`)).json().job.errorCode, 'invalid_result');
  assert.equal(f.localRepository.countResults(MEMBER.id), 1);
  const preserved = (await f.request(MEMBER.id, 'GET', `${ROOT}/results/${resultId}`)).json().result;
  assert.equal(preserved.correctedText, 'preserved correction'); assert.deepEqual(preserved.machine, machine(good.id));
  assert.equal((await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: good.id, attemptId: good.attemptId, result: machine(good.id) })).statusCode, 409);
});

test('device/pairing expiry, offline polling, PNG declared frame bounds and retained result quota stop new dispatch', async (context) => {
  const f = await httpFixture(context), source = f.file('limits-source');
  const pairing = (await f.request(MEMBER.id, 'POST', `${ROOT}/pairing`, { label: 'expired' })).json();
  f.advance(LIMIT.pairingLifetimeMs);
  assert.equal((await f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: pairing.pairingCode, capabilities, probeResult: probe } })).statusCode, 401);
  const connection = await f.connect(), input = f.input(connection, source.resourceId, source.sourceId);
  for (const patch of [{ imageWidth: 101 }, { imageBase64: 'not-png-base64' }, { imageBase64: png(2001, 200).toString('base64') }, { rotation: 45 },
    { imageBase64: png(100, 200, LIMIT.maxImageBytes + 1).toString('base64') }]) assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, { ...input, ...patch })).statusCode, 400);
  f.advance(LIMIT.onlineWindowMs + 1);
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, input)).json().error, 'device_offline');
  await f.deviceRequest(connection.deviceToken, 'GET', 'claim');
  const queued = (await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, input)).json().job;
  f.advance(LIMIT.requestLifetimeMs);
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/requests/${queued.id}`)).json().job.errorCode, 'expired');
  await f.deviceRequest(connection.deviceToken, 'GET', 'claim');
  const claim = await f.claimed(connection, source.resourceId, source.sourceId, 'quota-result');
  const resultId = (await f.deviceRequest(connection.deviceToken, 'POST', 'complete', { jobId: claim.id, attemptId: claim.attemptId, result: machine(claim.id) })).json().resultId;
  const saved = f.localRepository.result(MEMBER.id, resultId)!;
  for (let index = 1; index < LIMIT.maxResultsPerAccount; index++) f.localRepository.saveResult(MEMBER.id, { ...saved, id: `retained-${index}` });
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/requests`, { ...input, clientRequestId: 'over-quota' })).statusCode, 429);
  assert.equal(f.localRepository.countResults(MEMBER.id), LIMIT.maxResultsPerAccount);
  assert.equal((await f.request(MEMBER.id, 'GET', `${ROOT}/results?resourceId=${source.resourceId}&sourceId=${source.sourceId}&physicalPage=1`)).json().items.length, 20);
  f.advance(LIMIT.tokenLifetimeMs);
  assert.equal((await f.deviceRequest(connection.deviceToken, 'GET', 'claim')).statusCode, 401);
});

test('active device limit, pairing replacement, rate limiting and restart invalidation retain successful private rows', async (context) => {
  const f = await httpFixture(context);
  const first = (await f.request(MEMBER.id, 'POST', `${ROOT}/pairing`, { label: 'first' })).json();
  const second = (await f.request(MEMBER.id, 'POST', `${ROOT}/pairing`, { label: 'second' })).json();
  assert.equal((await f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: first.pairingCode, capabilities, probeResult: probe } })).statusCode, 401);
  assert.equal((await f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: second.pairingCode, capabilities, probeResult: probe } })).statusCode, 200);
  await f.connect(); await f.connect();
  assert.equal((await f.request(MEMBER.id, 'POST', `${ROOT}/pairing`, { label: 'fourth' })).statusCode, 429);
  const source = f.file('restart-source'); const device = (await f.request(MEMBER.id, 'GET', `${ROOT}/devices`)).json().devices[0];
  // Closing the process-local coordinator cannot fabricate a terminal success.
  f.service.close(); assert.deepEqual(f.service.devices(MEMBER.id).map((d) => d.id).sort(), f.localRepository.devices(MEMBER.id).map((d) => d.id).sort());
  assert.equal(f.service.results(MEMBER.id, { resourceId: source.resourceId, sourceId: source.sourceId, physicalPage: 1 }).length, 0);
  assert.equal(device.revokedAt, null);
  for (let index = 0; index < 15; index++) await f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: 'wrong', capabilities, probeResult: probe } });
  assert.equal((await f.app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: { pairingCode: 'wrong', capabilities, probeResult: probe } })).statusCode, 429);
});
