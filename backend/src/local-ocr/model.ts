import type { LocalOcrBookPage, LocalOcrBookQuery, LocalOcrDevice, LocalOcrResult } from '@academiccloud/compute-contracts';

export class LocalOcrError extends Error {
  constructor(readonly code: 'invalid_request' | 'not_found' | 'pairing_invalid' | 'device_authentication_required'
    | 'device_offline' | 'device_unavailable' | 'limit_exceeded' | 'idempotency_conflict' | 'request_inactive' | 'concurrent_change') {
    super(code); this.name = 'LocalOcrError';
  }
}
export interface PairingRow {
  accountId: string; codeDigest: string; label: string; authRevision: number; expiresAt: string; consumedAt: string | null;
}
export interface DeviceRow extends Omit<LocalOcrDevice, 'online'> {
  accountId: string; tokenDigest: string; authRevision: number;
}
export interface LocalOcrRepository {
  savePairing(pairing: PairingRow): void;
  pairing(digest: string): PairingRow | null;
  consumePairing(digest: string, now: string): boolean;
  devices(accountId: string): DeviceRow[];
  device(accountId: string, id: string): DeviceRow | null;
  deviceByDigest(digest: string): DeviceRow | null;
  createDevice(device: DeviceRow): void;
  touchDevice(id: string, now: string): void;
  revokeDevice(accountId: string, id: string, now: string): void;
  countResults(accountId: string): number;
  bookPages(accountId: string, query: LocalOcrBookQuery): LocalOcrBookPage[];
  saveResult(accountId: string, result: LocalOcrResult): void;
  result(accountId: string, id: string): LocalOcrResult | null;
  results(accountId: string, resourceId: string, sourceId: string, physicalPage: number): LocalOcrResult[];
  correctResult(accountId: string, id: string, revision: number, correctedText: string, now: string): boolean;
}
