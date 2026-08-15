// production-e2e-acceptance.test.mjs
//
// Deterministic contract tests for the repository-owned E2E acceptance tool.
// Pins the payload identities (size/mediaType/MD5-Base64/SHA-256) and the
// backend status-code contract the tool asserts, so the mismatches found in
// the first E2E-tool review (200 vs 201, hex vs Base64 MD5) cannot recur.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CONTRACT,
  PAYLOAD_SPECS,
  deterministicPayload,
  md5Base64,
  requestInit,
  sha256,
} from "./production-e2e-acceptance.mjs";

const EXPECTED_ROWS = [
  { tag: "pdf", display: "sample.pdf", mediaType: "application/pdf", bytes: 4096, md5Base64: "GvL9/U7aoQyRRZXavZXUiw==", sha256: "72bf1f6f5873dad6afb9cdc121d831d3f23be71e7836e72d4553ff825c830d49" },
  { tag: "png", display: "sample.png", mediaType: "image/png", bytes: 2048, md5Base64: "dcMLvbSMMqsDYPl7G354lg==", sha256: "8ac1a17273ea8a556144a9fcfe4bd642437888ab082884a7f91798cc8efd0309" },
  { tag: "txt", display: "sample.txt", mediaType: "text/plain", bytes: 512, md5Base64: "bm0r4c+F742ow8KJleaJdw==", sha256: "61bcc644615d8948dbe6af96314a2096481426d528e31d340d8e1b5c7f4c263a" },
  { tag: "bin", display: "sample.bin", mediaType: "application/octet-stream", bytes: 8192, md5Base64: "alb7C4fKRWh9VXAPF48fmA==", sha256: "3a06cffa607bd3ecfcb3361b62171ed268224840304cca4e29ef63aeae2199cb" },
];

test("payload identities match the pre-registration table exactly", () => {
  assert.equal(PAYLOAD_SPECS.length, EXPECTED_ROWS.length);
  for (const [index, spec] of PAYLOAD_SPECS.entries()) {
    const expected = EXPECTED_ROWS[index];
    const payload = deterministicPayload(spec);
    assert.equal(spec.tag, expected.tag);
    assert.equal(spec.display, expected.display);
    assert.equal(spec.mediaType, expected.mediaType);
    assert.equal(spec.bytes, expected.bytes);
    assert.equal(payload.length, expected.bytes);
    assert.equal(md5Base64(payload), expected.md5Base64);
    assert.equal(sha256(payload), expected.sha256);
    assert.match(md5Base64(payload), CONTRACT.checksumPattern);
  }
});

test("status-code contract matches the backend drive/auth routes", () => {
  assert.equal(CONTRACT.login, 200);
  assert.equal(CONTRACT.session, 200);
  assert.equal(CONTRACT.logout, 204);
  assert.equal(CONTRACT.folderCreate, 201);
  assert.equal(CONTRACT.uploadReserve, 201);
  assert.equal(CONTRACT.uploadComplete, 200);
  assert.equal(CONTRACT.fileRename, 200);
  assert.equal(CONTRACT.fileMove, 200);
  assert.equal(CONTRACT.fileDelete, 204);
  assert.equal(CONTRACT.fileRestore, 200);
  assert.equal(CONTRACT.recycleList, 200);
  assert.equal(CONTRACT.entriesList, 200);
  assert.equal(CONTRACT.pendingList, 200);
  assert.equal(CONTRACT.downloadAuthorization, 200);
  assert.equal(CONTRACT.directUpload, 201);
});

test("--plan mode prints the exact pre-registration table (no network)", () => {
  const scriptPath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");
  const output = execFileSync(process.execPath, [scriptPath, "--plan"], { encoding: "utf8" });
  const lines = output.trim().split("\n");
  assert.equal(lines.length, EXPECTED_ROWS.length);
  for (const [index, expected] of EXPECTED_ROWS.entries()) {
    const line = lines[index];
    assert.ok(line.startsWith(`${expected.tag}: display=${expected.display} mediaType=${expected.mediaType} bytes=${expected.bytes} `));
    assert.ok(line.includes(`md5Base64=${expected.md5Base64}`));
    assert.ok(line.includes(`sha256=${expected.sha256}`));
  }
});

test("the tool never references the permanent-delete endpoint", () => {
  const scriptPath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");
  const source = readFileSync(scriptPath, "utf8");
  assert.ok(!source.includes("/permanent"));
});

test("request semantics split: JSON body requests vs bodyless actions", () => {
  // JSON body request: Content-Type application/json + serialized body.
  const jsonInit = requestInit("POST", { cookie: "c=1", json: { name: "Folder", parentId: null } });
  assert.equal(jsonInit.method, "POST");
  assert.equal(jsonInit.headers["Content-Type"], "application/json");
  assert.equal(jsonInit.headers.Accept, "application/json");
  assert.equal(jsonInit.headers.Origin, "https://cloud.ajtlab.top");
  assert.equal(jsonInit.headers.Cookie, "c=1");
  assert.equal(jsonInit.body, JSON.stringify({ name: "Folder", parentId: null }));

  // Bodyless action: NO Content-Type, NO body.
  const actionInit = requestInit("POST", { cookie: "c=1" });
  assert.equal(actionInit.method, "POST");
  assert.equal(actionInit.headers.Accept, "application/json");
  assert.equal(actionInit.headers.Origin, "https://cloud.ajtlab.top");
  assert.equal(actionInit.headers.Cookie, "c=1");
  assert.ok(!("Content-Type" in actionInit.headers));
  assert.ok(!("body" in actionInit));

  // The old jsonTypeOnly concept must be gone from the tool source.
  const scriptPath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");
  const source = readFileSync(scriptPath, "utf8");
  assert.ok(!source.includes("jsonTypeOnly"));
});
