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

  render(
    <LanguageProvider>
      <BatchCatalogDialog
        api={{ listLibraryHoldings } as unknown as AcademicCloudApi}
        library={LIBRARY}
        initialHoldings={[initial]}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />
    </LanguageProvider>,
  );

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
