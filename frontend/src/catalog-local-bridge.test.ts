import { describe, expect, it, vi } from "vitest";

import type { CatalogExportRequest } from "./api.ts";
import {
  exportCatalogEvidenceLocally,
  LOCAL_CATALOG_BRIDGE_URL,
  LocalCatalogBridgeError,
} from "./catalog-local-bridge.ts";

const REQUEST = {
  schemaVersion: "academiccloud.catalog-export-request.v1",
  manifest: { batchId: "batch-1", resources: [{ resourceId: "resource-1" }] },
  sourceManifestSha256: "a".repeat(64),
  sourceAccess: { coreBaseUrl: "https://cloud.ajtlab.top", capabilityToken: "private", expiresAt: "2026-09-03T00:00:00.000Z" },
} as unknown as CatalogExportRequest;

describe("local catalog bridge client", () => {
  it("posts the private request to loopback and accepts only a bounded ZIP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": "4",
        "X-AcademicCloud-Filename": "academiccloud-catalog-batch-batch-1.zip",
      },
    }));

    const result = await exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(LOCAL_CATALOG_BRIDGE_URL, expect.objectContaining({
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "X-AcademicCloud-Catalog-Bridge": "1",
      },
      body: JSON.stringify(REQUEST),
    }));
    expect(result.filename).toBe("academiccloud-catalog-batch-batch-1.zip");
    expect(result.blob.size).toBe(4);
  });

  it("classifies a network or local-permission failure as unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({
      name: "LocalCatalogBridgeError",
      code: "unavailable",
    } satisfies Partial<LocalCatalogBridgeError>);
  });

  it.each([409, 503])("classifies bridge concurrency as busy for HTTP %s with a valid error body", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "failed", code: "busy" }), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({ code: "busy" });
  });

  it.each([
    [503, "malformed JSON", "busy"],
    [503, "missing failure status", JSON.stringify({ code: "busy" })],
    [503, "different failure status", JSON.stringify({ status: "exporting", code: "busy" })],
    [503, "array body", JSON.stringify([{ status: "failed", code: "busy" }])],
    [503, "unrelated failure code", JSON.stringify({ status: "failed", code: "service_unavailable" })],
    [503, "oversized error body", JSON.stringify({ status: "failed", code: "busy", detail: "x".repeat(4096) })],
    [400, "unexpected HTTP status", JSON.stringify({ status: "failed", code: "busy" })],
  ] as const)("keeps HTTP %s with %s rejected", async (status, _description, body) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({ code: "rejected" });
  });

  it("rejects an unexpected filename or content type", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "3",
        "X-AcademicCloud-Filename": "request.json",
      },
    }));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects an oversized declared ZIP before consuming its body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(128 * 1024 * 1024 + 1),
        "X-AcademicCloud-Filename": "academiccloud-catalog-batch-batch-1.zip",
      },
    }));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({ code: "invalid_response" });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it("rejects a declared ZIP length that does not match the bounded body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": "4",
        "X-AcademicCloud-Filename": "academiccloud-catalog-batch-batch-1.zip",
      },
    }));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("passes cancellation to fetch and reports an aborted local handoff as cancelled", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      expect(signal).toBe(controller.signal);
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch, controller.signal);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});
