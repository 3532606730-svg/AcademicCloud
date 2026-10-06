import { LOCAL_OCR_BOOK_LIMITS, type LocalOcrBookPage, type LocalOcrBookQuery, type LocalOcrResult, type OcrEngineCapabilities } from '@academiccloud/compute-contracts';
import type { BookJobRow, BookPageReceiptRow, DeviceRow, LocalOcrRepository, PairingRow } from '../../local-ocr/model.js';
import type { SqliteDatabase } from './database.js';

const deviceColumns = `id, account_id AS accountId, label, token_digest AS tokenDigest, auth_revision AS authRevision,
  capabilities, transport_features AS transportFeatures, created_at AS createdAt, last_seen_at AS lastSeenAt, token_expires_at AS tokenExpiresAt, revoked_at AS revokedAt`;
type StoredDevice = Omit<DeviceRow, 'capabilities' | 'transportFeatures'> & { capabilities: string; transportFeatures: string };
const device = (row: StoredDevice): DeviceRow => ({ ...row, capabilities: JSON.parse(row.capabilities) as OcrEngineCapabilities,
  transportFeatures: JSON.parse(row.transportFeatures) as DeviceRow['transportFeatures'] });
const resultColumns = `id, device_id AS deviceId, file_id AS resourceId, source_id AS sourceId, physical_page AS physicalPage,
  image_width AS imageWidth, image_height AS imageHeight, rotation, image_sha256 AS imageSha256, origin, machine_json AS machine,
  corrected_text AS correctedText, revision, created_at AS createdAt, updated_at AS updatedAt`;
type StoredResult = Omit<LocalOcrResult, 'machine'> & { machine: string };
const result = (row: StoredResult): LocalOcrResult => ({ ...row, machine: JSON.parse(row.machine) as LocalOcrResult['machine'] });
const bookColumns = `id, account_id AS accountId, auth_revision AS authRevision, client_request_id AS clientRequestId,
  request_digest AS requestDigest,
  device_id AS deviceId, file_id AS resourceId, source_id AS sourceId, page_count AS pageCount, state, error_code AS errorCode,
  failed_physical_page AS failedPhysicalPage, attempt_id AS attemptId, lease_expires_at AS leaseExpiresAt,
  decoded_page_count AS decodedPageCount, capabilities_json AS capabilities, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt`;
type StoredBook = Omit<BookJobRow, 'capabilities'> & { capabilities: string };
const book = (row: StoredBook): BookJobRow => ({ ...row, capabilities: JSON.parse(row.capabilities) as OcrEngineCapabilities });

export class SqliteLocalOcrRepository implements LocalOcrRepository {
  constructor(private readonly database: SqliteDatabase) {}
  savePairing(p: PairingRow): void {
    // One current pairing code per account; issuing a new code invalidates the previous unconsumed code.
    this.database.prepare(`INSERT INTO personal_local_ocr_pairings (account_id, code_digest, label, auth_revision, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(account_id) DO UPDATE SET code_digest = excluded.code_digest,
      label = excluded.label, auth_revision = excluded.auth_revision, expires_at = excluded.expires_at, consumed_at = NULL`)
      .run(p.accountId, p.codeDigest, p.label, p.authRevision, p.expiresAt);
  }
  pairing(digest: string): PairingRow | null {
    return this.database.prepare<[string], PairingRow>(`SELECT account_id AS accountId, code_digest AS codeDigest, label,
      auth_revision AS authRevision, expires_at AS expiresAt, consumed_at AS consumedAt FROM personal_local_ocr_pairings WHERE code_digest = ?`).get(digest) ?? null;
  }
  consumePairing(digest: string, now: string): boolean {
    return this.database.prepare('UPDATE personal_local_ocr_pairings SET consumed_at = ? WHERE code_digest = ? AND consumed_at IS NULL AND expires_at > ?').run(now, digest, now).changes === 1;
  }
  devices(accountId: string): DeviceRow[] {
    return this.database.prepare<[string], StoredDevice>(`SELECT ${deviceColumns} FROM personal_local_ocr_devices WHERE account_id = ? ORDER BY created_at DESC, id DESC`).all(accountId).map(device);
  }
  device(accountId: string, id: string): DeviceRow | null {
    const row = this.database.prepare<[string, string], StoredDevice>(`SELECT ${deviceColumns} FROM personal_local_ocr_devices WHERE account_id = ? AND id = ?`).get(accountId, id);
    return row ? device(row) : null;
  }
  deviceByDigest(digest: string): DeviceRow | null {
    const row = this.database.prepare<[string], StoredDevice>(`SELECT ${deviceColumns} FROM personal_local_ocr_devices WHERE token_digest = ?`).get(digest);
    return row ? device(row) : null;
  }
  createDevice(d: DeviceRow): void {
    this.database.prepare(`INSERT INTO personal_local_ocr_devices (id, account_id, label, token_digest, auth_revision, capabilities,
      transport_features, created_at, last_seen_at, token_expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.id, d.accountId, d.label, d.tokenDigest, d.authRevision, JSON.stringify(d.capabilities), JSON.stringify(d.transportFeatures), d.createdAt, d.lastSeenAt, d.tokenExpiresAt, d.revokedAt);
  }
  touchDevice(id: string, now: string): void { this.database.prepare('UPDATE personal_local_ocr_devices SET last_seen_at = ? WHERE id = ?').run(now, id); }
  revokeDevice(accountId: string, id: string, now: string): void {
    this.database.prepare('UPDATE personal_local_ocr_devices SET revoked_at = COALESCE(revoked_at, ?) WHERE account_id = ? AND id = ?').run(now, accountId, id);
  }
  countResults(accountId: string): number {
    return this.database.prepare<[string], { count: number }>('SELECT count(*) AS count FROM personal_local_ocr_results WHERE account_id = ?').get(accountId)!.count;
  }
  savedPhysicalPages(accountId: string, query: LocalOcrBookQuery): number[] {
    // The page set is identical to the latest-result projection, without
    // reading/parsing private machine payloads during device lease polling.
    return this.database.prepare<[string,string,string,number],{physicalPage:number}>(`SELECT DISTINCT physical_page AS physicalPage
      FROM personal_local_ocr_results WHERE account_id=? AND file_id=? AND source_id=? AND physical_page<=? ORDER BY physical_page`)
      .all(accountId,query.resourceId,query.sourceId,query.pageCount).map(row=>row.physicalPage);
  }
  bookPages(accountId: string, query: LocalOcrBookQuery): LocalOcrBookPage[] {
    type StoredPage = Omit<LocalOcrBookPage, 'truncated' | 'hasCorrection'> & { truncated: number; hasCorrection: number };
    // Extract only summary scalars in SQLite. A book read must not parse all
    // retained machine payloads or let a correction reorder machine history.
    return this.database.prepare<[string, string, string, number], StoredPage>(`WITH ranked AS (
      SELECT id AS resultId, physical_page AS physicalPage, rotation, created_at AS createdAt,
        json_extract(machine_json, '$.status') AS status,
        json_extract(machine_json, '$.truncated') AS truncated,
        corrected_text IS NOT NULL AS hasCorrection,
        ROW_NUMBER() OVER (PARTITION BY physical_page ORDER BY created_at DESC, id DESC) AS current_rank
      FROM personal_local_ocr_results
      WHERE account_id = ? AND file_id = ? AND source_id = ? AND physical_page <= ?
    ) SELECT physicalPage, resultId, rotation, status, truncated, hasCorrection, createdAt
      FROM ranked WHERE current_rank = 1 ORDER BY physicalPage`)
      .all(accountId, query.resourceId, query.sourceId, query.pageCount)
      .map((row) => ({ ...row, truncated: row.truncated === 1, hasCorrection: row.hasCorrection === 1 }));
  }
  saveResult(accountId: string, r: LocalOcrResult): void {
    this.database.prepare(`INSERT INTO personal_local_ocr_results (id, account_id, device_id, file_id, source_id, physical_page,
      image_width, image_height, rotation, image_sha256, origin, machine_json, corrected_text, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.id, accountId, r.deviceId, r.resourceId, r.sourceId, r.physicalPage,
      r.imageWidth, r.imageHeight, r.rotation, r.imageSha256, r.origin, JSON.stringify(r.machine), r.correctedText, r.revision, r.createdAt, r.updatedAt);
  }
  result(accountId: string, id: string): LocalOcrResult | null {
    const row = this.database.prepare<[string, string], StoredResult>(`SELECT ${resultColumns} FROM personal_local_ocr_results WHERE account_id = ? AND id = ?`).get(accountId, id);
    return row ? result(row) : null;
  }
  results(accountId: string, resourceId: string, sourceId: string, physicalPage: number): LocalOcrResult[] {
    return this.database.prepare<[string, string, string, number], StoredResult>(`SELECT ${resultColumns} FROM personal_local_ocr_results
      WHERE account_id = ? AND file_id = ? AND source_id = ? AND physical_page = ? ORDER BY created_at DESC, id DESC LIMIT 20`)
      .all(accountId, resourceId, sourceId, physicalPage).map(result);
  }
  correctResult(accountId: string, id: string, revision: number, correctedText: string, now: string): boolean {
    return this.database.prepare(`UPDATE personal_local_ocr_results SET corrected_text = ?, revision = revision + 1, updated_at = ?
      WHERE account_id = ? AND id = ? AND revision = ?`).run(correctedText, now, accountId, id, revision).changes === 1;
  }
  bookJob(accountId: string, id: string): BookJobRow | null {
    const row = this.database.prepare<[string,string],StoredBook>(`SELECT ${bookColumns} FROM personal_local_ocr_book_jobs WHERE account_id = ? AND id = ?`).get(accountId,id);
    return row ? book(row) : null;
  }
  bookJobByClientRequest(accountId: string, clientRequestId: string): BookJobRow | null {
    const row = this.database.prepare<[string,string],StoredBook>(`SELECT ${bookColumns} FROM personal_local_ocr_book_jobs WHERE account_id = ? AND client_request_id = ?`).get(accountId,clientRequestId);
    return row ? book(row) : null;
  }
  countBookJobs(accountId: string): number {
    return this.database.prepare<[string],{count:number}>('SELECT count(*) AS count FROM personal_local_ocr_book_jobs WHERE account_id=?').get(accountId)!.count;
  }
  bookJobs(accountId: string, filter: {resourceId?: string; sourceId?: string}): BookJobRow[] {
    return this.database.prepare<[string,string|null,string|null,string|null,string|null],StoredBook>(`SELECT ${bookColumns} FROM personal_local_ocr_book_jobs
      WHERE account_id = ? AND (? IS NULL OR file_id = ?) AND (? IS NULL OR source_id = ?) ORDER BY created_at DESC,id DESC LIMIT ${LOCAL_OCR_BOOK_LIMITS.maxRetainedJobsPerAccount}`)
      .all(accountId,filter.resourceId ?? null,filter.resourceId ?? null,filter.sourceId ?? null,filter.sourceId ?? null).map(book);
  }
  activeBookJobs(): BookJobRow[] {
    return this.database.prepare<[],StoredBook>(`SELECT ${bookColumns} FROM personal_local_ocr_book_jobs WHERE state IN ('queued','running') ORDER BY created_at,id`).all().map(book);
  }
  saveBookJob(j: BookJobRow): void {
    this.database.prepare(`INSERT INTO personal_local_ocr_book_jobs(id,account_id,auth_revision,client_request_id,request_digest,device_id,file_id,source_id,page_count,
      state,error_code,failed_physical_page,attempt_id,lease_expires_at,decoded_page_count,capabilities_json,created_at,updated_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(j.id,j.accountId,j.authRevision,j.clientRequestId,j.requestDigest,j.deviceId,j.resourceId,j.sourceId,j.pageCount,
      j.state,j.errorCode,j.failedPhysicalPage,j.attemptId,j.leaseExpiresAt,j.decodedPageCount,JSON.stringify(j.capabilities),j.createdAt,j.updatedAt,j.expiresAt);
  }
  updateBookJob(j: BookJobRow): void {
    this.database.prepare(`UPDATE personal_local_ocr_book_jobs SET device_id=?,state=?,error_code=?,failed_physical_page=?,attempt_id=?,lease_expires_at=?,
      decoded_page_count=?,capabilities_json=?,updated_at=? WHERE account_id=? AND id=?`).run(j.deviceId,j.state,j.errorCode,j.failedPhysicalPage,j.attemptId,
      j.leaseExpiresAt,j.decodedPageCount,JSON.stringify(j.capabilities),j.updatedAt,j.accountId,j.id);
  }
  bookReceipt(bookId: string, physicalPage: number): BookPageReceiptRow | null {
    return this.database.prepare<[string,number],BookPageReceiptRow>(`SELECT job_id AS bookId,physical_page AS physicalPage,result_id AS resultId,
      accepted_attempt_id AS acceptedAttemptId,payload_digest AS payloadDigest,created_at AS createdAt FROM personal_local_ocr_book_page_receipts WHERE job_id=? AND physical_page=?`).get(bookId,physicalPage) ?? null;
  }
  saveBookReceipt(r: BookPageReceiptRow): void {
    this.database.prepare(`INSERT INTO personal_local_ocr_book_page_receipts(job_id,physical_page,result_id,accepted_attempt_id,payload_digest,created_at)
      VALUES (?,?,?,?,?,?)`).run(r.bookId,r.physicalPage,r.resultId,r.acceptedAttemptId,r.payloadDigest,r.createdAt);
  }
}
