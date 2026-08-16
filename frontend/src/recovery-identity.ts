// Pending-upload recovery identity: a durable, environment-independent
// comparison for "is this the same file that was reserved?".
//
// Browser MIME inference and Unicode normalization forms differ between
// environments, so they are NOT part of recovery identity. The durable
// facts are: the NFC-normalized display name, the exact byte size, and the
// exact content MD5. The reserved upload keeps its server-side mediaType
// and authorization regardless of what another browser reports.

export function normalizeRecoveredFilename(value: string): string {
  return value.normalize("NFC").trim();
}

export interface RecoveredFileIdentity {
  displayName: string;
  sizeBytes: number;
  checksum: string | null;
}

export function isSameRecoveredFile(
  existing: RecoveredFileIdentity,
  selectedName: string,
  selectedSize: number,
  selectedChecksum: string,
): boolean {
  return (
    normalizeRecoveredFilename(existing.displayName) === normalizeRecoveredFilename(selectedName) &&
    existing.sizeBytes === selectedSize &&
    existing.checksum === selectedChecksum
  );
}
