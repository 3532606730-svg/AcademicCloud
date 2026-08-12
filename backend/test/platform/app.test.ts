import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";

import { createApp } from "../../src/platform/app.js";

test("GET /api/health reports a healthy API", async (context) => {
  const app = await createApp({ logger: false });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "academiccloud-api",
  });

  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(
    response.headers["content-security-policy"],
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(response.headers["cross-origin-resource-policy"], "same-origin");
  assert.equal(response.headers["permissions-policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
});

test("only the loopback reverse proxy may supply a client address", async (context) => {
  const app = await createApp({ logger: false });
  app.get("/api/client-address", async (request) => ({ ip: request.ip }));
  context.after(() => app.close());

  const trusted = await app.inject({
    method: "GET",
    url: "/api/client-address",
    remoteAddress: "127.0.0.1",
    headers: { "x-forwarded-for": "203.0.113.25" },
  });
  assert.deepEqual(trusted.json(), { ip: "203.0.113.25" });

  const untrusted = await app.inject({
    method: "GET",
    url: "/api/client-address",
    remoteAddress: "10.0.0.9",
    headers: { "x-forwarded-for": "203.0.113.25" },
  });
  assert.deepEqual(untrusted.json(), { ip: "10.0.0.9" });
});

test("readiness is database-scoped and returns a stable unavailable response", async (context) => {
  let ready = true;
  const app = await createApp({ logger: false, readinessCheck: () => ready });
  context.after(() => app.close());

  const available = await app.inject({ method: "GET", url: "/api/ready" });
  assert.equal(available.statusCode, 200);
  assert.deepEqual(available.json(), { status: "ready", service: "academiccloud-api" });

  ready = false;
  const unavailable = await app.inject({ method: "GET", url: "/api/ready" });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), {
    status: "unavailable",
    service: "academiccloud-api",
  });
});

test("the API header baseline applies across success and error statuses", async (context) => {
  const app = await createApp({ logger: false });
  for (const status of [200, 400, 401, 403, 409, 429, 500, 503]) {
    app.get(`/api/status/${status}`, async (_request, reply) =>
      reply.code(status).send({ status }),
    );
  }
  context.after(() => app.close());

  for (const status of [200, 400, 401, 403, 404, 409, 429, 500, 503]) {
    const response = await app.inject({
      method: "GET",
      url: status === 404 ? "/api/missing" : `/api/status/${status}`,
    });
    assert.equal(response.statusCode, status);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
  }
});

test("API parser and not-found failures use stable client-safe responses", async (context) => {
  const app = await createApp({ logger: false });
  app.post("/api/echo", async () => ({ ok: true }));
  context.after(() => app.close());

  const malformed = await app.inject({
    method: "POST",
    url: "/api/echo",
    headers: { "content-type": "application/json" },
    payload: "{",
  });
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.json(), { error: "invalid_request" });
  assert.equal(malformed.headers["cache-control"], "no-store");

  const oversized = await app.inject({
    method: "POST",
    url: "/api/echo",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ value: "x".repeat(17 * 1024) }),
  });
  assert.equal(oversized.statusCode, 413);
  assert.deepEqual(oversized.json(), { error: "payload_too_large" });
  assert.equal(oversized.headers["cache-control"], "no-store");

  const missing = await app.inject({
    method: "GET",
    url: "/api/unknown?token=must-not-be-reflected",
  });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "not_found" });
  assert.equal(missing.headers["cache-control"], "no-store");
});

test("structured request and error logs omit raw URLs, request secrets, and error causes", async (context) => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const app = await createApp({ logger: { level: "info", stream } });
  app.get("/api/failure", async () => {
    throw new Error("signed URL: https://storage.invalid/object?signature=error-secret", {
      cause: new Error("provider-secret-in-cause"),
    });
  });
  context.after(() => app.close());

  app.log.info(
    {
      password: "password-secret",
      sessionSecret: "session-secret",
      accessKeyId: "access-key-id",
      accessKeySecret: "access-key-secret",
      stsToken: "sts-secret",
      signedUrl: "https://storage.invalid/signed-url-secret",
      fields: {
        policy: "policy-secret",
        Signature: "signature-secret",
        OSSAccessKeyId: "browser-access-key-id",
        "x-oss-security-token": "browser-sts-secret",
      },
    },
    "redaction probe",
  );

  const response = await app.inject({
    method: "GET",
    url: "/api/failure?download=https%3A%2F%2Fstorage.invalid%2Fquery-secret",
    headers: {
      authorization: "Bearer authorization-secret",
      cookie: "ac_session=cookie-secret",
    },
  });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });

  for (const secret of [
    "password-secret",
    "session-secret",
    "access-key-id",
    "access-key-secret",
    "sts-secret",
    "signed-url-secret",
    "policy-secret",
    "signature-secret",
    "browser-access-key-id",
    "browser-sts-secret",
    "query-secret",
    "authorization-secret",
    "cookie-secret",
    "error-secret",
    "provider-secret-in-cause",
  ]) {
    assert.equal(output.includes(secret), false, `log output contained ${secret}`);
  }

  const entries = output.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(entries.some((entry) => entry.event === "http.unhandled_error"), true);
  assert.equal(entries.some((entry) => entry.event === "http.request_completed"), true);
  assert.equal(entries.some((entry) => entry.route === "/api/failure"), true);
  assert.equal(output.includes("incoming request"), false);
});
