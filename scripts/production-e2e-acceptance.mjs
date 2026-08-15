#!/usr/bin/env node
// production-e2e-acceptance.mjs
//
// Live disposable-object E2E through the public HTTPS edge, mirroring
// frontend/src/api.ts, frontend/src/md5.ts, and frontend/src/direct-upload.ts
// semantics exactly, against the backend drive contract in
// backend/src/drive/http.ts.
//
//   --plan   print the deterministic pre-registration table (no network, no credentials)
//   (none)   full run: hidden credential entry, then for each of the four
//            deterministic disposable payloads:
//              create folder (201) -> reserve upload (201, Base64 MD5)
//              -> pending listing -> direct multipart POST to OSS (201)
//              -> complete/activate -> active listing
//              -> signed download + independent byte/hash verification
//              -> rename -> move -> recycle -> restore -> logout (204)
//
// Prints ONLY non-secret statuses, checksums, and opaque identifiers.
// Never touches existing production material and NEVER permanently deletes:
// every object uses the unique prefix prod03c2-e2e-<runId>- and stays ACTIVE
// (restored) at the end. The password never enters argv, history, files,
// logs, or chat.

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
  uploadReserve: 201,
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

async function request(method, path, options) {
  return fetch(`${BASE_URL}${path}`, requestInit(method, options));
}

// Pure verdict over the 17 network steps: every step's HTTP status is stored
// and asserted against its own CONTRACT member, with the semantic body checks
// as additional requirements.
export function computeVerdict(results, specCount) {
  return results.login?.status === CONTRACT.login && results.login?.matches === true &&
    results.session === CONTRACT.session &&
    results.folder?.status === CONTRACT.folderCreate &&
    results.subfolder?.status === CONTRACT.folderCreate &&
    results.files.length === specCount &&
    results.files.every((fileResult) =>
      fileResult.reserve?.status === CONTRACT.uploadReserve &&
      fileResult.pendingList?.status === CONTRACT.pendingList && fileResult.pendingListed === true &&
      fileResult.upload === CONTRACT.directUpload &&
      fileResult.complete?.status === CONTRACT.uploadComplete && fileResult.complete?.sizeOk === true &&
      fileResult.complete?.checksumOk === true &&
      fileResult.entriesList?.status === CONTRACT.entriesList && fileResult.listed === true &&
      fileResult.downloadAuthorization?.status === CONTRACT.downloadAuthorization &&
      fileResult.signedDownload?.status === CONTRACT.signedDownload &&
      fileResult.downloadSha256 === fileResult.expectedSha256 && fileResult.downloadBytesOk === true &&
      fileResult.renamed?.status === CONTRACT.fileRename && fileResult.renamed?.name === true &&
      fileResult.moved?.status === CONTRACT.fileMove && fileResult.moved?.inSubfolder === true &&
      fileResult.recycled === CONTRACT.fileDelete &&
      fileResult.recycleList?.status === CONTRACT.recycleList && fileResult.recycledListed === true &&
      fileResult.restored?.status === CONTRACT.fileRestore && fileResult.restored?.active === true) &&
    results.logout === CONTRACT.logout;
}

async function run() {
  const loginName = await promptVisible("AcademicCloud login name: ");
  const password = await promptSecret("AcademicCloud password (hidden): ");
  const runId = randomBytes(6).toString("hex");
  const folderName = `prod03c2-e2e-${runId}`;
  const results = { login: null, session: null, folder: null, subfolder: null, files: [], logout: null };
  let cookie = "";

  try {
    const loginResponse = await request("POST", "/api/auth/login", { json: { loginName, password } });
    const loginBody = await loginResponse.json().catch(() => ({}));
    cookie = cookieValue(loginResponse.headers.get("set-cookie"));
    results.login = { status: loginResponse.status, matches: loginBody.account?.loginName === loginName };
    if (results.login.status !== CONTRACT.login || !results.login.matches) throw new Error("login failed");

    const sessionResponse = await request("GET", "/api/auth/session", { cookie });
    results.session = sessionResponse.status;

    const folderResponse = await request("POST", "/api/drive/folders", { cookie, json: { name: folderName, parentId: null } });
    const folderBody = await folderResponse.json().catch(() => ({}));
    const folderId = folderBody.folder?.id;
    results.folder = { status: folderResponse.status, id: folderId };
    if (folderResponse.status !== CONTRACT.folderCreate || !folderId) throw new Error("folder creation failed");

    const subfolderResponse = await request("POST", "/api/drive/folders", { cookie, json: { name: `${folderName}-sub`, parentId: null } });
    const subfolderBody = await subfolderResponse.json().catch(() => ({}));
    const subfolderId = subfolderBody.folder?.id;
    results.subfolder = { status: subfolderResponse.status, id: subfolderId };
    if (subfolderResponse.status !== CONTRACT.folderCreate || !subfolderId) throw new Error("subfolder creation failed");

    for (const spec of PAYLOAD_SPECS) {
      const payload = deterministicPayload(spec);
      const displayName = `${folderName}-${spec.display}`;
      const fileResult = {
        tag: spec.tag,
        expectedMd5: md5Base64(payload),
        expectedSha256: sha256(payload),
        reserve: null, pendingList: null, pendingListed: null, upload: null, complete: null, completeError: null,
        entriesList: null, listed: null, downloadAuthorization: null, signedDownload: null,
        downloadSha256: null, downloadBytesOk: null, renamed: null, moved: null,
        recycled: null, recycleList: null, recycledListed: null, restored: null,
      };
      results.files.push(fileResult);

      const reserveResponse = await request("POST", "/api/drive/uploads", {
        cookie,
        json: {
          folderId, displayName, mediaType: spec.mediaType, sizeBytes: payload.length,
          checksum: { algorithm: "md5", value: fileResult.expectedMd5 },
        },
      });
      const reserveBody = await reserveResponse.json().catch(() => ({}));
      const fileId = reserveBody.file?.id;
      const upload = reserveBody.upload;
      fileResult.reserve = { status: reserveResponse.status, fileId, state: reserveBody.file?.state };
      if (reserveResponse.status !== CONTRACT.uploadReserve || !fileId || !upload || upload.method !== "POST") {
        throw new Error(`upload reservation failed for ${spec.tag}`);
      }

      const pendingResponse = await request("GET", `/api/drive/uploads?folderId=${encodeURIComponent(folderId)}`, { cookie });
      const pendingBody = await pendingResponse.json().catch(() => ({}));
      fileResult.pendingList = { status: pendingResponse.status };
      fileResult.pendingListed = (pendingBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "pending_upload");

      const form = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
      form.append("file", new Blob([payload], { type: spec.mediaType }), spec.display);
      const uploadResponse = await fetch(upload.url, { method: "POST", body: form });
      fileResult.upload = uploadResponse.status;
      if (uploadResponse.status !== CONTRACT.directUpload) throw new Error(`direct upload failed for ${spec.tag}`);

      const completeResponse = await request("POST", `/api/drive/uploads/${encodeURIComponent(fileId)}/complete`, { cookie });
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
      if (completeResponse.status !== CONTRACT.uploadComplete || completeBody.file?.state !== "active") {
        fileResult.completeError = { status: completeResponse.status, code: completeBody.error ?? null };
        console.log(`complete_failed fileId=${fileId} status=${completeResponse.status} error=${completeBody.error ?? "none"}`);
        throw new Error(`upload completion failed for ${spec.tag}`);
      }

      const entriesResponse = await request("GET", `/api/drive/entries?folderId=${encodeURIComponent(folderId)}`, { cookie });
      const entriesBody = await entriesResponse.json().catch(() => ({}));
      fileResult.entriesList = { status: entriesResponse.status };
      fileResult.listed = (entriesBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "active");

      const downloadResponse = await request("GET", `/api/drive/files/${encodeURIComponent(fileId)}/download?disposition=attachment`, { cookie });
      const downloadBody = await downloadResponse.json().catch(() => ({}));
      fileResult.downloadAuthorization = { status: downloadResponse.status };
      const signedUrl = downloadBody.download?.url;
      const downloadFetch = signedUrl ? await fetch(signedUrl) : null;
      const downloadedBytes = downloadFetch ? Buffer.from(await downloadFetch.arrayBuffer()) : Buffer.alloc(0);
      fileResult.signedDownload = { status: downloadFetch?.status ?? 0 };
      fileResult.downloadSha256 = sha256(downloadedBytes);
      fileResult.downloadBytesOk = downloadedBytes.length === payload.length;

      const renameResponse = await request("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
        cookie, json: { displayName: `${displayName}-renamed` },
      });
      const renameBody = await renameResponse.json().catch(() => ({}));
      fileResult.renamed = { status: renameResponse.status, name: renameBody.file?.displayName === `${displayName}-renamed` };

      const moveResponse = await request("PATCH", `/api/drive/files/${encodeURIComponent(fileId)}`, {
        cookie, json: { folderId: subfolderId },
      });
      const moveBody = await moveResponse.json().catch(() => ({}));
      fileResult.moved = { status: moveResponse.status, inSubfolder: moveBody.file?.folderId === subfolderId };

      const deleteResponse = await request("DELETE", `/api/drive/files/${encodeURIComponent(fileId)}`, { cookie });
      fileResult.recycled = deleteResponse.status;
      if (deleteResponse.status !== CONTRACT.fileDelete) throw new Error(`recycle failed for ${spec.tag}`);

      const recycleResponse = await request("GET", "/api/drive/recycle", { cookie });
      const recycleBody = await recycleResponse.json().catch(() => ({}));
      fileResult.recycleList = { status: recycleResponse.status };
      fileResult.recycledListed = (recycleBody.files ?? []).some((entry) => entry.id === fileId && entry.state === "deleted");

      const restoreResponse = await request("POST", `/api/drive/files/${encodeURIComponent(fileId)}/restore`, { cookie });
      const restoreBody = await restoreResponse.json().catch(() => ({}));
      fileResult.restored = { status: restoreResponse.status, active: restoreBody.file?.state === "active" };
    }
  } finally {
    if (cookie) {
      try {
        results.logout = (await request("POST", "/api/auth/logout", { cookie })).status;
      } catch {
        results.logout = "logout_error";
      }
    }
    console.log(`runId=${runId}`);
    console.log(`login_status=${results.login?.status ?? "n/a"} login_loginName_matches=${results.login?.matches ?? false}`);
    console.log(`session_status=${results.session ?? "n/a"}`);
    console.log(`folder_status=${results.folder?.status ?? "n/a"} folderId=${results.folder?.id ?? "n/a"}`);
    console.log(`subfolder_status=${results.subfolder?.status ?? "n/a"} subfolderId=${results.subfolder?.id ?? "n/a"}`);
    for (const fileResult of results.files) {
      console.log([
        `file_${fileResult.tag}:`,
        `reserve=${fileResult.reserve?.status ?? "n/a"}`,
        `fileId=${fileResult.reserve?.fileId ?? "n/a"}`,
        `pendingList=${fileResult.pendingList?.status ?? "n/a"}`,
        `pendingListed=${fileResult.pendingListed ?? false}`,
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
      ].join(" "));
    }
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
