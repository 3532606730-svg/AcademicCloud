import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type { CatalogExportRequest } from "@academiccloud/compute-contracts";

import {
  CatalogExportError,
  catalogEndpointPolicyFromEnvironment,
  parseCatalogExportRequest,
  type CatalogEndpointPolicy,
} from "./catalog-batch-export.js";
import {
  createResilientCatalogEvidencePackage,
  type CatalogResilientProgress,
} from "./catalog-batch-resilient-export.js";
import { PaddleOcrSidecarAdapter } from "./paddle-ocr.js";
import { PdfJsFrontMatterInspector } from "./pdf-text.js";
import { loadNativeResourceGuard, registerNativeCooperation, type NativeResourceGuard, type NativeResourceLease } from "./native-resource.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 43_117;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 128 * 1024 * 1024;
const BRIDGE_HEADER = "x-academiccloud-catalog-bridge";
const BRIDGE_HEADER_VALUE = "1";
const DEFAULT_ALLOWED_ORIGINS = ["https://cloud.ajtlab.top"] as const;
const DEFAULT_CATALOG_SOURCE_ORIGINS = [
  "https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com",
  "https://files.ajtlab.top",
] as const;
const SAFE_FILENAME = /^academiccloud-catalog-batch-[A-Za-z0-9_-]{1,128}\.zip$/u;

export type CatalogBridgeFailureCode =
  | "invalid_request"
  | "source_unavailable"
  | "identity_mismatch"
  | "limit_exceeded"
  | "inspection_failed"
  | "busy";

export interface CatalogBridgePackage {
  filename: string;
  bytes: Uint8Array;
  failedResources?: number;
}

export type CatalogBridgePackageFactory = (
  request: CatalogExportRequest,
  signal: AbortSignal,
  onProgress: (progress: CatalogResilientProgress) => void,
) => Promise<CatalogBridgePackage>;

export interface CatalogBridgeOptions {
  allowedOrigins?: readonly string[];
  endpointPolicy?: CatalogEndpointPolicy;
  packageFactory?: CatalogBridgePackageFactory;
  nativeResourceGuard?: NativeResourceGuard;
}

interface CatalogBridgeStatus extends CatalogResilientProgress {
  status: "idle" | "exporting";
}

function configuredOrigins(value: string | undefined): string[] {
  const raw = value?.trim();
  const values = raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [...DEFAULT_ALLOWED_ORIGINS];
  if (values.length < 1 || values.length > 16) throw new TypeError("ACADEMICCLOUD_CATALOG_BRIDGE_ORIGINS is invalid");
  return values.map((value) => {
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new TypeError("ACADEMICCLOUD_CATALOG_BRIDGE_ORIGINS is invalid"); }
    const localDevelopment = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !localDevelopment) || parsed.origin !== value || parsed.username || parsed.password) {
      throw new TypeError("ACADEMICCLOUD_CATALOG_BRIDGE_ORIGINS is invalid");
    }
    return parsed.origin;
  });
}

function configuredPort(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new TypeError("ACADEMICCLOUD_CATALOG_BRIDGE_PORT is invalid");
  }
  return port;
}

function setNoStore(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function setCors(response: ServerResponse, origin: string): void {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-AcademicCloud-Catalog-Bridge");
  response.setHeader("Access-Control-Expose-Headers", "X-AcademicCloud-Filename, X-AcademicCloud-Failed-Resources");
  response.setHeader("Vary", "Origin");
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown, origin?: string): void {
  if (origin) setCors(response, origin);
  setNoStore(response);
  const bytes = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", String(bytes.byteLength));
  response.end(bytes);
}

function sendFailure(response: ServerResponse, statusCode: number, code: CatalogBridgeFailureCode, origin?: string): void {
  sendJson(response, statusCode, { status: "failed", code }, origin);
}

function allowedOrigin(request: IncomingMessage, allowedOrigins: ReadonlySet<string>): string | null {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !allowedOrigins.has(origin)) return null;
  return origin;
}

function isJsonContentType(value: string | string[] | undefined): boolean {
  if (typeof value !== "string") return false;
  return value.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) throw new CatalogExportError("limit_exceeded");
    chunks.push(buffer);
  }
  if (bytes < 2) throw new CatalogExportError("invalid_request");
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as unknown;
  } catch {
    throw new CatalogExportError("invalid_request");
  }
}

async function defaultPackageFactory(
  request: CatalogExportRequest,
  signal: AbortSignal,
  endpointPolicy: CatalogEndpointPolicy,
  onProgress: (progress: CatalogResilientProgress) => void,
): Promise<CatalogBridgePackage> {
  const result = await createResilientCatalogEvidencePackage({
    request,
    createInspector: () => new PdfJsFrontMatterInspector(new PaddleOcrSidecarAdapter()),
    endpointPolicy,
    signal,
    onProgress,
  });
  return { filename: result.filename, bytes: result.bytes, failedResources: result.failedResources.length };
}

function statusForError(error: CatalogExportError): number {
  switch (error.code) {
    case "invalid_request": return 400;
    case "identity_mismatch": return 409;
    case "limit_exceeded": return 413;
    case "source_unavailable": return 502;
    case "inspection_failed": return 500;
  }
}

export function createCatalogBridgeServer(options: CatalogBridgeOptions = {}): Server {
  const origins = options.allowedOrigins ?? configuredOrigins(process.env.ACADEMICCLOUD_CATALOG_BRIDGE_ORIGINS);
  const allowedOrigins = new Set(origins);
  if (allowedOrigins.size !== origins.length || origins.length < 1) throw new TypeError("catalog bridge origins are invalid");
  for (const origin of origins) configuredOrigins(origin);
  const configuredSourceOrigins = process.env.ACADEMICCLOUD_CATALOG_SOURCE_ORIGINS?.trim();
  const endpointPolicy = options.endpointPolicy ?? catalogEndpointPolicyFromEnvironment({
    ...process.env,
    ACADEMICCLOUD_CATALOG_SOURCE_ORIGINS: configuredSourceOrigins || DEFAULT_CATALOG_SOURCE_ORIGINS.join(","),
  });
  const packageFactory = options.packageFactory
    ?? ((request: CatalogExportRequest, signal: AbortSignal, onProgress: (progress: CatalogResilientProgress) => void) =>
      defaultPackageFactory(request, signal, endpointPolicy, onProgress));
  let exportActive = false;
  let progress: CatalogBridgeStatus = {
    status: "idle",
    completedResources: 0,
    totalResources: 0,
    failedResources: 0,
  };

  return createServer((request, response) => {
    void (async () => {
      const origin = allowedOrigin(request, allowedOrigins);

      if (request.method === "GET" && request.url === "/health") {
        if (request.headers.origin && !origin) {
          sendFailure(response, 403, "invalid_request");
          return;
        }
        sendJson(response, 200, { status: "ok", service: "academiccloud-catalog-bridge", version: 1 }, origin ?? undefined);
        return;
      }

      if (request.method === "GET" && request.url === "/v1/catalog/status") {
        if (!origin) {
          sendFailure(response, 403, "invalid_request");
          return;
        }
        sendJson(response, 200, progress, origin);
        return;
      }

      if (request.method === "OPTIONS"
        && (request.url === "/v1/catalog/export" || request.url === "/v1/catalog/status")) {
        if (!origin) {
          sendFailure(response, 403, "invalid_request");
          return;
        }
        setCors(response, origin);
        setNoStore(response);
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method !== "POST" || request.url !== "/v1/catalog/export") {
        sendFailure(response, 404, "invalid_request", origin ?? undefined);
        return;
      }
      if (!origin) {
        sendFailure(response, 403, "invalid_request");
        return;
      }
      if (request.headers[BRIDGE_HEADER] !== BRIDGE_HEADER_VALUE || !isJsonContentType(request.headers["content-type"])) {
        sendFailure(response, 400, "invalid_request", origin);
        return;
      }
      if (exportActive) {
        sendFailure(response, 409, "busy", origin);
        return;
      }

      exportActive = true;
      const abortController = new AbortController();
      const abort = (): void => abortController.abort();
      const abortOnResponseClose = (): void => {
        if (!response.writableEnded) abort();
      };
      request.once("aborted", abort);
      response.once("close", abortOnResponseClose);
      let nativeLease: NativeResourceLease | undefined;
      try {
        const parsed = parseCatalogExportRequest(await readJsonBody(request), endpointPolicy);
        const guard = options.nativeResourceGuard ?? await loadNativeResourceGuard();
        if (guard) {
          const acquired = await guard.acquire(abortController.signal);
          if (!acquired) { sendFailure(response, 503, "busy", origin); return; }
          nativeLease = acquired;
          acquired.signal.addEventListener("abort", abort, { once: true });
          if (acquired.signal.aborted) abort();
        }
        progress = {
          status: "exporting",
          completedResources: 0,
          totalResources: parsed.manifest.resources.length,
          failedResources: 0,
        };
        const result = await packageFactory(parsed, abortController.signal, (next) => {
          if (next.completedResources < 0 || next.completedResources > next.totalResources
            || next.failedResources < 0 || next.failedResources > next.completedResources
            || next.totalResources !== parsed.manifest.resources.length) return;
          progress = { status: "exporting", ...next };
        });
        if (!SAFE_FILENAME.test(result.filename) || result.bytes.byteLength < 1 || result.bytes.byteLength > MAX_RESPONSE_BYTES) {
          throw new CatalogExportError("limit_exceeded");
        }
        const failedResources = result.failedResources ?? 0;
        if (!Number.isSafeInteger(failedResources) || failedResources < 0 || failedResources > parsed.manifest.resources.length) {
          throw new CatalogExportError("inspection_failed");
        }
        const bytes = Buffer.from(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength);
        setCors(response, origin);
        setNoStore(response);
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/zip");
        response.setHeader("Content-Length", String(bytes.byteLength));
        response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
        response.setHeader("X-AcademicCloud-Filename", result.filename);
        response.setHeader("X-AcademicCloud-Failed-Resources", String(failedResources));
        response.end(bytes);
      } catch (error: unknown) {
        if (response.destroyed) {
          return;
        }
        if (response.headersSent) {
          response.destroy();
        } else if (error instanceof CatalogExportError) {
          sendFailure(response, statusForError(error), error.code, origin);
        } else {
          sendFailure(response, 500, "inspection_failed", origin);
        }
      } finally {
        if (nativeLease) { nativeLease.signal.removeEventListener("abort", abort); await nativeLease.release(); }
        request.removeListener("aborted", abort);
        response.removeListener("close", abortOnResponseClose);
        exportActive = false;
        progress = { status: "idle", completedResources: 0, totalResources: 0, failedResources: 0 };
      }
    })();
  });
}

export async function startCatalogBridge(options: CatalogBridgeOptions & { port?: number } = {}): Promise<Server> {
  const port = options.port ?? configuredPort(process.env.ACADEMICCLOUD_CATALOG_BRIDGE_PORT);
  const server = createCatalogBridgeServer(options);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, DEFAULT_HOST, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
  return server;
}

export function isCatalogBridgeEntrypoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (!argvEntry) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvEntry);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const unregister = await registerNativeCooperation("catalogBridge");
  const server = await startCatalogBridge();
  server.once("close", () => { void unregister(); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : configuredPort(process.env.ACADEMICCLOUD_CATALOG_BRIDGE_PORT);
  process.stdout.write(`${JSON.stringify({ status: "listening", host: DEFAULT_HOST, port })}\n`);

  const stop = (): void => {
    server.close((error) => {
      if (error) process.exitCode = 1;
    });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

if (isCatalogBridgeEntrypoint(import.meta.url, process.argv[1])) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ status: "failed", code: "inspection_failed" })}\n`);
    process.exitCode = 1;
  });
}
