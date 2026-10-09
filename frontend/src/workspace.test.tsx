import { MockPdfReader, pdfReaderControl } from "./pdf-reader-test-double.tsx";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import { WorkspaceDialog } from "./workspace.tsx";
import type { PageNote, ResearchCollection, TextHighlight, WorkspaceApi, WorkspacePage, WorkspaceResource } from "./workspace-api.ts";
import { ocrApi } from "./local-ocr-test-fixture.ts";

const RESOURCE: WorkspaceResource = { resourceId: "file-one", sourceId: "source-one", title: "Shared academic source", libraryId: "canonical-library", mediaType: "application/pdf" };
const NOTE: PageNote = { id: "note-one", resourceId: RESOURCE.resourceId, sourceId: RESOURCE.sourceId, physicalPage: 7, locator: "葉三", body: "Private interpretation", revision: 1, createdAt: "2026-09-15T10:00:00Z", updatedAt: "2026-09-15T10:00:00Z", deletedAt: null };
const COLLECTION: ResearchCollection = { id: "set-one", name: "My research set", revision: 1, archivedAt: null, itemCount: 0, createdAt: "2026-09-15T10:00:00Z", updatedAt: "2026-09-15T10:00:00Z" };
const page = <T,>(items: T[], resources: WorkspaceResource[] = [RESOURCE], nextBeforeId: string | null = null): WorkspacePage<T> => ({ items, resources, nextBeforeId });
function fixture(overrides: Partial<WorkspaceApi> = {}) {
  let notes: PageNote[] = [];
  const api: WorkspaceApi = {
    progress: vi.fn().mockResolvedValue(null), saveProgress: vi.fn().mockImplementation(async (resourceId, input) => ({ ...input, resourceId, revision: input.revision + 1, updatedAt: "2026-09-24" })),
    recent: vi.fn().mockResolvedValue({ items: [], resources: [], nextBeforeId: null }), highlights: vi.fn().mockResolvedValue({ items: [], nextBeforeId: null }), createHighlight: vi.fn(), updateHighlight: vi.fn(),
    collections: vi.fn().mockResolvedValue([COLLECTION]), createCollection: vi.fn().mockResolvedValue(COLLECTION), updateCollection: vi.fn().mockResolvedValue(COLLECTION),
    collectionItems: vi.fn().mockResolvedValue(page([])), setCollectionItem: vi.fn().mockImplementation(async (collection, _resourceId, included) => ({ ...collection, revision: collection.revision + 1, itemCount: collection.itemCount + (included ? 1 : -1) })),
    resource: vi.fn().mockResolvedValue({ resource: RESOURCE, reading: null, collectionIds: [] }),
    saveReading: vi.fn().mockImplementation(async (resourceId, input) => ({ ...input, resourceId, revision: input.revision + 1, updatedAt: NOTE.updatedAt })),
    reading: vi.fn().mockResolvedValue(page([])),
    note: vi.fn().mockImplementation(async (id) => ({ note: notes.find((note) => note.id === id)!, resource: RESOURCE })),
    notes: vi.fn().mockImplementation(async (filter) => page(notes.filter((note) => filter.deleted === undefined || !!note.deletedAt === filter.deleted))),
    createNote: vi.fn().mockImplementation(async (input) => { const note = { ...NOTE, ...input }; notes.push(note); return note; }),
    updateNote: vi.fn().mockImplementation(async (note, input) => { const updated = { ...note, ...input, deletedAt: input.deleted ? NOTE.updatedAt : null, revision: note.revision + 1 }; notes = notes.map((n) => n.id === note.id ? updated : n); return updated; }),
    ...overrides,
  };
  return { api, setNotes(value: PageNote[]) { notes = value; } };
}
function renderWorkspace(api: WorkspaceApi, props: Partial<Parameters<typeof WorkspaceDialog>[0]> & { global?: boolean } = {}) {
  const onClose = vi.fn(); const onOpenResource = vi.fn().mockResolvedValue(() => {});
  const { global, ...overrides } = props;
  const result = render(<LanguageProvider><WorkspaceDialog api={api} {...(global ? {} : { initialResourceId: RESOURCE.resourceId, expectedSourceId: RESOURCE.sourceId })} onClose={onClose} onOpenResource={onOpenResource} {...overrides} /></LanguageProvider>);
  return { ...result, onClose, onOpenResource };
}
vi.mock("./pdf-reader.tsx", () => ({ PdfReader: MockPdfReader }));
beforeEach(() => { pdfReaderControl.autoRender = true; pdfReaderControl.mounts = 0; });
beforeEach(() => window.localStorage.setItem("academiccloud.language", "en"));
afterEach(() => window.localStorage.removeItem("academiccloud.language"));

describe("private workspace", () => {
  it.each([
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/png",
    null,
  ])("keeps %s resources outside PDF progress and highlight requests", async (mediaType) => {
    const user = userEvent.setup();
    const nonPdf = { ...RESOURCE, title: "Non-PDF source", mediaType };
    const progress = vi.fn().mockRejectedValue(new ApiError(400, "invalid_input"));
    const highlights = vi.fn().mockRejectedValue(new ApiError(400, "invalid_input"));
    const authorize = vi.fn();
    const f = fixture({ progress, highlights, resource: vi.fn().mockResolvedValue({ resource: nonPdf, reading: null, collectionIds: [] }) });
    const { onOpenResource } = renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });

    await user.click(await screen.findByRole("button", { name: "Open resource" }));
    expect(onOpenResource).toHaveBeenCalledWith(nonPdf, undefined);
    expect(progress).not.toHaveBeenCalled();
    expect(highlights).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(f.api.saveProgress).not.toHaveBeenCalled();
    expect(screen.queryByTestId("pdf-reader")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a page note" })).toBeDisabled();
  });

  it("preserves non-PDF reading flags, collection membership and prior-source authored notes", async () => {
    const user = userEvent.setup();
    const nonPdf = { ...RESOURCE, sourceId: "zip-source", title: "Research archive", mediaType: "application/zip" };
    const reading = { resourceId: RESOURCE.resourceId, status: "queued" as const, important: true, toCite: false, revision: 4, updatedAt: NOTE.updatedAt };
    const f = fixture({ resource: vi.fn().mockResolvedValue({ resource: nonPdf, reading, collectionIds: [COLLECTION.id] }), notes: vi.fn().mockResolvedValue(page([NOTE], [nonPdf])) });
    renderWorkspace(f.api, { asPage: true, expectedSourceId: nonPdf.sourceId, onAuthorizeReader: vi.fn() });

    await screen.findByText(NOTE.body);
    expect(screen.getByText("Note belongs to an earlier file version")).toBeInTheDocument();
    expect(screen.getByLabelText("Important")).toBeChecked();
    expect(screen.getByLabelText(COLLECTION.name)).toBeChecked();
    await user.selectOptions(screen.getByRole("combobox", { name: "Reading status" }), "reading");
    await waitFor(() => expect(f.api.saveReading).toHaveBeenCalledWith(RESOURCE.resourceId, { status: "reading", important: true, toCite: false, revision: 4 }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Reading status" })).toHaveValue("reading"));
    await user.click(screen.getByLabelText(COLLECTION.name));
    await waitFor(() => expect(f.api.setCollectionItem).toHaveBeenCalledWith(COLLECTION, RESOURCE.resourceId, false));
    expect(f.api.progress).not.toHaveBeenCalled();
    expect(f.api.highlights).not.toHaveBeenCalled();
    expect(f.api.createNote).not.toHaveBeenCalled();
    expect(f.api.updateNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cleans up PDF source requests and saves the pending page when switching to a non-PDF", async () => {
    const user = userEvent.setup();
    const nonPdf = { ...RESOURCE, resourceId: "archive-two", sourceId: "archive-source", title: "Research archive", mediaType: "application/zip" };
    let finishHighlights!: (value: { items: TextHighlight[]; nextBeforeId: null }) => void;
    const highlights = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishHighlights = resolve; })).mockResolvedValue({ items: [], nextBeforeId: null });
    const f = fixture({ highlights,
      resource: vi.fn().mockImplementation(async (id) => ({ resource: id === nonPdf.resourceId ? nonPdf : RESOURCE, reading: null, collectionIds: [] })),
      reading: vi.fn().mockResolvedValue(page([{ resourceId: nonPdf.resourceId, status: "queued", important: false, toCite: false, revision: 1, updatedAt: NOTE.updatedAt }], [nonPdf])),
    });
    const authorize = vi.fn().mockResolvedValue({ url: "https://example.test/source.pdf", download: vi.fn() });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    await screen.findByTestId("pdf-reader");
    const progressSignal = vi.mocked(f.api.progress).mock.calls[0]![1]!;
    const highlightsSignal = highlights.mock.calls[0]![1] as AbortSignal;
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "All research" }));
    await user.click(await screen.findByRole("button", { name: nonPdf.title }));
    await screen.findByRole("heading", { name: nonPdf.title });
    await waitFor(() => expect(f.api.saveProgress).toHaveBeenCalledWith(RESOURCE.resourceId, { sourceId: RESOURCE.sourceId, physicalPage: 2, revision: 0 }));
    expect(progressSignal.aborted).toBe(true);
    expect(highlightsSignal.aborted).toBe(true);
    await act(async () => finishHighlights({ items: [{ ...NOTE, id: "old-highlight", text: "Prior PDF selection", rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.03 }], color: "yellow" }], nextBeforeId: null }));
    expect(f.api.progress).toHaveBeenCalledTimes(1);
    expect(highlights).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pdf-reader")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: RESOURCE.title }));
    await screen.findByTestId("pdf-reader");
    expect(f.api.progress).toHaveBeenCalledTimes(2);
    expect(highlights).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(pdfReaderControl.props!.highlights).toEqual([]);
  });

  it("passes only the selected authorized resource/source and account to the optional local OCR reader module", async () => {
    const f = fixture(); const localOcr = ocrApi();
    renderWorkspace(f.api, { accountId: "member-one", localOcr, asPage: true, onAuthorizeReader: vi.fn().mockResolvedValue({ url: "https://example.test/source.pdf", download: vi.fn() }) });
    await screen.findByTestId("pdf-reader");
    expect(pdfReaderControl.props!.localOcr).toEqual({ api: localOcr, accountId: "member-one", resourceId: RESOURCE.resourceId, sourceId: RESOURCE.sourceId });
  });
  it("reveals the thirteenth already loaded recent item without another request and opens its saved page", async () => {
    const user = userEvent.setup();
    const resources = Array.from({ length: 13 }, (_, index): WorkspaceResource => ({ ...RESOURCE, resourceId: `file-${index + 1}`, sourceId: `source-${index + 1}`, title: `Document ${index + 1}` }));
    const progress = resources.map((entry, index) => ({ resourceId: entry.resourceId, sourceId: entry.sourceId, physicalPage: index + 2, revision: 1, updatedAt: NOTE.updatedAt }));
    const recent = vi.fn().mockResolvedValue(page(progress, resources, "cursor-13"));
    const f = fixture({ recent, resource: vi.fn().mockImplementation(async (id) => ({ resource: resources.find((entry) => entry.resourceId === id), reading: null, collectionIds: [] })) });
    renderWorkspace(f.api, { global: true, asPage: true, onAuthorizeReader: vi.fn().mockImplementation(async (resource) => ({ url: `https://example.test/${resource.resourceId}.pdf`, download: vi.fn() })) });
    const toggle = await screen.findByRole("button", { name: "Recently read (13)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: /Document 13/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(recent).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /Document 13/ }));
    await waitFor(() => expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-source", "https://example.test/file-13.pdf"));
    expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-page", "14");
  });

  it("fetches a recent cursor only after loaded entries are shown and blocks duplicate page requests", async () => {
    const user = userEvent.setup();
    const resources = Array.from({ length: 13 }, (_, index): WorkspaceResource => ({ ...RESOURCE, resourceId: `file-${index + 1}`, sourceId: `source-${index + 1}`, title: `Document ${index + 1}` }));
    const progress = resources.map((entry, index) => ({ resourceId: entry.resourceId, sourceId: entry.sourceId, physicalPage: index + 2, revision: 1, updatedAt: NOTE.updatedAt }));
    let finish!: (value: WorkspacePage<typeof progress[number]>) => void;
    const pending = new Promise<WorkspacePage<typeof progress[number]>>((resolve) => { finish = resolve; });
    const recent = vi.fn().mockResolvedValueOnce(page(progress.slice(0, 12), resources.slice(0, 12), "cursor-12")).mockReturnValueOnce(pending);
    const f = fixture({ recent, resource: vi.fn().mockImplementation(async (id) => ({ resource: resources.find((entry) => entry.resourceId === id), reading: null, collectionIds: [] })) });
    renderWorkspace(f.api, { global: true, asPage: true, onAuthorizeReader: vi.fn().mockImplementation(async (resource) => ({ url: `https://example.test/${resource.resourceId}.pdf`, download: vi.fn() })) });
    await screen.findByRole("button", { name: /Document 12/ });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(recent).toHaveBeenLastCalledWith("cursor-12", expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Loading…" }));
    expect(recent).toHaveBeenCalledTimes(2);
    await act(async () => finish(page([progress[12]!], [resources[12]!])));
    await user.click(screen.getByRole("button", { name: /Document 13/ }));
    await waitFor(() => expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-source", "https://example.test/file-13.pdf"));
    expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-page", "14");
  });

  it("keeps cursor-loaded recent documents reachable after saving reading progress", async () => {
    const user = userEvent.setup();
    const resources = Array.from({ length: 52 }, (_, index): WorkspaceResource => ({ ...RESOURCE, resourceId: `file-${index + 1}`, sourceId: `source-${index + 1}`, title: `Document ${index + 1}` }));
    const progress = resources.map((entry, index) => ({ resourceId: entry.resourceId, sourceId: entry.sourceId, physicalPage: Math.min(index + 2, 14), revision: 1, updatedAt: NOTE.updatedAt }));
    const recent = vi.fn().mockResolvedValueOnce(page(progress.slice(0, 50), resources.slice(0, 50), "cursor-50"))
      .mockResolvedValueOnce(page(progress.slice(50), resources.slice(50)));
    const f = fixture({ recent, resource: vi.fn().mockImplementation(async (id) => ({ resource: resources.find((entry) => entry.resourceId === id), reading: null, collectionIds: [] })) });
    renderWorkspace(f.api, { global: true, asPage: true, onAuthorizeReader: vi.fn().mockImplementation(async (resource) => ({ url: `https://example.test/${resource.resourceId}.pdf`, download: vi.fn() })) });
    await screen.findByRole("button", { name: /Document 12/ });
    for (let index = 0; index < 5; index++) await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(recent).toHaveBeenCalledTimes(2);
    await screen.findByRole("button", { name: /Document 52/ });
    await user.click(screen.getByRole("button", { name: /Document 52/ }));
    await waitFor(() => expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-page", "14"));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(f.api.saveProgress).toHaveBeenCalledWith("file-52", expect.objectContaining({ physicalPage: 15 })), { timeout: 2000 });
    await waitFor(() => expect(within(screen.getByRole("complementary", { name: "Research navigation" })).getByRole("button", { name: /Document 52/ })).toHaveTextContent("PDF page 15"));
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("button", { name: /Document 50/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Document 51/ })).toBeInTheDocument();
  });

  it("merges late highlight reads with completed creates and removals without remounting the reader", async () => {
    let finish!: (value: { items: TextHighlight[]; nextBeforeId: null }) => void;
    const pending = new Promise<{ items: TextHighlight[]; nextBeforeId: null }>((resolve) => { finish = resolve; });
    const saved: TextHighlight = { ...NOTE, id: "highlight-one", physicalPage: 1, text: "Selected text", rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.03 }], color: "yellow" };
    const f = fixture({ highlights: vi.fn().mockReturnValue(pending), createHighlight: vi.fn().mockResolvedValue(saved), updateHighlight: vi.fn().mockResolvedValue({ ...saved, deletedAt: NOTE.updatedAt, revision: 2 }) });
    const authorize = vi.fn().mockResolvedValue({ url: "https://example.test/source.pdf", download: vi.fn() });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    await screen.findByTestId("pdf-reader");
    await waitFor(() => expect(screen.getByRole("button", { name: "Write a page note" })).toBeEnabled());
    await act(async () => { await pdfReaderControl.props!.onCreateHighlight!(saved); });
    expect(pdfReaderControl.props!.highlights).toEqual([saved]);
    await act(async () => { await pdfReaderControl.props!.onDeleteHighlight!(saved); });
    await act(async () => finish({ items: [saved], nextBeforeId: null }));
    expect(pdfReaderControl.props!.highlights).toEqual([]);
    expect(f.api.highlights).toHaveBeenCalledTimes(1); expect(authorize).toHaveBeenCalledTimes(1); expect(pdfReaderControl.mounts).toBe(1);
  });

  it("does not erase a just-saved highlight when an earlier empty list arrives", async () => {
    let finish!: (value: { items: TextHighlight[]; nextBeforeId: null }) => void;
    const saved: TextHighlight = { ...NOTE, id: "highlight-new", physicalPage: 1, text: "New selection", rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.03 }], color: "yellow" };
    const f = fixture({ highlights: vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; })), createHighlight: vi.fn().mockResolvedValue(saved) });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: vi.fn().mockResolvedValue({ url: "https://example.test/source.pdf", download: vi.fn() }) });
    await screen.findByTestId("pdf-reader");
    await waitFor(() => expect(screen.getByRole("button", { name: "Write a page note" })).toBeEnabled());
    await act(async () => { await pdfReaderControl.props!.onCreateHighlight!(saved); });
    await act(async () => finish({ items: [], nextBeforeId: null }));
    expect(pdfReaderControl.props!.highlights).toEqual([saved]);
  });
  it("switches document tabs with their pages and closes a tab without deleting authored state", async () => {
    const user = userEvent.setup(); const second = { ...RESOURCE, resourceId: "file-two", sourceId: "source-two", title: "Second document" };
    const f = fixture({ resource: vi.fn().mockImplementation(async (id) => ({ resource: id === second.resourceId ? second : RESOURCE, reading: null, collectionIds: [] })),
      recent: vi.fn().mockResolvedValue(page([{ resourceId: second.resourceId, sourceId: second.sourceId, physicalPage: 9, revision: 1, updatedAt: NOTE.updatedAt }], [second])) });
    const authorize = vi.fn().mockImplementation(async (resource) => ({ url: "https://example.test/" + resource.resourceId + ".pdf", download: vi.fn() }));
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    await screen.findByTestId("pdf-reader");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-page", "2");
    await user.click(screen.getByRole("button", { name: /Second document/ }));
    await waitFor(() => expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-source", "https://example.test/file-two.pdf"));
    expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-page", "9");
    await user.click(screen.getByRole("tab", { name: RESOURCE.title }));
    await waitFor(() => expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-source", "https://example.test/file-one.pdf"));
    expect(screen.getByTestId("pdf-reader")).toHaveAttribute("data-page", "2");
    await user.click(screen.getByRole("button", { name: "Write a page note" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Protect tab draft");
    await user.click(screen.getByRole("button", { name: "Close tab: " + RESOURCE.title }));
    expect(screen.getByRole("tab", { name: RESOURCE.title })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Protect tab draft");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(screen.getByRole("button", { name: "Close tab: " + RESOURCE.title }));
    expect(screen.queryByRole("tab", { name: RESOURCE.title })).not.toBeInTheDocument();
    expect(f.api.updateNote).not.toHaveBeenCalled(); expect(f.api.updateHighlight).not.toHaveBeenCalled();
  });
  it("renders the source independently of slow notes and only enables writing after the visible page completes", async () => {
    const user = userEvent.setup(); pdfReaderControl.autoRender = false;
    let resolveNotes!: (value: WorkspacePage<PageNote>) => void;
    const pending = new Promise<WorkspacePage<PageNote>>((resolve) => { resolveNotes = resolve; });
    const f = fixture({ notes: vi.fn().mockReturnValue(pending) });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: vi.fn().mockResolvedValue({ url: "https://example.test/source.pdf", download: vi.fn() }) });
    await screen.findByTestId("pdf-reader");
    expect(screen.getByRole("button", { name: "Write a page note" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Finish rendering test page" }));
    expect(screen.getByRole("button", { name: "Write a page note" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: "Write a page note" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Finish rendering test page" }));
    await user.click(screen.getByRole("button", { name: "Write a page note" }));
    const editor = screen.getByRole("form", { name: "Write a page note" });
    expect(within(editor).getByRole("spinbutton", { name: "PDF page" })).toHaveValue(2);
    expect(within(editor).getByRole("spinbutton", { name: "PDF page" })).toBeDisabled();
    await act(async () => resolveNotes(page([])));
  });

  it("keeps the authorized reader mounted when saving a page note", async () => {
    const user = userEvent.setup(); const f = fixture();
    const authorize = vi.fn().mockResolvedValue({ url: "https://example.test/source.pdf", download: vi.fn() });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    const reader = await screen.findByTestId("pdf-reader");
    await user.click(screen.getByRole("button", { name: "Write a page note" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "A saved interpretation");
    await user.click(within(screen.getByRole("form", { name: "Write a page note" })).getByRole("button", { name: "Save" }));
    await screen.findByText("A saved interpretation");
    expect(screen.getByTestId("pdf-reader")).toBe(reader);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(pdfReaderControl.mounts).toBe(1);
  });
  it("opens a source-aware inline PDF, jumps to an explicit page, and starts the note on that page", async () => {
    const user = userEvent.setup(); const f = fixture();
    const download = vi.fn().mockResolvedValue(undefined);
    const authorize = vi.fn().mockResolvedValue({ url: "https://example.test/document.pdf?signature=bounded", download });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize, initialPhysicalPage: 7 });
    const frame = await screen.findByTitle(`Source: ${RESOURCE.title}`);
    expect(frame).toHaveAttribute("data-page", "7");
    expect(authorize).toHaveBeenCalledWith(RESOURCE);
    await user.click(within(await screen.findByRole("form", { name: "Write a page note" })).getByRole("button", { name: "Cancel" }));
    const reader = await screen.findByRole("region", { name: "Source" });
    await user.click(within(reader).getByRole("button", { name: "Next page" }));
    expect(frame).toHaveAttribute("data-page", "8");
    const target = within(reader).getByRole("spinbutton", { name: "PDF page" });
    await user.clear(target);
    await user.type(target, "12");
    await user.click(within(reader).getByRole("button", { name: "Go" }));
    expect(frame).toHaveAttribute("data-page", "12");
    await user.click(screen.getByRole("button", { name: "Write a page note" }));
    const editor = screen.getByRole("form", { name: "Write a page note" });
    const notePage = within(editor).getByRole("spinbutton", { name: "PDF page" });
    expect(notePage).toHaveValue(12);
    await user.type(within(editor).getByRole("textbox", { name: "Note" }), "Compare with the source scan.");
    const save = within(editor).getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    expect(notePage).toBeDisabled();
    expect(within(editor).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in new tab" })).toHaveAttribute("href", "https://example.test/document.pdf?signature=bounded#page=12");
    await user.click(within(reader).getByRole("button", { name: "Download original" }));
    expect(download).toHaveBeenCalledOnce();
  });

  it("reauthorizes an expired source before moving to another PDF page", async () => {
    const user = userEvent.setup(); const f = fixture();
    const authorize = vi.fn()
      .mockResolvedValueOnce({ url: "https://example.test/old.pdf", expiresAt: new Date(Date.now() - 1000).toISOString(), download: vi.fn() })
      .mockResolvedValueOnce({ url: "https://example.test/fresh.pdf", expiresAt: new Date(Date.now() + 60_000).toISOString(), download: vi.fn() });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    const reader = await screen.findByRole("region", { name: "Source" });
    expect(await within(reader).findByTitle(`Source: ${RESOURCE.title}`)).toHaveAttribute("data-page", "1");
    expect(await within(reader).findByText("The source link expired; page navigation will reauthorize it.")).toBeInTheDocument();
    expect(within(reader).queryByRole("link", { name: "Open in new tab" })).not.toBeInTheDocument();
    await user.click(within(reader).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(authorize).toHaveBeenCalledTimes(2));
    expect(await within(reader).findByTitle(`Source: ${RESOURCE.title}`)).toHaveAttribute("data-page", "2");
  });

  it("drops a stale reader authorization after navigating away and reopening the resource", async () => {
    const user = userEvent.setup(); let resolveOld!: (value: { url: string; download: () => Promise<void> }) => void;
    const old = new Promise<{ url: string; download: () => Promise<void> }>((resolve) => { resolveOld = resolve; });
    const authorize = vi.fn().mockReturnValueOnce(old).mockResolvedValue({ url: "https://example.test/current.pdf", download: vi.fn() });
    const f = fixture({ reading: vi.fn().mockResolvedValue(page([{ resourceId: RESOURCE.resourceId, status: "queued", important: false, toCite: false, revision: 1, updatedAt: NOTE.updatedAt }])) });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    await waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "All research" }));
    await user.click(screen.getByRole("button", { name: "My resources" }));
    await user.click(await screen.findByRole("button", { name: RESOURCE.title }));
    expect(await screen.findByTitle(`Source: ${RESOURCE.title}`)).toHaveAttribute("data-page", "1");
    await act(async () => resolveOld({ url: "https://example.test/stale.pdf", download: vi.fn() }));
    expect(screen.getByTitle(`Source: ${RESOURCE.title}`)).toHaveAttribute("data-page", "1");
  });

  it.each([false, true])("reauthorizes an expired existing-note jump and refuses a replaced source (replacement: %s)", async (replaced) => {
    const user = userEvent.setup(); const f = fixture(); f.setNotes([NOTE]);
    const authorize = vi.fn().mockResolvedValueOnce({ url: "https://example.test/old.pdf", expiresAt: new Date(Date.now() - 1000).toISOString(), download: vi.fn() });
    if (replaced) authorize.mockRejectedValueOnce(new ApiError(409, "concurrent_change"));
    else authorize.mockResolvedValueOnce({ url: "https://example.test/fresh.pdf", expiresAt: new Date(Date.now() + 60_000).toISOString(), download: vi.fn() });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    const reader = await screen.findByRole("region", { name: "Source" });
    await within(reader).findByText("The source link expired; page navigation will reauthorize it.");
    await user.click(screen.getByRole("button", { name: "Go to page" }));
    await waitFor(() => expect(authorize).toHaveBeenCalledTimes(2));
    expect(authorize).toHaveBeenNthCalledWith(2, RESOURCE);
    if (replaced) {
      expect(await within(reader).findByText("The source file changed. Return to the Library and reopen it.")).toBeInTheDocument();
      expect(within(reader).queryByTitle(`Source: ${RESOURCE.title}`)).not.toBeInTheDocument();
      expect(within(reader).queryByRole("spinbutton", { name: "PDF page" })).not.toBeInTheDocument();
    } else {
      expect(await within(reader).findByTitle(`Source: ${RESOURCE.title}`)).toHaveAttribute("data-page", "7");
      expect(within(reader).getByRole("spinbutton", { name: "PDF page" })).toHaveValue(7);
    }
  });

  it("does not authorize an inline reader when the expected source generation changed", async () => {
    const replacement = { ...RESOURCE, sourceId: "replacement" };
    const authorize = vi.fn();
    const f = fixture({ resource: vi.fn().mockResolvedValue({ resource: replacement, reading: null, collectionIds: [] }) });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    expect(await screen.findByText("File content has changed. Reopen the resource before writing a note.")).toBeInTheDocument();
    expect(authorize).not.toHaveBeenCalled();
    expect(screen.queryByTitle(`Source: ${RESOURCE.title}`)).not.toBeInTheDocument();
  });

  it("saves an explicit physical page and locator, then edits, trashes and restores the same attachment", async () => {
    const user = userEvent.setup(); const f = fixture();
    renderWorkspace(f.api);
    expect(await screen.findByRole("button", { name: "Write a page note" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Write a page note" }));
    await user.clear(screen.getByLabelText("PDF page")); await user.type(screen.getByLabelText("PDF page"), "12");
    await user.type(screen.getByLabelText("Printed page / volume / leaf (optional)"), "卷二 葉三");
    await user.type(screen.getByRole("textbox", { name: "Note" }), "New private text");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("New private text");
    expect(screen.getByText("PDF page 12 · 卷二 葉三")).toBeInTheDocument();
    expect(f.api.createNote).toHaveBeenCalledWith({ resourceId: RESOURCE.resourceId, sourceId: RESOURCE.sourceId, physicalPage: 12, locator: "卷二 葉三", body: "New private text" });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("PDF page")).toBeDisabled();
    await user.clear(screen.getByRole("textbox", { name: "Note" })); await user.type(screen.getByRole("textbox", { name: "Note" }), "Edited private text");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Edited private text");
    await user.click(screen.getByRole("button", { name: "Move note to trash" }));
    await waitFor(() => expect(screen.queryByText("Edited private text")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Deleted notes" }));
    await screen.findByText("Edited private text");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.queryByText("Edited private text")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Current notes" }));
    await screen.findByText("Edited private text");
    expect(f.api.updateNote).toHaveBeenLastCalledWith(expect.objectContaining({ physicalPage: 12, sourceId: "source-one", revision: 3 }), { body: "Edited private text", locator: "卷二 葉三", deleted: false });
  });

  it("retains unsaved drafts when Close or Escape is requested and requires explicit discard", async () => {
    const user = userEvent.setup(); const f = fixture(); const { onClose } = renderWorkspace(f.api);
    await user.click(await screen.findByRole("button", { name: "Write a page note" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Keep my draft");
    await user.click(screen.getByRole("button", { name: "Close my research" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText("Save or discard your note changes before leaving.")).toBeInTheDocument();
    await user.keyboard("{Escape}"); expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Keep my draft");
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(screen.getByRole("button", { name: "Close my research" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("Keep my draft")).toBeNull();
  });

  it("keeps a CAS-conflicted draft for review and never silently overwrites another revision", async () => {
    const user = userEvent.setup();
    const latest = { ...NOTE, body: "Another editor's current text", revision: 2 };
    const updateNote = vi.fn().mockRejectedValueOnce(new ApiError(409, "concurrent_change")).mockResolvedValue({ ...latest, body: "My conflict draft", revision: 3 });
    const f = fixture({ updateNote, note: vi.fn().mockResolvedValue({ note: latest, resource: RESOURCE }) }); f.setNotes([NOTE]); renderWorkspace(f.api);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Note" })); await user.type(screen.getByRole("textbox", { name: "Note" }), "My conflict draft");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is preserved");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("My conflict draft");
    expect(updateNote).toHaveBeenCalledOnce();
    await screen.findByText("Another editor's current text");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("My conflict draft");
    expect(updateNote).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reviewed: keep my draft" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(2));
    expect(updateNote).toHaveBeenLastCalledWith(latest, { body: "My conflict draft", locator: NOTE.locator, deleted: false });
  });

  it("protects new and renamed collection drafts until explicitly saved or discarded", async () => {
    const user = userEvent.setup(); const f = fixture(); const { onClose } = renderWorkspace(f.api, { global: true });
    await user.click(screen.getByRole("button", { name: "Collections" }));
    await screen.findByRole("button", { name: "Archive" });
    await user.type(screen.getByRole("textbox", { name: "Collection name" }), "New collection draft");
    await user.click(screen.getByRole("button", { name: "Close my research" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Save or discard your collection changes before leaving.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "My resources" }));
    expect(screen.getByRole("textbox", { name: "Collection name" })).toHaveValue("New collection draft");
    expect(screen.getByRole("button", { name: "Create collection" })).toBeEnabled();
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(screen.getByRole("button", { name: `Edit collection: ${COLLECTION.name}` }));
    await user.type(screen.getByRole("textbox", { name: "Rename" }), " revised");
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Rename" })).toHaveValue(`${COLLECTION.name} revised`);
    expect(screen.getByRole("button", { name: `Edit collection: ${COLLECTION.name}` })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close my research" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves conflicted membership unchanged until the current collection revision is reloaded", async () => {
    const user = userEvent.setup();
    const latest = { ...COLLECTION, revision: 3, itemCount: 2 };
    const membership = vi.fn().mockRejectedValueOnce(new ApiError(409, "concurrent_change")).mockResolvedValue({ ...latest, revision: 4, itemCount: 3 });
    const f = fixture({ setCollectionItem: membership, collections: vi.fn().mockResolvedValueOnce([COLLECTION]).mockResolvedValue([latest]) });
    renderWorkspace(f.api);
    await user.click(await screen.findByLabelText(COLLECTION.name));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(COLLECTION.name)).not.toBeChecked();
    expect(membership).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await user.click(await screen.findByLabelText(COLLECTION.name));
    await waitFor(() => expect(screen.getByLabelText(COLLECTION.name)).toBeChecked());
    expect(membership).toHaveBeenLastCalledWith(latest, RESOURCE.resourceId, true);
  });

  it("does not offer collection removal after switching to My resources", async () => {
    const user = userEvent.setup();
    const f = fixture({ collectionItems: vi.fn().mockResolvedValue(page([{ collectionId: COLLECTION.id, resourceId: RESOURCE.resourceId, createdAt: NOTE.createdAt }])),
      reading: vi.fn().mockResolvedValue(page([{ resourceId: RESOURCE.resourceId, status: "reading", important: false, toCite: false, revision: 1, updatedAt: NOTE.updatedAt }])) });
    renderWorkspace(f.api, { global: true });
    await user.click(screen.getByRole("button", { name: "Collections" }));
    await user.click(await screen.findByRole("button", { name: `${COLLECTION.name}0` }));
    await screen.findByRole("button", { name: "Remove from collection" });
    await user.click(screen.getByRole("button", { name: "My resources" }));
    await screen.findByRole("button", { name: RESOURCE.title });
    expect(screen.queryByRole("button", { name: "Remove from collection" })).not.toBeInTheDocument();
  });

  it("disables new notes on changed source and never opens an old-source note on current bytes", async () => {
    const replacement = { ...RESOURCE, sourceId: "replacement" };
    const f = fixture({ resource: vi.fn().mockResolvedValue({ resource: replacement, reading: null, collectionIds: [] }), notes: vi.fn().mockResolvedValue(page([NOTE], [replacement])) });
    renderWorkspace(f.api);
    expect(await screen.findByRole("button", { name: "Write a page note" })).toBeDisabled();
    expect(screen.getByText("Note belongs to an earlier file version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open resource" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(f.api.createNote).not.toHaveBeenCalled();
  });

  it("shows and edits authored notes even when resource metadata is no longer authorized", async () => {
    const user = userEvent.setup();
    const f = fixture({ resource: vi.fn().mockRejectedValue(new ApiError(404, "not_found")), notes: vi.fn().mockResolvedValue(page([NOTE], [])) });
    renderWorkspace(f.api);
    await screen.findByText(NOTE.body);
    expect(screen.queryByRole("button", { name: "Open resource" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write a page note" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(NOTE.body);
    expect(screen.getByLabelText("PDF page")).toBeDisabled();
  });

  it("updates explicit reading flags and collections using only the current resource revision", async () => {
    const user = userEvent.setup(); const f = fixture(); renderWorkspace(f.api);
    await screen.findByRole("button", { name: "Write a page note" });
    expect(screen.getByRole("button", { name: "Open resource" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Reading status" }), "reading");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Reading status" })).toHaveValue("reading"));
    await user.click(screen.getByLabelText("Important"));
    await waitFor(() => expect(screen.getByLabelText("Important")).toBeChecked());
    expect(f.api.saveReading).toHaveBeenLastCalledWith(RESOURCE.resourceId, { status: "reading", important: true, toCite: false, revision: 1 });
    await user.click(screen.getByLabelText(COLLECTION.name));
    await waitFor(() => expect(screen.getByLabelText(COLLECTION.name)).toBeChecked());
    expect(f.api.setCollectionItem).toHaveBeenCalledWith(COLLECTION, RESOURCE.resourceId, true);
    await user.click(screen.getByLabelText(COLLECTION.name));
    await waitFor(() => expect(screen.getByLabelText(COLLECTION.name)).not.toBeChecked());
    expect(f.api.setCollectionItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: COLLECTION.id, revision: 2 }), RESOURCE.resourceId, false);
    expect(screen.getByRole("link", { name: "Export my research" })).toHaveAttribute("href", "/api/workspace/export");
  });

  it("keeps a queued reading item visible in the research overview", async () => {
    const f = fixture({ resource: vi.fn().mockResolvedValue({ resource: RESOURCE, reading: { resourceId: RESOURCE.resourceId, status: "queued", important: false, toCite: false, revision: 1, updatedAt: NOTE.updatedAt }, collectionIds: [] }) });
    renderWorkspace(f.api);
    await screen.findByRole("button", { name: "Write a page note" });
    expect(screen.getByRole("combobox", { name: "Reading status" })).toHaveValue("queued");
    expect(within(screen.getByRole("complementary", { name: "Overview" })).getByText("To read")).toBeInTheDocument();
  });

  it("ignores cancelled initial loads after navigation and opens exact note page", async () => {
    const user = userEvent.setup(); let resolve!: (value: WorkspacePage<PageNote>) => void;
    const pending = new Promise<WorkspacePage<PageNote>>((r) => { resolve = r; });
    const notes = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(page([NOTE]));
    const f = fixture({ notes }); const { onOpenResource, onClose } = renderWorkspace(f.api);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    await user.click(screen.getByRole("button", { name: "All research" }));
    await user.click(screen.getByRole("button", { name: "Page notes" }));
    await screen.findByText(NOTE.body);
    expect(notes.mock.calls[0]![1].aborted).toBe(true);
    await act(async () => resolve(page([{ ...NOTE, body: "Stale private response" }])));
    expect(screen.queryByText("Stale private response")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open resource" }));
    expect(onOpenResource).toHaveBeenCalledWith(RESOURCE, NOTE.physicalPage);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("paginates notes without dropping earlier records and keeps the collection archive recoverable", async () => {
    const user = userEvent.setup();
    const notes = vi.fn().mockResolvedValueOnce(page([NOTE], [RESOURCE], NOTE.id)).mockResolvedValue(page([{ ...NOTE, id: "note-two", body: "Second note" }]));
    const collections = vi.fn().mockResolvedValue([COLLECTION]); const updateCollection = vi.fn().mockImplementation(async (_collection, name, archived) => {
      collections.mockResolvedValue([{ ...COLLECTION, name, archivedAt: archived ? NOTE.updatedAt : null, revision: 2 }]);
      return { ...COLLECTION, name, archivedAt: archived ? NOTE.updatedAt : null, revision: 2 };
    });
    const f = fixture({ notes, collections, updateCollection });
    renderWorkspace(f.api, { global: true });
    await user.click(screen.getByRole("button", { name: "Page notes" }));
    await screen.findByText(NOTE.body); await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Second note"); expect(screen.getByText(NOTE.body)).toBeInTheDocument();
    expect(notes).toHaveBeenLastCalledWith({ deleted: false, beforeId: NOTE.id });
    await user.click(screen.getByRole("button", { name: "Collections" }));
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    await screen.findByRole("button", { name: "Restore" });
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await screen.findByRole("button", { name: "Archive" });
    expect(updateCollection).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 2 }), COLLECTION.name, false);
  });

  it("reconciles a collection rename conflict without losing the name draft or retrying an obsolete revision", async () => {
    const user = userEvent.setup();
    const latest = { ...COLLECTION, name: "Current saved collection name", revision: 2 };
    const collections = vi.fn().mockResolvedValueOnce([COLLECTION]).mockResolvedValueOnce([COLLECTION]).mockResolvedValue([latest]);
    const updateCollection = vi.fn().mockRejectedValueOnce(new ApiError(409, "concurrent_change")).mockResolvedValue({ ...latest, name: "My renamed collection", revision: 3 });
    const f = fixture({ collections, updateCollection }); renderWorkspace(f.api, { global: true });
    await user.click(screen.getByRole("button", { name: "Collections" }));
    await user.click(await screen.findByRole("button", { name: `Edit collection: ${COLLECTION.name}` }));
    await user.clear(screen.getByRole("textbox", { name: "Rename" })); await user.type(screen.getByRole("textbox", { name: "Rename" }), "My renamed collection");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.getByRole("textbox", { name: "Rename" })).toHaveValue("My renamed collection");
    expect(await screen.findAllByText(latest.name)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reviewed: keep my draft" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCollection).toHaveBeenCalledTimes(2));
    expect(updateCollection).toHaveBeenLastCalledWith(expect.objectContaining({ id: COLLECTION.id, revision: 2 }), "My renamed collection", false);
  });
});

 describe("reader authorization and progress conflict recovery", () => {
  it("retains the same reader and document identity while expired authorization is pending", async () => {
    const user = userEvent.setup(); const f = fixture();
    const fresh = { url: "https://example.test/fresh.pdf", sizeBytes: 100, expiresAt: new Date(Date.now() + 60_000).toISOString(), download: vi.fn() };
    let finish!: (value: typeof fresh) => void;
    const authorize = vi.fn().mockResolvedValueOnce({ ...fresh, url: "https://example.test/old.pdf", expiresAt: new Date(Date.now() - 1000).toISOString() })
      .mockReturnValueOnce(new Promise<typeof fresh>((resolve) => { finish = resolve; }));
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: authorize });
    const reader = await screen.findByTestId("pdf-reader"); const identity = reader.getAttribute("data-source");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pdf-reader")).toBe(reader);
    expect(reader).toHaveAttribute("data-page", "1");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await act(async () => finish(fresh));
    await waitFor(() => expect(reader).toHaveAttribute("data-page", "2"));
    expect(reader).toHaveAttribute("data-source", identity);
    expect(pdfReaderControl.mounts).toBe(1);
    expect(await pdfReaderControl.props!.remoteSource!.getUrl()).toBe(fresh.url);
  });
  it.each([false, true])("stops conflicted writes until explicit resolution (use latest: %s)", async (useLatest) => {
    const user = userEvent.setup();
    const initial = { resourceId: RESOURCE.resourceId, sourceId: RESOURCE.sourceId, physicalPage: 1, revision: 1, updatedAt: NOTE.updatedAt };
    const latest = { ...initial, physicalPage: 9, revision: 4 };
    const saveProgress = vi.fn().mockRejectedValueOnce(new ApiError(409, "concurrent_change"))
      .mockImplementation(async (resourceId, input) => ({ ...input, resourceId, revision: input.revision + 1, updatedAt: NOTE.updatedAt }));
    const f = fixture({ progress: vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(latest), saveProgress });
    renderWorkspace(f.api, { asPage: true, onAuthorizeReader: vi.fn().mockResolvedValue({ url: "https://example.test/document.pdf", download: vi.fn() }) });
    const reader = await screen.findByTestId("pdf-reader");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("button", { name: "Keep current page" });
    expect(saveProgress).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(reader).toHaveAttribute("data-page", "3");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
    expect(saveProgress).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: useLatest ? "Go to latest position" : "Keep current page" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Keep current page" })).not.toBeInTheDocument());
    expect(reader).toHaveAttribute("data-page", useLatest ? "9" : "3");
    if (useLatest) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
      expect(saveProgress).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "Next page" }));
    }
    await waitFor(() => expect(saveProgress).toHaveBeenCalledTimes(2));
    expect(saveProgress).toHaveBeenLastCalledWith(RESOURCE.resourceId, { sourceId: RESOURCE.sourceId, physicalPage: useLatest ? 10 : 3, revision: 4 });
    expect(pdfReaderControl.mounts).toBe(1);
  });
});
