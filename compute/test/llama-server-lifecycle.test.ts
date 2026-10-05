import assert from "node:assert/strict";
import childProcess, { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import { BibliographicIntelligenceError, LlamaServerBibliographicReasoner } from "../src/bibliographic-intelligence.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function controlledServer() {
  let kills = 0;
  const child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(), kill() { kills++; return true; },
  }) as unknown as ChildProcess;
  return { child, get kills() { return kills; },
    exit() { child.emit("exit", null, "SIGKILL"); },
    closed() { child.emit("close", null, "SIGKILL"); },
  };
}
function reasoner() {
  return new LlamaServerBibliographicReasoner({ executablePath: "/mock", modelPath: "/mock", gpuLayers: 999 });
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function install(t: TestContext, spawn: typeof childProcess.spawn, fetch: typeof globalThis.fetch) {
  t.mock.method(childProcess, "spawn", spawn);
  syncBuiltinESMExports();
  t.mock.method(globalThis, "fetch", fetch);
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

for (const trigger of ["http_non_ok", "request_failed", "inference_abort", "inference_timeout", "startup_abort", "spawn_error"] as const) {
  test(`llama ${trigger} retains its child until concurrent close observes process and stdio closure`, async (t) => {
    const fixture = controlledServer(), requested = deferred<void>();
    const controller = new AbortController();
    install(t, (() => fixture.child) as typeof childProcess.spawn, (async (url, init) => {
      const health = String(url).endsWith("/health");
      if (health && trigger !== "startup_abort" && trigger !== "spawn_error") return new Response("", { status: 200 });
      requested.resolve();
      if (trigger === "http_non_ok") return new Response("", { status: 503 });
      if (trigger === "request_failed") throw new Error("synthetic transport failure");
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("synthetic cancelled transport")), { once: true });
      });
    }) as typeof globalThis.fetch);
    if (trigger === "inference_timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
    const adapter = reasoner();
    const recognition = adapter.infer("synthetic bounded evidence", controller.signal);
    const rejected = assert.rejects(recognition, (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.code === (["inference_abort", "inference_timeout", "startup_abort"].includes(trigger) ? "reasoner_timeout" : "reasoner_unavailable"));
    await requested.promise;
    if (trigger === "inference_abort" || trigger === "startup_abort") controller.abort();
    else if (trigger === "inference_timeout") t.mock.timers.tick(420_000);
    else if (trigger === "spawn_error") { fixture.child.emit("error", new Error("synthetic spawn failure")); fixture.exit(); }
    await rejected;
    assert.equal(fixture.kills, 1);
    let releases = 0;
    const first = adapter.close().then(() => { releases++; });
    const second = adapter.close().then(() => { releases++; });
    await turn();
    assert.equal(releases, 0, "SIGKILL alone must not release native ownership");
    fixture.exit();
    await turn();
    assert.equal(releases, 0, "an exit event must not bypass pending stdio closure");
    fixture.closed();
    await Promise.all([first, second]);
    await adapter.close();
    assert.equal(releases, 2);
    assert.equal(fixture.kills, 1, "concurrent cleanup shares the same retiring child");
  });
}

test("llama restart waits for retiring closure and isolates late old-child events", async (t) => {
  const first = controlledServer(), second = controlledServer();
  const secondRequested = deferred<void>(), reply = deferred<Response>();
  let starts = 0, completions = 0;
  install(t, (() => (++starts === 1 ? first : second).child) as typeof childProcess.spawn,
    (async (url) => {
      if (String(url).endsWith("/health")) return new Response("", { status: 200 });
      completions++;
      if (completions === 1) return new Response("", { status: 503 });
      secondRequested.resolve();
      return reply.promise;
    }) as typeof globalThis.fetch);
  const adapter = reasoner();
  await assert.rejects(adapter.infer("synthetic first evidence"), (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "http_non_ok");
  const restarted = adapter.infer("synthetic replacement evidence");
  const cleanup = adapter.close();
  const rejected = assert.rejects(restarted, (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "http_non_ok");
  await turn();
  assert.equal(starts, 1);
  first.exit();
  await turn();
  assert.equal(starts, 1);
  first.closed();
  await cleanup;
  await secondRequested.promise;
  assert.equal(starts, 2);
  first.child.emit("error", new Error("late retired-child error"));
  first.child.stderr!.emit("data", Buffer.from("late retired-child diagnostic"));
  assert.equal(second.kills, 0);
  reply.resolve(new Response("", { status: 503 }));
  await rejected;
  const closing = adapter.close();
  second.exit(); second.closed();
  await closing;
  assert.equal(second.kills, 1);
});

test("llama active-inference close waits for native closure without leaving the inference pending", async (t) => {
  const fixture = controlledServer(), requested = deferred<void>();
  install(t, (() => fixture.child) as typeof childProcess.spawn, (async (url) => {
    if (String(url).endsWith("/health")) return new Response("", { status: 200 });
    requested.resolve(); return new Promise<Response>(() => {});
  }) as typeof globalThis.fetch);
  const adapter = reasoner();
  const recognition = adapter.infer("synthetic active evidence");
  const rejected = assert.rejects(recognition, (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "server_exited");
  await requested.promise;
  let released = false;
  const closing = adapter.close().then(() => { released = true; });
  fixture.exit(); await rejected; await turn();
  assert.equal(released, false);
  fixture.closed(); await closing;
  assert.equal(released, true);
});

test("llama pre-aborted startup launches no native child", async (t) => {
  let starts = 0;
  install(t, (() => { starts++; throw new Error("unexpected native startup"); }) as typeof childProcess.spawn,
    (async () => { throw new Error("unexpected network request"); }) as typeof globalThis.fetch);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(reasoner().infer("synthetic bounded evidence", controller.signal), (error: unknown) => error instanceof BibliographicIntelligenceError && error.code === "reasoner_timeout");
  assert.equal(starts, 0);
});

test("llama failed spawn can close without an exit event and leaves no pending cleanup", async (t) => {
  const fixture = controlledServer(), requested = deferred<void>();
  install(t, (() => fixture.child) as typeof childProcess.spawn, (async () => {
    requested.resolve(); return new Promise<Response>(() => {});
  }) as typeof globalThis.fetch);
  const adapter = reasoner();
  const recognition = adapter.infer("synthetic startup evidence");
  const rejected = assert.rejects(recognition, (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "server_exited");
  await requested.promise;
  fixture.child.emit("error", new Error("synthetic failed spawn"));
  let released = false;
  const closing = adapter.close().then(() => { released = true; });
  await turn(); assert.equal(released, false);
  fixture.closed();
  await Promise.all([closing, rejected]);
  await adapter.close();
  assert.equal(released, true);
});
