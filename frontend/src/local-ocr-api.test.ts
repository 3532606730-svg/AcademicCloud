import { describe, expect, it, vi } from "vitest";
import { createLocalOcrApi } from "./local-ocr-api.ts";
import { OCR_JOB, OCR_RESULT } from "./local-ocr-test-fixture.ts";
import { ApiClient } from "./api.ts";

describe("private local OCR HTTP client", () => {
  it("uses session routes, encodes identity, and submits only the correction with its revision", async () => {
    const request = vi.fn().mockResolvedValue({ items: [OCR_RESULT], result: OCR_RESULT, job: OCR_JOB });
    const api = createLocalOcrApi(request); const abort = new AbortController();
    expect(await api.results({ resourceId: "book&other=1", sourceId: "source /1", physicalPage: 2 }, abort.signal)).toEqual([OCR_RESULT]);
    expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/results?resourceId=book%26other%3D1&sourceId=source+%2F1&physicalPage=2", { signal: abort.signal });
    await api.correct("result /1", 4, "Private revision");
    expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/results/result%20%2F1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: 4, correctedText: "Private revision" }) });
    await api.cancel("job /1");
    expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/requests/job%20%2F1/cancel", expect.objectContaining({ method: "POST", body: "{}" }));
  });
  it("ApiClient exposes optional module through the existing same-origin authenticated transport", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ devices: [] }), { status: 200 }));
    const api = new ApiClient({ fetcher }); await api.localOcr.devices();
    expect(fetcher).toHaveBeenCalledWith("/api/reader/local-ocr/devices", expect.objectContaining({ credentials: "same-origin" }));
  });
});
