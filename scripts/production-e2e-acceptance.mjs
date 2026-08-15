#!/usr/bin/env node
// production-e2e-acceptance.mjs
//
// Live disposable-object E2E through the public HTTPS edge, mirroring
// frontend/src/api.ts, frontend/src/md5.ts, and frontend/src/direct-upload.ts
// semantics exactly, against the backend contracts in backend/src/drive/http.ts
// and backend/src/auth/http.ts.
//
//   --plan   print the deterministic pre-registration table (no network, no credentials)
//   (none)   full run (see PROD-03C2 task card for the exact flow)
//
// Prints ONLY non-secret statuses, checksums, and opaque identifiers.
// Never touches existing production material and NEVER permanently deletes.
// Every external operation — including response-body consumption — is bounded
// by an explicit timeout owned until the body has been fully read.

import { createHash, randomBytes } from "node:crypto";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const BASE_URL = process.env.ACCEPTANCE_BASE_URL ?? "https://cloud.ajtlab.top";
const PLAN_ONLY = process.argv.includes("--plan");

// Backend drive contract (backend/src/drive/http.ts) and auth contract
// (backend/src/auth/http.ts). Pinned by scripts/production-e2e-acceptance.test.mjs.
export const CONTRACT = Object.freeze({
  login: 200,
  session: 200,
  logout: 204,
  folderCreate: 201,
  folderDelete: 204,
  folderRestore: 200,
  uploadReserve: 201,
  uploadRenew: 200,
  uploadComplete: 200,
  fileRename: 200,
  fileMove: 200,
  fileDelete: 204,
  fileRestore: 200,
  recycleList: 200,
  entriesList: 200,
  pendingList: 200,
  downloadAuthorization: 200,
  signedDownload: 200,
  directUpload: 201,
  checksumPattern: /^[A-Za-z0-9+/]{22}==$/,
});

// Explicit bounded network timeouts (whole operation incl. body reads).
export const TIMEOUTS = Object.freeze({
  api: 30_000,
  signedDownload: 30_000,
  directUpload: 60_000,
});

export const PAYLOAD_SPECS = [
  { tag: "pdf", display: "sample.pdf", mediaType: "application/pdf", bytes: 4096, magic: Buffer.from("%PDF-1.4\n", "latin1") },
  { tag: "png", display: "sample.png", mediaType: "image/png", bytes: 2048, magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { tag: "txt", display: "sample.txt", mediaType: "text/plain", bytes: 512, magic: Buffer.from("prod03c2-e2e deterministic text payload\n", "latin1") },
  { tag: "bin", display: "sample.bin", mediaType: "application/octet-stream", bytes: 8192, magic: Buffer.from("prod03c2-e2e binary", "latin1") },
];

export function deterministicPayload(spec) {
  const buffer = Buffer.alloc(spec.bytes);
  spec.magic.copy(buffer, 0);
  let state = 0x9e3779b9;
  for (let i = spec.magic.length; i < buffer.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    buffer[i] = state & 0xff;
  }
  return buffer;
}

export function md5Base64(buffer) {
  return createHash("md5").update(buffer).digest("base64");
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function plan() {
  for (const spec of PAYLOAD_SPECS) {
    const payload = deterministicPayload(spec);
    console.log(`${spec.tag}: display=${spec.display} mediaType=${spec.mediaType} bytes=${payload.length} md5Base64=${md5Base64(payload)} sha256=${sha256(payload)}`);
  }
}

function promptVisible(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let buffer = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.includes("\n")) resolve(buffer.replace(/[\r\n]+$/, ""));
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (char) => {
      const code = char.charCodeAt(0);
      if (code === 3) {
        process.stdout.write("\n");
        stdin.setRawMode(false);
        process.exit(130);
      } else if (code === 13 || code === 10) {
        process.stdout.write("\n");
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        resolve(input);
      } else if (code === 8 || code === 127) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

function cookieValue(setCookie) {
  return setCookie?.split(";")[0]?.trim() ?? "";
}

// Request semantics split (mirrors frontend/src/api.ts):
//   json present  -> Content-Type: application/json + serialized body
//   json absent   -> bodyless action: NO Content-Type, NO body
export function requestInit(method, { cookie, json } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers.Origin = BASE_URL;
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    return { method, headers, body: JSON.stringify(json) };
  }
  return { method, headers };
}

// Whole-operation timeout: the AbortController is owned until the ENTIRE
// operation (fetch + response-body consumption) finishes or the timeout fires.
// No timer or fetch can leak; the abort reason is a bare timeout marker.
export async function withTimeout(operation, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// API dependency factory: fetch + full body read + parse inside one timeout.
// Network, abort, and body-read failures PROPAGATE (fail closed) — a timeout
// can never be converted into an apparent HTTP success. An empty body (204)
// is a valid empty JSON object; a non-empty body must be valid JSON.
export function createApiDep(baseUrl, fetchImpl = fetch, timeoutMs = TIMEOUTS.api) {
  return async (method, path, options) => withTimeout(async (signal) => {
    const init = requestInit(method, options);
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, signal });
    const text = await response.text();
    let body = {};
    if (text !== "") body = JSON.parse(text);
    return { status: response.status, body };
  }, timeoutMs);
}

// Direct OSS multipart POST: fetch + body drain inside one timeout. A drain
// failure — including a timeout abort — PROPAGATES and is never converted
// into an apparent 201 success.
export function createDirectPostDep(fetchImpl = fetch, timeoutMs = TIMEOUTS.directUpload) {
  return async (url, form) => withTimeout(async (signal) => {
    const response = await fetchImpl(url, { method: "POST", body: form, signal });
    await response.arrayBuffer();
    return { status: response.status };
  }, timeoutMs);
}

// Signed OSS GET: fetch + FULL arrayBuffer body read inside one timeout.
export function createSignedGetDep(fetchImpl = fetch, timeoutMs = TIMEOUTS.signedDownload) {
  return async (url) => withTimeout(async (signal) => {
    const response = await fetchImpl(url, { signal });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, bytes };
  }, timeoutMs);
}

// Logical-step guard: fails closed with ONLY the logical step name in the
// user-visible message. The original error is attached as `cause` for
// programmatic debugging and is never concatenated into the message.
async function guard(step, promise) {
  try {
    return await promise;
  } catch (cause) {
    throw new Error(`${step} failed`, { cause });
  }
}

// Pure verdict over every network step and semantic result.
export function computeVerdict(results, specCount) {
  const filesOk = results.files.length === specCount && results.files.every((fileResult) =>
    fileResult.reserve?.status === CONTRACT.uploadReserve &&
    Boolean(fileResult.reserve?.fileId) &&
    fileResult.reserve?.state === "pending_upload" &&
    fileResult.pendingList?.status === CONTRACT.pendingList && fileResult.pendingListed === true &&
    fileResult.renew?.status === CONTRACT.uploadRenew &&
    fileResult.renewedAuthorizationValid === true &&
    fileResult.renewedAuthUsed === true &&
    fileResult.upload === CONTRACT.directUpload &&
    fileResult.complete?.status === CONTRACT.uploadComplete &&
    fileResult.complete?.state === "active" &&
    fileResult.complete?.sizeOk === true && fileResult.complete?.checksumOk === true &&
    fileResult.entriesList?.status === CONTRACT.entriesList && fileResult.listed === true &&
    fileResult.downloadAuthorization?.status === CONTRACT.downloadAuthorization &&
    fileResult.signedDownload?.status === CONTRACT.signedDownload &&
    fileResult.downloadSha256 === fileResult.expectedSha256 && fileResult.downloadBytesOk === true &&
    fileResult.renamed?.status === CONTRACT.fileRename && fileResult.renamed?.name === true &&
    fileResult.moved?.status === CONTRACT.fileMove && fileResult.moved?.inSubfolder === true &&
    fileResult.recycled === CONTRACT.fileDelete &&
    fileResult.recycleList?.status === CONTRACT.recycleList && fileResult.recycledListed === true &&
    fileResult.restored?.status === CONTRACT.fileRestore && fileResult.restored?.active === true &&
    fileResult.moveOut?.status === CONTRACT.fileMove && fileResult.moveOut?.backInRoot === true);

  return results.login?.status === CONTRACT.login && results.login?.matches === true &&
    results.session === CONTRACT.session &&
    results.rootFolder?.status === CONTRACT.folderCreate && Boolean(results.rootFolder?.id) &&
    results.nestedFolder?.status === CONTRACT.folderCreate && Boolean(results.nestedFolder?.id) &&
    results.nestedFolder?.parentRelation === true &&
    filesOk &&
    results.folderLifecycle?.childEntriesList?.status === CONTRACT.entriesList &&
    results.folderLifecycle?.childEmpty === true &&
    results.folderLifecycle?.folderDelete === CONTRACT.folderDelete &&
    results.folderLifecycle?.folderRecycleList?.status === CONTRACT.recycleList &&
    results.folderLifecycle?.folderRecycledListed === true &&
    results.folderLifecycle?.folderRestore?.status === CONTRACT.folderRestore &&
    results.folderLifecycle?.folderRestore?.active === true &&
    results.folderLifecycle?.folderRestore?.parentRelation === true &&
    results.logout === CONTRACT.logout;
}

// The runtime's nested-folder creation body: a REAL child of the root folder.
export function nestedFolderCreateBody(folderName, rootFolderId) {
  return { name: `${folderName}-sub`, parentId: rootFolderId };
}

// File-result shell, registered BEFORE any production mutation so a partial
// failure still leaves identifiable non-secret evidence in the results.
export function createFileResult(spec) {
  const payload = deterministicPayload(spec);
  return {
    tag: spec.tag,
    expectedMd5: md5Base64(payload),
    expectedSha256: sha256(payload),
    reserve: null, pendingList: null, pendingListed: null,
    renew: null, renewedAuthorizationValid: null, renewedAuthUsed: null,
    upload: null, complete: null, completeError: null,
    entriesList: null, listed: null, downloadAuthorization: null, signedDownload: null,
    downloadSha256: null, downloadBytesOk: null, renamed: null, moved: null,
    recycled: null, recycleList: null, recycledListed: null, restored: null, moveOut: null,
  };
}

// One-file workflow. Fail-fast: every gate is validated immediately. Mutates
// the pre-registered fileResult in place so partial evidence survives failures.
export async function executeFileWorkflow(spec, ctx, deps, fileResult) {
  const payload = deterministicPayload(spec);
  const displayName = `${ctx.folderName}-${spec.display}`;

  const reserveResponse = await guard(`reserve ${spec.tag}`, deps.api("POST", "/api/drive/uploads", {
    cookie: ctx.cookie,
    json: {
      folderId: ctx.rootFolderId, displayName, mediaType: spec.mediaType, sizeBytes: payload.length,
      checksum: { algorithm: "md5", value: fileResult.expectedMd5 },
    },
  }));
  const reserveBody = reserveResponse.body ?? {};
  const fileId = reserveBody.file?.id;
  fileResult.reserve = { status: reserveResponse.status, fileId, state: reserveBody.file?.state };
  if (reserveResponse.status !== CONTRACT.uploadReserve || !fileId || reserveBody.file?.state !== "pending_upload" || reserveBody.upload?.method !== "POST") {
    throw new Error(`upload reservation failed for ${spec.tag}`);
  }

  const pendingResponse = await guard(`pending list ${spec.tag}`, deps.api("GET", `/api/drive/uploads?folderId=${encodeURIComponent(ctx.rootFolderId)}`, { cookie: ctx.cookie }));
  const pendingBody = pendingResponse.body ?? {};
  fileResult.pendingList = { status: pendingResponse.status };
  fileResult.pendingListed = (pendingBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "pending_upload");
  if (pendingResponse.status !== CONTRACT.pendingList || fileResult.pendingListed !== true) {
    throw new Error(`pending listing failed for ${spec.tag}`);
  }

  // Bodyless renewal: POST, NO Content-Type, NO body.
  const renewResponse = await guard(`renew ${spec.tag}`, deps.api("POST", `/api/drive/uploads/${encodeURIComponent(fileId)}/authorization`, { cookie: ctx.cookie }));
  const renewBody = renewResponse.body ?? {};
  const renewedUpload = renewBody.upload;
  fileResult.renew = {
    status: renewResponse.status,
    method: renewedUpload?.method ?? null,
    urlNonEmpty: typeof renewedUpload?.url === "string" && renewedUpload.url.length > 0,
    fieldsObject: renewedUpload?.fields !== null && typeof renewedUpload?.fields === "object",
  };
  fileResult.renewedAuthorizationValid = renewResponse.status === CONTRACT.uploadRenew &&
    renewedUpload?.method === "POST" &&
    typeof renewedUpload?.url === "string" && renewedUpload.url.length > 0 &&
    renewedUpload?.fields !== null && typeof renewedUpload?.fields === "object";
  if (!fileResult.renewedAuthorizationValid) {
    throw new Error(`upload renewal failed for ${spec.tag}`);
  }

  // The RENEWED authorization is consumed here — the only authorization object
  // ever passed to the direct OSS POST in this workflow.
  const form = new FormData();
  for (const [name, value] of Object.entries(renewedUpload.fields)) form.append(name, value);
  form.append("file", new Blob([payload], { type: spec.mediaType }), spec.display);
  const uploadResponse = await guard(`direct upload ${spec.tag}`, deps.directPost(renewedUpload.url, form));
  fileResult.renewedAuthUsed = true;
  fileResult.upload = uploadResponse.status;
  if (uploadResponse.status !== CONTRACT.directUpload) {
    throw new Error(`direct upload failed for ${spec.tag}`);
  }

  const completeResponse = await guard(`complete ${spec.tag}`, deps.api("POST", `/api/drive/uploads/${encodeURIComponent(fileId)}/complete`, { cookie: ctx.cookie }));
  const completeBody = completeResponse.body ?? {};
  fileResult.complete = {
    status: completeResponse.status,
    sizeOk: completeBody.file?.sizeBytes === payload.length,
    checksumOk: completeBody.file?.checksum === fileResult.expectedMd5,
    state: completeBody.file?.state,
  };
  if (completeResponse.status !== CONTRACT.uploadComplete || completeBody.file?.state !== "active" || !fileResult.complete.sizeOk || !fileResult.complete.checksumOk) {
    fileResult.completeError = { status: completeResponse.status, code: completeBody.error ?? null };
    console.log(`complete_failed fileId=${fileId} status=${completeResponse.status} error=${completeBody.error ?? "none"}`);
    throw new Error(`upload completion failed for ${spec.tag}`);
  }

  const entriesResponse = await guard(`entries ${spec.tag}`, deps.api("GET", `/api/drive/entries?folderId=${encodeURIComponent(ctx.rootFolderId)}`, { cookie: ctx.cookie }));
  const entriesBody = entriesResponse.body ?? {};
  fileResult.entriesList = { status: entriesResponse.status };
  fileResult.listed = (entriesBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "active");
  if (entriesResponse.status !== CONTRACT.entriesList || fileResult.listed !== true) {
    throw new Error(`active listing failed for ${spec.tag}`);
  }

  const downloadResponse = await guard(`download authorization ${spec.tag}`, deps.api("GET", `/api/drive/files/${encodeURIComponent(fileId)}/download?disposition=attachment`, { cookie: ctx.cookie }));
  const downloadBody = downloadResponse.body ?? {};
  fileResult.downloadAuthorization = { status: downloadResponse.status };
  if (downloadResponse.status !== CONTRACT.downloadAuthorization || typeof downloadBody.download?.url !== "string") {
    throw new Error(`download authorization failed for ${spec.tag}`);
  }

  const signedResponse = await guard(`signed download ${spec.tag}`, deps.signedGet(downloadBody.download.url));
  fileResult.signedDownload = { status: signedResponse.status };
  fileResult.downloadSha256 = sha256(signedResponse.bytes);
  fileResult.downloadBytesOk = signedResponse.bytes.length === payload.length;
  if (signedResponse.status !== CONTRACT.signedDownload || fileResult.downloadSha256 !== fileResult.expectedSha256 || fileResult.downloadBytesOk !== true) {
    throw new Error(`signed download verification failed for ${spec.tag}`);
  }

  const renameResponse = await guard(`rename ${spec.tag}`, deps.api("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
    cookie: ctx.cookie, json: { displayName: `${displayName}-renamed` },
  }));
  const renameBody = renameResponse.body ?? {};
  fileResult.renamed = { status: renameResponse.status, name: renameBody.file?.displayName === `${displayName}-renamed` };
  if (renameResponse.status !== CONTRACT.fileRename || fileResult.renamed.name !== true) {
    throw new Error(`rename failed for ${spec.tag}`);
  }

  const moveResponse = await guard(`move ${spec.tag}`, deps.api("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
    cookie: ctx.cookie, json: { folderId: ctx.nestedFolderId },
  }));
  const moveBody = moveResponse.body ?? {};
  fileResult.moved = { status: moveResponse.status, inSubfolder: moveBody.file?.folderId === ctx.nestedFolderId };
  if (moveResponse.status !== CONTRACT.fileMove || fileResult.moved.inSubfolder !== true) {
    throw new Error(`move into nested folder failed for ${spec.tag}`);
  }

  const deleteResponse = await guard(`recycle ${spec.tag}`, deps.api("DELETE", `/api/drive/files/${encodeURIComponent(fileId)}`, { cookie: ctx.cookie }));
  fileResult.recycled = deleteResponse.status;
  if (deleteResponse.status !== CONTRACT.fileDelete) {
    throw new Error(`recycle failed for ${spec.tag}`);
  }

  const recycleResponse = await guard(`recycle list ${spec.tag}`, deps.api("GET", "/api/drive/recycle", { cookie: ctx.cookie }));
  const recycleBody = recycleResponse.body ?? {};
  fileResult.recycleList = { status: recycleResponse.status };
  fileResult.recycledListed = (recycleBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "deleted");
  if (recycleResponse.status !== CONTRACT.recycleList || fileResult.recycledListed !== true) {
    throw new Error(`recycle listing failed for ${spec.tag}`);
  }

  const restoreResponse = await guard(`restore ${spec.tag}`, deps.api("POST", `/api/drive/files/${encodeURIComponent(fileId)}/restore`, { cookie: ctx.cookie }));
  const restoreBody = restoreResponse.body ?? {};
  fileResult.restored = { status: restoreResponse.status, active: restoreBody.file?.state === "active" };
  if (restoreResponse.status !== CONTRACT.fileRestore || fileResult.restored.active !== true) {
    throw new Error(`restore failed for ${spec.tag}`);
  }

  const moveOutResponse = await guard(`move out ${spec.tag}`, deps.api("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
    cookie: ctx.cookie, json: { folderId: ctx.rootFolderId },
  }));
  const moveOutBody = moveOutResponse.body ?? {};
  fileResult.moveOut = { status: moveOutResponse.status, backInRoot: moveOutBody.file?.folderId === ctx.rootFolderId };
  if (moveOutResponse.status !== CONTRACT.fileMove || fileResult.moveOut.backInRoot !== true) {
    throw new Error(`move-out failed for ${spec.tag}`);
  }

  return fileResult;
}

// Convenience wrapper used by tests: creates and executes a full file workflow.
export async function runOneFile(spec, ctx, deps) {
  const fileResult = createFileResult(spec);
  return executeFileWorkflow(spec, ctx, deps, fileResult);
}

// Folder lifecycle: the real nested child folder must be empty, then soft-
// deleted, verified in the recycle list, and restored (bodyless POST) with
// its parent relationship intact. Never permanently deleted.
export async function runFolderLifecycle(ctx, deps) {
  const result = {
    childEntriesList: { status: null }, childEmpty: null,
    folderDelete: null, folderRecycleList: { status: null }, folderRecycledListed: null,
    folderRestore: { status: null, active: null, parentRelation: null },
  };

  const entriesResponse = await guard("child-empty check", deps.api("GET", `/api/drive/entries?folderId=${encodeURIComponent(ctx.nestedFolderId)}`, { cookie: ctx.cookie }));
  const entriesBody = entriesResponse.body ?? {};
  result.childEntriesList = { status: entriesResponse.status };
  result.childEmpty = Array.isArray(entriesBody.files) && entriesBody.files.length === 0;
  if (entriesResponse.status !== CONTRACT.entriesList || result.childEmpty !== true) {
    throw new Error("nested folder is not empty before folder deletion");
  }

  const deleteResponse = await guard("folder delete", deps.api("DELETE", `/api/drive/folders/${encodeURIComponent(ctx.nestedFolderId)}`, { cookie: ctx.cookie }));
  result.folderDelete = deleteResponse.status;
  if (deleteResponse.status !== CONTRACT.folderDelete) {
    throw new Error("folder soft delete failed");
  }

  const recycleResponse = await guard("folder recycle check", deps.api("GET", "/api/drive/recycle", { cookie: ctx.cookie }));
  const recycleBody = recycleResponse.body ?? {};
  result.folderRecycleList = { status: recycleResponse.status };
  result.folderRecycledListed = (recycleBody.folders ?? []).some((entry) => entry.id === ctx.nestedFolderId && entry.state === "deleted");
  if (recycleResponse.status !== CONTRACT.recycleList || result.folderRecycledListed !== true) {
    throw new Error("deleted folder missing from recycle");
  }

  const restoreResponse = await guard("folder restore", deps.api("POST", `/api/drive/folders/${encodeURIComponent(ctx.nestedFolderId)}/restore`, { cookie: ctx.cookie }));
  const restoreBody = restoreResponse.body ?? {};
  result.folderRestore = {
    status: restoreResponse.status,
    active: restoreBody.folder?.state === "active",
    parentRelation: restoreBody.folder?.parentId === ctx.rootFolderId,
  };
  if (restoreResponse.status !== CONTRACT.folderRestore || result.folderRestore.active !== true || result.folderRestore.parentRelation !== true) {
    throw new Error("folder restore failed");
  }

  return result;
}

async function run() {
  const loginName = await promptVisible("AcademicCloud login name: ");
  const password = await promptSecret("AcademicCloud password (hidden): ");
  const runId = randomBytes(6).toString("hex");
  const folderName = `prod03c2-e2e-${runId}`;
  const results = {
    login: null, session: null, rootFolder: null, nestedFolder: null,
    files: [], folderLifecycle: null, logout: null,
  };
  let cookie = "";

  const deps = {
    api: createApiDep(BASE_URL),
    directPost: createDirectPostDep(),
    signedGet: createSignedGetDep(),
  };

  try {
    // Header-aware login: the session cookie comes from the raw login response.
    // Strict body read inside the timeout: abort/body-read failures propagate
    // (fail closed) instead of being converted into an empty success body.
    const loginRaw = await withTimeout(async (signal) => {
      const init = requestInit("POST", { json: { loginName, password } });
      const response = await fetch(`${BASE_URL}/api/auth/login`, { ...init, signal });
      const text = await response.text();
      const body = text === "" ? {} : JSON.parse(text);
      return { status: response.status, setCookie: response.headers.get("set-cookie"), body };
    }, TIMEOUTS.api).catch((cause) => {
      throw new Error("login failed", { cause });
    });
    cookie = cookieValue(loginRaw.setCookie);
    results.login = { status: loginRaw.status, matches: loginRaw.body?.account?.loginName === loginName };
    if (results.login.status !== CONTRACT.login || results.login.matches !== true || !cookie) throw new Error("login failed");

    const sessionResponse = await guard("session", deps.api("GET", "/api/auth/session", { cookie }));
    results.session = sessionResponse.status;
    if (results.session !== CONTRACT.session) throw new Error("session check failed");

    const rootResponse = await guard("root folder", deps.api("POST", "/api/drive/folders", { cookie, json: { name: folderName, parentId: null } }));
    const rootBody = rootResponse.body ?? {};
    const rootFolderId = rootBody.folder?.id;
    results.rootFolder = { status: rootResponse.status, id: rootFolderId };
    if (rootResponse.status !== CONTRACT.folderCreate || !rootFolderId) throw new Error("root folder creation failed");

    // REAL nested child: parentId is the root folder ID, never null.
    const nestedResponse = await guard("nested folder", deps.api("POST", "/api/drive/folders", { cookie, json: nestedFolderCreateBody(folderName, rootFolderId) }));
    const nestedBody = nestedResponse.body ?? {};
    const nestedFolderId = nestedBody.folder?.id;
    results.nestedFolder = {
      status: nestedResponse.status,
      id: nestedFolderId,
      parentRelation: nestedBody.folder?.parentId === rootFolderId,
    };
    if (nestedResponse.status !== CONTRACT.folderCreate || !nestedFolderId || results.nestedFolder.parentRelation !== true) {
      throw new Error("nested folder creation failed");
    }

    const ctx = { cookie, rootFolderId, nestedFolderId, folderName };
    for (const spec of PAYLOAD_SPECS) {
      // Register the file result BEFORE any production mutation so a partial
      // failure still leaves identifiable evidence.
      const fileResult = createFileResult(spec);
      results.files.push(fileResult);
      await executeFileWorkflow(spec, ctx, deps, fileResult);
    }

    results.folderLifecycle = await runFolderLifecycle(ctx, deps);
  } finally {
    if (cookie) {
      try {
        results.logout = (await deps.api("POST", "/api/auth/logout", { cookie })).status;
      } catch {
        results.logout = "logout_error";
      }
    }
    console.log(`runId=${runId}`);
    console.log(`login_status=${results.login?.status ?? "n/a"} login_loginName_matches=${results.login?.matches ?? false}`);
    console.log(`session_status=${results.session ?? "n/a"}`);
    console.log(`rootFolder_status=${results.rootFolder?.status ?? "n/a"} rootFolderId=${results.rootFolder?.id ?? "n/a"}`);
    console.log(`nestedFolder_status=${results.nestedFolder?.status ?? "n/a"} nestedFolderId=${results.nestedFolder?.id ?? "n/a"} parentRelation=${results.nestedFolder?.parentRelation ?? false}`);
    for (const fileResult of results.files) {
      console.log([
        `file_${fileResult.tag}:`,
        `reserve=${fileResult.reserve?.status ?? "n/a"}`,
        `fileId=${fileResult.reserve?.fileId ?? "n/a"}`,
        `pendingList=${fileResult.pendingList?.status ?? "n/a"}`,
        `pendingListed=${fileResult.pendingListed ?? false}`,
        `renew=${fileResult.renew?.status ?? "n/a"}`,
        `renewedAuthorizationValid=${fileResult.renewedAuthorizationValid ?? false}`,
        `renewedAuthUsed=${fileResult.renewedAuthUsed ?? false}`,
        `directUpload=${fileResult.upload ?? "n/a"}`,
        `complete=${fileResult.complete?.status ?? "n/a"}`,
        `sizeOk=${fileResult.complete?.sizeOk ?? false}`,
        `checksumOk=${fileResult.complete?.checksumOk ?? false}`,
        `entriesList=${fileResult.entriesList?.status ?? "n/a"}`,
        `listed=${fileResult.listed ?? false}`,
        `downloadAuthorization=${fileResult.downloadAuthorization?.status ?? "n/a"}`,
        `signedDownload=${fileResult.signedDownload?.status ?? "n/a"}`,
        `downloadSha256Match=${fileResult.downloadSha256 === fileResult.expectedSha256}`,
        `downloadBytesOk=${fileResult.downloadBytesOk ?? false}`,
        `rename=${fileResult.renamed?.status ?? "n/a"}`,
        `renamed=${fileResult.renamed?.name ?? false}`,
        `move=${fileResult.moved?.status ?? "n/a"}`,
        `moved=${fileResult.moved?.inSubfolder ?? false}`,
        `recycled=${fileResult.recycled ?? "n/a"}`,
        `recycleList=${fileResult.recycleList?.status ?? "n/a"}`,
        `recycledListed=${fileResult.recycledListed ?? false}`,
        `restore=${fileResult.restored?.status ?? "n/a"}`,
        `restored=${fileResult.restored?.active ?? false}`,
        `moveOut=${fileResult.moveOut?.status ?? "n/a"}`,
        `backInRoot=${fileResult.moveOut?.backInRoot ?? false}`,
      ].join(" "));
    }
    console.log(`folderLifecycle: childEntriesList=${results.folderLifecycle?.childEntriesList?.status ?? "n/a"} childEmpty=${results.folderLifecycle?.childEmpty ?? false} folderDelete=${results.folderLifecycle?.folderDelete ?? "n/a"} folderRecycleList=${results.folderLifecycle?.folderRecycleList?.status ?? "n/a"} folderRecycledListed=${results.folderLifecycle?.folderRecycledListed ?? false} folderRestore=${results.folderLifecycle?.folderRestore?.status ?? "n/a"} restoredActive=${results.folderLifecycle?.folderRestore?.active ?? false} restoredParent=${results.folderLifecycle?.folderRestore?.parentRelation ?? false}`);
    console.log(`logout_status=${results.logout ?? "n/a"}`);
    console.log(`VERDICT=${computeVerdict(results, PAYLOAD_SPECS.length)}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain && PLAN_ONLY) {
  plan();
} else if (isMain) {
  run().catch((error) => {
    console.error(`e2e_error=${error.message}`);
    process.exitCode = 1;
  });
}
