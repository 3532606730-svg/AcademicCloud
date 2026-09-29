import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PADDLE_DETECTION_MODEL,
  PADDLE_OCR_PACKAGE_VERSION,
  PADDLE_RECOGNITION_MODEL,
  PADDLE_RUNTIME_VERSION,
} from "./bibliographic-intelligence.js";
import { OcrError, type OcrAdapter, type OcrPageInput, type OcrRecognition } from "./ocr.js";
import { SUGGESTION_LIMITS } from "./suggestion.js";
import { prepareOcrGeometry } from "./ocr-geometry.js";

// Candidate provenance is retained in the v20 SQLite column capped at 128
// characters. Keep the complete pinned runtime/model revisions while using
// compact stable labels so OCR-bearing callbacks remain persistable.
export const PADDLE_OCR_ENGINE_ID = `academiccloud-paddleocr-v1/${PADDLE_OCR_PACKAGE_VERSION}/${PADDLE_RUNTIME_VERSION}/det@${PADDLE_DETECTION_MODEL.revision}/rec@${PADDLE_RECOGNITION_MODEL.revision}` as const;

export interface PaddleOcrConfig {
  pythonPath: string;
  sidecarPath: string;
  detectionModelPath: string;
  recognitionModelPath: string;
  cachePath: string;
  device: "cpu" | "gpu";
  engineId: typeof PADDLE_OCR_ENGINE_ID;
  /** Test-only prefix such as a local fixture script passed to Node. */
  executableArguments?: readonly string[];
}

function paddleDevice(value: string | undefined): "cpu" | "gpu" {
  const normalized = value?.trim() || "cpu";
  if (normalized !== "cpu" && normalized !== "gpu") throw new Error("PADDLE_OCR_DEVICE is invalid");
  return normalized;
}

function localPath(label: string, value: string | undefined, fallback: string): string {
  const result = value?.trim() || fallback;
  if (result.length < 1 || result.length > 1_024 || /[\u0000\r\n]/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

export function loadPaddleOcrConfig(environment: NodeJS.ProcessEnv = process.env): PaddleOcrConfig {
  const production = environment.NODE_ENV === "production";
  const runtimeRoot = new URL("../../runtime/paddle/", import.meta.url);
  const release = {
    python: fileURLToPath(new URL("venv/bin/python", runtimeRoot)),
    sidecar: fileURLToPath(new URL("paddle_ocr_sidecar.py", runtimeRoot)),
    detection: fileURLToPath(new URL("models/PP-OCRv6_small_det", runtimeRoot)),
    recognition: fileURLToPath(new URL("models/PP-OCRv6_small_rec", runtimeRoot)),
  };
  if (production && [environment.PADDLE_OCR_PYTHON_PATH, environment.PADDLE_OCR_SIDECAR_PATH, environment.PADDLE_OCR_DETECTION_MODEL_PATH, environment.PADDLE_OCR_RECOGNITION_MODEL_PATH]
    .some((value) => value !== undefined)) throw new Error("production PaddleOCR runtime paths are release-local and cannot be overridden");
  return {
    pythonPath: localPath("PADDLE_OCR_PYTHON_PATH", production ? release.python : environment.PADDLE_OCR_PYTHON_PATH, "python3"),
    sidecarPath: localPath("PADDLE_OCR_SIDECAR_PATH", production ? release.sidecar : environment.PADDLE_OCR_SIDECAR_PATH, "compute/scripts/paddle_ocr_sidecar.py"),
    detectionModelPath: localPath("PADDLE_OCR_DETECTION_MODEL_PATH", production ? release.detection : environment.PADDLE_OCR_DETECTION_MODEL_PATH, "runtime/paddle/models/PP-OCRv6_small_det"),
    recognitionModelPath: localPath("PADDLE_OCR_RECOGNITION_MODEL_PATH", production ? release.recognition : environment.PADDLE_OCR_RECOGNITION_MODEL_PATH, "runtime/paddle/models/PP-OCRv6_small_rec"),
    cachePath: join(tmpdir(), "academiccloud-paddlex"),
    device: paddleDevice(environment.PADDLE_OCR_DEVICE),
    engineId: PADDLE_OCR_ENGINE_ID,
  };
}

interface SidecarResult {
  id: string;
  status: "recognized" | "no_text" | "low_confidence" | "unsupported_script" | "failed";
  text?: string;
  confidence?: number | null;
  truncated?: boolean;
  geometry?: unknown;
}

interface Pending {
  readerMode: boolean;
  includeGeometry: boolean;
  resolve: (value: OcrRecognition) => void;
  reject: (error: OcrError) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class PaddleOcrSidecarAdapter implements OcrAdapter {
  readonly #config: PaddleOcrConfig;
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer = "";
  #ready: Promise<void> | undefined;
  #readyResolve: (() => void) | undefined;
  #readyReject: ((error: OcrError) => void) | undefined;
  readonly #pending = new Map<string, Pending>();
  #startupDiagnosticBytes = 0;

  constructor(config: PaddleOcrConfig = loadPaddleOcrConfig()) {
    this.#config = config;
  }

  async recognizePage(input: OcrPageInput, signal?: AbortSignal): Promise<OcrRecognition> {
    if (input.includeGeometry && input.readerMode !== true) throw new OcrError("input_limit");
    if (!Number.isSafeInteger(input.pageIndex) || input.pageIndex < 1 || input.imageBytes.byteLength < 1
      || input.imageBytes.byteLength > SUGGESTION_LIMITS.maxEncodedPageImageBytes) throw new OcrError("input_limit");
    await this.#ensureReady(signal);
    if (signal?.aborted) throw new OcrError("aborted");
    if (!this.#child?.stdin.writable) throw new OcrError("engine_unavailable");
    const id = randomUUID();
    return new Promise<OcrRecognition>((resolve, reject) => {
      const finish = (callback: () => void): void => {
        const pending = this.#pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
        this.#pending.delete(id);
        callback();
      };
      const onAbort = (): void => {
        finish(() => reject(new OcrError("aborted")));
        this.#terminate(new OcrError("aborted"));
      };
      const timer = setTimeout(() => {
        finish(() => reject(new OcrError("timeout")));
        this.#terminate(new OcrError("timeout"));
      }, SUGGESTION_LIMITS.perPageOcrTimeoutMilliseconds);
      this.#pending.set(id, { resolve, reject, timer, readerMode: input.readerMode === true,
        includeGeometry: input.includeGeometry === true,
        ...(signal === undefined ? {} : { signal, onAbort }) });
      signal?.addEventListener("abort", onAbort, { once: true });
      const request = JSON.stringify({ id, pageIndex: input.pageIndex, imageBase64: Buffer.from(input.imageBytes).toString("base64"),
        ...(input.readerMode ? { readerMode: true } : {}), ...(input.includeGeometry ? { includeGeometry: true } : {}) });
      this.#child!.stdin.write(`${request}\n`, "utf8", (error) => {
        if (error) finish(() => reject(new OcrError("engine_failure")));
      });
    });
  }

  async close(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.stdin.end();
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    killTimer.unref();
    await exited;
    clearTimeout(killTimer);
    this.#terminate(new OcrError("engine_failure"), false);
  }

  async #ensureReady(signal?: AbortSignal): Promise<void> {
    if (!this.#ready) this.#start();
    if (!this.#ready) throw new OcrError("engine_unavailable");
    if (signal?.aborted) throw new OcrError("aborted");
    if (!signal) return this.#ready;
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => reject(new OcrError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      this.#ready!.then(
        () => { signal.removeEventListener("abort", onAbort); resolve(); },
        (error: unknown) => { signal.removeEventListener("abort", onAbort); reject(error); },
      );
    });
  }

  #start(): void {
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#readyResolve = resolve;
      this.#readyReject = reject;
    });
    const child = spawn(this.#config.pythonPath, [
      ...(this.#config.executableArguments ?? ["-I"]), this.#config.sidecarPath,
      "--detection-model", this.#config.detectionModelPath,
      "--recognition-model", this.#config.recognitionModelPath,
      "--device", this.#config.device,
    ], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        DISABLE_MODEL_SOURCE_CHECK: "True",
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
        // PaddleX creates temp/lock directories while importing. Keep them in
        // systemd's isolated PrivateTmp instead of the protected user home.
        PADDLE_PDX_CACHE_HOME: this.#config.cachePath,
        FLAGS_use_mkldnn: "0",
        OMP_NUM_THREADS: "2",
      },
    });
    this.#child = child;
    child.stderr.on("data", (chunk: Buffer) => {
      // The hosted qualification uses only generated pages and may expose a
      // bounded initialization traceback so a real runtime mismatch is
      // actionable. Production never sets this flag, and diagnostics stop as
      // soon as the exact ready handshake succeeds; document text is therefore
      // never forwarded from the sidecar.
      if (process.env.PADDLE_OCR_STARTUP_DIAGNOSTICS !== "1" || this.#readyResolve === undefined
        || this.#startupDiagnosticBytes >= 8_192) return;
      const text = chunk.toString("utf8")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "")
        .slice(0, 8_192 - this.#startupDiagnosticBytes);
      this.#startupDiagnosticBytes += Buffer.byteLength(text, "utf8");
      process.stderr.write(text);
    });
    child.stdout.on("data", (chunk: Buffer) => this.#onOutput(chunk));
    child.once("error", () => this.#terminate(new OcrError("engine_unavailable")));
    child.once("exit", () => this.#terminate(new OcrError("engine_failure"), false));
  }

  #onOutput(chunk: Buffer): void {
    this.#buffer += chunk.toString("utf8");
    if (this.#buffer.length > MAX_REASONING_OUTPUT_BYTES) {
      this.#terminate(new OcrError("output_limit"));
      return;
    }
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      this.#handleLine(line);
      newline = this.#buffer.indexOf("\n");
    }
  }

  #handleLine(line: string): void {
    let message: SidecarResult | { ready: true; engine: string };
    try {
      message = JSON.parse(line) as SidecarResult | { ready: true; engine: string };
      if (typeof message !== "object" || message === null || Array.isArray(message)) throw new Error("invalid sidecar result");
    } catch {
      this.#terminate(new OcrError("engine_failure"));
      return;
    }
    if ("ready" in message) {
      if (message.ready !== true || message.engine !== this.#config.engineId) {
        this.#terminate(new OcrError("engine_version_mismatch"));
        return;
      }
      this.#readyResolve?.();
      this.#readyResolve = undefined;
      this.#readyReject = undefined;
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
    this.#pending.delete(message.id);
    if (message.status === "failed") {
      pending.reject(new OcrError("engine_failure"));
      return;
    }
    if (!["recognized", "no_text", "low_confidence", "unsupported_script"].includes(message.status)
      || typeof message.text !== "string"
      || (message.truncated !== undefined && typeof message.truncated !== "boolean")
      || (message.confidence !== null && (typeof message.confidence !== "number"
        || !Number.isInteger(message.confidence) || message.confidence < 0 || message.confidence > 100))) {
      pending.reject(new OcrError("engine_failure"));
      return;
    }
    if (pending.includeGeometry) {
      const prepared = prepareOcrGeometry(message.text, message.geometry, SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage);
      pending.resolve({ status: message.status, text: prepared.text, confidence: message.confidence!, engine: this.#config.engineId,
        truncated: message.truncated === true || prepared.truncated, geometry: prepared.geometry });
      return;
    }
    let text = typeof message.text === "string" ? message.text.normalize("NFC").trim() : "";
    const confidence = message.confidence === null ? null
      : typeof message.confidence === "number" && Number.isInteger(message.confidence) && message.confidence >= 0 && message.confidence <= 100
        ? message.confidence : null;
    if (text.length > SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage) {
      if (!pending.readerMode) {
        pending.reject(new OcrError("output_limit"));
        return;
      }
      text = text.slice(0, SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage);
      if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
      message.truncated = true;
    }
    pending.resolve({ status: message.status, text, confidence, engine: this.#config.engineId,
      ...(message.truncated === undefined ? {} : { truncated: message.truncated }) });
  }

  #terminate(error: OcrError, kill = true): void {
    const child = this.#child;
    this.#child = undefined;
    if (kill) child?.kill("SIGKILL");
    this.#readyReject?.(error);
    this.#ready = undefined;
    this.#readyReject = undefined;
    this.#readyResolve = undefined;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

const MAX_REASONING_OUTPUT_BYTES = 384 * 1024;
