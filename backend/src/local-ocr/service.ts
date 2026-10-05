import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { LOCAL_OCR_LIMITS as LIMIT, LOCAL_OCR_PROBE_REQUEST_ID, LOCAL_OCR_PROBE_TEXT,
  OCR_ENGINE_MAX_TEXT_UNITS, parseOcrEngineCapabilities, parseOcrEnginePageResult,
  type LocalOcrCompletion, type LocalOcrConnection, type LocalOcrDevice, type LocalOcrDeviceJob,
  type LocalOcrFailure, type LocalOcrJob, type LocalOcrRequestInput, type LocalOcrResult, type OcrEngineCapabilities } from '@academiccloud/compute-contracts';
import type { Persistence } from '../persistence/contracts.js';
import type { WorkspaceRepository } from '../workspace/model.js';
import { LocalOcrError, type DeviceRow, type LocalOcrRepository } from './model.js';

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const TERMINAL_LIMIT = 64;
const TERMINAL_TTL = 5 * 60_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const equalDigest = (left: string, right: string) => timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new LocalOcrError('invalid_request');
  return value;
}
function physicalPage(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new LocalOcrError('invalid_request');
  return value;
}
function image(input: LocalOcrRequestInput): Buffer {
  if (typeof input.imageBase64 !== 'string' || input.imageBase64.length > Math.ceil(LIMIT.maxImageBytes / 3) * 4
    || input.imageBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(input.imageBase64)) throw new LocalOcrError('invalid_request');
  const bytes = Buffer.from(input.imageBase64, 'base64');
  if (bytes.length < 33 || bytes.length > LIMIT.maxImageBytes || bytes.toString('base64') !== input.imageBase64
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new LocalOcrError('invalid_request');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  // Core checks the declared static PNG header only. Exact chunks, CRCs and
  // decoded pixels are the device adapter's responsibility, before inference.
  if (!Number.isSafeInteger(input.imageWidth) || !Number.isSafeInteger(input.imageHeight)
    || width < 1 || width > LIMIT.maxWidth || height < 1 || height > LIMIT.maxHeight || width * height > LIMIT.maxPixels
    || width !== input.imageWidth || height !== input.imageHeight || bytes[24] !== 8 || ![0, 2, 4, 6].includes(bytes[25]!)
    || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0 || ![0, 90, 180, 270].includes(input.rotation)) throw new LocalOcrError('invalid_request');
  return bytes;
}
interface Pending {
  accountId: string; authRevision: number; binding: string; job: LocalOcrJob; image: Buffer | null;
  imageWidth: number; imageHeight: number; imageSha256: string; rotation: LocalOcrRequestInput['rotation'];
  capabilities: OcrEngineCapabilities; attemptId: string | null; leaseDeadline: number | null; terminalAt: number | null;
}

/** Bounded interactive transport; independent of Catalog jobs and providers. */
export class LocalOcrService {
  private readonly requests = new Map<string, Pending>();
  constructor(private readonly persistence: Persistence, private readonly repository: LocalOcrRepository,
    private readonly sources: Pick<WorkspaceRepository, 'resolveResources'>,
    private readonly now: () => Date = () => new Date()) {}

  private account(accountId: string) {
    const account = this.persistence.repositories.accounts.findById(accountId);
    if (!account || account.state !== 'active') throw new LocalOcrError('not_found');
    return account;
  }
  private source(accountId: string, resourceId: string, sourceId: string): void {
    this.account(accountId);
    const resource = this.sources.resolveResources(accountId, [identifier(resourceId)])[0];
    if (!resource || resource.sourceId !== identifier(sourceId) || resource.mediaType !== 'application/pdf') throw new LocalOcrError('not_found');
  }
  private effective(device: DeviceRow): boolean {
    const account = this.persistence.repositories.accounts.findById(device.accountId);
    return !!account && account.state === 'active' && account.authRevision === device.authRevision
      && device.revokedAt === null && Date.parse(device.tokenExpiresAt) > this.now().getTime();
  }
  private publicDevice(device: DeviceRow): LocalOcrDevice {
    const { accountId: _accountId, tokenDigest: _tokenDigest, authRevision: _authRevision, ...publicFields } = device;
    return { ...publicFields, online: this.effective(device) && device.lastSeenAt !== null
      && this.now().getTime() - Date.parse(device.lastSeenAt) <= LIMIT.onlineWindowMs };
  }
  private authenticate(token: string): DeviceRow {
    if (typeof token !== 'string' || !TOKEN.test(token)) throw new LocalOcrError('device_authentication_required');
    const hashed = digest(token), device = this.repository.deviceByDigest(hashed);
    if (!device || !equalDigest(device.tokenDigest, hashed) || !this.effective(device)) throw new LocalOcrError('device_authentication_required');
    return device;
  }
  private active(p: Pending): boolean { return p.job.state === 'queued' || p.job.state === 'running'; }
  private finish(p: Pending, state: 'succeeded' | 'failed' | 'cancelled', failure: LocalOcrFailure | null, resultId: string | null = null): void {
    p.job = { ...p.job, state, errorCode: failure, resultId };
    p.image = null; p.terminalAt = this.now().getTime();
  }
  private authorized(p: Pending): void {
    if (this.account(p.accountId).authRevision !== p.authRevision) throw new LocalOcrError('not_found');
    this.source(p.accountId, p.job.resourceId, p.job.sourceId);
  }
  sweep(): void {
    const time = this.now().getTime();
    for (const [id, p] of this.requests) {
      if (this.active(p)) {
        let failure: LocalOcrFailure | null = null;
        const account = this.persistence.repositories.accounts.findById(p.accountId);
        if (!account || account.state !== 'active' || account.authRevision !== p.authRevision) failure = 'access_revoked';
        else {
          const device = this.repository.device(p.accountId, p.job.deviceId);
          if (!device || !this.effective(device)) failure = 'access_revoked';
          else {
            const resource = this.sources.resolveResources(p.accountId, [p.job.resourceId])[0];
            if (!resource) failure = 'access_revoked';
            else if (resource.sourceId !== p.job.sourceId) failure = 'source_changed';
          }
        }
        if (!failure && (time >= Date.parse(p.job.expiresAt) || (p.leaseDeadline !== null && time >= p.leaseDeadline))) failure = 'expired';
        if (failure) this.finish(p, 'failed', failure);
      }
      if (p.terminalAt !== null && time - p.terminalAt >= TERMINAL_TTL) this.requests.delete(id);
    }
    const terminal = [...this.requests.values()].filter((p) => p.terminalAt !== null).sort((a, b) => a.terminalAt! - b.terminalAt!);
    for (const p of terminal.slice(0, Math.max(0, terminal.length - TERMINAL_LIMIT))) this.requests.delete(p.job.id);
  }
  close(): void { this.requests.clear(); }
  devices(accountId: string): LocalOcrDevice[] {
    this.account(accountId); this.sweep();
    return this.repository.devices(accountId).map((device) => this.publicDevice(device));
  }
  pairing(accountId: string, label: string) {
    if (typeof label !== 'string' || label.trim().length < 1 || label.trim().length > 80 || /[\x00-\x1f\x7f-\x9f]/u.test(label)) throw new LocalOcrError('invalid_request');
    return this.persistence.runInTransaction(() => {
      const account = this.account(accountId);
      if (this.repository.devices(accountId).filter((device) => this.effective(device)).length >= LIMIT.maxDevicesPerAccount) throw new LocalOcrError('limit_exceeded');
      const pairingCode = randomBytes(32).toString('base64url'), expiresAt = new Date(this.now().getTime() + LIMIT.pairingLifetimeMs).toISOString();
      this.repository.savePairing({ accountId, codeDigest: digest(pairingCode), label: label.trim(), authRevision: account.authRevision, expiresAt, consumedAt: null });
      return { pairingCode, expiresAt };
    });
  }
  connect(input: { pairingCode: string; capabilities: unknown; probeResult: unknown }): LocalOcrConnection {
    if (typeof input.pairingCode !== 'string' || !TOKEN.test(input.pairingCode)) throw new LocalOcrError('pairing_invalid');
    let capabilities: OcrEngineCapabilities;
    try {
      capabilities = parseOcrEngineCapabilities(input.capabilities);
      if (!capabilities.inputMimeTypes.includes('image/png')) throw new Error();
      const probe = parseOcrEnginePageResult(input.probeResult, { requestId: LOCAL_OCR_PROBE_REQUEST_ID, capabilities });
      if (!probe.text?.replace(/\s+/gu, ' ').trim().toLowerCase().includes(LOCAL_OCR_PROBE_TEXT.toLowerCase()) || probe.truncated) throw new Error();
    } catch { throw new LocalOcrError('invalid_request'); }
    return this.persistence.runInTransaction(() => {
      const hashed = digest(input.pairingCode), pairing = this.repository.pairing(hashed);
      if (!pairing || !equalDigest(pairing.codeDigest, hashed) || pairing.consumedAt !== null || Date.parse(pairing.expiresAt) <= this.now().getTime()) throw new LocalOcrError('pairing_invalid');
      const account = this.persistence.repositories.accounts.findById(pairing.accountId);
      if (!account || account.state !== 'active' || account.authRevision !== pairing.authRevision) throw new LocalOcrError('pairing_invalid');
      if (this.repository.devices(account.id).filter((device) => this.effective(device)).length >= LIMIT.maxDevicesPerAccount) throw new LocalOcrError('limit_exceeded');
      const now = this.now().toISOString(), deviceToken = randomBytes(32).toString('base64url');
      const device: DeviceRow = { id: randomUUID(), accountId: account.id, tokenDigest: digest(deviceToken), authRevision: account.authRevision,
        capabilities, label: pairing.label, createdAt: now, lastSeenAt: null, tokenExpiresAt: new Date(this.now().getTime() + LIMIT.tokenLifetimeMs).toISOString(), revokedAt: null };
      if (!this.repository.consumePairing(hashed, now)) throw new LocalOcrError('pairing_invalid');
      this.repository.createDevice(device);
      return { deviceToken, tokenExpiresAt: device.tokenExpiresAt, device: this.publicDevice(device) };
    });
  }
  revoke(accountId: string, id: string): LocalOcrDevice {
    const device = this.persistence.runInTransaction(() => {
      this.account(accountId);
      const current = this.repository.device(accountId, identifier(id));
      if (!current) throw new LocalOcrError('not_found');
      this.repository.revokeDevice(accountId, id, this.now().toISOString());
      return this.repository.device(accountId, id)!;
    });
    for (const p of this.requests.values()) if (p.accountId === accountId && p.job.deviceId === id && this.active(p)) this.finish(p, 'cancelled', 'access_revoked');
    this.sweep(); return this.publicDevice(device);
  }
  createRequest(accountId: string, input: LocalOcrRequestInput): LocalOcrJob {
    identifier(input.clientRequestId); identifier(input.deviceId); physicalPage(input.physicalPage);
    const bytes = image(input), imageSha256 = digest(bytes);
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const account = this.account(accountId);
      this.source(accountId, input.resourceId, input.sourceId);
      const binding = digest(JSON.stringify([input.deviceId, input.resourceId, input.sourceId, input.physicalPage, imageSha256, input.imageWidth, input.imageHeight, input.rotation]));
      const previous = [...this.requests.values()].find((p) => p.accountId === accountId && p.job.clientRequestId === input.clientRequestId);
      if (previous) {
        this.authorized(previous);
        if (previous.binding !== binding) throw new LocalOcrError('idempotency_conflict');
        return { ...previous.job };
      }
      const device = this.repository.device(accountId, input.deviceId);
      if (!device || !this.effective(device)) throw new LocalOcrError('not_found');
      if (bytes.length > device.capabilities.maxImageBytes || !device.capabilities.inputMimeTypes.includes('image/png')) throw new LocalOcrError('device_unavailable');
      if (!this.publicDevice(device).online) throw new LocalOcrError('device_offline');
      const active = [...this.requests.values()].filter((p) => this.active(p));
      if (active.length >= LIMIT.maxActiveRequests || active.some((p) => p.accountId === accountId)
        || this.repository.countResults(accountId) >= LIMIT.maxResultsPerAccount) throw new LocalOcrError('limit_exceeded');
      const now = this.now().toISOString();
      const job: LocalOcrJob = { id: randomUUID(), clientRequestId: input.clientRequestId, deviceId: device.id, resourceId: input.resourceId,
        sourceId: input.sourceId, physicalPage: input.physicalPage, state: 'queued', errorCode: null, resultId: null,
        createdAt: now, expiresAt: new Date(this.now().getTime() + LIMIT.requestLifetimeMs).toISOString() };
      this.requests.set(job.id, { accountId, authRevision: account.authRevision, binding, job, image: bytes,
        imageWidth: input.imageWidth, imageHeight: input.imageHeight, rotation: input.rotation, imageSha256, capabilities: device.capabilities,
        attemptId: null, leaseDeadline: null, terminalAt: null });
      return { ...job };
    });
  }
  private owned(accountId: string, id: string): Pending {
    this.account(accountId); this.sweep();
    const p = this.requests.get(identifier(id));
    if (!p || p.accountId !== accountId) throw new LocalOcrError('not_found');
    this.authorized(p); return p;
  }
  status(accountId: string, id: string): LocalOcrJob { return { ...this.owned(accountId, id).job }; }
  cancel(accountId: string, id: string): LocalOcrJob {
    const p = this.owned(accountId, id);
    if (this.active(p)) this.finish(p, 'cancelled', 'cancelled');
    return { ...p.job };
  }
  claim(token: string): LocalOcrDeviceJob | null {
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const device = this.authenticate(token);
      this.repository.touchDevice(device.id, this.now().toISOString());
      const p = [...this.requests.values()].find((candidate) => candidate.accountId === device.accountId && candidate.job.deviceId === device.id && candidate.job.state === 'queued');
      if (!p) return null;
      this.authorized(p);
      p.attemptId = randomUUID();
      p.leaseDeadline = Math.min(this.now().getTime() + LIMIT.claimLifetimeMs, Date.parse(p.job.expiresAt));
      p.job = { ...p.job, state: 'running' };
      return { id: p.job.id, attemptId: p.attemptId, leaseExpiresAt: new Date(p.leaseDeadline).toISOString(), resourceId: p.job.resourceId,
        sourceId: p.job.sourceId, physicalPage: p.job.physicalPage, imageBase64: p.image!.toString('base64'), imageSha256: p.imageSha256,
        imageWidth: p.imageWidth, imageHeight: p.imageHeight, rotation: p.rotation, capabilities: p.capabilities };
    });
  }
  private claimed(device: DeviceRow, jobId: string, attemptId: string): Pending {
    const p = this.requests.get(identifier(jobId));
    identifier(attemptId);
    if (!p || p.accountId !== device.accountId || p.job.deviceId !== device.id) throw new LocalOcrError('not_found');
    this.authorized(p);
    if (p.job.state !== 'running' || p.attemptId !== attemptId || p.leaseDeadline === null || this.now().getTime() >= p.leaseDeadline) throw new LocalOcrError('request_inactive');
    return p;
  }
  heartbeat(token: string, input: { jobId: string; attemptId: string }): { active: true } {
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const device = this.authenticate(token);
      this.claimed(device, input.jobId, input.attemptId);
      this.repository.touchDevice(device.id, this.now().toISOString());
      return { active: true };
    });
  }
  complete(token: string, input: LocalOcrCompletion): { accepted: true; resultId: string | null } {
    this.sweep();
    const device = this.authenticate(token), p = this.claimed(device, input.jobId, input.attemptId);
    if ('errorCode' in input) {
      if (!['engine_busy', 'engine_failed', 'invalid_result'].includes(input.errorCode!)) throw new LocalOcrError('invalid_request');
      this.persistence.runInTransaction(() => { this.authenticate(token); this.authorized(p); this.repository.touchDevice(device.id, this.now().toISOString()); });
      this.finish(p, 'failed', input.errorCode!); return { accepted: true, resultId: null };
    }
    let machine: LocalOcrResult['machine'];
    try { machine = parseOcrEnginePageResult(input.result, { requestId: p.job.id, capabilities: p.capabilities }); }
    catch { this.finish(p, 'failed', 'invalid_result'); throw new LocalOcrError('invalid_request'); }
    const result = this.persistence.runInTransaction(() => {
      const current = this.authenticate(token);
      this.claimed(current, input.jobId, input.attemptId);
      if (this.repository.countResults(device.accountId) >= LIMIT.maxResultsPerAccount) throw new LocalOcrError('limit_exceeded');
      const now = this.now().toISOString();
      const r: LocalOcrResult = { id: randomUUID(), deviceId: device.id, resourceId: p.job.resourceId, sourceId: p.job.sourceId,
        physicalPage: p.job.physicalPage, imageWidth: p.imageWidth, imageHeight: p.imageHeight, rotation: p.rotation,
        imageSha256: p.imageSha256, origin: 'client_rendered_unverified', machine, correctedText: null, revision: 1, createdAt: now, updatedAt: now };
      this.repository.saveResult(device.accountId, r);
      this.repository.touchDevice(device.id, now);
      return r;
    });
    this.finish(p, 'succeeded', null, result.id); return { accepted: true, resultId: result.id };
  }
  results(accountId: string, query: { resourceId: string; sourceId: string; physicalPage: number }): LocalOcrResult[] {
    this.source(accountId, query.resourceId, query.sourceId); physicalPage(query.physicalPage);
    return this.repository.results(accountId, query.resourceId, query.sourceId, query.physicalPage);
  }
  result(accountId: string, id: string): LocalOcrResult {
    this.account(accountId);
    const r = this.repository.result(accountId, identifier(id));
    if (!r) throw new LocalOcrError('not_found');
    this.source(accountId, r.resourceId, r.sourceId); return r;
  }
  correct(accountId: string, id: string, input: { revision: number; correctedText: string }): LocalOcrResult {
    return this.persistence.runInTransaction(() => {
      this.result(accountId, id);
      if (!Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision >= Number.MAX_SAFE_INTEGER
        || typeof input.correctedText !== 'string' || input.correctedText.length > OCR_ENGINE_MAX_TEXT_UNITS || !input.correctedText.isWellFormed()
        || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(input.correctedText)) throw new LocalOcrError('invalid_request');
      if (!this.repository.correctResult(accountId, id, input.revision, input.correctedText, this.now().toISOString())) throw new LocalOcrError('concurrent_change');
      return this.repository.result(accountId, id)!;
    });
  }
}
