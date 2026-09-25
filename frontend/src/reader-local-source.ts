import { calculateFileMd5 } from "./md5.ts";
import { forgetSourceHandle, loadSourceHandle, rememberSourceHandle, type RecoverableFileHandle } from "./file-source-recovery.ts";

export interface ReaderSourceIdentity { sizeBytes?: number | undefined; checksum?: { algorithm: "md5"; value: string } | undefined }
export type ReaderFilePicker = (options: { multiple: false; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<RecoverableFileHandle[]>;

export function readerLocalKey(accountId: string, resourceId: string, sourceId: string): string {
  return `reader:${JSON.stringify([accountId, resourceId, sourceId])}`;
}

export async function verifyReaderFile(file: File, identity: ReaderSourceIdentity, signal?: AbortSignal): Promise<void> {
  if (!Number.isSafeInteger(identity.sizeBytes) || !identity.checksum || identity.checksum.algorithm !== "md5") throw new Error("reader_identity_unavailable");
  if (file.size !== identity.sizeBytes || await calculateFileMd5(file, signal ? { signal } : {}) !== identity.checksum.value) throw new Error("reader_file_mismatch");
}

export async function restoreReaderFile(key: string, identity: ReaderSourceIdentity, signal?: AbortSignal): Promise<{ file?: File; needsSelection: boolean }> {
  const handle = await loadSourceHandle(key);
  if (!handle) return { needsSelection: false };
  try {
    // Startup never prompts for broader filesystem permission.
    if (await handle.queryPermission?.({ mode: "read" }) !== "granted") return { needsSelection: true };
    const file = await handle.getFile();
    await verifyReaderFile(file, identity, signal);
    return { file, needsSelection: false };
  } catch { return { needsSelection: true }; }
}

export async function rememberReaderFile(key: string, handle: RecoverableFileHandle | null): Promise<boolean> {
  if (!handle || typeof indexedDB === "undefined") return false;
  return rememberSourceHandle(key, handle);
}
export { forgetSourceHandle as forgetReaderFile };
