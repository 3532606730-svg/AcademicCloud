import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcademicCloudApi, LibraryHolding, LibrarySummary } from "./api.ts";
import { BatchCatalogDialog } from "./batch-catalog.tsx";
import { LanguageProvider } from "./i18n-react.tsx";

const LIBRARY: LibrarySummary = {
  id: "library-boundary",
  name: "Boundary",
  role: "manager",
  isDefault: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function holding(index: number): LibraryHolding {
  return {
    recordId: `record-${index}`,
    recordLabel: `${index}.pdf`,
    canonicalTitle: null,
    authorLabels: [],
    artifactId: `artifact-${index}`,
    versionId: `version-${index}`,
    version: "v".repeat(43),
    file: {
      id: `resource-${index}`,
      displayName: `${index}.pdf`,
      mediaType: "application/pdf",
      sizeBytes: 10,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  };
}

function renderDialog(api: Partial<AcademicCloudApi>, holdings: LibraryHolding[]) {
  return render(
    <LanguageProvider>
      <BatchCatalogDialog api={api as AcademicCloudApi} library={LIBRARY} initialHoldings={holdings} onClose={vi.fn()} onApplied={vi.fn()} />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); }),
  });
});

afterEach(() => {
  window.localStorage.removeItem("academiccloud.language");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BatchCatalogDialog hard boundaries", () => {
  it("caps an oversized initial PDF selection at the V1 500-resource limit", async () => {
    const holdings = Array.from({ length: 501 }, (_, index) => holding(index));
    const createCatalogBatchExportRequest = vi.fn().mockRejectedValue(new Error("stop-before-local-export"));
    renderDialog({ createCatalogBatchExportRequest }, holdings);

    expect(screen.getByText("500 selected")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(500);
    expect(screen.queryByText("500.pdf")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    await waitFor(() => expect(createCatalogBatchExportRequest).toHaveBeenCalledTimes(1));
    const ids = createCatalogBatchExportRequest.mock.calls[0]![1] as string[];
    expect(ids).toHaveLength(500);
    expect(ids).not.toContain("resource-500");
  });

  it("aborts the loopback request when the dialog unmounts during an export", async () => {
    const request = {
      schemaVersion: "academiccloud.catalog-export-request.v1",
      manifest: { batchId: "batch-boundary", resources: [{ resourceId: "resource-0" }] },
      sourceManifestSha256: "a".repeat(64),
      sourceAccess: {
        coreBaseUrl: "https://cloud.ajtlab.top",
        capabilityToken: "x".repeat(43),
        expiresAt: "2099-09-02T00:00:00.000Z",
      },
    };
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue(request);
    const observedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) {
        reject(new TypeError("missing AbortSignal"));
        return;
      }
      observedSignals.push(signal);
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const view = renderDialog({ createCatalogBatchExportRequest }, [holding(0)]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(observedSignals).toHaveLength(1);
    expect(observedSignals[0]!.aborted).toBe(false);
    view.unmount();
    expect(observedSignals[0]!.aborted).toBe(true);
  });
});
