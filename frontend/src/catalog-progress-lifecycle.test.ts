import { describe, expect, it, vi } from "vitest";

import type { CatalogExportRequest } from "./api.ts";
import { exportCatalogEvidenceLocally } from "./catalog-local-bridge.ts";

const request = { manifest: { resources: [{ resourceId: "synthetic" }] } } as CatalogExportRequest;

describe("catalog export progress lifecycle", () => {
  it.each(["success", "failure"] as const)("settles %s without waiting for an outstanding advisory status request", async (outcome) => {
    vi.useFakeTimers();
    let finishExport!: (response: Response) => void;
    let finishStatus!: (response: Response) => void;
    let statusSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn((url: string | URL | Request, options?: RequestInit) => {
      if (String(url).endsWith("/status")) {
        statusSignal = options?.signal;
        return new Promise<Response>((resolve, reject) => {
          finishStatus = resolve;
          statusSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      return new Promise<Response>((resolve) => { finishExport = resolve; });
    });
    let settled = false;
    let resultCode = "";
    const exported = exportCatalogEvidenceLocally(request, fetchImpl as typeof fetch, undefined, () => undefined)
      .then(() => { settled = true; resultCode = "success"; }, (error: { code: string }) => { settled = true; resultCode = error.code; });
    try {
      await vi.advanceTimersByTimeAsync(750);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      finishExport(outcome === "success"
        ? new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { headers: {
          "Content-Type": "application/zip", "Content-Length": "4",
          "X-AcademicCloud-Filename": "academiccloud-catalog-batch-synthetic.zip",
        } })
        : new Response(JSON.stringify({ status: "failed", code: "source_unavailable" }), {
          status: 502, headers: { "Content-Type": "application/json" },
        }));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(true);
      expect(resultCode).toBe(outcome === "success" ? "success" : "source_unavailable");
      expect(statusSignal?.aborted).toBe(true);
    } finally {
      finishStatus(new Response(null, { status: 204 }));
      await exported;
      vi.useRealTimers();
    }
  });
});
