import type { CatalogExportRequest } from "./api.ts";
import type { Language } from "./i18n.ts";

export const LOCAL_CATALOG_BRIDGE_URL = "http://127.0.0.1:43117/v1/catalog/export";
export const LOCAL_CATALOG_STATUS_URL = "http://127.0.0.1:43117/v1/catalog/status";
const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
const MAX_ERROR_BYTES = 4 * 1024;
const SAFE_FILENAME = /^academiccloud-catalog-batch-[A-Za-z0-9_-]{1,128}\.zip$/u;
const SERVER_FAILURE_CODES = [
  "invalid_request",
  "source_unavailable",
  "identity_mismatch",
  "limit_exceeded",
  "inspection_failed",
] as const;

type ServerFailureCode = (typeof SERVER_FAILURE_CODES)[number];
export type LocalCatalogBridgeErrorCode =
  | "unavailable"
  | "busy"
  | ServerFailureCode
  | "rejected"
  | "invalid_response"
  | "cancelled";

export interface LocalCatalogProgress {
  completedResources: number;
  totalResources: number;
  failedResources: number;
}

export class LocalCatalogBridgeError extends Error {
  constructor(readonly code: LocalCatalogBridgeErrorCode) {
    super(code);
    this.name = "LocalCatalogBridgeError";
  }
}

export interface LocalCatalogPackage {
  filename: string;
  blob: Blob;
  failedResources: number;
}

interface BridgeFailure {
  status?: unknown;
  code?: unknown;
}

function bridgeFailureCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as BridgeFailure;
  return body.status === "failed" && typeof body.code === "string" ? body.code : null;
}

function isServerFailureCode(value: string | null): value is ServerFailureCode {
  return value !== null && (SERVER_FAILURE_CODES as readonly string[]).includes(value);
}

async function readBoundedBody(response: Response, maximumBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!response.body) throw new LocalCatalogBridgeError("invalid_response");
  if (signal?.aborted) throw new LocalCatalogBridgeError("cancelled");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        if (signal?.aborted) throw new LocalCatalogBridgeError("cancelled");
        throw new LocalCatalogBridgeError("invalid_response");
      }
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new LocalCatalogBridgeError("invalid_response");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < 1) throw new LocalCatalogBridgeError("invalid_response");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function failureCode(response: Response, signal?: AbortSignal): Promise<string | null> {
  try {
    const bytes = await readBoundedBody(response, MAX_ERROR_BYTES, signal);
    return bridgeFailureCode(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch (error: unknown) {
    if (error instanceof LocalCatalogBridgeError && error.code === "cancelled") throw error;
    return null;
  }
}

function parseProgress(value: unknown): LocalCatalogProgress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.status !== "exporting"
    || !Number.isSafeInteger(body.completedResources)
    || !Number.isSafeInteger(body.totalResources)
    || !Number.isSafeInteger(body.failedResources)) return null;
  const completedResources = body.completedResources as number;
  const totalResources = body.totalResources as number;
  const failedResources = body.failedResources as number;
  if (totalResources < 1 || completedResources < 0 || completedResources > totalResources
    || failedResources < 0 || failedResources > completedResources) return null;
  return { completedResources, totalResources, failedResources };
}

async function pollProgress(
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  shouldContinue: () => boolean,
  onProgress: (progress: LocalCatalogProgress) => void,
): Promise<void> {
  while (shouldContinue() && !signal?.aborted) {
    await new Promise<void>((resolve) => setTimeout(resolve, 750));
    if (!shouldContinue() || signal?.aborted) break;
    try {
      const response = await fetchImpl(LOCAL_CATALOG_STATUS_URL, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) continue;
      const bytes = await readBoundedBody(response, MAX_ERROR_BYTES, signal);
      const progress = parseProgress(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
      if (progress) onProgress(progress);
    } catch {
      if (signal?.aborted) break;
      // Progress is advisory. The export response remains authoritative.
    }
  }
}

export async function exportCatalogEvidenceLocally(
  request: CatalogExportRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  onProgress?: (progress: LocalCatalogProgress) => void,
): Promise<LocalCatalogPackage> {
  if (signal?.aborted) throw new LocalCatalogBridgeError("cancelled");
  onProgress?.({ completedResources: 0, totalResources: request.manifest.resources.length, failedResources: 0 });

  let polling = onProgress !== undefined;
  const progressController = new AbortController();
  const stopProgress = () => progressController.abort();
  signal?.addEventListener("abort", stopProgress, { once: true });
  if (onProgress) {
    void pollProgress(fetchImpl, progressController.signal, () => polling, onProgress);
  }

  let response: Response;
  try {
    response = await fetchImpl(LOCAL_CATALOG_BRIDGE_URL, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        "Content-Type": "application/json",
        "X-AcademicCloud-Catalog-Bridge": "1",
      },
      body: JSON.stringify(request),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    if (signal?.aborted) throw new LocalCatalogBridgeError("cancelled");
    throw new LocalCatalogBridgeError("unavailable");
  } finally {
    polling = false;
    signal?.removeEventListener("abort", stopProgress);
    progressController.abort();
  }

  if (!response.ok) {
    const code = await failureCode(response, signal);
    if ((response.status === 409 || response.status === 503) && code === "busy") throw new LocalCatalogBridgeError("busy");
    if (isServerFailureCode(code)) throw new LocalCatalogBridgeError(code);
    throw new LocalCatalogBridgeError("rejected");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const filename = response.headers.get("x-academiccloud-filename") ?? "";
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? null : Number(contentLength);
  const failedHeader = response.headers.get("x-academiccloud-failed-resources");
  const failedResources = failedHeader === null ? 0 : Number(failedHeader);
  if (!contentType.startsWith("application/zip") || !SAFE_FILENAME.test(filename)
    || (declaredLength !== null && (!Number.isFinite(declaredLength) || declaredLength < 1 || declaredLength > MAX_PACKAGE_BYTES))
    || !Number.isSafeInteger(failedResources) || failedResources < 0 || failedResources > request.manifest.resources.length) {
    response.body?.cancel().catch(() => undefined);
    throw new LocalCatalogBridgeError("invalid_response");
  }

  const bytes = await readBoundedBody(response, MAX_PACKAGE_BYTES, signal);
  if (declaredLength !== null && bytes.byteLength !== declaredLength) throw new LocalCatalogBridgeError("invalid_response");
  const payload = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(payload).set(bytes);
  return { filename, blob: new Blob([payload], { type: "application/zip" }), failedResources };
}

const TEXT = {
  en: {
    generate: "Generate evidence package",
    ready: "Evidence package downloaded ({count})",
    unavailable: "Cannot reach Local Compute. Allow local network access if prompted, then retry.",
    busy: "Local Compute is busy. Retry after the current task finishes.",
    invalid_request: "The local export request is no longer valid. Refresh the batch and retry.",
    source_unavailable: "One or more source files could not be authorized or read. Retry after checking connectivity.",
    identity_mismatch: "A source file changed during export. Refresh the batch before retrying.",
    limit_exceeded: "The export exceeded a safety limit. Reduce the batch size and retry.",
    inspection_failed: "Local PDF/OCR inspection failed; the evidence package could not be completed.",
    invalid_response: "Local Compute returned an invalid or oversized response.",
    rejected: "Local Compute rejected the export request.",
    failed: "Local evidence export failed.",
  },
  "zh-CN": {
    generate: "生成证据包",
    ready: "证据包已下载（{count} 项）",
    unavailable: "无法连接本机 Local Compute。若浏览器询问本地网络权限，请允许后重试。",
    busy: "本机 Local Compute 正在处理另一批任务，请稍后重试。",
    invalid_request: "本地导出请求已失效，请刷新批次后重试。",
    source_unavailable: "一个或多个源文件暂时无法授权或读取，请检查网络后重试。",
    identity_mismatch: "导出期间源文件身份发生变化，请刷新批次后重试。",
    limit_exceeded: "本次导出超过安全限制，请缩小批次后重试。",
    inspection_failed: "本地 PDF/OCR 检查失败，证据包未完成。",
    invalid_response: "Local Compute 返回了无效或过大的响应。",
    rejected: "Local Compute 拒绝了本次导出请求。",
    failed: "本地证据导出失败。",
  },
} as const;

export type LocalCatalogTextKey = keyof typeof TEXT.en;

export function localCatalogText(language: Language, key: LocalCatalogTextKey, count?: number): string {
  const template = TEXT[language][key];
  return count === undefined ? template : template.replace("{count}", String(count));
}

export function localCatalogProgressText(language: Language, progress: LocalCatalogProgress): string {
  return language === "zh-CN"
    ? `正在处理 ${progress.completedResources}/${progress.totalResources} · 失败 ${progress.failedResources}`
    : `Processing ${progress.completedResources}/${progress.totalResources} · failed ${progress.failedResources}`;
}

export function localCatalogReadyText(language: Language, totalResources: number, failedResources: number): string {
  if (failedResources === 0) return localCatalogText(language, "ready", totalResources);
  return language === "zh-CN"
    ? `证据包已下载（${totalResources} 项；${failedResources} 项检查失败，需核对）`
    : `Evidence package downloaded (${totalResources} items; ${failedResources} inspection failures need review)`;
}

export function localCatalogErrorText(language: Language, code: LocalCatalogBridgeErrorCode): string {
  if (code === "cancelled") return "";
  return localCatalogText(language, code === "unavailable" || code === "busy" || code === "invalid_request"
    || code === "source_unavailable" || code === "identity_mismatch" || code === "limit_exceeded"
    || code === "inspection_failed" || code === "invalid_response" || code === "rejected" ? code : "failed");
}
