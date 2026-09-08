import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AcademicCloudApi, LibraryHolding, LibraryHoldingsPage } from "./api.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import { SharedLibraryPanel } from "./shared-library.tsx";

const library = { id: "library", name: "Library", role: "manager" as const, isDefault: true, createdAt: "2026-09-05T00:00:00Z" };
function page(title: string, nextCursor: string | null = null): LibraryHoldingsPage {
  return { holdings: [{ recordId: title, recordLabel: title, canonicalTitle: title, authorLabels: [], artifactId: title, versionId: title, version: "v".repeat(43),
    file: { id: title, displayName: title, mediaType: "application/pdf", sizeBytes: 1, updatedAt: library.createdAt } } satisfies LibraryHolding], nextCursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(late: ReturnType<typeof deferred<LibraryHoldingsPage>>) {
  const list = vi.fn()
    .mockResolvedValueOnce(page("newest-first", "newest-next"))
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce(page("oldest-first", "oldest-next"))
    .mockResolvedValueOnce(page("oldest-second"));
  const api = { listLibraries: vi.fn().mockResolvedValue([library]), listLibraryHoldingsSorted: list } as unknown as AcademicCloudApi;
  render(<LanguageProvider><SharedLibraryPanel api={api} renderCatalogue={({ holdings, onSortChange, onLoadMore, loadingMore }) => <>
    <button onClick={() => onSortChange("oldest")}>Sort oldest</button>
    <button onClick={onLoadMore} disabled={loadingMore}>Load next</button>
    <ul>{holdings.map((holding) => <li key={holding.file.id}>{holding.canonicalTitle}</li>)}</ul>
  </>} /></LanguageProvider>);
  return list;
}

describe("catalogue pagination request ownership", () => {
  it("ignores a previous sort's late page and retains the new sort's cursor", async () => {
    const late = deferred<LibraryHoldingsPage>();
    const list = setup(late);
    await screen.findByText("newest-first");
    fireEvent.click(screen.getByText("Load next"));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText("Sort oldest"));
    await screen.findByText("oldest-first");
    await act(async () => late.resolve(page("stale-newest-second", "stale-cursor")));
    expect(screen.queryByText("stale-newest-second")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Load next"));
    await screen.findByText("oldest-second");
    expect(list.mock.calls.at(-1)?.slice(0, 3)).toEqual([library.id, "oldest", "oldest-next"]);
  });

  it("does not surface a previous sort's failed page in the new catalogue", async () => {
    const late = deferred<LibraryHoldingsPage>();
    const list = setup(late);
    await screen.findByText("newest-first");
    fireEvent.click(screen.getByText("Load next"));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText("Sort oldest"));
    await screen.findByText("oldest-first");
    await act(async () => late.reject(new Error("old page failed")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Load next")).toBeEnabled();
  });
});
