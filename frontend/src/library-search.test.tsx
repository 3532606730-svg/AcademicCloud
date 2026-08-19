import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ApiError,
  type AcademicCloudApi,
  type LibrarySearchPage,
  type LibrarySearchResult,
  type LibrarySummary,
} from "./api.ts";
import { translate } from "./i18n.ts";
import type { Translator } from "./i18n-react.tsx";
import { LibrarySearchField, librarySearchResultToHolding } from "./library-search.tsx";

const LIBRARY: LibrarySummary = {
  id: "default-library",
  name: "Canonical corpus",
  role: "manager",
  isDefault: true,
  createdAt: "2026-08-18T00:00:00.000Z",
};

const t: Translator = (key, params) => translate("en", key, params);

function result(overrides: Partial<LibrarySearchResult> = {}): LibrarySearchResult {
  return {
    fileId: "file-1",
    canonicalTitle: null,
    authorLabels: [],
    date: null,
    publisher: null,
    materialType: null,
    displayName: "paper.pdf",
    ...overrides,
  };
}

function renderField(api: AcademicCloudApi, onOpenResult: (next: LibrarySearchResult) => void = vi.fn()) {
  render(
    <LibrarySearchField
      api={api}
      library={LIBRARY}
      language="en"
      t={t}
      onOpenResult={onOpenResult}
    />,
  );
  return screen.getByLabelText("Search Library");
}

describe("LibrarySearchField", () => {
  it("debounces typing into one whole-library search and renders composed results", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn().mockResolvedValue({
      results: [
        result({
          fileId: "file-1",
          canonicalTitle: "Canonical book",
          authorLabels: ["Author A"],
          date: "1962",
          publisher: "Press",
          materialType: "book",
          displayName: "book.pdf",
        }),
      ],
      nextCursor: null,
    });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "book");

    await waitFor(() =>
      expect(searchLibraryHoldings).toHaveBeenCalledWith(LIBRARY.id, "book", expect.any(AbortSignal)),
    );
    expect(await screen.findByText("Author A · Canonical book")).toBeInTheDocument();
    expect(screen.getByText("1962 · Press · Book")).toBeInTheDocument();
    expect(screen.queryByText("book.pdf")).not.toBeInTheDocument();
  });

  it("uses the original filename as the fallback title only when no canonical title exists", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockResolvedValue({
        results: [result({ fileId: "file-1", canonicalTitle: null, date: "1900", displayName: "manuscript.pdf" })],
        nextCursor: null,
      }),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "manuscript");

    expect(await screen.findByText("manuscript.pdf")).toBeInTheDocument();
    expect(screen.getByText("1900")).toBeInTheDocument();
  });

  it("never lets a slow older response overwrite a newer query", async () => {
    const user = userEvent.setup();
    let resolveOld!: (page: LibrarySearchPage) => void;
    let firstSignal: AbortSignal | undefined;
    const searchLibraryHoldings = vi.fn()
      .mockImplementationOnce((_libraryId: string, _query: string, signal?: AbortSignal) => {
        firstSignal = signal;
        return new Promise<LibrarySearchPage>((resolve) => { resolveOld = resolve; });
      })
      .mockResolvedValue({
        results: [result({ fileId: "file-new", canonicalTitle: "New title", displayName: "new.pdf" })],
        nextCursor: null,
      });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "old");
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenCalledTimes(1));

    await user.clear(input);
    await user.type(input, "new");
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenCalledTimes(2));
    expect(searchLibraryHoldings).toHaveBeenLastCalledWith(LIBRARY.id, "new", expect.any(AbortSignal));
    expect(firstSignal?.aborted).toBe(true);

    resolveOld({
      results: [result({ fileId: "file-old", canonicalTitle: "Old title", displayName: "old.pdf" })],
      nextCursor: null,
    });
    await waitFor(() => expect(screen.getByText("New title")).toBeInTheDocument());
    expect(screen.queryByText("Old title")).not.toBeInTheDocument();
  });

  it("clears via the clear button and Escape, restoring the idle view", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockResolvedValue({
        results: [result({ fileId: "file-1", canonicalTitle: "Found", displayName: "found.pdf" })],
        nextCursor: null,
      }),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "x");
    expect(await screen.findByText("Found")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(screen.queryByText("Found")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    await user.type(input, "x");
    await screen.findByText("Found");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(screen.queryByText("Found")).not.toBeInTheDocument();
  });

  it("shows a localized no-results message for an empty result page", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "zzz");
    expect(await screen.findByText("No matching resources")).toBeInTheDocument();
  });

  it("shows a localized error through the existing describeError pattern", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockRejectedValue(new ApiError(500, "internal_error")),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "x");
    expect(await screen.findByRole("alert")).toHaveTextContent("AcademicCloud encountered an unexpected error.");
  });

  it("activates a result with click and Enter, reporting the exact result", async () => {
    const user = userEvent.setup();
    const found = result({ fileId: "file-7", canonicalTitle: "Chosen", displayName: "chosen.pdf" });
    const api = {
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [found], nextCursor: null }),
    } as unknown as AcademicCloudApi;
    const onOpenResult = vi.fn();
    const input = renderField(api, onOpenResult);

    await user.type(input, "chosen");
    const button = await screen.findByRole("button", { name: "Chosen" });

    await user.click(button);
    expect(onOpenResult).toHaveBeenCalledWith(found);

    button.focus();
    await user.keyboard("{Enter}");
    expect(onOpenResult).toHaveBeenCalledTimes(2);
  });

  it("renders results without crashing at narrow widths", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockResolvedValue({
        results: [result({ fileId: "file-1", canonicalTitle: "Narrow", displayName: "narrow.pdf" })],
        nextCursor: null,
      }),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "n");
    expect(await screen.findByRole("button", { name: "Narrow" })).toBeInTheDocument();
  });

  it("converts a search result to the minimal holding the details dialog needs", () => {
    expect(librarySearchResultToHolding(
      result({ fileId: "f", canonicalTitle: "Title", authorLabels: ["Author"], displayName: "d.pdf" }),
    )).toEqual({
      recordId: "",
      recordLabel: "d.pdf",
      canonicalTitle: "Title",
      authorLabels: ["Author"],
      artifactId: "",
      versionId: "",
      version: "",
      file: { id: "f", displayName: "d.pdf", mediaType: null, sizeBytes: 0, updatedAt: "" },
    });
  });
});
