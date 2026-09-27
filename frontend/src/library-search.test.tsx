import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ApiError,
  type AcademicCloudApi,
  type LibraryHolding,
  type LibrarySearchPage,
  type LibrarySearchResult,
  type LibrarySummary,
} from "./api.ts";
import { translate } from "./i18n.ts";
import type { Translator } from "./i18n-react.tsx";
import { LibrarySearchField, librarySearchResultToHolding, type LibrarySearchState } from "./library-search.tsx";

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
    contributorLabels: [],
    date: null,
    publisher: null,
    materialClass: null,
    materialType: null,
    language: null,
    editionStatement: null,
    catalogueDisplayTitle: "",
    displayName: "paper.pdf",
    ...overrides,
  };
}

function holding(id = "file-1"): LibraryHolding {
  return {
    recordId: `record-${id}`,
    recordLabel: "Academic resource",
    canonicalTitle: "Current title",
    authorLabels: ["Author"],
    artifactId: `artifact-${id}`,
    versionId: `version-${id}`,
    version: "1",
    file: { id, displayName: "paper.pdf", mediaType: "application/pdf", sizeBytes: 123, updatedAt: "2026-09-15T00:00:00Z" },
  };
}

function renderField(
  api: AcademicCloudApi,
  onOpenResult: (next: LibrarySearchResult) => void = vi.fn(),
  options?: Partial<ComponentProps<typeof LibrarySearchField>>,
) {
  render(
    <LibrarySearchField
      api={api}
      library={LIBRARY}
      language="en"
      t={t}
      onOpenResult={onOpenResult}
      {...options}
    />,
  );
  return screen.getByLabelText("Search Library");
}

describe("LibrarySearchField", () => {
  it("keeps collapsed filters visible and clears them without losing the keyword", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn().mockResolvedValue({ results: [], nextCursor: null });
    const input = renderField({ searchLibraryHoldings } as unknown as AcademicCloudApi);
    await user.type(input, "history");
    await user.click(screen.getByText(t("librarySearch.advanced")));
    await user.type(screen.getByLabelText(t("librarySearch.year")), "1900");
    await user.type(screen.getByLabelText(t("librarySearch.publisher")), "Press");
    const summary = screen.getByText(`${t("librarySearch.advanced")} (2)`);
    await user.click(summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    const yearLabel = `${t("librarySearch.year")}: 1900`;
    await user.click(screen.getByRole("button", { name: t("librarySearch.removeFilter", { filter: yearLabel }) }));
    expect(input).toHaveValue("history");
    expect(screen.getByText(`${t("librarySearch.advanced")} (1)`)).toBeInTheDocument();
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenLastCalledWith(LIBRARY.id, "history", expect.any(AbortSignal), undefined, undefined, { publisher: "Press" }));
    await user.click(screen.getByRole("button", { name: t("librarySearch.clearFilters") }));
    expect(input).toHaveValue("history");
    expect(screen.queryByRole("button", { name: t("librarySearch.clearFilters") })).not.toBeInTheDocument();
    expect(screen.getByText(t("librarySearch.advanced"))).toBeInTheDocument();
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenLastCalledWith(LIBRARY.id, "history", expect.any(AbortSignal)));
  });

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
    expect(await screen.findByText("Author A Canonical book")).toBeInTheDocument();
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

  it("shows a localized error through the existing describeError pattern without a ghost dismiss button", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockRejectedValue(new ApiError(500, "internal_error")),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);

    await user.type(input, "x");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("AcademicCloud encountered an unexpected error.");
    // The error stays until the query changes; there is no dismiss affordance
    // that could clear only the message while leaving a ghost error state.
    expect(within(alert).queryByRole("button")).toBeNull();

    // Retrying with a new query clears the previous error state.
    await user.clear(input);
    await user.type(input, "x");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
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

  it("shows Load more when the first page returns a next cursor", async () => {
    const user = userEvent.setup();
    const api = {
      searchLibraryHoldings: vi.fn().mockResolvedValue({
        results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })],
        nextCursor: "cursor-1",
      }),
    } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    expect(await screen.findByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("Load more requests the next page with the current cursor", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ results: [result({ fileId: "a2", canonicalTitle: "Two", displayName: "2.pdf" })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    await screen.findByRole("button", { name: "Load more" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenCalledWith(LIBRARY.id, "x", expect.any(AbortSignal), "cursor-1"));
  });

  it("Load more appends the second page instead of replacing the first", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ results: [result({ fileId: "a2", canonicalTitle: "Two", displayName: "2.pdf" })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    await screen.findByText("One");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Two")).toBeInTheDocument();
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("hides Load more once the final page returns a null cursor", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ results: [result({ fileId: "a2", canonicalTitle: "Two", displayName: "2.pdf" })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    await screen.findByRole("button", { name: "Load more" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Two");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("a stale Load more response cannot append into a newer query", async () => {
    const user = userEvent.setup();
    let resolveOldMore!: (page: LibrarySearchPage) => void;
    const searchLibraryHoldings = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        results: [result({ fileId: "a1", canonicalTitle: "First query", displayName: "1.pdf" })],
        nextCursor: "cursor-1",
      }))
      .mockImplementationOnce(() => new Promise<LibrarySearchPage>((resolve) => { resolveOldMore = resolve; }))
      .mockImplementationOnce(() => Promise.resolve({
        results: [result({ fileId: "b1", canonicalTitle: "New query result", displayName: "b1.pdf" })],
        nextCursor: null,
      }));
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "old");
    await screen.findByText("First query");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await user.clear(input);
    await user.type(input, "new");
    await screen.findByText("New query result");
    resolveOldMore({ results: [result({ fileId: "stale", canonicalTitle: "Stale page", displayName: "stale.pdf" })], nextCursor: null });
    await waitFor(() => expect(screen.queryByText("Stale page")).not.toBeInTheDocument());
    expect(screen.queryByText("First query")).not.toBeInTheDocument();
  });

  it("clearing the query after multiple pages resets results and pagination", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ results: [result({ fileId: "a2", canonicalTitle: "Two", displayName: "2.pdf" })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    await screen.findByText("One");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Two");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(screen.queryByText("One")).not.toBeInTheDocument();
    expect(screen.queryByText("Two")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("a Load more failure preserves already loaded results and stays retryable", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })], nextCursor: "cursor-1" })
      .mockRejectedValueOnce(new ApiError(500, "internal_error"));
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    await screen.findByText("One");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AcademicCloud encountered an unexpected error.");
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("Load more is keyboard-activatable", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "a1", canonicalTitle: "One", displayName: "1.pdf" })], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ results: [result({ fileId: "a2", canonicalTitle: "Two", displayName: "2.pdf" })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "x");
    const loadMore = await screen.findByRole("button", { name: "Load more" });
    loadMore.focus();
    await user.keyboard("{Enter}");
    await screen.findByText("Two");
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("returns the server holding unchanged and never fabricates identities for legacy summaries", () => {
    const exactHolding = holding();
    expect(librarySearchResultToHolding(result({ holding: exactHolding }))).toBe(exactHolding);
    expect(librarySearchResultToHolding(result({ canonicalTitle: "Summary only" }))).toBeNull();
  });

  it("renders successful current results through the supplied renderer with server pagination", async () => {
    const user = userEvent.setup();
    const first = result({ fileId: "first", holding: holding("first") });
    const second = result({ fileId: "second", holding: holding("second") });
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [first], nextCursor: "next" })
      .mockResolvedValueOnce({ results: [second], nextCursor: null });
    const renderResults = vi.fn((results: LibrarySearchResult[]) => <div data-testid="shared-table">{results.map((item) => item.fileId).join(",")}</div>);
    const input = renderField({ searchLibraryHoldings } as unknown as AcademicCloudApi, vi.fn(), { renderResults });

    expect(renderResults).not.toHaveBeenCalled();
    await user.type(input, "query");
    expect(await screen.findByTestId("shared-table")).toHaveTextContent("first");
    expect(screen.getByRole("region", { name: t("librarySearch.resultsAria") })).toContainElement(screen.getByTestId("shared-table"));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByTestId("shared-table")).toHaveTextContent("first,second"));
    expect(renderResults).toHaveBeenLastCalledWith([first, second]);
  });

  it("reports only real holdings and preserves the identity and first page during pagination", async () => {
    const user = userEvent.setup();
    const first = holding("first");
    const second = holding("second");
    let resolveMore!: (page: LibrarySearchPage) => void;
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "first", holding: first }), result({ fileId: "legacy" })], nextCursor: "next" })
      .mockImplementationOnce(() => new Promise<LibrarySearchPage>((resolve) => { resolveMore = resolve; }));
    const onStateChange = vi.fn<(state: LibrarySearchState) => void>();
    const input = renderField({ searchLibraryHoldings } as unknown as AcademicCloudApi, vi.fn(), { onStateChange });

    await user.type(input, "query");
    await screen.findByRole("button", { name: "Load more" });
    const state = onStateChange.mock.lastCall![0];
    expect(state).toEqual({ identity: expect.any(String), active: true, holdings: [first] });
    const count = onStateChange.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(onStateChange).toHaveBeenCalledTimes(count);
    await act(async () => resolveMore({ results: [result({ fileId: "first", holding: first }), result({ fileId: "second", holding: second })], nextCursor: null }));
    expect(onStateChange).toHaveBeenLastCalledWith({ identity: state.identity, active: true, holdings: [first, second] });
  });

  it("never reports old holdings under a changed query and reports no holdings after a failed query or clear", async () => {
    const user = userEvent.setup();
    const old = holding("old");
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ fileId: "old", canonicalTitle: "Old result", holding: old })], nextCursor: null })
      .mockRejectedValueOnce(new ApiError(500, "internal_error"));
    const onStateChange = vi.fn<(state: LibrarySearchState) => void>();
    const input = renderField({ searchLibraryHoldings } as unknown as AcademicCloudApi, vi.fn(), { onStateChange });

    await user.type(input, "old");
    await screen.findByText("Old result");
    const oldIdentity = onStateChange.mock.lastCall![0].identity;
    onStateChange.mockClear();
    fireEvent.change(input, { target: { value: "new" } });
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(onStateChange.mock.lastCall![0]).toEqual({ identity: expect.any(String), active: true, holdings: [] });
    expect(onStateChange.mock.lastCall![0].identity).not.toBe(oldIdentity);
    await screen.findByRole("alert");
    expect(onStateChange.mock.calls.every(([state]) => state.holdings.length === 0)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onStateChange.mock.lastCall![0]).toEqual({ identity: expect.any(String), active: false, holdings: [] });
  });

  it("changes selection identity for filters, sort and library without reusing old holdings", async () => {
    const user = userEvent.setup();
    const first = holding();
    const searchLibraryHoldings = vi.fn().mockResolvedValue({ results: [result({ holding: first })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const onStateChange = vi.fn<(state: LibrarySearchState) => void>();
    const props = { api, library: LIBRARY, language: "en" as const, t, onOpenResult: vi.fn(), onStateChange };
    const { rerender } = render(<LibrarySearchField {...props} />);
    await user.type(screen.getByLabelText("Search Library"), "query");
    await screen.findByText("paper.pdf");
    const queryIdentity = onStateChange.mock.lastCall![0].identity;
    await user.selectOptions(screen.getByLabelText("Material class"), "edited_volume");
    const filterState = onStateChange.mock.lastCall![0];
    expect(filterState.identity).not.toBe(queryIdentity);
    expect(filterState.holdings).toEqual([]);
    await screen.findByText("paper.pdf");
    await user.selectOptions(screen.getByLabelText("Sort"), "oldest");
    const sortState = onStateChange.mock.lastCall![0];
    expect(sortState.identity).not.toBe(filterState.identity);
    expect(sortState.holdings).toEqual([]);
    await screen.findByText("paper.pdf");
    rerender(<LibrarySearchField {...props} library={{ ...LIBRARY, id: "other-library" }} />);
    const libraryState = onStateChange.mock.lastCall![0];
    expect(libraryState.identity).not.toBe(sortState.identity);
    expect(libraryState.holdings).toEqual([]);
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenLastCalledWith("other-library", "query", expect.any(AbortSignal), undefined, undefined, { materialClass: "edited_volume" }, "oldest"));
  });

  it("refetches on revision with the same selection identity and cancels an old page", async () => {
    const user = userEvent.setup();
    const first = holding("first");
    const updated = { ...first, canonicalTitle: "Updated title" };
    let resolveMore!: (page: LibrarySearchPage) => void;
    let moreSignal!: AbortSignal;
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ holding: first, canonicalTitle: "Initial" })], nextCursor: "next" })
      .mockImplementationOnce((_id, _query, signal: AbortSignal) => {
        moreSignal = signal;
        return new Promise<LibrarySearchPage>((resolve) => { resolveMore = resolve; });
      })
      .mockResolvedValueOnce({ results: [result({ holding: updated, canonicalTitle: "Updated" })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const onStateChange = vi.fn<(state: LibrarySearchState) => void>();
    const props = { api, library: LIBRARY, language: "en" as const, t, onOpenResult: vi.fn(), onStateChange };
    const { rerender } = render(<LibrarySearchField {...props} revision={0} />);
    await user.type(screen.getByLabelText("Search Library"), "query");
    await screen.findByText("Initial");
    const identity = onStateChange.mock.lastCall![0].identity;
    await user.click(screen.getByRole("button", { name: "Load more" }));
    rerender(<LibrarySearchField {...props} revision={1} />);
    expect(moreSignal.aborted).toBe(true);
    expect(onStateChange).toHaveBeenLastCalledWith({ identity, active: true, holdings: [] });
    expect(screen.queryByText("Initial")).not.toBeInTheDocument();
    await screen.findByText("Updated");
    await act(async () => resolveMore({ results: [result({ fileId: "stale", canonicalTitle: "Stale page", holding: holding("stale") })], nextCursor: null }));
    expect(screen.queryByText("Stale page")).not.toBeInTheDocument();
    expect(onStateChange).toHaveBeenLastCalledWith({ identity, active: true, holdings: [updated] });
  });

  it("does not refetch or report again solely because callbacks and the library object are recreated", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn().mockResolvedValue({ results: [result({ holding: holding() })], nextCursor: null });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const onStateChange = vi.fn<(state: LibrarySearchState) => void>();
    const props = { api, library: LIBRARY, language: "en" as const, t, onOpenResult: vi.fn() };
    const { rerender, unmount } = render(<LibrarySearchField {...props} onStateChange={(state) => onStateChange(state)} />);
    await user.type(screen.getByLabelText("Search Library"), "query");
    await screen.findByText("paper.pdf");
    const count = onStateChange.mock.calls.length;
    rerender(<LibrarySearchField {...props} library={{ ...LIBRARY }} onStateChange={(state) => onStateChange(state)} />);
    expect(onStateChange).toHaveBeenCalledTimes(count);
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(searchLibraryHoldings).toHaveBeenCalledTimes(1);
    unmount();
    expect(onStateChange.mock.lastCall![0]).toMatchObject({ active: false, holdings: [] });
  });

  it("keeps the search when Escape dismisses an IME composition", async () => {
    const user = userEvent.setup();
    const api = { searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [], nextCursor: null }) } as unknown as AcademicCloudApi;
    const input = renderField(api);
    await user.type(input, "研究");
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(input).toHaveValue("研究");
    fireEvent.keyDown(input, { key: "Escape", isComposing: false });
    expect(input).toHaveValue("");
  });

  it("runs material-only and advanced filters on the server and clears them atomically", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn().mockResolvedValue({
      results: [result({ fileId: "filtered", canonicalTitle: "元史", catalogueDisplayTitle: "元史 中华书局1976点校本", materialClass: "primary_source_modern_edition", displayName: "yuan.pdf" })],
      nextCursor: null,
    });
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    renderField(api);

    await user.selectOptions(screen.getByLabelText("Material class"), "primary_source_modern_edition");
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenCalledWith(
      LIBRARY.id,
      "",
      expect.any(AbortSignal),
      undefined,
      undefined,
      { materialClass: "primary_source_modern_edition" },
    ));
    expect(await screen.findByText("元史 中华书局1976点校本")).toBeInTheDocument();

    await user.click(screen.getByText("Filters"));
    await user.type(screen.getByLabelText("Publisher"), "中华书局");
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenLastCalledWith(
      LIBRARY.id,
      "",
      expect.any(AbortSignal),
      undefined,
      undefined,
      { materialClass: "primary_source_modern_edition", publisher: "中华书局" },
    ));

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText("Material class")).toHaveValue("");
    expect(screen.getByLabelText("Publisher")).toHaveValue("");
    expect(screen.queryByText("元史 中华书局1976点校本")).not.toBeInTheDocument();
  });

  it("keeps browse sorting separate and defaults keyword search to relevance", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn().mockResolvedValue({ results: [], nextCursor: null });
    const onSortChange = vi.fn();
    const api = { searchLibraryHoldings } as unknown as AcademicCloudApi;
    const input = renderField(api, vi.fn(), { sort: "newest", onSortChange });

    const sort = screen.getByLabelText("Sort");
    expect(within(sort).getAllByRole("option")).toHaveLength(6);
    await user.selectOptions(sort, "title_asc");
    expect(onSortChange).toHaveBeenCalledWith("title_asc");

    await user.type(input, "book");
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenCalledWith(
      LIBRARY.id,
      "book",
      expect.any(AbortSignal),
    ));
    expect(sort).toHaveValue("relevance");
    expect(within(sort).getAllByRole("option")).toHaveLength(7);
    await user.selectOptions(sort, "oldest");
    await waitFor(() => expect(searchLibraryHoldings).toHaveBeenLastCalledWith(
      LIBRARY.id, "book", expect.any(AbortSignal), undefined, undefined, undefined, "oldest",
    ));
    expect(onSortChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(sort).toHaveValue("newest");
  });

  it("uses the explicit search sort for subsequent pages without changing browse order", async () => {
    const user = userEvent.setup();
    const searchLibraryHoldings = vi.fn()
      .mockResolvedValueOnce({ results: [result({ canonicalTitle: "Relevant" })], nextCursor: "rank-next" })
      .mockResolvedValueOnce({ results: [result({ canonicalTitle: "Alphabetical" })], nextCursor: "title-next" })
      .mockResolvedValueOnce({ results: [result({ fileId: "second", canonicalTitle: "Second" })], nextCursor: null });
    const onSortChange = vi.fn();
    const input = renderField({ searchLibraryHoldings } as unknown as AcademicCloudApi, vi.fn(), { sort: "size_desc", onSortChange });
    await user.type(input, "book");
    await screen.findByText("Relevant");
    await user.selectOptions(screen.getByLabelText("Sort"), "title_asc");
    await screen.findByText("Alphabetical");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Second");
    expect(searchLibraryHoldings).toHaveBeenLastCalledWith(
      LIBRARY.id, "book", expect.any(AbortSignal), "title-next", undefined, undefined, "title_asc",
    );
    expect(onSortChange).not.toHaveBeenCalled();
  });
});
