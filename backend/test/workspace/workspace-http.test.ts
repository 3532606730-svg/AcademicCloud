import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Writable } from "node:stream";
import { AuthService } from "../../src/auth/auth-service.js";
import { createApp } from "../../src/platform/app.js";
import { fixture, OWNER, MEMBER, OTHER, NOW } from "./helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
async function httpFixture(context: TestContext) {
  const f = fixture(context);
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) { logs.push(chunk.toString()); callback(); } });
  const app = await createApp({ logger: { level: "info", stream }, auth: {
    service: new AuthService({ persistence: f.persistence, now: () => NOW, passwordHasher: {
      hash: async (password) => `test:${password}`, verify: async (hash, password) => hash === `test:${password}`,
    } }), appOrigin: ORIGIN, environment: "test",
  }, workspace: { service: f.workspace } });
  context.after(() => app.close());
  const cookies: Record<string, string> = {};
  for (const actor of [OWNER, MEMBER, OTHER]) {
    const response = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: ORIGIN }, payload: {
      loginName: actor.loginName, password: "workspace-password",
    } });
    assert.equal(response.statusCode, 200);
    const value = response.headers["set-cookie"]!;
    cookies[actor.id] = (Array.isArray(value) ? value[0]! : value).split(";", 1)[0]!;
  }
  const request = (actor: string, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: Record<string, unknown>) => app.inject({
    method, url, headers: { origin: ORIGIN, cookie: cookies[actor]! }, ...(payload === undefined ? {} : { payload }),
  });
  return { ...f, app, request, cookies, logs };
}

test("normal authenticated workspace HTTP create/edit/restore and export keep every account isolated", async (context) => {
  const f = await httpFixture(context);
  const { source } = f.sharedFile();
  let response = await f.request(MEMBER.id, "GET", `/api/workspace/resources/${source.resourceId}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().resource.sourceId, source.sourceId);
  response = await f.request(MEMBER.id, "POST", "/api/workspace/collections", { name: "私有文献组" });
  assert.equal(response.statusCode, 200);
  const collection = response.json().collection;
  response = await f.request(MEMBER.id, "PUT", `/api/workspace/collections/${collection.id}/items/${source.resourceId}`, { included: true, revision: collection.revision });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().collection.revision, 2);
  assert.equal(response.json().collection.itemCount, 1);
  response = await f.request(MEMBER.id, "PUT", `/api/workspace/resources/${source.resourceId}/reading`, { status: "reading", important: true, toCite: true, revision: 0 });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().reading.revision, 1);
  response = await f.request(MEMBER.id, "POST", "/api/workspace/notes", { resourceId: source.resourceId, sourceId: source.sourceId, physicalPage: 7, locator: "頁三", body: "私有笔记 HTTP_SENTINEL" });
  assert.equal(response.statusCode, 200);
  const note = response.json().note;
  const ownNote = await f.request(MEMBER.id, "GET", `/api/workspace/notes/${note.id}`);
  assert.equal(ownNote.statusCode, 200);
  assert.deepEqual(ownNote.json().note, note);
  assert.equal(ownNote.json().resource.sourceId, source.sourceId);
  for (const actor of [OWNER, OTHER]) {
    for (const url of ["/api/workspace/notes", `/api/workspace/notes?resourceId=${source.resourceId}`, "/api/workspace/reading", "/api/workspace/collections", "/api/workspace/export"]) {
      const isolated = await f.request(actor.id, "GET", url);
      assert.equal(isolated.statusCode, 200);
      assert.doesNotMatch(isolated.body, /HTTP_SENTINEL|私有文献组|research-000/);
    }
    const foreign = await f.request(actor.id, "GET", `/api/workspace/collections/${collection.id}/items`);
    const missing = await f.request(actor.id, "GET", "/api/workspace/collections/missing-id/items");
    assert.equal(foreign.statusCode, 404);
    assert.deepEqual(foreign.json(), missing.json());
    const privateNote = await f.request(actor.id, "GET", `/api/workspace/notes/${note.id}`);
    assert.equal(privateNote.statusCode, 404);
    assert.deepEqual(privateNote.json(), (await f.request(actor.id, "GET", "/api/workspace/notes/unknown-note")).json());
    assert.equal((await f.request(actor.id, "PATCH", `/api/workspace/notes/${note.id}`, { body: "stolen", locator: null, revision: 1, deleted: true })).statusCode, 404);
    assert.equal((await f.request(actor.id, "PATCH", `/api/workspace/collections/${collection.id}`, { name: "stolen", revision: 1, archived: true })).statusCode, 404);
  }
  response = await f.request(MEMBER.id, "PATCH", `/api/workspace/notes/${note.id}`, { body: "私有修改 HTTP_SENTINEL", locator: null, revision: 1, deleted: true });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().note.revision, 2);
  assert.equal((await f.request(MEMBER.id, "GET", "/api/workspace/notes?deleted=false")).json().items.length, 0);
  assert.equal((await f.request(MEMBER.id, "GET", "/api/workspace/notes?deleted=true")).json().items.length, 1);
  assert.equal((await f.request(MEMBER.id, "PATCH", `/api/workspace/notes/${note.id}`, { body: "old draft", locator: null, revision: 1, deleted: false })).statusCode, 409);
  response = await f.request(MEMBER.id, "PATCH", `/api/workspace/notes/${note.id}`, { body: "恢复 HTTP_SENTINEL", locator: null, revision: 2, deleted: false });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().note.deletedAt, null);
  const exported = await f.request(MEMBER.id, "GET", "/api/workspace/export");
  assert.equal(exported.statusCode, 200);
  assert.match(String(exported.headers["content-type"]), /application\/x-ndjson/);
  assert.match(String(exported.headers["content-disposition"]), /attachment/);
  assert.equal(exported.headers["cache-control"], "no-store");
  const exportedLines = exported.body.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(exportedLines[0].type, "manifest");
  assert.equal(exportedLines.at(-1).type, "complete");
  assert.match(exported.body, /HTTP_SENTINEL/);
  assert.doesNotMatch(exported.body, /objectKey|objects\/|signed|storageProvider/);
  assert.doesNotMatch(f.logs.join(""), /HTTP_SENTINEL|私有文献组|私有修改/);
});

test("workspace HTTP rejects anonymous, forged ownership, rebinding, malformed paging and invalid origin", async (context) => {
  const f = await httpFixture(context);
  const source = f.file("http-private-source");
  for (const url of ["/api/workspace/notes", "/api/workspace/reading", "/api/workspace/collections", "/api/workspace/export", `/api/workspace/resources/${source.resourceId}`]) {
    assert.equal((await f.app.inject({ method: "GET", url })).statusCode, 401);
  }
  assert.equal((await f.request(OWNER.id, "GET", `/api/workspace/resources/${source.resourceId}`)).statusCode, 404);
  const input = { resourceId: source.resourceId, sourceId: source.sourceId, physicalPage: 1, locator: null, body: "private" };
  for (const patch of [{ accountId: OWNER.id }, { physicalPage: 0 }, { physicalPage: 1.5 }, { physicalPage: 1_000_001 }, { sourceId: "../file" }, { body: "\u0000secret" }]) {
    assert.equal((await f.request(MEMBER.id, "POST", "/api/workspace/notes", { ...input, ...patch })).statusCode, 400);
  }
  assert.equal((await f.app.inject({ method: "POST", url: "/api/workspace/notes", headers: { cookie: f.cookies[MEMBER.id]!, origin: "https://hostile.example" }, payload: input })).statusCode, 403);
  const note = (await f.request(MEMBER.id, "POST", "/api/workspace/notes", input)).json().note;
  for (const patch of [{ sourceId: "different" }, { resourceId: "different" }, { physicalPage: 2 }, { accountId: OWNER.id }, { revision: -1 }, { revision: Number.MAX_SAFE_INTEGER }]) {
    assert.equal((await f.request(MEMBER.id, "PATCH", `/api/workspace/notes/${note.id}`, { body: "draft", locator: null, revision: 1, deleted: false, ...patch })).statusCode, 400);
  }
  for (const url of ["/api/workspace/notes?limit=101", "/api/workspace/notes?limit=0", "/api/workspace/notes?beforeId=../file", "/api/workspace/notes?accountId=workspace-owner", "/api/workspace/reading?limit=1.5"]) {
    assert.equal((await f.request(MEMBER.id, "GET", url)).statusCode, 400);
  }
  f.persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW);
  assert.equal((await f.request(MEMBER.id, "GET", "/api/workspace/export")).statusCode, 401);
  assert.equal((await f.request(MEMBER.id, "GET", "/api/workspace/notes")).statusCode, 401);
});

test("membership HTTP requires collection revision, returns current collection and rejects stale no-ops", async (context) => {
  const f = await httpFixture(context);
  const source = f.file("membership-http-source");
  const created = await f.request(MEMBER.id, "POST", "/api/workspace/collections", { name: "Membership HTTP" });
  const collection = created.json().collection;
  const url = `/api/workspace/collections/${collection.id}/items/${source.resourceId}`;
  assert.equal((await f.request(MEMBER.id, "PUT", url, { included: true })).statusCode, 400);
  assert.equal((await f.request(MEMBER.id, "PUT", url, { included: true, revision: -1 })).statusCode, 400);
  const added = await f.request(MEMBER.id, "PUT", url, { included: true, revision: collection.revision });
  assert.equal(added.statusCode, 200);
  assert.equal(added.json().collection.revision, 2);
  assert.equal(added.json().collection.itemCount, 1);
  const noOp = await f.request(MEMBER.id, "PUT", url, { included: true, revision: 2 });
  assert.equal(noOp.statusCode, 200);
  assert.deepEqual(noOp.json(), added.json());
  for (const included of [true, false]) {
    const stale = await f.request(MEMBER.id, "PUT", url, { included, revision: 1 });
    assert.equal(stale.statusCode, 409);
    assert.deepEqual(stale.json(), { error: "concurrent_change" });
  }
  for (const actor of [OWNER, OTHER]) {
    const foreign = await f.request(actor.id, "PUT", url, { included: false, revision: 2 });
    const missing = await f.request(actor.id, "PUT", `/api/workspace/collections/missing/items/${source.resourceId}`, { included: false, revision: 2 });
    assert.equal(foreign.statusCode, 404);
    assert.deepEqual(foreign.json(), missing.json());
  }
  const removed = await f.request(MEMBER.id, "PUT", url, { included: false, revision: 2 });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().collection.revision, 3);
  assert.equal(removed.json().collection.itemCount, 0);
});


test("reader routes authenticate, reject forged attachments, and preserve private CAS state", async (context) => {
  const f = await httpFixture(context); const { source } = f.sharedFile();
  const path = "/api/workspace/resources/" + source.resourceId + "/progress";
  assert.equal((await f.app.inject({ method: "GET", url: path })).statusCode, 401);
  assert.equal((await f.request(MEMBER.id, "PUT", path, { sourceId: source.sourceId, physicalPage: 5, revision: 0 })).statusCode, 200);
  assert.equal((await f.request(MEMBER.id, "PUT", path, { sourceId: source.sourceId, physicalPage: 6, revision: 0 })).statusCode, 409);
  assert.equal((await f.request(MEMBER.id, "PUT", path, { sourceId: source.sourceId, physicalPage: 6, revision: 1, accountId: OWNER.id })).statusCode, 400);
  assert.equal((await f.request(OWNER.id, "GET", path)).json().progress, null);
  const input = { ...source, physicalPage: 5, text: "PRIVATE_HIGHLIGHT_HTTP_SENTINEL", rects: [{ x: .1, y: .2, width: .3, height: .04 }], color: "yellow" };
  const { resourceId, sourceId, physicalPage, text, rects, color } = input;
  const clean = { resourceId, sourceId, physicalPage, text, rects, color };
  const response = await f.request(MEMBER.id, "POST", "/api/workspace/highlights", clean);
  assert.equal(response.statusCode, 200); const h = response.json().highlight;
  const highlightPath = "/api/workspace/highlights/" + h.id;
  assert.equal((await f.request(OWNER.id, "PATCH", highlightPath, { color: "green", revision: 1, deleted: true })).statusCode, 404);
  assert.equal((await f.request(MEMBER.id, "PATCH", highlightPath, { color: "green", revision: 1, deleted: true, sourceId: "other" })).statusCode, 400);
  assert.equal((await f.request(MEMBER.id, "PATCH", highlightPath, { color: "green", revision: 1, deleted: true })).statusCode, 200);
  assert.equal((await f.request(MEMBER.id, "PATCH", highlightPath, { color: "green", revision: 1, deleted: false })).statusCode, 409);
  for (const patch of [{ accountId: OWNER.id }, { rects: [{ x: .9, y: 0, width: .2, height: .2 }] }, { rects: Array(101).fill(rects[0]) }, { text: "x".repeat(10001) }]) {
    assert.equal((await f.request(MEMBER.id, "POST", "/api/workspace/highlights", { ...clean, ...patch })).statusCode, 400);
  }
  const query = "/api/workspace/highlights?resourceId=" + resourceId + "&sourceId=" + sourceId;
  assert.deepEqual((await f.request(OWNER.id, "GET", query)).json().items, []);
  assert.equal((await f.request(OTHER.id, "GET", query)).statusCode, 404);
  assert.equal((await f.request(MEMBER.id, "GET", query + "&deleted=true")).json().items.length, 1);
  assert.doesNotMatch((await f.request(OWNER.id, "GET", "/api/workspace/export")).body, /PRIVATE_HIGHLIGHT_HTTP_SENTINEL/);
  assert.doesNotMatch(f.logs.join(""), /PRIVATE_HIGHLIGHT_HTTP_SENTINEL/);
});
