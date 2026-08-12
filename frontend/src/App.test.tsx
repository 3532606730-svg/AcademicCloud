import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App.tsx";
import {
  ApiError,
  type AcademicCloudApi,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
} from "./api.ts";

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

  it("navigates folders and returns through the breadcrumb", async () => {
    const user = userEvent.setup();
    const listEntries = vi.fn()
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] })
      .mockResolvedValueOnce({ folder: FOLDER, folders: [], files: [] })
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Sources" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-1", expect.anything()));
    expect(await screen.findByRole("heading", { name: "Sources", level: 1 })).toBeInTheDocument();

    await user.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(listEntries).toHaveBeenLastCalledWith(null, expect.anything()));
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

  it("confirms recoverable deletion before calling the file API", async () => {
    const user = userEvent.setup();
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      deleteFile,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Recycle file paper.pdf" }));
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith("file-1"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("stored file will be preserved"));
  });

  it("moves a file through the browsable destination dialog", async () => {
    const user = userEvent.setup();
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === null
        ? { folder: null, folders: [FOLDER], files: [FILE] }
        : { folder: FOLDER, folders: [], files: [] },
    ));
    const updateFile = vi.fn().mockResolvedValue({ ...FILE, folderId: FOLDER.id });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries, updateFile });
    render(<App api={api} />);

    const fileRow = (await screen.findByText("paper.pdf")).closest<HTMLElement>("[role='row']");
    expect(fileRow).not.toBeNull();
    await user.click(within(fileRow!).getByRole("button", { name: "Move file paper.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “paper.pdf”" });
    await user.click(within(dialog).getByRole("button", { name: "Sources" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith("folder-1", expect.anything()));
    await user.click(within(dialog).getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(updateFile).toHaveBeenCalledWith("file-1", { folderId: "folder-1" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Move “paper.pdf”" })).not.toBeInTheDocument());
  });

  it("keeps move failures visible inside the destination dialog", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      updateFile: vi.fn().mockRejectedValue(new ApiError(409, "name_conflict")),
    });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Move file paper.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “paper.pdf”" });
    await user.click(within(dialog).getByRole("button", { name: "Sources" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Move here" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Move here" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already exists");
    expect(dialog).toBeInTheDocument();
  });

  it("requests inline preview only for safe media and restores focus after Escape", async () => {
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

    const trigger = await screen.findByRole("button", { name: "Preview paper.pdf" });
    expect(screen.queryByRole("button", { name: "Preview diagram.svg" })).not.toBeInTheDocument();
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "paper.pdf" });
    expect(createDownload).toHaveBeenCalledWith("file-1", "inline");
    expect(within(dialog).getByTitle("Preview of paper.pdf")).toHaveAttribute("referrerpolicy", "no-referrer");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
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
    const directUpload = vi.fn().mockRejectedValue(new Error("Could not reach object storage."));
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
});
