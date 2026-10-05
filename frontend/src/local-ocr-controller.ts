import type { LocalOcrApi, LocalOcrJob, LocalOcrPage, LocalOcrResult } from "./local-ocr-api.ts";
import type { LocalOcrFrame, PaintedOcrPage } from "./local-ocr-frame.ts";

export type OcrProgress = { state: "capturing" | "queued" | "running"; job?: LocalOcrJob };
const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { window.clearTimeout(timer); reject(new Error("cancelled")); };
  const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
});

/** One interactive page, with cancellation and stale-response isolation across every await. */
export class LocalOcrController {
  #generation = 0;
  #active: { controller: AbortController; job: LocalOcrJob | null } | null = null;
  constructor(private readonly api: LocalOcrApi) {}
  cancel() {
    this.#generation++;
    const active = this.#active; this.#active = null;
    active?.controller.abort();
    if (active?.job) void this.api.cancel(active.job.id).catch(() => {});
  }
  async recognize(page: LocalOcrPage, deviceId: string, painted: PaintedOcrPage, progress: (value: OcrProgress) => void): Promise<{ result: LocalOcrResult; frame: LocalOcrFrame } | null> {
    this.cancel();
    const generation = this.#generation;
    const active = { controller: new AbortController(), job: null as LocalOcrJob | null }; this.#active = active;
    const current = () => generation === this.#generation && !active.controller.signal.aborted && painted.isCurrent();
    try {
      progress({ state: "capturing" });
      const frame = await painted.capture(active.controller.signal);
      if (!current()) return null;
      // Keep a submitted create observable even if selection changes, so its eventual job can be cancelled.
      active.job = await this.api.create({ ...page, deviceId, clientRequestId: crypto.randomUUID(), imageBase64: frame.imageBase64, imageWidth: frame.imageWidth, imageHeight: frame.imageHeight, rotation: frame.rotation });
      if (!current()) { void this.api.cancel(active.job.id).catch(() => {}); return null; }
      let job = active.job;
      while (job.state === "queued" || job.state === "running") {
        if (!Number.isFinite(Date.parse(job.expiresAt)) || Date.parse(job.expiresAt) <= Date.now()) throw new Error("expired");
        progress({ state: job.state, job });
        await wait(active.controller.signal);
        if (!current()) { this.cancel(); return null; }
        job = await this.api.status(job.id, active.controller.signal);
        if (!current()) return null;
      }
      if (job.state !== "succeeded" || !job.resultId) throw new Error(job.errorCode ?? "engine_failed");
      const result = await this.api.result(job.resultId, active.controller.signal);
      if (!current()) return null;
      if (result.resourceId !== page.resourceId || result.sourceId !== page.sourceId || result.physicalPage !== page.physicalPage || result.deviceId !== deviceId || result.imageWidth !== frame.imageWidth || result.imageHeight !== frame.imageHeight || result.rotation !== frame.rotation || result.imageSha256 !== frame.imageSha256) throw new Error("invalid_result");
      return { result, frame };
    } catch (error) {
      if (!current()) return null;
      if (active.job) void this.api.cancel(active.job.id).catch(() => {});
      throw error;
    } finally { if (this.#active === active) this.#active = null; }
  }
}
