import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcademicCloudApi, LibraryHolding, LibrarySummary } from "./api.ts";
import { BatchCatalogDialog } from "./batch-catalog.tsx";
import { LanguageProvider } from "./i18n-react.tsx";

const LIBRARY: LibrarySummary = { id: "export-library", name: "Library", role: "manager", isDefault: true, createdAt: "2026-09-01T00:00:00Z" };
const HOLDINGS: LibraryHolding[] = ["first", "second", "third"].map((id) => ({
  recordId: `record-${id}`, recordLabel: `${id}.pdf`, canonicalTitle: null, authorLabels: [], artifactId: `artifact-${id}`,
  versionId: `version-${id}`, version: "v".repeat(43),
  file: { id, displayName: `${id}.pdf`, mediaType: "application/pdf", sizeBytes: 10, updatedAt: "2026-09-01T00:00:00Z" },
}));
const FILENAME = "academiccloud-catalog-batch-export-1.zip";
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
const REQUEST = {
  schemaVersion: "academiccloud.catalog-export-request.v1",
  manifest: { batchId: "export-1", resources: HOLDINGS.map((entry) => ({ resourceId: entry.file.id })) },
  sourceManifestSha256: "a".repeat(64),
  sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "private-token", expiresAt: "2099-09-01T00:00:00Z" },
};

function zipResponse(filename = FILENAME, failedResources = 0): Response {
  return new Response(ZIP_BYTES, { status: 200, headers: {
    "Content-Type": "application/zip", "Content-Length": String(ZIP_BYTES.length),
    "X-AcademicCloud-Filename": filename, "X-AcademicCloud-Failed-Resources": String(failedResources),
  } });
}

function mockDownloads() {
  let next = 0;
  const createObjectURL = vi.fn((_blob: Blob) => `blob:export-${++next}`);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
  const automaticClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return { createObjectURL, revokeObjectURL, automaticClick };
}

function dialog(api: AcademicCloudApi, accountId = "owner", library = LIBRARY, onClose = vi.fn()) {
  return <LanguageProvider><BatchCatalogDialog api={api} library={library} initialHoldings={HOLDINGS}
    reviewSession={{ accountId }} onClose={onClose} onApplied={vi.fn()} /></LanguageProvider>;
}

beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
  window.sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true,
    value: vi.fn(function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); }),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem("academiccloud.language");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BatchCatalogDialog recoverable evidence download", () => {
  it.each([
    ["en", 0, "Evidence package generated (3)", "Download evidence package"],
    ["en", 2, "Evidence package generated (3 items; 2 inspection failures need review)", "Download evidence package"],
    ["zh-CN", 0, "证据包已生成（3 项）", "下载证据包"],
    ["zh-CN", 2, "证据包已生成（3 项；2 项检查失败，需核对）", "下载证据包"],
  ])("offers the generated package in %s with %s inspection failures without claiming a saved file", async (language, failedResources, readyText, downloadText) => {
    window.localStorage.setItem("academiccloud.language", String(language));
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue(REQUEST);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(zipResponse(FILENAME, Number(failedResources))));
    const { createObjectURL, revokeObjectURL, automaticClick } = mockDownloads();
    render(dialog({ createCatalogBatchExportRequest } as unknown as AcademicCloudApi));
    await userEvent.setup().click(screen.getByRole("button", { name: language === "zh-CN" ? "生成证据包" : "Generate evidence package" }));
    const link = await screen.findByRole("link", { name: String(downloadText) });
    expect(screen.getByRole("status")).toHaveTextContent(String(readyText));
    expect(screen.getByRole("status")).not.toHaveTextContent(/downloaded|已下载/u);
    expect(link).toHaveAttribute("href", "blob:export-1");
    expect(link).toHaveAttribute("download", FILENAME);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(automaticClick).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("downloads the same retained bytes repeatedly without another Core or bridge call", async () => {
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue(REQUEST);
    const fetchMock = vi.fn().mockResolvedValue(zipResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { createObjectURL, revokeObjectURL } = mockDownloads();
    render(dialog({ createCatalogBatchExportRequest } as unknown as AcademicCloudApi));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    const link = await screen.findByRole("link", { name: "Download evidence package" });
    const downloads: string[] = [];
    link.addEventListener("click", (event) => { event.preventDefault(); downloads.push(link.getAttribute("href")!); });
    fireEvent.click(link);
    fireEvent.click(link);
    expect(downloads).toEqual(["blob:export-1", "blob:export-1"]);
    expect(createCatalogBatchExportRequest).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    expect(new Uint8Array(bytes)).toEqual(ZIP_BYTES);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(link).toHaveAttribute("download", FILENAME);
    expect(screen.getByRole("status")).toHaveTextContent("Evidence package generated (3)");
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-1");
    expect(screen.queryByRole("link", { name: "Download evidence package" })).not.toBeInTheDocument();
  });

  it("releases the previous package on a new export and the replacement on unmount", async () => {
    let finishRequest!: (value: typeof REQUEST) => void;
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValueOnce(REQUEST)
      .mockImplementationOnce(() => new Promise((resolve) => { finishRequest = resolve; }));
    const fetchMock = vi.fn().mockResolvedValueOnce(zipResponse()).mockResolvedValueOnce(zipResponse("academiccloud-catalog-batch-export-2.zip"));
    vi.stubGlobal("fetch", fetchMock);
    const { createObjectURL, revokeObjectURL } = mockDownloads();
    const view = render(dialog({ createCatalogBatchExportRequest } as unknown as AcademicCloudApi));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    await screen.findByRole("link", { name: "Download evidence package" });
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-1");
    expect(screen.queryByRole("link", { name: "Download evidence package" })).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence package generated (3)")).not.toBeInTheDocument();
    await act(async () => { finishRequest(REQUEST); });
    expect(await screen.findByRole("link", { name: "Download evidence package" })).toHaveAttribute("download", "academiccloud-catalog-batch-export-2.zip");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(revokeObjectURL.mock.calls).toEqual([["blob:export-1"], ["blob:export-2"]]);
  });

  it.each(["account", "library", "api"])("releases an export when the %s scope changes", async (scope) => {
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue(REQUEST);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(zipResponse()));
    const { revokeObjectURL } = mockDownloads();
    const api = { createCatalogBatchExportRequest } as unknown as AcademicCloudApi;
    const view = render(dialog(api));
    await userEvent.setup().click(screen.getByRole("button", { name: "Generate evidence package" }));
    await screen.findByRole("link", { name: "Download evidence package" });
    view.rerender(dialog(scope === "api" ? { ...api } : api, scope === "account" ? "other" : "owner",
      scope === "library" ? { ...LIBRARY, id: "other-library" } : LIBRARY));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-1");
    expect(screen.queryByRole("link", { name: "Download evidence package" })).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence package generated (3)")).not.toBeInTheDocument();
  });

  it.each(["core", "bridge"])("ignores a late %s completion after the dialog is cancelled", async (stage) => {
    let finishRequest!: (value: typeof REQUEST) => void;
    let finishBridge!: (value: Response) => void;
    const createCatalogBatchExportRequest = stage === "core"
      ? vi.fn(() => new Promise((resolve) => { finishRequest = resolve; })) : vi.fn().mockResolvedValue(REQUEST);
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => { finishBridge = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { createObjectURL, automaticClick } = mockDownloads();
    const onClose = vi.fn();
    render(dialog({ createCatalogBatchExportRequest } as unknown as AcademicCloudApi, "owner", LIBRARY, onClose));
    await userEvent.setup().click(screen.getByRole("button", { name: "Generate evidence package" }));
    await waitFor(() => expect(stage === "core" ? createCatalogBatchExportRequest : fetchMock).toHaveBeenCalledTimes(1));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => { if (stage === "core") finishRequest(REQUEST); else finishBridge(zipResponse()); });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(automaticClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Download evidence package" })).not.toBeInTheDocument();
    if (stage === "core") expect(fetchMock).not.toHaveBeenCalled();
    else expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });

  it.each(["account", "library", "api"])("aborts obsolete %s work and ignores its late Core completion", async (scope) => {
    let finishRequest!: (value: typeof REQUEST) => void;
    const createCatalogBatchExportRequest = vi.fn(() => new Promise((resolve) => { finishRequest = resolve; }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createObjectURL } = mockDownloads();
    const api = { createCatalogBatchExportRequest } as unknown as AcademicCloudApi;
    const view = render(dialog(api));
    await userEvent.setup().click(screen.getByRole("button", { name: "Generate evidence package" }));
    view.rerender(dialog(scope === "api" ? { ...api } : api, scope === "account" ? "other" : "owner",
      scope === "library" ? { ...LIBRARY, id: "other-library" } : LIBRARY));
    await act(async () => { finishRequest(REQUEST); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Generate evidence package" })).toBeEnabled();
  });
});
