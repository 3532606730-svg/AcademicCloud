import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import type { TestContext } from 'node:test';
import { LOCAL_OCR_PROBE_REQUEST_ID, LOCAL_OCR_PROBE_TEXT, LOCAL_OCR_ROOT as ROOT,
  type OcrEngineCapabilities, type OcrEnginePageResult, type LocalOcrRequestInput, type LocalOcrDeviceJob, type LocalOcrConnection } from '@academiccloud/compute-contracts';
import { AuthService } from '../../src/auth/auth-service.js';
import { LocalOcrService } from '../../src/local-ocr/service.js';
import { SqliteLocalOcrRepository } from '../../src/persistence/sqlite/local-ocr-repository.js';
import { createApp } from '../../src/platform/app.js';
import { fixture, NOW, MEMBER, OWNER, OTHER } from '../workspace/helpers.js';

export { MEMBER, OWNER, OTHER, ROOT };
export const ORIGIN = 'http://127.0.0.1:5173';
export const capabilities: OcrEngineCapabilities = { engineId: 'synthetic-test-engine', engineVersion: '1', modelVersion: 'test',
  inputMimeTypes: ['image/png'], scriptHints: ['zh', 'en'], maxImageBytes: 2 * 1024 * 1024, canReturnGeometry: true };
export function machine(requestId: string, text = 'OCR_PRIVATE_SENTINEL'): OcrEnginePageResult {
  return { requestId, status: 'recognized', text, truncated: false, confidence: 70,
    provenance: { engineId: capabilities.engineId, engineVersion: capabilities.engineVersion, modelVersion: capabilities.modelVersion },
    lineBoxes: [{ start: 0, end: text.length, x: .1, y: .2, width: .6, height: .1 }] };
}
export const probe = machine(LOCAL_OCR_PROBE_REQUEST_ID, `  ${LOCAL_OCR_PROBE_TEXT.toLowerCase().replaceAll(' ', '\n\t')}  `);
/** Header fixture deliberately contains no decoded pixels; Core must not perform native image decoding. */
export function png(width = 100, height = 200, bytes = 33): Buffer {
  const result = Buffer.alloc(bytes);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(result);
  result.writeUInt32BE(13, 8); result.write('IHDR', 12, 'ascii'); result.writeUInt32BE(width, 16); result.writeUInt32BE(height, 20);
  result[24] = 8; result[25] = 6;
  return result;
}
export async function httpFixture(context: TestContext) {
  const f = fixture(context); let milliseconds = NOW.getTime();
  const now = () => new Date(milliseconds);
  const repository = new SqliteLocalOcrRepository(f.database);
  const service = new LocalOcrService(f.persistence, repository, f.repository, now);
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) { logs.push(chunk.toString()); callback(); } });
  const app = await createApp({ logger: { level: 'info', stream }, auth: { service: new AuthService({ persistence: f.persistence, now,
    passwordHasher: { hash: async (password) => `test:${password}`, verify: async (hash, password) => hash === `test:${password}` } }),
    appOrigin: ORIGIN, environment: 'test' }, localOcr: { service } });
  context.after(() => app.close());
  const cookies: Record<string, string> = {};
  for (const actor of [MEMBER, OWNER, OTHER]) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: { loginName: actor.loginName, password: 'workspace-password' } });
    assert.equal(response.statusCode, 200);
    const value = response.headers['set-cookie']!;
    cookies[actor.id] = (Array.isArray(value) ? value[0]! : value).split(';', 1)[0]!;
  }
  const request = (account: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => app.inject({
    method, url, headers: { cookie: cookies[account]!, origin: ORIGIN }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const deviceRequest = (token: string, method: 'GET' | 'POST', path: string, payload?: unknown) => app.inject({
    method, url: `${ROOT}/device/${path}`, headers: { authorization: `Bearer ${token}`, origin: ORIGIN }, ...(payload === undefined ? {} : { payload: payload as object }) });
  async function connect(account = MEMBER.id): Promise<LocalOcrConnection> {
    const pairing = await request(account, 'POST', `${ROOT}/pairing`, { label: 'My synthetic device' });
    assert.equal(pairing.statusCode, 200);
    const response = await app.inject({ method: 'POST', url: `${ROOT}/connect`, headers: { origin: ORIGIN }, payload: {
      pairingCode: pairing.json().pairingCode, capabilities, probeResult: probe } });
    assert.equal(response.statusCode, 200, response.body);
    const connection = response.json<LocalOcrConnection>();
    assert.equal((await deviceRequest(connection.deviceToken, 'GET', 'claim')).statusCode, 200);
    return connection;
  }
  function input(connection: LocalOcrConnection, resourceId: string, sourceId: string, clientRequestId = 'client-1'): LocalOcrRequestInput {
    return { clientRequestId, deviceId: connection.device.id, resourceId, sourceId, physicalPage: 1,
      imageBase64: png().toString('base64'), imageWidth: 100, imageHeight: 200, rotation: 0 };
  }
  async function claimed(connection: LocalOcrConnection, resourceId: string, sourceId: string, clientRequestId = 'client-1') {
    const response = await request(MEMBER.id, 'POST', `${ROOT}/requests`, input(connection, resourceId, sourceId, clientRequestId));
    assert.equal(response.statusCode, 200, response.body);
    const claim = await deviceRequest(connection.deviceToken, 'GET', 'claim');
    assert.equal(claim.statusCode, 200);
    return claim.json().job as LocalOcrDeviceJob;
  }
  return { ...f, app, service, localRepository: repository, request, deviceRequest, connect, input, claimed, logs, cookies,
    advance: (duration: number) => { milliseconds += duration; }, now };
}
