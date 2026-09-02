import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcademicCloudApi, CatalogPreview, LibraryHolding, LibrarySummary } from "./api.ts";
import { BatchCatalogDialog } from "./batch-catalog.tsx";
import { LanguageProvider } from "./i18n-react.tsx";

const LIBRARY: LibrarySummary = { id: "library-1", name: "资料库", role: "manager", isDefault: true, createdAt: "2026-09-01T00:00:00.000Z" };
const HOLDINGS: LibraryHolding[] = ["auto", "review", "unknown"].map((id) => ({
  recordId: `record-${id}`, recordLabel: `${id}.pdf`, canonicalTitle: null, authorLabels: [], artifactId: `artifact-${id}`,
  versionId: `version-${id}`, version: "v".repeat(43),
  file: { id, displayName: `${id}.pdf`, mediaType: "application/pdf", sizeBytes: 10, updatedAt: "2026-09-01T00:00:00.000Z" },
}));
const EXTRA_HOLDING: LibraryHolding = {
  recordId: "record-extra", recordLabel: "extra.pdf", canonicalTitle: null, authorLabels: [], artifactId: "artifact-extra",
  versionId: "version-extra", version: "v".repeat(43),
  file: { id: "extra", displayName: "extra.pdf", mediaType: "application/pdf", sizeBytes: 10, updatedAt: "2026-09-01T00:00:00.000Z" },
};
const PREVIEW: CatalogPreview = {
  batchId: "batch-1", documentDigest: "a".repeat(64),
  counts: { AUTO: 1, REVIEW: 1, UNKNOWN: 1, EXCLUDED: 0, STALE: 0, COLLISION: 0, UNCHANGED: 0 },
  items: [
    { resourceId: "auto", currentFilename: "auto.pdf", proposedFilename: "《书》（作者，2026）.pdf", canonicalTitle: "书", responsibility: "作者", year: "2026", materialClass: "scholarly_monograph", disposition: "auto", confidence: 96, notes: null, identityMatch: true, collisionStatus: "none", renameStatus: "proposed", metadataChanges: ["canonicalTitle", "displayName"], warnings: ["invalid_isbn_removed"], category: "auto", previewVersion: "a".repeat(43) },
    { resourceId: "review", currentFilename: "review.pdf", proposedFilename: null, canonicalTitle: "待审", responsibility: null, year: "2026", materialClass: "scholarly_monograph", disposition: "review", confidence: 70, notes: null, identityMatch: true, collisionStatus: "none", renameStatus: "no_rename", metadataChanges: ["canonicalTitle"], warnings: [], category: "review", previewVersion: "b".repeat(43) },
    { resourceId: "unknown", currentFilename: "unknown.pdf", proposedFilename: null, canonicalTitle: null, responsibility: null, year: null, materialClass: null, disposition: "unknown", confidence: 0, notes: null, identityMatch: true, collisionStatus: "none", renameStatus: "no_rename", metadataChanges: [], warnings: [], category: "unknown", previewVersion: "c".repeat(43) },
  ],
};

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
});

function renderDialog(api: Partial<AcademicCloudApi>, initialHoldings: LibraryHolding[] = HOLDINGS) {
  render(<LanguageProvider><BatchCatalogDialog api={api as AcademicCloudApi} library={LIBRARY} initialHoldings={initialHoldings} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
}

describe("BatchCatalogDialog", () => {
  it("imports to a side-effect-free preview and applies only explicitly selected eligible rows", async () => {
    const previewCatalogBatchResults = vi.fn().mockResolvedValue(PREVIEW);
    const applyCatalogBatchResults = vi.fn().mockResolvedValue({ results: [
      { resourceId: "auto", status: "applied", displayName: "《书》（作者，2026）.pdf" },
      { resourceId: "review", status: "applied", displayName: "review.pdf" },
    ] });
    renderDialog({
      listLibraryHoldingsSorted: vi.fn().mockResolvedValue({ holdings: HOLDINGS, nextCursor: null }),
      previewCatalogBatchResults,
      applyCatalogBatchResults,
    });
    const user = userEvent.setup();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([JSON.stringify({ schemaVersion: "academiccloud.catalog-results.v1" })], "results.json", { type: "application/json" }));
    await waitFor(() => expect(previewCatalogBatchResults).toHaveBeenCalledTimes(1));
    const checkboxes = screen.getAllByRole("checkbox");
    // First three are export-resource choices; preview choices follow.
    expect(checkboxes[3]).toBeChecked();
    expect(checkboxes[4]).not.toBeChecked();
    expect(checkboxes[5]).toBeDisabled();
    expect(screen.getAllByText("Content identity")).toHaveLength(3);
    expect(screen.getAllByText("Collision")).toHaveLength(3);
    expect(screen.getAllByText("Metadata changes")).toHaveLength(3);
    expect(screen.getByText("Invalid ISBN checksum removed; other supported bibliography is retained")).toBeInTheDocument();
    expect(screen.getByText("canonicalTitle, displayName")).toBeInTheDocument();
    await user.click(checkboxes[4]!);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Apply selected (2)" }));
    await waitFor(() => expect(applyCatalogBatchResults).toHaveBeenCalledWith(
      LIBRARY.id,
      { schemaVersion: "academiccloud.catalog-results.v1" },
      PREVIEW.documentDigest,
      [
        { resourceId: "auto", previewVersion: "a".repeat(43) },
        { resourceId: "review", previewVersion: "b".repeat(43) },
      ],
    ));
  });

  it("keeps the export list and request bounded to the PDFs selected before opening the dialog", async () => {
    const initialHoldings = HOLDINGS.slice(0, 2);
    const listLibraryHoldingsSorted = vi.fn().mockResolvedValue({ holdings: [...HOLDINGS, EXTRA_HOLDING], nextCursor: null });
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue({
      schemaVersion: "academiccloud.catalog-export-request.v1",
      manifest: { batchId: "batch-2", resources: initialHoldings.map((entry) => ({ resourceId: entry.file.id, currentFilename: entry.file.displayName })) },
      sourceManifestSha256: "a".repeat(64),
      sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "secret", expiresAt: "2026-09-02T00:00:00.000Z" },
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderDialog({ listLibraryHoldingsSorted, createCatalogBatchExportRequest }, initialHoldings);
    const user = userEvent.setup();

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("unknown.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("extra.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/Export bounded local text\/OCR evidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Run the documented Local Compute catalog exporter/)).not.toBeInTheDocument();
    expect(listLibraryHoldingsSorted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Prepare local evidence export" }));
    await waitFor(() => expect(createCatalogBatchExportRequest).toHaveBeenCalledWith(LIBRARY.id, ["auto", "review"]));
  });

  it("downloads only the private local-export request prepared by Core", async () => {
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue({
      schemaVersion: "academiccloud.catalog-export-request.v1",
      manifest: { batchId: "batch-1", resources: HOLDINGS.map((entry) => ({ resourceId: entry.file.id, currentFilename: entry.file.displayName })) },
      sourceManifestSha256: "a".repeat(64),
      sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "secret", expiresAt: "2026-09-02T00:00:00.000Z" },
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderDialog({
      listLibraryHoldingsSorted: vi.fn().mockResolvedValue({ holdings: HOLDINGS, nextCursor: null }),
      createCatalogBatchExportRequest,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Prepare local evidence export" }));
    await waitFor(() => expect(createCatalogBatchExportRequest).toHaveBeenCalledWith(LIBRARY.id, ["auto", "review", "unknown"]));
    expect(await screen.findByRole("status")).toHaveTextContent("Private local-export request prepared for 3 resources");
  });
});
