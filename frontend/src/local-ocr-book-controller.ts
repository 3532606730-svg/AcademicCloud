import type { LocalOcrApi, LocalOcrBook, LocalOcrBookJob, LocalOcrBookProgress, LocalOcrJob, LocalOcrResult } from "./local-ocr-api.ts";
import type { LocalOcrFrame } from "./local-ocr-frame.ts";
import { LocalOcrController } from "./local-ocr-controller.ts";

export interface BookOcrDocument {
  capture(physicalPage: number, signal: AbortSignal): Promise<LocalOcrFrame>;
  isCurrent(): boolean;
}
export interface BookOcrState {
  state: "checking" | "waiting" | "capturing" | "queued" | "running" | "completed" | "paused" | "failed";
  book: LocalOcrBookProgress | null;
  physicalPage: number | null;
  errorCode?: string;
}
const code = (error: unknown) => error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : "request_failed";
const pending = (job: LocalOcrJob) => job.state === "queued" || job.state === "running";
const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new Error("cancelled")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
});
export function bookOcrSummary(book: LocalOcrBookProgress) {
  return {
    processed: book.pages.length,
    issues: book.pages.filter((page) => page.truncated || page.status === "low_confidence" || page.status === "unsupported_script"),
    noText: book.pages.filter((page) => page.status === "no_text").length,
  };
}

export const backgroundBookBusy = (job: LocalOcrBookJob | null) => job?.state === "queued" || job?.state === "running";

export function validateBookJob(input: LocalOcrBook, job: LocalOcrBookJob): LocalOcrBookJob {
  if (job.resourceId !== input.resourceId || job.sourceId !== input.sourceId || job.pageCount !== input.pageCount
    || job.savedPhysicalPages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > input.pageCount)
    || new Set(job.savedPhysicalPages).size !== job.savedPhysicalPages.length) throw new Error("invalid_result");
  return job;
}

/** Read-only restoration. A browser lifecycle event never mutates a device-owned job. */
export async function readBookOcrSnapshot(api: LocalOcrApi, input: LocalOcrBook, signal?: AbortSignal) {
  const [initial, jobs] = await Promise.all([api.bookProgress(input, signal), api.books(input, signal)]);
  const validate = (value: LocalOcrBookProgress) => {
    if (value.resourceId !== input.resourceId || value.sourceId !== input.sourceId || value.pageCount !== input.pageCount
      || value.pages.some((page) => !Number.isSafeInteger(page.physicalPage) || page.physicalPage < 1 || page.physicalPage > input.pageCount)
      || new Set(value.pages.map((page) => page.physicalPage)).size !== value.pages.length) throw new Error("invalid_result");
    return value;
  };
  let book = validate(initial);
  jobs.forEach((job) => validateBookJob(input, job));
  // Prefer any live job over an older terminal record. The API returns newest-created first.
  const job = jobs.find(backgroundBookBusy) ?? jobs[0] ?? null;
  // The two endpoints can straddle a page commit. Reconcile once before stopping a completed job's poll.
  if (job?.savedPhysicalPages.some((page) => !book.pages.some((saved) => saved.physicalPage === page))) book = validate(await api.bookProgress(input, signal));
  return { book, job, jobs };
}

/** Browser-owned sequential execution; saved server results are the only durable checkpoints. */
export class LocalOcrBookController {
  #generation = 0;
  #active: { abort: AbortController; page: LocalOcrController; existingJob: LocalOcrJob | null } | null = null;
  constructor(private readonly api: LocalOcrApi) {}
  pause() {
    this.#generation++;
    const active = this.#active; this.#active = null;
    active?.abort.abort(); active?.page.cancel();
    if (active?.existingJob) void this.api.cancel(active.existingJob.id).catch(() => {});
  }
  async run(input: LocalOcrBook, deviceId: string, document: BookOcrDocument, progress: (value: BookOcrState) => void): Promise<BookOcrState> {
    this.pause();
    const generation = this.#generation;
    const active = { abort: new AbortController(), page: new LocalOcrController(this.api), existingJob: null as LocalOcrJob | null };
    this.#active = active;
    const current = () => generation === this.#generation && !active.abort.signal.aborted && document.isCurrent();
    let book: LocalOcrBookProgress | null = null;
    let physicalPage: number | null = null;
    const emit = (state: BookOcrState["state"]) => { if (current()) progress({ state, book, physicalPage }); };
    const refresh = async () => {
      const value = await this.api.bookProgress(input, active.abort.signal);
      if (!current()) throw new Error("cancelled");
      if (value.resourceId !== input.resourceId || value.sourceId !== input.sourceId || value.pageCount !== input.pageCount
        || value.pages.some((page) => !Number.isSafeInteger(page.physicalPage) || page.physicalPage < 1 || page.physicalPage > input.pageCount)
        || new Set(value.pages.map((page) => page.physicalPage)).size !== value.pages.length) throw new Error("invalid_result");
      book = value; return value;
    };
    try {
      if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > 500) throw new Error("book_page_limit");
      if (!current()) throw new Error("cancelled");
      emit("checking");
      let value = await refresh();
      if (value.activeJob) {
        let job = value.activeJob;
        if (job.resourceId !== input.resourceId || job.sourceId !== input.sourceId || job.physicalPage < 1 || job.physicalPage > input.pageCount) throw new Error("invalid_result");
        physicalPage = job.physicalPage; active.existingJob = job;
        while (pending(job)) {
          emit("waiting");
          await wait(active.abort.signal);
          if (!current()) throw new Error("cancelled");
          job = await this.api.status(job.id, active.abort.signal);
          if (!current()) throw new Error("cancelled");
          if (job.id !== active.existingJob.id || job.resourceId !== input.resourceId || job.sourceId !== input.sourceId || job.physicalPage !== physicalPage) throw new Error("invalid_result");
        }
        active.existingJob = null;
        if (job.state !== "succeeded" || !job.resultId) throw new Error(job.errorCode ?? "request_inactive");
        value = await refresh(); physicalPage = null;
      }
      if (value.accountBusy) throw new Error("account_busy");
      const saved = new Set(value.pages.map((page) => page.physicalPage));
      const missing = Array.from({ length: input.pageCount }, (_, index) => index + 1).filter((page) => !saved.has(page));
      if (missing.length > value.quota.remaining) throw new Error("book_quota_exceeded");
      for (const target of missing) {
        if (!current()) throw new Error("cancelled");
        if (value.pages.some((page) => page.physicalPage === target)) continue;
        physicalPage = target;
        const outcome = await active.page.recognize({ resourceId: input.resourceId, sourceId: input.sourceId, physicalPage: target }, deviceId,
          { capture: (signal) => document.capture(target, signal), isCurrent: current }, (step) => emit(step.state));
        if (!current() || !outcome) throw new Error("cancelled");
        // Do not retain the rendered image or a book-sized array of machine text.
        appendCheckpoint(value, outcome.result);
        book = value; emit("checking");
        value = await refresh();
        if (value.accountBusy) throw new Error("account_busy");
      }
      physicalPage = null; emit("completed");
      return { state: "completed", book, physicalPage };
    } catch (error) {
      if (!current()) return { state: "paused", book, physicalPage };
      active.page.cancel();
      if (active.existingJob) void this.api.cancel(active.existingJob.id).catch(() => {});
      // Reconcile a successful completion whose response may have been lost.
      if (book) try { await refresh(); } catch { /* Keep the last observed durable checkpoints. */ }
      if (!current()) return { state: "paused", book, physicalPage };
      const outcome: BookOcrState = { state: "failed", book, physicalPage, errorCode: code(error) };
      progress(outcome); return outcome;
    } finally { if (this.#active === active) this.#active = null; }
  }
}

function appendCheckpoint(book: LocalOcrBookProgress, result: LocalOcrResult) {
  book.pages = [...book.pages.filter((page) => page.physicalPage !== result.physicalPage), {
    physicalPage: result.physicalPage, resultId: result.id, rotation: result.rotation, status: result.machine.status,
    truncated: result.machine.truncated, hasCorrection: result.correctedText !== null, createdAt: result.createdAt,
  }].sort((a, b) => a.physicalPage - b.physicalPage);
}
