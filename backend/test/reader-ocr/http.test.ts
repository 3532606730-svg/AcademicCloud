import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { registerReaderOcrHttp } from "../../src/reader-ocr/http.js";
import { UnavailableReaderOcrBackend } from "../../src/reader-ocr/port.js";

test("Reader OCR endpoint is authenticated, bounded, and explicitly deferred", async (context) => {
  const app = Fastify({ bodyLimit: 16 * 1024, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  context.after(() => app.close());
  app.decorateRequest("authAccount", null);
  app.decorate("authenticate", async (request, reply) => {
    if (request.headers.authorization !== "Bearer synthetic-session") return reply.code(401).send({ error: "unauthorized" });
    request.authAccount = { id: "member", loginName: "member", role: "member" };
  });
  await registerReaderOcrHttp(app, new UnavailableReaderOcrBackend());
  const headers = { authorization: "Bearer synthetic-session", "content-type": "application/json" };
  assert.equal((await app.inject({ method: "GET", url: "/api/reader/ocr/capabilities" })).statusCode, 401);
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/reader/ocr/capabilities", headers })).json(), {
    contractVersion: "academiccloud.reader-ocr.v1", enabled: false, state: "disabled", errorCode: "ocr_deferred",
    selections: ["single", "range"], maxPageSpan: 64, pageAddress: "physical-one-based",
  });
  const valid = await app.inject({ method: "POST", url: "/api/reader/ocr/requests", headers,
    payload: { resourceId: "resource-1", sourceId: "source-1", selection: { kind: "single", physicalPage: 2 } } });
  assert.equal(valid.statusCode, 503);
  assert.equal(valid.json().errorCode, "ocr_deferred");
  for (const payload of [
    { resourceId: "resource-1", sourceId: "source-1", selection: { kind: "single", physicalPage: 0 } },
    { resourceId: "resource-1", sourceId: "source-1", selection: { kind: "range", startPhysicalPage: 1, endPhysicalPage: 65 } },
    { resourceId: "resource-1", sourceId: "source-1", selection: { kind: "single", physicalPage: 1 }, unexpected: true },
  ]) assert.equal((await app.inject({ method: "POST", url: "/api/reader/ocr/requests", headers, payload })).statusCode, 400);
});
