import { describe, expect, it, vi } from "vitest";
import { LocalOcrController } from "./local-ocr-controller.ts";
import { OCR_FRAME, OCR_JOB, OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";
const page = { resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, physicalPage: OCR_RESULT.physicalPage };

describe("current-page OCR cancellation", () => {
  it("never submits a capture from a changed painted page", async () => {
    let finish!: (value: typeof OCR_FRAME) => void; let current = true;
    const capture = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const api = ocrApi(); const controller = new LocalOcrController(api);
    const operation = controller.recognize(page, OCR_RESULT.deviceId, { capture, isCurrent: () => current }, vi.fn());
    current = false; finish(OCR_FRAME); expect(await operation).toBeNull(); expect(api.create).not.toHaveBeenCalled();
  });
  it("cancels a submitted job even when its create response arrives after navigation", async () => {
    let finish!: (value: typeof OCR_JOB) => void;
    const api = ocrApi({ create: vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; })) }); const controller = new LocalOcrController(api);
    const operation = controller.recognize(page, OCR_RESULT.deviceId, { capture: async () => OCR_FRAME, isCurrent: () => true }, vi.fn());
    await vi.waitFor(() => expect(api.create).toHaveBeenCalled()); controller.cancel(); finish(OCR_JOB);
    expect(await operation).toBeNull(); expect(api.cancel).toHaveBeenCalledWith(OCR_JOB.id); expect(api.result).not.toHaveBeenCalled();
  });
  it("returns a correctly bound saved result and refuses a mismatched frame digest", async () => {
    const api = ocrApi(); const controller = new LocalOcrController(api); const painted = { capture: async () => OCR_FRAME, isCurrent: () => true };
    expect(await controller.recognize(page, OCR_RESULT.deviceId, painted, vi.fn())).toEqual({ result: OCR_RESULT, frame: OCR_FRAME });
    vi.mocked(api.result).mockResolvedValue({ ...OCR_RESULT, imageSha256: "b".repeat(64) });
    await expect(controller.recognize(page, OCR_RESULT.deviceId, painted, vi.fn())).rejects.toThrow("invalid_result");
  });
  it("ignores an old result read after account/source cancellation", async () => {
    let finish!: (value: typeof OCR_RESULT) => void;
    const api = ocrApi({ result: vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; })) }); const controller = new LocalOcrController(api);
    const operation = controller.recognize(page, OCR_RESULT.deviceId, { capture: async () => OCR_FRAME, isCurrent: () => true }, vi.fn());
    await vi.waitFor(() => expect(api.result).toHaveBeenCalled()); controller.cancel(); finish(OCR_RESULT); expect(await operation).toBeNull();
  });
  it("does not silently retry an expired or busy request", async () => {
    const api = ocrApi({ create: vi.fn().mockResolvedValue({ ...OCR_JOB, state: "queued", resultId: null, expiresAt: "2000-01-01T00:00:00Z" }) }); const controller = new LocalOcrController(api);
    const painted = { capture: async () => OCR_FRAME, isCurrent: () => true };
    await expect(controller.recognize(page, OCR_RESULT.deviceId, painted, vi.fn())).rejects.toThrow("expired");
    expect(api.create).toHaveBeenCalledTimes(1); expect(api.status).not.toHaveBeenCalled(); expect(api.cancel).toHaveBeenCalledWith(OCR_JOB.id);
  });
});
