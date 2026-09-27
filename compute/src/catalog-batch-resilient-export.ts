import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import {
  CATALOG_EVIDENCE_SCHEMA_VERSION,
  canonicalCatalogJson,
  type CatalogBatchManifest,
  type CatalogBatchManifestResource,
  type CatalogEvidenceFailureCode,
  type CatalogExportRequest,
  type CatalogResourceEvidenceV2,
} from "@academiccloud/compute-contracts";

import {
  CatalogExportError,
  CATALOG_BATCH_STAGED_FALLBACK_MAX_BYTES,
  extractCatalogEvidence,
  type CatalogEndpointPolicy,
} from "./catalog-batch-export.js";
import type { BoundedPdfTextSource } from "./suggestion.js";

const MAX_ZIP_UNCOMPRESSED_BYTES = 160 * 1024 * 1024;
const MAX_ZIP_BYTES = 128 * 1024 * 1024;
const RESOURCE_WALL_TIMEOUT_MILLISECONDS = 360_000;
const SOURCE_RETRY_COUNT = 1;

export interface CatalogResilientProgress {
  completedResources: number;
  totalResources: number;
  failedResources: number;
}

export interface CatalogFailedResource {
  resourceId: string;
  code: CatalogEvidenceFailureCode;
}

export interface CatalogResilientPackage {
  filename: string;
  bytes: Uint8Array;
  manifest: CatalogBatchManifest;
  evidence: CatalogResourceEvidenceV2[];
  fallbackResourceIds: string[];
  failedResources: CatalogFailedResource[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function failedEvidence(
  resource: CatalogBatchManifestResource,
  code: CatalogEvidenceFailureCode,
): CatalogResourceEvidenceV2 {
  return {
    schemaVersion: CATALOG_EVIDENCE_SCHEMA_VERSION,
    resourceId: resource.resourceId,
    sourceIdentity: resource.sourceIdentity,
    currentFilename: resource.currentFilename,
    pageCount: null,
    embeddedMetadata: {},
    pages: [],
    complete: false,
    inspection: { status: "failed", failureCode: code },
  };
}

function isolatedFailureCode(error: unknown): CatalogEvidenceFailureCode | null {
  if (!(error instanceof CatalogExportError)) return "inspection_failed";
  switch (error.code) {
    case "source_unavailable": return "source_unavailable";
    case "identity_mismatch": return "identity_mismatch";
    case "limit_exceeded": return "limit_exceeded";
    case "inspection_failed": return "inspection_failed";
    case "invalid_request": return null;
  }
}

async function inspectOneResource(options: {
  request: CatalogExportRequest;
  resource: CatalogBatchManifestResource;
  inspector: BoundedPdfTextSource;
  endpointPolicy: CatalogEndpointPolicy;
  signal?: AbortSignal;
}): Promise<{
  evidence: CatalogResourceEvidenceV2;
  pageCount: number;
  fallback: boolean;
}> {
  if (options.signal?.aborted) throw new CatalogExportError("source_unavailable");

  const controller = new AbortController();
  let wallTimedOut = false;
  const timeout = setTimeout(() => {
    wallTimedOut = true;
    controller.abort();
  }, RESOURCE_WALL_TIMEOUT_MILLISECONDS);
  const abortFromParent = (): void => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    for (let attempt = 0; attempt <= SOURCE_RETRY_COUNT; attempt += 1) {
      try {
        const singleRequest: CatalogExportRequest = {
          ...options.request,
          manifest: { ...options.request.manifest, resources: [options.resource] },
        };
        const result = await extractCatalogEvidence({
          request: singleRequest,
          inspector: options.inspector,
          endpointPolicy: options.endpointPolicy,
          signal: controller.signal,
          stagedFallbackMaxBytes: CATALOG_BATCH_STAGED_FALLBACK_MAX_BYTES,
        });
        const evidence = result.evidence[0];
        const manifestResource = result.manifest.resources[0];
        if (!evidence || !manifestResource || manifestResource.pageCount === null) {
          throw new CatalogExportError("inspection_failed");
        }
        return {
          evidence: {
            schemaVersion: CATALOG_EVIDENCE_SCHEMA_VERSION,
            resourceId: evidence.resourceId,
            sourceIdentity: evidence.sourceIdentity,
            currentFilename: evidence.currentFilename,
            pageCount: evidence.pageCount,
            embeddedMetadata: evidence.embeddedMetadata,
            pages: evidence.pages,
            complete: evidence.complete,
            inspection: { status: "ready", failureCode: null },
          },
          pageCount: manifestResource.pageCount,
          fallback: result.fallbackResourceIds.includes(options.resource.resourceId),
        };
      } catch (error: unknown) {
        if (options.signal?.aborted) throw new CatalogExportError("source_unavailable");
        if (wallTimedOut) throw new CatalogExportError("inspection_failed");
        if (error instanceof CatalogExportError
          && error.code === "source_unavailable"
          && attempt < SOURCE_RETRY_COUNT) continue;
        throw error;
      }
    }
    throw new CatalogExportError("source_unavailable");
  } catch (error: unknown) {
    if (wallTimedOut && !options.signal?.aborted) {
      const timeoutError = new CatalogExportError("inspection_failed") as CatalogExportError & { catalogResourceTimeout?: true };
      timeoutError.catalogResourceTimeout = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
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
    if (!/^(?:manifest\.json|review-contract\.json|resources\/[A-Za-z0-9_-]{1,128}\.json)$/u.test(entry.path)) {
      throw new CatalogExportError("invalid_request");
    }
    uncompressedTotal += entry.bytes.byteLength;
    if (uncompressedTotal > MAX_ZIP_UNCOMPRESSED_BYTES) throw new CatalogExportError("limit_exceeded");
    const path = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.bytes, { level: 1 });
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

export async function createResilientCatalogEvidencePackage(options: {
  request: CatalogExportRequest;
  createInspector: () => BoundedPdfTextSource;
  endpointPolicy: CatalogEndpointPolicy;
  signal?: AbortSignal;
  onProgress?: (progress: CatalogResilientProgress) => void;
}): Promise<CatalogResilientPackage> {
  const evidence: CatalogResourceEvidenceV2[] = [];
  const pageCounts = new Map<string, number>();
  const fallbackResourceIds: string[] = [];
  const failedResources: CatalogFailedResource[] = [];
  const totalResources = options.request.manifest.resources.length;
  let inspector = options.createInspector();

  const reportProgress = (): void => options.onProgress?.({
    completedResources: evidence.length,
    totalResources,
    failedResources: failedResources.length,
  });
  reportProgress();

  try {
    for (const resource of options.request.manifest.resources) {
      if (options.signal?.aborted) throw new CatalogExportError("source_unavailable");
      try {
        const result = await inspectOneResource({
          request: options.request,
          resource,
          inspector,
          endpointPolicy: options.endpointPolicy,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        evidence.push(result.evidence);
        pageCounts.set(resource.resourceId, result.pageCount);
        if (result.fallback) fallbackResourceIds.push(resource.resourceId);
      } catch (error: unknown) {
        if (options.signal?.aborted) throw new CatalogExportError("source_unavailable");
        const timedOut = error instanceof CatalogExportError
          && (error as CatalogExportError & { catalogResourceTimeout?: true }).catalogResourceTimeout === true;
        const code = timedOut ? "timeout" : isolatedFailureCode(error);
        if (code === null) throw error;
        failedResources.push({ resourceId: resource.resourceId, code });
        evidence.push(failedEvidence(resource, code));
        try { await inspector.close?.(); } catch { /* Replace a possibly unhealthy parser before continuing. */ }
        inspector = options.createInspector();
      }
      reportProgress();
    }
  } finally {
    await inspector.close?.();
  }

  const manifest: CatalogBatchManifest = {
    ...options.request.manifest,
    resources: options.request.manifest.resources.map((resource) => ({
      ...resource,
      pageCount: pageCounts.get(resource.resourceId) ?? null,
    })),
  };
  const sourceManifestSha256 = sha256(canonicalCatalogJson(manifest));
  const readyResources = evidence.length - failedResources.length;
  const encoder = new TextEncoder();
  const entries = [
    { path: "manifest.json", bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    {
      path: "review-contract.json",
      bytes: encoder.encode(`${JSON.stringify({
        schemaVersion: "academiccloud.catalog-review-contract.v2",
        resultsSchemaVersion: "academiccloud.catalog-results.v1",
        evidenceSchemaVersion: CATALOG_EVIDENCE_SCHEMA_VERSION,
        sourceManifestSha256,
        summary: { totalResources, readyResources, failedResources: failedResources.length },
        failedResources,
        failurePolicy: {
          disposition: "unknown",
          bibliographic: null,
          confidence: 0,
          inferBibliographicFactsWithoutEvidence: false,
        },
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
    fallbackResourceIds,
    failedResources,
  };
}
