import type {
  DerivedComputeErrorCode,
  DerivedComputeResult,
  MetadataSuggestionComputeOutput,
} from "@academiccloud/compute-contracts";

import { extractSuggestions } from "./extractor.js";
import { PdfJsFrontMatterInspector, PdfTextInspectionError } from "./pdf-text.js";
import { OcrError, TesseractCliOcrAdapter } from "./ocr.js";
import { PaddleOcrSidecarAdapter } from "./paddle-ocr.js";
import {
  BibliographicIntelligenceError,
  deriveIntelligentBibliography,
  LlamaServerBibliographicReasoner,
  type BibliographicReasoner,
} from "./bibliographic-intelligence.js";
import { SUGGESTION_LIMITS, type BoundedPdfTextSource, type PdfRangeSource } from "./suggestion.js";

const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_HTTP_RANGE_BYTES = 2 * 1024 * 1024;
const MAX_CALLBACK_RESULT_BYTES = 256 * 1024;
const RESULT_CALLBACK_RETRY_DELAYS_MS = [100, 250] as const;

export interface ComputeWorkerInput {
  coreBaseUrl: string;
  jobId: string;
  attemptId: string;
  bootstrapSecret: string;
}

interface WorkerClaim {
  job: { id: string; attemptId: string; kind: "metadata_suggestion" };
  capability: { token: string; expiresAt: string };
  source: { method: "GET"; url: string; sizeBytes: number; mediaType: string; expiresAt: string };
  callbackUrl: string;
}

export interface WorkerMemoryEvidence {
  cleanStartRssBytes: number;
  peakRssBytes: number;
  postJobRssBytes: number;
}

export interface ComputeWorkerOutcome {
  result: DerivedComputeResult;
  memory: WorkerMemoryEvidence;
  failureDiagnostic?: {
    stage: PdfTextInspectionError["diagnosticStage"];
    rangeRequests?: number;
    rangeBytes?: number;
  };
}

function safeUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname))) {
    throw new Error(`${label} must use HTTPS outside loopback development`);
  }
  return parsed;
}

function bearer(secret: string): Record<string, string> {
  if (secret.length < 32 || secret.length > 512 || /[\u0000\r\n]/u.test(secret)) {
    throw new Error("compute bootstrap secret is invalid");
  }
  return { authorization: `Bearer ${secret}`, "content-type": "application/json" };
}

function parseClaim(value: unknown, input: ComputeWorkerInput): WorkerClaim {
  if (typeof value !== "object" || value === null) throw new Error("compute claim is invalid");
  const claim = value as Partial<WorkerClaim>;
  if (claim.job?.id !== input.jobId || claim.job.attemptId !== input.attemptId || claim.job.kind !== "metadata_suggestion") {
    throw new Error("compute claim identity mismatch");
  }
  if (claim.source?.method !== "GET" || claim.source.mediaType !== "application/pdf"
    || !Number.isSafeInteger(claim.source.sizeBytes) || claim.source.sizeBytes! < 5
    || claim.source.sizeBytes! > SUGGESTION_LIMITS.maxObjectSizeBytes) {
    throw new Error("compute source descriptor is invalid");
  }
  safeUrl(claim.source.url, "compute source URL");
  safeUrl(claim.callbackUrl!, "compute callback URL");
  if (typeof claim.capability?.token !== "string" || claim.capability.token.length < 32 || claim.capability.token.length > 512) {
    throw new Error("compute result capability is invalid");
  }
  return claim as WorkerClaim;
}

export class HttpPdfRangeSource implements PdfRangeSource {
  readonly length: number;
  readonly #url: string;
  readonly #fetch: typeof fetch;

  constructor(url: string, length: number, fetchImplementation: typeof fetch = fetch) {
    safeUrl(url, "compute source URL");
    if (!Number.isSafeInteger(length) || length < 5 || length > SUGGESTION_LIMITS.maxObjectSizeBytes) {
      throw new RangeError("compute source length is invalid");
    }
    this.#url = url;
    this.length = length;
    this.#fetch = fetchImplementation;
  }

  async read(begin: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    if (!Number.isSafeInteger(begin) || begin < 0 || !Number.isSafeInteger(end) || end <= begin
      || end > this.length || end - begin > MAX_HTTP_RANGE_BYTES) {
      throw new RangeError("compute source range is invalid");
    }
    const response = await this.#fetch(this.#url, {
      method: "GET",
      headers: { range: `bytes=${begin}-${end - 1}` },
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.status !== 206) throw new Error("compute source range unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== end - begin) throw new Error("compute source range length mismatch");
    return bytes;
  }
}

function classifyWorkerError(error: unknown): DerivedComputeErrorCode {
  if (error instanceof PdfTextInspectionError) {
    switch (error.code) {
      case "timeout":
      case "ocr_timeout": return "compute_timeout";
      case "too_large":
      case "limit_exceeded":
      case "ocr_capacity": return "compute_limit_exceeded";
      case "invalid_pdf":
      case "encrypted_pdf": return "compute_invalid_pdf";
      case "ocr_engine_unavailable":
      case "ocr_language_unavailable": return "compute_ocr_unavailable";
      case "aborted": return "compute_timeout";
      case "render_failure":
      case "ocr_engine_failure": return "compute_internal_error";
    }
  }
  if (error instanceof OcrError) {
    if (error.code === "timeout" || error.code === "aborted") return "compute_timeout";
    if (["engine_unavailable", "engine_version_mismatch", "language_data_unavailable"].includes(error.code)) {
      return "compute_ocr_unavailable";
    }
    if (error.code === "input_limit" || error.code === "output_limit") return "compute_limit_exceeded";
  }
  if (error instanceof BibliographicIntelligenceError) {
    if (error.code === "invalid_result") return "compute_invalid_result";
    if (error.code === "reasoner_timeout") return "compute_timeout";
    return "compute_internal_error";
  }
  if (error instanceof Error && /source|range|fetch/iu.test(error.message)) return "compute_source_unavailable";
  return "compute_internal_error";
}

export async function computeMetadataSuggestions(
  source: PdfRangeSource,
  inspector: BoundedPdfTextSource = new PdfJsFrontMatterInspector(),
  signal?: AbortSignal,
  reasoner?: BibliographicReasoner,
  legacyOcrFallback = false,
): Promise<MetadataSuggestionComputeOutput> {
  if (!inspector.inspectRange) throw new Error("compute inspector requires bounded range support");
  let inspection;
  try {
    inspection = await inspector.inspectRange(source, SUGGESTION_LIMITS, signal);
  } finally {
    await inspector.close?.();
  }
  const extraction = extractSuggestions({
    pages: inspection.pages,
    embeddedMetadata: inspection.embeddedMetadata,
    filename: "",
    hasUsableTextLayer: inspection.hasUsableTextLayer,
  });
  let bibliography;
  try {
    bibliography = reasoner === undefined
      ? undefined
      : await deriveIntelligentBibliography(inspection, reasoner, signal, legacyOcrFallback);
  } catch (error: unknown) {
    // PDF.js/OCR extraction is independently useful. A bounded model startup
    // or inference outage must not discard that already-completed result, while
    // invalid model output remains fail-closed through the rethrow below.
    if (!(error instanceof BibliographicIntelligenceError)
      || !["reasoner_unavailable", "reasoner_timeout"].includes(error.code)) throw error;
    bibliography = undefined;
  } finally {
    await reasoner?.close?.();
  }
  return fitCallbackOutput({
    status: extraction.status,
    window: {
      firstPages: 15,
      lastPages: 5,
      pageCount: inspection.pageCount,
      pageIndices: [...inspection.pageIndices],
      complete: inspection.complete,
    },
    candidates: extraction.candidates.map((candidate, position) => ({ ...candidate, position })),
    ...(bibliography === undefined ? {} : { bibliography }),
  });
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, fetchImplementation: typeof fetch): Promise<Response> {
  return fetchImplementation(url, { method: "POST", headers, body: JSON.stringify(body) });
}

export function fitCallbackOutput(output: MetadataSuggestionComputeOutput): MetadataSuggestionComputeOutput {
  let candidates = output.candidates;
  const callbackBytes = (value: MetadataSuggestionComputeOutput): number => Buffer.byteLength(JSON.stringify({
    jobId: "x".repeat(128),
    attemptId: "x".repeat(128),
    kind: "metadata_suggestion",
    state: "succeeded",
    output: value,
  }), "utf8");
  while (candidates.length > 0 && callbackBytes({ ...output, candidates }) > MAX_CALLBACK_RESULT_BYTES) {
    candidates = candidates.slice(0, -1);
  }
  let fitted = candidates.length === output.candidates.length ? output : { ...output, candidates };
  if (fitted.bibliography !== undefined && callbackBytes(fitted) > MAX_CALLBACK_RESULT_BYTES) {
    delete fitted.bibliography;
  }
  return fitted;
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("The compute callback was cancelled.", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const finish = (callback: () => void): void => {
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const timer = setTimeout(() => finish(resolve), milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      finish(() => reject(new DOMException("The compute callback was cancelled.", "AbortError")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function postResultWithRetry(
  claim: WorkerClaim,
  result: DerivedComputeResult,
  fetchImplementation: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  const headers = { authorization: `Bearer ${claim.capability.token}`, "content-type": "application/json" };
  let lastError: unknown;
  for (let attempt = 0; attempt <= RESULT_CALLBACK_RETRY_DELAYS_MS.length; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await postJson(claim.callbackUrl, headers, result, fetchImplementation);
    } catch (error: unknown) {
      lastError = error;
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
    if (response?.ok) return;
    if (response) {
      lastError = new Error(`compute callback failed with status ${response.status}`);
      // Authentication, identity, and validation failures are stable for this
      // exact payload. Only server/transient responses receive bounded retry.
      if (response.status < 500 && response.status !== 429) throw lastError;
    }
    const retryDelay = RESULT_CALLBACK_RETRY_DELAYS_MS[attempt];
    if (retryDelay !== undefined) await delay(retryDelay, signal);
  }
  throw lastError;
}

export async function runComputeWorker(
  input: ComputeWorkerInput,
  options: {
    fetchImplementation?: typeof fetch;
    inspector?: BoundedPdfTextSource;
    reasoner?: BibliographicReasoner;
    signal?: AbortSignal;
  } = {},
): Promise<ComputeWorkerOutcome> {
  if (!JOB_ID.test(input.jobId) || !JOB_ID.test(input.attemptId)) throw new Error("compute job identity is invalid");
  const core = safeUrl(input.coreBaseUrl, "compute Core URL");
  if (core.pathname !== "/" || core.search || core.hash) throw new Error("compute Core URL must be an exact origin");
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const cleanStartRssBytes = process.memoryUsage.rss();
  let peakRssBytes = cleanStartRssBytes;
  const sample = (): void => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss()); };
  const sampler = setInterval(sample, 10);
  sampler.unref();
  try {
    const claimResponse = await postJson(
      new URL(`/api/internal/compute/jobs/${encodeURIComponent(input.jobId)}/claim`, core).href,
      bearer(input.bootstrapSecret),
      { attemptId: input.attemptId },
      fetchImplementation,
    );
    if (!claimResponse.ok) throw new Error(`compute claim failed with status ${claimResponse.status}`);
    const claim = parseClaim(await claimResponse.json(), input);
    let result: DerivedComputeResult;
    let failureDiagnostic: ComputeWorkerOutcome["failureDiagnostic"];
    try {
      const source = new HttpPdfRangeSource(claim.source.url, claim.source.sizeBytes, fetchImplementation);
      const emergencyLegacyOcr = process.env.ACADEMICCLOUD_OCR_EMERGENCY_LEGACY === "1";
      const inspector = options.inspector ?? new PdfJsFrontMatterInspector(
        process.env.NODE_ENV === "production" && !emergencyLegacyOcr
          ? new PaddleOcrSidecarAdapter()
          : new TesseractCliOcrAdapter(),
      );
      const reasoner = options.reasoner ?? (process.env.NODE_ENV === "production" ? new LlamaServerBibliographicReasoner() : undefined);
      const output = await computeMetadataSuggestions(source, inspector, options.signal, reasoner, emergencyLegacyOcr);
      result = { jobId: input.jobId, attemptId: input.attemptId, kind: "metadata_suggestion", state: "succeeded", output };
    } catch (error: unknown) {
      if (error instanceof PdfTextInspectionError) {
        failureDiagnostic = {
          stage: error.diagnosticStage,
          ...(error.rangeRequests === undefined ? {} : { rangeRequests: error.rangeRequests }),
          ...(error.rangeBytes === undefined ? {} : { rangeBytes: error.rangeBytes }),
        };
      }
      result = {
        jobId: input.jobId,
        attemptId: input.attemptId,
        kind: "metadata_suggestion",
        state: "failed",
        errorCode: classifyWorkerError(error),
      };
    }
    sample();
    try {
      await postResultWithRetry(claim, result, fetchImplementation, options.signal);
    } catch (callbackError: unknown) {
      // A successful extraction whose result cannot be durably committed must
      // not strand the job in `running` until its two-hour deadline. After the
      // exact result has exhausted bounded retry, report a stable failed
      // terminal result through the same single-job capability. This update is
      // best-effort: a fully unavailable Core still expires the job normally.
      if (result.state === "succeeded") {
        const failed: DerivedComputeResult = {
          jobId: input.jobId,
          attemptId: input.attemptId,
          kind: "metadata_suggestion",
          state: "failed",
          errorCode: "compute_internal_error",
        };
        try {
          await postResultWithRetry(claim, failed, fetchImplementation, options.signal);
        } catch {
          // Preserve the original callback failure for the provider log.
        }
      }
      throw callbackError;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    globalThis.gc?.();
    sample();
    return {
      result,
      memory: { cleanStartRssBytes, peakRssBytes, postJobRssBytes: process.memoryUsage.rss() },
      ...(failureDiagnostic === undefined ? {} : { failureDiagnostic }),
    };
  } finally {
    clearInterval(sampler);
  }
}
