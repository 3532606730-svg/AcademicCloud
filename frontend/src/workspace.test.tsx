import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import { WorkspaceDialog } from "./workspace.tsx";
import type { PageNote, ResearchCollection, WorkspaceApi, WorkspacePage, WorkspaceResource } from "./workspace-api.ts";

const RESOURCE: WorkspaceResource = { resourceId: "file-one", sourceId: "source-one", title: "Shared academic source", libraryId: "canonical-library", mediaType: "application/pdf" };
const NOTE: PageNote = { id: "note-one", resourceId: RESOURCE.resourceId, sourceId: RESOURCE.sourceId, physicalPage: 7, locator: "葉三", body: "Private interpretation", revision: 1, createdAt: "2026-09-15T10:00:00Z", updatedAt: "2026-09-15T10:00:00Z", deletedAt: null };
const COLLECTION: ResearchCollection = { id: "set-one", name: "My research set", revision: 1, archivedAt: null, itemCount: 0, createdAt: "2026-09-15T10:00:00Z", updatedAt: "2026-09-15T10:00:00Z" };
const page = <T,>(items: T[], resources: WorkspaceResource[] = [RESOURCE], nextBeforeId: string | null = null): WorkspacePage<T> => ({ items, resources, nextBeforeId });
function fixture(overrides: Partial<WorkspaceApi> = {}) {
  let notes: PageNote[] = [];
  const api: WorkspaceApi = {
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
beforeEach(() => window.localStorage.setItem("academiccloud.language", "en"));
afterEach(() => window.localStorage.removeItem("academiccloud.language"));

describe("private workspace", () => {
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
    expect(screen.getByRole("button", { name: "My resources" })).toBeDisabled();
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
