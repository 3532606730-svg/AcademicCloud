import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../../src/platform/config.js";

test("loadConfig provides safe local defaults", () => {
  assert.deepEqual(loadConfig({}), {
    host: "127.0.0.1",
    port: 3000,
    logLevel: "info",
    environment: "development",
    appOrigin: "http://127.0.0.1:5173",
  });
});

test("loadConfig rejects an invalid port", () => {
  assert.throws(() => loadConfig({ PORT: "70000" }), /PORT must be an integer/);
});

test("loadConfig rejects an unsupported log level", () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: "verbose" }), /LOG_LEVEL must be one of/);
});

test("loadConfig requires an exact HTTPS application origin in production", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /APP_ORIGIN is required/);
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", APP_ORIGIN: "http://cloud.example" }),
    /must use HTTPS/,
  );
  assert.throws(
    () => loadConfig({ APP_ORIGIN: "http://127.0.0.1:5173/" }),
    /exact HTTP\(S\) origin/,
  );
  assert.equal(
    loadConfig({ NODE_ENV: "production", APP_ORIGIN: "https://cloud.example" }).appOrigin,
    "https://cloud.example",
  );
});

test("loadConfig keeps the production API on the trusted IPv4 loopback", () => {
  const production = {
    NODE_ENV: "production",
    APP_ORIGIN: "https://cloud.example.edu",
  };

  assert.equal(loadConfig(production).host, "127.0.0.1");
  assert.throws(() => loadConfig({ ...production, HOST: "0.0.0.0" }), /HOST must be 127\.0\.0\.1/);
  assert.throws(() => loadConfig({ ...production, HOST: "::1" }), /HOST must be 127\.0\.0\.1/);
});
