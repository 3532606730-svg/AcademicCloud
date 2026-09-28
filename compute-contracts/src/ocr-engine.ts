/**
 * Internal, single-page boundary for future cloud adapters and member-local
 * connectors. Uint8Array and AbortSignal are runtime values, not an HTTP JSON
 * protocol. This contract enables no provider, persistence or product feature.
 */
export const OCR_ENGINE_MAX_TEXT_UNITS = 16_000;
export const OCR_ENGINE_MAX_LINE_BOXES = 512;
export const OCR_ENGINE_IMAGE_MIME_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff",
] as const;
export type OcrEngineImageMimeType = (typeof OCR_ENGINE_IMAGE_MIME_TYPES)[number];
export type OcrEnginePageStatus = "recognized" | "no_text" | "low_confidence" | "unsupported_script";

export interface OcrEngineProvenance {
  engineId: string;
  engineVersion: string;
  /** Null means that the provider does not disclose a model revision. */
  modelVersion: string | null;
}

export interface OcrEngineCapabilities extends OcrEngineProvenance {
  inputMimeTypes: OcrEngineImageMimeType[];
  /** Advisory language/script tags; an empty list means unspecified coverage. */
  scriptHints: string[];
  /** Engine-declared ceiling. Callers also enforce the lower platform budget. */
  maxImageBytes: number;
  canReturnGeometry: boolean;
}

export interface OcrEnginePageRequest {
  /** Opaque correlation identifier; never an account or authorization claim. */
  requestId: string;
  /** One already-rendered page. Adapters must reject multi-frame image input. */
  image: Uint8Array;
  mimeType: OcrEngineImageMimeType;
  languageHints: string[];
}

export interface OcrEngineLineBox {
  /** Half-open UTF-16 offsets into result.text, at Unicode scalar boundaries. */
  start: number;
  end: number;
  /** Normalized to the submitted image, origin top-left, before any deskew. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrEnginePageResult {
  requestId: string;
  status: OcrEnginePageStatus;
  text: string | null;
  truncated: boolean;
  /** Provider-reported score, not measured accuracy or a cross-engine scale. */
  confidence: number | null;
  provenance: OcrEngineProvenance;
  /** Optional; ordered, non-overlapping text spans. Omit unavailable geometry. */
  lineBoxes?: OcrEngineLineBox[];
}

export interface OcrEngineAdapter {
  capabilities(): Promise<OcrEngineCapabilities>;
  /**
   * Honor cancellation, including a signal already aborted on entry. Operational
   * errors reject; page-quality statuses are not transport or engine failures.
   * Callers validate returned data against the request and capability snapshot.
   * Provider credentials/configuration belong to adapter construction, not here.
   */
  recognize(request: OcrEnginePageRequest, options: { signal: AbortSignal }): Promise<OcrEnginePageResult>;
  /** Release adapter resources; implementations must make repeated close safe. */
  close(): Promise<void>;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;
const HINT = /^[A-Za-z][A-Za-z0-9_+-]{0,63}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function invalid(label: string): never {
  // Do not echo untrusted text, credentials or unexpected property names.
  throw new TypeError(`Invalid OCR engine ${label}`);
}

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid("object prototype");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key) || !("value" in descriptors[key]!)) invalid("object fields");
  }
  if (required.some((key) => !Object.hasOwn(descriptors, key))) invalid("required fields");
  return value as Record<string, unknown>;
}

function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype) invalid(label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid(label);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(descriptors, String(index)) || !("value" in descriptors[String(index)]!)) invalid(label);
  }
  return value as unknown[];
}

function string(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) invalid(label);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") invalid(label);
  return value;
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) invalid(label);
  return value;
}

function hints(value: unknown, max: number): string[] {
  const parsed = array(value, max, "hints").map((hint) => string(hint, HINT, "hint"));
  if (new Set(parsed).size !== parsed.length) invalid("duplicate hints");
  return parsed;
}

function mimeType(value: unknown): OcrEngineImageMimeType {
  if (!(OCR_ENGINE_IMAGE_MIME_TYPES as readonly unknown[]).includes(value)) invalid("image MIME type");
  return value as OcrEngineImageMimeType;
}

function provenance(value: Record<string, unknown>): OcrEngineProvenance {
  return {
    engineId: string(value.engineId, REVISION, "engineId"),
    engineVersion: string(value.engineVersion, REVISION, "engineVersion"),
    modelVersion: value.modelVersion === null ? null : string(value.modelVersion, REVISION, "modelVersion"),
  };
}

/** Capability claims describe an adapter, not its trust, accuracy or authority. */
export function parseOcrEngineCapabilities(value: unknown): OcrEngineCapabilities {
  const input = object(value, ["engineId", "engineVersion", "modelVersion", "inputMimeTypes", "scriptHints", "maxImageBytes", "canReturnGeometry"]);
  const inputMimeTypes = array(input.inputMimeTypes, OCR_ENGINE_IMAGE_MIME_TYPES.length, "inputMimeTypes").map(mimeType);
  if (inputMimeTypes.length === 0 || new Set(inputMimeTypes).size !== inputMimeTypes.length) invalid("inputMimeTypes");
  return {
    ...provenance(input),
    inputMimeTypes,
    scriptHints: hints(input.scriptHints, 32),
    maxImageBytes: integer(input.maxImageBytes, 1, Number.MAX_SAFE_INTEGER, "maxImageBytes"),
    canReturnGeometry: boolean(input.canReturnGeometry, "canReturnGeometry"),
  };
}

/**
 * Validate and snapshot input bytes. MIME is a declaration, not content sniffing:
 * the adapter must validate encoding, dimensions and exactly one decoded frame.
 * Callers enforce min(engine ceiling, platform page/memory budget); a capability
 * claim must never relax platform upload, rendering or memory limits.
 * Callers must keep the validated request unchanged while recognition is active.
 */
export function parseOcrEnginePageRequest(value: unknown, capabilities: OcrEngineCapabilities): OcrEnginePageRequest {
  const expected = parseOcrEngineCapabilities(capabilities);
  const input = object(value, ["requestId", "image", "mimeType", "languageHints"]);
  const requestId = string(input.requestId, ID, "requestId");
  const mime = mimeType(input.mimeType);
  if (!expected.inputMimeTypes.includes(mime)) invalid("unsupported input MIME type");
  if (!(input.image instanceof Uint8Array) || input.image.byteLength < 1 || input.image.byteLength > expected.maxImageBytes) invalid("image bytes");
  return { requestId, image: new Uint8Array(input.image), mimeType: mime, languageHints: hints(input.languageHints, 8) };
}

function coordinate(value: unknown, positive: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 || (positive && value === 0)) invalid("line box coordinates");
  return value;
}

function textBoundary(text: string, offset: number): boolean {
  return offset === 0 || offset === text.length || !(text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff && text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff);
}

/** Reject foreign replies, incompatible provenance and unbounded/private extras. */
export function parseOcrEnginePageResult(
  value: unknown,
  expected: { requestId: string; capabilities: OcrEngineCapabilities },
): OcrEnginePageResult {
  const expectedId = string(expected.requestId, ID, "expected requestId");
  const capabilities = parseOcrEngineCapabilities(expected.capabilities);
  const input = object(value, ["requestId", "status", "text", "truncated", "confidence", "provenance"], ["lineBoxes"]);
  const requestId = string(input.requestId, ID, "requestId");
  if (requestId !== expectedId) invalid("requestId mismatch");
  if (!["recognized", "no_text", "low_confidence", "unsupported_script"].includes(input.status as string)) invalid("page status");
  const status = input.status as OcrEnginePageStatus;
  const text = input.text;
  if (text !== null && (typeof text !== "string" || text.length > OCR_ENGINE_MAX_TEXT_UNITS || !text.isWellFormed() || CONTROL.test(text) || text.trim().length === 0)) invalid("page text");
  const truncated = boolean(input.truncated, "truncated");
  if ((status === "recognized" && text === null) || ((status === "no_text" || status === "unsupported_script") && (text !== null || truncated)) || (text === null && truncated)) invalid("page status/text consistency");
  const confidence = input.confidence;
  if (confidence !== null && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)) invalid("confidence");
  const parsedProvenance = provenance(object(input.provenance, ["engineId", "engineVersion", "modelVersion"]));
  if (parsedProvenance.engineId !== capabilities.engineId || parsedProvenance.engineVersion !== capabilities.engineVersion || parsedProvenance.modelVersion !== capabilities.modelVersion) invalid("provenance mismatch");
  let lineBoxes: OcrEngineLineBox[] | undefined;
  if (Object.hasOwn(input, "lineBoxes")) {
    if (!capabilities.canReturnGeometry || text === null) invalid("unavailable geometry");
    let previousEnd = 0;
    lineBoxes = array(input.lineBoxes, OCR_ENGINE_MAX_LINE_BOXES, "line boxes").map((item) => {
      const box = object(item, ["start", "end", "x", "y", "width", "height"]);
      const start = integer(box.start, previousEnd, text.length - 1, "line start");
      const end = integer(box.end, start + 1, text.length, "line end");
      if (!textBoundary(text, start) || !textBoundary(text, end)) invalid("line text boundary");
      const x = coordinate(box.x, false);
      const y = coordinate(box.y, false);
      const width = coordinate(box.width, true);
      const height = coordinate(box.height, true);
      if (x + width > 1 || y + height > 1) invalid("line box bounds");
      previousEnd = end;
      return { start, end, x, y, width, height };
    });
  }
  return { requestId, status, text, truncated, confidence, provenance: parsedProvenance, ...(lineBoxes === undefined ? {} : { lineBoxes }) };
}
