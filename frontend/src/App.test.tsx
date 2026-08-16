import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.tsx";
import {
  ApiError,
  type AcademicCloudApi,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
} from "./api.ts";
import type { UploadProgressMetrics } from "./direct-upload.ts";
import { DirectUploadError } from "./direct-upload.ts";

afterEach(() => {
  window.localStorage.removeItem("academiccloud.language");
  document.documentElement.lang = "";
});

const EMPTY_ENTRIES: EntriesResponse = { folder: null, folders: [], files: [] };
const ACCOUNT = { id: "account-1", loginName: "Scholar" };
const FOLDER: FolderEntry = {
  id: "folder-1",
  parentId: null,
  name: "Sources",
  state: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
  deletedAt: null,
};
const FILE: FileEntry = {
  id: "file-1",
  folderId: null,
  displayName: "paper.pdf",
  mediaType: "application/pdf",
  sizeBytes: 6,
  checksumAlgorithm: "md5",
  checksum: "YWNhZGVtaWNjbG91ZA==",
  state: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
  activatedAt: "2026-08-13T00:00:00.000Z",
  deletedAt: null,
  purgedAt: null,
};

function fakeApi(overrides: Partial<AcademicCloudApi> = {}): AcademicCloudApi {
  return {
    getSession: vi.fn().mockRejectedValue(new ApiError(401, "authentication_required")),
    login: vi.fn().mockResolvedValue(ACCOUNT),
    logout: vi.fn().mockResolvedValue(undefined),
    listEntries: vi.fn().mockResolvedValue(EMPTY_ENTRIES),
    listPending: vi.fn().mockResolvedValue([]),
    listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [] }),
    listFavorites: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    setFileFavorite: vi.fn().mockResolvedValue(undefined),
    setFolderFavorite: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    restoreFolder: vi.fn(),
    createUpload: vi.fn(),
    renewUpload: vi.fn(),
    completeUpload: vi.fn(),
    createDownload: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
    restoreFile: vi.fn(),
    permanentlyDeleteFile: vi.fn(),
    ...overrides,
  };
}

interface DragDataTransferInit {
  types?: string[];
  files?: File[];
  items?: Array<{ kind: string; getAsFile?: () => File | null; webkitGetAsEntry?: () => { isDirectory: boolean; isFile: boolean } | null }>;
}

function dragDataTransfer(init: DragDataTransferInit): DataTransfer {
  return {
    types: init.types ?? ["Files"],
    files: init.files ?? [],
    items: init.items ?? [],
    dropEffect: "none",
    effectAllowed: "all",
  } as unknown as DataTransfer;
}

async function openLibrary(api: AcademicCloudApi) {
  render(<App api={api} />);
  await screen.findByRole("heading", { name: "Library" });
}

function workspace() {
  return screen.getByRole("main");
}

async function openRowMenu(name: string) {
  const trigger = await screen.findByRole("button", { name: `Open actions for ${name}` });
  await userEvent.click(trigger);
  return screen.getByRole("menu", { name: `Actions for ${name}` });
}

describe("App", () => {
  it("recovers an anonymous session, signs in, and renders an empty library", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Login name"), "Scholar");
    await user.type(screen.getByLabelText("Password"), "valid-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(await screen.findByText("This folder is ready")).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith("Scholar", "valid-password");
    expect(api.listEntries).toHaveBeenCalledWith(null, expect.any(AbortSignal));
  });

  it("shows stable API failures without exposing implementation details", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ login: vi.fn().mockRejectedValue(new ApiError(401, "invalid_credentials")) });
    render(<App api={api} />);

    await user.type(await screen.findByLabelText("Login name"), "Scholar");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("incorrect"));
    expect(screen.queryByText(/SQL|OSSAccessKeyId/i)).not.toBeInTheDocument();
  });

  it("renders the root library without an eyebrow, without a redundant breadcrumb, with title and counts", async () => {
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    await openLibrary(api);

    expect(screen.queryByText("Your research files")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Library", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("0 files · 0 folders")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New folder" })).toBeInTheDocument();
    expect(screen.getByLabelText("Upload files")).toBeInTheDocument();
  });

  it("navigates folders and returns through the breadcrumb (nested only)", async () => {
    const user = userEvent.setup();
    const listEntries = vi.fn()
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] })
      .mockResolvedValueOnce({ folder: FOLDER, folders: [], files: [] })
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries });
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Sources" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-1", expect.anything()));
    expect(await screen.findByRole("heading", { name: "Sources", level: 1 })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(within(crumbs).getByRole("button", { name: "Sources" })).toBeInTheDocument();

    await user.click(within(crumbs).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(listEntries).toHaveBeenLastCalledWith(null, expect.anything()));
    expect(screen.getByRole("heading", { name: "Library", level: 1 })).toBeInTheDocument();
  });

  it("creates a folder through the command-bar dialog with keyboard and focus handling", async () => {
    const user = userEvent.setup();
    const createFolder = vi.fn().mockResolvedValue({ ...FOLDER, name: "Notes" });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), createFolder });
    await openLibrary(api);

    await user.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog", { name: "New folder" });
    const input = within(dialog).getByLabelText("New folder");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("maxlength", "255");
    expect(within(dialog).getByRole("button", { name: "Close new folder dialog" })).toBeInTheDocument();

    await user.type(input, "Notes");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith("Notes", null));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New folder" })).not.toBeInTheDocument());

    // Escape closes safely when reopened.
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await screen.findByRole("dialog", { name: "New folder" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New folder" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "New folder" })).toHaveFocus();
  });

  it("keeps the existing bulk picker with multiple and enqueues every selected file", async () => {
    const user = userEvent.setup();
    const checksumFile = vi.fn(() => new Promise<string>(() => {}));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} />);

    const input = await screen.findByLabelText("Upload files");
    expect(input).toHaveAttribute("multiple");
    const files = ["a", "b", "c"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    await user.upload(input, files);

    // Concurrency bound: two checksum workflows start, the rest queue.
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Queued")).toHaveLength(1);
  });

  it("shows the drop overlay only for real file drags and clears it on leave", async () => {
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    await openLibrary(api);
    const main = workspace();

    const textDrag = dragDataTransfer({ types: ["text/plain"], files: [] });
    fireEvent.dragEnter(main, { dataTransfer: textDrag });
    expect(screen.queryByText(/Drop to upload to/)).not.toBeInTheDocument();

    // Protected-mode shape: browsers keep DataTransfer.files empty during
    // dragenter; the count must come from the enumerable item list.
    const fileDrag = dragDataTransfer({
      types: ["Files"],
      files: [],
      items: [
        { kind: "file" },
        { kind: "file" },
      ],
    });
    fireEvent.dragEnter(main, { dataTransfer: fileDrag });
    expect(screen.getByText(/Drop to upload to/)).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.queryByText("0 files")).not.toBeInTheDocument();

    // Depth counter: a child enter/leave pair must not clear the overlay.
    fireEvent.dragEnter(main, { dataTransfer: fileDrag });
    fireEvent.dragLeave(main, { dataTransfer: fileDrag });
    expect(screen.getByText(/Drop to upload to/)).toBeInTheDocument();

    fireEvent.dragLeave(main, { dataTransfer: fileDrag });
    await waitFor(() => expect(screen.queryByText(/Drop to upload to/)).not.toBeInTheDocument());
  });

  it("omits the drop count when the item list cannot be enumerated", async () => {
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    await openLibrary(api);
    const main = workspace();

    fireEvent.dragEnter(main, { dataTransfer: dragDataTransfer({ types: ["Files"], files: [], items: [] }) });
    const overlay = screen.getByRole("status", { name: "File drop overlay" });
    expect(within(overlay).getByText(/Drop to upload to/)).toBeInTheDocument();
    expect(within(overlay).queryByText(/files$/)).not.toBeInTheDocument();
    fireEvent.dragLeave(main, { dataTransfer: dragDataTransfer({ types: ["Files"], files: [], items: [] }) });
  });

  it("uploads dropped files through the existing pipeline with the destination pinned at drop time", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    const folderA = { ...FOLDER, id: "folder-a", name: "A" };
    const folderB = { ...FOLDER, id: "folder-b", name: "B" };
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === "folder-a"
        ? { folder: folderA, folders: [], files: [] }
        : folderId === "folder-b"
          ? { folder: folderB, folders: [], files: [] }
          : { folder: null, folders: [folderA, folderB], files: [] },
    ));
    const createUpload = vi.fn().mockResolvedValue({
      file: { ...FILE, state: "pending_upload" as const, activatedAt: null },
      upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries,
      createUpload,
      completeUpload: vi.fn().mockResolvedValue(FILE),
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockResolvedValue(undefined)} />);

    await user.click(await screen.findByRole("button", { name: "A" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-a", expect.anything()));

    const files = ["x", "y", "z"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    // fireEvent returns false when a handler called preventDefault — exactly
    // the qualifying-drop interception this test requires.
    const dropEvent = fireEvent.drop(workspace(), { dataTransfer: dragDataTransfer({ files, items: files.map((file) => ({ kind: "file", getAsFile: () => file })) }) });
    expect(dropEvent).toBe(false);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Drop to upload to/)).not.toBeInTheDocument();
    expect(screen.getByText("3 files added to the upload queue.")).toBeInTheDocument();

    // Navigate to folder B before slots free: the pinned destination must hold.
    await user.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Library" }));
    await user.click(await screen.findByRole("button", { name: "B" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-b", expect.anything()));

    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
    checksumResolvers[1]!(FILE.checksum);
    checksumResolvers[2]!(FILE.checksum);
    await waitFor(() => expect(createUpload).toHaveBeenCalledTimes(3));

    const destinations = createUpload.mock.calls.map(([input]) => (input as { folderId: string | null }).folderId);
    expect(destinations).toEqual(["folder-a", "folder-a", "folder-a"]);
  });

  it("prevents browser defaults only for qualifying file drops", async () => {
    const checksumFile = vi.fn(() => new Promise<string>(() => {}));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} />);
    await screen.findByRole("heading", { name: "Library" });

    const fileDrop = fireEvent.drop(workspace(), {
      dataTransfer: dragDataTransfer({ files: [new File(["a"], "a.pdf")], items: [{ kind: "file", getAsFile: () => new File(["a"], "a.pdf") }] }),
    });
    // false = a handler called preventDefault (browser navigation suppressed).
    expect(fileDrop).toBe(false);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(1));

    // A text drag is never hijacked: no default prevention, no queue effect.
    const before = checksumFile.mock.calls.length;
    const textDrop = fireEvent.drop(workspace(), { dataTransfer: dragDataTransfer({ types: ["text/plain"], files: [] }) });
    expect(textDrop).toBe(true);
    expect(checksumFile).toHaveBeenCalledTimes(before);
  });

  it("protects the whole app from external file navigation without hijacking other drags", async () => {
    const checksumFile = vi.fn(() => new Promise<string>(() => {}));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} />);
    await screen.findByRole("heading", { name: "Library" });

    // External file drop on the topbar (outside the workspace): navigation
    // suppressed, nothing enqueued, a concise localized notice appears.
    const topbar = document.querySelector(".topbar")!;
    const topbarDrop = fireEvent.drop(topbar, {
      dataTransfer: dragDataTransfer({ files: [new File(["a"], "a.pdf")], items: [{ kind: "file", getAsFile: () => new File(["a"], "a.pdf") }] }),
    });
    expect(topbarDrop).toBe(false);
    expect(checksumFile).not.toHaveBeenCalled();
    expect(screen.getByText("Drop files into the Library workspace to upload them.")).toBeInTheDocument();

    // Text/link drags outside the workspace are never intercepted.
    const textDrop = fireEvent.drop(topbar, { dataTransfer: dragDataTransfer({ types: ["text/plain"], files: [] }) });
    expect(textDrop).toBe(true);
  });

  it("recovers a pending upload when only the browser MIME differs", async () => {
    const user = userEvent.setup();
    const pendingFile = { ...FILE, state: "pending_upload" as const, activatedAt: null, mediaType: "application/octet-stream" };
    const completeUpload = vi.fn().mockResolvedValue(FILE);
    const renewUpload = vi.fn().mockResolvedValue({
      method: "POST" as const,
      url: "https://storage.invalid",
      fields: {},
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([pendingFile]),
      completeUpload,
      renewUpload,
    });
    const directUpload = vi.fn().mockResolvedValue(undefined);
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directUpload={directUpload} />);

    await user.click(await screen.findByRole("button", { name: "Pending uploads" }));
    // The reserved upload reports a different MIME than the browser now
    // infers: the same name/size/checksum must still renew successfully.
    const chooseInput = await screen.findByLabelText("Choose same file for paper.pdf");
    await user.upload(chooseInput, new File(["source"], "paper.pdf", { type: "application/x-pdf" }));

    await waitFor(() => expect(renewUpload).toHaveBeenCalledWith("file-1"));
    await waitFor(() => expect(completeUpload).toHaveBeenCalledWith("file-1"));
    expect(directUpload).toHaveBeenCalledOnce();
    expect(api.createUpload).not.toHaveBeenCalled();
  });

  it("skips dropped directories, reports them, and still uploads regular files", async () => {
    const checksumFile = vi.fn(() => new Promise<string>(() => {}));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} />);
    await screen.findByRole("heading", { name: "Library" });

    const file = new File(["a"], "a.pdf", { type: "application/pdf" });
    fireEvent.drop(workspace(), {
      dataTransfer: dragDataTransfer({
        files: [file],
        items: [
          { kind: "file", webkitGetAsEntry: () => ({ isDirectory: true, isFile: false }), getAsFile: () => null },
          { kind: "file", webkitGetAsEntry: () => ({ isDirectory: false, isFile: true }), getAsFile: () => file },
        ],
      }),
    });

    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(1));
    expect(screen.getByText("1 folders were skipped — folder upload is not supported yet.")).toBeInTheDocument();

    // Directory-only drop: nothing uploads, a concise localized message shows.
    const before = checksumFile.mock.calls.length;
    fireEvent.drop(workspace(), {
      dataTransfer: dragDataTransfer({
        files: [],
        items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true, isFile: false }), getAsFile: () => null }],
      }),
    });
    expect(checksumFile).toHaveBeenCalledTimes(before);
    expect(screen.getByText("1 folders were skipped — folder upload is not supported yet.")).toBeInTheDocument();
  });

  it("keeps the row action menu compact and exposes folder/file actions inside it", async () => {
    const user = userEvent.setup();
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const deleteFolder = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      deleteFile,
      deleteFolder,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    // Compact trigger only: no inline action buttons before expansion.
    expect(screen.queryByRole("button", { name: "Move file paper.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename folder Sources" })).not.toBeInTheDocument();

    const fileMenu = await openRowMenu("paper.pdf");
    expect(within(fileMenu).getByRole("menuitem", { name: "Preview" })).toBeInTheDocument();
    expect(within(fileMenu).getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
    expect(within(fileMenu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(fileMenu).getByRole("menuitem", { name: "Move" })).toBeInTheDocument();
    await user.click(within(fileMenu).getByRole("menuitem", { name: "Move to trash" }));
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith("file-1"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("stored file will be preserved"));

    const folderMenu = await openRowMenu("Sources");
    expect(within(folderMenu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(folderMenu).getByRole("menuitem", { name: "Move" })).toBeInTheDocument();
    await user.click(within(folderMenu).getByRole("menuitem", { name: "Move to trash" }));
    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith("folder-1"));
  });

  it("closes the row menu on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const trigger = screen.getByRole("button", { name: "Open actions for paper.pdf" });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "Actions for paper.pdf" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Actions for paper.pdf" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders the row menu without runtime inline positioning styles (production CSP)", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await openRowMenu("paper.pdf");
    const menu = screen.getByRole("menu", { name: "Actions for paper.pdf" });
    // Production CSP is style-src 'self' (no unsafe-inline): the menu must
    // never carry runtime inline style coordinates.
    expect(menu.getAttribute("style")).toBeNull();
  });

  it("restores focus to the original row trigger after Preview and Move modals close", async () => {
    const user = userEvent.setup();
    const createDownload = vi.fn().mockResolvedValue({
      method: "GET",
      url: "https://signed.invalid/preview",
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === null
        ? { folder: null, folders: [FOLDER], files: [FILE] }
        : { folder: FOLDER, folders: [], files: [] },
    ));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), createDownload, listEntries });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const trigger = await screen.findByRole("button", { name: "Open actions for paper.pdf" });
    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Preview" }));
    const preview = await screen.findByRole("dialog", { name: "paper.pdf" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(preview).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    const moveMenu = await openRowMenu("paper.pdf");
    await user.click(within(moveMenu).getByRole("menuitem", { name: "Move" }));
    const moveDialog = await screen.findByRole("dialog", { name: "Move “paper.pdf”" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(moveDialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes the open row menu when the viewport scrolls or resizes", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await openRowMenu("paper.pdf");
    expect(screen.getByRole("menu", { name: "Actions for paper.pdf" })).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu", { name: "Actions for paper.pdf" })).not.toBeInTheDocument();

    await openRowMenu("paper.pdf");
    expect(screen.getByRole("menu", { name: "Actions for paper.pdf" })).toBeInTheDocument();
    fireEvent.resize(window);
    expect(screen.queryByRole("menu", { name: "Actions for paper.pdf" })).not.toBeInTheDocument();
  });

  it("keeps inline preview conditional inside the file menu and restores focus after Escape", async () => {
    const user = userEvent.setup();
    const unsafeFile = { ...FILE, id: "file-svg", displayName: "diagram.svg", mediaType: "image/svg+xml" };
    const createDownload = vi.fn().mockResolvedValue({
      method: "GET",
      url: "https://signed.invalid/preview",
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE, unsafeFile] }),
      createDownload,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Preview" }));

    const dialog = await screen.findByRole("dialog", { name: "paper.pdf" });
    expect(createDownload).toHaveBeenCalledWith("file-1", "inline");
    expect(within(dialog).getByTitle("Preview of paper.pdf")).toHaveAttribute("referrerpolicy", "no-referrer");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    const unsafeMenu = await openRowMenu("diagram.svg");
    expect(within(unsafeMenu).queryByRole("menuitem", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("moves a file through the browsable destination dialog from the row menu", async () => {
    const user = userEvent.setup();
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === null
        ? { folder: null, folders: [FOLDER], files: [FILE] }
        : { folder: FOLDER, folders: [], files: [] },
    ));
    const updateFile = vi.fn().mockResolvedValue({ ...FILE, folderId: FOLDER.id });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries, updateFile });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Move" }));

    const dialog = await screen.findByRole("dialog", { name: "Move “paper.pdf”" });
    await user.click(within(dialog).getByRole("button", { name: "Sources" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-1", expect.anything()));
    await user.click(within(dialog).getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(updateFile).toHaveBeenCalledWith("file-1", { folderId: "folder-1" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Move “paper.pdf”" })).not.toBeInTheDocument());
  });

  it("calculates, uploads, and verifies a selected file without proxying its bytes", async () => {
    const user = userEvent.setup();
    const pendingFile = { ...FILE, state: "pending_upload" as const, activatedAt: null };
    const createUpload = vi.fn().mockResolvedValue({
      file: pendingFile,
      upload: {
        method: "POST" as const,
        url: "https://storage.invalid",
        fields: { key: "objects/opaque", policy: "signed" },
        expiresAt: "2026-08-13T00:05:00.000Z",
      },
    });
    const completeUpload = vi.fn().mockResolvedValue(FILE);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload,
      completeUpload,
    });
    const checksumFile = vi.fn().mockResolvedValue("YWNhZGVtaWNjbG91ZA==");
    const directUpload = vi.fn().mockResolvedValue(undefined);
    render(<App api={api} checksumFile={checksumFile} directUpload={directUpload} />);

    const file = new File(["source"], "paper.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Upload files"), file);

    await waitFor(() => expect(completeUpload).toHaveBeenCalledWith("file-1"));
    expect(createUpload).toHaveBeenCalledWith({
      folderId: null,
      displayName: "paper.pdf",
      mediaType: "application/pdf",
      sizeBytes: 6,
      checksum: { algorithm: "md5", value: "YWNhZGVtaWNjbG91ZA==" },
    });
    expect(directUpload).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://storage.invalid" }),
      file,
      expect.objectContaining({ signal: expect.anything(), onProgress: expect.any(Function) }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded");
  });

  it("keeps move failures visible inside the destination dialog", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      updateFile: vi.fn().mockRejectedValue(new ApiError(409, "name_conflict")),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “paper.pdf”" });
    await user.click(within(dialog).getByRole("button", { name: "Sources" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Move here" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Move here" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already exists");
    expect(dialog).toBeInTheDocument();
  });

  it("verifies an ambiguous direct-upload failure before attempting to overwrite", async () => {
    const user = userEvent.setup();
    const pendingFile = { ...FILE, state: "pending_upload" as const, activatedAt: null };
    const completeUpload = vi.fn().mockResolvedValue(FILE);
    const renewUpload = vi.fn();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({
        file: pendingFile,
        upload: { method: "POST", url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
      }),
      completeUpload,
      renewUpload,
    });
    const directUpload = vi.fn().mockRejectedValue(new DirectUploadError("upload_unreachable", "Could not reach object storage."));
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directUpload={directUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), new File(["source"], "paper.pdf", { type: "application/pdf" }));
    const retry = await screen.findByRole("button", { name: "Verify stored copy or retry paper.pdf" });
    await user.click(retry);

    await waitFor(() => expect(completeUpload).toHaveBeenCalledWith("file-1"));
    expect(renewUpload).not.toHaveBeenCalled();
    expect(directUpload).toHaveBeenCalledOnce();
  });

  it("restores and permanently deletes recycle items through labeled controls", async () => {
    const user = userEvent.setup();
    const deleted = { ...FILE, state: "deleted" as const, deletedAt: "2026-08-13T00:00:00.000Z" };
    const restoreFile = vi.fn().mockResolvedValue(FILE);
    const permanentlyDeleteFile = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [deleted] }),
      restoreFile,
      permanentlyDeleteFile,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Recycle bin" }));
    await user.click(await screen.findByRole("button", { name: "Restore file paper.pdf" }));
    await waitFor(() => expect(restoreFile).toHaveBeenCalledWith("file-1"));
    await user.click(screen.getByRole("button", { name: "Delete paper.pdf forever" }));
    await waitFor(() => expect(permanentlyDeleteFile).toHaveBeenCalledWith("file-1"));
  });

  it("signs out and returns to the login gate", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), logout });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });

  it("switches language immediately, persists the choice, and updates document.lang", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "资料库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(window.localStorage.getItem("academiccloud.language")).toBe("zh-CN");

    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("localizes the new workspace strings in both languages", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);

    expect(await screen.findByText("1 files · 0 folders")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New folder" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByText("1 个文件 · 0 个文件夹")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建文件夹" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 paper.pdf 的操作菜单" })).toBeInTheDocument();

    const main = workspace();
    fireEvent.dragEnter(main, { dataTransfer: dragDataTransfer({ files: [new File(["a"], "a.pdf")] }) });
    expect(screen.getByText(/松开即可上传到「资料库」/)).toBeInTheDocument();
    fireEvent.dragLeave(main, { dataTransfer: dragDataTransfer({ files: [new File(["a"], "a.pdf")] }) });
  });

  it("re-localizes rendered API errors when the language changes", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ login: vi.fn().mockRejectedValue(new ApiError(401, "invalid_credentials")) });
    render(<App api={api} />);

    await user.type(await screen.findByLabelText("Login name"), "Scholar");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("incorrect"));

    await user.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("登录名或密码不正确"));
  });

  it("shows the localized fail-safe message when inline preview is unavailable", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      createDownload: vi.fn().mockRejectedValue(new ApiError(503, "preview_unavailable")),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Preview" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Online preview is currently unavailable"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("在线预览暂不可用"));
  });

  it("presents transport failures through the localized catalog in the queue", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({
        file: { ...FILE, state: "pending_upload" as const, activatedAt: null },
        upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
      }),
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockRejectedValue(new DirectUploadError("upload_unreachable", "Could not reach object storage."))} />);

    await screen.findByRole("heading", { name: "Library" });
    await user.click(screen.getByRole("button", { name: "中文" }));
    await screen.findByRole("heading", { name: "资料库" });
    await user.upload(await screen.findByLabelText("上传文件"), new File(["x"], "a.pdf", { type: "application/pdf" }));
    checksumResolvers[0]!(FILE.checksum);

    await waitFor(() => expect(screen.getByText("无法连接到对象存储，请检查网络后重试。")).toBeInTheDocument());
    expect(screen.queryByText(/Could not reach object storage/)).not.toBeInTheDocument();
  });

  it("renders the favorites nav bilingually and shows the empty favorites state", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByRole("heading", { name: "Favorites", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("No favorites yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "收藏", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("还没有收藏")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏" })).toBeInTheDocument();
  });

  it("star toggles favorite and unfavorite a file through the API and reconciles", async () => {
    const user = userEvent.setup();
    const listFavorites = vi.fn()
      .mockResolvedValueOnce({ files: [], folders: [] })
      .mockResolvedValueOnce({ files: [FILE], folders: [] })
      .mockResolvedValueOnce({ files: [], folders: [] });
    const setFileFavorite = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      listFavorites,
      setFileFavorite,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const star = await screen.findByRole("button", { name: "Add paper.pdf to favorites" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    await waitFor(() => expect(setFileFavorite).toHaveBeenCalledWith("file-1", true));
    // Reconciliation: the next server truth says favorited.
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove paper.pdf from favorites" })).toHaveAttribute("aria-pressed", "true"));

    await user.click(screen.getByRole("button", { name: "Remove paper.pdf from favorites" }));
    await waitFor(() => expect(setFileFavorite).toHaveBeenCalledWith("file-1", false));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add paper.pdf to favorites" })).toBeInTheDocument());
    expect(listFavorites).toHaveBeenCalledTimes(3);
  });

  it("star toggles folder favorites through the API", async () => {
    const user = userEvent.setup();
    const setFolderFavorite = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [] }),
      listFavorites: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      setFolderFavorite,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const star = await screen.findByRole("button", { name: "Add Sources to favorites" });
    await user.click(star);
    await waitFor(() => expect(setFolderFavorite).toHaveBeenCalledWith("folder-1", true));
  });

  it("favorites catalogue lists entries and opens the real folder with its ancestors", async () => {
    const user = userEvent.setup();
    const parent = { ...FOLDER, id: "folder-parent", name: "Parent" };
    const child = { ...FOLDER, id: "folder-child", name: "Child", parentId: "folder-parent" };
    const favoriteFolder = { ...child, ancestors: [parent] };
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === "folder-child"
        ? { folder: child, folders: [], files: [] }
        : { folder: null, folders: [parent], files: [] },
    ));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries,
      listFavorites: vi.fn().mockResolvedValue({ files: [FILE], folders: [favoriteFolder] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 files · 1 folders")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Child" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-child", expect.anything()));
    expect(screen.getByRole("heading", { name: "Child", level: 1 })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(within(crumbs).getByRole("button", { name: "Parent" })).toBeInTheDocument();
    expect(within(crumbs).getByRole("button", { name: "Child" })).toBeInTheDocument();
  });

  it("favorites view shows a loading state and never renders fake items before server data", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listFavorites: vi.fn(() => new Promise<never>(() => {})),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/files ·/)).not.toBeInTheDocument();
  });

  it("keeps favorite state server-backed with no localStorage persistence", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(await screen.findByRole("button", { name: "Add paper.pdf to favorites" }));
    expect(window.localStorage.getItem("academiccloud.favorites")).toBeNull();
  });

  it("prevents external file drops in Favorites/Pending/Recycle workspaces without enqueueing", async () => {
    const user = userEvent.setup();
    const checksumFile = vi.fn(() => new Promise<string>(() => {}));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} />);
    await screen.findByRole("heading", { name: "Library" });
    const fileDrag = dragDataTransfer({ files: [new File(["a"], "a.pdf")], items: [{ kind: "file", getAsFile: () => new File(["a"], "a.pdf") }] });

    for (const viewName of ["Favorites", "Pending uploads", "Recycle bin"]) {
      await user.click(screen.getByRole("button", { name: viewName }));
      const before = checksumFile.mock.calls.length;
      const dropEvent = fireEvent.drop(workspace(), { dataTransfer: fileDrag });
      expect(dropEvent).toBe(false); // default prevented: no browser navigation
      expect(checksumFile).toHaveBeenCalledTimes(before); // nothing enqueued
      expect(screen.getAllByText("Drop files into the Library workspace to upload them.").length).toBeGreaterThan(0);
      await user.click(screen.getByRole("button", { name: "Library" }));
    }
  });

  it("entering Favorites never calls listRecycle and still loads listFavorites", async () => {
    const user = userEvent.setup();
    const listRecycle = vi.fn().mockResolvedValue({ folders: [], files: [] });
    const listFavorites = vi.fn().mockResolvedValue({ files: [], folders: [] });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle,
      listFavorites,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    expect(listRecycle).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("No favorites yet")).toBeInTheDocument();
    expect(listFavorites).toHaveBeenCalled();
    expect(listRecycle).not.toHaveBeenCalled();
  });

  it("recycle failure cannot surface as an error while Favorites data succeeds", async () => {
    const user = userEvent.setup();
    const listRecycle = vi.fn().mockRejectedValue(new ApiError(503, "storage_unavailable"));
    const listFavorites = vi.fn().mockResolvedValue({ files: [FILE], folders: [] });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle,
      listFavorites,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Recycle bin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Object storage is temporarily unavailable");

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(listFavorites).toHaveBeenCalled();
    expect(listRecycle).toHaveBeenCalledTimes(1);
  });

  it("entering Recycle still calls listRecycle", async () => {
    const user = userEvent.setup();
    const listRecycle = vi.fn().mockResolvedValue({ folders: [], files: [] });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listRecycle });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Recycle bin" }));
    await waitFor(() => expect(listRecycle).toHaveBeenCalled());
    expect(screen.getByText("The recycle bin is empty")).toBeInTheDocument();
  });

  it("limits concurrent upload workflows to two and starts queued work as slots free", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    const completeUpload = vi.fn().mockResolvedValue(FILE);
    const createUpload = vi.fn().mockResolvedValue({
      file: { ...FILE, state: "pending_upload" as const, activatedAt: null },
      upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload,
      completeUpload,
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockResolvedValue(undefined)} />);

    const files = ["a", "b", "c", "d"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    await user.upload(await screen.findByLabelText("Upload files"), files);

    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Calculating checksum")).toHaveLength(2);
    expect(screen.getAllByText("Queued")).toHaveLength(2);

    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
    checksumResolvers[1]!(FILE.checksum);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(4));
    checksumResolvers[2]!(FILE.checksum);
    checksumResolvers[3]!(FILE.checksum);
    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(4));

    expect(createUpload).toHaveBeenCalledTimes(4);
    for (const [input] of createUpload.mock.calls) {
      expect((input as { folderId: string | null }).folderId).toBeNull();
    }
  });

  it("pins the picker upload destination at enqueue time even after navigation", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    const folderA = { ...FOLDER, id: "folder-a", name: "A" };
    const folderB = { ...FOLDER, id: "folder-b", name: "B" };
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === "folder-a"
        ? { folder: folderA, folders: [], files: [] }
        : folderId === "folder-b"
          ? { folder: folderB, folders: [], files: [] }
          : { folder: null, folders: [folderA, folderB], files: [] },
    ));
    const createUpload = vi.fn().mockResolvedValue({
      file: { ...FILE, state: "pending_upload" as const, activatedAt: null },
      upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries,
      createUpload,
      completeUpload: vi.fn().mockResolvedValue(FILE),
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockResolvedValue(undefined)} />);

    await user.click(await screen.findByRole("button", { name: "A" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-a", expect.anything()));
    const files = ["x", "y", "z"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    await user.upload(await screen.findByLabelText("Upload files"), files);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));

    await user.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Library" }));
    await user.click(await screen.findByRole("button", { name: "B" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-b", expect.anything()));

    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
    checksumResolvers[1]!(FILE.checksum);
    checksumResolvers[2]!(FILE.checksum);
    await waitFor(() => expect(createUpload).toHaveBeenCalledTimes(3));

    const destinations = createUpload.mock.calls.map(([input]) => (input as { folderId: string | null }).folderId);
    expect(destinations).toEqual(["folder-a", "folder-a", "folder-a"]);
    expect(destinations).not.toContain("folder-b");
  });

  it("releases a slot when a workflow fails", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockRejectedValue(new ApiError(409, "name_conflict")),
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockResolvedValue(undefined)} />);

    const files = ["a", "b", "c"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    await user.upload(await screen.findByLabelText("Upload files"), files);

    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));
    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
  });

  it("cancelling a running upload releases its slot for the next queued file", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn((_file: Blob, options?: { signal?: AbortSignal }) =>
      new Promise<string>((resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        checksumResolvers.push(resolve);
      }),
    );
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockResolvedValue(undefined)} />);

    const files = ["a", "b", "c"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    await user.upload(await screen.findByLabelText("Upload files"), files);

    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Cancel c.pdf upload" }));

    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "Dismiss c.pdf upload status" })).toBeInTheDocument();
  });

  it("queues retries behind the concurrency bound and starts them when a slot frees", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    const createUpload = vi.fn((input: { displayName: string }) => Promise.resolve({
      file: { ...FILE, id: `file-${input.displayName}`, state: "pending_upload" as const, activatedAt: null },
      upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
    }));
    const directUpload = vi.fn((_authorization: unknown, file: File) =>
      file.name === "c.pdf" ? Promise.reject(new DirectUploadError("upload_unreachable", "Could not reach object storage.")) : Promise.resolve(undefined),
    );
    const completeUpload = vi.fn((fileId: string) =>
      fileId === "file-c.pdf"
        ? Promise.reject(new ApiError(409, "upload_incomplete"))
        : Promise.resolve(FILE),
    );
    const renewUpload = vi.fn().mockResolvedValue({
      method: "POST" as const,
      url: "https://storage.invalid",
      fields: {},
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload,
      completeUpload,
      renewUpload,
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={directUpload} />);

    const files = ["a", "b", "c"].map((name) => new File([name], `${name}.pdf`, { type: "application/pdf" }));
    await user.upload(await screen.findByLabelText("Upload files"), files);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(2));

    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText("Needs attention")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Verify stored copy or retry c.pdf" }));
    expect(screen.getAllByText("Queued")).toHaveLength(1);
    expect(completeUpload).not.toHaveBeenCalled();
    expect(renewUpload).not.toHaveBeenCalled();
    expect(checksumFile).toHaveBeenCalledTimes(3);

    checksumResolvers[1]!(FILE.checksum);
    await waitFor(() => expect(completeUpload).toHaveBeenCalledWith("file-c.pdf"));
    await waitFor(() => expect(renewUpload).toHaveBeenCalledWith("file-c.pdf"));
  });

  it("renders the same transfer metrics when a retry re-uploads bytes", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    let directUploadCalls = 0;
    let resolveRetryUpload: (() => void) | undefined;
    const directUpload = vi.fn((_authorization: unknown, _file: File, options?: { onMetrics?: (metrics: UploadProgressMetrics) => void }) => {
      directUploadCalls += 1;
      if (directUploadCalls === 1) {
        return Promise.reject(new DirectUploadError("upload_unreachable", "Could not reach object storage."));
      }
      options?.onMetrics?.({ loaded: 500, total: 1_000 });
      return new Promise<void>((resolve) => {
        resolveRetryUpload = resolve;
      });
    });
    let completeCalls = 0;
    const completeUpload = vi.fn(() => {
      completeCalls += 1;
      return completeCalls === 1
        ? Promise.reject(new ApiError(409, "upload_incomplete"))
        : Promise.resolve(FILE);
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({
        file: { ...FILE, id: "file-a", state: "pending_upload" as const, activatedAt: null },
        upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
      }),
      renewUpload: vi.fn().mockResolvedValue({
        method: "POST" as const,
        url: "https://storage.invalid",
        fields: {},
        expiresAt: "2026-08-13T00:05:00.000Z",
      }),
      completeUpload,
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={directUpload} />);

    const file = new File(["source"], "a.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Upload files"), file);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(1));
    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(screen.getByText("Needs attention")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Verify stored copy or retry a.pdf" }));
    await waitFor(() => expect(directUpload).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(/3 B \/ 6 B/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0.525");

    resolveRetryUpload!();
    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(2));
  });

  it("claims an active scheduler slot for uploaded=true retries before completeUpload is pending", async () => {
    const user = userEvent.setup();
    const checksumResolvers: Array<(value: string) => void> = [];
    const checksumFile = vi.fn(() => new Promise<string>((resolve) => checksumResolvers.push(resolve)));
    let settleRetryComplete: (() => void) | undefined;
    let completeCalls = 0;
    const completeUpload = vi.fn(() => {
      completeCalls += 1;
      if (completeCalls === 1) {
        return Promise.reject(new ApiError(409, "invalid_state"));
      }
      return new Promise<FileEntry>((resolve) => {
        settleRetryComplete = () => resolve(FILE);
      });
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({
        file: { ...FILE, id: "file-a", state: "pending_upload" as const, activatedAt: null },
        upload: { method: "POST" as const, url: "https://storage.invalid", fields: {}, expiresAt: "2026-08-13T00:05:00.000Z" },
      }),
      completeUpload,
    });
    render(<App api={api} checksumFile={checksumFile} directUpload={vi.fn().mockResolvedValue(undefined)} />);

    const file = new File(["source"], "a.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Upload files"), file);
    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(1));
    checksumResolvers[0]!(FILE.checksum);
    await waitFor(() => expect(screen.getByText("Needs attention")).toBeInTheDocument());
    expect(completeUpload).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Verify stored copy or retry a.pdf" }));
    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(2));

    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    expect(screen.getByText("Verifying stored file")).toBeInTheDocument();
    expect(screen.getByText("1 in progress or needing attention")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pending uploads" }));
    await user.click(within(screen.getByRole("complementary", { name: "Primary navigation" })).getByRole("button", { name: "Library" }));
    expect(completeUpload).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Verifying stored file")).toBeInTheDocument();

    settleRetryComplete!();
    await waitFor(() => expect(screen.queryByText("Verifying stored file")).not.toBeInTheDocument());
    expect(completeUpload).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded");
  });
});
