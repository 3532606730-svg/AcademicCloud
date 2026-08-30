import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import {
  INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES,
  INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION,
  INTELLIGENT_CONTRIBUTOR_ROLES,
  INTELLIGENT_EDITION_TYPES,
  INTELLIGENT_MATERIAL_CLASSES,
  parseIntelligentCanonicalBibliography,
  parseIntelligentBibliographyResult,
  type IntelligentCanonicalBibliography,
  type IntelligentBibliographyResult,
} from "@academiccloud/compute-contracts";

import { classifySuggestionPage } from "./extractor.js";
import { isUsableBibliographicEvidence, usableEmbeddedMetadata } from "./evidence-usability.js";
import type { PdfTextInspection } from "./suggestion.js";

export const INTELLIGENT_RULESET_VERSION = INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION;
export const INTELLIGENT_PROMPT_VERSION = "l1-intelligent-library01-prompt-v4" as const;
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
const CONTRIBUTOR_FIELD_NAMES = ["contributor.label", "contributor.role", "contributor.roleLabel"] as const;
const NON_CONTRIBUTOR_FIELD_NAMES = INTELLIGENT_BIBLIOGRAPHIC_FIELD_NAMES.filter(
  (fieldName) => !CONTRIBUTOR_FIELD_NAMES.includes(fieldName as (typeof CONTRIBUTOR_FIELD_NAMES)[number]),
);
const MODEL_FACT_FIELD_NAMES = NON_CONTRIBUTOR_FIELD_NAMES.filter((fieldName) => fieldName !== "materialClass");
const MATERIAL_CLASS_SUPPORT_SIGNALS = [
  "scholarly_analysis",
  "edited_collection",
  "serial_article",
  "chapter_container",
  "thesis",
  "conference",
  "review",
  "reference_work",
  "dictionary_lexicon",
  "historical_primary_work",
  "edition_mediation",
  "traditional_artifact",
  "archival_document",
  "inscription_epigraphy",
  "rubbing",
  "manuscript",
  "collected_documents",
  "catalogue_bibliography",
  "other_material",
] as const;
type MaterialClassSupportSignal = (typeof MATERIAL_CLASS_SUPPORT_SIGNALS)[number];
const AUTO_APPLY_CONFIDENCE = 85;
const MAX_REASONING_INPUT_CHARACTERS = 64 * 1024;
const MAX_REASONING_OUTPUT_BYTES = 384 * 1024;
export const QWEN_CONTEXT_TOKENS = 16_384;
export const QWEN_MAX_COMPLETION_TOKENS = 8_192;
// llama.cpp's grammar compiler rejects the deeply nested JSON Schema form used
// by the hosted API. Keep the transport-level constraint to generic JSON and
// retain the exact schema/authority validation in deriveIntelligentBibliography.
export const LLAMA_RESPONSE_FORMAT = Object.freeze({ type: "json_object" as const });
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
    readonly repairFieldKeys: readonly string[] = [],
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
  required: ["status", "overallConfidence", "canonical", "classSupport", "fields", "warnings"],
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
    classSupport: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"],
        properties: {
          signal: { type: "string", enum: MATERIAL_CLASS_SUPPORT_SIGNALS },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          sourcePageIndex: { type: "integer", minimum: 1 },
          evidenceOrigin: { type: "string", enum: ["native_text", "ocr"] },
          evidenceText: { type: "string", minLength: 1, maxLength: 2048 },
        },
      },
    },
    fields: {
      type: "array",
      maxItems: 128,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"],
            properties: {
              fieldName: { type: "string", enum: MODEL_FACT_FIELD_NAMES },
              scopeKey: { type: "string", const: "" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              sourcePageIndex: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
              evidenceOrigin: { type: "string", enum: ["native_text", "ocr", "embedded_pdf_metadata"] },
              evidenceText: { type: "string", minLength: 1, maxLength: 2048 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"],
            properties: {
              fieldName: { type: "string", enum: CONTRIBUTOR_FIELD_NAMES },
              scopeKey: { type: "string", pattern: "^contributor:(?:0|[1-9][0-9]*)$" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              sourcePageIndex: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
              evidenceOrigin: { type: "string", enum: ["native_text", "ocr", "embedded_pdf_metadata"] },
              evidenceText: { type: "string", minLength: 1, maxLength: 2048 },
            },
          },
        ],
      },
    },
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

function optionalText(input: Record<string, unknown>, key: string, maximumLength = 512): string | null {
  const value = supplied(input, key, null);
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim();
  return normalized.length > 0
    && [...normalized].length <= maximumLength
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)
    ? normalized : null;
}

function optionalEditionType(input: Record<string, unknown>, key: string): (typeof INTELLIGENT_EDITION_TYPES)[number] | null {
  const value = optionalText(input, key);
  return value !== null && INTELLIGENT_EDITION_TYPES.includes(value as (typeof INTELLIGENT_EDITION_TYPES)[number])
    ? value as (typeof INTELLIGENT_EDITION_TYPES)[number]
    : null;
}

function optionalAbsoluteYear(input: Record<string, unknown>, key: string): number | null {
  const value = supplied(input, key, null);
  return Number.isSafeInteger(value) && (value as number) >= -9_999 && (value as number) <= 9_999
    ? value as number
    : null;
}

function inspectionText(inspection: PdfTextInspection): string {
  return inspection.pages.map((page) => page.text).join("\n").normalize("NFKC");
}

function compactInspectionText(inspection: PdfTextInspection): string {
  return inspectionText(inspection).replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeSparseCanonical(value: unknown, inspection: PdfTextInspection): unknown {
  if (value === null) return null;
  const input = sparseRecord(value, ["materialClass", "canonicalTitle", "subtitle", "alternativeTitles", "dateStatement", "identifiers", "contributors", "publication", "series", "volume", "language", "carrierEdition", "sourceEdition"]);
  const publication = sparseRecord(supplied(input, "publication", {}), ["publisher", "place", "publicationDate", "editionNumber", "printing"]);
  const materialClass = typeof input.materialClass === "string"
    && INTELLIGENT_MATERIAL_CLASSES.includes(input.materialClass as (typeof INTELLIGENT_MATERIAL_CLASSES)[number])
    ? input.materialClass as (typeof INTELLIGENT_MATERIAL_CLASSES)[number]
    : "unknown";
  const contributors = supplied(input, "contributors", []);
  if (!Array.isArray(contributors)) throw new BibliographicIntelligenceError("invalid_result");
  const carrier = sparseRecord(supplied(input, "carrierEdition", {}), ["editionType", "editionStatement", "facsimileStatement"]);
  const source = sparseRecord(supplied(input, "sourceEdition", {}), ["dynasty", "reignTitle", "reignYear", "absoluteYear", "printer", "imprint", "bookshop", "institution", "printingPlace", "editionType", "editionStatement", "holdingInformation"]);
  const publisherValue = optionalText(publication, "publisher", 255);
  const publisherKey = publisherValue === null ? null : compactKey(publisherValue);
  const normalizedContributors = contributors.map((value) => sparseRecord(value, ["label", "role", "roleLabel"]))
    .filter((contributor) => typeof contributor.label !== "string" || (
      compactKey(contributor.label) !== publisherKey
      && !/(?:出版社|出版公司|press|publishing)$/iu.test(contributor.label.trim())
    ))
    // A model-invented publisher role is not a contributor. Unknown roles are
    // never coerced into a person role or allowed to poison supported facts.
    .filter((contributor) => typeof contributor.role === "string"
      && INTELLIGENT_CONTRIBUTOR_ROLES.includes(contributor.role as (typeof INTELLIGENT_CONTRIBUTOR_ROLES)[number]))
    // In generic JSON mode an explicit empty roleLabel is only a placeholder,
    // not positive evidence for a contributor role. Drop that unsupported fact;
    // a missing/null roleLabel still reaches the evidence validator fail closed.
    .filter((contributor) => contributor.roleLabel !== "");
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
    canonicalTitle: input.canonicalTitle,
    subtitle: optionalText(input, "subtitle", 512),
    alternativeTitles: normalizedAlternativeTitles,
    dateStatement: optionalText(input, "dateStatement", 64),
    identifiers: normalizedIdentifiers,
    contributors: normalizedContributors.map((contributor) => ({
      label: contributor.label,
      role: contributor.role,
      roleLabel: optionalText(contributor, "roleLabel", 64),
    })),
    publication: {
      publisher: publisherValue,
      place: optionalText(publication, "place", 255),
      publicationDate: optionalText(publication, "publicationDate", 64),
      editionNumber: optionalText(publication, "editionNumber", 128),
      printing: optionalText(publication, "printing", 128),
    },
    series: optionalText(input, "series", 255),
    volume: optionalText(input, "volume", 128),
    language: optionalText(input, "language", 128),
    carrierEdition: {
      editionType: optionalEditionType(carrier, "editionType"),
      editionStatement: optionalText(carrier, "editionStatement", 512),
      facsimileStatement: optionalText(carrier, "facsimileStatement", 512),
    },
    sourceEdition: {
      dynasty: optionalText(source, "dynasty", 64),
      reignTitle: optionalText(source, "reignTitle", 64),
      reignYear: optionalText(source, "reignYear", 64),
      absoluteYear: optionalAbsoluteYear(source, "absoluteYear"),
      printer: optionalText(source, "printer", 255),
      imprint: optionalText(source, "imprint", 255),
      bookshop: optionalText(source, "bookshop", 255),
      institution: optionalText(source, "institution", 255),
      printingPlace: optionalText(source, "printingPlace", 255),
      editionType: optionalEditionType(source, "editionType"),
      editionStatement: optionalText(source, "editionStatement", 512),
      holdingInformation: optionalText(source, "holdingInformation", 512),
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
              response_format: LLAMA_RESPONSE_FORMAT,
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
      "--ctx-size", String(QWEN_CONTEXT_TOKENS),
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
  const pages: Array<{
    pageIndex: number;
    pageClass: string;
    evidenceOrigin: string;
    fieldEvidenceEligible: boolean;
    text: string;
  }> = [];
  for (const page of inspection.pages) {
    const pageClass = classifySuggestionPage(page);
    pages.push({
      pageIndex: page.pageIndex,
      pageClass,
      evidenceOrigin: page.evidenceOrigin ?? "native_text",
      fieldEvidenceEligible: sourceTypeFor(pageClass) !== undefined,
      text: page.text,
    });
  }
  return JSON.stringify({
    task: "Return exactly one JSON result object matching outputContract; never repeat the task, controls, pages, evidence input, or schema itself. Extract only directly supported canonical bibliographic facts. Qwen proposes the intellectual-work class; the trusted runtime validates page-bound positive support and never replaces the proposal with title-keyword classification. For every proposed non-unknown class, emit only its required classSupport signals with an exact evidenceText excerpt. scholarly_analysis and historical_primary_work require narrative contents/preface/body evidence independent from a title, publisher, date, ISBN, or person line. primary_source_modern_edition requires BOTH historical_primary_work and edition_mediation support, and edition_mediation must bind a concrete retained edition/mediation fact. traditional_book requires BOTH historical_primary_work and traditional_artifact support, and traditional_artifact must bind a concrete retained source-edition fact. A modern publisher, publication date, ISBN, person, or analytical-looking title is auxiliary context only and is neither necessary nor sufficient class support. If positive support is missing, extraneous, or conflicting, propose unknown with uncertain_material_class instead of guessing. A person value or embedded metadata author field alone never proves either the work class or the contributor role. Preserve each contributor role only when canonical.roleLabel carries the exact source wording (for example by/author/editor/译者 in whatever script the source uses); otherwise omit that contributor. OCR confidence measures recognition only and MUST NOT be treated as bibliographic confidence. Embedded PDF metadata presence alone does not make a value trustworthy and cannot support materialClass or contributor roles. Canonical output is sparse: omit unsupported optional keys instead of emitting null placeholders. Never emit a publisher as a contributor. Omit sourceEdition for modern scholarly works; preserve it only for supported primary-source/traditional evidence. The pages array contains only script-neutral usable evidence. Non-class fields may cite only a page whose fieldEvidenceEligible is true, or usable embedded metadata; classSupport may cite any supplied non-embedded page subject to the positive-evidence rules above. classSupport evidenceText and every field evidenceText must be an exact bounded excerpt of the cited page or usable embedded metadata. Do not emit materialClass in fields because classSupport owns its independent provenance. Emit exactly one field evidence row for every other populated canonical fact and never duplicate a fieldName/scopeKey pair. scopeKey MUST be the empty string for every non-contributor field; contributor fields MUST use contributor:N where N is the zero-based canonical contributor index. Every evidence row must point only to the supplied pageIndex/evidenceOrigin; the trusted runtime validates the excerpt and actual fact value, derives page class/source type/digest, and strips evidenceText before persistence. Never use overallConfidence to fill missing field evidence. warnings may use only the supplied controlled warning codes and must never quote source text. Return no_bibliography when usable evidence is insufficient; return ambiguous when facts or class remain unsupported or conflicting.",
    // llama.cpp must use generic json_object transport because its grammar
    // compiler rejects this nested schema. Supplying the same exact contract
    // inside the bounded prompt preserves shape guidance without weakening the
    // trusted runtime parser below.
    outputContract: MODEL_OUTPUT_SCHEMA,
    classificationRules: {
      intellectualWorkBeforeManifestation: true,
      modernPublicationDoesNotImplyScholarlyWork: true,
      personPresenceDoesNotImplyAuthor: true,
      unsupportedClass: "unknown",
      historicalModernManifestation: "primary_source_modern_edition",
      traditionalArtifact: "traditional_book",
      modernScholarlyAnalysis: "scholarly_monograph",
      classSupportSignals: MATERIAL_CLASS_SUPPORT_SIGNALS,
      primarySourceModernEditionRequires: ["historical_primary_work", "edition_mediation"],
      traditionalBookRequires: ["historical_primary_work", "traditional_artifact"],
      modernPublisherDatePersonAndTitleShapeAreAuxiliaryOnly: true,
    },
    controlledValues: { materialClasses: INTELLIGENT_MATERIAL_CLASSES, contributorRoles: INTELLIGENT_CONTRIBUTOR_ROLES, editionTypes: INTELLIGENT_EDITION_TYPES },
    controlledWarnings: MODEL_WARNING_CODES,
    embeddedMetadata: inspection.embeddedMetadata,
    pages,
  });
}

function reasoningInspectionFor(inspection: PdfTextInspection): PdfTextInspection {
  const usablePages = inspection.pages.filter((page) => (
    isUsableBibliographicEvidence(
      page.text,
      page.evidenceOrigin === "ocr" ? "ocr" : "native_text",
      { ocrConfidence: page.ocrConfidence },
    )
  ));
  const priorityPages = [
    ...usablePages.filter((page) => sourceTypeFor(classifySuggestionPage(page)) !== undefined),
    ...usablePages.filter((page) => sourceTypeFor(classifySuggestionPage(page)) === undefined),
  ];
  let remaining = MAX_REASONING_INPUT_CHARACTERS;
  const pages: PdfTextInspection["pages"] = [];
  for (const page of priorityPages) {
    if (remaining <= 0) break;
    const text = page.text.normalize("NFC").slice(0, Math.min(8_192, remaining));
    remaining -= text.length;
    if (text.length > 0) pages.push({ ...page, text });
  }
  pages.sort((left, right) => left.pageIndex - right.pageIndex);
  const hasFieldEvidencePage = pages.some((page) => sourceTypeFor(classifySuggestionPage(page)) !== undefined);
  return {
    ...inspection,
    pageIndices: pages.map((page) => page.pageIndex),
    pages,
    // Keep the raw bounded metadata on the original inspection for provenance;
    // Qwen receives only the non-corrupt view, and only when no authoritative
    // page is available, preserving the single-source evidence contract.
    embeddedMetadata: hasFieldEvidencePage ? {} : usableEmbeddedMetadata(inspection.embeddedMetadata),
  };
}

function normalizedModelWarnings(
  value: unknown[],
  inspection: PdfTextInspection,
  canonical: IntelligentCanonicalBibliography | null,
  materialClassSupported: boolean,
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
  const hasPublicationFact = canonical !== null && Object.values(canonical.publication).some((entry) => entry !== null);
  const hasEditionFact = canonical !== null && (
    Object.values(canonical.carrierEdition).some((entry) => entry !== null)
    || Object.values(canonical.sourceEdition).some((entry) => entry !== null)
  );
  return [...new Set(normalized)].filter((warning) => {
    if (warning === "uncertain_title" && explicitTitle) return false;
    if (warning === "uncertain_material_class" && materialClassSupported) return false;
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

interface ValidatedEvidenceExcerpt {
  persisted: Record<string, unknown>;
  evidenceText: string;
  pageClass: ReturnType<typeof classifySuggestionPage> | null;
}

interface MaterialClassResolution {
  materialClass: IntelligentCanonicalBibliography["materialClass"];
  evidence: Record<string, unknown>;
  warnings: string[];
}

const MATERIAL_CLASS_REQUIREMENTS: Record<
  IntelligentCanonicalBibliography["materialClass"],
  readonly MaterialClassSupportSignal[]
> = {
  scholarly_monograph: ["scholarly_analysis"],
  edited_volume: ["scholarly_analysis", "edited_collection"],
  journal_article: ["serial_article"],
  book_chapter: ["chapter_container"],
  thesis_dissertation: ["thesis"],
  conference_paper: ["conference"],
  review: ["review"],
  reference_work: ["reference_work"],
  dictionary_lexicon: ["dictionary_lexicon"],
  primary_source_modern_edition: ["historical_primary_work", "edition_mediation"],
  traditional_book: ["historical_primary_work", "traditional_artifact"],
  archival_document: ["archival_document"],
  inscription_epigraphy: ["inscription_epigraphy"],
  rubbing: ["rubbing"],
  manuscript: ["manuscript"],
  collected_documents: ["historical_primary_work", "collected_documents"],
  catalogue_bibliography: ["catalogue_bibliography"],
  other: ["other_material"],
  unknown: [],
};

function normalizedEvidenceText(value: unknown): string {
  if (typeof value !== "string") throw new BibliographicIntelligenceError("invalid_result");
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalized || [...normalized].length > 2_048 || /[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) {
    throw new BibliographicIntelligenceError("invalid_result");
  }
  return normalized;
}

function authoritativeEvidence(
  field: unknown,
  inspection: PdfTextInspection,
  purpose: "field" | "class" = "field",
): ValidatedEvidenceExcerpt {
  const input = sparseRecord(field, ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"]);
  const evidenceText = normalizedEvidenceText(input.evidenceText);
  const { evidenceText: _discarded, ...persistedInput } = input;
  if (input.evidenceOrigin === "embedded_pdf_metadata") {
    if (purpose === "class") throw new BibliographicIntelligenceError("invalid_result");
    if (input.sourcePageIndex !== null) throw new BibliographicIntelligenceError("invalid_result");
    const metadataValues = Object.values(inspection.embeddedMetadata)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value) => value.normalize("NFKC").replace(/\s+/gu, " ").trim());
    if (!metadataValues.some((value) => value.includes(evidenceText))) {
      throw new BibliographicIntelligenceError("invalid_result");
    }
    return {
      evidenceText,
      persisted: {
        ...persistedInput,
        sourcePageIndex: null,
        sourceType: "embedded_pdf_metadata",
        pageClass: null,
        evidenceSha256: sha256(JSON.stringify(inspection.embeddedMetadata)),
      },
      pageClass: null,
    };
  }
  if (!Number.isSafeInteger(input.sourcePageIndex)) throw new BibliographicIntelligenceError("invalid_result");
  const page = inspection.pages.find((entry) => entry.pageIndex === input.sourcePageIndex);
  if (!page || page.evidenceOrigin !== input.evidenceOrigin) throw new BibliographicIntelligenceError("invalid_result");
  const normalizedPage = page.text.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalizedPage.includes(evidenceText)) throw new BibliographicIntelligenceError("invalid_result");
  const pageClass = classifySuggestionPage(page);
  const sourceType = purpose === "class" ? "class_support" : sourceTypeFor(pageClass);
  if (!sourceType) throw new BibliographicIntelligenceError("invalid_result");
  return {
    evidenceText,
    persisted: { ...persistedInput, sourceType, pageClass, evidenceSha256: sha256(page.text) },
    pageClass,
  };
}

function unknownMaterialClassEvidence(inspection: PdfTextInspection): Record<string, unknown> {
  const page = inspection.pages[0];
  if (page) {
    return authoritativeEvidence({
      fieldName: "materialClass",
      scopeKey: "",
      confidence: 0,
      sourcePageIndex: page.pageIndex,
      evidenceOrigin: page.evidenceOrigin ?? "native_text",
      evidenceText: page.text.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 2_048),
    }, inspection, "class").persisted;
  }
  const embeddedValue = Object.values(inspection.embeddedMetadata)
    .find((value): value is string => typeof value === "string" && value.length > 0);
  if (embeddedValue) {
    return authoritativeEvidence({
      fieldName: "materialClass",
      scopeKey: "",
      confidence: 0,
      sourcePageIndex: null,
      evidenceOrigin: "embedded_pdf_metadata",
      evidenceText: embeddedValue,
    }, inspection).persisted;
  }
  throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid", ["materialClass:"]);
}

const NARRATIVE_CLASS_PAGE_CLASSES = new Set<ReturnType<typeof classifySuggestionPage>>([
  "contents_preface",
  "ordinary_body",
]);

function evidenceContainsValue(evidenceText: string, value: string | number): boolean {
  const normalizedEvidence = evidenceText.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  const normalizedValue = String(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  if (!normalizedValue) return false;
  let position = normalizedEvidence.indexOf(normalizedValue);
  while (position >= 0) {
    if (!/^\d+$/u.test(normalizedValue)) return true;
    const before = normalizedEvidence[position - 1] ?? "";
    const after = normalizedEvidence[position + normalizedValue.length] ?? "";
    if (!/\d/u.test(before) && !/\d/u.test(after)) return true;
    position = normalizedEvidence.indexOf(normalizedValue, position + 1);
  }
  return false;
}

function evidenceContainsAnyValue(evidenceText: string, values: Array<string | number | null>): boolean {
  return values.some((value) => {
    if (value === null) return false;
    return evidenceContainsValue(evidenceText, value);
  });
}

function positivelySupportsClassSignal(
  signal: MaterialClassSupportSignal,
  evidence: ValidatedEvidenceExcerpt,
  canonical: IntelligentCanonicalBibliography,
): boolean {
  if (signal === "scholarly_analysis" || signal === "historical_primary_work") {
    return evidence.pageClass !== null && NARRATIVE_CLASS_PAGE_CLASSES.has(evidence.pageClass);
  }
  if (signal === "edition_mediation") {
    const mediationRoleLabels = canonical.contributors
      .filter((entry) => ["editor", "translator", "compiler", "commentator"].includes(entry.role))
      .map((entry) => entry.roleLabel);
    return evidenceContainsAnyValue(evidence.evidenceText, [
      canonical.carrierEdition.editionStatement,
      canonical.carrierEdition.facsimileStatement,
      canonical.publication.editionNumber,
      canonical.publication.printing,
      ...mediationRoleLabels,
    ]);
  }
  if (signal === "traditional_artifact") {
    return evidenceContainsAnyValue(evidence.evidenceText, [
      canonical.sourceEdition.dynasty,
      canonical.sourceEdition.reignTitle,
      canonical.sourceEdition.reignYear,
      canonical.sourceEdition.absoluteYear,
      canonical.sourceEdition.printer,
      canonical.sourceEdition.imprint,
      canonical.sourceEdition.bookshop,
      canonical.sourceEdition.institution,
      canonical.sourceEdition.printingPlace,
      canonical.sourceEdition.editionStatement,
    ]);
  }
  return true;
}

function resolveMaterialClass(
  proposed: IntelligentCanonicalBibliography["materialClass"],
  rawSupport: unknown[],
  inspection: PdfTextInspection,
  canonical: IntelligentCanonicalBibliography,
): MaterialClassResolution {
  const support = new Map<MaterialClassSupportSignal, ValidatedEvidenceExcerpt>();
  for (const value of rawSupport) {
    try {
      const input = sparseRecord(value, ["signal", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"]);
      if (typeof input.signal !== "string"
        || !MATERIAL_CLASS_SUPPORT_SIGNALS.includes(input.signal as MaterialClassSupportSignal)
        || !Number.isSafeInteger(input.confidence)
        || (input.confidence as number) < 0
        || (input.confidence as number) > 100
        || input.evidenceOrigin === "embedded_pdf_metadata") continue;
      const signal = input.signal as MaterialClassSupportSignal;
      if (!support.has(signal)) {
        support.set(signal, authoritativeEvidence({
          fieldName: "materialClass",
          scopeKey: "",
          confidence: input.confidence,
          sourcePageIndex: input.sourcePageIndex,
          evidenceOrigin: input.evidenceOrigin,
          evidenceText: input.evidenceText,
        }, inspection, "class"));
      }
    } catch {
      // An untrusted or stale class citation cannot retain a semantic class.
    }
  }
  const requirements = MATERIAL_CLASS_REQUIREMENTS[proposed];
  const positiveSupport = new Map([...support].filter(([signal, evidence]) => (
    positivelySupportsClassSignal(signal, evidence, canonical)
  )));
  const conflicts = [...positiveSupport.keys()].some((signal) => !requirements.includes(signal));
  const supported = proposed !== "unknown" && !conflicts && requirements.length > 0
    && requirements.every((signal) => positiveSupport.has(signal));
  if (!supported) {
    return {
      materialClass: "unknown",
      evidence: positiveSupport.values().next().value?.persisted ?? unknownMaterialClassEvidence(inspection),
      warnings: conflicts ? ["uncertain_material_class", "conflicting_evidence"] : ["uncertain_material_class"],
    };
  }
  const evidence = positiveSupport.get(requirements[0]!)!;
  return { materialClass: proposed, evidence: evidence.persisted, warnings: [] };
}

function canonicalFactValues(canonical: IntelligentCanonicalBibliography, fieldName: string, scopeKey: string): string[] {
  const publication = canonical.publication;
  const carrier = canonical.carrierEdition;
  const source = canonical.sourceEdition;
  if (fieldName === "canonicalTitle") return [canonical.canonicalTitle];
  if (fieldName === "subtitle") return canonical.subtitle === null ? [] : [canonical.subtitle];
  if (fieldName === "alternativeTitles") return canonical.alternativeTitles;
  if (fieldName === "dateStatement") return canonical.dateStatement === null ? [] : [canonical.dateStatement];
  if (fieldName === "identifiers") return canonical.identifiers.map((entry) => entry.value);
  if (fieldName.startsWith("publication.")) {
    const value = publication[fieldName.slice("publication.".length) as keyof typeof publication];
    return value === null ? [] : [value];
  }
  if (fieldName === "series" || fieldName === "volume" || fieldName === "language") {
    const value = canonical[fieldName];
    return value === null ? [] : [value];
  }
  if (fieldName.startsWith("carrierEdition.")) {
    const key = fieldName.slice("carrierEdition.".length) as keyof typeof carrier;
    const value = carrier[key];
    if (key === "editionType") return value === null ? [] : [carrier.editionStatement ?? carrier.facsimileStatement ?? ""];
    return value === null ? [] : [value];
  }
  if (fieldName.startsWith("sourceEdition.")) {
    const key = fieldName.slice("sourceEdition.".length) as keyof typeof source;
    const value = source[key];
    if (key === "editionType") return value === null ? [] : [source.editionStatement ?? ""];
    return value === null ? [] : [String(value)];
  }
  if (fieldName.startsWith("contributor.")) {
    const index = Number(scopeKey.slice("contributor:".length));
    const contributor = canonical.contributors[index];
    if (!contributor) return [];
    if (fieldName === "contributor.label") return [contributor.label];
    if (fieldName === "contributor.roleLabel") return contributor.roleLabel === null ? [] : [contributor.roleLabel];
    return contributor.roleLabel === null ? [] : [contributor.label, contributor.roleLabel];
  }
  return [];
}

function validatesCanonicalFact(
  canonical: IntelligentCanonicalBibliography,
  fieldName: string,
  scopeKey: string,
  evidenceText: string,
): boolean {
  const values = canonicalFactValues(canonical, fieldName, scopeKey);
  if (values.length === 0) return false;
  return values.every((value) => evidenceContainsValue(evidenceText, value));
}

function validatedFieldEvidence(
  canonical: IntelligentCanonicalBibliography,
  modelFields: unknown[],
  inspection: PdfTextInspection,
  materialClassEvidence: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const required = populatedFieldKeys(canonical);
  required.delete("materialClass:");
  const fields = new Map<string, Record<string, unknown>>([["materialClass:", materialClassEvidence]]);
  for (const value of modelFields) {
    let field: Record<string, unknown>;
    try {
      field = sparseRecord(value, ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"]);
    } catch {
      continue;
    }
    if (typeof field.fieldName !== "string" || typeof field.scopeKey !== "string") continue;
    const key = `${field.fieldName}:${field.scopeKey}`;
    // Facts removed by normalization do not acquire evidence or poison a valid
    // sparse result.
    if (!required.has(key)) continue;
    if (fields.has(key)) {
      throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid", [...required].sort());
    }
    try {
      const validated = authoritativeEvidence(field, inspection);
      if (!validatesCanonicalFact(canonical, field.fieldName, field.scopeKey, validated.evidenceText)) {
        throw new BibliographicIntelligenceError("invalid_result");
      }
      fields.set(key, validated.persisted);
    } catch (error: unknown) {
      if (error instanceof BibliographicIntelligenceError) {
        throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid", [...required].sort());
      }
      throw error;
    }
  }
  if ([...required].some((key) => !fields.has(key))) {
    throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid", [...required].sort());
  }
  return [...fields.values()];
}

function pruneUnsupportedFieldFacts(
  canonical: IntelligentCanonicalBibliography,
  modelFields: unknown[],
  inspection: PdfTextInspection,
): { canonical: IntelligentCanonicalBibliography; fields: Array<Record<string, unknown>> } {
  const populated = populatedFieldKeys(canonical);
  populated.delete("materialClass:");
  const accepted = new Map<string, Record<string, unknown>>();
  const invalid = new Set<string>();
  for (const value of modelFields) {
    let field: Record<string, unknown>;
    try {
      field = sparseRecord(value, ["fieldName", "scopeKey", "confidence", "sourcePageIndex", "evidenceOrigin", "evidenceText"]);
    } catch {
      continue;
    }
    if (typeof field.fieldName !== "string" || typeof field.scopeKey !== "string") continue;
    const key = `${field.fieldName}:${field.scopeKey}`;
    if (!populated.has(key) || invalid.has(key)) continue;
    if (accepted.has(key)) {
      accepted.delete(key);
      invalid.add(key);
      continue;
    }
    try {
      const validated = authoritativeEvidence(field, inspection);
      if (!validatesCanonicalFact(canonical, field.fieldName, field.scopeKey, validated.evidenceText)) {
        invalid.add(key);
        continue;
      }
      accepted.set(key, validated.persisted);
    } catch {
      invalid.add(key);
    }
  }
  if (!accepted.has("canonicalTitle:")) {
    throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid", ["canonicalTitle:"]);
  }
  const keep = (fieldName: string): boolean => accepted.has(`${fieldName}:`);
  const contributorScope = new Map<string, string>();
  const contributors = canonical.contributors.flatMap((contributor, index) => {
    const oldScope = `contributor:${index}`;
    const keys = [
      `contributor.label:${oldScope}`,
      `contributor.role:${oldScope}`,
      ...(contributor.roleLabel === null ? [] : [`contributor.roleLabel:${oldScope}`]),
    ];
    if (!keys.every((key) => accepted.has(key))) return [];
    const newScope = `contributor:${contributorScope.size}`;
    contributorScope.set(oldScope, newScope);
    return [contributor];
  });
  const carrierEditionStatement = keep("carrierEdition.editionStatement") ? canonical.carrierEdition.editionStatement : null;
  const carrierFacsimileStatement = keep("carrierEdition.facsimileStatement") ? canonical.carrierEdition.facsimileStatement : null;
  const sourceEditionStatement = keep("sourceEdition.editionStatement") ? canonical.sourceEdition.editionStatement : null;
  const pruned = parseIntelligentCanonicalBibliography({
    ...canonical,
    subtitle: keep("subtitle") ? canonical.subtitle : null,
    alternativeTitles: keep("alternativeTitles") ? canonical.alternativeTitles : [],
    dateStatement: keep("dateStatement") ? canonical.dateStatement : null,
    identifiers: keep("identifiers") ? canonical.identifiers : [],
    contributors,
    publication: Object.fromEntries(Object.entries(canonical.publication).map(([key, value]) => (
      [key, keep(`publication.${key}`) ? value : null]
    ))),
    series: keep("series") ? canonical.series : null,
    volume: keep("volume") ? canonical.volume : null,
    language: keep("language") ? canonical.language : null,
    carrierEdition: {
      editionType: keep("carrierEdition.editionType") && (carrierEditionStatement !== null || carrierFacsimileStatement !== null)
        ? canonical.carrierEdition.editionType : null,
      editionStatement: carrierEditionStatement,
      facsimileStatement: carrierFacsimileStatement,
    },
    sourceEdition: {
      dynasty: keep("sourceEdition.dynasty") ? canonical.sourceEdition.dynasty : null,
      reignTitle: keep("sourceEdition.reignTitle") ? canonical.sourceEdition.reignTitle : null,
      reignYear: keep("sourceEdition.reignYear") ? canonical.sourceEdition.reignYear : null,
      absoluteYear: keep("sourceEdition.absoluteYear") ? canonical.sourceEdition.absoluteYear : null,
      printer: keep("sourceEdition.printer") ? canonical.sourceEdition.printer : null,
      imprint: keep("sourceEdition.imprint") ? canonical.sourceEdition.imprint : null,
      bookshop: keep("sourceEdition.bookshop") ? canonical.sourceEdition.bookshop : null,
      institution: keep("sourceEdition.institution") ? canonical.sourceEdition.institution : null,
      printingPlace: keep("sourceEdition.printingPlace") ? canonical.sourceEdition.printingPlace : null,
      editionType: keep("sourceEdition.editionType") && sourceEditionStatement !== null
        ? canonical.sourceEdition.editionType : null,
      editionStatement: sourceEditionStatement,
      holdingInformation: keep("sourceEdition.holdingInformation") ? canonical.sourceEdition.holdingInformation : null,
    },
  });
  const finalKeys = populatedFieldKeys(pruned);
  finalKeys.delete("materialClass:");
  const fields = [...accepted.entries()].flatMap(([key, field]) => {
    if (key.startsWith("contributor.")) {
      const oldScope = String(field.scopeKey ?? "");
      const newScope = contributorScope.get(oldScope);
      if (newScope === undefined) return [];
      const newKey = `${String(field.fieldName)}:${newScope}`;
      return finalKeys.has(newKey) ? [{ ...field, scopeKey: newScope }] : [];
    }
    return finalKeys.has(key) ? [field] : [];
  });
  return { canonical: pruned, fields };
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
  if (canonical.materialClass === "unknown") warnings.push("uncertain_material_class");
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

function deriveIntelligentBibliographyFromModel(
  model: unknown,
  inspection: PdfTextInspection,
  legacyFallback = false,
  fieldEvidenceMode: "strict" | "prune" = "strict",
): IntelligentBibliographyResult {
  const raw = sparseRecord(model, ["status", "overallConfidence", "canonical", "classSupport", "fields", "warnings"]);
  if (!Array.isArray(raw.classSupport) || !Array.isArray(raw.fields) || !Array.isArray(raw.warnings)) {
    throw new BibliographicIntelligenceError("invalid_result");
  }
  let normalizedCanonical: IntelligentCanonicalBibliography | null;
  try {
    normalizedCanonical = raw.canonical === null ? null : parseIntelligentCanonicalBibliography(normalizeSparseCanonical(raw.canonical, inspection));
  } catch (error: unknown) {
    if (error instanceof BibliographicIntelligenceError) throw error;
    throw new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid");
  }
  let canonical: IntelligentCanonicalBibliography | null;
  let materialClassResolution: MaterialClassResolution | null = null;
  try {
    if (normalizedCanonical === null) {
      if (raw.classSupport.length > 0) throw new BibliographicIntelligenceError("invalid_result");
      canonical = null;
    } else {
      materialClassResolution = resolveMaterialClass(
        normalizedCanonical.materialClass,
        raw.classSupport,
        inspection,
        normalizedCanonical,
      );
      canonical = discardUnresolvedModelFacts(parseIntelligentCanonicalBibliography({
        ...normalizedCanonical,
        materialClass: materialClassResolution.materialClass,
      }), raw.warnings, inspection);
    }
  } catch (error: unknown) {
    if (error instanceof BibliographicIntelligenceError) throw error;
    throw new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid");
  }
  let fields: Array<Record<string, unknown>> = [];
  if (canonical !== null) {
    if (fieldEvidenceMode === "strict") {
      fields = validatedFieldEvidence(canonical, raw.fields, inspection, materialClassResolution!.evidence);
    } else {
      const projection = pruneUnsupportedFieldFacts(canonical, raw.fields, inspection);
      canonical = projection.canonical;
      materialClassResolution = resolveMaterialClass(
        normalizedCanonical!.materialClass,
        raw.classSupport,
        inspection,
        canonical,
      );
      canonical = discardUnresolvedModelFacts(parseIntelligentCanonicalBibliography({
        ...canonical,
        materialClass: materialClassResolution.materialClass,
      }), raw.warnings, inspection);
      const finalKeys = populatedFieldKeys(canonical);
      finalKeys.delete("materialClass:");
      fields = [
        materialClassResolution.evidence,
        ...projection.fields.filter((field) => finalKeys.has(`${String(field.fieldName)}:${String(field.scopeKey)}`)),
      ];
    }
  }
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
    warnings: [...new Set([
      ...normalizedModelWarnings(
        raw.warnings,
        inspection,
        canonical,
        materialClassResolution !== null && materialClassResolution.warnings.length === 0,
      ),
      ...(materialClassResolution?.warnings ?? []),
    ])],
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
  const statusAllowsPromotion = requestedStatus === "auto_apply";
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

function evidenceRepairPromptFor(
  inspection: PdfTextInspection,
  requiredFieldKeys: readonly string[],
  originalProposal: unknown,
): string {
  const base = JSON.parse(promptFor(inspection)) as Record<string, unknown>;
  const original = sparseRecord(originalProposal, ["status", "overallConfidence", "canonical", "classSupport", "fields", "warnings"]);
  return JSON.stringify({
    ...base,
    repair: {
      reason: "previous_field_evidence_invalid",
      requiredFieldKeys: [...new Set(requiredFieldKeys)].sort(),
      previousCanonical: original.canonical,
      instruction: "Return a complete new result object. You may only retain original proposed facts, omit unsupported optional facts/contributors, downgrade materialClass to unknown, or return no_bibliography; never add or change a fact. Every retained non-class fact needs exactly one fields row with an exact bounded evidenceText excerpt containing the actual value. materialClass uses classSupport, not fields. Never use overallConfidence or a one-page shortcut to create missing provenance.",
    },
  });
}

function proposalSubset(original: unknown, candidate: unknown, path = ""): boolean {
  if (candidate === null) return true;
  if (typeof candidate !== "object") {
    return path === "canonical.materialClass" && candidate === "unknown"
      ? true
      : Object.is(original, candidate);
  }
  if (Array.isArray(candidate)) {
    if (!Array.isArray(original)) return false;
    let position = 0;
    return candidate.every((entry) => {
      while (position < original.length && !proposalSubset(original[position], entry, `${path}[]`)) position += 1;
      if (position >= original.length) return false;
      position += 1;
      return true;
    });
  }
  if (typeof original !== "object" || original === null || Array.isArray(original)) return false;
  return Object.entries(candidate as Record<string, unknown>).every(([key, value]) => (
    Object.prototype.hasOwnProperty.call(original, key)
    && proposalSubset((original as Record<string, unknown>)[key], value, path ? `${path}.${key}` : key)
  ));
}

function evidenceOnlyRepair(original: unknown, repaired: unknown): Record<string, unknown> {
  const keys = ["status", "overallConfidence", "canonical", "classSupport", "fields", "warnings"] as const;
  const originalResult = sparseRecord(original, keys);
  const repairedResult = sparseRecord(repaired, keys);
  if (!Array.isArray(repairedResult.classSupport) || !Array.isArray(repairedResult.fields)
    || !Array.isArray(repairedResult.warnings)
    || !proposalSubset(originalResult.canonical, repairedResult.canonical, "canonical")) {
    throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid");
  }
  const originalConfidence = Number.isSafeInteger(originalResult.overallConfidence)
    ? originalResult.overallConfidence as number : 0;
  const repairedConfidence = Number.isSafeInteger(repairedResult.overallConfidence)
    ? repairedResult.overallConfidence as number : 0;
  return {
    ...repairedResult,
    overallConfidence: Math.min(originalConfidence, repairedConfidence),
  };
}

export async function deriveIntelligentBibliography(
  inspection: PdfTextInspection,
  reasoner: BibliographicReasoner,
  signal?: AbortSignal,
  legacyFallback = false,
): Promise<IntelligentBibliographyResult> {
  const reasoningInspection = reasoningInspectionFor(inspection);
  const initialPrompt = promptFor(reasoningInspection);
  const model = await reasoner.infer(initialPrompt, signal);
  try {
    return deriveIntelligentBibliographyFromModel(model, reasoningInspection, legacyFallback);
  } catch (error: unknown) {
    if (!(error instanceof BibliographicIntelligenceError)
      || error.diagnostic !== "field_evidence_invalid"
      || error.repairFieldKeys.length === 0) throw error;
    const repaired = await reasoner.infer(evidenceRepairPromptFor(reasoningInspection, error.repairFieldKeys, model), signal);
    try {
      return deriveIntelligentBibliographyFromModel(
        evidenceOnlyRepair(model, repaired),
        reasoningInspection,
        legacyFallback,
      );
    } catch (repairError: unknown) {
      if (!(repairError instanceof BibliographicIntelligenceError)
        || repairError.diagnostic !== "field_evidence_invalid") throw repairError;
      return deriveIntelligentBibliographyFromModel(model, reasoningInspection, legacyFallback, "prune");
    }
  }
}
