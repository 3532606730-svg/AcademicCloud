import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { AcademicCloudApi, LibraryHolding, LibrarySummary } from "./api.ts";
import { BatchCatalogDialog } from "./batch-catalog.tsx";
import { LanguageProvider } from "./i18n-react.tsx";

const LIBRARY: LibrarySummary = {
  id: "library-1",
  name: "资料库",
  role: "manager",
  isDefault: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function holding(id: string, options: { mediaType?: string; materialClass?: LibraryHolding["materialClass"] } = {}): LibraryHolding {
  return {
    recordId: `record-${id}`,
    recordLabel: `${id}.pdf`,
    canonicalTitle: options.materialClass ? `Catalogued ${id}` : null,
    authorLabels: [],
    ...(options.materialClass === undefined ? {} : { materialClass: options.materialClass }),
    artifactId: `artifact-${id}`,
    versionId: `version-${id}`,
    version: "v".repeat(43),
    file: {
      id,
      displayName: `${id}.${options.mediaType === "text/plain" ? "txt" : "pdf"}`,
      mediaType: options.mediaType ?? "application/pdf",
      sizeBytes: 10,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  };
}

function renderDialog(api: AcademicCloudApi, initialHoldings: LibraryHolding[] = [holding("initial")]) {
  return render(
    <LanguageProvider>
      <BatchCatalogDialog
        api={api}
        library={LIBRARY}
        initialHoldings={initialHoldings}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />
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
  vi.restoreAllMocks();
});

it("loads the library only after explicit action and selects only PDFs without structured bibliography", async () => {
  const initial = holding("initial");
  const uncataloguedA = holding("uncatalogued-a");
  const uncataloguedB = holding("uncatalogued-b");
  const catalogued = holding("catalogued", { materialClass: "scholarly_monograph" });
  const nonPdf = holding("notes", { mediaType: "text/plain" });
  const listLibraryHoldings = vi.fn().mockResolvedValue([uncataloguedA, catalogued, nonPdf, uncataloguedB]);

  renderDialog({ listLibraryHoldings } as unknown as AcademicCloudApi, [initial]);

  expect(listLibraryHoldings).not.toHaveBeenCalled();
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  expect(screen.getByText("initial.pdf")).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Select uncatalogued PDFs" }));

  await waitFor(() => expect(listLibraryHoldings).toHaveBeenCalledWith(LIBRARY.id));
  expect(screen.getByText("2 selected")).toBeInTheDocument();
  expect(screen.getByText("uncatalogued-a.pdf")).toBeInTheDocument();
  expect(screen.getByText("uncatalogued-b.pdf")).toBeInTheDocument();
  expect(screen.queryByText("catalogued.pdf")).not.toBeInTheDocument();
  expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  expect(screen.queryByText("initial.pdf")).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeChecked();
});

it("uses keyset pagination so eligible PDFs after the first 100 holdings are selected", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => holding(`catalogued-${index}`, { materialClass: "scholarly_monograph" }));
  const secondPage = [
    holding("notes", { mediaType: "text/plain" }),
    holding("uncatalogued-a"),
    holding("uncatalogued-b"),
  ];
  const listLibraryHoldings = vi.fn();
  const listLibraryHoldingsSorted = vi.fn().mockImplementation(async (
    libraryId: string,
    sort: string,
    cursor: string | null,
  ) => {
    expect(libraryId).toBe(LIBRARY.id);
    expect(sort).toBe("newest");
    if (cursor === null) return { holdings: firstPage, nextCursor: "cursor-2" };
    expect(cursor).toBe("cursor-2");
    return { holdings: secondPage, nextCursor: null };
  });

  renderDialog({ listLibraryHoldings, listLibraryHoldingsSorted } as unknown as AcademicCloudApi);
  expect(listLibraryHoldingsSorted).not.toHaveBeenCalled();
  expect(screen.getByText("initial.pdf")).toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: "Select uncatalogued PDFs" }));

  await waitFor(() => expect(listLibraryHoldingsSorted).toHaveBeenCalledTimes(2));
  expect(listLibraryHoldings).not.toHaveBeenCalled();
  expect(screen.getByText("2 selected")).toBeInTheDocument();
  expect(screen.getByText("uncatalogued-a.pdf")).toBeInTheDocument();
  expect(screen.getByText("uncatalogued-b.pdf")).toBeInTheDocument();
  expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
});

it("continues past five scanned pages when fewer than 500 eligible PDFs exist", async () => {
  const pages = Array.from({ length: 6 }, (_, pageIndex) =>
    Array.from({ length: 100 }, (_, itemIndex) => holding(`catalogued-${pageIndex}-${itemIndex}`, { materialClass: "scholarly_monograph" })),
  );
  pages[5] = [holding("late-uncatalogued"), ...pages[5]!.slice(1)];
  const listLibraryHoldingsSorted = vi.fn().mockImplementation(async (
    _libraryId: string,
    _sort: string,
    cursor: string | null,
  ) => {
    const pageIndex = cursor === null ? 0 : Number(cursor.replace("cursor-", ""));
    return {
      holdings: pages[pageIndex]!,
      nextCursor: pageIndex === pages.length - 1 ? null : `cursor-${pageIndex + 1}`,
    };
  });

  renderDialog({ listLibraryHoldings: vi.fn(), listLibraryHoldingsSorted } as unknown as AcademicCloudApi);
  await userEvent.setup().click(screen.getByRole("button", { name: "Select uncatalogued PDFs" }));

  await waitFor(() => expect(listLibraryHoldingsSorted).toHaveBeenCalledTimes(6));
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  expect(screen.getByText("late-uncatalogued.pdf")).toBeInTheDocument();
});

it("selects exactly 500 eligible PDFs and reports when a 501st eligible PDF remains", async () => {
  const pages = Array.from({ length: 6 }, (_, pageIndex) =>
    Array.from({ length: 100 }, (_, itemIndex) => holding(`eligible-${pageIndex * 100 + itemIndex}`)),
  );
  const listLibraryHoldingsSorted = vi.fn().mockImplementation(async (
    _libraryId: string,
    _sort: string,
    cursor: string | null,
  ) => {
    const pageIndex = cursor === null ? 0 : Number(cursor.replace("cursor-", ""));
    return {
      holdings: pages[pageIndex]!,
      nextCursor: pageIndex === pages.length - 1 ? null : `cursor-${pageIndex + 1}`,
    };
  });

  renderDialog({ listLibraryHoldings: vi.fn(), listLibraryHoldingsSorted } as unknown as AcademicCloudApi);
  await userEvent.setup().click(screen.getByRole("button", { name: "Select uncatalogued PDFs" }));

  await waitFor(() => expect(screen.getByText("500 selected")).toBeInTheDocument());
  expect(listLibraryHoldingsSorted).toHaveBeenCalledTimes(6);
  expect(screen.getByText("eligible-499.pdf")).toBeInTheDocument();
  expect(screen.queryByText("eligible-500.pdf")).not.toBeInTheDocument();
  expect(screen.getByText("Selected the first 500 uncatalogued PDFs; more remain and require another batch.")).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(500);
});

it("keeps the compatibility fallback bounded to 500 eligible PDFs", async () => {
  const listLibraryHoldings = vi.fn().mockResolvedValue(
    Array.from({ length: 501 }, (_, index) => holding(`fallback-${index}`)),
  );

  renderDialog({ listLibraryHoldings } as unknown as AcademicCloudApi);
  await userEvent.setup().click(screen.getByRole("button", { name: "Select uncatalogued PDFs" }));

  await waitFor(() => expect(screen.getByText("500 selected")).toBeInTheDocument());
  expect(screen.getByText("fallback-499.pdf")).toBeInTheDocument();
  expect(screen.queryByText("fallback-500.pdf")).not.toBeInTheDocument();
  expect(screen.getByText("Selected the first 500 uncatalogued PDFs; more remain and require another batch.")).toBeInTheDocument();
});
