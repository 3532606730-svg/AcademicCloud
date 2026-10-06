import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { LOCAL_OCR_LIMITS as LIMIT, LOCAL_OCR_PROBE_REQUEST_ID, LOCAL_OCR_PROBE_TEXT,
  OCR_ENGINE_MAX_TEXT_UNITS, parseOcrEngineCapabilities, parseOcrEnginePageResult,
  type LocalOcrBookProgress, type LocalOcrBookQuery, type LocalOcrCompletion, type LocalOcrConnection, type LocalOcrDevice, type LocalOcrDeviceJob,
  type LocalOcrFailure, type LocalOcrJob, type LocalOcrRequestInput, type LocalOcrResult, type OcrEngineCapabilities } from '@academiccloud/compute-contracts';
import { LOCAL_OCR_BOOK_FEATURE, LOCAL_OCR_BOOK_LIMITS as BOOK_LIMIT,
  type LocalOcrBookStartInput, type LocalOcrBookJob, type LocalOcrBookClaim, type LocalOcrBookAttemptInput,
  type LocalOcrBookHeartbeatInput, type LocalOcrBookHeartbeat, type LocalOcrBookPageInput,
  type LocalOcrBookPageReceipt, type LocalOcrBookFinishInput, type LocalOcrBookSourceGrant } from '@academiccloud/compute-contracts';
import type { Persistence } from '../persistence/contracts.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { sourceMatchesFile } from '../drive/document-source.js';
import { storageMetadataMatches } from '../drive/drive-service.js';
import type { WorkspaceRepository } from '../workspace/model.js';
import { LocalOcrError, type BookJobRow, type DeviceRow, type LocalOcrRepository } from './model.js';

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
function image(input: Pick<LocalOcrRequestInput, 'imageBase64' | 'imageWidth' | 'imageHeight' | 'rotation'>): Buffer {
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
    private readonly now: () => Date = () => new Date(), private readonly storage?: StorageAdapter) {}

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
    this.persistence.runInTransaction(() => {
      for (const job of this.repository.activeBookJobs()) {
        const failure = this.bookFailure(job);
        if (failure) this.stopBook(job, 'failed', failure);
      }
    });
  }
  close(): void { this.requests.clear(); }
  private savedBookPages(job: BookJobRow): number[] {
    return this.repository.savedPhysicalPages(job.accountId, job);
  }
  private publicBook(job: BookJobRow): LocalOcrBookJob {
    const { accountId: _account, authRevision: _revision, requestDigest: _digest, attemptId: _attempt, decodedPageCount: _decoded, capabilities: _caps, ...fields } = job;
    return { ...fields, savedPhysicalPages: this.savedBookPages(job) };
  }
  private bookFailure(job: BookJobRow): LocalOcrFailure | null {
    const account = this.persistence.repositories.accounts.findById(job.accountId);
    const device = this.repository.device(job.accountId, job.deviceId);
    if (!account || account.state !== 'active' || account.authRevision !== job.authRevision || !device || !this.effective(device)) return 'access_revoked';
    const source = this.sources.resolveResources(job.accountId, [job.resourceId])[0];
    if (!source) return 'access_revoked';
    if (source.sourceId !== job.sourceId || source.mediaType !== 'application/pdf') return 'source_changed';
    if (this.now().getTime() >= Date.parse(job.expiresAt)
      || (job.state === 'running' && (job.leaseExpiresAt === null || this.now().getTime() >= Date.parse(job.leaseExpiresAt)))) return 'expired';
    return null;
  }
  private stopBook(job: BookJobRow, state: 'paused' | 'failed' | 'cancelled' | 'succeeded', errorCode: LocalOcrFailure | null,
    failedPhysicalPage: number | null = null): BookJobRow {
    const next = { ...job, state, errorCode, failedPhysicalPage, attemptId: null, leaseExpiresAt: null, decodedPageCount: null, updatedAt: this.now().toISOString() };
    this.repository.updateBookJob(next); return next;
  }
  private capacity(accountId: string, excludingBookId?: string): void {
    const current = [...this.requests.values()].filter((p) => this.active(p));
    const books = this.repository.activeBookJobs().filter((job) => job.id !== excludingBookId);
    if (current.length + books.length >= LIMIT.maxActiveRequests
      || current.some((p) => p.accountId === accountId) || books.some((job) => job.accountId === accountId)) throw new LocalOcrError('limit_exceeded');
  }
  private bookQuota(job: Pick<BookJobRow, 'accountId' | 'resourceId' | 'sourceId' | 'pageCount'>): number[] {
    const saved = this.repository.savedPhysicalPages(job.accountId, job);
    if (this.repository.countResults(job.accountId) + job.pageCount - saved.length > LIMIT.maxResultsPerAccount) throw new LocalOcrError('limit_exceeded');
    return saved;
  }
  private bookDevice(accountId: string, id: string): DeviceRow {
    const device = this.repository.device(accountId, identifier(id));
    if (!device || !this.effective(device)) throw new LocalOcrError('not_found');
    if (!device.transportFeatures.includes(LOCAL_OCR_BOOK_FEATURE)) throw new LocalOcrError('device_unavailable');
    if (!this.publicDevice(device).online) throw new LocalOcrError('device_offline');
    return device;
  }
  private ownedBook(accountId: string, id: string): BookJobRow {
    this.account(accountId);
    const job = this.repository.bookJob(accountId, identifier(id));
    if (!job) throw new LocalOcrError('not_found');
    this.source(accountId, job.resourceId, job.sourceId);
    return job;
  }
  startBook(accountId: string, input: LocalOcrBookStartInput): LocalOcrBookJob {
    identifier(input.clientRequestId); identifier(input.deviceId);
    if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > BOOK_LIMIT.maxPhysicalPages) throw new LocalOcrError('invalid_request');
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const account = this.account(accountId);
      this.source(accountId, input.resourceId, input.sourceId);
      const requestDigest = digest(JSON.stringify([input.deviceId,input.resourceId,input.sourceId,input.pageCount]));
      const previous = this.repository.bookJobByClientRequest(accountId, input.clientRequestId);
      if (previous) {
        if (previous.requestDigest !== requestDigest) throw new LocalOcrError('idempotency_conflict');
        return this.publicBook(previous);
      }
      if (this.repository.countBookJobs(accountId) >= BOOK_LIMIT.maxRetainedJobsPerAccount) throw new LocalOcrError('limit_exceeded');
      const device = this.bookDevice(accountId, input.deviceId), time = this.now().toISOString();
      const job: BookJobRow = { ...input, id: randomUUID(), accountId, authRevision: account.authRevision,
        requestDigest,
        state: 'queued', errorCode: null, failedPhysicalPage: null, attemptId: null, decodedPageCount: null, capabilities: device.capabilities,
        leaseExpiresAt: null, createdAt: time, updatedAt: time, expiresAt: new Date(this.now().getTime() + BOOK_LIMIT.taskLifetimeMs).toISOString() };
      const saved = this.bookQuota(job);
      if (saved.length === job.pageCount) job.state = 'succeeded'; else this.capacity(accountId);
      this.repository.saveBookJob(job); return this.publicBook(job);
    });
  }
  books(accountId: string, filter: { resourceId?: string; sourceId?: string } = {}): LocalOcrBookJob[] {
    this.account(accountId); this.sweep();
    if (filter.resourceId !== undefined) identifier(filter.resourceId);
    if (filter.sourceId !== undefined) identifier(filter.sourceId);
    return this.persistence.runInTransaction(() => this.repository.bookJobs(accountId,filter).filter((job) => {
      const source = this.sources.resolveResources(accountId,[job.resourceId])[0]; return source?.sourceId === job.sourceId;
    }).map((job) => this.publicBook(job)));
  }
  book(accountId: string, id: string): LocalOcrBookJob {
    this.sweep(); return this.persistence.runInTransaction(() => this.publicBook(this.ownedBook(accountId,id)));
  }
  controlBook(accountId: string, id: string, action: 'pause' | 'cancel' | 'resume', deviceId?: string): LocalOcrBookJob {
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const job = this.ownedBook(accountId,id);
      if (action === 'pause') return this.publicBook(job.state === 'queued' || job.state === 'running' ? this.stopBook(job,'paused',null) : job);
      if (action === 'cancel') return this.publicBook(job.state === 'succeeded' || job.state === 'cancelled' ? job : this.stopBook(job,'cancelled','cancelled'));
      if (job.state !== 'paused' && job.state !== 'failed') throw new LocalOcrError('request_inactive');
      if (Date.parse(job.expiresAt) <= this.now().getTime() || this.account(accountId).authRevision !== job.authRevision) throw new LocalOcrError('request_inactive');
      const device = this.bookDevice(accountId,identifier(deviceId));
      const saved = this.bookQuota(job);
      if (saved.length < job.pageCount) this.capacity(accountId,job.id);
      const next: BookJobRow = { ...job,deviceId:device.id,capabilities:device.capabilities,state:saved.length === job.pageCount ? 'succeeded' : 'queued',
        errorCode:null,failedPhysicalPage:null,attemptId:null,leaseExpiresAt:null,decodedPageCount:null,updatedAt:this.now().toISOString() };
      this.repository.updateBookJob(next); return this.publicBook(next);
    });
  }
  claimBook(token: string): LocalOcrBookClaim | null {
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const device = this.authenticate(token);
      this.repository.touchDevice(device.id,this.now().toISOString());
      if (!device.transportFeatures.includes(LOCAL_OCR_BOOK_FEATURE)) return null;
      let job = this.repository.activeBookJobs().find((j) => j.accountId === device.accountId && j.deviceId === device.id);
      if (!job) return null;
      this.source(device.accountId,job.resourceId,job.sourceId);
      const saved = this.bookQuota(job); this.capacity(device.accountId,job.id);
      if (saved.length === job.pageCount) { this.stopBook(job,'succeeded',null); return null; }
      if (job.state === 'queued') {
        job = { ...job,state:'running',attemptId:randomUUID(),leaseExpiresAt:new Date(Math.min(this.now().getTime()+BOOK_LIMIT.leaseLifetimeMs,Date.parse(job.expiresAt))).toISOString(),updatedAt:this.now().toISOString() };
        this.repository.updateBookJob(job);
      }
      return { job:this.publicBook(job),attemptId:job.attemptId!,leaseExpiresAt:job.leaseExpiresAt!,pageCount:job.pageCount,savedPhysicalPages:saved,capabilities:job.capabilities };
    });
  }
  private claimedBook(device: DeviceRow, input: LocalOcrBookAttemptInput): BookJobRow {
    identifier(input.attemptId);
    const job = this.ownedBook(device.accountId,input.bookId);
    if (job.deviceId !== device.id) throw new LocalOcrError('not_found');
    if (job.state !== 'running' || job.attemptId !== input.attemptId || this.bookFailure(job)) throw new LocalOcrError('request_inactive');
    return job;
  }
  heartbeatBook(token: string, input: LocalOcrBookHeartbeatInput): LocalOcrBookHeartbeat {
    this.sweep();
    const response = this.persistence.runInTransaction(() => {
      const device = this.authenticate(token), job = this.claimedBook(device,input);
      if (input.pageCount !== undefined && input.pageCount !== job.pageCount) {
        // Preserve the failure outside the rejected page request; no page may be accepted.
        this.stopBook(job,'failed','invalid_result');
        return null;
      }
      const next = { ...job,decodedPageCount:input.pageCount ?? job.decodedPageCount,
        leaseExpiresAt:new Date(Math.min(this.now().getTime()+BOOK_LIMIT.leaseLifetimeMs,Date.parse(job.expiresAt))).toISOString(),updatedAt:this.now().toISOString() };
      this.repository.updateBookJob(next); this.repository.touchDevice(device.id,this.now().toISOString());
      return { active:true as const,leaseExpiresAt:next.leaseExpiresAt,savedPhysicalPages:this.savedBookPages(job) };
    });
    if (response === null) throw new LocalOcrError('invalid_request');
    return response;
  }
  async sourceBook(token: string, input: LocalOcrBookAttemptInput): Promise<LocalOcrBookSourceGrant> {
    this.sweep();
    if (!this.storage) throw new LocalOcrError('device_unavailable');
    const snapshot = this.persistence.runInTransaction(() => {
      const device = this.authenticate(token), job = this.claimedBook(device,input);
      const resource = this.sources.resolveResources(device.accountId,[job.resourceId])[0]!;
      const file = this.persistence.repositories.files.findByDomainId(resource.libraryId ? `library:${resource.libraryId}` : `account:${device.accountId}`,job.resourceId);
      const source = this.persistence.repositories.files.findCurrentDocumentSource(job.resourceId);
      if (!file || file.state !== 'active' || !source || source.sourceId !== job.sourceId || !sourceMatchesFile(source,file)
        || file.storageProvider !== this.storage!.provider) throw new LocalOcrError('not_found');
      return { file,source };
    });
    const metadata = await this.storage.statObject(snapshot.file.objectKey);
    if (!metadata || !storageMetadataMatches(snapshot.file,metadata)) throw new LocalOcrError('not_found');
    const grant = await this.storage.createDownloadAuthorization({objectKey:snapshot.file.objectKey,downloadFilename:'academiccloud-private-ocr-source.pdf',disposition:'attachment',expiresInSeconds:BOOK_LIMIT.sourceGrantSeconds});
    return this.persistence.runInTransaction(() => {
      const device = this.authenticate(token), job = this.claimedBook(device,input);
      const source = this.persistence.repositories.files.findCurrentDocumentSource(job.resourceId);
      if (!source || source.sourceId !== snapshot.source.sourceId || !sourceMatchesFile(source,snapshot.file)
        || !Number.isFinite(grant.expiresAt.getTime()) || grant.expiresAt.getTime() <= this.now().getTime()
        || grant.expiresAt.getTime() > this.now().getTime()+BOOK_LIMIT.sourceGrantSeconds*1000) throw new LocalOcrError('not_found');
      this.repository.touchDevice(device.id,this.now().toISOString());
      return {resourceId:job.resourceId,sourceId:job.sourceId,url:grant.url,expiresAt:grant.expiresAt.toISOString(),sizeBytes:source.sizeBytes,
        checksumAlgorithm:source.checksumAlgorithm,checksum:source.checksum,etag:metadata.etag};
    });
  }
  pageBook(token: string, input: LocalOcrBookPageInput): LocalOcrBookPageReceipt {
    const bytes=image(input),imageSha256=digest(bytes);
    physicalPage(input.physicalPage); identifier(input.bookId); identifier(input.attemptId);
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const device=this.authenticate(token),job=this.ownedBook(device.accountId,input.bookId);
      if (job.deviceId !== device.id) throw new LocalOcrError('not_found');
      if (input.physicalPage > job.pageCount || bytes.length > job.capabilities.maxImageBytes) throw new LocalOcrError('invalid_request');
      let machine: LocalOcrResult['machine'];
      try {machine=parseOcrEnginePageResult(input.result,{requestId:`${job.id}-${input.physicalPage}`,capabilities:job.capabilities});}
      catch {throw new LocalOcrError('invalid_request');}
      const payloadDigest=digest(JSON.stringify([input.physicalPage,imageSha256,input.imageWidth,input.imageHeight,input.rotation,machine]));
      const receipt=this.repository.bookReceipt(job.id,input.physicalPage);
      if (receipt) {
        if (receipt.acceptedAttemptId !== input.attemptId || receipt.payloadDigest !== payloadDigest) throw new LocalOcrError('idempotency_conflict');
        return {accepted:true,resultId:receipt.resultId,savedPhysicalPages:this.savedBookPages(job)};
      }
      this.claimedBook(device,input);
      if (job.decodedPageCount !== job.pageCount) throw new LocalOcrError('request_inactive');
      this.bookQuota(job); this.capacity(device.accountId,job.id);
      if (this.savedBookPages(job).includes(input.physicalPage)) throw new LocalOcrError('idempotency_conflict');
      if (this.repository.countResults(device.accountId)>=LIMIT.maxResultsPerAccount) throw new LocalOcrError('limit_exceeded');
      const time=this.now().toISOString();
      const result:LocalOcrResult={id:randomUUID(),deviceId:device.id,resourceId:job.resourceId,sourceId:job.sourceId,physicalPage:input.physicalPage,
        imageWidth:input.imageWidth,imageHeight:input.imageHeight,rotation:input.rotation,imageSha256,origin:'client_rendered_unverified',machine,
        correctedText:null,revision:1,createdAt:time,updatedAt:time};
      this.repository.saveResult(device.accountId,result);
      this.repository.saveBookReceipt({bookId:job.id,physicalPage:input.physicalPage,resultId:result.id,acceptedAttemptId:input.attemptId,payloadDigest,createdAt:time});
      this.repository.touchDevice(device.id,time);
      this.repository.updateBookJob({...job,updatedAt:time});
      return {accepted:true,resultId:result.id,savedPhysicalPages:this.savedBookPages(job)};
    });
  }
  finishBook(token: string, input: LocalOcrBookFinishInput): LocalOcrBookJob {
    this.sweep();
    return this.persistence.runInTransaction(() => {
      const device=this.authenticate(token),job=this.claimedBook(device,input);
      if ('errorCode' in input) {
        if (!['engine_busy','engine_failed','invalid_result'].includes(input.errorCode!)) throw new LocalOcrError('invalid_request');
        if (input.failedPhysicalPage !== undefined && (physicalPage(input.failedPhysicalPage)>job.pageCount)) throw new LocalOcrError('invalid_request');
        return this.publicBook(this.stopBook(job,'failed',input.errorCode!,input.failedPhysicalPage ?? null));
      }
      if (input.pageCount!==job.pageCount || job.decodedPageCount!==job.pageCount || this.savedBookPages(job).length!==job.pageCount) throw new LocalOcrError('request_inactive');
      return this.publicBook(this.stopBook(job,'succeeded',null));
    });
  }
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
  connect(input: { pairingCode: string; capabilities: unknown; probeResult: unknown; transportFeatures?: unknown }): LocalOcrConnection {
    if (typeof input.pairingCode !== 'string' || !TOKEN.test(input.pairingCode)) throw new LocalOcrError('pairing_invalid');
    let capabilities: OcrEngineCapabilities;
    try {
      capabilities = parseOcrEngineCapabilities(input.capabilities);
      if (!capabilities.inputMimeTypes.includes('image/png')) throw new Error();
      const probe = parseOcrEnginePageResult(input.probeResult, { requestId: LOCAL_OCR_PROBE_REQUEST_ID, capabilities });
      if (!probe.text?.replace(/\s+/gu, ' ').trim().toLowerCase().includes(LOCAL_OCR_PROBE_TEXT.toLowerCase()) || probe.truncated) throw new Error();
    } catch { throw new LocalOcrError('invalid_request'); }
    if (input.transportFeatures !== undefined && (!Array.isArray(input.transportFeatures)
      || input.transportFeatures.length > 1 || input.transportFeatures.some((feature) => feature !== LOCAL_OCR_BOOK_FEATURE))) throw new LocalOcrError('invalid_request');
    const transportFeatures: DeviceRow['transportFeatures'] = input.transportFeatures === undefined ? [] : [ ...(input.transportFeatures as DeviceRow['transportFeatures']) ];
    return this.persistence.runInTransaction(() => {
      const hashed = digest(input.pairingCode), pairing = this.repository.pairing(hashed);
      if (!pairing || !equalDigest(pairing.codeDigest, hashed) || pairing.consumedAt !== null || Date.parse(pairing.expiresAt) <= this.now().getTime()) throw new LocalOcrError('pairing_invalid');
      const account = this.persistence.repositories.accounts.findById(pairing.accountId);
      if (!account || account.state !== 'active' || account.authRevision !== pairing.authRevision) throw new LocalOcrError('pairing_invalid');
      if (this.repository.devices(account.id).filter((device) => this.effective(device)).length >= LIMIT.maxDevicesPerAccount) throw new LocalOcrError('limit_exceeded');
      const now = this.now().toISOString(), deviceToken = randomBytes(32).toString('base64url');
      const device: DeviceRow = { id: randomUUID(), accountId: account.id, tokenDigest: digest(deviceToken), authRevision: account.authRevision,
        capabilities, transportFeatures, label: pairing.label, createdAt: now, lastSeenAt: null, tokenExpiresAt: new Date(this.now().getTime() + LIMIT.tokenLifetimeMs).toISOString(), revokedAt: null };
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
      this.capacity(accountId);
      if (this.repository.countResults(accountId) >= LIMIT.maxResultsPerAccount) throw new LocalOcrError('limit_exceeded');
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
  bookProgress(accountId: string, query: LocalOcrBookQuery): LocalOcrBookProgress {
    if (!Number.isSafeInteger(query.pageCount) || query.pageCount < 1 || query.pageCount > LIMIT.maxResultsPerAccount) throw new LocalOcrError('invalid_request');
    this.sweep();
    return this.persistence.runInTransaction(() => {
      this.source(accountId, query.resourceId, query.sourceId);
      const active = [...this.requests.values()].find((p) => p.accountId === accountId && this.active(p));
      const activeJob = active?.job.resourceId === query.resourceId && active.job.sourceId === query.sourceId ? { ...active.job } : null;
      const used = this.repository.countResults(accountId);
      return { resourceId: query.resourceId, sourceId: query.sourceId, pageCount: query.pageCount,
        pages: this.repository.bookPages(accountId, query), quota: { used, limit: LIMIT.maxResultsPerAccount, remaining: Math.max(0, LIMIT.maxResultsPerAccount - used) },
        activeJob, accountBusy: active !== undefined || this.repository.activeBookJobs().some((job) => job.accountId === accountId) };
    });
  }
  /** Snapshot only page/result IDs; read and authorize one private payload at a time. */
  bookExport(accountId: string, query: LocalOcrBookQuery, format: 'txt' | 'jsonl'): Iterable<string> {
    if (format !== 'txt' && format !== 'jsonl') throw new LocalOcrError('invalid_request');
    // Eager validation ensures a denied request receives an ordinary HTTP error
    // before attachment headers. Subsequent denial destroys the partial stream.
    const progress = this.bookProgress(accountId, query);
    const revision = this.account(accountId).authRevision;
    const pages = new Map(progress.pages.map((page) => [page.physicalPage, page.resultId]));
    const source = { resourceId: progress.resourceId, sourceId: progress.sourceId, pageCount: progress.pageCount };
    const authorize = () => {
      if (this.account(accountId).authRevision !== revision) throw new LocalOcrError('not_found');
      this.source(accountId, source.resourceId, source.sourceId);
    };
    const repository = this.repository;
    return (function* (): Generator<string> {
      authorize();
      yield format === 'jsonl' ? JSON.stringify({ type: 'book', ...source, origin: 'client_rendered_unverified' }) + '\n'
        : `AcademicCloud private OCR book export\nResource: ${source.resourceId}\nSource: ${source.sourceId}\nPhysical pages: ${source.pageCount}\nOrigin: client_rendered_unverified\n`;
      for (let physicalPage = 1; physicalPage <= source.pageCount; physicalPage++) {
        authorize();
        const id = pages.get(physicalPage);
        const r = id === undefined ? null : repository.result(accountId, id);
        if (id !== undefined && (!r || r.resourceId !== source.resourceId || r.sourceId !== source.sourceId || r.physicalPage !== physicalPage)) throw new LocalOcrError('not_found');
        if (!r) {
          yield format === 'jsonl' ? JSON.stringify({ type: 'page', resourceId: source.resourceId, sourceId: source.sourceId, physicalPage, state: 'missing' }) + '\n'
            : `\n=== Physical page ${physicalPage} ===\nStatus: missing\n`;
          continue;
        }
        yield format === 'jsonl' ? JSON.stringify({ type: 'page', resourceId: source.resourceId, sourceId: source.sourceId,
          physicalPage, state: 'saved', resultId: r.id, deviceId: r.deviceId, rotation: r.rotation,
          status: r.machine.status, truncated: r.machine.truncated, origin: r.origin, provenance: r.machine.provenance,
          imageSha256: r.imageSha256, imageWidth: r.imageWidth, imageHeight: r.imageHeight,
          confidence: r.machine.confidence, lineBoxes: r.machine.lineBoxes ?? null,
          rawText: r.machine.text, correctedText: r.correctedText, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt }) + '\n'
          : `\n=== Physical page ${physicalPage} ===\nResult: ${r.id}\nDevice: ${r.deviceId}\nRotation: ${r.rotation}\nFrame SHA-256: ${r.imageSha256}\nFrame dimensions: ${r.imageWidth}x${r.imageHeight}\nStatus: ${r.machine.status}\nTruncated: ${r.machine.truncated}\nRevision: ${r.revision}\nEngine: ${r.machine.provenance.engineId}\nEngine version: ${r.machine.provenance.engineVersion}\nModel version: ${r.machine.provenance.modelVersion ?? 'unspecified'}\nCreated: ${r.createdAt}\nUpdated: ${r.updatedAt}\nText kind: ${r.correctedText === null ? 'machine' : 'corrected'}\nText:\n${r.correctedText ?? r.machine.text ?? ''}\n${r.correctedText === null ? '' : `Raw machine text:\n${r.machine.text ?? ''}\n`}`;
      }
      authorize();
      yield format === 'jsonl' ? JSON.stringify({ type: 'end', ...source, savedPages: pages.size, missingPages: source.pageCount - pages.size }) + '\n'
        : `\n=== End of export ===\nSaved pages: ${pages.size}\nMissing pages: ${source.pageCount - pages.size}\n`;
    })();
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
