import type { LocalOcrResult, OcrEngineCapabilities } from '@academiccloud/compute-contracts';
import type { DeviceRow, LocalOcrRepository, PairingRow } from '../../local-ocr/model.js';
import type { SqliteDatabase } from './database.js';

const deviceColumns = `id, account_id AS accountId, label, token_digest AS tokenDigest, auth_revision AS authRevision,
  capabilities, created_at AS createdAt, last_seen_at AS lastSeenAt, token_expires_at AS tokenExpiresAt, revoked_at AS revokedAt`;
type StoredDevice = Omit<DeviceRow, 'capabilities'> & { capabilities: string };
const device = (row: StoredDevice): DeviceRow => ({ ...row, capabilities: JSON.parse(row.capabilities) as OcrEngineCapabilities });
const resultColumns = `id, device_id AS deviceId, file_id AS resourceId, source_id AS sourceId, physical_page AS physicalPage,
  image_width AS imageWidth, image_height AS imageHeight, rotation, image_sha256 AS imageSha256, origin, machine_json AS machine,
  corrected_text AS correctedText, revision, created_at AS createdAt, updated_at AS updatedAt`;
type StoredResult = Omit<LocalOcrResult, 'machine'> & { machine: string };
const result = (row: StoredResult): LocalOcrResult => ({ ...row, machine: JSON.parse(row.machine) as LocalOcrResult['machine'] });

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
      created_at, last_seen_at, token_expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.id, d.accountId, d.label, d.tokenDigest, d.authRevision, JSON.stringify(d.capabilities), d.createdAt, d.lastSeenAt, d.tokenExpiresAt, d.revokedAt);
  }
  touchDevice(id: string, now: string): void { this.database.prepare('UPDATE personal_local_ocr_devices SET last_seen_at = ? WHERE id = ?').run(now, id); }
  revokeDevice(accountId: string, id: string, now: string): void {
    this.database.prepare('UPDATE personal_local_ocr_devices SET revoked_at = COALESCE(revoked_at, ?) WHERE account_id = ? AND id = ?').run(now, accountId, id);
  }
  countResults(accountId: string): number {
    return this.database.prepare<[string], { count: number }>('SELECT count(*) AS count FROM personal_local_ocr_results WHERE account_id = ?').get(accountId)!.count;
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
}
