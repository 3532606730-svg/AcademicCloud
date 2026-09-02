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
    batchId: "batch-test",
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
    resources: [{
      resourceId: "resource-test",
      sourceIdentity: {
        sourceFingerprint: "a".repeat(43),
        fileRevision: 1,
        checksumAlgorithm: "md5",
        checksum: "YWJjZA==",
      },
      currentFilename: "test.pdf",
      mediaType: "application/pdf",
      sizeBytes: 10,
      pageCount: null,
      evidenceFile: "resources/resource-test.json",
    }],
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

test("loopback bridge answers the exact-origin CORS preflight without running an export", async () => {
  let called = false;
  const { server, url } = await listen(async () => {
    called = true;
    return { filename: "academiccloud-catalog-batch-batch-test.zip", bytes: new Uint8Array([1]) };
  });
  try {
    const response = await fetch(`${url}/v1/catalog/export`, {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-academiccloud-catalog-bridge",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /X-AcademicCloud-Catalog-Bridge/u);
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test("loopback bridge accepts only the allowed browser origin and returns the generated ZIP", async () => {
  let received: CatalogExportRequest | null = null;
  const expectedBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const packageFactory: CatalogBridgePackageFactory = async (request) => {
    received = request;
    return { filename: "academiccloud-catalog-batch-batch-test.zip", bytes: expectedBytes };
  };
  const { server, url } = await listen(packageFactory);
  try {
    const response = await fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: JSON.stringify(requestDocument()),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(response.headers.get("x-academiccloud-filename"), "academiccloud-catalog-batch-batch-test.zip");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expectedBytes);
    assert.equal(received?.manifest.batchId, "batch-test");
  } finally {
    await close(server);
  }
});

test("loopback bridge rejects untrusted origins before reading the private request", async () => {
  let called = false;
  const { server, url } = await listen(async () => {
    called = true;
    return { filename: "academiccloud-catalog-batch-batch-test.zip", bytes: new Uint8Array([1]) };
  });
  try {
    const response = await fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: {
        origin: "https://example.invalid",
        "content-type": "application/json",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test("loopback bridge requires the dedicated non-simple browser header", async () => {
  let called = false;
  const { server, url } = await listen(async () => {
    called = true;
    return { filename: "academiccloud-catalog-batch-batch-test.zip", bytes: new Uint8Array([1]) };
  });
  try {
    const response = await fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test("loopback bridge accepts application/json parameters but rejects lookalike media types", async () => {
  let called = 0;
  const { server, url } = await listen(async () => {
    called += 1;
    return { filename: "academiccloud-catalog-batch-batch-test.zip", bytes: new Uint8Array([1]) };
  });
  try {
    const accepted = await fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json; charset=utf-8",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: JSON.stringify(requestDocument()),
    });
    assert.equal(accepted.status, 200);
    assert.equal(called, 1);

    const rejected = await fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/jsonp",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: JSON.stringify(requestDocument()),
    });
    assert.equal(rejected.status, 400);
    assert.equal(called, 1);
  } finally {
    await close(server);
  }
});

test("loopback bridge permits only one export at a time", async () => {
  let release!: () => void;
  let markEntered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const packageFactory: CatalogBridgePackageFactory = async () => {
    markEntered();
    await gate;
    return { filename: "academiccloud-catalog-batch-batch-test.zip", bytes: new Uint8Array([1]) };
  };
  const { server, url } = await listen(packageFactory);
  try {
    const init = {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: JSON.stringify(requestDocument()),
    } as const;
    const first = fetch(`${url}/v1/catalog/export`, init);
    await entered;
    const second = await fetch(`${url}/v1/catalog/export`, init);
    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), { status: "failed", code: "busy" });
    release();
    assert.equal((await first).status, 200);
  } finally {
    release();
    await close(server);
  }
});

test("loopback bridge aborts the exporter when the browser disconnects after submission", async () => {
  let markEntered!: () => void;
  let markAborted!: () => void;
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const aborted = new Promise<void>((resolve) => { markAborted = resolve; });
  const { server, url } = await listen(async (_request, signal) => {
    markEntered();
    if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    markAborted();
    throw new Error("client_disconnected");
  });
  try {
    const controller = new AbortController();
    const pending = fetch(`${url}/v1/catalog/export`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-academiccloud-catalog-bridge": "1",
      },
      body: JSON.stringify(requestDocument()),
      signal: controller.signal,
    });
    await entered;
    controller.abort();
    await assert.rejects(pending);
    await aborted;
  } finally {
    await close(server);
  }
});
