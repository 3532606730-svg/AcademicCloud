import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { registerCatalogBatchHttp } from "../../src/catalog-batch/http.js";
import { CatalogBatchError, type CatalogBatchService } from "../../src/catalog-batch/catalog-batch-service.js";
import { MAX_CATALOG_APPLY_BYTES, MAX_CATALOG_RESULTS_BYTES } from "../../src/catalog-batch/contracts.js";

test("Catalog HTTP transports the bounded Preview and plan-only Apply envelopes and preserves authentication", async (context) => {
  const app = Fastify({ bodyLimit: 16 * 1024, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  context.after(() => app.close());
  app.decorateRequest("authAccount", null);
  app.decorate("authenticate", async (request, reply) => {
    if (request.headers.authorization !== "Bearer synthetic-session") return reply.code(401).send({ error: "unauthorized" });
    request.authAccount = { id: "owner", loginName: "owner", role: "owner" };
  });
  let previews = 0; let applies = 0; let exports = 0;
  const service = {
    preview: () => { previews++; return { planId: "p".repeat(43) }; },
    apply: (_actor: unknown, _library: string, planId: string, selections: Array<{ resourceId: string }>) => {
      if (planId === "x".repeat(43)) throw new CatalogBatchError("plan_expired");
      applies++; return selections.map((item) => ({ ...item, status: "applied" }));
    },
    prepareExport: async () => { exports++; return { ok: true }; },
  } as unknown as CatalogBatchService;
  await registerCatalogBatchHttp(app, service);
  const headers = { authorization: "Bearer synthetic-session", "content-type": "application/json" };
  const url = "/api/libraries/library/catalog-batches/";
  const padded = "{}" + " ".repeat(MAX_CATALOG_RESULTS_BYTES - 2);
  assert.equal((await app.inject({ method: "POST", url: `${url}preview`, headers, payload: padded })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: `${url}preview`, headers, payload: padded + " " })).statusCode, 413);
  assert.equal(previews, 1);
  const selections = Array.from({ length: 500 }, (_, index) => ({ resourceId: String(index).padStart(128, "r"),
    previewVersion: "v".repeat(43), acknowledgeEvidence: true, acknowledgeHumanConflict: true, acknowledgeClear: true }));
  assert.equal((await app.inject({ method: "POST", url: `${url}apply`, headers, payload: { planId: "p".repeat(43), selections } })).statusCode, 200);
  assert.equal(applies, 1);
  for (const payload of [
    { document: {}, documentDigest: "d".repeat(64), selections },
    { planId: "p".repeat(43), selections: [...selections, selections[0]] },
    { planId: "p".repeat(43), selections: [{ ...selections[0], acknowledgeEvidence: false }] },
    { planId: "p".repeat(43), selections: [{ ...selections[0], owner_id: "injected" }] },
  ]) assert.equal((await app.inject({ method: "POST", url: `${url}apply`, headers, payload })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: `${url}apply`, headers, payload: "{}" + " ".repeat(MAX_CATALOG_APPLY_BYTES) })).statusCode, 413);
  assert.equal((await app.inject({ method: "POST", url: `${url}apply`, headers, payload: { planId: "x".repeat(43), selections: [selections[0]] } })).statusCode, 409);
  assert.equal((await app.inject({ method: "POST", url: `${url}export-request`, headers, payload: { fileIds: selections.map((item) => item.resourceId) } })).statusCode, 200);
  assert.equal(exports, 1);
  assert.equal((await app.inject({ method: "POST", url: `${url}preview`, payload: {} })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: `${url}apply`, payload: { planId: "p".repeat(43), selections } })).statusCode, 401);
  assert.equal(applies, 1);
});
