import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClient,
  ApiError,
  type AcademicCloudApi,
  type DerivedMetadataJob,
  type LibraryHolding,
  type LibraryHoldingDetails,
  type LibrarySummary,
  type MetadataSuggestionRun,
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
  authorLabels: ["陈垣"],
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

const SUGGESTION_RUN: MetadataSuggestionRun = {
  id: "run-1",
  libraryId: LIBRARY.id,
  fileId: HOLDING.file.id,
  status: "ready",
  rulesetVersion: "rf-metasuggest-v1",
  sourceVersion: "s".repeat(43),
  window: { firstPages: 15, lastPages: 5, pageCount: 20, pageIndices: [1, 2, 20], complete: true },
  candidates: [
    {
      id: "run-1:0", position: 0, fieldPath: "canonicalTitle", typeFieldName: null,
      authorityType: null, authorityRole: null, identifierScheme: null,
      value: "The Mongols and the West, 1221–1410", sourceType: "title_page", sourcePageIndex: 3,
      pageClass: "title_page", confidence: "high", precedenceRank: 1,
      evidenceExcerpt: "The Mongols and the West, 1221–1410", evidenceOrigin: "ocr",
      ocrEngine: "academiccloud-tesseract-cli-v1/tesseract-5.5.3/chi_sim+chi_tra+eng", ocrConfidence: 88,
      rulesetVersion: "rf-frontmatterocr-v1",
    },
    {
      id: "run-1:1", position: 1, fieldPath: "identifier", typeFieldName: null,
      authorityType: null, authorityRole: null, identifierScheme: "isbn",
      value: "9780000000000", sourceType: "copyright_page", sourcePageIndex: 4,
      pageClass: "copyright_page", confidence: "medium", precedenceRank: 1,
      evidenceExcerpt: "ISBN 9780000000000", evidenceOrigin: "native_text", ocrEngine: null,
      ocrConfidence: null, rulesetVersion: "rf-frontmatterocr-v1",
    },
  ],
  createdAt: "2026-08-18T00:00:00.000Z",
};

const SUCCEEDED_JOB: DerivedMetadataJob = {
  id: "job-1",
  kind: "metadata_suggestion",
  resourceId: HOLDING.file.id,
  state: "succeeded",
  progress: 100,
  attempts: 1,
  resultRef: SUGGESTION_RUN.id,
  errorCode: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  startedAt: "2026-08-18T00:00:01.000Z",
  finishedAt: "2026-08-18T00:00:02.000Z",
  deadlineAt: "2026-08-18T00:15:00.000Z",
};

function renderDetails(options: {
  library?: LibrarySummary;
  initial?: LibraryHoldingDetails;
  api?: Partial<AcademicCloudApi>;
  client?: AcademicCloudApi;
} = {}) {
  const initial = options.initial ?? detail();
  const api = options.client ?? {
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
    expect(payload.authorityLinks).toEqual([{ authorityId: "authority-secret-id", role: "author" }]);
    expect(payload.canonicalTitle).not.toContain("陈垣");
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

  it("shows bounded source/page/confidence evidence without writing canonical metadata during generation", async () => {
    const generate = vi.fn().mockResolvedValue(SUCCEEDED_JOB);
    const getSuggestions = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(SUGGESTION_RUN);
    const { api } = renderDetails({ api: {
      generateLibraryMetadataSuggestions: generate,
      getLibraryMetadataSuggestions: getSuggestions,
      getLibraryMetadataSuggestionJob: vi.fn().mockResolvedValue(SUCCEEDED_JOB),
    } });
    const user = userEvent.setup();
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    expect(screen.getByRole("button", { name: "Find metadata suggestions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Find metadata suggestions" }));
    expect((await screen.findAllByText("The Mongols and the West, 1221–1410")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Title page · Page 3/)).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText(/Local OCR · 88%/)).toBeInTheDocument();
    expect(screen.getByText("Resource information suggestions")).toBeInTheDocument();
    expect(api.updateLibraryHoldingMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", "Metadata suggestion job queued"],
    ["running", "Finding resource information in Compute…"],
    ["failed", "Could not find resource information. Try again."],
  ] as const)("renders durable asynchronous %s state without keeping the request open", async (state, label) => {
    const job: DerivedMetadataJob = {
      ...SUCCEEDED_JOB,
      state,
      progress: state === "running" ? 5 : 0,
      resultRef: null,
      errorCode: state === "failed" ? "compute_timeout" : null,
      finishedAt: state === "failed" ? SUCCEEDED_JOB.finishedAt : null,
    };
    renderDetails({ api: {
      getLibraryMetadataSuggestions: vi.fn().mockResolvedValue(null),
      getLatestLibraryMetadataSuggestionJob: vi.fn().mockResolvedValue(job),
      getLibraryMetadataSuggestionJob: vi.fn(() => new Promise<DerivedMetadataJob>(() => undefined)),
    } });
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText("The Mongols and the West, 1221–1410")).not.toBeInTheDocument();
  });

  it("preserves the ApiClient receiver for the exact suggestion get, generate, and accept failure shape", async () => {
    let suggestionReads = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (path.endsWith("/details")) {
        return new Response(JSON.stringify(detail()), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/metadata/suggestions") && method === "GET") {
        const run = suggestionReads++ === 0 ? null : SUGGESTION_RUN;
        return new Response(JSON.stringify({ run }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/metadata/suggestion-jobs/latest") && method === "GET") {
        return new Response(JSON.stringify({ job: null }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/metadata/suggestion-jobs/job-1") && method === "GET") {
        return new Response(JSON.stringify({ job: SUCCEEDED_JOB }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/metadata/suggestions") && method === "POST") {
        return new Response(JSON.stringify({ job: SUCCEEDED_JOB }), { status: 202, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/metadata/suggestions/run-1/accept") && method === "POST") {
        return new Response(JSON.stringify({ detail: detail(), run: { ...SUGGESTION_RUN, status: "accepted" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    });
    renderDetails({ client: new ApiClient({ fetcher }) });
    const user = userEvent.setup();
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    await waitFor(() => expect(fetcher.mock.calls.some(([input, init]) =>
      String(input) === "/api/libraries/canonical-library/holdings/file-1/metadata/suggestions"
      && (init?.method ?? "GET") === "GET",
    )).toBe(true));

    await user.click(screen.getByRole("button", { name: "Find metadata suggestions" }));
    await user.click(await screen.findByRole("checkbox", { name: /Canonical title/ }));
    await user.click(screen.getByRole("button", { name: "Accept selected" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/libraries/canonical-library/holdings/file-1/metadata/suggestions",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/libraries/canonical-library/holdings/file-1/metadata/suggestions/run-1/accept",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.queryByText(/Cannot read properties of undefined/u)).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Could not find resource information. Try again."],
    ["zh-CN", "无法查找资料信息，请重试。"],
  ] as const)("redacts an unexpected suggestion exception in %s", async (language, expected) => {
    window.localStorage.setItem("academiccloud.language", language);
    renderDetails({ api: {
      getLibraryMetadataSuggestions: vi.fn().mockResolvedValue(null),
      generateLibraryMetadataSuggestions: vi.fn().mockRejectedValue(
        new TypeError("Cannot read properties of undefined (reading 'anonymous')"),
      ),
    } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: language === "en" ? "Find metadata suggestions" : "查找资料信息建议" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByText(/Cannot read properties of undefined/u)).not.toBeInTheDocument();
  });

  it("preserves existing actionable suggestion API errors", async () => {
    renderDetails({ api: {
      getLibraryMetadataSuggestions: vi.fn().mockResolvedValue(null),
      generateLibraryMetadataSuggestions: vi.fn().mockRejectedValue(new ApiError(404, "not_found")),
    } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Find metadata suggestions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This resource is no longer available to your account.");
  });

  it("keeps Members read-only and exposes OCR deferred state without an accept control", async () => {
    const run = { ...SUGGESTION_RUN, status: "ocr_deferred" as const, candidates: [] };
    const getSuggestions = vi.fn().mockResolvedValue(run);
    renderDetails({
      library: { ...LIBRARY, role: "member" },
      initial: detail("book", {}, false),
      api: { getLibraryMetadataSuggestions: getSuggestions, generateLibraryMetadataSuggestions: vi.fn() },
    });
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    expect(await screen.findByText("Some content could not be read")).toBeInTheDocument();
    expect(screen.getByText(/Try again if needed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find metadata suggestions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept selected" })).not.toBeInTheDocument();
  });

  it("accepts only an explicit manager selection with the current metadata CAS", async () => {
    const accept = vi.fn().mockResolvedValue({ detail: { ...detail(), metadataVersion: "n".repeat(43) }, run: { ...SUGGESTION_RUN, status: "accepted" as const } });
    const getSuggestions = vi.fn().mockResolvedValue(SUGGESTION_RUN);
    const { api, onSaved } = renderDetails({ api: { getLibraryMetadataSuggestions: getSuggestions, acceptLibraryMetadataSuggestions: accept } });
    const user = userEvent.setup();
    await screen.findByRole("dialog", { name: "元西域人华化考" });
    await user.click(await screen.findByRole("checkbox", { name: /Selected: Canonical title/ }));
    await user.click(screen.getByRole("button", { name: "Accept selected" }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept).toHaveBeenCalledWith(LIBRARY.id, HOLDING.file.id, SUGGESTION_RUN.id, expect.objectContaining({
      acceptedCandidateIds: ["run-1:0"],
      metadataVersion: "m".repeat(43),
    }));
    expect(vi.mocked(accept).mock.calls[0]![3]).not.toHaveProperty("metadata");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(api.updateLibraryHoldingMetadata).not.toHaveBeenCalled();
  });
});
