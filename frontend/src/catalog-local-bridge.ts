import type { CatalogExportRequest } from "./api.ts";
import type { Language } from "./i18n.ts";

export const LOCAL_CATALOG_BRIDGE_URL = "http://127.0.0.1:43117/v1/catalog/export";
const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
const SAFE_FILENAME = /^academiccloud-catalog-batch-[A-Za-z0-9_-]{1,128}\.zip$/u;

export type LocalCatalogBridgeErrorCode = "unavailable" | "busy" | "rejected" | "invalid_response";

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

export async function exportCatalogEvidenceLocally(
  request: CatalogExportRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LocalCatalogPackage> {
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
    });
  } catch {
    throw new LocalCatalogBridgeError("unavailable");
  }

  if (!response.ok) {
    let code: string | null = null;
    try { code = bridgeFailureCode(await response.json()); } catch { /* bounded generic error below */ }
    if (response.status === 409 && code === "busy") throw new LocalCatalogBridgeError("busy");
    throw new LocalCatalogBridgeError("rejected");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const filename = response.headers.get("x-academiccloud-filename") ?? "";
  const declaredLength = Number(response.headers.get("content-length"));
  if (!contentType.startsWith("application/zip") || !SAFE_FILENAME.test(filename)
    || (Number.isFinite(declaredLength) && (declaredLength < 1 || declaredLength > MAX_PACKAGE_BYTES))) {
    throw new LocalCatalogBridgeError("invalid_response");
  }

  const blob = await response.blob();
  if (blob.size < 1 || blob.size > MAX_PACKAGE_BYTES) throw new LocalCatalogBridgeError("invalid_response");
  return { filename, blob };
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
