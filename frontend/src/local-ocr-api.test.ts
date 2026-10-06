import { describe, expect, it, vi } from "vitest";
import { createLocalOcrApi } from "./local-ocr-api.ts";
import { OCR_BOOK_JOB, OCR_BOOK_PROGRESS, OCR_JOB, OCR_RESULT } from "./local-ocr-test-fixture.ts";
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
  it("reads book progress with cancellation and exposes normal same-origin export links", async () => {
    const request = vi.fn().mockResolvedValue(OCR_BOOK_PROGRESS); const api = createLocalOcrApi(request); const abort = new AbortController();
    const book = { resourceId: "book&other=1", sourceId: "source /1", pageCount: 313 };
    expect(await api.bookProgress(book, abort.signal)).toEqual(OCR_BOOK_PROGRESS);
    expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/book-progress?resourceId=book%26other%3D1&sourceId=source+%2F1&pageCount=313", { signal: abort.signal });
    expect(api.bookExportUrl(book, "txt")).toBe("/api/reader/local-ocr/book-export?resourceId=book%26other%3D1&sourceId=source+%2F1&pageCount=313&format=txt");
    expect(api.bookExportUrl(book, "jsonl")).toMatch(/&format=jsonl$/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("restores and explicitly controls device-owned jobs using session transport", async () => {
    const request = vi.fn().mockResolvedValue({ jobs: [OCR_BOOK_JOB], job: OCR_BOOK_JOB }); const api = createLocalOcrApi(request); const abort = new AbortController();
    expect(await api.books({ resourceId: "book&other=1", sourceId: "source /1", pageCount: 313 }, abort.signal)).toEqual([OCR_BOOK_JOB]);
    expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/books?resourceId=book%26other%3D1&sourceId=source+%2F1", { signal: abort.signal });
    const input = { clientRequestId: "stable-key", deviceId: "new-device", resourceId: "book", sourceId: "source", pageCount: 313 };
    await api.createBook(input); expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/books", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
    await api.bookJob("book /1", abort.signal); expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/books/book%20%2F1", { signal: abort.signal });
    await api.pauseBook("book /1"); expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/books/book%20%2F1/pause", expect.objectContaining({ method: "POST", body: "{}" }));
    await api.resumeBook("book /1", "re-paired-device"); expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/books/book%20%2F1/resume", expect.objectContaining({ method: "POST", body: JSON.stringify({ deviceId: "re-paired-device" }) }));
    await api.cancelBook("book /1"); expect(request).toHaveBeenLastCalledWith("/api/reader/local-ocr/books/book%20%2F1/cancel", expect.objectContaining({ method: "POST", body: "{}" }));
  });
});
