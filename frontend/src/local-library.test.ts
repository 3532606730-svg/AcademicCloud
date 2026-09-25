import { File } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateFileMd5 } from "./md5.ts";
import { loadSourceHandle } from "./file-source-recovery.ts";
import { rememberReaderFile } from "./reader-local-source.ts";
import { localDownloadName, saveToLocalLibrary, type LocalLibraryDirectory, type WritableLocalFile } from "./local-library.ts";
import type { DownloadAuthorization } from "./api.ts";
vi.mock("./file-source-recovery.ts", () => ({ loadSourceHandle: vi.fn(), withHandleStore: vi.fn() }));
vi.mock("./reader-local-source.ts", async (original) => ({ ...await original<typeof import("./reader-local-source.ts")>(), rememberReaderFile: vi.fn().mockResolvedValue(true) }));
const bytes = new TextEncoder().encode("%PDF synthetic exact original");
const file = new File([bytes], "original.pdf") as unknown as globalThis.File;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadSourceHandle).mockResolvedValue(null); });
async function setup(existingFile?: globalThis.File) {
  const writer = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), abort: vi.fn().mockResolvedValue(undefined) };
  const handle = { kind: "file", name: "original.pdf", getFile: vi.fn().mockResolvedValue(existingFile ?? file), createWritable: vi.fn().mockResolvedValue(writer), queryPermission: vi.fn().mockResolvedValue("granted") } as unknown as WritableLocalFile;
  const directory = { name: "AcademicCloud", queryPermission: vi.fn().mockResolvedValue("granted"), getDirectoryHandle: vi.fn(), getFileHandle: vi.fn().mockImplementation(async (_name, options) => { if (!existingFile && !options?.create) throw new DOMException("Missing", "NotFoundError"); return handle; }) } as unknown as LocalLibraryDirectory;
  const authorization: DownloadAuthorization = { method: "GET", url: "https://files.example.test/a", expiresAt: "2026-09-25", source: { resourceId: "resource", sourceId: "src_abc" }, sizeBytes: file.size, checksum: { algorithm: "md5", value: await calculateFileMd5(file) } };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) });
  return { directory, handle, writer, fetcher, input: { accountId: "a", directory, authorization, title: "original.pdf", signal: new AbortController().signal, fetcher } };
}
describe("one-copy local library", () => {
  it("streams a verified original into the one shared directory and remembers it", async () => {
    const f = await setup(); await saveToLocalLibrary(f.input);
    expect(f.directory.getDirectoryHandle).not.toHaveBeenCalled();
    expect(f.writer.write).toHaveBeenCalledWith(bytes); expect(f.writer.close).toHaveBeenCalledTimes(1);
    expect(rememberReaderFile).toHaveBeenCalledWith('reader:["a","resource","src_abc"]', f.handle);
  });
  it("reuses existing verified bytes without another download or duplicate", async () => {
    const f = await setup(file); await saveToLocalLibrary(f.input);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.handle.createWritable).not.toHaveBeenCalled();
    vi.mocked(loadSourceHandle).mockResolvedValue(f.handle);
    await saveToLocalLibrary({ ...f.input, title: "renamed.pdf" });
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.directory.getFileHandle).toHaveBeenCalledTimes(1);
  });
  it("does not commit or associate a download with mismatched bytes", async () => {
    const f = await setup(); f.input.authorization.checksum!.value = "AAAAAAAAAAAAAAAAAAAAAA==";
    await expect(saveToLocalLibrary(f.input)).rejects.toThrow("校验不一致");
    expect(f.writer.abort).toHaveBeenCalledTimes(1); expect(f.writer.close).not.toHaveBeenCalled(); expect(rememberReaderFile).not.toHaveBeenCalled();
  });
  it("preserves a modified file and chooses a fresh name, and refuses revoked permission", async () => {
    const wrong = new File(["edited"], "original.pdf") as unknown as globalThis.File;
    const f = await setup(wrong); await saveToLocalLibrary(f.input);
    const names = vi.mocked(f.directory.getFileHandle).mock.calls.map(([name]) => name);
    expect(names[1]).not.toBe(names[0]);
    expect(localDownloadName("../bad:name.pdf", "src/one")).not.toMatch(/[\\/:]/);
    const second = await setup(); vi.mocked(second.directory.queryPermission).mockResolvedValue("denied");
    await expect(saveToLocalLibrary(second.input)).rejects.toThrow("重新选择"); expect(second.fetcher).not.toHaveBeenCalled();
  });
  it("preserves an externally edited file even when its name has no extension", async () => {
    const wrong = new File(["edited"], "original") as unknown as globalThis.File;
    const f = await setup(wrong);
    await saveToLocalLibrary({ ...f.input, title: "original" });
    const names = vi.mocked(f.directory.getFileHandle).mock.calls.map(([name]) => name);
    expect(names[0]).toBe("original--src_abc");
    expect(names[1]).toMatch(/^original--src_abc--[a-f0-9-]+$/);
    expect(names[1]).not.toBe(names[0]);
  });
});
