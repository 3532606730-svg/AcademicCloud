import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import { canonicalCatalogJson, type CatalogExportRequest } from "@academiccloud/compute-contracts";

import { createCatalogBridgeServer, type CatalogBridgePackageFactory } from "../src/catalog-bridge.js";

const ORIGIN = "https://cloud.ajtlab.top";

function requestDocument(): CatalogExportRequest {
  const manifest: CatalogExportRequest["manifest"] = {
    schemaVersion: "academiccloud.catalog-batch.v1",
    batchId: "batch-progress",
    createdAt: new Date(Date.now() + 60_000).toISOString(),
    namingPolicyVersion: "academiccloud.filename.v1",
    evidencePolicy: {
      firstPages: 15,
      lastPages: 5,
      maxPages: 20,
      maxCharactersPerPage: 16_384,
      maxCharactersPerResource: 262_144,
      selectiveOcr: true,
      includesSourceBytes: false,
    },
    resources: [1, 2, 3].map((index) => ({
      resourceId: `resource-${index}`,
      sourceIdentity: {
        sourceFingerprint: String.fromCharCode(96 + index).repeat(43),
        fileRevision: 1,
        checksumAlgorithm: "md5",
        checksum: "YWJjZA==",
      },
      currentFilename: `book-${index}.pdf`,
      mediaType: "application/pdf" as const,
      sizeBytes: 10 + index,
      pageCount: null,
      evidenceFile: `resources/resource-${index}.json`,
    })),
  };
  return {
    schemaVersion: "academiccloud.catalog-export-request.v1",
    manifest,
    sourceManifestSha256: createHash("sha256").update(canonicalCatalogJson(manifest), "utf8").digest("hex"),
    sourceAccess: {
      coreBaseUrl: "https://cloud.ajtlab.top",
      capabilityToken: "x".repeat(43),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

async function listen(packageFactory: CatalogBridgePackageFactory) {
  const server = createCatalogBridgeServer({ allowedOrigins: [ORIGIN], packageFactory });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: ReturnType<typeof createCatalogBridgeServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("status endpoint reports bounded progress while an export is active and returns to idle", async () => {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const factory: CatalogBridgePackageFactory = async (_request, _signal, onProgress) => {
    onProgress({ completedResources: 1, totalResources: 3, failedResources: 0 });
    entered();
    await gate;
    onProgress({ completedResources: 3, totalResources: 3, failedResources: 1 });
    return {
      filename: "academiccloud-catalog-batch-batch-progress.zip",
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      failedResources: 1,
    };
  };
  const { server, url } = await listen(factory);
  try {
    const pending = fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: JSON.stringify(requestDocument()),
    });
    await started;

    const active = await fetch(`${url}/v1/catalog/status`, { headers: { origin: ORIGIN } });
    assert.equal(active.status, 200);
    assert.deepEqual(await active.json(), {
      status: "exporting",
      completedResources: 1,
      totalResources: 3,
      failedResources: 0,
    });

    release();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-academiccloud-failed-resources"), "1");
    assert.match(response.headers.get("access-control-expose-headers") ?? "", /X-AcademicCloud-Failed-Resources/u);
    await response.arrayBuffer();

    const idle = await fetch(`${url}/v1/catalog/status`, { headers: { origin: ORIGIN } });
    assert.equal(idle.status, 200);
    assert.deepEqual(await idle.json(), {
      status: "idle",
      completedResources: 0,
      totalResources: 0,
      failedResources: 0,
    });
  } finally {
    release();
    await close(server);
  }
});

test("progress endpoint accepts the same exact-origin CORS preflight as export", async () => {
  const { server, url } = await listen(async () => ({
    filename: "academiccloud-catalog-batch-batch-progress.zip",
    bytes: new Uint8Array([1]),
  }));
  try {
    const response = await fetch(`${url}/v1/catalog/status`, {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "GET",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /GET/u);
  } finally {
    await close(server);
  }
});

test("status endpoint never exposes progress to an untrusted web origin", async () => {
  const { server, url } = await listen(async () => ({
    filename: "academiccloud-catalog-batch-batch-progress.zip",
    bytes: new Uint8Array([1]),
  }));
  try {
    const response = await fetch(`${url}/v1/catalog/status`, { headers: { origin: "https://example.invalid" } });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { status: "failed", code: "invalid_request" });
  } finally {
    await close(server);
  }
});
