import { File } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateFileMd5 } from "./md5.ts";
import { loadSourceHandle, rememberSourceHandle } from "./file-source-recovery.ts";
import { readerLocalKey, rememberReaderFile, restoreReaderFile, verifyReaderFile } from "./reader-local-source.ts";
vi.mock("./file-source-recovery.ts", () => ({ loadSourceHandle: vi.fn(), rememberSourceHandle: vi.fn(), forgetSourceHandle: vi.fn() }));
const file = new File(["%PDF synthetic original"], "original.pdf", { type: "application/pdf" }) as unknown as globalThis.File;
beforeEach(() => vi.clearAllMocks());
describe("local reader source identity", () => {
  it("accepts identical bytes regardless of filename and rejects same-size changed content", async () => {
    const identity = { sizeBytes: file.size, checksum: { algorithm: "md5" as const, value: await calculateFileMd5(file) } };
    await expect(verifyReaderFile(file, identity)).resolves.toBeUndefined();
    const wrong = new File(["X".repeat(file.size)], "original.pdf") as unknown as globalThis.File;
    await expect(verifyReaderFile(wrong, identity)).rejects.toThrow("reader_file_mismatch");
    await expect(verifyReaderFile(file, {})).rejects.toThrow("reader_identity_unavailable");
  });
  it("separates account and source handles and never prompts on automatic restoration", async () => {
    expect(readerLocalKey("a", "r", "s")).not.toBe(readerLocalKey("b", "r", "s"));
    expect(readerLocalKey("a", "r", "s")).not.toBe(readerLocalKey("a", "r", "t"));
    const handle = { queryPermission: vi.fn().mockResolvedValue("prompt"), requestPermission: vi.fn(), getFile: vi.fn() };
    vi.mocked(loadSourceHandle).mockResolvedValue(handle as never);
    expect(await restoreReaderFile("key", {})).toEqual({ needsSelection: true });
    expect(handle.requestPermission).not.toHaveBeenCalled(); expect(handle.getFile).not.toHaveBeenCalled();
  });
  it("restores only a permitted exact original and falls back on changed files", async () => {
    const identity = { sizeBytes: file.size, checksum: { algorithm: "md5" as const, value: await calculateFileMd5(file) } };
    const handle = { queryPermission: vi.fn().mockResolvedValue("granted"), getFile: vi.fn().mockResolvedValue(file) };
    vi.mocked(loadSourceHandle).mockResolvedValue(handle as never);
    expect(await restoreReaderFile("key", identity)).toEqual({ file, needsSelection: false });
    expect(await restoreReaderFile("key", { ...identity, sizeBytes: 1 })).toEqual({ needsSelection: true });
    expect(await rememberReaderFile("key", null)).toBe(false); expect(rememberSourceHandle).not.toHaveBeenCalled();
  });
});
