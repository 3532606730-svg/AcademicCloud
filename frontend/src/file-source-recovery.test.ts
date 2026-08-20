import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetSourceHandle,
  loadSourceHandle,
  recoverFileFromHandle,
  rememberSourceHandle,
  type RecoverableFileHandle,
} from "./file-source-recovery.ts";

const originalIndexedDb = globalThis.indexedDB;

afterEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: originalIndexedDb });
});

function installMemoryIndexedDb(): void {
  const values = new Map<IDBValidKey, unknown>();
  let created = false;
  const database = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => { created = true; },
    close: () => undefined,
    transaction: () => {
      const transaction: {
        error: null;
        oncomplete: (() => void) | null;
        onabort: (() => void) | null;
        objectStore: () => IDBObjectStore;
      } = {
        error: null,
        oncomplete: null,
        onabort: null,
        objectStore: () => ({
          put: (value?: unknown, key?: IDBValidKey) => requestFor(() => {
            values.set(key!, value);
            return key;
          }, transaction),
          get: (key?: IDBValidKey) => requestFor(() => values.get(key!), transaction),
          delete: (key?: IDBValidKey) => requestFor(() => {
            values.delete(key!);
            return undefined;
          }, transaction),
        } as unknown as IDBObjectStore),
      };
      return transaction;
    },
  };
  function requestFor(result: () => unknown, transaction: { oncomplete: (() => void) | null }): IDBRequest {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null } as unknown as IDBRequest;
    queueMicrotask(() => {
      Object.defineProperty(request, "result", { configurable: true, value: result() });
      request.onsuccess?.(new Event("success") as IDBRequestEventMap["success"]);
      transaction.oncomplete?.();
    });
    return request;
  }
  const indexedDb = {
    open: () => {
      const request = {
        result: database,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (!created) request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
        request.onsuccess?.(new Event("success") as IDBRequestEventMap["success"]);
      });
      return request;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDb });
}

function handle(overrides: Partial<RecoverableFileHandle> = {}): RecoverableFileHandle {
  return {
    kind: "file",
    name: "source.pdf",
    getFile: vi.fn().mockResolvedValue(new File(["source"], "source.pdf", { type: "application/pdf" })),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    ...overrides,
  };
}

describe("file source recovery", () => {
  it("retains and clears a user-granted handle in browser durable storage", async () => {
    installMemoryIndexedDb();
    const source = handle();

    await expect(rememberSourceHandle("pending-1", source)).resolves.toBe(true);
    await expect(loadSourceHandle("pending-1")).resolves.toBe(source);
    await forgetSourceHandle("pending-1");
    await expect(loadSourceHandle("pending-1")).resolves.toBeNull();
  });

  it("reuses a readable user-granted handle", async () => {
    const source = handle();

    await expect(recoverFileFromHandle(source)).resolves.toMatchObject({
      status: "available",
      file: { name: "source.pdf" },
      handle: source,
    });
    expect(source.requestPermission).not.toHaveBeenCalled();
  });

  it("requests read permission only when the browser reports prompt", async () => {
    const source = handle({ queryPermission: vi.fn().mockResolvedValue("prompt") });

    await expect(recoverFileFromHandle(source)).resolves.toMatchObject({ status: "available" });
    expect(source.requestPermission).toHaveBeenCalledWith({ mode: "read" });
  });

  it("fails closed to the manual-source fallback when permission is denied", async () => {
    const source = handle({ queryPermission: vi.fn().mockResolvedValue("denied") });

    await expect(recoverFileFromHandle(source)).resolves.toEqual({ status: "unavailable", reason: "permission" });
    expect(source.getFile).not.toHaveBeenCalled();
  });

  it("fails closed when a remembered source was moved or deleted", async () => {
    const source = handle({ getFile: vi.fn().mockRejectedValue(new DOMException("gone", "NotFoundError")) });

    await expect(recoverFileFromHandle(source)).resolves.toEqual({ status: "unavailable", reason: "stale" });
  });
});
