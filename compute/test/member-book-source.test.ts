import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { downloadBookSource, validateBookSourceGrant, MEMBER_BOOK_MAX_SOURCE_BYTES, MEMBER_BOOK_SOURCE_CHUNK_BYTES } from '../src/member-book-source.js';
import type { LocalOcrBookSourceGrant } from '@academiccloud/compute-contracts';

const bytes = Buffer.from('%PDF-1.7\nsynthetic source');
function grant(): LocalOcrBookSourceGrant { return { resourceId: 'resource1', sourceId: 'source1', url: 'https://files.ajtlab.top/object?signed=opaque',
  expiresAt: new Date(Date.now() + 299_000).toISOString(), sizeBytes: bytes.length, checksumAlgorithm: 'md5',
  checksum: createHash('md5').update(bytes).digest('base64'), etag: 'etag1' }; }
test('source grants bind exact source, trusted HTTPS origins, expiry, digest and one-GiB budget', () => {
  assert.equal(validateBookSourceGrant(grant(), grant()).sizeBytes, bytes.length);
  for (const patch of [{ sourceId: 'other' }, { url: 'https://evil.invalid/object' }, { url: 'http://files.ajtlab.top/x' },
    { url: 'https://user:pass@files.ajtlab.top/x' }, { url: 'https://files.ajtlab.top/x#fragment' }, { sizeBytes: MEMBER_BOOK_MAX_SOURCE_BYTES + 1 },
    { checksumAlgorithm: 'unknown' }, { checksum: 'bad' }, { expiresAt: new Date(0).toISOString() }, { secret: 'private' }]) {
    assert.throws(() => validateBookSourceGrant({ ...grant(), ...patch }, grant()));
  }
});
test('download streams fragmented header into private temp, checks base64 MD5/ETag and cleanup is idempotent', async () => {
  let init: RequestInit | undefined;
  const file = await downloadBookSource(grant(), new AbortController().signal, async (_url, options) => {
    init = options;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 2)); controller.enqueue(bytes.subarray(2)); controller.close(); } }),
      { headers: { 'content-length': String(bytes.length), etag: '"etag1"' } });
  });
  assert.equal(init?.redirect, 'error'); assert.equal(init?.headers, undefined, 'never forward the device bearer to storage');
  assert.deepEqual(await readFile(file.path), bytes);
  if (process.platform !== 'win32') assert.equal((await stat(file.path)).mode & 0o777, 0o600);
  await file.close(); await file.close(); await assert.rejects(stat(file.path));
});
test('wrong bytes, length, header, ETag, oversized chunk or redirect fail before source reaches renderer', async () => {
  for (const response of [new Response(bytes.subarray(0, bytes.length - 1)), new Response(Buffer.from('not a PDF source')), new Response(Buffer.from('%PDF-but different')),
    new Response(bytes, { headers: { 'content-length': '999' } }), new Response(bytes, { headers: { etag: 'other' } }),
    new Response(new Uint8Array(MEMBER_BOOK_SOURCE_CHUNK_BYTES + 1)), new Response(null, { status: 302 })]) {
    await assert.rejects(downloadBookSource(grant(), new AbortController().signal, async () => response));
  }
  const c = new AbortController(); c.abort(); let requests = 0;
  await assert.rejects(downloadBookSource(grant(), c.signal, async () => { requests++; return new Response(bytes); })); assert.equal(requests, 0);
});
test('source cancellation cancels an outstanding stream read rather than waiting for more private bytes', async () => {
  const controller = new AbortController(); let cancelled = false;
  const downloading = downloadBookSource(grant(), controller.signal, async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(bytes.subarray(0, 5)); setTimeout(() => controller.abort(), 5); }, cancel() { cancelled = true; },
  })));
  await assert.rejects(downloading, { message: 'aborted' }); assert.equal(cancelled, true);
});
