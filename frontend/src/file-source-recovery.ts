export interface RecoverableFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  queryPermission?(descriptor?: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode: "read" }): Promise<PermissionState>;
}

export type SourceRecoveryResult =
  | { status: "available"; file: File; handle: RecoverableFileHandle }
  | { status: "unavailable"; reason: "missing" | "permission" | "stale" };

const DATABASE_NAME = "academiccloud-source-recovery";
const STORE_NAME = "file-handles";

function openHandleDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open source recovery storage."));
  });
}

async function withHandleStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const database = await openHandleDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Source recovery storage failed."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Source recovery storage was aborted."));
    };
  });
}

export async function rememberSourceHandle(fileId: string, handle: RecoverableFileHandle | null): Promise<boolean> {
  if (!handle) return false;
  try {
    await withHandleStore("readwrite", (store) => store.put(handle, fileId));
    return true;
  } catch {
    // Handles are optional progressive enhancement. Upload correctness must
    // never depend on a browser accepting a structured clone of the handle.
    return false;
  }
}

export async function forgetSourceHandle(fileId: string): Promise<void> {
  try {
    await withHandleStore("readwrite", (store) => store.delete(fileId));
  } catch {
    // Cleanup is best-effort; a stale handle still passes through permission,
    // getFile(), and checksum identity verification before any part is reused.
  }
}

export async function loadSourceHandle(fileId: string): Promise<RecoverableFileHandle | null> {
  try {
    return await withHandleStore<RecoverableFileHandle>("readonly", (store) => store.get(fileId)) ?? null;
  } catch {
    return null;
  }
}

export async function recoverFileFromHandle(
  handle: RecoverableFileHandle | null,
): Promise<SourceRecoveryResult> {
  if (!handle) return { status: "unavailable", reason: "missing" };
  try {
    let permission = await handle.queryPermission?.({ mode: "read" }) ?? "prompt";
    if (permission === "prompt") {
      permission = await handle.requestPermission?.({ mode: "read" }) ?? "denied";
    }
    if (permission !== "granted") return { status: "unavailable", reason: "permission" };
    return { status: "available", file: await handle.getFile(), handle };
  } catch {
    return { status: "unavailable", reason: "stale" };
  }
}

export async function recoverRememberedSource(fileId: string): Promise<SourceRecoveryResult> {
  return recoverFileFromHandle(await loadSourceHandle(fileId));
}
