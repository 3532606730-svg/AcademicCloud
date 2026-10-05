import { inspectRenderedPng, RenderedPngError } from "./rendered-png.js";
import { loadImage } from "@napi-rs/canvas";
import {
  OCR_ENGINE_MAX_LINE_BOXES,
  OCR_ENGINE_MAX_TEXT_UNITS,
  parseOcrEnginePageRequest,
  parseOcrEnginePageResult,
  type OcrEngineAdapter,
  type OcrEngineCapabilities,
  type OcrEngineLineBox,
  type OcrEnginePageRequest,
  type OcrEnginePageResult,
} from "@academiccloud/compute-contracts";

import { SUGGESTION_LIMITS } from "./suggestion.js";

// Official API checked 2026-10-01: https://cloud.baidu.com/doc/OCR/s/6mncwkr9c
// The service declares PP-OCRv6, but exposes no immutable model weight revision.
// This internal adapter enables no HTTP route, credential store or product path.
const ENDPOINT = "https://aip.baidubce.com/rest/2.0/ocr/v1/pp_ocr";
export const BAIDU_PPOCRV6_LIMITS = Object.freeze({
  maxImageBytes: 2 * 1024 * 1024,
  maxFormBytes: 10_000_000,
  maxResponseBytes: 1024 * 1024,
  defaultTimeoutMilliseconds: 30_000,
  maxTimeoutMilliseconds: 60_000,
  lowConfidenceThreshold: 70,
});
const CAPABILITIES: OcrEngineCapabilities = {
  engineId: "baidu-pp-ocrv6",
  engineVersion: "academiccloud-adapter-v1",
  modelVersion: null,
  inputMimeTypes: ["image/png"],
  scriptHints: ["Hans", "Hant", "Latn", "Jpan"],
  maxImageBytes: BAIDU_PPOCRV6_LIMITS.maxImageBytes,
  canReturnGeometry: true,
};

const ERROR_CODES = ["closed", "busy", "aborted", "timeout", "input_invalid", "input_limit", "authentication_failed",
  "network_failure", "http_failure", "provider_failure", "response_limit", "invalid_response"] as const;
export type BaiduPpOcrV6ErrorCode = (typeof ERROR_CODES)[number];

export class BaiduPpOcrV6Error extends Error {
  constructor(readonly code: BaiduPpOcrV6ErrorCode, readonly submissionMayHaveOccurred = false) {
    super(code);
    this.name = "BaiduPpOcrV6Error";
  }
}

export interface BaiduPpOcrV6Config {
  /** Member-owned, memory-only token supply. No OAuth, environment or persistence. */
  getAccessToken(signal: AbortSignal): Promise<string>;
  timeoutMilliseconds?: number;
  /** Internal dependency injection for offline qualification; endpoint stays fixed. */
  fetch?: typeof globalThis.fetch;
}

interface Operation {
  signal: AbortSignal;
  controller: AbortController;
  deadline: number;
  timedOut: boolean;
  dispatched: boolean;
  finished: boolean;
  pending: Set<Promise<unknown>>;
}

function check(operation: Operation): void {
  if (!operation.signal.aborted && performance.now() >= operation.deadline) {
    operation.timedOut = true;
    operation.controller.abort();
  }
  if (operation.signal.aborted) {
    // Never propagate arbitrary caller signal.reason (which may contain secrets).
    throw new BaiduPpOcrV6Error(operation.timedOut ? "timeout" : "aborted", operation.dispatched);
  }
}

/** Race waiting only; native decode cannot be terminated by AbortSignal. */
function waitFor<T>(promise: Promise<T>, operation: Operation): Promise<T> {
  check(operation);
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      try { check(operation); } catch (error) { reject(error); }
    };
    operation.signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => operation.signal.removeEventListener("abort", abort));
  }).finally(() => check(operation));
}

function inspectPng(image: Uint8Array): { width: number; height: number } {
  try { return inspectRenderedPng(image); } catch (error) {
    throw new BaiduPpOcrV6Error(error instanceof RenderedPngError ? error.code : "input_invalid");
  }
}

type Rectangle = Pick<OcrEngineLineBox, "x" | "y" | "width" | "height">;
function rectangle(value: unknown, image: { width: number; height: number }): Rectangle | undefined {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((n) => typeof n !== "number" || !Number.isFinite(n))) return undefined;
  const [left, top, right, bottom] = value as [number, number, number, number];
  if (left < 0 || top < 0 || right > image.width || bottom > image.height || right <= left || bottom <= top) return undefined;
  const x = left / image.width;
  const y = top / image.height;
  return { x, y, width: Math.min((right - left) / image.width, 1 - x), height: Math.min((bottom - top) / image.height, 1 - y) };
}
function polygon(value: unknown, image: { width: number; height: number }): Rectangle | undefined {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((point) => !Array.isArray(point) || point.length !== 2
      || point.some((n) => typeof n !== "number" || !Number.isFinite(n)))) return undefined;
  const points = value as [number, number][];
  let winding = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % 4]!;
    const c = points[(index + 2) % 4]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross === 0 || (winding !== 0 && Math.sign(cross) !== winding)) return undefined;
    winding = Math.sign(cross);
  }
  return rectangle([Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))], image);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function translate(value: unknown, requestId: string, image: { width: number; height: number }): OcrEnginePageResult {
  const invalid = (): never => { throw new BaiduPpOcrV6Error("invalid_response", true); };
  if (!object(value)) return invalid();
  if (Object.hasOwn(value, "error_code") || Object.hasOwn(value, "error_msg")) throw new BaiduPpOcrV6Error("provider_failure", true);
  if (!Array.isArray(value.page_result) || value.page_result.length !== 1 || !object(value.page_result[0])) return invalid();
  const page = value.page_result[0];
  if (!Array.isArray(page.lines) || page.lines.some((line) => typeof line !== "string")
    || !Number.isSafeInteger(page.lines_result_num) || page.lines_result_num !== page.lines.length) return invalid();
  const lines = (page.lines as string[]).map((line) => line.toWellFormed().replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, ""));
  const raw = lines.join("\n");
  const cleaned = raw.trim();
  let text = cleaned.slice(0, OCR_ENGINE_MAX_TEXT_UNITS);
  if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
  const probabilities = page.probability;
  // The API reports line scores, not a page score. Do not invent page confidence.
  // A low-score line only supplies a quality warning; all text stays available.
  const lowConfidence = Array.isArray(probabilities) && probabilities.length === lines.length && probabilities.length > 0
    && probabilities.every((score) => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1)
    && probabilities.some((score) => score * 100 < BAIDU_PPOCRV6_LIMITS.lowConfidenceThreshold);
  const boxes = Array.isArray(page.rec_boxes) && page.rec_boxes.length === lines.length ? page.rec_boxes : undefined;
  const polys = Array.isArray(page.rec_polys) && page.rec_polys.length === lines.length ? page.rec_polys : undefined;
  const lineBoxes: OcrEngineLineBox[] = [];
  const trimLeft = raw.length - raw.trimStart().length;
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const start = Math.max(0, cursor - trimLeft);
    const end = Math.min(cleaned.length, cursor + lines[index]!.length - trimLeft);
    const position = rectangle(boxes?.[index], image) ?? polygon(polys?.[index], image);
    // A truncated line has no full-line box; never associate it with partial text.
    if (position && end > start && end <= text.length && lineBoxes.length < OCR_ENGINE_MAX_LINE_BOXES) {
      lineBoxes.push({ start, end, ...position });
    }
    cursor += lines[index]!.length + 1;
  }
  return parseOcrEnginePageResult({
    requestId,
    status: !text ? "no_text" : lowConfidence ? "low_confidence" : "recognized",
    text: text || null,
    truncated: Boolean(text) && cleaned.length > text.length,
    confidence: null,
    provenance: { engineId: CAPABILITIES.engineId, engineVersion: CAPABILITIES.engineVersion, modelVersion: null },
    ...(text && lineBoxes.length > 0 ? { lineBoxes } : {}),
  }, { requestId, capabilities: CAPABILITIES });
}

export class BaiduPpOcrV6Adapter implements OcrEngineAdapter {
  private closed = false;
  private active: Operation | undefined;
  private readonly getAccessToken: BaiduPpOcrV6Config["getAccessToken"];
  private readonly fetchRequest: typeof globalThis.fetch;
  private readonly timeoutMilliseconds: number;

  constructor(config: BaiduPpOcrV6Config) {
    const timeout = config.timeoutMilliseconds ?? BAIDU_PPOCRV6_LIMITS.defaultTimeoutMilliseconds;
    if (typeof config.getAccessToken !== "function" || (config.fetch !== undefined && typeof config.fetch !== "function")
      || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > BAIDU_PPOCRV6_LIMITS.maxTimeoutMilliseconds) {
      throw new TypeError("Invalid PP-OCRv6 adapter configuration");
    }
    this.getAccessToken = config.getAccessToken;
    this.fetchRequest = config.fetch ?? globalThis.fetch;
    this.timeoutMilliseconds = timeout;
  }

  async capabilities(): Promise<OcrEngineCapabilities> {
    return { ...CAPABILITIES, inputMimeTypes: [...CAPABILITIES.inputMimeTypes], scriptHints: [...CAPABILITIES.scriptHints] };
  }

  private track<T>(promise: Promise<T>, operation: Operation): Promise<T> {
    operation.pending.add(promise);
    const settled = () => {
      operation.pending.delete(promise);
      if (operation.finished && operation.pending.size === 0 && this.active === operation) this.active = undefined;
    };
    promise.then(settled, settled);
    return waitFor(promise, operation);
  }

  private async external<T>(operation: Operation, stage: BaiduPpOcrV6ErrorCode, start: () => Promise<T>): Promise<T> {
    check(operation);
    try { return await this.track(start(), operation); }
    catch {
      check(operation);
      // Even a dependency throwing our public Error class is untrusted here.
      throw new BaiduPpOcrV6Error(stage, operation.dispatched);
    }
  }

  async recognize(request: OcrEnginePageRequest, options: { signal: AbortSignal }): Promise<OcrEnginePageResult> {
    if (this.closed) throw new BaiduPpOcrV6Error("closed");
    if (this.active) throw new BaiduPpOcrV6Error("busy");
    const controller = new AbortController();
    const operation: Operation = {
      signal: AbortSignal.any([options.signal, controller.signal]), controller,
      deadline: performance.now() + this.timeoutMilliseconds, timedOut: false, dispatched: false,
      finished: false, pending: new Set(),
    };
    this.active = operation;
    const timer = setTimeout(() => { operation.timedOut = true; controller.abort(); }, this.timeoutMilliseconds);
    let stage: BaiduPpOcrV6ErrorCode = "input_invalid";
    try {
      check(operation);
      if (request.image instanceof Uint8Array && request.image.byteLength > CAPABILITIES.maxImageBytes) throw new BaiduPpOcrV6Error("input_limit");
      const input = parseOcrEnginePageRequest(request, CAPABILITIES);
      const dimensions = inspectPng(input.image);
      check(operation);
      const decoded = await this.external(operation, "input_invalid", () => loadImage(Buffer.from(input.image)));
      check(operation);
      if (decoded.width !== dimensions.width || decoded.height !== dimensions.height) throw new BaiduPpOcrV6Error("input_invalid");
      const body = new URLSearchParams({
        image: Buffer.from(input.image).toString("base64"),
        useDocOrientationClassify: "false", useDocUnwarping: "false", useTextlineOrientation: "false",
      }).toString();
      if (Buffer.byteLength(body, "utf8") > BAIDU_PPOCRV6_LIMITS.maxFormBytes) throw new BaiduPpOcrV6Error("input_limit");
      check(operation);
      stage = "authentication_failed";
      const token = await this.external(operation, "authentication_failed", () => this.getAccessToken(operation.signal));
      check(operation);
      if (typeof token !== "string" || !/^[\x21-\x7e]{1,8192}$/u.test(token)) throw new BaiduPpOcrV6Error("authentication_failed");
      const url = new URL(ENDPOINT);
      url.searchParams.set("access_token", token);
      check(operation);
      stage = "network_failure";
      operation.dispatched = true;
      const response = await this.external(operation, "network_failure", () => {
        const fetching = this.fetchRequest(url, {
          method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body, signal: operation.signal,
        });
        // A non-cooperative fetch can resolve after cancellation. Dispose its
        // late body; the concurrency slot lasts until fetching settles.
        fetching.then((reply) => { if (operation.signal.aborted) void reply.body?.cancel().catch(() => {}); }, () => {});
        return fetching;
      });
      check(operation);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        if (!response.ok) throw new BaiduPpOcrV6Error("http_failure", true);
        const contentType = response.headers.get("content-type");
        if (!contentType || !/^application\/(?:json|[A-Za-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/iu.test(contentType)) throw new BaiduPpOcrV6Error("invalid_response", true);
        const length = response.headers.get("content-length");
        if (length !== null) {
          if (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length))) throw new BaiduPpOcrV6Error("invalid_response", true);
          if (Number(length) > BAIDU_PPOCRV6_LIMITS.maxResponseBytes) throw new BaiduPpOcrV6Error("response_limit", true);
        }
        if (!response.body) throw new BaiduPpOcrV6Error("invalid_response", true);
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          check(operation);
          const chunk = await this.external(operation, "network_failure", () => reader!.read());
          if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > BAIDU_PPOCRV6_LIMITS.maxResponseBytes) throw new BaiduPpOcrV6Error("response_limit", true);
          chunks.push(chunk.value);
        }
        check(operation);
        stage = "invalid_response";
        const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)));
        const result = translate(parsed, input.requestId, dimensions);
        check(operation);
        return result;
      } finally {
        // Do not await cancellation from a non-cooperative transport.
        if (reader) {
          void reader.cancel().catch(() => {});
          try { reader.releaseLock(); } catch { /* Pending read retains its own slot. */ }
        } else void response.body?.cancel().catch(() => {});
      }
    } catch (error) {
      check(operation);
      if (error instanceof BaiduPpOcrV6Error) {
        const code: unknown = Object.getOwnPropertyDescriptor(error, "code")?.value;
        if (typeof code === "string" && (ERROR_CODES as readonly string[]).includes(code)) {
          throw new BaiduPpOcrV6Error(code as BaiduPpOcrV6ErrorCode, operation.dispatched);
        }
      }
      // Deliberately discard raw fetch, token, JSON and native messages/causes.
      throw new BaiduPpOcrV6Error(stage, operation.dispatched);
    } finally {
      clearTimeout(timer);
      operation.finished = true;
      if (operation.pending.size === 0 && this.active === operation) this.active = undefined;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.active?.controller.abort();
  }
}
