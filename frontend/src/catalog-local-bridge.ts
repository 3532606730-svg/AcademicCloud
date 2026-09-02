import type { CatalogExportRequest } from "./api.ts";
import type { Language } from "./i18n.ts";

export const LOCAL_CATALOG_BRIDGE_URL = "http://127.0.0.1:43117/v1/catalog/export";
const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
const MAX_ERROR_BYTES = 4 * 1024;
const SAFE_FILENAME = /^academiccloud-catalog-batch-[A-Za-z0-9_-]{1,128}\.zip$/u;

export type LocalCatalogBridgeErrorCode = "unavailable" | "busy" | "rejected" | "invalid_response" | "cancelled";

export class LocalCatalogBridgeError extends Error {
  constructor(readonly code: LocalCatalogBridgeErrorCode) {
    super(code);
    this.name = "LocalCatalogBridgeError";
  }
}

export interface LocalCatalogPackage {
  filename: string;
  blob: Blob;
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

export async function exportCatalogEvidenceLocally(
  request: CatalogExportRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<LocalCatalogPackage> {
  if (signal?.aborted) throw new LocalCatalogBridgeError("cancelled");
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
  }

  if (!response.ok) {
    const code = await failureCode(response, signal);
    if (response.status === 409 && code === "busy") throw new LocalCatalogBridgeError("busy");
    throw new LocalCatalogBridgeError("rejected");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const filename = response.headers.get("x-academiccloud-filename") ?? "";
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? null : Number(contentLength);
  if (!contentType.startsWith("application/zip") || !SAFE_FILENAME.test(filename)
    || (declaredLength !== null && (!Number.isFinite(declaredLength) || declaredLength < 1 || declaredLength > MAX_PACKAGE_BYTES))) {
    response.body?.cancel().catch(() => undefined);
    throw new LocalCatalogBridgeError("invalid_response");
  }

  const bytes = await readBoundedBody(response, MAX_PACKAGE_BYTES, signal);
  if (declaredLength !== null && bytes.byteLength !== declaredLength) throw new LocalCatalogBridgeError("invalid_response");
  return { filename, blob: new Blob([bytes], { type: "application/zip" }) };
}

const TEXT = {
  en: {
    generate: "Generate evidence package",
    ready: "Evidence package downloaded ({count})",
    unavailable: "Cannot reach Local Compute. Allow local network access if prompted, then retry.",
    busy: "Local Compute is busy. Retry after the current export finishes.",
    failed: "Local evidence export failed.",
  },
  "zh-CN": {
    generate: "生成证据包",
    ready: "证据包已下载（{count} 项）",
    unavailable: "无法连接本机 Local Compute。若浏览器询问本地网络权限，请允许后重试。",
    busy: "本机 Local Compute 正在处理另一批任务，请稍后重试。",
    failed: "本地证据导出失败。",
  },
} as const;

export type LocalCatalogTextKey = keyof typeof TEXT.en;

export function localCatalogText(language: Language, key: LocalCatalogTextKey, count?: number): string {
  const template = TEXT[language][key];
  return count === undefined ? template : template.replace("{count}", String(count));
}
