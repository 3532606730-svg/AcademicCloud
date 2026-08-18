import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import { inflateSync } from "node:zlib";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { createApp } from "../../src/platform/app.js";
import type {
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  CreateDownloadAuthorizationInput,
  CreateUploadAuthorizationInput,
  StorageAdapter,
  StorageObjectMetadata,
} from "../../src/storage/storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";

interface StoredBytes {
  bytes: Buffer;
  mediaType: string;
  md5: string;
}

class LocalHttpObjectStorage implements StorageAdapter {
  readonly provider = "local-http-test";
  readonly browserPreviewAvailable = true;
  readonly objects = new Map<string, StoredBytes>();
  readonly authorizations = new Map<string, CreateUploadAuthorizationInput>();
  readonly server = createServer((request, response) => {
    void this.handle(request, response);
  });
  baseUrl = "";

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    assert.ok(address && typeof address === "object");
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  async createUploadAuthorization(input: CreateUploadAuthorizationInput): Promise<BrowserUploadAuthorization> {
    this.authorizations.set(input.objectKey, input);
    return {
      method: "POST",
      url: `${this.baseUrl}/upload`,
      fields: {
        key: input.objectKey,
        "Content-Type": input.mediaType,
        "Content-MD5": input.expectedChecksum.value,
        "x-oss-forbid-overwrite": "true",
        success_action_status: "201",
      },
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async createDownloadAuthorization(input: CreateDownloadAuthorizationInput): Promise<BrowserDownloadAuthorization> {
    return {
      method: "GET",
      url: `${this.baseUrl}/objects/${encodeURIComponent(input.objectKey)}?disposition=${input.disposition ?? "attachment"}`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async statObject(objectKey: string): Promise<StorageObjectMetadata | null> {
    const response = await fetch(`${this.baseUrl}/objects/${encodeURIComponent(objectKey)}`, {
      method: "HEAD",
    });

    if (response.status === 404) return null;
    assert.equal(response.status, 200);
    return {
      objectKey,
      sizeBytes: Number(response.headers.get("content-length")),
      etag: response.headers.get("etag"),
      checksumAlgorithm: "md5",
      checksum: response.headers.get("content-md5"),
      mediaType: response.headers.get("content-type"),
      modifiedAt: null,
    };
  }

  async readObject(objectKey: string, maxBytes: number): Promise<Uint8Array | null> {
    const object = this.objects.get(objectKey);

    if (!object) return null;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || object.bytes.length > maxBytes) {
      throw new RangeError("bounded read limit exceeded");
    }

    return new Uint8Array(object.bytes);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/objects/${encodeURIComponent(objectKey)}`, {
      method: "DELETE",
    });
    assert.ok(response.status === 204 || response.status === 404);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (request.method === "POST" && request.url === "/upload") {
        const body = await readRequest(request);
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        const form = await new Request(`${this.baseUrl}/upload`, {
          method: "POST",
          headers,
          body,
        }).formData();
        const key = String(form.get("key") ?? "");
        const expected = this.authorizations.get(key);
        const file = form.get("file");

        if (!expected || !(file instanceof Blob)) return send(response, 400);
        const bytes = Buffer.from(await file.arrayBuffer());
        const md5 = createHash("md5").update(bytes).digest("base64");
        const valid =
          form.get("Content-Type") === expected.mediaType &&
          form.get("Content-MD5") === expected.expectedChecksum.value &&
          form.get("x-oss-forbid-overwrite") === "true" &&
          form.get("success_action_status") === "201" &&
          file.type === expected.mediaType &&
          bytes.length === expected.contentLength &&
          md5 === expected.expectedChecksum.value;

        if (!valid) return send(response, 400);
        if (this.objects.has(key)) return send(response, 409);
        this.objects.set(key, { bytes, mediaType: expected.mediaType, md5 });
        return send(response, 201);
      }

      const key = decodeObjectKey(request.url);
      const object = key && this.objects.get(key);

      if (!key || !object) return send(response, 404);
      response.setHeader("content-length", String(object.bytes.length));
      response.setHeader("content-type", object.mediaType);
      response.setHeader("content-md5", object.md5);
      response.setHeader("etag", `\"${object.md5}\"`);
      const disposition = new URL(request.url ?? "/", this.baseUrl).searchParams.get("disposition");
      response.setHeader("content-disposition", disposition === "inline" ? "inline" : "attachment");

      if (request.method === "HEAD") return send(response, 200);
      if (request.method === "GET") return send(response, 200, object.bytes);
      if (request.method === "DELETE") {
        this.objects.delete(key);
        return send(response, 204);
      }

      return send(response, 405);
    } catch {
      return send(response, 500);
    }
  }
}

function decodeObjectKey(url: string | undefined): string | null {
  const pathname = new URL(url ?? "/", "http://127.0.0.1").pathname;
  if (!pathname.startsWith("/objects/")) return null;
  return decodeURIComponent(pathname.slice("/objects/".length));
}

function createMinimalPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\nendstream",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, "ascii");
}

function assertOpenableFixture(bytes: Buffer, mediaType: string): void {
  if (mediaType === "application/pdf") {
    const document = bytes.toString("ascii");
    const offset = Number(/startxref\n(\d+)\n%%EOF/.exec(document)?.[1]);
    assert.equal(document.slice(offset, offset + 4), "xref");
    assert.match(document, /\/Type \/Page\b/);
    return;
  }

  if (mediaType === "image/png") {
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const compressed: Buffer[] = [];
    let offset = 8;
    let ended = false;

    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
      if (type === "IEND") ended = true;
      offset += 12 + length;
    }

    assert.equal(offset, bytes.length);
    assert.equal(ended, true);
    assert.ok(inflateSync(Buffer.concat(compressed)).length > 0);
  }
}

async function readRequest(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, status: number, body?: Buffer): void {
  response.statusCode = status;
  response.end(body);
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  assert.ok(raw);
  return String(Array.isArray(raw) ? raw[0] : raw).split(";", 1)[0]!;
}

async function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: "owner-1",
    loginName: "Scholar",
    passwordHash: "test:password",
    role: "owner",
    state: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const hasher: PasswordHasher = {
    hash: (password) => Promise.resolve(`test:${password}`),
    verify: (hash, password) => Promise.resolve(hash === `test:${password}`),
  };
  const storage = new LocalHttpObjectStorage();
  await storage.start();
  context.after(() => storage.close());
  const app = await createApp({
    logger: false,
    auth: {
      service: new AuthService({
        persistence,
        passwordHasher: hasher,
      }),
      appOrigin: ORIGIN,
      environment: "test",
    },
    drive: { service: new DriveService(persistence, storage) },
  });
  context.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: { loginName: "Scholar", password: "password" },
  });
  assert.equal(login.statusCode, 200);
  return { app, storage, cookie: cookieFrom(login) };
}

test("authorized multipart bytes traverse HTTP storage, activate, and download unchanged", async (context) => {
  const { app, storage, cookie } = await fixture(context);
  const cases = [
    { name: "史料 paper.pdf", type: "application/pdf", bytes: createMinimalPdf(), disposition: "inline" },
    { name: "scan.png", type: "image/png", bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"), disposition: "inline" },
    { name: "笔记.txt", type: "text/plain", bytes: Buffer.from("AcademicCloud 中文文本\n", "utf8"), disposition: "inline" },
    { name: "archive.bin", type: "application/octet-stream", bytes: Buffer.from(Array.from({ length: 512 }, (_, index) => index % 256)), disposition: "attachment" },
  ];

  for (const item of cases) {
    assertOpenableFixture(item.bytes, item.type);
    const md5 = createHash("md5").update(item.bytes).digest("base64");
    const sha256 = createHash("sha256").update(item.bytes).digest("hex");
    const authorizationResponse = await app.inject({
      method: "POST",
      url: "/api/drive/uploads",
      headers: { origin: ORIGIN, cookie },
      payload: {
        displayName: item.name,
        mediaType: item.type,
        sizeBytes: item.bytes.length,
        checksum: { algorithm: "md5", value: md5 },
      },
    });
    assert.equal(authorizationResponse.statusCode, 201);
    const authorization = authorizationResponse.json<{
      file: { id: string };
      upload: { url: string; fields: Record<string, string> };
    }>();
    const form = new FormData();
    for (const [name, value] of Object.entries(authorization.upload.fields)) form.append(name, value);
    form.append("file", new Blob([item.bytes], { type: item.type }), item.name);
    const uploaded = await fetch(authorization.upload.url, { method: "POST", body: form });
    assert.equal(uploaded.status, 201);
    const replay = await fetch(authorization.upload.url, { method: "POST", body: form });
    assert.equal(replay.status, 409);

    const completed = await app.inject({
      method: "POST",
      url: `/api/drive/uploads/${authorization.file.id}/complete`,
      headers: { origin: ORIGIN, cookie },
    });
    assert.equal(completed.statusCode, 200);
    const downloadResponse = await app.inject({
      method: "GET",
      url: `/api/drive/files/${authorization.file.id}/download?disposition=${item.disposition}`,
      headers: { cookie },
    });
    assert.equal(downloadResponse.statusCode, 200);
    const download = await fetch(downloadResponse.json<{ download: { url: string } }>().download.url);
    assert.match(download.headers.get("content-disposition") ?? "", new RegExp(`^${item.disposition}`));
    const downloadedBytes = Buffer.from(await download.arrayBuffer());
    assert.equal(downloadedBytes.length, item.bytes.length);
    assert.equal(createHash("sha256").update(downloadedBytes).digest("hex"), sha256);
    assert.equal(storage.objects.size > 0, true);
  }
});
