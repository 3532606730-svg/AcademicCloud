import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcademicCloudApi, CitationResult, LibraryHolding, LibrarySummary } from "./api.ts";
import { CitationDialog } from "./citation.tsx";
import { LanguageProvider } from "./i18n-react.tsx";

const LIBRARY: LibrarySummary = { id: "library-1", name: "Library", role: "manager", isDefault: true, createdAt: "2026-08-22T00:00:00.000Z" };
const HOLDING: LibraryHolding = {
  recordId: "record-1", recordLabel: "source.pdf", canonicalTitle: "六经奥论", authorLabels: ["郑樵"],
  catalogueDisplayTitle: "六经奥论 影印明万历重刻本", artifactId: "artifact-1", versionId: "version-1", version: "v".repeat(43),
  file: { id: "file-1", displayName: "source.pdf", mediaType: "application/pdf", sizeBytes: 42, updatedAt: "2026-08-22T00:00:00.000Z" },
};
const RESULT: CitationResult = {
  style: {
    id: "lishi-yanjiu", label: "《历史研究》", processor: "citeproc-js", processorVersion: "2.4.63",
    revision: "academiccloud-2026-08-22.1", source: "https://example.invalid/style", sourceRevision: "reviewed",
    sha256: "a".repeat(64), verifiedAt: "2026-08-22", compliance: "production_subset", supportsShortNote: true,
  },
  completeness: "structured",
  materialClass: "traditional_book",
  locators: [{ type: "juan", value: "五" }, { type: "folio", value: "8", side: "verso" }],
  cslItem: { id: "file-1", type: "classic", title: "六经奥论", "title-short": "六经奥论" },
  outputs: {
    citation: "郑樵：《六经奥论》，卷五，第8b叶。",
    fullNote: "郑樵：《六经奥论》，卷五，第8b叶。",
    shortNote: "郑樵：《六经奥论》，卷五，第8b叶。",
    bibliography: "郑樵：《六经奥论》。",
  },
};

beforeEach(() => window.localStorage.setItem("academiccloud.language", "en"));
afterEach(() => {
  window.localStorage.removeItem("academiccloud.language");
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderCitation(api: Partial<AcademicCloudApi>) {
  return render(<LanguageProvider><CitationDialog api={api as AcademicCloudApi} library={LIBRARY} holding={HOLDING} onClose={vi.fn()} /></LanguageProvider>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("CitationDialog", () => {
  it("offers all four pinned styles and sends structured historical locators", async () => {
    const generateLibraryCitation = vi.fn().mockResolvedValue(RESULT);
    renderCitation({ generateLibraryCitation });
    const user = userEvent.setup();
    const style = await screen.findByLabelText("Citation style");
    expect(within(style).getByRole("option", { name: "《历史研究》" })).toBeInTheDocument();
    expect(within(style).getByRole("option", { name: "《文史哲》" })).toBeInTheDocument();
    expect(within(style).getByRole("option", { name: "Chicago Notes & Bibliography" })).toBeInTheDocument();
    expect(within(style).getByRole("option", { name: "GB/T 7714—2025" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Locator type"), "juan");
    await user.type(screen.getByLabelText("Locator value"), "五");
    await user.click(screen.getByRole("button", { name: "Add locator" }));
    const types = screen.getAllByLabelText("Locator type");
    const values = screen.getAllByLabelText("Locator value");
    await user.selectOptions(types[1]!, "folio");
    await user.type(values[1]!, "8");
    await user.selectOptions(screen.getByLabelText("Folio side"), "verso");
    await user.click(screen.getByRole("button", { name: "Generate citation" }));

    await waitFor(() => expect(generateLibraryCitation).toHaveBeenCalledWith(LIBRARY.id, HOLDING.file.id, {
      style: "lishi-yanjiu",
      locators: [{ type: "juan", value: "五" }, { type: "folio", value: "8", side: "verso" }],
    }));
    expect(await screen.findAllByText(RESULT.outputs.fullNote!)).toHaveLength(2);
    expect(screen.getByText("First full note")).toBeInTheDocument();
    expect(screen.getByText("Subsequent short note")).toBeInTheDocument();
    expect(screen.getByText("Bibliography entry")).toBeInTheDocument();
  });

  it("copies the exact clean text returned by Core", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderCitation({ generateLibraryCitation: vi.fn().mockResolvedValue(RESULT) });
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await user.click(await screen.findByRole("button", { name: "Generate citation" }));
    const section = (await screen.findByText("First full note")).closest("section")!;
    await user.click(within(section).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(RESULT.outputs.fullNote);
    expect(within(section).getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("fails locally when a custom locator has no explicit label", async () => {
    const generateLibraryCitation = vi.fn();
    renderCitation({ generateLibraryCitation });
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Locator type"), "custom");
    await user.type(screen.getByLabelText("Locator value"), "函三");
    await user.click(screen.getByRole("button", { name: "Generate citation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be generated");
    expect(generateLibraryCitation).not.toHaveBeenCalled();
  });

  it("discards a pending citation after its locator changes and keeps the newer result through out-of-order completion", async () => {
    const first = deferred<CitationResult>();
    const second = deferred<CitationResult>();
    const generateLibraryCitation = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderCitation({ generateLibraryCitation });
    const user = userEvent.setup();
    const value = await screen.findByLabelText("Locator value");
    await user.type(value, "15");
    await user.click(screen.getByRole("button", { name: "Generate citation" }));
    await user.clear(value);
    await user.type(value, "88");
    expect(screen.queryByText(RESULT.outputs.fullNote!)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate citation" }));
    expect(generateLibraryCitation).toHaveBeenNthCalledWith(2, LIBRARY.id, HOLDING.file.id, {
      style: "lishi-yanjiu", locators: [{ type: "page", value: "88" }],
    });
    const newer = { ...RESULT, outputs: { ...RESULT.outputs, fullNote: "page 88", shortNote: null, citation: "page 88" } } as CitationResult;
    await act(async () => second.resolve(newer));
    expect(screen.getByText("page 88")).toBeInTheDocument();
    await act(async () => first.resolve(RESULT));
    expect(screen.getByText("page 88")).toBeInTheDocument();
    expect(screen.queryByText(RESULT.outputs.fullNote!)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores an old failure after style changes and clears pending copy feedback when inputs change", async () => {
    const pending = deferred<CitationResult>();
    const copy = deferred<void>();
    const writeText = vi.fn().mockReturnValue(copy.promise);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const generateLibraryCitation = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(RESULT);
    renderCitation({ generateLibraryCitation });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Generate citation" }));
    await user.selectOptions(screen.getByLabelText("Citation style"), "wenshizhe");
    await act(async () => pending.reject(new Error("old failure")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate citation" }));
    const section = (await screen.findByText("First full note")).closest("section")!;
    await user.click(within(section).getByRole("button", { name: "Copy" }));
    await user.click(screen.getByRole("button", { name: "Add locator" }));
    await act(async () => copy.resolve());
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not display a result from a previous holding after context changes", async () => {
    const pending = deferred<CitationResult>();
    const api = { generateLibraryCitation: vi.fn().mockReturnValue(pending.promise) } as unknown as AcademicCloudApi;
    const onClose = vi.fn();
    const view = render(<LanguageProvider><CitationDialog api={api as AcademicCloudApi} library={LIBRARY} holding={HOLDING} onClose={onClose} /></LanguageProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Generate citation" }));
    view.rerender(<LanguageProvider><CitationDialog api={api as AcademicCloudApi} library={LIBRARY} holding={{ ...HOLDING, file: { ...HOLDING.file, id: "file-2" } }} onClose={onClose} /></LanguageProvider>);
    await act(async () => pending.resolve(RESULT));
    expect(screen.queryByText(RESULT.outputs.fullNote!)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate citation" })).toBeEnabled();
  });
});
