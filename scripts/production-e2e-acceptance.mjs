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
// Never touches existing production material and NEVER permanently deletes:
// every object uses the unique prefix prod03c2-e2e-<runId>- and stays ACTIVE
// (restored) at the end. The password never enters argv, history, files,
// logs, or chat. Every external request has an explicit bounded timeout.

import { createHash, randomBytes } from "node:crypto";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const BASE_URL = process.env.ACCEPTANCE_BASE_URL ?? "https://cloud.ajtlab.top";
const PLAN_ONLY = process.argv.includes("--plan");

// Backend drive contract (backend/src/drive/http.ts) and auth contract
// (backend/src/auth/http.ts). Pinned by scripts/production-e2e-acceptance.test.mjs.
// downloadAuthorization is the AcademicCloud API endpoint; signedDownload is the
// separate signed OSS object GET — two distinct network steps.
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

// Explicit bounded network timeouts. Payloads are tiny, so these are generous;
// any timeout fails closed and identifies only the logical step.
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

// The production checksum contract is Base64 MD5 (backend schema
// ^[A-Za-z0-9+/]{22}==$); frontend/src/md5.ts converts the 16-byte hex
// digest to Base64 before submission. Node's digest("base64") is the same
// conversion over the same 16 bytes.
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

// Bounded fetch: an AbortController timer aborts the request at timeoutMs and
// is always cleared afterwards, so no fetch or timer can leak. The fetch
// implementation is injectable for deterministic timeout tests.
export function fetchWithTimeout(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  return fetchImpl(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Logical-step guard: wraps a network promise so any rejection fails closed
// with only the step name in the message (no URLs, cookies, or credentials).
async function guard(step, promise) {
  try {
    return await promise;
  } catch (cause) {
    throw new Error(`${step} failed: ${cause?.message ?? "unknown"}`);
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
    results.folderLifecycle?.childEmpty === true &&
    results.folderLifecycle?.folderDelete === CONTRACT.folderDelete &&
    results.folderLifecycle?.folderRecycledListed === true &&
    results.folderLifecycle?.folderRestore?.status === CONTRACT.folderRestore &&
    results.folderLifecycle?.folderRestore?.active === true &&
    results.folderLifecycle?.folderRestore?.parentRelation === true &&
    results.logout === CONTRACT.logout;
}

// One-file workflow. Fail-fast: every gate is validated immediately; any
// failure throws with a logical step name before any later mutation runs.
// The RENEWED upload authorization is the ONLY authorization passed to the
// direct OSS POST (deps.directPost receives the renewed upload object).
export async function runOneFile(spec, ctx, deps) {
  const payload = deterministicPayload(spec);
  const displayName = `${ctx.folderName}-${spec.display}`;
  const fileResult = {
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

  const reserveResponse = await guard(`reserve ${spec.tag}`, deps.api("POST", "/api/drive/uploads", {
    cookie: ctx.cookie,
    json: {
      folderId: ctx.rootFolderId, displayName, mediaType: spec.mediaType, sizeBytes: payload.length,
      checksum: { algorithm: "md5", value: fileResult.expectedMd5 },
    },
  }));
  const reserveBody = await reserveResponse.json().catch(() => ({}));
  const fileId = reserveBody.file?.id;
  fileResult.reserve = { status: reserveResponse.status, fileId, state: reserveBody.file?.state };
  if (reserveResponse.status !== CONTRACT.uploadReserve || !fileId || reserveBody.file?.state !== "pending_upload" || reserveBody.upload?.method !== "POST") {
    throw new Error(`upload reservation failed for ${spec.tag}`);
  }

  const pendingResponse = await guard(`pending list ${spec.tag}`, deps.api("GET", `/api/drive/uploads?folderId=${encodeURIComponent(ctx.rootFolderId)}`, { cookie: ctx.cookie }));
  const pendingBody = await pendingResponse.json().catch(() => ({}));
  fileResult.pendingList = { status: pendingResponse.status };
  fileResult.pendingListed = (pendingBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "pending_upload");
  if (pendingResponse.status !== CONTRACT.pendingList || fileResult.pendingListed !== true) {
    throw new Error(`pending listing failed for ${spec.tag}`);
  }

  // Bodyless renewal: POST, NO Content-Type, NO body.
  const renewResponse = await guard(`renew ${spec.tag}`, deps.api("POST", `/api/drive/uploads/${encodeURIComponent(fileId)}/authorization`, { cookie: ctx.cookie }));
  const renewBody = await renewResponse.json().catch(() => ({}));
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
  let completeBody = {};
  try {
    completeBody = await completeResponse.json();
  } catch {}
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
  const entriesBody = await entriesResponse.json().catch(() => ({}));
  fileResult.entriesList = { status: entriesResponse.status };
  fileResult.listed = (entriesBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "active");
  if (entriesResponse.status !== CONTRACT.entriesList || fileResult.listed !== true) {
    throw new Error(`active listing failed for ${spec.tag}`);
  }

  const downloadResponse = await guard(`download authorization ${spec.tag}`, deps.api("GET", `/api/drive/files/${encodeURIComponent(fileId)}/download?disposition=attachment`, { cookie: ctx.cookie }));
  const downloadBody = await downloadResponse.json().catch(() => ({}));
  fileResult.downloadAuthorization = { status: downloadResponse.status };
  if (downloadResponse.status !== CONTRACT.downloadAuthorization || typeof downloadBody.download?.url !== "string") {
    throw new Error(`download authorization failed for ${spec.tag}`);
  }

  const signedResponse = await guard(`signed download ${spec.tag}`, deps.signedGet(downloadBody.download.url));
  const downloadedBytes = Buffer.from(await signedResponse.arrayBuffer());
  fileResult.signedDownload = { status: signedResponse.status };
  fileResult.downloadSha256 = sha256(downloadedBytes);
  fileResult.downloadBytesOk = downloadedBytes.length === payload.length;
  if (signedResponse.status !== CONTRACT.signedDownload || fileResult.downloadSha256 !== fileResult.expectedSha256 || fileResult.downloadBytesOk !== true) {
    throw new Error(`signed download verification failed for ${spec.tag}`);
  }

  const renameResponse = await guard(`rename ${spec.tag}`, deps.api("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
    cookie: ctx.cookie, json: { displayName: `${displayName}-renamed` },
  }));
  const renameBody = await renameResponse.json().catch(() => ({}));
  fileResult.renamed = { status: renameResponse.status, name: renameBody.file?.displayName === `${displayName}-renamed` };
  if (renameResponse.status !== CONTRACT.fileRename || fileResult.renamed.name !== true) {
    throw new Error(`rename failed for ${spec.tag}`);
  }

  const moveResponse = await guard(`move ${spec.tag}`, deps.api("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
    cookie: ctx.cookie, json: { folderId: ctx.nestedFolderId },
  }));
  const moveBody = await moveResponse.json().catch(() => ({}));
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
  const recycleBody = await recycleResponse.json().catch(() => ({}));
  fileResult.recycleList = { status: recycleResponse.status };
  fileResult.recycledListed = (recycleBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "deleted");
  if (recycleResponse.status !== CONTRACT.recycleList || fileResult.recycledListed !== true) {
    throw new Error(`recycle listing failed for ${spec.tag}`);
  }

  const restoreResponse = await guard(`restore ${spec.tag}`, deps.api("POST", `/api/drive/files/${encodeURIComponent(fileId)}/restore`, { cookie: ctx.cookie }));
  const restoreBody = await restoreResponse.json().catch(() => ({}));
  fileResult.restored = { status: restoreResponse.status, active: restoreBody.file?.state === "active" };
  if (restoreResponse.status !== CONTRACT.fileRestore || fileResult.restored.active !== true) {
    throw new Error(`restore failed for ${spec.tag}`);
  }

  // Move the restored file back to the root so the nested folder is empty
  // before the folder lifecycle below deletes it.
  const moveOutResponse = await guard(`move out ${spec.tag}`, deps.api("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
    cookie: ctx.cookie, json: { folderId: ctx.rootFolderId },
  }));
  const moveOutBody = await moveOutResponse.json().catch(() => ({}));
  fileResult.moveOut = { status: moveOutResponse.status, backInRoot: moveOutBody.file?.folderId === ctx.rootFolderId };
  if (moveOutResponse.status !== CONTRACT.fileMove || fileResult.moveOut.backInRoot !== true) {
    throw new Error(`move-out failed for ${spec.tag}`);
  }

  return fileResult;
}

// Folder lifecycle: the real nested child folder must be empty, then soft-
// deleted, verified in the recycle list, and restored (bodyless POST) with
// its parent relationship intact. Never permanently deleted.
export async function runFolderLifecycle(ctx, deps) {
  const result = {
    childEmpty: null, folderDelete: null, folderRecycledListed: null,
    folderRestore: { status: null, active: null, parentRelation: null },
  };

  const entriesResponse = await guard("child-empty check", deps.api("GET", `/api/drive/entries?folderId=${encodeURIComponent(ctx.nestedFolderId)}`, { cookie: ctx.cookie }));
  const entriesBody = await entriesResponse.json().catch(() => ({}));
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
  const recycleBody = await recycleResponse.json().catch(() => ({}));
  result.folderRecycledListed = (recycleBody.folders ?? []).some((entry) => entry.id === ctx.nestedFolderId && entry.state === "deleted");
  if (recycleResponse.status !== CONTRACT.recycleList || result.folderRecycledListed !== true) {
    throw new Error("deleted folder missing from recycle");
  }

  const restoreResponse = await guard("folder restore", deps.api("POST", `/api/drive/folders/${encodeURIComponent(ctx.nestedFolderId)}/restore`, { cookie: ctx.cookie }));
  const restoreBody = await restoreResponse.json().catch(() => ({}));
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
    api: (method, path, options) => fetchWithTimeout(`${BASE_URL}${path}`, requestInit(method, options), TIMEOUTS.api),
    directPost: (url, form) => fetchWithTimeout(url, { method: "POST", body: form }, TIMEOUTS.directUpload),
    signedGet: (url) => fetchWithTimeout(url, {}, TIMEOUTS.signedDownload),
  };

  try {
    const loginResponse = await guard("login", deps.api("POST", "/api/auth/login", { json: { loginName, password } }));
    const loginBody = await loginResponse.json().catch(() => ({}));
    cookie = cookieValue(loginResponse.headers.get("set-cookie"));
    results.login = { status: loginResponse.status, matches: loginBody.account?.loginName === loginName };
    if (results.login.status !== CONTRACT.login || results.login.matches !== true) throw new Error("login failed");

    const sessionResponse = await guard("session", deps.api("GET", "/api/auth/session", { cookie }));
    results.session = sessionResponse.status;
    if (results.session !== CONTRACT.session) throw new Error("session check failed");

    const rootResponse = await guard("root folder", deps.api("POST", "/api/drive/folders", { cookie, json: { name: folderName, parentId: null } }));
    const rootBody = await rootResponse.json().catch(() => ({}));
    const rootFolderId = rootBody.folder?.id;
    results.rootFolder = { status: rootResponse.status, id: rootFolderId };
    if (rootResponse.status !== CONTRACT.folderCreate || !rootFolderId) throw new Error("root folder creation failed");

    // REAL nested child: parentId is the root folder ID, never null.
    const nestedResponse = await guard("nested folder", deps.api("POST", "/api/drive/folders", { cookie, json: { name: `${folderName}-sub`, parentId: rootFolderId } }));
    const nestedBody = await nestedResponse.json().catch(() => ({}));
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
      results.files.push(await runOneFile(spec, ctx, deps));
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
    console.log(`folderLifecycle: childEmpty=${results.folderLifecycle?.childEmpty ?? false} folderDelete=${results.folderLifecycle?.folderDelete ?? "n/a"} folderRecycledListed=${results.folderLifecycle?.folderRecycledListed ?? false} folderRestore=${results.folderLifecycle?.folderRestore?.status ?? "n/a"} restoredActive=${results.folderLifecycle?.folderRestore?.active ?? false} restoredParent=${results.folderLifecycle?.folderRestore?.parentRelation ?? false}`);
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
