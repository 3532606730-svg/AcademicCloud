import { createHash } from "node:crypto";
import { chmod, mkdtemp, open, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalOcrBookSourceGrant } from "@academiccloud/compute-contracts";
import { MemberOcrError } from "./member-paddle.js";

export const MEMBER_BOOK_MAX_SOURCE_BYTES = 1024 * 1024 * 1024;
export const MEMBER_BOOK_SOURCE_CHUNK_BYTES = 1024 * 1024;
/** Deployment transport policy, separate from storage or engine implementations. */
export const MEMBER_BOOK_SOURCE_ORIGINS = [
  "https://academiccloud-private.oss-ap-southeast-3.aliyuncs.com", "https://files.ajtlab.top",
] as const;
const DIGEST_LENGTHS: Readonly<Record<string, number>> = { md5: 32, sha1: 40, sha256: 64, sha512: 128 };
export interface PrivateBookSource { path: string; sizeBytes: number; close(): Promise<void> }
function digestHex(algorithm: string, value: string): string {
  if (value.length === DIGEST_LENGTHS[algorithm] && /^[a-f0-9]+$/iu.test(value)) return value.toLowerCase();
  if (algorithm === 'md5' && /^[A-Za-z0-9+/]{22}==$/u.test(value)) {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 16 && decoded.toString('base64') === value) return decoded.toString('hex');
  }
  throw new MemberOcrError('protocol_invalid');
}
function normalizedEtag(value: string): string { return value.replace(/^"|"$/gu, ''); }

export function validateBookSourceGrant(value: unknown, expected: { resourceId: string; sourceId: string },
  origins: readonly string[] = MEMBER_BOOK_SOURCE_ORIGINS): LocalOcrBookSourceGrant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemberOcrError('protocol_invalid');
  const v = value as Record<string, unknown>;
  const keys = ['resourceId', 'sourceId', 'url', 'expiresAt', 'sizeBytes', 'checksumAlgorithm', 'checksum', 'etag'];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(key => !keys.includes(key))
    || v.resourceId !== expected.resourceId || v.sourceId !== expected.sourceId
    || typeof v.url !== 'string' || v.url.length > 16_384 || /[\x00\r\n]/u.test(v.url)
    || typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt))
    || Date.parse(v.expiresAt) <= Date.now() || Date.parse(v.expiresAt) > Date.now() + 305_000
    || !Number.isSafeInteger(v.sizeBytes) || Number(v.sizeBytes) < 5 || Number(v.sizeBytes) > MEMBER_BOOK_MAX_SOURCE_BYTES
    || typeof v.checksumAlgorithm !== 'string' || !DIGEST_LENGTHS[v.checksumAlgorithm]
    || typeof v.checksum !== 'string'
    || (v.etag !== null && (typeof v.etag !== 'string' || v.etag.length > 256 || /[\x00\r\n]/u.test(v.etag)))) throw new MemberOcrError('protocol_invalid');
  digestHex(v.checksumAlgorithm, v.checksum);
  try {
    const url = new URL(v.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !origins.includes(url.origin)) throw new Error();
  } catch { throw new MemberOcrError('protocol_invalid'); }
  return v as unknown as LocalOcrBookSourceGrant;
}

/** Stream an exact authorized source to a private file. Never retain a book-sized byte array. */
export async function downloadBookSource(grant: LocalOcrBookSourceGrant, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<PrivateBookSource> {
  grant = validateBookSourceGrant(grant, grant);
  if (signal.aborted) throw new MemberOcrError('aborted');
  const directory = await mkdtemp(join(tmpdir(), 'academiccloud-private-book-'));
  const path = join(directory, 'source.pdf');
  const cleanup = async () => { await unlink(path).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); await rmdir(directory); };
  let complete = false;
  try {
    await chmod(directory, 0o700);
    const output = await open(path, 'wx', 0o600);
    try {
      const deadline = AbortSignal.timeout(Math.max(1, Math.min(300_000, Date.parse(grant.expiresAt) - Date.now())));
      const active = AbortSignal.any([signal, deadline]);
      const response = await fetcher(grant.url, { method: 'GET', redirect: 'error', signal: active });
      if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw new MemberOcrError('network_failed'); }
      const length = response.headers.get('content-length');
      const etag = response.headers.get('etag');
      if ((length !== null && (!/^\d+$/u.test(length) || Number(length) !== grant.sizeBytes))
        || (grant.etag !== null && etag !== null && normalizedEtag(grant.etag) !== normalizedEtag(etag))) {
        await response.body.cancel(); throw new MemberOcrError('input_invalid');
      }
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      active.addEventListener('abort', cancel, { once: true });
      const hash = createHash(grant.checksumAlgorithm);
      let received = 0, header = Buffer.alloc(0);
      try {
        for (;;) {
          if (active.aborted) throw new MemberOcrError('aborted');
          const next = await reader.read();
          if (next.done) break;
          if (next.value.byteLength > MEMBER_BOOK_SOURCE_CHUNK_BYTES || received + next.value.byteLength > grant.sizeBytes) throw new MemberOcrError('input_invalid');
          if (header.length < 5) {
            header = Buffer.concat([header, next.value.subarray(0, 5 - header.length)]);
            if (header.length === 5 && header.toString('ascii') !== '%PDF-') throw new MemberOcrError('input_invalid');
          }
          hash.update(next.value);
          let offset = 0;
          while (offset < next.value.byteLength) {
            const written = await output.write(next.value, offset, next.value.byteLength - offset);
            if (written.bytesWritten < 1) throw new MemberOcrError('network_failed');
            offset += written.bytesWritten;
          }
          received += next.value.byteLength;
        }
        if (active.aborted) throw new MemberOcrError('aborted');
        if (received !== grant.sizeBytes || header.length !== 5 || hash.digest('hex') !== digestHex(grant.checksumAlgorithm, grant.checksum)) throw new MemberOcrError('input_invalid');
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { active.removeEventListener('abort', cancel); reader.releaseLock(); }
    } finally { await output.close(); }
    complete = true;
    let closing: Promise<void> | undefined;
    return { path, sizeBytes: grant.sizeBytes, close() { return closing ??= cleanup(); } };
  } catch (error) {
    if (error instanceof MemberOcrError) throw error;
    throw new MemberOcrError(signal.aborted ? 'aborted' : 'network_failed');
  } finally { if (!complete) await cleanup(); }
}
