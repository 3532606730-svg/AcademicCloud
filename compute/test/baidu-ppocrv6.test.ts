import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { createCanvas } from "@napi-rs/canvas";
import type { OcrEnginePageRequest } from "@academiccloud/compute-contracts";
import { BaiduPpOcrV6Adapter, BaiduPpOcrV6Error, BAIDU_PPOCRV6_LIMITS, type BaiduPpOcrV6ErrorCode } from "../src/baidu-ppocrv6.js";

const IMAGE = new Uint8Array(createCanvas(100, 200).toBuffer("image/png"));
const SECRET = "secret-token-do-not-echo";
const request = (image = IMAGE): OcrEnginePageRequest => ({ requestId: "page-1", image, mimeType: "image/png", languageHints: ["Hans"] });
const options = () => ({ signal: new AbortController().signal });
const page = (lines: string[], extras: Record<string, unknown> = {}) => ({
  page_result: [{ lines, lines_result_num: lines.length, probability: lines.map(() => 0.9), ...extras }], log_id: 123,
});
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { ...init, headers: { "content-type": "application/json", ...init.headers } });
function fixture(response: () => Response | Promise<Response> = () => json(page(["正文"]))) {
  const calls: { url: URL; init: RequestInit }[] = [];
  let tokens = 0;
  const adapter = new BaiduPpOcrV6Adapter({
    getAccessToken: async () => { tokens += 1; return SECRET; },
    fetch: async (input, init) => { calls.push({ url: new URL(String(input)), init: init! }); return response(); },
  });
  return { adapter, calls, tokenCount: () => tokens };
}
function errorCode(code: BaiduPpOcrV6ErrorCode, submitted: boolean) {
  return (error: unknown) => {
    assert.ok(error instanceof BaiduPpOcrV6Error);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.submissionMayHaveOccurred, submitted);
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(JSON.stringify(error).includes(SECRET), false);
    assert.equal(error.stack?.includes(SECRET), false);
    return true;
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

// Independent fixture CRC construction: no imports of the adapter's PNG parser.
function chunk(type: string, data: Uint8Array): Buffer {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(type, 4, "latin1");
  output.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of output.subarray(4, output.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
function pngChunks(): { type: string; data: Buffer; raw: Buffer }[] {
  const bytes = Buffer.from(IMAGE);
  const chunks: { type: string; data: Buffer; raw: Buffer }[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    chunks.push({ type: bytes.toString("latin1", offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length), raw: bytes.subarray(offset, offset + length + 12) });
    offset += length + 12;
  }
  return chunks;
}
const png = (chunks: readonly Uint8Array[]) => new Uint8Array(Buffer.concat([Buffer.from(IMAGE.subarray(0, 8)), ...chunks]));
const insertBeforeData = (extra: Buffer) => png(pngChunks().flatMap((entry) => entry.type === "IDAT" ? [extra, entry.raw] : [entry.raw]));

test("modern page_result preserves provider line order and recognition boxes in submitted-image coordinates", async () => {
  const f = fixture(() => json(page(["乙\u0001行", "𠮷甲"], { rec_boxes: [[10, 20, 90, 40], [0, 100, 100, 200]], rec_polys: "bad optional polys" })));
  const result = await f.adapter.recognize(request(), options());
  assert.equal(result.text, "乙行\n𠮷甲");
  assert.equal(result.status, "recognized");
  assert.equal(result.confidence, null);
  assert.equal(result.provenance.modelVersion, null);
  assert.deepEqual(result.lineBoxes, [
    { start: 0, end: 2, x: 0.1, y: 0.1, width: 0.8, height: 0.1 },
    { start: 3, end: 6, x: 0, y: 0.5, width: 1, height: 0.5 },
  ]);
  assert.equal(f.tokenCount(), 1);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0]!;
  assert.equal(url.origin + url.pathname, "https://aip.baidubce.com/rest/2.0/ocr/v1/pp_ocr");
  assert.deepEqual([...url.searchParams.keys()], ["access_token"]);
  assert.equal(url.searchParams.get("access_token"), SECRET);
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.headers, { "Content-Type": "application/x-www-form-urlencoded" });
  const form = new URLSearchParams(init.body as string);
  assert.deepEqual([...form.keys()], ["image", "useDocOrientationClassify", "useDocUnwarping", "useTextlineOrientation"]);
  for (const flag of ["useDocOrientationClassify", "useDocUnwarping", "useTextlineOrientation"]) assert.equal(form.get(flag), "false");
  assert.deepEqual(Buffer.from(form.get("image")!, "base64"), Buffer.from(IMAGE));
  assert.ok(Buffer.byteLength(init.body as string) <= BAIDU_PPOCRV6_LIMITS.maxFormBytes);
  // Even worst-case percent encoding of every base64 character fits the fixed
  // vendor form ceiling at the lower raw-byte ceiling (plus bounded flags).
  assert.ok(Math.ceil(BAIDU_PPOCRV6_LIMITS.maxImageBytes / 3) * 4 * 3 + 256 < BAIDU_PPOCRV6_LIMITS.maxFormBytes);
});

test("capabilities are immutable snapshots of PNG-only input and undisclosed model revision", async () => {
  const f = fixture();
  const first = await f.adapter.capabilities();
  first.inputMimeTypes.push("image/jpeg");
  first.scriptHints.length = 0;
  const next = await f.adapter.capabilities();
  assert.deepEqual(next.inputMimeTypes, ["image/png"]);
  assert.deepEqual(next.scriptHints, ["Hans", "Hant", "Latn", "Jpan"]);
  assert.equal(next.maxImageBytes, 2 * 1024 * 1024);
  assert.equal(next.modelVersion, null);
  assert.equal(f.tokenCount(), 0);
});

test("empty lines and cleaned whitespace are no_text, while low-score text remains available", async () => {
  for (const lines of [[], [" \r\n\u0001\t "]]) {
    const f = fixture(() => json(page(lines)));
    const result = await f.adapter.recognize(request(), options());
    assert.equal(result.status, "no_text");
    assert.equal(result.text, null);
    assert.equal(result.truncated, false);
    assert.equal(result.confidence, null);
    assert.equal(result.lineBoxes, undefined);
  }
  const f = fixture(() => json(page(["低分也保留", "高分行"], { probability: [0.69, 0.99] })));
  assert.deepEqual((await f.adapter.recognize(request(), options())).status, "low_confidence");
  const threshold = fixture(() => json(page(["阈值行"], { probability: [0.7] })));
  assert.equal((await threshold.adapter.recognize(request(), options())).status, "recognized");
});

test("missing, malformed or misaligned optional scores do not invent page confidence or discard text", async () => {
  for (const probability of [undefined, null, [], [0.9, 0.1], ["0.2"], [-1], [1.1]]) {
    const f = fixture(() => json(page(["正文"], { probability })));
    const result = await f.adapter.recognize(request(), options());
    assert.equal(result.text, "正文");
    assert.equal(result.confidence, null);
    assert.equal(result.status, "recognized");
  }
});

test("16,000 UTF-16 truncation keeps scalar boundaries and omits partial-line geometry", async () => {
  for (const line of ["x".repeat(15_999) + "𠮷尾", "x".repeat(16_000) + "尾"]) {
    const f = fixture(() => json(page(["前行", line], { rec_boxes: [[0, 0, 20, 20], [0, 20, 100, 40]] })));
    const result = await f.adapter.recognize(request(), options());
    assert.ok(result.text!.length <= 16_000);
    assert.equal(result.text!.isWellFormed(), true);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.lineBoxes, [{ start: 0, end: 2, x: 0, y: 0, width: 0.2, height: 0.1 }]);
  }
  const emoji = fixture(() => json(page(["x".repeat(15_999) + "𠮷"] )));
  assert.equal((await emoji.adapter.recognize(request(), options())).text!.length, 15_999);
});

test("trim, controls, CRLF and unpaired surrogates retain correctly aligned final text spans", async () => {
  const f = fixture(() => json(page(["  A\r\nB\u0001", "𠮷\uD800  "], { rec_boxes: [[0, 0, 100, 20], [0, 20, 100, 40]] })));
  const result = await f.adapter.recognize(request(), options());
  assert.equal(result.text, "A\nB\n𠮷�");
  assert.deepEqual(result.lineBoxes?.map(({ start, end }) => [start, end]), [[0, 3], [4, 7]]);
});

test("512 geometry cap never drops recognized text or associates later lines with earlier boxes", async () => {
  const lines = Array.from({ length: 513 }, (_, index) => String(index));
  const f = fixture(() => json(page(lines, { rec_boxes: lines.map(() => [0, 0, 100, 20]) })));
  const result = await f.adapter.recognize(request(), options());
  assert.equal(result.text, lines.join("\n"));
  assert.equal(result.truncated, false);
  assert.equal(result.lineBoxes!.length, 512);
  for (let index = 0; index < 512; index += 1) {
    const box = result.lineBoxes![index]!;
    assert.equal(result.text!.slice(box.start, box.end), lines[index]);
  }
});

test("invalid optional geometry preserves text; mismatched arrays cannot shift line identity", async () => {
  for (const rec_boxes of [undefined, null, [], [[0, 0, 100, 20]], [[-1, 0, 2, 2], [0, 0, 0, 10]], [[0, 0, 101, 20], [0, 0, 100, 201]], ["bad", [0, "secret", 1, 2]]]) {
    const f = fixture(() => json(page(["甲", "乙"], { rec_boxes })));
    const result = await f.adapter.recognize(request(), options());
    assert.equal(result.text, "甲\n乙");
    assert.equal(result.lineBoxes, undefined);
  }
  const f = fixture(() => json(page(["甲", "乙"], { rec_boxes: [[0, 0, 10, 10], [0, 0, 0, 10]], rec_polys: [] })));
  assert.deepEqual((await f.adapter.recognize(request(), options())).lineBoxes?.map(({ start, end }) => [start, end]), [[0, 1]]);
});

test("convex recognized polygons can supply boxes but self-intersecting or out-of-image polygons cannot", async () => {
  const f = fixture(() => json(page(["甲", "乙", "丙"], { rec_polys: [
    [[10, 20], [90, 30], [80, 40], [20, 35]],
    [[0, 0], [100, 100], [0, 100], [100, 0]],
    [[-1, 0], [20, 0], [20, 20], [-1, 20]],
  ] })));
  const result = await f.adapter.recognize(request(), options());
  assert.equal(result.text, "甲\n乙\n丙");
  assert.deepEqual(result.lineBoxes, [{ start: 0, end: 1, x: 0.1, y: 0.1, width: 0.8, height: 0.1 }]);
});

test("invalid PNG signatures, CRCs, chunk bounds/order and trailing bytes fail before credentials or POST", async () => {
  const chunks = pngChunks();
  const corruptCrc = new Uint8Array(IMAGE); corruptCrc[corruptCrc.length - 1] = corruptCrc[corruptCrc.length - 1]! ^ 1;
  const bogusLength = new Uint8Array(IMAGE); bogusLength.set([255, 255, 255, 255], 8);
  const inputs = [new Uint8Array([1, 2, 3]), IMAGE.subarray(0, 30), corruptCrc, bogusLength,
    png(chunks.filter((c) => c.type !== "IHDR").map((c) => c.raw)),
    png(chunks.flatMap((c) => c.type === "IHDR" ? [c.raw, c.raw] : [c.raw])),
    png(chunks.filter((c) => c.type !== "IDAT").map((c) => c.raw)),
    png(chunks.filter((c) => c.type !== "IEND").map((c) => c.raw)),
    new Uint8Array(Buffer.concat([Buffer.from(IMAGE), Buffer.from([0])])),
    new Uint8Array(Buffer.concat([Buffer.from(IMAGE), Buffer.from(IMAGE)])),
    insertBeforeData(chunk("iCCP", Buffer.from([0]))), insertBeforeData(chunk("eXIf", Buffer.from([0]))),
    insertBeforeData(chunk("ABCD", Buffer.from([0]))),
  ];
  for (const image of inputs) {
    const f = fixture();
    await assert.rejects(f.adapter.recognize(request(image), options()), errorCode("input_invalid", false));
    assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
  }
});

test("each APNG animation chunk is rejected before credentials or POST", async () => {
  for (const [type, size] of [["acTL", 8], ["fcTL", 26], ["fdAT", 4]] as const) {
    const f = fixture();
    await assert.rejects(f.adapter.recognize(request(insertBeforeData(chunk(type, Buffer.alloc(size)))), options()), errorCode("input_invalid", false));
    assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
  }
});

test("preflight image byte/dimension/pixel bounds reject without allocating an oversized bitmap", async () => {
  const f = fixture();
  await assert.rejects(f.adapter.recognize(request(new Uint8Array(BAIDU_PPOCRV6_LIMITS.maxImageBytes + 1)), options()), errorCode("input_limit", false));
  for (const [width, height, code] of [[14, 200, "input_invalid"], [2001, 200, "input_limit"], [100, 2801, "input_limit"], [8192, 8192, "input_limit"]] as const) {
    const chunks = pngChunks();
    const header = Buffer.from(chunks[0]!.data); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
    const image = png([chunk("IHDR", header), ...chunks.slice(1).map((c) => c.raw)]);
    await assert.rejects(f.adapter.recognize(request(image), options()), errorCode(code, false));
  }
  assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
});

test("strict pixel validation rejects corrupt PNG even when a native decoder tolerates it", async () => {
  const image = png(pngChunks().map((c) => c.type === "IDAT" ? chunk("IDAT", Buffer.from([1, 2, 3, 4])) : c.raw));
  const f = fixture();
  await assert.rejects(f.adapter.recognize(request(image), options()), errorCode("input_invalid", false));
  assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
});

test("rendered PNG rejects hidden compressed trailing bytes, bad row filters and unsupported native decode variants", async () => {
  const chunks = pngChunks();
  const replaceData = (data: Buffer) => png(chunks.map((c) => c.type === "IDAT" ? chunk("IDAT", data) : c.raw));
  const idat = chunks.find((c) => c.type === "IDAT")!.data;
  const filtered = Buffer.alloc((100 * 4 + 1) * 200); filtered[0] = 5;
  const inputs = [replaceData(Buffer.concat([idat, Buffer.from([1, 2, 3])])), replaceData(deflateSync(filtered)), replaceData(deflateSync(Buffer.alloc(1))), replaceData(deflateSync(Buffer.alloc((100 * 4 + 1) * 200 + 1)))];
  for (const [depth, interlace] of [[16, 0], [8, 1]] as const) {
    const header = Buffer.from(chunks[0]!.data); header[8] = depth; header[12] = interlace;
    inputs.push(png([chunk("IHDR", header), ...chunks.slice(1).map((c) => c.raw)]));
  }
  for (const image of inputs) {
    const f = fixture();
    await assert.rejects(f.adapter.recognize(request(image), options()), errorCode("input_invalid", false));
    assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
  }
});

test("indexed PNG with an out-of-palette pixel cannot reach token supply or POST", async () => {
  // Valid chunk CRCs, zlib stream and row filters, but palette has one entry
  // while every pixel uses index 7. Native canvas can silently decode this.
  const header = Buffer.alloc(13);
  header.writeUInt32BE(16); header.writeUInt32BE(16, 4);
  header[8] = 8; header[9] = 3;
  const rows = Buffer.alloc(17 * 16, 7);
  for (let row = 0; row < 16; row += 1) rows[row * 17] = 0;
  const image = png([
    chunk("IHDR", header), chunk("PLTE", Buffer.from([0, 0, 0])),
    chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0)),
  ]);
  const f = fixture();
  await assert.rejects(f.adapter.recognize(request(image), options()), errorCode("input_invalid", false));
  assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
});

test("unsupported MIME and malformed internal request fail before credentials", async () => {
  for (const input of [{ ...request(), mimeType: "image/jpeg" }, { ...request(), requestId: "private secret invalid" }, { ...request(), languageHints: ["Hans", "Hans"] }]) {
    const f = fixture();
    await assert.rejects(f.adapter.recognize(input as OcrEnginePageRequest, options()), errorCode("input_invalid", false));
    assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
  }
});

test("pre-aborted signal never obtains credentials and never exposes arbitrary abort reason", async () => {
  const f = fixture(); const abort = new AbortController(); abort.abort(new Error(SECRET));
  await assert.rejects(f.adapter.recognize(request(), { signal: abort.signal }), errorCode("aborted", false));
  assert.equal(f.tokenCount(), 0); assert.equal(f.calls.length, 0);
});

test("cancellation during non-cooperative token supply returns promptly, holds busy slot and dispatches nothing", async () => {
  const token = deferred<string>(); const entered = deferred<void>(); let posts = 0;
  const adapter = new BaiduPpOcrV6Adapter({ getAccessToken: async () => { entered.resolve(); return token.promise; }, fetch: async () => { posts += 1; return json(page(["正文"])); } });
  const abort = new AbortController(); const running = adapter.recognize(request(), { signal: abort.signal });
  await entered.promise; abort.abort(SECRET);
  await assert.rejects(running, errorCode("aborted", false));
  await assert.rejects(adapter.recognize(request(), options()), errorCode("busy", false));
  token.resolve(SECRET); await turn();
  assert.equal(posts, 0);
  await adapter.close();
});

test("token callback aborting before it returns cannot dispatch a POST", async () => {
  const abort = new AbortController(); let posts = 0;
  const adapter = new BaiduPpOcrV6Adapter({ getAccessToken: async () => { abort.abort(new Error(SECRET)); return SECRET; }, fetch: async () => { posts += 1; return json(page([])); } });
  await assert.rejects(adapter.recognize(request(), { signal: abort.signal }), errorCode("aborted", false));
  assert.equal(posts, 0);
});

test("in-flight fetch abort is potentially submitted, is not retried and disposes late response", async () => {
  const fetched = deferred<Response>(); const entered = deferred<void>(); let posts = 0; let cancelled = 0;
  const adapter = new BaiduPpOcrV6Adapter({ getAccessToken: async () => SECRET, fetch: async () => { posts += 1; entered.resolve(); return fetched.promise; } });
  const abort = new AbortController(); const running = adapter.recognize(request(), { signal: abort.signal });
  await entered.promise; abort.abort(new Error(SECRET));
  await assert.rejects(running, errorCode("aborted", true));
  await assert.rejects(adapter.recognize(request(), options()), errorCode("busy", false));
  fetched.resolve(new Response(new ReadableStream({ cancel() { cancelled += 1; } }), { headers: { "content-type": "application/json" } }));
  await turn(); assert.equal(posts, 1); assert.equal(cancelled, 1);
  await adapter.close();
});

test("timeout includes non-cooperative authentication and cannot silently retry", async () => {
  const token = deferred<string>(); let tokens = 0; let posts = 0;
  const adapter = new BaiduPpOcrV6Adapter({ timeoutMilliseconds: 30, getAccessToken: async () => { tokens += 1; return token.promise; }, fetch: async () => { posts += 1; return json(page([])); } });
  await assert.rejects(adapter.recognize(request(), options()), errorCode("timeout", false));
  assert.equal(tokens, 1); assert.equal(posts, 0);
  await assert.rejects(adapter.recognize(request(), options()), errorCode("busy", false));
  token.resolve(SECRET); await turn(); await adapter.close();
});

test("timeout bounds response stream reading, aborts its signal and reports possible submission", async () => {
  let posts = 0; let cancelled = 0; let observed: AbortSignal | undefined;
  const adapter = new BaiduPpOcrV6Adapter({ timeoutMilliseconds: 50, getAccessToken: async () => SECRET, fetch: async (_url, init) => {
    posts += 1; observed = init!.signal as AbortSignal;
    return new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled += 1; } }), { headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(adapter.recognize(request(), options()), errorCode("timeout", true));
  assert.equal(posts, 1); assert.equal(observed!.aborted, true); assert.equal(cancelled, 1);
  await adapter.close();
});

test("close is idempotent, cancels active work and permanently rejects recognition", async () => {
  const entered = deferred<void>(); const token = deferred<string>(); let posts = 0;
  const adapter = new BaiduPpOcrV6Adapter({ getAccessToken: async () => { entered.resolve(); return token.promise; }, fetch: async () => { posts += 1; return json(page([])); } });
  const running = adapter.recognize(request(), options()); await entered.promise;
  await adapter.close(); await adapter.close();
  await assert.rejects(running, errorCode("aborted", false));
  await assert.rejects(adapter.recognize(request(), options()), errorCode("closed", false));
  token.resolve(SECRET); await turn(); assert.equal(posts, 0);
});

test("same-instance concurrent calls are refused before a second token or POST", async () => {
  const entered = deferred<void>(); const token = deferred<string>(); let tokens = 0; let posts = 0;
  const adapter = new BaiduPpOcrV6Adapter({ getAccessToken: async () => { tokens += 1; entered.resolve(); return token.promise; }, fetch: async () => { posts += 1; return json(page(["正文"])); } });
  const running = adapter.recognize(request(), options()); await entered.promise;
  await assert.rejects(adapter.recognize(request(), options()), errorCode("busy", false));
  token.resolve(SECRET); assert.equal((await running).text, "正文");
  assert.equal(tokens, 1); assert.equal(posts, 1);
  assert.equal((await adapter.recognize(request(), options())).text, "正文");
  assert.equal(posts, 2);
});

test("authentication errors and invalid tokens remain secret-safe with no credential retries or POST", async () => {
  for (const getAccessToken of [async () => { throw new Error(SECRET); }, async () => "", async () => `${SECRET}\r\n`, async () => "x".repeat(8193)]) {
    let tokens = 0; let posts = 0;
    const adapter = new BaiduPpOcrV6Adapter({ getAccessToken: async () => { tokens += 1; return getAccessToken(); }, fetch: async () => { posts += 1; throw new Error(SECRET); } });
    await assert.rejects(adapter.recognize(request(), options()), errorCode("authentication_failed", false));
    assert.equal(tokens, 1); assert.equal(posts, 0);
  }
});

test("HTTP, provider and network failures are safe operational errors rather than no_text and never retry", async () => {
  for (const [response, code] of [
    [() => json({ error_msg: SECRET }, { status: 429 }), "http_failure"],
    [() => json({ error_code: 110, error_msg: SECRET }), "provider_failure"],
    [() => { throw new Error(`https://aip.baidubce.com/?access_token=${SECRET}`); }, "network_failure"],
  ] as const) {
    const f = fixture(response);
    await assert.rejects(f.adapter.recognize(request(), options()), errorCode(code, true));
    assert.equal(f.calls.length, 1); assert.equal(f.tokenCount(), 1);
  }
});

test("dependency errors using the public error class cannot leak mutated message, cause or code", async () => {
  for (const dependency of ["token", "fetch"] as const) {
    let tokens = 0; let posts = 0;
    const malicious = new BaiduPpOcrV6Error("provider_failure", true);
    malicious.message = SECRET;
    Object.defineProperty(malicious, "cause", { value: new Error(SECRET) });
    Object.defineProperty(malicious, "code", { get() { throw new Error(SECRET); } });
    const adapter = new BaiduPpOcrV6Adapter({
      getAccessToken: async () => { tokens += 1; if (dependency === "token") throw malicious; return SECRET; },
      fetch: async () => { posts += 1; throw malicious; },
    });
    await assert.rejects(adapter.recognize(request(), options()), errorCode(dependency === "token" ? "authentication_failed" : "network_failure", dependency === "fetch"));
    assert.equal(tokens, 1); assert.equal(posts, dependency === "fetch" ? 1 : 0);
  }
});

test("invalid JSON, legacy response, multi-page output and inconsistent required line count are rejected", async () => {
  const cases = [null, [], {}, { words_result: [{ words: SECRET }] }, { page_result: [] }, { page_result: [page([]).page_result[0], page([]).page_result[0]] },
    page(["x"], { lines: "string response shape" }), page(["x"], { lines: [null] }), page(["x"], { lines_result_num: 2 }), page(["x"], { lines_result_num: undefined })];
  for (const value of cases) {
    const f = fixture(() => json(value));
    await assert.rejects(f.adapter.recognize(request(), options()), errorCode("invalid_response", true));
    assert.equal(f.calls.length, 1);
  }
  for (const body of [SECRET, "{", new Uint8Array([255, 254])]) {
    const f = fixture(() => new Response(body, { headers: { "content-type": "application/json" } }));
    await assert.rejects(f.adapter.recognize(request(), options()), errorCode("invalid_response", true));
  }
});

test("response headers reject oversized length or non-JSON content and cancel unread bodies", async () => {
  for (const [headers, code] of [
    [{ "content-type": "text/html" }, "invalid_response"],
    [{ "content-type": "application/json", "content-length": "-1" }, "invalid_response"],
    [{ "content-type": "application/json", "content-length": String(BAIDU_PPOCRV6_LIMITS.maxResponseBytes + 1) }, "response_limit"],
  ] as const) {
    let cancelled = 0; let pulls = 0;
    const f = fixture(() => new Response(new ReadableStream({ pull() { pulls += 1; }, cancel() { cancelled += 1; } }, { highWaterMark: 0 }), { headers }));
    await assert.rejects(f.adapter.recognize(request(), options()), errorCode(code, true));
    assert.equal(cancelled, 1); assert.equal(pulls, 0); assert.equal(f.calls.length, 1);
  }
});

test("chunked response limit applies without Content-Length and body failures never expose source text", async () => {
  let cancelled = 0; let index = 0;
  const f = fixture(() => new Response(new ReadableStream({ pull(controller) {
    controller.enqueue(new Uint8Array(index++ === 0 ? BAIDU_PPOCRV6_LIMITS.maxResponseBytes : 1));
  }, cancel() { cancelled += 1; } }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } }));
  await assert.rejects(f.adapter.recognize(request(), options()), errorCode("response_limit", true));
  assert.equal(cancelled, 1); assert.equal(f.calls.length, 1);
  const failed = fixture(() => new Response(new ReadableStream({ pull(controller) { controller.error(new Error(SECRET)); } }), { headers: { "content-type": "application/json" } }));
  await assert.rejects(failed.adapter.recognize(request(), options()), errorCode("network_failure", true));
  assert.equal(failed.calls.length, 1);
});

test("timeout configuration is bounded and malformed callbacks cannot change the endpoint", () => {
  for (const timeoutMilliseconds of [0, -1, NaN, 1.5, 60_001]) {
    assert.throws(() => new BaiduPpOcrV6Adapter({ getAccessToken: async () => SECRET, timeoutMilliseconds }), { message: "Invalid PP-OCRv6 adapter configuration" });
  }
  assert.doesNotThrow(() => new BaiduPpOcrV6Adapter({ getAccessToken: async () => SECRET, timeoutMilliseconds: 60_000 }));
  assert.throws(() => new BaiduPpOcrV6Adapter({ getAccessToken: null } as unknown as ConstructorParameters<typeof BaiduPpOcrV6Adapter>[0]), { message: "Invalid PP-OCRv6 adapter configuration" });
});
