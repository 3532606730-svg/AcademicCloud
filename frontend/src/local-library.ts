import SparkMD5 from "spark-md5";
import { hexToBase64 } from "./md5.ts";
import type { DownloadAuthorization } from "./api.ts";
import { loadSourceHandle, withHandleStore, type RecoverableFileHandle } from "./file-source-recovery.ts";
import { readerLocalKey, rememberReaderFile, verifyReaderFile } from "./reader-local-source.ts";

export interface WritableLocalFile extends RecoverableFileHandle {
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}
export interface LocalLibraryDirectory {
  kind: "directory";
  name: string;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<LocalLibraryDirectory>;
  getFileHandle(name: string, options?: { create: boolean }): Promise<WritableLocalFile>;
}
export type DirectoryPicker = (options: { id: string; mode: "readwrite" }) => Promise<LocalLibraryDirectory>;
export const LOCAL_LIBRARY_EVENT = "academiccloud-local-library";
const directoryKey = (accountId: string) => `reader-directory:${accountId}`;

export async function loadLocalLibrary(accountId: string): Promise<LocalLibraryDirectory | null> {
  try { return await withHandleStore<LocalLibraryDirectory>("readonly", (store) => store.get(directoryKey(accountId))) ?? null; }
  catch { return null; }
}
export async function configureLocalLibrary(accountId: string, directory: LocalLibraryDirectory): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  await withHandleStore("readwrite", (store) => store.put(directory, directoryKey(accountId)));
  window.dispatchEvent(new Event(LOCAL_LIBRARY_EVENT));
  return true;
}
export async function unlinkLocalLibrary(accountId: string): Promise<void> {
  await withHandleStore("readwrite", (store) => store.delete(directoryKey(accountId)));
  window.dispatchEvent(new Event(LOCAL_LIBRARY_EVENT));
}
export function localDownloadName(title: string, sourceId: string): string {
  const safe = title.normalize("NFC").replace(/[\x00-\x1f<>:"/\\|?*]/g, "_").replace(/[. ]+$/g, "").slice(0, 90) || "资料";
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 && safe.length - dot <= 10 ? safe.slice(dot) : "";
  const stem = dot > 0 && safe.length - dot <= 10 ? safe.slice(0, dot) : safe;
  return `${stem}--${sourceId.replace(/[^a-zA-Z0-9_-]/g, "_")}${extension}`;
}

/** Uses the approved direct byte path, with a bounded stream and no Core proxy. */
export async function saveToLocalLibrary(input: {
  accountId: string; directory: LocalLibraryDirectory; authorization: DownloadAuthorization; title: string;
  signal: AbortSignal; fetcher?: typeof fetch;
}): Promise<string> {
  const { accountId, directory, authorization, title, signal } = input;
  if (!authorization.source || !authorization.checksum || !Number.isSafeInteger(authorization.sizeBytes)) throw new Error("无法核对原件，请刷新后重试。");
  if (await directory.queryPermission({ mode: "readwrite" }) !== "granted") throw new Error("请点击“本地资料夹”重新选择并授权目录。");
  const key = readerLocalKey(accountId, authorization.source.resourceId, authorization.source.sourceId);
  const remembered = await loadSourceHandle(key);
  if (remembered && await remembered.queryPermission?.({ mode: "read" }) === "granted") {
    try { await verifyReaderFile(await remembered.getFile(), authorization, signal); return remembered.name; }
    catch (error) { if (signal.aborted) throw error; }
  }
  let name = localDownloadName(title, authorization.source.sourceId);
  let existing: WritableLocalFile | null = null;
  try { existing = await directory.getFileHandle(name); }
  catch (error) { if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error; }
  if (existing) {
    try { await verifyReaderFile(await existing.getFile(), authorization, signal); await rememberReaderFile(key, existing); return name; }
    catch (error) {
      if (signal.aborted) throw error;
      // Preserve externally edited files; a fresh unique name avoids overwriting them.
      const dot = name.lastIndexOf(".");
      const suffix = `--${crypto.randomUUID()}`;
      name = dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`;
    }
  }
  const handle = await directory.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await (input.fetcher ?? fetch)(authorization.url, { signal, credentials: "omit" });
    if (!response.ok || !response.body) throw new Error("原件下载失败，请重试。");
    reader = response.body.getReader();
    const digest = new SparkMD5.ArrayBuffer(); let size = 0;
    while (true) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > authorization.sizeBytes!) throw new Error("原件大小不一致，未保存该下载。");
      const data = chunk.value.slice(); digest.append(data.buffer);
      await writer.write(data);
    }
    if (size !== authorization.sizeBytes || hexToBase64(digest.end()) !== authorization.checksum.value) throw new Error("原件校验不一致，未保存该下载。");
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await writer.close();
    await rememberReaderFile(key, handle);
    window.dispatchEvent(new Event(LOCAL_LIBRARY_EVENT));
    return `${directory.name}/${name}`;
  } catch (error) {
    await reader?.cancel().catch(() => {}); await writer.abort().catch(() => {}); throw error;
  }
}
