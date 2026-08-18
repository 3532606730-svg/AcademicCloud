import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoundedStartupDiagnostics,
  describeStartupExit,
} from "../../src/deployment/compiled-startup-diagnostics.js";

test("compiled startup diagnostics retain only bounded sanitized runtime exception lines", () => {
  const diagnostics = createBoundedStartupDiagnostics({
    OSS_ACCESS_KEY_SECRET: "do-not-print-this-secret",
    DATABASE_PATH: "/private/database/academiccloud.sqlite",
    APP_ORIGIN: "https://private.example.edu",
  }, 512);

  diagnostics.append("stdout", "scholarly content that must not be emitted\n");
  diagnostics.append("stderr", `${"discarded-prefix\n".repeat(80)}Error: Cannot find module '@napi-rs/canvas-linux-x64-gnu'\n`);
  diagnostics.append("stderr", "    at node_modules/pdfjs-dist/legacy/build/pdf.mjs:1:1\n");
  diagnostics.append("stderr", "token=do-not-print-this-secret\n");
  diagnostics.append("stderr", "database=/private/database/academiccloud.sqlite\n");
  diagnostics.append("stderr", "request body: private scholarly content\n");
  diagnostics.append("stderr", "Warning: fetch failed for https://private.example.edu/signed?signature=secret\n");

  const output = diagnostics.format("compiled API exited with code 1");

  assert.match(output, /^compiled API exited with code 1/mu);
  assert.match(output, /Cannot find module '@napi-rs\/canvas-linux-x64-gnu'/u);
  assert.match(output, /node_modules\/pdfjs-dist/u);
  assert.match(output, /\[REDACTED_URL\]/u);
  assert.ok(Buffer.byteLength(output, "utf8") < 2 * 1024);
  assert.doesNotMatch(output, /do-not-print-this-secret|private\/database|scholarly content|request body|signed\?/u);
});

test("compiled startup diagnostics are quiet until a failure is explicitly formatted", () => {
  const diagnostics = createBoundedStartupDiagnostics({});
  diagnostics.append("stdout", "ordinary successful application output\n");
  assert.equal(diagnostics.format("compiled API did not become healthy"), "compiled API did not become healthy");
});

test("compiled startup exit detection distinguishes running, exit-code, and signal states", () => {
  assert.equal(describeStartupExit({ exitCode: null, signalCode: null }), null);
  assert.equal(describeStartupExit({ exitCode: 1, signalCode: null }), "compiled API exited with code 1");
  assert.equal(describeStartupExit({ exitCode: null, signalCode: "SIGTERM" }), "compiled API exited after signal SIGTERM");
});
