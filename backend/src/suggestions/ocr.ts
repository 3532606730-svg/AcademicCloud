import { spawn } from "node:child_process";

import { SUGGESTION_LIMITS } from "./suggestion.js";

export const TESSERACT_VERSION = "5.5.3" as const;
export const TESSDATA_FAST_VERSION = "4.1.0" as const;
export const OCR_LANGUAGES = ["chi_sim", "chi_tra", "eng"] as const;
export const TESSERACT_ENGINE_ID = `academiccloud-tesseract-cli-v1/tesseract-${TESSERACT_VERSION}/${OCR_LANGUAGES.join("+")}` as const;

export type OcrFailureCode =
  | "aborted"
  | "engine_unavailable"
  | "engine_version_mismatch"
  | "language_data_unavailable"
  | "timeout"
  | "input_limit"
  | "output_limit"
  | "engine_failure";

export class OcrError extends Error {
  constructor(readonly code: OcrFailureCode) {
    super(code);
    this.name = "OcrError";
  }
}

export interface OcrPageInput {
  /** The rendered image remains process-local and is never persisted. */
  imageBytes: Uint8Array;
  pageIndex: number;
}

export type OcrRecognitionStatus = "recognized" | "no_text" | "low_confidence" | "unsupported_script";

export interface OcrRecognition {
  status: OcrRecognitionStatus;
  text: string;
  /** Integer 0–100, or null when the engine found no scored words. */
  confidence: number | null;
  engine: string;
}

export interface OcrAdapter {
  recognizePage(input: OcrPageInput, signal?: AbortSignal): Promise<OcrRecognition>;
}

export interface TesseractCliConfig {
  executablePath: string;
  tessdataPath?: string;
  expectedVersion: typeof TESSERACT_VERSION;
  languages: readonly ["chi_sim", "chi_tra", "eng"];
  engineId: typeof TESSERACT_ENGINE_ID;
  /** Test-only prefix such as a local fixture script passed to Node. */
  executableArguments?: readonly string[];
}

function boundedPath(name: string, value: string | undefined, fallback?: string): string | undefined {
  const candidate = value?.trim() || fallback;
  if (candidate === undefined) return undefined;
  if (candidate.length < 1 || candidate.length > 1_024 || /[\u0000\r\n]/u.test(candidate)) {
    throw new Error(`${name} must be a bounded local filesystem path or executable name`);
  }
  return candidate;
}

export function loadTesseractCliConfig(environment: NodeJS.ProcessEnv = process.env): TesseractCliConfig {
  const executablePath = boundedPath("OCR_TESSERACT_PATH", environment.OCR_TESSERACT_PATH, "tesseract")!;
  const tessdataPath = boundedPath("OCR_TESSDATA_PATH", environment.OCR_TESSDATA_PATH);
  return {
    executablePath,
    ...(tessdataPath === undefined ? {} : { tessdataPath }),
    expectedVersion: TESSERACT_VERSION,
    languages: OCR_LANGUAGES,
    engineId: TESSERACT_ENGINE_ID,
  };
}

interface ProcessResult {
  stdout: Uint8Array;
}

function runBoundedProcess(options: {
  executablePath: string;
  args: readonly string[];
  input?: Uint8Array;
  timeoutMilliseconds: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}): Promise<ProcessResult> {
  if (options.signal?.aborted) return Promise.reject(new OcrError("aborted"));
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(options.executablePath, options.args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks: Uint8Array[] = [];
    let outputBytes = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: OcrError): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill("SIGKILL");
      reject(error);
    };
    const onAbort = (): void => fail(new OcrError("aborted"));

    timer = setTimeout(() => fail(new OcrError("timeout")), options.timeoutMilliseconds);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", () => fail(new OcrError("engine_unavailable")));
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > options.maxOutputBytes) {
        fail(new OcrError("output_limit"));
        return;
      }
      chunks.push(new Uint8Array(chunk));
    });
    // Diagnostics may contain local paths or OCR internals. Drain without
    // retaining or logging them so a child process cannot block on stderr.
    child.stderr.on("data", () => undefined);
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code !== 0) {
        reject(new OcrError("engine_failure"));
        return;
      }
      resolve({ stdout: new Uint8Array(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))) });
    });
    child.stdin.once("error", () => fail(new OcrError("engine_failure")));
    child.stdin.end(options.input);
  });
}

function supportedScript(text: string): boolean {
  const letters = [...text].filter((character) => /\p{L}/u.test(character));
  if (letters.length === 0) return false;
  const unsupported = letters.filter((character) => !/[\p{Script=Han}\p{Script=Latin}]/u.test(character)).length;
  return unsupported <= Math.max(1, Math.floor(letters.length * 0.1));
}

function parseTsv(output: Uint8Array): { text: string; confidence: number | null } {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(output);
  const lines = new Map<string, string[]>();
  let weightedConfidence = 0;
  let confidenceWeight = 0;
  let characters = 0;
  for (const row of decoded.split(/\r?\n/u)) {
    const cells = row.split("\t");
    if (cells.length < 12 || cells[0] !== "5") continue;
    const word = cells.slice(11).join("\t")
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
      .trim();
    if (!word) continue;
    characters += word.length + 1;
    if (characters > SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage) {
      throw new OcrError("output_limit");
    }
    const key = `${cells[2] ?? "0"}:${cells[3] ?? "0"}:${cells[4] ?? "0"}`;
    const words = lines.get(key) ?? [];
    words.push(word);
    lines.set(key, words);
    const confidence = Number(cells[10]);
    if (Number.isFinite(confidence) && confidence >= 0 && confidence <= 100) {
      const weight = Math.max(1, [...word].length);
      weightedConfidence += confidence * weight;
      confidenceWeight += weight;
    }
  }
  const text = [...lines.values()].map((words) => words.join(" ")).join("\n").trim();
  return {
    text,
    confidence: confidenceWeight === 0
      ? null
      : Math.max(0, Math.min(100, Math.round(weightedConfidence / confidenceWeight))),
  };
}

export class TesseractCliOcrAdapter implements OcrAdapter {
  readonly #config: TesseractCliConfig;
  #readiness: Promise<void> | undefined;

  constructor(config: TesseractCliConfig = loadTesseractCliConfig()) {
    this.#config = config;
  }

  async recognizePage(input: OcrPageInput, signal?: AbortSignal): Promise<OcrRecognition> {
    if (!Number.isSafeInteger(input.pageIndex) || input.pageIndex < 1) throw new OcrError("input_limit");
    if (input.imageBytes.byteLength < 1 || input.imageBytes.byteLength > SUGGESTION_LIMITS.maxEncodedPageImageBytes) {
      throw new OcrError("input_limit");
    }
    await this.#ensureReady(signal);
    const tessdataArguments = this.#config.tessdataPath === undefined
      ? []
      : ["--tessdata-dir", this.#config.tessdataPath];
    const result = await runBoundedProcess({
      executablePath: this.#config.executablePath,
      args: [
        ...(this.#config.executableArguments ?? []),
        ...tessdataArguments,
        "stdin",
        "stdout",
        "-l",
        this.#config.languages.join("+"),
        "--oem",
        "1",
        "--psm",
        "3",
        "tsv",
      ],
      input: input.imageBytes,
      timeoutMilliseconds: SUGGESTION_LIMITS.perPageOcrTimeoutMilliseconds,
      maxOutputBytes: SUGGESTION_LIMITS.maxOcrProcessOutputBytes,
      ...(signal === undefined ? {} : { signal }),
    });
    const parsed = parseTsv(result.stdout);
    if (!parsed.text) {
      return { status: "no_text", text: "", confidence: parsed.confidence, engine: this.#config.engineId };
    }
    if (!supportedScript(parsed.text)) {
      return { status: "unsupported_script", text: "", confidence: parsed.confidence, engine: this.#config.engineId };
    }
    if (parsed.confidence === null || parsed.confidence < SUGGESTION_LIMITS.minimumOcrConfidence) {
      return { status: "low_confidence", text: "", confidence: parsed.confidence, engine: this.#config.engineId };
    }
    return { status: "recognized", text: parsed.text, confidence: parsed.confidence, engine: this.#config.engineId };
  }

  #ensureReady(signal?: AbortSignal): Promise<void> {
    this.#readiness ??= this.#probe();
    if (signal === undefined) return this.#readiness;
    if (signal.aborted) return Promise.reject(new OcrError("aborted"));
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => reject(new OcrError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      this.#readiness!.then(
        () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  async #probe(): Promise<void> {
    const prefix = this.#config.executableArguments ?? [];
    const version = await runBoundedProcess({
      executablePath: this.#config.executablePath,
      args: [...prefix, "--version"],
      timeoutMilliseconds: 2_000,
      maxOutputBytes: 64 * 1024,
    });
    const versionText = new TextDecoder().decode(version.stdout);
    if (!new RegExp(`^tesseract\\s+${this.#config.expectedVersion.replaceAll(".", "\\.")}(?:\\s|$)`, "iu").test(versionText)) {
      throw new OcrError("engine_version_mismatch");
    }
    const tessdataArguments = this.#config.tessdataPath === undefined
      ? []
      : ["--tessdata-dir", this.#config.tessdataPath];
    const languages = await runBoundedProcess({
      executablePath: this.#config.executablePath,
      args: [...prefix, ...tessdataArguments, "--list-langs"],
      timeoutMilliseconds: 2_000,
      maxOutputBytes: 64 * 1024,
    });
    const installed = new Set(new TextDecoder().decode(languages.stdout).split(/\s+/u).filter(Boolean));
    if (this.#config.languages.some((language) => !installed.has(language))) {
      throw new OcrError("language_data_unavailable");
    }
  }
}
