import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../../src/platform/config.js";

test("loadConfig provides safe local defaults", () => {
  assert.deepEqual(loadConfig({}), {
    host: "127.0.0.1",
    port: 3000,
    logLevel: "info",
    environment: "development",
  });
});

test("loadConfig rejects an invalid port", () => {
  assert.throws(() => loadConfig({ PORT: "70000" }), /PORT must be an integer/);
});

test("loadConfig rejects an unsupported log level", () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: "verbose" }), /LOG_LEVEL must be one of/);
});
