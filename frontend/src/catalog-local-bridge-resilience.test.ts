import { describe, expect, it, vi } from "vitest";

import type { CatalogExportRequest } from "./api.ts";
import {
  exportCatalogEvidenceLocally,
  localCatalogErrorText,
  localCatalogProgressText,
  localCatalogReadyText,
} from "./catalog-local-bridge.ts";

const REQUEST = {
  schemaVersion: "academiccloud.catalog-export-request.v1",
  manifest: {
    batchId: "batch-resilience",
    resources: [
      { resourceId: "resource-1" },
      { resourceId: "resource-2" },
      { resourceId: "resource-3" },
    ],
  },
  sourceManifestSha256: "a".repeat(64),
  sourceAccess: { coreBaseUrl: "https://cloud.ajtlab.top", capabilityToken: "private", expiresAt: "2099-01-01T00:00:00.000Z" },
} as unknown as CatalogExportRequest;

describe("resilient local catalog client", () => {
  it.each([
    [400, "invalid_request"],
    [502, "source_unavailable"],
    [409, "identity_mismatch"],
    [413, "limit_exceeded"],
    [500, "inspection_failed"],
  ] as const)("preserves bridge failure %s/%s instead of collapsing it to a generic error", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "failed", code }), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch)).rejects.toMatchObject({ code });
  });

  it("returns the partial-failure count from a successful bounded ZIP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": "4",
        "X-AcademicCloud-Filename": "academiccloud-catalog-batch-batch-resilience.zip",
        "X-AcademicCloud-Failed-Resources": "2",
      },
    }));
    const result = await exportCatalogEvidenceLocally(REQUEST, fetchImpl as typeof fetch);
    expect(result.failedResources).toBe(2);
    expect(result.blob.size).toBe(4);
  });

  it("renders actionable progress, partial-success and error text", () => {
    expect(localCatalogProgressText("zh-CN", {
      completedResources: 37,
      totalResources: 94,
      failedResources: 2,
    })).toContain("37/94");
    expect(localCatalogReadyText("zh-CN", 94, 2)).toContain("2 项检查失败");
    expect(localCatalogErrorText("zh-CN", "identity_mismatch")).toContain("身份发生变化");
    expect(localCatalogErrorText("zh-CN", "limit_exceeded")).toContain("缩小批次");
  });
});
