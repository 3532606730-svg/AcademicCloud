import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./api.ts";
import { createWorkspaceApi, type PageNote, type ResearchCollection } from "./workspace-api.ts";

const NOTE: PageNote = { id: "note / 1", resourceId: "file-1", sourceId: "source-1", physicalPage: 8, locator: null,
  body: "Private body", revision: 3, createdAt: "2026-09-15", updatedAt: "2026-09-15", deletedAt: null };
const COLLECTION: ResearchCollection = { id: "set / 1", name: "Research", revision: 4, archivedAt: null, itemCount: 1, createdAt: "2026-09-15", updatedAt: "2026-09-15" };

describe("private workspace API", () => {
  it("sends explicit CAS and authored fields without actor claims or attachment rebinding", async () => {
    const request = vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>().mockResolvedValue({ note: NOTE, collection: COLLECTION });
    const api = createWorkspaceApi(request as Parameters<typeof createWorkspaceApi>[0]);
    await api.updateNote(NOTE, { body: "Revised", locator: "葉三", deleted: true });
    expect(request).toHaveBeenLastCalledWith("/api/workspace/notes/note%20%2F%201", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]!.body))).toEqual({ body: "Revised", locator: "葉三", deleted: true, revision: 3 });
    await api.updateCollection(COLLECTION, "Renamed", true);
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]!.body))).toEqual({ name: "Renamed", archived: true, revision: 4 });
    expect(await api.setCollectionItem(COLLECTION, "file / 1", false)).toEqual(COLLECTION);
    expect(request.mock.calls.at(-1)![0]).toBe("/api/workspace/collections/set%20%2F%201/items/file%20%2F%201");
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]!.body))).toEqual({ included: false, revision: 4 });
    await api.createNote({ resourceId: NOTE.resourceId, sourceId: NOTE.sourceId, physicalPage: 8, locator: null, body: NOTE.body });
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]!.body))).toEqual({ resourceId: "file-1", sourceId: "source-1", physicalPage: 8, locator: null, body: "Private body" });
    for (const [, init] of request.mock.calls) expect(String(init?.body)).not.toMatch(/accountId|ownerId|role|createdAt|updatedAt/);
  });

  it("encodes page filters and forwards cancellation without emitting empty cursor parameters", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextBeforeId: null, resources: [], collections: [] });
    const api = createWorkspaceApi(request);
    const controller = new AbortController();
    await api.notes({ resourceId: "file / one", deleted: false, beforeId: "note&two" }, controller.signal);
    expect(request).toHaveBeenLastCalledWith("/api/workspace/notes?resourceId=file+%2F+one&deleted=false&beforeId=note%26two", { signal: controller.signal });
    await api.reading(undefined, controller.signal);
    expect(request).toHaveBeenLastCalledWith("/api/workspace/reading", { signal: controller.signal });
    await api.note("note / one", controller.signal);
    expect(request).toHaveBeenLastCalledWith("/api/workspace/notes/note%20%2F%20one", { signal: controller.signal });
    await api.collectionItems("set-one", "file-z", controller.signal);
    expect(request).toHaveBeenLastCalledWith("/api/workspace/collections/set-one/items?beforeId=file-z", { signal: controller.signal });
  });

  it("uses authenticated ApiClient transport and preserves conflict errors for drafts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ collection: COLLECTION }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ error: "concurrent_change" }), { status: 409, headers: { "content-type": "application/json" } }));
    const api = new ApiClient({ fetcher });
    await api.workspace!.setCollectionItem(COLLECTION, "file-one", true);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: "same-origin", method: "PUT" });
    await expect(api.workspace!.updateNote(NOTE, { body: "Draft", locator: null, deleted: false })).rejects.toEqual(new ApiError(409, "concurrent_change"));
  });
});
