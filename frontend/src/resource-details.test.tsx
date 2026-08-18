import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  type AcademicCloudApi,
  type LibraryHolding,
  type LibraryHoldingDetails,
  type LibrarySummary,
  type MaterialType,
  type MetadataTypeFields,
} from "./api.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import { ResourceDetailsDialog } from "./resource-details.tsx";

const LIBRARY: LibrarySummary = {
  id: "canonical-library",
  name: "资料库",
  role: "manager",
  isDefault: true,
  createdAt: "2026-08-18T00:00:00.000Z",
};

const HOLDING: LibraryHolding = {
  recordId: "record-internal",
  recordLabel: "legacy label",
  canonicalTitle: "元西域人华化考",
  artifactId: "artifact-internal",
  versionId: "version-internal",
  version: "f".repeat(43),
  file: {
    id: "file-1",
    displayName: "元西域人华化考 -- 陈垣 -- 2008 -- source.pdf",
    mediaType: "application/pdf",
    sizeBytes: 42,
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
};

function detail(
  materialType: MaterialType = "book",
  typeFields: MetadataTypeFields = { editionStatement: "第一版" },
  canEditMetadata = true,
): LibraryHoldingDetails {
  return {
    displayTitle: "元西域人华化考",
    originalFilename: HOLDING.file.displayName,
    metadataVersion: "m".repeat(43),
    canEditMetadata,
    file: { id: HOLDING.file.id, mediaType: HOLDING.file.mediaType, sizeBytes: 42, updatedAt: HOLDING.file.updatedAt },
    metadata: {
      contractVersion: 1,
      materialType,
      canonicalTitle: "元西域人华化考",
      subtitle: null,
      alternativeTitles: [],
      dateStatement: "2008",
      identifiers: [{ scheme: "isbn", value: "978-7-0000-0000-0" }],
      typeFields,
      authorityLinks: [{
        id: "authority-secret-id",
        type: "person",
        canonicalLabel: "<img src=x onerror=alert(1)>陈垣",
        aliases: [],
        version: "a".repeat(43),
        role: "author",
      }],
    },
  };
}

function renderDetails(options: {
  library?: LibrarySummary;
  initial?: LibraryHoldingDetails;
  api?: Partial<AcademicCloudApi>;
} = {}) {
  const initial = options.initial ?? detail();
  const api = {
    getLibraryHoldingDetails: vi.fn().mockResolvedValue(initial),
    updateLibraryHoldingMetadata: vi.fn().mockResolvedValue({ ...initial, metadataVersion: "n".repeat(43) }),
    listLibraryAuthorities: vi.fn().mockResolvedValue([]),
    createLibraryAuthority: vi.fn(),
    ...options.api,
  } as unknown as AcademicCloudApi;
  const onSaved = vi.fn();
  render(
    <LanguageProvider>
      <ResourceDetailsDialog
        api={api}
        library={options.library ?? LIBRARY}
        holding={HOLDING}
        onClose={vi.fn()}
        onSaved={onSaved}
        onPreview={vi.fn()}
        onDownload={vi.fn()}
      />
    </LanguageProvider>,
  );
  return { api, onSaved };
}

beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
});

describe("Resource details", () => {
  it("renders canonical facts as plain text and keeps the original filename separate", async () => {
    renderDetails();
    const dialog = await screen.findByRole("dialog", { name: "元西域人华化考" });
    expect(within(dialog).getByText(HOLDING.file.displayName)).toBeInTheDocument();
    expect(within(dialog).getByText("<img src=x onerror=alert(1)>陈垣")).toBeInTheDocument();
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("authority-secret-id")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Edit resource" })).toBeInTheDocument();
  });

  it("uses effective Library role for a read-only Member even if the surrounding account could be Owner", async () => {
    renderDetails({
      library: { ...LIBRARY, role: "member" },
      initial: detail("book", {}, false),
    });
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    expect(screen.queryByRole("button", { name: "Edit resource" })).not.toBeInTheDocument();
  });

  it("renders an unknown future template safely without enabling a destructive edit", async () => {
    const future = {
      ...detail(),
      metadata: {
        ...detail().metadata!,
        materialType: "future_material",
        typeFields: { futureField: "<script>alert(1)</script>" },
      },
    } as unknown as LibraryHoldingDetails;
    renderDetails({ initial: future });
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    expect(screen.getAllByText("future_material").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("futureField")).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit resource" })).not.toBeInTheDocument();
  });

  it.each([
    ["book", { editionStatement: "First edition" }, "Edition statement"],
    ["article", { locator: "pp. 1–20" }, "Pages or locator"],
    ["manuscript", { shelfmark: "MS 1" }, "Shelfmark"],
    ["inscription", { materialStatement: "Stone" }, "Material"],
    ["archival_document", { referenceCode: "A-1" }, "Reference code"],
  ] as const)("renders the %s template", async (type, fields, label) => {
    renderDetails({ initial: detail(type, fields) });
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("submits only the metadata CAS snapshot and refreshes the catalogue after a successful edit", async () => {
    const { api, onSaved } = renderDetails();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit resource" }));
    const title = screen.getByLabelText("Canonical title");
    await user.clear(title);
    await user.type(title, "元西域人华化考（修订）");
    await user.click(screen.getByRole("button", { name: "Save metadata" }));
    await waitFor(() => expect(api.updateLibraryHoldingMetadata).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.updateLibraryHoldingMetadata).mock.calls[0]![2];
    expect(payload).toMatchObject({ metadataVersion: "m".repeat(43), materialType: "book", canonicalTitle: "元西域人华化考（修订）" });
    expect(payload).not.toHaveProperty("recordId");
    expect(payload).not.toHaveProperty("ownerDomainId");
    expect(payload).not.toHaveProperty("actorAccountId");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("refreshes once and exits edit mode after a stale CAS without replaying the write", async () => {
    const latest = { ...detail(), displayTitle: "其他操作的新题名", metadataVersion: "z".repeat(43), metadata: { ...detail().metadata!, canonicalTitle: "其他操作的新题名" } };
    const get = vi.fn().mockResolvedValueOnce(detail()).mockResolvedValueOnce(latest);
    const update = vi.fn().mockRejectedValue(new ApiError(409, "concurrent_change"));
    const { api } = renderDetails({ api: { getLibraryHoldingDetails: get, updateLibraryHoldingMetadata: update } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit resource" }));
    await user.click(screen.getByRole("button", { name: "Save metadata" }));
    expect(await screen.findByText(/latest metadata is loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "其他操作的新题名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit resource" })).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(api.updateLibraryHoldingMetadata).toBe(update);
  });

  it("does not hide and discard populated fields during a material-type change", async () => {
    renderDetails();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit resource" }));
    await user.selectOptions(screen.getByLabelText("Material type"), "article");
    expect(screen.getByText(/Clear the current material-specific fields/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Material type")).toHaveValue("book");
  });
});
