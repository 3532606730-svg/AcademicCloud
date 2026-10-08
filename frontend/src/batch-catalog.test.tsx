import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcademicCloudApi, CatalogPreview, LibraryHolding, LibrarySummary } from "./api.ts";
import { BatchCatalogDialog } from "./batch-catalog.tsx";
import { clearCatalogReviewDrafts } from "./catalog-review-draft.ts";
import { LOCAL_CATALOG_BRIDGE_URL } from "./catalog-local-bridge.ts";
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
  batchId: "batch-1", documentDigest: "a".repeat(64), planId: "p".repeat(43), expiresAt: "2100-01-01T00:00:00Z",
  counts: { AUTO: 0, REVIEW: 2, UNKNOWN: 1, EXCLUDED: 0, STALE: 0, COLLISION: 0, UNCHANGED: 0 },
  items: [
    { resourceId: "auto", currentFilename: "auto.pdf", proposedFilename: "《书》（作者，2026）.pdf", canonicalTitle: "书", responsibility: "作者", year: "2026", materialClass: "scholarly_monograph", disposition: "auto", confidence: 96, notes: null, identityMatch: true, collisionStatus: "none", renameStatus: "proposed", metadataChanges: ["canonicalTitle", "displayName"], warnings: ["invalid_isbn_removed"], category: "review", previewVersion: "a".repeat(43), fields: [{ field: "canonicalTitle", currentValue: "Original title", proposedValue: "Corrected title", operation: "set", currentAuthority: "unattributed", proposedAuthority: "human", evidenceState: "unverified", notes: null }], evidence: { executionState: "ready", state: "unverified", pages: [0], notes: null }, requiresAcknowledgement: { humanConflict: false, clear: false, evidence: true } },
    { resourceId: "review", currentFilename: "review.pdf", proposedFilename: null, canonicalTitle: "待审", responsibility: null, year: "2026", materialClass: "scholarly_monograph", disposition: "review", confidence: 70, notes: null, identityMatch: true, collisionStatus: "none", renameStatus: "no_rename", metadataChanges: ["canonicalTitle"], warnings: [], category: "review", previewVersion: "b".repeat(43), fields: [{ field: "canonicalTitle", currentValue: "Original title", proposedValue: "Corrected title", operation: "set", currentAuthority: "unattributed", proposedAuthority: "human", evidenceState: "unverified", notes: null }], evidence: { executionState: "ready", state: "unverified", pages: [0], notes: null }, requiresAcknowledgement: { humanConflict: false, clear: false, evidence: true } },
    { resourceId: "unknown", currentFilename: "unknown.pdf", proposedFilename: null, canonicalTitle: null, responsibility: null, year: null, materialClass: null, disposition: "unknown", confidence: 0, notes: null, identityMatch: true, collisionStatus: "none", renameStatus: "no_rename", metadataChanges: [], warnings: [], category: "unknown", previewVersion: "c".repeat(43), fields: [{ field: "canonicalTitle", currentValue: "Original title", proposedValue: "Corrected title", operation: "set", currentAuthority: "unattributed", proposedAuthority: "human", evidenceState: "unverified", notes: null }], evidence: { executionState: "ready", state: "unverified", pages: [0], notes: null }, requiresAcknowledgement: { humanConflict: false, clear: false, evidence: true } },
  ],
};

beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
  window.sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); }),
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("academiccloud.language");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog(api: Partial<AcademicCloudApi>, initialHoldings: LibraryHolding[] = HOLDINGS) {
  render(<LanguageProvider><BatchCatalogDialog api={api as AcademicCloudApi} library={LIBRARY} initialHoldings={initialHoldings} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
}

function mockZipBridge(filename = "academiccloud-catalog-batch-batch-1.zip") {
  const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": "4",
      "X-AcademicCloud-Filename": filename,
    },
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return fetchMock;
}

describe("BatchCatalogDialog", () => {
  it("retains completed results across partial retries and excludes completed rows from selection", async () => {
    const applyCatalogBatchResults = vi.fn()
      .mockResolvedValueOnce({ results: [{ resourceId: "auto", status: "applied" }, { resourceId: "review", status: "conflict" }] })
      .mockResolvedValueOnce({ results: [{ resourceId: "review", status: "applied" }] });
    renderDialog({ previewCatalogBatchResults: vi.fn().mockResolvedValue(PREVIEW), applyCatalogBatchResults });
    const user = userEvent.setup();
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["{}"], "results.json", { type: "application/json" }));
    await user.click(await screen.findByRole("button", { name: "Select reviewable filtered items" }));
    await user.click(screen.getByRole("checkbox", { name: /I checked the selected suggestions/u }));
    await user.click(screen.getByRole("button", { name: "Apply selected (2)" }));
    await waitFor(() => expect(within(screen.getAllByRole("article")[0]!).getByRole("checkbox")).toBeDisabled());
    expect(screen.getByRole("button", { name: "Apply selected (1)" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I checked the selected suggestions/u }));
    await user.click(screen.getByRole("button", { name: "Apply selected (1)" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Per-item apply results" })).getAllByText("Applied")).toHaveLength(2));
    expect(applyCatalogBatchResults.mock.calls[1]![2]).toEqual([{ resourceId: "review", previewVersion: "b".repeat(43), acknowledgeEvidence: true }]);
    await user.click(screen.getByRole("button", { name: "Select reviewable filtered items" }));
    expect(screen.getByRole("button", { name: "Apply selected (0)" })).toBeDisabled();
  });

  it("restores a tab draft after a new app session through a fresh preview without replaying authority", async () => {
    const reviewSession = { accountId: "owner-session" };
    const refreshedPreview = { ...PREVIEW, planId: "q".repeat(43) };
    const previewCatalogBatchResults = vi.fn()
      .mockResolvedValueOnce(PREVIEW)
      .mockResolvedValueOnce(refreshedPreview);
    const applyCatalogBatchResults = vi.fn().mockResolvedValue({ results: [
      { resourceId: "auto", status: "applied", displayName: "auto.pdf" },
      { resourceId: "review", status: "conflict", displayName: "review.pdf" },
    ] });
    const first = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults, applyCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={reviewSession} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    const user = userEvent.setup();
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([JSON.stringify({ schemaVersion: "academiccloud.catalog-results.v1" })], "results.json", { type: "application/json" }));
    await user.click(screen.getAllByRole("article")[0]!.querySelector("input[type=checkbox]")!);
    await user.click(screen.getAllByRole("article")[1]!.querySelector("input[type=checkbox]")!);
    await user.click(screen.getByRole("checkbox", { name: /I checked the selected suggestions/u }));
    await user.click(screen.getByRole("button", { name: "Apply selected (2)" }));
    await waitFor(() => expect(screen.getAllByText("Applied").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    first.unmount();
    expect(window.sessionStorage.length).toBe(1);

    render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults, applyCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={{ accountId: reviewSession.accountId }} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    expect(screen.getByText(/private review draft/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume review" }));
    await waitFor(() => expect(previewCatalogBatchResults).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Applied").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Apply selected (1)" })).toBeDisabled();
    expect(within(screen.getAllByRole("article")[0]!).getByRole("checkbox")).toBeDisabled();
    expect(within(screen.getAllByRole("article")[1]!).getByRole("checkbox")).toBeChecked();
  });

  it("persists an open review before close and clears the tab draft on sign-out", async () => {
    const reviewSession = { accountId: "owner-refresh" };
    const previewCatalogBatchResults = vi.fn().mockResolvedValue(PREVIEW);
    const first = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={reviewSession} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    const user = userEvent.setup();
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([JSON.stringify({ schemaVersion: "academiccloud.catalog-results.v1" })], "results.json", { type: "application/json" }));
    await user.click(screen.getAllByRole("article")[0]!.querySelector("input[type=checkbox]")!);
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));
    first.unmount();

    const otherAccount = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={{ accountId: "different-account" }} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    expect(screen.queryByText(/private review draft/u)).not.toBeInTheDocument();
    otherAccount.unmount();

    const second = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={{ accountId: reviewSession.accountId }} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: "Resume review" }));
    await waitFor(() => expect(previewCatalogBatchResults).toHaveBeenCalledTimes(2));
    expect(within(screen.getAllByRole("article")[0]!).getByRole("checkbox")).toBeChecked();
    expect(within(screen.getByRole("list", { name: "Batch catalog steps" })).getByText("Review").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("region", { name: "Per-item apply results" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Applied 0 of 0 selected items/u)).not.toBeInTheDocument();
    second.unmount();

    clearCatalogReviewDrafts(reviewSession.accountId);
    expect(window.sessionStorage.length).toBe(0);
    render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={{ accountId: reviewSession.accountId }} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    expect(screen.queryByText(/private review draft/u)).not.toBeInTheDocument();
  });

  it("warns when tab storage fills, preserves in-page review, and removes a stale stored draft", async () => {
    const reviewSession = { accountId: "quota-owner" };
    const previewCatalogBatchResults = vi.fn().mockResolvedValue(PREVIEW);
    const first = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={reviewSession} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    const user = userEvent.setup();
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([JSON.stringify({ schemaVersion: "academiccloud.catalog-results.v1" })], "results.json", { type: "application/json" }));
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));

    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith("academiccloud.catalog-review.v1:")) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    });
    await user.click(screen.getAllByRole("article")[0]!.querySelector("input[type=checkbox]")!);
    expect(await screen.findByText(/Browser storage is unavailable or full/u)).toBeInTheDocument();
    expect(within(screen.getAllByRole("article")[0]!).getByRole("checkbox")).toBeChecked();
    expect(window.sessionStorage.length).toBe(0);

    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    first.unmount();
    const samePage = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={reviewSession} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    expect(screen.getByText(/private review draft/u)).toBeInTheDocument();
    samePage.unmount();
    render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={{ accountId: reviewSession.accountId }} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    expect(screen.queryByText(/private review draft/u)).not.toBeInTheDocument();
  });

  it("drops a private review draft after the 30-minute recovery window", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const reviewSession = { accountId: "expired-session" };
    const previewCatalogBatchResults = vi.fn().mockResolvedValue(PREVIEW);
    const first = render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={reviewSession} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    const user = userEvent.setup();
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([JSON.stringify({ schemaVersion: "academiccloud.catalog-results.v1" })], "results.json", { type: "application/json" }));
    await waitFor(() => expect(previewCatalogBatchResults).toHaveBeenCalledTimes(1));
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    first.unmount();

    now += 30 * 60 * 1000 + 1;
    render(<LanguageProvider><BatchCatalogDialog api={{ previewCatalogBatchResults } as unknown as AcademicCloudApi} library={LIBRARY} initialHoldings={HOLDINGS} reviewSession={{ accountId: reviewSession.accountId }} onClose={vi.fn()} onApplied={vi.fn()} /></LanguageProvider>);
    expect(screen.queryByText(/private review draft/u)).not.toBeInTheDocument();
  });

  it("imports to a side-effect-free preview and applies only explicitly selected eligible rows", async () => {
    const previewCatalogBatchResults = vi.fn().mockResolvedValue(PREVIEW);
    const applyCatalogBatchResults = vi.fn().mockResolvedValue({ results: [
      { resourceId: "auto", status: "applied", displayName: "《书》（作者，2026）.pdf" },
      { resourceId: "review", status: "applied", displayName: "review.pdf" },
    ] });
    renderDialog({ previewCatalogBatchResults, applyCatalogBatchResults });
    const user = userEvent.setup();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([JSON.stringify({ schemaVersion: "academiccloud.catalog-results.v1" })], "results.json", { type: "application/json" }));
    await waitFor(() => expect(previewCatalogBatchResults).toHaveBeenCalledTimes(1));
    const first = within(screen.getAllByRole("article")[0]!).getByRole("checkbox");
    const second = within(screen.getAllByRole("article")[1]!).getByRole("checkbox");
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();
    expect(within(screen.getAllByRole("article")[2]!).getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("Invalid ISBN checksum removed; other supported bibliography is retained")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Review fields and evidence" })[0]!);
    expect(screen.getByRole("table", { name: "Field changes to apply" })).toBeInTheDocument();
    expect(screen.getByText("Original title")).toBeInTheDocument();
    expect(screen.getByText("Corrected title")).toBeInTheDocument();
    await user.click(first);
    await user.click(second);
    expect(screen.getByRole("button", { name: "Apply selected (2)" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I checked the selected suggestions/u }));
    await user.click(screen.getByRole("button", { name: "Apply selected (2)" }));
    await waitFor(() => expect(applyCatalogBatchResults).toHaveBeenCalledWith(
      LIBRARY.id,
      PREVIEW.planId,
      [
        { resourceId: "auto", previewVersion: "a".repeat(43), acknowledgeEvidence: true },
        { resourceId: "review", previewVersion: "b".repeat(43), acknowledgeEvidence: true },
      ],
    ));
    expect(screen.getByRole("region", { name: "Per-item apply results" })).toBeInTheDocument();
  });

  it("keeps the export list and request bounded to the PDFs selected before opening the dialog", async () => {
    const initialHoldings = HOLDINGS.slice(0, 2);
    const listLibraryHoldingsSorted = vi.fn().mockResolvedValue({ holdings: [...HOLDINGS, EXTRA_HOLDING], nextCursor: null });
    const request = {
      schemaVersion: "academiccloud.catalog-export-request.v1",
      manifest: { batchId: "batch-2", resources: initialHoldings.map((entry) => ({ resourceId: entry.file.id, currentFilename: entry.file.displayName })) },
      sourceManifestSha256: "a".repeat(64),
      sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "secret", expiresAt: "2026-09-02T00:00:00.000Z" },
    };
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue(request);
    const fetchMock = mockZipBridge("academiccloud-catalog-batch-batch-2.zip");

    renderDialog({ listLibraryHoldingsSorted, createCatalogBatchExportRequest }, initialHoldings);
    const user = userEvent.setup();

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("unknown.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("extra.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/Export bounded local text\/OCR evidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Run the documented Local Compute catalog exporter/)).not.toBeInTheDocument();
    expect(listLibraryHoldingsSorted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    await waitFor(() => expect(createCatalogBatchExportRequest).toHaveBeenCalledWith(LIBRARY.id, ["auto", "review"]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(LOCAL_CATALOG_BRIDGE_URL);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual(request);
  });

  it("passes the private Core request directly to Local Compute and offers only the evidence ZIP", async () => {
    const request = {
      schemaVersion: "academiccloud.catalog-export-request.v1",
      manifest: { batchId: "batch-1", resources: HOLDINGS.map((entry) => ({ resourceId: entry.file.id, currentFilename: entry.file.displayName })) },
      sourceManifestSha256: "a".repeat(64),
      sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "secret", expiresAt: "2026-09-02T00:00:00.000Z" },
    };
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue(request);
    const fetchMock = mockZipBridge();
    renderDialog({ createCatalogBatchExportRequest });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    await waitFor(() => expect(createCatalogBatchExportRequest).toHaveBeenCalledWith(LIBRARY.id, ["auto", "review", "unknown"]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "X-AcademicCloud-Catalog-Bridge": "1",
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual(request);
    expect(await screen.findByRole("link", { name: "Download evidence package" })).toHaveAttribute("download", "academiccloud-catalog-batch-batch-1.zip");
    expect(await screen.findByRole("status")).toHaveTextContent("Evidence package generated (3)");
  });

  it("shows an actionable local error without exposing the private request when Local Compute is unavailable", async () => {
    const createCatalogBatchExportRequest = vi.fn().mockResolvedValue({
      schemaVersion: "academiccloud.catalog-export-request.v1",
      manifest: { batchId: "batch-1", resources: HOLDINGS.map((entry) => ({ resourceId: entry.file.id })) },
      sourceManifestSha256: "a".repeat(64),
      sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "private-token", expiresAt: "2026-09-02T00:00:00.000Z" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    renderDialog({ createCatalogBatchExportRequest });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate evidence package" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach Local Compute");
    expect(screen.queryByText(/private-token/)).not.toBeInTheDocument();
  });
});
