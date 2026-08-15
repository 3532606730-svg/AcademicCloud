// production-e2e-acceptance.test.mjs
//
// Deterministic contract tests for the repository-owned E2E acceptance tool.
// Pins payload identities, the status-code contract, request semantics,
// real folder nesting, bodyless renew/folder-restore, renewed-authorization
// selection, verdict completeness, timeout behavior, fail-fast behavior, and
// the absence of any permanent-delete path.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CONTRACT,
  PAYLOAD_SPECS,
  TIMEOUTS,
  computeVerdict,
  deterministicPayload,
  fetchWithTimeout,
  md5Base64,
  requestInit,
  runFolderLifecycle,
  runOneFile,
  sha256,
} from "./production-e2e-acceptance.mjs";

const EXPECTED_ROWS = [
  { tag: "pdf", display: "sample.pdf", mediaType: "application/pdf", bytes: 4096, md5Base64: "GvL9/U7aoQyRRZXavZXUiw==", sha256: "72bf1f6f5873dad6afb9cdc121d831d3f23be71e7836e72d4553ff825c830d49" },
  { tag: "png", display: "sample.png", mediaType: "image/png", bytes: 2048, md5Base64: "dcMLvbSMMqsDYPl7G354lg==", sha256: "8ac1a17273ea8a556144a9fcfe4bd642437888ab082884a7f91798cc8efd0309" },
  { tag: "txt", display: "sample.txt", mediaType: "text/plain", bytes: 512, md5Base64: "bm0r4c+F742ow8KJleaJdw==", sha256: "61bcc644615d8948dbe6af96314a2096481426d528e31d340d8e1b5c7f4c263a" },
  { tag: "bin", display: "sample.bin", mediaType: "application/octet-stream", bytes: 8192, md5Base64: "alb7C4fKRWh9VXAPF48fmA==", sha256: "3a06cffa607bd3ecfcb3361b62171ed268224840304cca4e29ef63aeae2199cb" },
];

const ROOT_FOLDER_ID = "root-folder-1";
const NESTED_FOLDER_ID = "nested-folder-1";
const FILE_ID = "file-1";

function jsonResponse(status, body) {
  return { status, json: async () => body };
}

function emptyResponse(status) {
  return { status, json: async () => ({}) };
}

function makeFakes(spec, ctx, overrides = {}) {
  const calls = [];
  let observedUploadUrl = null;
  let directPostCalls = 0;
  let signedGetCalls = 0;
  const payload = deterministicPayload(spec);

  const api = async (method, path, options) => {
    calls.push({ method, path, options });
    const override = overrides.api?.(method, path, options, calls);
    if (override) return override;
    if (path === "/api/drive/uploads") {
      return jsonResponse(201, {
        file: { id: FILE_ID, state: "pending_upload" },
        upload: { method: "POST", url: "https://initial.invalid", fields: { key: "initial" }, expiresAt: "2026-08-15T00:00:00Z" },
      });
    }
    if (path.startsWith("/api/drive/uploads?folderId=")) {
      return jsonResponse(200, { files: [{ id: FILE_ID, state: "pending_upload" }] });
    }
    if (path.endsWith("/authorization")) {
      return jsonResponse(200, {
        upload: { method: "POST", url: "https://renewed.invalid", fields: { key: "renewed" }, expiresAt: "2026-08-15T00:00:00Z" },
      });
    }
    if (path.endsWith("/complete")) {
      return jsonResponse(200, {
        file: { id: FILE_ID, folderId: ctx.rootFolderId, displayName: "x", mediaType: spec.mediaType, sizeBytes: payload.length, checksumAlgorithm: "md5", checksum: md5Base64(payload), state: "active" },
      });
    }
    if (path.startsWith("/api/drive/entries")) {
      return jsonResponse(200, { folder: null, folders: [], files: [{ id: FILE_ID, state: "active" }] });
    }
    if (path.includes("/download")) {
      return jsonResponse(200, { download: { method: "GET", url: "https://signed.invalid/object", expiresAt: "2026-08-15T00:00:00Z" } });
    }
    if (method === "PATCH" && path.includes("/files/")) {
      return jsonResponse(200, {
        file: { id: FILE_ID, folderId: options.json.folderId ?? ctx.rootFolderId, displayName: options.json.displayName ?? "x", mediaType: spec.mediaType, sizeBytes: payload.length, checksumAlgorithm: "md5", checksum: md5Base64(payload), state: "active" },
      });
    }
    if (method === "DELETE" && path.includes("/files/")) {
      return emptyResponse(204);
    }
    if (path === "/api/drive/recycle") {
      return jsonResponse(200, { folders: [], files: [{ id: FILE_ID, state: "deleted" }] });
    }
    if (path.includes("/files/") && path.endsWith("/restore")) {
      return jsonResponse(200, { file: { id: FILE_ID, folderId: ctx.rootFolderId, state: "active" } });
    }
    throw new Error(`unexpected fake call: ${method} ${path}`);
  };

  const directPost = async (url) => {
    observedUploadUrl = url;
    directPostCalls += 1;
    return { status: 201 };
  };

  const signedGet = async (url) => {
    assert.equal(url, "https://signed.invalid/object");
    signedGetCalls += 1;
    return { status: 200, arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) };
  };

  return {
    deps: { api, directPost, signedGet },
    calls: () => calls,
    observedUploadUrl: () => observedUploadUrl,
    directPostCalls: () => directPostCalls,
    signedGetCalls: () => signedGetCalls,
    payload,
  };
}

const TEST_CTX = { cookie: "c=1", rootFolderId: ROOT_FOLDER_ID, nestedFolderId: NESTED_FOLDER_ID, folderName: "prod03c2-e2e-test" };

// ---------------------------------------------------------------- fixtures

function validFileResult() {
  return {
    tag: "pdf",
    expectedMd5: "GvL9/U7aoQyRRZXavZXUiw==",
    expectedSha256: "72bf1f6f5873dad6afb9cdc121d831d3f23be71e7836e72d4553ff825c830d49",
    reserve: { status: CONTRACT.uploadReserve, fileId: "file-1", state: "pending_upload" },
    pendingList: { status: CONTRACT.pendingList },
    pendingListed: true,
    renew: { status: CONTRACT.uploadRenew, method: "POST", urlNonEmpty: true, fieldsObject: true },
    renewedAuthorizationValid: true,
    renewedAuthUsed: true,
    upload: CONTRACT.directUpload,
    complete: { status: CONTRACT.uploadComplete, sizeOk: true, checksumOk: true, state: "active" },
    entriesList: { status: CONTRACT.entriesList },
    listed: true,
    downloadAuthorization: { status: CONTRACT.downloadAuthorization },
    signedDownload: { status: CONTRACT.signedDownload },
    downloadSha256: "72bf1f6f5873dad6afb9cdc121d831d3f23be71e7836e72d4553ff825c830d49",
    downloadBytesOk: true,
    renamed: { status: CONTRACT.fileRename, name: true },
    moved: { status: CONTRACT.fileMove, inSubfolder: true },
    recycled: CONTRACT.fileDelete,
    recycleList: { status: CONTRACT.recycleList },
    recycledListed: true,
    restored: { status: CONTRACT.fileRestore, active: true },
    moveOut: { status: CONTRACT.fileMove, backInRoot: true },
  };
}

function validResults() {
  return {
    login: { status: CONTRACT.login, matches: true },
    session: CONTRACT.session,
    rootFolder: { status: CONTRACT.folderCreate, id: "root-folder-1" },
    nestedFolder: { status: CONTRACT.folderCreate, id: "nested-folder-1", parentRelation: true },
    files: [validFileResult(), validFileResult(), validFileResult(), validFileResult()],
    folderLifecycle: {
      childEmpty: true,
      folderDelete: CONTRACT.folderDelete,
      folderRecycledListed: true,
      folderRestore: { status: CONTRACT.folderRestore, active: true, parentRelation: true },
    },
    logout: CONTRACT.logout,
  };
}

// ---------------------------------------------------------------- tests

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
  assert.equal(CONTRACT.folderDelete, 204);
  assert.equal(CONTRACT.folderRestore, 200);
  assert.equal(CONTRACT.uploadReserve, 201);
  assert.equal(CONTRACT.uploadRenew, 200);
  assert.equal(CONTRACT.uploadComplete, 200);
  assert.equal(CONTRACT.fileRename, 200);
  assert.equal(CONTRACT.fileMove, 200);
  assert.equal(CONTRACT.fileDelete, 204);
  assert.equal(CONTRACT.fileRestore, 200);
  assert.equal(CONTRACT.recycleList, 200);
  assert.equal(CONTRACT.entriesList, 200);
  assert.equal(CONTRACT.pendingList, 200);
  assert.equal(CONTRACT.downloadAuthorization, 200);
  assert.equal(CONTRACT.signedDownload, 200);
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

test("request semantics split: JSON body requests vs bodyless actions", () => {
  const jsonInit = requestInit("POST", { cookie: "c=1", json: { name: "Folder", parentId: null } });
  assert.equal(jsonInit.method, "POST");
  assert.equal(jsonInit.headers["Content-Type"], "application/json");
  assert.equal(jsonInit.headers.Accept, "application/json");
  assert.equal(jsonInit.body, JSON.stringify({ name: "Folder", parentId: null }));

  const actionInit = requestInit("POST", { cookie: "c=1" });
  assert.equal(actionInit.method, "POST");
  assert.equal(actionInit.headers.Accept, "application/json");
  assert.ok(!("Content-Type" in actionInit.headers));
  assert.ok(!("body" in actionInit));

  const scriptPath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");
  assert.ok(!readFileSync(scriptPath, "utf8").includes("jsonTypeOnly"));
});

test("the tool never references the permanent-delete endpoint", () => {
  const scriptPath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");
  assert.ok(!readFileSync(scriptPath, "utf8").includes("/permanent"));
});

test("timeout policy values are bounded and distinct", () => {
  assert.equal(TIMEOUTS.api, 30_000);
  assert.equal(TIMEOUTS.signedDownload, 30_000);
  assert.equal(TIMEOUTS.directUpload, 60_000);
});

test("fetchWithTimeout resolves on a fast response and aborts a stalled one", async () => {
  const fastImpl = async () => ({ status: 200 });
  const fast = await fetchWithTimeout("https://fast.invalid", {}, 500, fastImpl);
  assert.equal(fast.status, 200);

  const stalledImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
  const started = Date.now();
  await assert.rejects(
    fetchWithTimeout("https://stalled.invalid", {}, 30, stalledImpl),
    (error) => error.name === "AbortError",
  );
  assert.ok(Date.now() - started < 500, "timeout must be bounded");
});

// ---------------------------------------------------------------- workflow tests

test("runOneFile: real nesting inputs, bodyless renew, and the RENEWED authorization is the one used", async () => {
  const fakes = makeFakes(PAYLOAD_SPECS[2], TEST_CTX);
  const result = await runOneFile(PAYLOAD_SPECS[2], TEST_CTX, fakes.deps);

  assert.equal(result.renew.status, CONTRACT.uploadRenew);
  assert.equal(result.renewedAuthorizationValid, true);
  assert.equal(result.renewedAuthUsed, true);
  assert.equal(result.upload, CONTRACT.directUpload);
  assert.equal(result.complete.checksumOk, true);
  assert.equal(result.moved.inSubfolder, true);
  assert.equal(result.moveOut.backInRoot, true);

  // The observed direct-upload URL MUST be the renewed authorization URL.
  assert.equal(fakes.observedUploadUrl(), "https://renewed.invalid");
  assert.equal(fakes.directPostCalls(), 1);

  // Renew must be bodyless: no Content-Type, no body in the REAL request init.
  const renewCall = fakes.calls().find((call) => call.path.endsWith("/authorization"));
  assert.ok(renewCall, "renew call present");
  const renewInit = requestInit("POST", renewCall.options);
  assert.equal(renewInit.method, "POST");
  assert.ok(!("Content-Type" in renewInit.headers));
  assert.ok(!("body" in renewInit));

  // Complete must also be bodyless.
  const completeCall = fakes.calls().find((call) => call.path.endsWith("/complete"));
  const completeInit = requestInit("POST", completeCall.options);
  assert.ok(!("Content-Type" in completeInit.headers));
  assert.ok(!("body" in completeInit));
});

test("runFolderLifecycle: bodyless folder restore with real parent verification", async () => {
  const calls = [];
  const api = async (method, path, options) => {
    calls.push({ method, path, options });
    if (path.startsWith("/api/drive/entries")) return jsonResponse(200, { folder: null, folders: [], files: [] });
    if (method === "DELETE" && path.includes("/folders/")) return emptyResponse(204);
    if (path === "/api/drive/recycle") return jsonResponse(200, { folders: [{ id: NESTED_FOLDER_ID, state: "deleted" }], files: [] });
    if (path.includes("/folders/") && path.endsWith("/restore")) {
      return jsonResponse(200, { folder: { id: NESTED_FOLDER_ID, parentId: ROOT_FOLDER_ID, state: "active" } });
    }
    throw new Error(`unexpected fake call: ${method} ${path}`);
  };
  const result = await runFolderLifecycle(TEST_CTX, { api, directPost: async () => ({ status: 201 }), signedGet: async () => ({ status: 200, arrayBuffer: async () => new ArrayBuffer(0) }) });

  assert.equal(result.childEmpty, true);
  assert.equal(result.folderDelete, CONTRACT.folderDelete);
  assert.equal(result.folderRecycledListed, true);
  assert.equal(result.folderRestore.status, CONTRACT.folderRestore);
  assert.equal(result.folderRestore.active, true);
  assert.equal(result.folderRestore.parentRelation, true);

  const restoreCall = calls.find((call) => call.path.endsWith("/folders/nested-folder-1/restore"));
  assert.ok(restoreCall, "restore call present");
  const restoreInit = requestInit("POST", restoreCall.options);
  assert.equal(restoreInit.method, "POST");
  assert.ok(!("Content-Type" in restoreInit.headers));
  assert.ok(!("body" in restoreInit));
});

test("fail fast: renew failure must prevent the direct OSS upload", async () => {
  const fakes = makeFakes(PAYLOAD_SPECS[2], TEST_CTX, {
    api: (method, path) => {
      if (path.endsWith("/authorization")) return jsonResponse(401, { error: "authentication_required" });
      return null;
    },
  });
  await assert.rejects(runOneFile(PAYLOAD_SPECS[2], TEST_CTX, fakes.deps), /renew/);
  assert.equal(fakes.directPostCalls(), 0);
});

test("fail fast: upload completion failure must prevent rename/move/recycle", async () => {
  const fakes = makeFakes(PAYLOAD_SPECS[2], TEST_CTX, {
    api: (method, path) => {
      if (path.endsWith("/complete")) return jsonResponse(400, { error: "invalid_request" });
      return null;
    },
  });
  await assert.rejects(runOneFile(PAYLOAD_SPECS[2], TEST_CTX, fakes.deps), /completion/);
  const later = fakes.calls().filter((call) =>
    (call.method === "PATCH" && call.path.includes("/files/")) ||
    (call.method === "DELETE" && call.path.includes("/files/")) ||
    call.path === "/api/drive/recycle" ||
    (call.path.includes("/files/") && call.path.endsWith("/restore")));
  assert.equal(later.length, 0, "no mutation after completion failure");
});

test("fail fast: move failure must prevent recycle/restore/move-out", async () => {
  const fakes = makeFakes(PAYLOAD_SPECS[2], TEST_CTX, {
    api: (method, path, options) => {
      if (method === "PATCH" && path.includes("/files/") && options.json.folderId === TEST_CTX.nestedFolderId) {
        return jsonResponse(409, { error: "invalid_move" });
      }
      return null;
    },
  });
  await assert.rejects(runOneFile(PAYLOAD_SPECS[2], TEST_CTX, fakes.deps), /move/);
  const afterMove = fakes.calls().filter((call) =>
    (call.method === "DELETE" && call.path.includes("/files/")) ||
    call.path === "/api/drive/recycle" ||
    (call.path.includes("/files/") && call.path.endsWith("/restore")) ||
    (call.method === "PATCH" && call.path.includes("/files/") && call.options.json?.folderId === TEST_CTX.rootFolderId));
  assert.equal(afterMove.length, 0, "no mutation after move failure");
});

// ---------------------------------------------------------------- verdict tests

test("computeVerdict accepts a fully valid run", () => {
  assert.equal(computeVerdict(validResults(), 4), true);
});

test("computeVerdict rejects when ANY single network step or semantic check fails", () => {
  const cases = [
    ["login status", (r) => { r.login.status = 401; }],
    ["login match", (r) => { r.login.matches = false; }],
    ["session status", (r) => { r.session = 401; }],
    ["root folder create status", (r) => { r.rootFolder.status = 200; }],
    ["root folder id missing", (r) => { r.rootFolder.id = null; }],
    ["nested folder create status", (r) => { r.nestedFolder.status = 500; }],
    ["nested folder id missing", (r) => { r.nestedFolder.id = null; }],
    ["nested parent relationship", (r) => { r.nestedFolder.parentRelation = false; }],
    ["reservation status", (r) => { r.files[0].reserve.status = 200; }],
    ["reservation file id missing", (r) => { r.files[0].reserve.fileId = null; }],
    ["reservation pending state", (r) => { r.files[0].reserve.state = "active"; }],
    ["pending-list status", (r) => { r.files[0].pendingList.status = 500; }],
    ["pending-listing semantic", (r) => { r.files[0].pendingListed = false; }],
    ["renew status", (r) => { r.files[0].renew.status = 401; }],
    ["renewed authorization invalid", (r) => { r.files[0].renewedAuthorizationValid = false; }],
    ["renewed authorization not used", (r) => { r.files[0].renewedAuthUsed = false; }],
    ["direct upload status", (r) => { r.files[0].upload = 403; }],
    ["complete status", (r) => { r.files[0].complete.status = 400; }],
    ["complete state", (r) => { r.files[0].complete.state = "pending_upload"; }],
    ["complete size semantic", (r) => { r.files[0].complete.sizeOk = false; }],
    ["complete checksum semantic", (r) => { r.files[0].complete.checksumOk = false; }],
    ["entries-list status", (r) => { r.files[0].entriesList.status = 500; }],
    ["entries-listing semantic", (r) => { r.files[0].listed = false; }],
    ["download-authorization status", (r) => { r.files[0].downloadAuthorization.status = 401; }],
    ["signed-download status (distinct step)", (r) => { r.files[0].signedDownload.status = 403; }],
    ["downloaded hash mismatch", (r) => { r.files[0].downloadSha256 = "0".repeat(64); }],
    ["downloaded bytes mismatch", (r) => { r.files[0].downloadBytesOk = false; }],
    ["rename status", (r) => { r.files[0].renamed.status = 400; }],
    ["rename semantic", (r) => { r.files[0].renamed.name = false; }],
    ["move status", (r) => { r.files[0].moved.status = 400; }],
    ["move semantic", (r) => { r.files[0].moved.inSubfolder = false; }],
    ["recycle status", (r) => { r.files[0].recycled = 500; }],
    ["recycle-list status", (r) => { r.files[0].recycleList.status = 500; }],
    ["recycle-listing semantic", (r) => { r.files[0].recycledListed = false; }],
    ["restore status", (r) => { r.files[0].restored.status = 400; }],
    ["restore semantic", (r) => { r.files[0].restored.active = false; }],
    ["move-out status", (r) => { r.files[0].moveOut.status = 400; }],
    ["move-out semantic", (r) => { r.files[0].moveOut.backInRoot = false; }],
    ["child emptiness", (r) => { r.folderLifecycle.childEmpty = false; }],
    ["folder delete status", (r) => { r.folderLifecycle.folderDelete = 500; }],
    ["folder recycle semantic", (r) => { r.folderLifecycle.folderRecycledListed = false; }],
    ["folder restore status", (r) => { r.folderLifecycle.folderRestore.status = 400; }],
    ["folder restored active", (r) => { r.folderLifecycle.folderRestore.active = false; }],
    ["folder restored parent", (r) => { r.folderLifecycle.folderRestore.parentRelation = false; }],
    ["logout status", (r) => { r.logout = 500; }],
    ["file count mismatch", (r) => { r.files = [validFileResult()]; }],
  ];
  for (const [name, mutate] of cases) {
    const results = validResults();
    mutate(results);
    assert.equal(computeVerdict(results, 4), false, `expected false for: ${name}`);
  }
});
