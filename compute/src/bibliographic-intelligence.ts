import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import {
  INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES,
  INTELLIGENT_CONTRIBUTOR_ROLES,
  INTELLIGENT_EDITION_TYPES,
  INTELLIGENT_MATERIAL_CLASSES,
  parseIntelligentCanonicalBibliography,
  parseIntelligentBibliographyResult,
  type IntelligentCanonicalBibliography,
  type IntelligentBibliographyResult,
} from "@academiccloud/compute-contracts";

import { classifySuggestionPage } from "./extractor.js";
import type { PdfTextInspection } from "./suggestion.js";

export const INTELLIGENT_RULESET_VERSION = "l1-intelligent-library01-v1" as const;
export const INTELLIGENT_PROMPT_VERSION = "l1-intelligent-library01-prompt-v1" as const;
export const PADDLE_OCR_PACKAGE_VERSION = "3.7.0" as const;
export const PADDLE_RUNTIME_VERSION = "3.3.1" as const;
export const PADDLE_DETECTION_MODEL = Object.freeze({
  name: "PP-OCRv6_small_det" as const,
  revision: "106c97591b235f607453300d9fc8c1cad1b25488",
  sha256: "5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da",
});
export const PADDLE_RECOGNITION_MODEL = Object.freeze({
  name: "PP-OCRv6_small_rec" as const,
  revision: "bd619643acac4b9650c040234da8d944476ee3f1",
  sha256: "406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907",
});
export const QWEN_REASONING_MODEL = Object.freeze({
  family: "Qwen3" as const,
  name: "Qwen3-1.7B-GGUF" as const,
  revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
  sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
  quantization: "Q8_0" as const,
});
export const LLAMA_RUNTIME = Object.freeze({
  family: "llama.cpp" as const,
  version: "b10218",
  revision: "de69995",
  sha256: "78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b",
});

const PAGE_SOURCES = ["title_page", "copyright_page", "cip_page", "colophon", "series_page"] as const;
const MODEL_WARNING_CODES = [
  "uncertain_title",
  "uncertain_material_class",
  "uncertain_contributor",
  "uncertain_publication",
  "uncertain_edition",
  "conflicting_evidence",
] as const;
const AUTO_APPLY_CONFIDENCE = 85;
const MAX_REASONING_INPUT_CHARACTERS = 64 * 1024;
const MAX_REASONING_OUTPUT_BYTES = 384 * 1024;
export const QWEN_MAX_COMPLETION_TOKENS = 4_096;
const SERVER_START_TIMEOUT_MILLISECONDS = 120_000;
// Two GitHub-hosted CPU cores can require more than three minutes to emit the
// complete strict bibliography object. Keep this below the worker's bounded
// twelve-minute claim step while allowing the pinned local model to finish.
const SERVER_INFERENCE_TIMEOUT_MILLISECONDS = 420_000;

export class BibliographicIntelligenceError extends Error {
  constructor(
    readonly code: "invalid_result" | "reasoner_unavailable" | "reasoner_timeout",
    readonly diagnostic:
      | "unspecified"
      | "server_exited"
      | "request_failed"
      | "http_non_ok"
      | "response_too_large"
      | "response_json_invalid"
      | "content_missing"
      | "content_truncated"
      | "content_json_invalid"
      | "canonical_schema_invalid"
      | "field_evidence_invalid"
      | "result_schema_invalid" = "unspecified",
  ) {
    super(code);
    this.name = "BibliographicIntelligenceError";
  }
}

export interface BibliographicReasoner {
  infer(prompt: string, signal?: AbortSignal): Promise<unknown>;
  close?(): Promise<void> | void;
}

export interface LlamaReasonerConfig {
  executablePath: string;
  modelPath: string;
  gpuLayers: number;
}

export function parseLlamaChatCompletionResponse(bytes: Uint8Array): unknown {
  if (bytes.byteLength > MAX_REASONING_OUTPUT_BYTES) {
    throw new BibliographicIntelligenceError("invalid_result", "response_too_large");
  }
  let payload: { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> };
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as typeof payload;
  } catch {
    throw new BibliographicIntelligenceError("invalid_result", "response_json_invalid");
  }
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new BibliographicIntelligenceError("invalid_result", "content_truncated");
  }
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.length > MAX_REASONING_OUTPUT_BYTES) {
    throw new BibliographicIntelligenceError("invalid_result", "content_missing");
  }
  const normalized = content.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new BibliographicIntelligenceError("invalid_result", "content_json_invalid");
  }
}

function boundedPath(label: string, value: string | undefined, fallback: string): string {
  const result = value?.trim() || fallback;
  if (result.length < 1 || result.length > 1_024 || /[\u0000\r\n]/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function boundedGpuLayers(value: string | undefined): number {
  const normalized = value?.trim() || "0";
  if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(normalized)) throw new Error("BIBLIOGRAPHY_LLAMA_GPU_LAYERS is invalid");
  const result = Number(normalized);
  if (result > 999) throw new Error("BIBLIOGRAPHY_LLAMA_GPU_LAYERS is invalid");
  return result;
}

export function loadLlamaReasonerConfig(environment: NodeJS.ProcessEnv = process.env): LlamaReasonerConfig {
  const production = environment.NODE_ENV === "production";
  const releaseExecutable = fileURLToPath(new URL("../../runtime/llama/bin/llama-server", import.meta.url));
  const releaseModel = fileURLToPath(new URL("../../runtime/qwen/Qwen3-1.7B-Q8_0.gguf", import.meta.url));
  if (production && (environment.BIBLIOGRAPHY_LLAMA_SERVER_PATH !== undefined || environment.BIBLIOGRAPHY_QWEN_MODEL_PATH !== undefined)) {
    throw new Error("production reasoning runtime paths are release-local and cannot be overridden");
  }
  return {
    executablePath: boundedPath("BIBLIOGRAPHY_LLAMA_SERVER_PATH", production ? releaseExecutable : environment.BIBLIOGRAPHY_LLAMA_SERVER_PATH, "llama-server"),
    modelPath: boundedPath("BIBLIOGRAPHY_QWEN_MODEL_PATH", production ? releaseModel : environment.BIBLIOGRAPHY_QWEN_MODEL_PATH, "Qwen3-1.7B-Q8_0.gguf"),
    gpuLayers: boundedGpuLayers(environment.BIBLIOGRAPHY_LLAMA_GPU_LAYERS),
  };
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function boundedAbort(timeoutMilliseconds: number, parent?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  const onAbort = (): void => controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

async function waitForServer(origin: string, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${origin}/health`, { signal });
      if (response.ok) return;
    } catch (error: unknown) {
      if (signal.aborted) throw error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
  throw new BibliographicIntelligenceError("reasoner_timeout");
}

const MODEL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "overallConfidence", "canonical", "fields", "warnings"],
  properties: {
    status: { type: "string", enum: ["auto_apply", "ambiguous", "no_bibliography"] },
    overallConfidence: { type: "integer", minimum: 0, maximum: 100 },
    canonical: {
      anyOf: [{ type: "null" }, {
        type: "object", additionalProperties: false,
        required: ["materialClass", "canonicalTitle"],
        properties: {
          materialClass: { type: "string", enum: INTELLIGENT_MATERIAL_CLASSES },
          canonicalTitle: { type: "string" }, subtitle: { type: "string" },
          alternativeTitles: { type: "array", items: { type: "string" }, maxItems: 32 },
          dateStatement: { type: "string" },
          identifiers: { type: "array", maxItems: 32, items: { type: "object", additionalProperties: false, required: ["scheme", "value"], properties: { scheme: { type: "string" }, value: { type: "string" } } } },
          contributors: { type: "array", maxItems: 64, items: { type: "object", additionalProperties: false, required: ["label", "role"], properties: { label: { type: "string" }, role: { type: "string", enum: INTELLIGENT_CONTRIBUTOR_ROLES }, roleLabel: { type: "string" } } } },
          publication: { type: "object", additionalProperties: false, properties: { publisher: { type: "string" }, place: { type: "string" }, publicationDate: { type: "string" }, editionNumber: { type: "string" }, printing: { type: "string" } } },
          series: { type: "string" }, volume: { type: "string" }, language: { type: "string" },
          carrierEdition: { type: "object", additionalProperties: false, properties: { editionType: { type: "string", enum: INTELLIGENT_EDITION_TYPES }, editionStatement: { type: "string" }, facsimileStatement: { type: "string" } } },
          sourceEdition: { type: "object", additionalProperties: false, properties: { dynasty: { type: "string" }, reignTitle: { type: "string" }, reignYear: { type: "string" }, absoluteYear: { type: "integer" }, printer: { type: "string" }, imprint: { type: "string" }, bookshop: { type: "string" }, institution: { type: "string" }, printingPlace: { type: "string" }, editionType: { type: "string", enum: INTELLIGENT_EDITION_TYPES }, editionStatement: { type: "string" }, holdingInformation: { type: "string" } } },
        },
      }],
    },
    fields: { type: "array", maxItems: 128, items: { type: "object", additionalProperties: false, required: ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin"], properties: { fieldName: { type: "string", enum: INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES }, scopeKey: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 }, sourcePageIndex: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] }, evidenceOrigin: { type: "string", enum: ["native_text", "ocr", "embedded_pdf_metadata"] } } } },
    warnings: { type: "array", maxItems: 32, items: { type: "string", enum: MODEL_WARNING_CODES } },
  },
} as const;

function sparseRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BibliographicIntelligenceError("invalid_result");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new BibliographicIntelligenceError("invalid_result");
  return input;
}

function supplied(input: Record<string, unknown>, key: string, fallback: unknown): unknown {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}

function optionalText(input: Record<string, unknown>, key: string): string | null {
  const value = supplied(input, key, null);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function inspectionText(inspection: PdfTextInspection): string {
  return inspection.pages.map((page) => page.text).join("\n").normalize("NFKC");
}

function compactInspectionText(inspection: PdfTextInspection): string {
  return inspectionText(inspection).replace(/[\s\p{P}\p{S}]+/gu, "");
}

function uniqueLabeledValue(inspection: PdfTextInspection, labels: string[]): string | null {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labels.join("|")})\\s*[:：]?\\s*([^\\r\\n]{1,300})`, "gu");
  const values = [...inspectionText(inspection).matchAll(pattern)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((value) => value.length > 0);
  const unique = [...new Map(values.map((value) => [compactKey(value), value])).values()];
  return unique.length === 1 ? unique[0]! : null;
}

function authoritativeContributors(inspection: PdfTextInspection): Array<Record<string, unknown>> | null {
  const labeled: Array<{ labels: string[]; role: string }> = [
    { labels: ["作者", "著者", "撰者"], role: "author" },
    { labels: ["主编", "主編", "编者", "編者"], role: "editor" },
    { labels: ["译者", "譯者"], role: "translator" },
  ];
  const contributors = labeled.flatMap(({ labels, role }) => {
    const value = uniqueLabeledValue(inspection, labels);
    return value === null ? [] : [{ label: value, role, roleLabel: null }];
  });
  return contributors.length > 0 ? contributors : null;
}

function authoritativeMaterialClass(inspection: PdfTextInspection, modelClass: unknown): unknown {
  const text = inspectionText(inspection);
  const compact = compactInspectionText(inspection);
  if (/(?:文章题名|文章題名|篇名)/u.test(compact) && /(?:刊名|期号|期號|第[0-9一二三四五六七八九十百]+期)/u.test(compact)) {
    return "journal_article";
  }
  if (/(?:现代载体版本|現代載體版本|影印说明|影印說明|点校本|點校本|校注本|校註本|整理本)/u.test(compact)) {
    return "primary_source_modern_edition";
  }
  if (/(?:历史源版本|歷史源版本|繁体直排|繁體直排)/u.test(compact)
    || (/(?:元|明|清|宋|唐|汉|漢|隋|晋|晉)[^\n]{0,24}(?:年|朝)/u.test(text)
      && /(?:刻本|钞本|鈔本|抄本|写本|寫本|活字本|武英殿)/u.test(compact))) {
    return "traditional_book";
  }
  return modelClass;
}

function authoritativeCarrierEdition(inspection: PdfTextInspection, model: Record<string, unknown>): Record<string, unknown> {
  const compact = compactInspectionText(inspection);
  if (/(?:现代载体版本|現代載體版本)?影印本|(?:影印说明|影印說明)/u.test(compact)) {
    return {
      ...model,
      editionType: "facsimile",
      editionStatement: optionalText(model, "editionStatement") ?? "影印本",
    };
  }
  if (/(?:点校本|點校本|校注本|校註本)/u.test(compact)) {
    return {
      ...model,
      editionType: "critical_edition",
      editionStatement: optionalText(model, "editionStatement") ?? (/点校本|點校本/u.test(compact) ? "点校本" : "校注本"),
    };
  }
  return model;
}

function authoritativeSourceEdition(inspection: PdfTextInspection, model: Record<string, unknown>): Record<string, unknown> {
  const compact = compactInspectionText(inspection);
  const dynasty = compact.match(/(?:历史源版本|歷史源版本)?(元|明|清|宋|唐|汉|漢|隋|晋|晉)(?:[^代]{0,8})(?:年|朝|刻本|钞本|鈔本|抄本|写本|寫本|活字本)/u)?.[1];
  return dynasty ? { ...model, dynasty } : model;
}

function normalizeSparseCanonical(value: unknown, inspection: PdfTextInspection): unknown {
  if (value === null) return null;
  const input = sparseRecord(value, ["materialClass", "canonicalTitle", "subtitle", "alternativeTitles", "dateStatement", "identifiers", "contributors", "publication", "series", "volume", "language", "carrierEdition", "sourceEdition"]);
  const materialClass = authoritativeMaterialClass(inspection, input.materialClass);
  const contributors = authoritativeContributors(inspection) ?? supplied(input, "contributors", []);
  if (!Array.isArray(contributors)) throw new BibliographicIntelligenceError("invalid_result");
  const publication = sparseRecord(supplied(input, "publication", {}), ["publisher", "place", "publicationDate", "editionNumber", "printing"]);
  const authoritativePublisher = uniqueLabeledValue(inspection, ["出版社", "出版者"]);
  const authoritativePlace = uniqueLabeledValue(inspection, ["出版地"]);
  const authoritativeDate = uniqueLabeledValue(inspection, ["出版日期", "出版年"]);
  const carrier = authoritativeCarrierEdition(inspection, sparseRecord(supplied(input, "carrierEdition", {}), ["editionType", "editionStatement", "facsimileStatement"]));
  const sourceInput = authoritativeSourceEdition(inspection, sparseRecord(supplied(input, "sourceEdition", {}), ["dynasty", "reignTitle", "reignYear", "absoluteYear", "printer", "imprint", "bookshop", "institution", "printingPlace", "editionType", "editionStatement", "holdingInformation"]));
  const explicitSourceEdition = /(?:历史源版本|歷史源版本|据|據)[^\n]{0,80}(?:刻本|钞本|鈔本|抄本|写本|寫本|活字本|底本|原本)/u.test(inspectionText(inspection));
  const source = typeof materialClass === "string" && (
    ["scholarly_monograph", "edited_volume", "journal_article", "book_chapter", "thesis_dissertation", "conference_paper", "review", "reference_work", "dictionary_lexicon"].includes(materialClass)
    || (materialClass === "primary_source_modern_edition" && !explicitSourceEdition)
  ) ? {} : sourceInput;
  const publisherValue = authoritativePublisher ?? optionalText(publication, "publisher");
  const publisherKey = publisherValue === null ? null : compactKey(publisherValue);
  const normalizedContributors = contributors.map((value) => sparseRecord(value, ["label", "role", "roleLabel"]))
    .filter((contributor) => typeof contributor.label !== "string" || (
      compactKey(contributor.label) !== publisherKey
      && !/(?:出版社|出版公司|press|publishing)$/iu.test(contributor.label.trim())
    ));
  const identifiers = supplied(input, "identifiers", []);
  if (!Array.isArray(identifiers)) throw new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid");
  const normalizedIdentifiers = [...new Map(identifiers.flatMap((value) => {
    let identifier: Record<string, unknown>;
    try {
      identifier = sparseRecord(value, ["scheme", "value"]);
    } catch {
      return [];
    }
    const scheme = typeof identifier.scheme === "string" ? identifier.scheme.normalize("NFC").trim().toLocaleLowerCase() : "";
    const identifierValue = typeof identifier.value === "string" ? identifier.value.normalize("NFC").trim() : "";
    if (!scheme || scheme.length > 32 || !identifierValue || identifierValue.length > 128
      || (scheme === "isbn" && !validIsbn(identifierValue))) return [];
    return [[`${scheme}\u0000${identifierValue}`, { scheme, value: identifierValue }] as const];
  })).values()];
  const alternativeTitles = supplied(input, "alternativeTitles", []);
  if (!Array.isArray(alternativeTitles)) throw new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid");
  const normalizedAlternativeTitles = [...new Map(alternativeTitles.flatMap((value) => {
    if (typeof value !== "string") return [];
    const title = value.normalize("NFC").trim();
    const key = compactKey(title);
    return !title || !key || [...title].length > 512 ? [] : [[key, title] as const];
  })).values()].slice(0, 32);
  return {
    materialClass,
    canonicalTitle: uniqueLabeledValue(inspection, ["文章题名", "文章題名", "题名页题名", "題名頁題名", "封面题名", "封面題名", "题名", "題名", "书名", "書名"]) ?? input.canonicalTitle,
    subtitle: optionalText(input, "subtitle"),
    alternativeTitles: normalizedAlternativeTitles,
    dateStatement: optionalText(input, "dateStatement"),
    identifiers: normalizedIdentifiers,
    contributors: normalizedContributors.map((contributor) => {
      return { label: contributor.label, role: contributor.role, roleLabel: supplied(contributor, "roleLabel", null) };
    }),
    publication: {
      publisher: publisherValue,
      place: authoritativePlace ?? optionalText(publication, "place"),
      publicationDate: authoritativeDate ?? optionalText(publication, "publicationDate"),
      editionNumber: optionalText(publication, "editionNumber"),
      printing: optionalText(publication, "printing"),
    },
    series: optionalText(input, "series"),
    volume: optionalText(input, "volume"),
    language: optionalText(input, "language"),
    carrierEdition: {
      editionType: supplied(carrier, "editionType", null),
      editionStatement: optionalText(carrier, "editionStatement"),
      facsimileStatement: optionalText(carrier, "facsimileStatement"),
    },
    sourceEdition: {
      dynasty: optionalText(source, "dynasty"),
      reignTitle: optionalText(source, "reignTitle"),
      reignYear: optionalText(source, "reignYear"),
      absoluteYear: supplied(source, "absoluteYear", null),
      printer: optionalText(source, "printer"),
      imprint: optionalText(source, "imprint"),
      bookshop: optionalText(source, "bookshop"),
      institution: optionalText(source, "institution"),
      printingPlace: optionalText(source, "printingPlace"),
      editionType: supplied(source, "editionType", null),
      editionStatement: optionalText(source, "editionStatement"),
      holdingInformation: optionalText(source, "holdingInformation"),
    },
  };
}

export class LlamaServerBibliographicReasoner implements BibliographicReasoner {
  readonly #config: LlamaReasonerConfig;
  #server: { origin: string; child: ReturnType<typeof spawn>; exited: Promise<void> } | undefined;

  constructor(config: LlamaReasonerConfig = loadLlamaReasonerConfig()) {
    this.#config = config;
  }

  async infer(prompt: string, signal?: AbortSignal): Promise<unknown> {
    const server = await this.#ensureServer(signal);
    try {
      const inference = boundedAbort(SERVER_INFERENCE_TIMEOUT_MILLISECONDS, signal);
      let response: Response;
      try {
        const outcome = await Promise.race([
          fetch(`${server.origin}/v1/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: inference.signal,
            body: JSON.stringify({
              model: QWEN_REASONING_MODEL.name,
              temperature: 0,
              seed: 0,
              max_tokens: QWEN_MAX_COMPLETION_TOKENS,
              messages: [
                { role: "system", content: "You extract bibliographic facts from bounded front/back matter. Return only schema-valid JSON. Never guess, never promote filenames, and keep physical carrier edition separate from historical source edition. /no_think" },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_schema", json_schema: { name: "academiccloud_bibliography", strict: true, schema: MODEL_OUTPUT_SCHEMA } },
              chat_template_kwargs: { enable_thinking: false },
            }),
          }),
          server.exited.then(() => null),
        ]);
        if (outcome === null) throw new BibliographicIntelligenceError("reasoner_unavailable", "server_exited");
        response = outcome;
      } catch (error: unknown) {
        if (inference.signal.aborted) {
          this.#invalidateServer(server);
          throw new BibliographicIntelligenceError("reasoner_timeout");
        }
        if (error instanceof BibliographicIntelligenceError) throw error;
        this.#invalidateServer(server);
        throw new BibliographicIntelligenceError("reasoner_unavailable", "request_failed");
      } finally {
        inference.dispose();
      }
      if (!response.ok) {
        this.#invalidateServer(server);
        throw new BibliographicIntelligenceError("reasoner_unavailable", "http_non_ok");
      }
      return parseLlamaChatCompletionResponse(new Uint8Array(await response.arrayBuffer()));
    } catch (error: unknown) {
      if (error instanceof BibliographicIntelligenceError) throw error;
      throw new BibliographicIntelligenceError("reasoner_unavailable");
    }
  }

  async close(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    if (!server) return;
    server.child.kill("SIGKILL");
    await server.exited;
  }

  #invalidateServer(server: { origin: string; child: ReturnType<typeof spawn>; exited: Promise<void> }): void {
    if (this.#server === server) this.#server = undefined;
    server.child.kill("SIGKILL");
  }

  async #ensureServer(signal?: AbortSignal): Promise<{ origin: string; child: ReturnType<typeof spawn>; exited: Promise<void> }> {
    if (this.#server) return this.#server;
    const port = await allocatePort();
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(this.#config.executablePath, [
      "--model", this.#config.modelPath,
      "--host", "127.0.0.1",
      "--port", String(port),
      "--ctx-size", "8192",
      "--threads", "2",
      "--parallel", "1",
      "--gpu-layers", String(this.#config.gpuLayers),
      "--no-webui",
      "--log-disable",
    ], { shell: false, stdio: ["ignore", "ignore", "pipe"], windowsHide: true, env: { PATH: process.env.PATH, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
    child.stderr?.on("data", () => undefined);
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const server = { origin, child, exited };
    this.#server = server;
    void exited.then(() => {
      if (this.#server === server) this.#server = undefined;
    });
    const startup = boundedAbort(SERVER_START_TIMEOUT_MILLISECONDS, signal);
    try {
      const outcome = await Promise.race([waitForServer(origin, startup.signal).then(() => true), exited.then(() => false)]);
      if (!outcome) throw new BibliographicIntelligenceError("reasoner_unavailable", "server_exited");
      return server;
    } catch (error: unknown) {
      child.kill("SIGKILL");
      this.#server = undefined;
      if (startup.signal.aborted) throw new BibliographicIntelligenceError("reasoner_timeout");
      if (error instanceof BibliographicIntelligenceError) throw error;
      throw new BibliographicIntelligenceError("reasoner_unavailable");
    } finally {
      startup.dispose();
    }
  }
}

function promptFor(inspection: PdfTextInspection): string {
  const pages: Array<{ pageIndex: number; pageClass: string; evidenceOrigin: string; text: string }> = [];
  let remaining = MAX_REASONING_INPUT_CHARACTERS;
  for (const page of inspection.pages) {
    if (remaining <= 0) break;
    const text = page.text.normalize("NFC").slice(0, Math.min(8_192, remaining));
    remaining -= text.length;
    pages.push({ pageIndex: page.pageIndex, pageClass: classifySuggestionPage(page), evidenceOrigin: page.evidenceOrigin ?? "native_text", text });
  }
  return JSON.stringify({
    task: "Extract only directly supported canonical bibliographic facts. Canonical output is sparse: omit unsupported optional keys instead of emitting null placeholders. Never emit a publisher as a contributor. Omit sourceEdition for modern scholarly works; preserve it only for supported primary-source/traditional evidence. Explicit 题名/書名/作者/著者/出版社/出版年 labels without conflict MUST use auto_apply with confidence >=90 and no warning. Explicit 文章题名 plus 刊名/期号 means journal_article. Use contributor:N scope keys. Every populated fact needs one field evidence row that points only to the supplied pageIndex/evidenceOrigin; the trusted runtime derives page class and source type. warnings may use only the supplied controlled warning codes and must never quote source text. Return ambiguous with a warning code only when facts genuinely conflict or remain unsupported.",
    controlledValues: { materialClasses: INTELLIGENT_MATERIAL_CLASSES, contributorRoles: INTELLIGENT_CONTRIBUTOR_ROLES, editionTypes: INTELLIGENT_EDITION_TYPES },
    controlledWarnings: MODEL_WARNING_CODES,
    embeddedMetadata: inspection.embeddedMetadata,
    pages,
  });
}

function normalizedModelWarnings(
  value: unknown[],
  inspection: PdfTextInspection,
  canonical: IntelligentCanonicalBibliography | null,
): string[] {
  const normalized = value.map((entry) => (
    typeof entry === "string" && MODEL_WARNING_CODES.includes(entry as (typeof MODEL_WARNING_CODES)[number])
      ? entry
      : "model_uncertainty"
  ));
  const text = inspectionText(inspection);
  const compact = compactInspectionText(inspection);
  const explicitTitle = hasExplicitUnconflictedTitleEvidence(inspection);
  const explicitContributor = /(?:作者|著者|编者|編者|撰者|译者|譯者)\s*[:：]?\s*\S+/u.test(text);
  const explicitPublication = /(?:出版社|出版者|出版地|出版日期|出版年)\s*[:：]?\s*\S+/u.test(text);
  const explicitEdition = /(?:历史源版本|歷史源版本|现代载体版本|現代載體版本|影印本|点校本|點校本|校注本|校註本|刻本|钞本|鈔本|抄本|写本|寫本|活字本)/u.test(compact);
  const explicitClass = authoritativeMaterialClass(inspection, "unknown") !== "unknown";
  const hasPublicationFact = canonical !== null && Object.values(canonical.publication).some((entry) => entry !== null);
  const hasEditionFact = canonical !== null && (
    Object.values(canonical.carrierEdition).some((entry) => entry !== null)
    || Object.values(canonical.sourceEdition).some((entry) => entry !== null)
  );
  return [...new Set(normalized)].filter((warning) => {
    if (warning === "uncertain_title" && explicitTitle) return false;
    if (warning === "uncertain_material_class" && explicitClass) return false;
    if (warning === "uncertain_contributor" && explicitContributor) return false;
    if (warning === "uncertain_publication" && (explicitPublication || !hasPublicationFact)) return false;
    if (warning === "uncertain_edition" && (explicitEdition || !hasEditionFact)) return false;
    return true;
  });
}

function hasExplicitUnconflictedTitleEvidence(inspection: PdfTextInspection): boolean {
  const text = inspection.pages.map((page) => page.text).join("\n").normalize("NFKC");
  const hasTitleLabel = /(?:文章题名|文章題名|题名页题名|題名頁題名|封面题名|封面題名|题名|題名|书名|書名)\s*[:：]?\s*\S+/u.test(text);
  const declaresConflict = /(?:冲突|衝突|无法确认|無法確認|不能确认|不能確認|不详|不詳|矛盾|conflict|uncertain)/iu.test(text);
  return hasTitleLabel && !declaresConflict;
}

function discardUnresolvedModelFacts(
  canonical: IntelligentCanonicalBibliography,
  warnings: unknown[],
  inspection: PdfTextInspection,
): IntelligentCanonicalBibliography {
  const codes = new Set(warnings.filter((entry): entry is string => typeof entry === "string"));
  const text = inspectionText(inspection);
  const compact = compactInspectionText(inspection);
  const explicitContributor = /(?:作者|著者|编者|編者|撰者|译者|譯者)\s*[:：]?\s*\S+/u.test(text);
  const explicitPublication = /(?:出版社|出版者|出版地|出版日期|出版年)\s*[:：]?\s*\S+/u.test(text);
  const explicitEdition = /(?:历史源版本|歷史源版本|现代载体版本|現代載體版本|影印本|点校本|點校本|校注本|校註本|刻本|钞本|鈔本|抄本|写本|寫本|活字本)/u.test(compact);
  return parseIntelligentCanonicalBibliography({
    ...canonical,
    contributors: codes.has("uncertain_contributor") && !explicitContributor ? [] : canonical.contributors,
    publication: codes.has("uncertain_publication") && !explicitPublication
      ? { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null }
      : canonical.publication,
    carrierEdition: codes.has("uncertain_edition") && !explicitEdition
      ? { editionType: null, editionStatement: null, facsimileStatement: null }
      : canonical.carrierEdition,
    sourceEdition: codes.has("uncertain_edition") && !explicitEdition
      ? { dynasty: null, reignTitle: null, reignYear: null, absoluteYear: null, printer: null, imprint: null, bookshop: null, institution: null, printingPlace: null, editionType: null, editionStatement: null, holdingInformation: null }
      : canonical.sourceEdition,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceTypeFor(pageClass: ReturnType<typeof classifySuggestionPage>): (typeof PAGE_SOURCES)[number] | undefined {
  if (pageClass === "cover" || pageClass === "half_title" || pageClass === "title_page") return "title_page";
  if (pageClass === "copyright_page" || pageClass === "cip_page" || pageClass === "colophon" || pageClass === "series_page") return pageClass;
  return undefined;
}

function authoritativeEvidence(field: unknown, inspection: PdfTextInspection): Record<string, unknown> {
  const input = sparseRecord(field, ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin"]);
  if (input.evidenceOrigin === "embedded_pdf_metadata") {
    if (input.sourcePageIndex !== null) throw new BibliographicIntelligenceError("invalid_result");
    return {
      ...input,
      sourceType: "embedded_pdf_metadata",
      pageClass: null,
      evidenceSha256: sha256(JSON.stringify(inspection.embeddedMetadata)),
    };
  }
  if (!Number.isSafeInteger(input.sourcePageIndex)) throw new BibliographicIntelligenceError("invalid_result");
  const page = inspection.pages.find((entry) => entry.pageIndex === input.sourcePageIndex);
  if (!page || page.evidenceOrigin !== input.evidenceOrigin) throw new BibliographicIntelligenceError("invalid_result");
  const pageClass = classifySuggestionPage(page);
  const sourceType = sourceTypeFor(pageClass);
  if (!sourceType) throw new BibliographicIntelligenceError("invalid_result");
  return { ...input, sourceType, pageClass, evidenceSha256: sha256(page.text) };
}

function singlePageEvidence(
  canonical: IntelligentCanonicalBibliography,
  modelFields: unknown[],
  inspection: PdfTextInspection,
  overallConfidence: unknown,
): Array<Record<string, unknown>> {
  const page = inspection.pages[0];
  if (!page || inspection.pages.length !== 1 || inspection.pageIndices.length !== 1 || inspection.pageIndices[0] !== page.pageIndex
    || !Number.isSafeInteger(overallConfidence)) throw new BibliographicIntelligenceError("invalid_result");
  const confidenceByField = new Map<string, number>();
  for (const value of modelFields) {
    const field = sparseRecord(value, ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin"]);
    if (typeof field.fieldName !== "string" || !INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES.includes(field.fieldName as (typeof INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES)[number])
      || typeof field.scopeKey !== "string" || !Number.isSafeInteger(field.confidence)
      || (field.confidence as number) < 0 || (field.confidence as number) > 100
      || field.sourcePageIndex !== page.pageIndex || field.evidenceOrigin !== (page.evidenceOrigin ?? "native_text")) {
      throw new BibliographicIntelligenceError("invalid_result");
    }
    const key = `${field.fieldName}:${field.scopeKey}`;
    confidenceByField.set(key, Math.min(confidenceByField.get(key) ?? 100, field.confidence as number));
  }
  return [...populatedFieldKeys(canonical)].map((key) => {
    const separator = key.indexOf(":");
    return authoritativeEvidence({
      fieldName: key.slice(0, separator),
      scopeKey: key.slice(separator + 1),
      confidence: Math.min(overallConfidence as number, confidenceByField.get(key) ?? overallConfidence as number),
      sourcePageIndex: page.pageIndex,
      evidenceOrigin: page.evidenceOrigin ?? "native_text",
    }, inspection);
  });
}

function multiPageEvidence(
  canonical: IntelligentCanonicalBibliography,
  modelFields: unknown[],
  inspection: PdfTextInspection,
): Array<Record<string, unknown>> {
  const required = populatedFieldKeys(canonical);
  const fields = new Map<string, Record<string, unknown>>();
  for (const value of modelFields) {
    let field: Record<string, unknown>;
    try {
      field = sparseRecord(value, ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin"]);
    } catch {
      continue;
    }
    if (typeof field.fieldName !== "string" || typeof field.scopeKey !== "string") continue;
    const key = `${field.fieldName}:${field.scopeKey}`;
    // The strict model can return evidence for a fact removed by deterministic
    // normalization (for example an invalid ISBN or publisher-shaped
    // contributor). Such evidence is not a fact and must not poison the whole
    // otherwise valid result.
    if (!required.has(key)) continue;
    if (fields.has(key)) throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid");
    try {
      fields.set(key, authoritativeEvidence(field, inspection));
    } catch (error: unknown) {
      if (error instanceof BibliographicIntelligenceError) {
        throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid");
      }
      throw error;
    }
  }
  if (fields.size !== required.size || [...required].some((key) => !fields.has(key))) {
    throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid");
  }
  return [...fields.values()];
}

function compactKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function validIsbn(value: string): boolean {
  const compact = value.normalize("NFKC").replace(/[^0-9X]/giu, "").toUpperCase();
  if (compact.length === 10) return [...compact].reduce((sum, character, index) => sum + (character === "X" ? 10 : Number(character)) * (10 - index), 0) % 11 === 0;
  if (compact.length === 13) {
    const sum = [...compact.slice(0, 12)].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - sum % 10) % 10 === Number(compact[12]);
  }
  return false;
}

function populatedFieldKeys(canonical: IntelligentCanonicalBibliography): Set<string> {
  const fields = new Set<string>(["materialClass:", "canonicalTitle:"]);
  if (canonical.subtitle !== null) fields.add("subtitle:");
  if (canonical.alternativeTitles.length > 0) fields.add("alternativeTitles:");
  if (canonical.dateStatement !== null) fields.add("dateStatement:");
  if (canonical.identifiers.length > 0) fields.add("identifiers:");
  for (const [key, value] of Object.entries(canonical.publication)) if (value !== null) fields.add(`publication.${key}:`);
  for (const key of ["series", "volume", "language"] as const) if (canonical[key] !== null) fields.add(`${key}:`);
  for (const [key, value] of Object.entries(canonical.carrierEdition)) if (value !== null) fields.add(`carrierEdition.${key}:`);
  for (const [key, value] of Object.entries(canonical.sourceEdition)) if (value !== null) fields.add(`sourceEdition.${key}:`);
  canonical.contributors.forEach((contributor, index) => {
    fields.add(`contributor.label:contributor:${index}`);
    fields.add(`contributor.role:contributor:${index}`);
    if (contributor.roleLabel !== null) fields.add(`contributor.roleLabel:contributor:${index}`);
  });
  return fields;
}

function deterministicWarnings(result: IntelligentBibliographyResult): string[] {
  const canonical = result.canonical;
  if (!canonical) return [];
  const warnings: string[] = [];
  const titleKey = compactKey(canonical.canonicalTitle);
  if (/\.pdf$/iu.test(canonical.canonicalTitle) || /^(?:download|document|scan|untitled|academiccloud)/iu.test(titleKey)
    || /^[a-f0-9]{32,}$/iu.test(titleKey)) warnings.push("suspicious_title");
  if (canonical.subtitle !== null && compactKey(canonical.subtitle) === titleKey) warnings.push("duplicate_title_subtitle");
  if (/(?:作者|著者|主编|编者|译者|\bby\b)\s*[:：]?\s*[^—–-]+$/iu.test(canonical.canonicalTitle)) warnings.push("contributor_embedded_in_title");
  const publisher = canonical.publication.publisher === null ? null : compactKey(canonical.publication.publisher);
  if (publisher && canonical.contributors.some((entry) => compactKey(entry.label) === publisher)) warnings.push("publisher_as_contributor");
  if (canonical.contributors.some((entry) => /(?:出版社|出版公司|press|publishing)$/iu.test(entry.label))) warnings.push("publisher_shaped_contributor");
  if (canonical.identifiers.some((entry) => entry.scheme === "isbn" && !validIsbn(entry.value))) warnings.push("invalid_isbn");
  if (["scholarly_monograph", "edited_volume", "journal_article", "book_chapter", "thesis_dissertation", "conference_paper", "review", "reference_work", "dictionary_lexicon"].includes(canonical.materialClass)
    && Object.values(canonical.sourceEdition).some((entry) => entry !== null)) warnings.push("modern_carrier_source_edition_reversal");
  const required = populatedFieldKeys(canonical);
  const evidence = new Map(result.fields.map((field) => [`${field.fieldName}:${field.scopeKey}`, field]));
  if ([...required].some((key) => !evidence.has(key))) warnings.push("missing_field_provenance");
  if ([...required].some((key) => (evidence.get(key)?.confidence ?? 0) < AUTO_APPLY_CONFIDENCE)) warnings.push("field_confidence_below_auto_apply_gate");
  return [...new Set(warnings)];
}

export async function deriveIntelligentBibliography(
  inspection: PdfTextInspection,
  reasoner: BibliographicReasoner,
  signal?: AbortSignal,
  legacyFallback = false,
): Promise<IntelligentBibliographyResult> {
  const model = await reasoner.infer(promptFor(inspection), signal);
  const raw = sparseRecord(model, ["status", "overallConfidence", "canonical", "fields", "warnings"]);
  if (!Array.isArray(raw.fields) || !Array.isArray(raw.warnings)) throw new BibliographicIntelligenceError("invalid_result");
  let normalizedCanonical: IntelligentCanonicalBibliography | null;
  try {
    normalizedCanonical = raw.canonical === null ? null : parseIntelligentCanonicalBibliography(normalizeSparseCanonical(raw.canonical, inspection));
  } catch (error: unknown) {
    if (error instanceof BibliographicIntelligenceError) throw error;
    throw new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid");
  }
  let canonical: IntelligentCanonicalBibliography | null;
  try {
    canonical = normalizedCanonical === null ? null : discardUnresolvedModelFacts(normalizedCanonical, raw.warnings, inspection);
  } catch (error: unknown) {
    if (error instanceof BibliographicIntelligenceError) throw error;
    throw new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid");
  }
  const fields = canonical !== null && inspection.pages.length === 1
    ? singlePageEvidence(canonical, raw.fields, inspection, raw.overallConfidence)
    : canonical === null ? [] : multiPageEvidence(canonical, raw.fields, inspection);
  const requestedStatus = raw.status;
  // Parse model output first as non-authoritative evidence. Only the final pass
  // below may promote a schema-valid, deterministic-warning-free result to
  // auto_apply, so strict callback validation never depends on model self-rating.
  const preliminaryStatus = canonical === null ? "no_bibliography" : "ambiguous";
  let candidate: IntelligentBibliographyResult;
  try {
    candidate = parseIntelligentBibliographyResult({
    contractVersion: 1,
    rulesetVersion: INTELLIGENT_RULESET_VERSION,
    status: preliminaryStatus,
    overallConfidence: raw.overallConfidence,
    canonical,
    fields,
    warnings: normalizedModelWarnings(raw.warnings, inspection, canonical),
    provenance: {
      ocr: {
        used: inspection.pages.some((page) => page.evidenceOrigin === "ocr"),
        family: "PaddleOCR",
        packageVersion: PADDLE_OCR_PACKAGE_VERSION,
        runtimeFamily: "PaddlePaddle",
        runtimeVersion: PADDLE_RUNTIME_VERSION,
        detectionModel: PADDLE_DETECTION_MODEL,
        recognitionModel: PADDLE_RECOGNITION_MODEL,
        legacyFallback,
      },
      reasoning: {
        family: QWEN_REASONING_MODEL.family,
        name: QWEN_REASONING_MODEL.name,
        revision: QWEN_REASONING_MODEL.revision,
        sha256: QWEN_REASONING_MODEL.sha256,
        quantization: QWEN_REASONING_MODEL.quantization,
        runtimeFamily: LLAMA_RUNTIME.family,
        runtimeVersion: LLAMA_RUNTIME.version,
        runtimeRevision: LLAMA_RUNTIME.revision,
        runtimeSha256: LLAMA_RUNTIME.sha256,
      },
      selectedPages: [...inspection.pageIndices],
      promptVersion: INTELLIGENT_PROMPT_VERSION,
    },
    });
  } catch (error: unknown) {
    if (error instanceof BibliographicIntelligenceError) throw error;
    throw new BibliographicIntelligenceError("invalid_result", "result_schema_invalid");
  }
  if (candidate.status === "no_bibliography") return candidate;
  const warnings = [...new Set([...candidate.warnings, ...deterministicWarnings(candidate)])];
  const statusAllowsPromotion = requestedStatus === "auto_apply" || hasExplicitUnconflictedTitleEvidence(inspection);
  try {
    return parseIntelligentBibliographyResult({
      ...candidate,
      status: statusAllowsPromotion && candidate.overallConfidence >= AUTO_APPLY_CONFIDENCE && warnings.length === 0
        ? "auto_apply" : "ambiguous",
      warnings,
    });
  } catch (error: unknown) {
    if (error instanceof BibliographicIntelligenceError) throw error;
    throw new BibliographicIntelligenceError("invalid_result", "result_schema_invalid");
  }
}
