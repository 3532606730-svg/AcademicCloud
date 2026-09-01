import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

import {
  CATALOG_BATCH_SCHEMA_VERSION,
  CATALOG_EXPORT_REQUEST_SCHEMA_VERSION,
  CATALOG_FILENAME_POLICY_VERSION,
  canonicalCatalogJson,
  type CatalogBatchManifest,
  type CatalogExportRequest,
  type CatalogResourceEvidence,
} from "@academiccloud/compute-contracts";

import { classifySuggestionPage } from "./extractor.js";
import { PaddleOcrSidecarAdapter } from "./paddle-ocr.js";
import { PdfJsFrontMatterInspector } from "./pdf-text.js";
import { SUGGESTION_LIMITS, type BoundedPdfTextSource, type PdfRangeSource } from "./suggestion.js";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 160 * 1024 * 1024;
const MAX_ZIP_BYTES = 128 * 1024 * 1024;
const RANGE_TIMEOUT_MILLISECONDS = 45_000;
const SOURCE_RENEWAL_MARGIN_MILLISECONDS = 60_000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export class CatalogExportError extends Error {
  constructor(readonly code: "invalid_request" | "source_unavailable" | "identity_mismatch" | "limit_exceeded" | "inspection_failed") {
    super(code);
    this.name = "CatalogExportError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CatalogExportError("invalid_request");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))
    || Object.keys(value).some((key) => !keys.includes(key))) throw new CatalogExportError("invalid_request");
}

function safeUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048 || /[\u0000\r\n]/u.test(value)) throw new CatalogExportError("invalid_request");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new CatalogExportError("invalid_request"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname))) {
    throw new CatalogExportError("invalid_request");
  }
  return parsed.origin;
}

export function parseCatalogExportRequest(value: unknown): CatalogExportRequest {
  const input = object(value);
  exactKeys(input, ["schemaVersion", "manifest", "sourceManifestSha256", "sourceAccess"]);
  if (input.schemaVersion !== CATALOG_EXPORT_REQUEST_SCHEMA_VERSION) throw new CatalogExportError("invalid_request");
  const manifest = object(input.manifest);
  exactKeys(manifest, ["schemaVersion", "batchId", "createdAt", "namingPolicyVersion", "evidencePolicy", "resources"]);
  if (manifest.schemaVersion !== CATALOG_BATCH_SCHEMA_VERSION || manifest.namingPolicyVersion !== CATALOG_FILENAME_POLICY_VERSION
    || typeof manifest.batchId !== "string" || !SAFE_ID.test(manifest.batchId)
    || typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))
    || !Array.isArray(manifest.resources) || manifest.resources.length < 1 || manifest.resources.length > 500) {
    throw new CatalogExportError("invalid_request");
  }
  const policy = object(manifest.evidencePolicy);
  exactKeys(policy, ["firstPages", "lastPages", "maxPages", "maxCharactersPerPage", "maxCharactersPerResource", "selectiveOcr", "includesSourceBytes"]);
  if (policy.firstPages !== 15 || policy.lastPages !== 5 || policy.maxPages !== 20
    || policy.maxCharactersPerPage !== SUGGESTION_LIMITS.maxPageTextCharacters
    || policy.maxCharactersPerResource !== SUGGESTION_LIMITS.maxTotalTextCharacters
    || policy.selectiveOcr !== true || policy.includesSourceBytes !== false) throw new CatalogExportError("invalid_request");
  const seen = new Set<string>();
  for (const value of manifest.resources) {
    const resource = object(value);
    exactKeys(resource, ["resourceId", "sourceIdentity", "currentFilename", "mediaType", "sizeBytes", "pageCount", "evidenceFile"]);
    if (typeof resource.resourceId !== "string" || !SAFE_ID.test(resource.resourceId) || seen.has(resource.resourceId)
      || resource.mediaType !== "application/pdf" || !Number.isSafeInteger(resource.sizeBytes) || (resource.sizeBytes as number) < 5
      || resource.pageCount !== null || resource.evidenceFile !== `resources/${resource.resourceId}.json`
      || typeof resource.currentFilename !== "string" || resource.currentFilename.length < 1 || resource.currentFilename.length > 512) {
      throw new CatalogExportError("invalid_request");
    }
    seen.add(resource.resourceId);
    const identity = object(resource.sourceIdentity);
    exactKeys(identity, ["sourceFingerprint", "fileRevision", "checksumAlgorithm", "checksum"]);
    if (typeof identity.sourceFingerprint !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(identity.sourceFingerprint)
      || !Number.isSafeInteger(identity.fileRevision) || (identity.fileRevision as number) < 0
      || identity.checksumAlgorithm !== null && (typeof identity.checksumAlgorithm !== "string"
        || !/^[a-z0-9._-]{1,32}$/u.test(identity.checksumAlgorithm))
      || identity.checksum !== null && (typeof identity.checksum !== "string"
        || !/^[A-Za-z0-9+/=_-]{1,256}$/u.test(identity.checksum))
      || (identity.checksumAlgorithm === null) !== (identity.checksum === null)) throw new CatalogExportError("invalid_request");
  }
  if (typeof input.sourceManifestSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.sourceManifestSha256)
    || sha256(canonicalCatalogJson(manifest)) !== input.sourceManifestSha256) throw new CatalogExportError("identity_mismatch");
  const access = object(input.sourceAccess);
  exactKeys(access, ["coreBaseUrl", "capabilityToken", "expiresAt"]);
  const coreBaseUrl = safeUrl(access.coreBaseUrl);
  if (typeof access.capabilityToken !== "string" || access.capabilityToken.length < 32 || access.capabilityToken.length > 512
    || typeof access.expiresAt !== "string" || !Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= Date.now()) {
    throw new CatalogExportError("invalid_request");
  }
  return {
    schemaVersion: CATALOG_EXPORT_REQUEST_SCHEMA_VERSION,
    manifest: manifest as unknown as CatalogBatchManifest,
    sourceManifestSha256: input.sourceManifestSha256,
    sourceAccess: { coreBaseUrl, capabilityToken: access.capabilityToken, expiresAt: access.expiresAt },
  };
}

interface SourceAuthorization {
  method: "GET";
  url: string;
  expiresAt: string;
  sizeBytes: number;
  mediaType: "application/pdf";
}

function parseSourceAuthorization(value: unknown, expectedSize: number): SourceAuthorization {
  const input = object(value);
  exactKeys(input, ["method", "url", "expiresAt", "sizeBytes", "mediaType"]);
  if (input.method !== "GET" || input.mediaType !== "application/pdf" || input.sizeBytes !== expectedSize
    || typeof input.url !== "string" || input.url.length > 8_192 || /[\u0000\r\n]/u.test(input.url)
    || typeof input.expiresAt !== "string" || !Number.isFinite(Date.parse(input.expiresAt))) throw new CatalogExportError("source_unavailable");
  const url = new URL(input.url);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
    throw new CatalogExportError("source_unavailable");
  }
  return input as unknown as SourceAuthorization;
}

class CatalogHttpRangeSource implements PdfRangeSource {
  readonly length: number;
  readonly #request: CatalogExportRequest;
  readonly #resourceId: string;
  #authorization: SourceAuthorization | undefined;

  constructor(request: CatalogExportRequest, resourceId: string, length: number) {
    this.#request = request;
    this.#resourceId = resourceId;
    this.length = length;
  }

  async read(begin: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > this.length
      || end - begin > 2 * 1024 * 1024) throw new CatalogExportError("limit_exceeded");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const authorization = await this.#sourceAuthorization(attempt === 1, signal);
      let response: Response;
      try {
        response = await fetch(authorization.url, {
          headers: { range: `bytes=${begin}-${end - 1}` },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(RANGE_TIMEOUT_MILLISECONDS)]) : AbortSignal.timeout(RANGE_TIMEOUT_MILLISECONDS),
        });
      } catch {
        if (signal?.aborted) throw new CatalogExportError("source_unavailable");
        this.#authorization = undefined;
        if (attempt === 0) continue;
        throw new CatalogExportError("source_unavailable");
      }
      if ([401, 403].includes(response.status) && attempt === 0) {
        this.#authorization = undefined;
        continue;
      }
      if (response.status !== 206) throw new CatalogExportError("source_unavailable");
      const contentRange = response.headers.get("content-range");
      if (contentRange !== `bytes ${begin}-${end - 1}/${this.length}`) throw new CatalogExportError("source_unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== end - begin) throw new CatalogExportError("source_unavailable");
      return bytes;
    }
    throw new CatalogExportError("source_unavailable");
  }

  async #sourceAuthorization(force: boolean, signal?: AbortSignal): Promise<SourceAuthorization> {
    if (!force && this.#authorization && Date.parse(this.#authorization.expiresAt) - Date.now() > SOURCE_RENEWAL_MARGIN_MILLISECONDS) {
      return this.#authorization;
    }
    const endpoint = `${this.#request.sourceAccess.coreBaseUrl}/api/catalog-batches/${encodeURIComponent(this.#request.manifest.batchId)}/resources/${encodeURIComponent(this.#resourceId)}/source`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${this.#request.sourceAccess.capabilityToken}` },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      });
    } catch {
      throw new CatalogExportError("source_unavailable");
    }
    if (!response.ok) throw new CatalogExportError("source_unavailable");
    const body = object(await response.json());
    exactKeys(body, ["source"]);
    this.#authorization = parseSourceAuthorization(body.source, this.length);
    return this.#authorization;
  }
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntries(entries: ReadonlyArray<{ path: string; bytes: Uint8Array }>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let uncompressedTotal = 0;
  for (const entry of entries) {
    if (!/^(?:manifest\.json|review-contract\.json|resources\/[A-Za-z0-9_-]{1,128}\.json)$/u.test(entry.path)) throw new CatalogExportError("invalid_request");
    uncompressedTotal += entry.bytes.byteLength;
    if (uncompressedTotal > MAX_ZIP_UNCOMPRESSED_BYTES) throw new CatalogExportError("limit_exceeded");
    const path = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.bytes, { level: 9 });
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.byteLength, 18); local.writeUInt32LE(entry.bytes.byteLength, 22); local.writeUInt16LE(path.byteLength, 26);
    localParts.push(local, path, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.byteLength, 20); central.writeUInt32LE(entry.bytes.byteLength, 24); central.writeUInt16LE(path.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, path);
    offset += local.byteLength + path.byteLength + compressed.byteLength;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.byteLength, 12); end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...localParts, central, end]);
  if (result.byteLength > MAX_ZIP_BYTES) throw new CatalogExportError("limit_exceeded");
  return result;
}

export async function createCatalogEvidencePackage(options: {
  request: CatalogExportRequest;
  inspector: BoundedPdfTextSource;
  signal?: AbortSignal;
}): Promise<{ filename: string; bytes: Uint8Array; manifest: CatalogBatchManifest; evidence: CatalogResourceEvidence[] }> {
  const evidence: CatalogResourceEvidence[] = [];
  try {
    for (const resource of options.request.manifest.resources) {
      if (!options.inspector.inspectRange) throw new CatalogExportError("inspection_failed");
      const inspection = await options.inspector.inspectRange(
        new CatalogHttpRangeSource(options.request, resource.resourceId, resource.sizeBytes),
        SUGGESTION_LIMITS,
        options.signal,
      );
      evidence.push({
        schemaVersion: "academiccloud.catalog-evidence.v1",
        resourceId: resource.resourceId,
        sourceIdentity: resource.sourceIdentity,
        currentFilename: resource.currentFilename,
        pageCount: inspection.pageCount,
        embeddedMetadata: { ...inspection.embeddedMetadata },
        pages: inspection.pages.map((page) => ({
          pageIndex: page.pageIndex,
          pageClass: classifySuggestionPage(page),
          evidenceOrigin: page.evidenceOrigin === "ocr" ? "ocr" : "native_text",
          ocrConfidence: page.evidenceOrigin === "ocr" ? page.ocrConfidence ?? null : null,
          text: page.text,
        })),
        complete: inspection.complete,
      });
    }
  } catch (error: unknown) {
    if (error instanceof CatalogExportError) throw error;
    throw new CatalogExportError("inspection_failed");
  }
  const pageCounts = new Map(evidence.map((entry) => [entry.resourceId, entry.pageCount]));
  const manifest: CatalogBatchManifest = {
    ...options.request.manifest,
    resources: options.request.manifest.resources.map((resource) => ({ ...resource, pageCount: pageCounts.get(resource.resourceId)! })),
  };
  const encoder = new TextEncoder();
  const entries = [
    { path: "manifest.json", bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    {
      path: "review-contract.json",
      bytes: encoder.encode(`${JSON.stringify({
        schemaVersion: "academiccloud.catalog-review-contract.v1",
        resultsSchemaVersion: "academiccloud.catalog-results.v1",
        sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
      }, null, 2)}\n`),
    },
    ...evidence.map((entry) => ({
      path: `resources/${entry.resourceId}.json`,
      bytes: encoder.encode(`${JSON.stringify(entry, null, 2)}\n`),
    })),
  ];
  return {
    filename: `academiccloud-catalog-batch-${manifest.batchId}.zip`,
    bytes: zipEntries(entries),
    manifest,
    evidence,
  };
}

async function main(): Promise<void> {
  const requestIndex = process.argv.indexOf("--request");
  const outputIndex = process.argv.indexOf("--output");
  if (requestIndex < 0 || outputIndex < 0 || !process.argv[requestIndex + 1] || !process.argv[outputIndex + 1]) {
    throw new CatalogExportError("invalid_request");
  }
  const requestBytes = await readFile(resolve(process.argv[requestIndex + 1]!));
  if (requestBytes.byteLength > MAX_REQUEST_BYTES) throw new CatalogExportError("limit_exceeded");
  const request = parseCatalogExportRequest(JSON.parse(requestBytes.toString("utf8")) as unknown);
  const inspector = new PdfJsFrontMatterInspector(new PaddleOcrSidecarAdapter());
  try {
    const result = await createCatalogEvidencePackage({ request, inspector });
    const output = resolve(process.argv[outputIndex + 1]!);
    if (!output.toLowerCase().endsWith(".zip")) throw new CatalogExportError("invalid_request");
    await writeFile(output, result.bytes, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: "created", filename: result.filename, output, resources: result.evidence.length, sourceManifestSha256: sha256(canonicalCatalogJson(result.manifest)) })}\n`);
  } finally {
    await inspector.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    const code = error instanceof CatalogExportError ? error.code : "inspection_failed";
    process.stderr.write(`${JSON.stringify({ status: "failed", code })}\n`);
    process.exitCode = 1;
  });
}
