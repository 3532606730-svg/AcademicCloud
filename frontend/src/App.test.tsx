import { MockPdfReader, pdfReaderControl } from "./pdf-reader-test-double.tsx";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App, ScholarlyRecordsDialog } from "./App.tsx";
import {
  ApiError,
  type AcademicCloudApi,
  type BulkOperationInput,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
  type Invitation,
  type LibraryHolding,
  type MultipartTransfer,
  type ScholarlyRecord,
} from "./api.ts";
import type { UploadProgressMetrics } from "./direct-upload.ts";
import { DirectUploadError } from "./direct-upload.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import type { WorkspaceApi } from "./workspace-api.ts";

const ACTIVITY_PREFERENCE_KEY = "academiccloud.activity-center.expanded.v1:account-1";

vi.mock("./pdf-reader.tsx", () => ({ PdfReader: MockPdfReader }));

beforeEach(() => {
  pdfReaderControl.autoRender = true; pdfReaderControl.mounts = 0;
  // Most legacy interaction tests exercise controls inside the Activity Center.
  // Give those tests an explicit saved preference; focused tests below verify
  // the product's collapsed first-use state and preference persistence.
  window.localStorage.setItem(ACTIVITY_PREFERENCE_KEY, "1");
});

afterEach(async () => {
  cleanup();
  // jsdom queues history traversal and popstate separately. Finish a closed
  // dialog's pending Back before resetting the next test's browser entry.
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  window.localStorage.removeItem("academiccloud.language");
  window.localStorage.removeItem(ACTIVITY_PREFERENCE_KEY);
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  document.documentElement.lang = "";
  delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
});

const EMPTY_ENTRIES: EntriesResponse = { folder: null, folders: [], files: [] };
const ACCOUNT = { id: "account-1", loginName: "Scholar", role: "owner" as const };
const DEFAULT_LIBRARY = {
  id: "default-library",
  name: "Canonical corpus",
  role: "manager" as const,
  isDefault: true,
  createdAt: "2026-08-18T00:00:00.000Z",
};
const FOLDER: FolderEntry = {
  id: "folder-1",
  parentId: null,
  name: "Sources",
  state: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
  deletedAt: null,
  version: "f".repeat(43),
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
  version: "g".repeat(43),
};

const PENDING_MULTIPART_FILE: FileEntry = {
  ...FILE,
  id: "multipart-file-1",
  displayName: "resumable.pdf",
  state: "pending_upload",
  activatedAt: null,
  uploadKind: "multipart",
};

function multipartTransfer(
  overrides: Partial<MultipartTransfer> = {},
  file: FileEntry = PENDING_MULTIPART_FILE,
): MultipartTransfer {
  return {
    kind: "multipart",
    file,
    state: "uploading",
    version: "m".repeat(43),
    partSizeBytes: 3,
    totalParts: 2,
    completedParts: [],
    completedBytes: 0,
    expiresAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

const LIBRARY_HOLDINGS: LibraryHolding[] = ([
  ["book.pdf", "application/pdf"],
  ["scan.png", "image/png"],
  ["notes.txt", "text/plain"],
  ["archive.bin", "application/octet-stream"],
 ] as const).map(([displayName, mediaType], index): LibraryHolding => ({
  recordId: `record-${index}`,
  recordLabel: displayName,
  canonicalTitle: null,
  authorLabels: [],
  artifactId: `artifact-${index}`,
  versionId: `version-${index}`,
  version: `${String.fromCharCode(118 + index)}`.repeat(43),
  file: {
    id: `library-file-${index}`,
    displayName,
    mediaType,
    sizeBytes: 12 + index,
    updatedAt: `2026-08-18T00:0${index}:00.000Z`,
  },
}));

function fakeApi(overrides: Partial<AcademicCloudApi> = {}): AcademicCloudApi {
  return {
    getSession: vi.fn().mockRejectedValue(new ApiError(401, "authentication_required")),
    login: vi.fn().mockResolvedValue(ACCOUNT),
    registerMember: vi.fn(),
    redeemCredentialReset: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    createInvitation: vi.fn(),
    listInvitations: vi.fn().mockResolvedValue([]),
    revokeInvitation: vi.fn(),
    listAccounts: vi.fn().mockResolvedValue([{ ...ACCOUNT, state: "active", createdAt: "2026-08-17T00:00:00.000Z" }]),
    setAccountState: vi.fn(),
    issueCredentialReset: vi.fn(),
    listAnnouncements: vi.fn().mockResolvedValue([]),
    listAllAnnouncements: vi.fn().mockResolvedValue([]),
    createAnnouncement: vi.fn(),
    updateAnnouncement: vi.fn(),
    publishAnnouncement: vi.fn(),
    unpublishAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn().mockResolvedValue(undefined),
    listAuditEvents: vi.fn().mockResolvedValue({ events: [], nextBeforeId: null, retentionPolicy: "latest_20000_events" as const }),
    listEntries: vi.fn().mockResolvedValue(EMPTY_ENTRIES),
    listPending: vi.fn().mockResolvedValue([]),
    listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [] }),
    listFavorites: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    bulkOperation: vi.fn().mockImplementation(async (input: BulkOperationInput) => ({
      action: input.action,
      atomic: true as const,
      items: input.items.map((selected) => ({ ...selected, outcome: "succeeded" as const })),
    })),
    listScholarlyRecords: vi.fn().mockResolvedValue({ records: [], nextBeforeId: null }),
    getScholarlyRecord: vi.fn(),
    createScholarlyRecord: vi.fn(),
    attachFileToScholarlyRecord: vi.fn(),
    detachScholarlyArtifact: vi.fn(),
    listLibraries: vi.fn().mockResolvedValue([DEFAULT_LIBRARY]),
    listLibraryMembers: vi.fn().mockResolvedValue([]),
    addLibraryMember: vi.fn(),
    changeLibraryMemberRole: vi.fn(),
    removeLibraryMember: vi.fn().mockResolvedValue(undefined),
    listLibraryHoldings: vi.fn().mockResolvedValue([]),
    searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getLibraryHoldingDetails: vi.fn(),
    updateLibraryHoldingMetadata: vi.fn(),
    listLibraryAuthorities: vi.fn().mockResolvedValue([]),
    createLibraryAuthority: vi.fn(),
    createLibraryDownload: vi.fn(),
    recycleLibraryHolding: vi.fn().mockResolvedValue(undefined),
    listLibraryRecycle: vi.fn().mockResolvedValue([]),
    restoreLibraryHolding: vi.fn().mockResolvedValue(undefined),
    submitLibraryContribution: vi.fn(),
    listLibraryContributions: vi.fn().mockResolvedValue([]),
    listMyLibraryContributions: vi.fn().mockResolvedValue([]),
    reviewLibraryContribution: vi.fn(),
    withdrawLibraryContribution: vi.fn(),
    createContributionDownload: vi.fn(),
    setFileFavorite: vi.fn().mockResolvedValue(undefined),
    setFolderFavorite: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    permanentlyDeleteFolder: vi.fn().mockResolvedValue(undefined),
    restoreFolder: vi.fn(),
    createUpload: vi.fn(),
    renewUpload: vi.fn(),
    completeUpload: vi.fn(),
    createDownload: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
    restoreFile: vi.fn(),
    permanentlyDeleteFile: vi.fn(),
    permanentlyDeleteLibraryHolding: vi.fn().mockResolvedValue(undefined),
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

function storageContains(storage: Storage, value: string): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && storage.getItem(key)?.includes(value)) return true;
  }
  return false;
}

async function openRowMenu(name: string) {
  const trigger = await screen.findByRole("button", { name: `Open actions for ${name}` });
  await userEvent.click(trigger);
  return screen.getByRole("menu", { name: `Actions for ${name}` });
}

async function openOwnerAdministration(section: "Member management" | "Contribution review" | "Announcements" | "Activity log" = "Member management") {
  await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
  await userEvent.click(within(screen.getByRole("menu", { name: "Account" })).getByRole("menuitem", { name: "Administration" }));
  const dialog = await screen.findByRole("dialog", { name: "Administration" });
  if (section !== "Member management") {
    await userEvent.click(within(dialog).getByRole("button", { name: section }));
  }
  return dialog;
}

describe("App", () => {
  it("recovers an anonymous session, signs in, and renders an empty library", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ listLibraries: vi.fn().mockResolvedValue([]) });
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "AC AcademicCloud" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Login name"), "Scholar");
    await user.type(screen.getByLabelText("Password"), "valid-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(await screen.findByText("Library is unavailable")).toBeInTheDocument();
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

  it("registers from an invitation fragment without retaining the raw token in the URL or browser storage", async () => {
    const user = userEvent.setup();
    const rawToken = "A".repeat(43);
    const registerMember = vi.fn().mockResolvedValue({
      id: "member-1",
      loginName: "Reader",
      role: "member",
      state: "active",
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    window.history.replaceState(null, "", `/#/invite/${rawToken}`);
    const api = fakeApi({ registerMember });

    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: /Create account/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(storageContains(window.localStorage, rawToken)).toBe(false);
    expect(storageContains(window.sessionStorage, rawToken)).toBe(false);
    await user.type(screen.getByLabelText("Login name"), "Reader");
    await user.type(screen.getByLabelText("Password"), "member-password-123");
    await user.type(screen.getByLabelText("Confirm password"), "member-password-123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerMember).toHaveBeenCalledWith(rawToken, "Reader", "member-password-123"));
    expect(await screen.findByRole("heading", { name: "AC AcademicCloud" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(rawToken);
    expect(storageContains(window.localStorage, rawToken)).toBe(false);
    expect(storageContains(window.sessionStorage, rawToken)).toBe(false);
  });

  it("lets the Owner create and revoke invitations and disable a Member without adding a navigation destination", async () => {
    const user = userEvent.setup();
    const rawToken = "B".repeat(43);
    const owner = { ...ACCOUNT, state: "active" as const, createdAt: "2026-08-17T00:00:00.000Z" };
    const member = { id: "member-1", loginName: "Reader", role: "member" as const, state: "active" as const, createdAt: "2026-08-17T00:00:00.000Z" };
    const invitation = {
      id: "invite-1",
      createdByAccountId: ACCOUNT.id,
      createdAt: "2026-08-17T00:00:00.000Z",
      expiresAt: "2026-08-24T00:00:00.000Z",
      consumedAt: null,
      consumedByAccountId: null,
      revokedAt: null,
      status: "available" as const,
    };
    const createInvitation = vi.fn().mockResolvedValue({ invitation, rawToken });
    const revokeInvitation = vi.fn().mockResolvedValue({ ...invitation, revokedAt: "2026-08-17T01:00:00.000Z", status: "revoked" as const });
    const setAccountState = vi.fn().mockResolvedValue({ ...member, state: "disabled" as const });
    const issueCredentialReset = vi.fn().mockResolvedValue({
      reset: { id: "reset-1", accountId: member.id, createdAt: "2026-08-17T00:00:00.000Z", expiresAt: "2026-08-17T00:30:00.000Z" },
      rawToken: "R".repeat(43),
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listAccounts: vi.fn().mockResolvedValue([owner, member]),
      listInvitations: vi.fn().mockResolvedValue([invitation]),
      createInvitation,
      revokeInvitation,
      setAccountState,
      issueCredentialReset,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    expect(within(screen.getByRole("complementary", { name: "Primary navigation" })).getAllByRole("button")).toHaveLength(4);
    const dialog = await openOwnerAdministration();
    for (const section of ["Member management", "Contribution review", "Announcements", "Activity log"]) {
      expect(within(dialog).getByRole("button", { name: section })).toBeInTheDocument();
    }
    expect(await within(dialog).findByText("Reader")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create invitation" }));
    const link = await within(dialog).findByLabelText("One-time invitation link");
    expect(link).toHaveValue(`${window.location.origin}/#/invite/${rawToken}`);
    expect(storageContains(window.localStorage, rawToken)).toBe(false);
    expect(storageContains(window.sessionStorage, rawToken)).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Issue reset link" }));
    await waitFor(() => expect(issueCredentialReset).toHaveBeenCalledWith("member-1"));
    expect(await within(dialog).findByLabelText("One-time password reset link for Reader")).toHaveValue(
      `${window.location.origin}/#/reset/${"R".repeat(43)}`,
    );

    await user.click(within(dialog).getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(setAccountState).toHaveBeenCalledWith("member-1", "disabled"));
    expect(await within(dialog).findByRole("button", { name: "Enable" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith("invite-1"));
    expect(await within(dialog).findByText("Revoked")).toBeInTheDocument();
  });

  it("does not expose account administration to Members", async () => {
    const user = userEvent.setup();
    const memberAccount = { ...ACCOUNT, role: "member" as const };
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(memberAccount) });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    expect(screen.queryByRole("button", { name: "Administration" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const menu = within(screen.getByRole("menu", { name: "Account" }));
    expect(menu.queryByRole("menuitem", { name: "Administration" })).not.toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: "Change password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shared Library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scholarly records" })).not.toBeInTheDocument();
    expect(screen.getByText("Upload resources")).toBeInTheDocument();
  });

  it("keeps usable invitations prominent and collapses durable invitation history with a count", async () => {
    const user = userEvent.setup();
    const baseInvitation = {
      createdByAccountId: ACCOUNT.id,
      createdAt: "2026-08-17T00:00:00.000Z",
      expiresAt: "2026-08-24T00:00:00.000Z",
      consumedAt: null,
      consumedByAccountId: null,
      revokedAt: null,
    };
    const invitations: Invitation[] = [
      { ...baseInvitation, id: "available", status: "available" },
      { ...baseInvitation, id: "used", status: "consumed", consumedAt: "2026-08-18T00:00:00.000Z", consumedByAccountId: "member-1" },
      { ...baseInvitation, id: "revoked", status: "revoked", revokedAt: "2026-08-18T00:00:00.000Z" },
      { ...baseInvitation, id: "expired", status: "expired" },
    ];
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listInvitations: vi.fn().mockResolvedValue(invitations),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const dialog = await openOwnerAdministration();

    expect(await within(dialog).findByText("Available")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
    const summary = within(dialog).getByText("Invitation history (3)");
    const history = summary.closest("details") as HTMLDetailsElement;
    expect(history.open).toBe(false);
    await user.click(summary);
    expect(history.open).toBe(true);
    expect(within(history).getByText("Used")).toBeInTheDocument();
    expect(within(history).getByText("Revoked")).toBeInTheDocument();
    expect(within(history).getByText("Expired")).toBeInTheDocument();
    expect(within(history).queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("hides archived Members by default and makes archive/unarchive a disabled-only Owner workflow", async () => {
    const user = userEvent.setup();
    const owner = { ...ACCOUNT, state: "active" as const, createdAt: "2026-08-17T00:00:00.000Z" };
    const disabled = { id: "member-disabled", loginName: "Former Reader", role: "member" as const, state: "disabled" as const, createdAt: "2026-08-17T00:00:00.000Z" };
    const archived = { id: "member-archived", loginName: "Archived Reader", role: "member" as const, state: "archived" as const, createdAt: "2026-08-17T00:00:00.000Z" };
    const listAccounts = vi.fn((includeArchived = false) => Promise.resolve(includeArchived ? [owner, archived] : [owner, disabled]));
    const setAccountState = vi.fn((accountId: string, state: "active" | "disabled" | "archived") => Promise.resolve(
      accountId === disabled.id ? { ...disabled, state } : { ...archived, state },
    ));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listAccounts,
      setAccountState,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const dialog = await openOwnerAdministration();
    expect(await within(dialog).findByText("Former Reader")).toBeInTheDocument();
    expect(within(dialog).queryByText("Archived Reader")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(setAccountState).toHaveBeenCalledWith(disabled.id, "archived"));
    await waitFor(() => expect(within(dialog).queryByText("Former Reader")).not.toBeInTheDocument());

    await user.click(within(dialog).getByRole("button", { name: "Show archived" }));
    expect(await within(dialog).findByText("Archived Reader")).toBeInTheDocument();
    expect(listAccounts).toHaveBeenLastCalledWith(true);
    await user.click(within(dialog).getByRole("button", { name: "Unarchive" }));
    await waitFor(() => expect(setAccountState).toHaveBeenCalledWith(archived.id, "disabled"));
    expect(await within(dialog).findByText(/Disabled/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Enable" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("redeems an Owner-issued reset link on a dedicated anonymous surface and returns to sign in", async () => {
    const user = userEvent.setup();
    const rawToken = "R".repeat(43);
    window.history.replaceState(null, "", `/#/reset/${rawToken}`);
    const redeemCredentialReset = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({ redeemCredentialReset });
    render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "AC Reset password" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    await user.type(screen.getByLabelText("New password"), "new-password-456");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-456");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(redeemCredentialReset).toHaveBeenCalledWith(rawToken, "new-password-456"));
    expect(await screen.findByRole("heading", { name: "AC AcademicCloud" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Password reset complete");
    for (const secret of [rawToken, "new-password-456"]) {
      expect(window.location.href).not.toContain(secret);
      expect(storageContains(window.localStorage, secret)).toBe(false);
      expect(storageContains(window.sessionStorage, secret)).toBe(false);
      expect(document.body.textContent).not.toContain(secret);
    }
  });

  it("keeps reset confirmation local and reports every invalid capability generically", async () => {
    const user = userEvent.setup();
    const rawToken = "S".repeat(43);
    window.history.replaceState(null, "", `/#/reset/${rawToken}`);
    const redeemCredentialReset = vi.fn().mockRejectedValue(new ApiError(400, "invalid_credential_reset"));
    const api = fakeApi({ redeemCredentialReset });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "AC Reset password" });
    await user.type(screen.getByLabelText("New password"), "new-password-456");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password-789");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    expect(redeemCredentialReset).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-456");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid, used, replaced, or expired");
    expect(redeemCredentialReset).toHaveBeenCalledWith(rawToken, "new-password-456");
  });

  it("renders only server-backed effective announcements as escaped plain text with semantic severity", async () => {
    const announcement = {
      id: "announcement-1",
      title: "Archive hours",
      body: "<img src=x onerror=alert(1)>",
      severity: "critical" as const,
      linkUrl: "https://example.edu/archive",
      isActive: true,
      publishedAt: "2026-08-17T10:00:00.000Z",
      expiresAt: null,
      createdByAccountId: ACCOUNT.id,
      createdAt: "2026-08-17T09:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z",
    };
    const listAnnouncements = vi.fn().mockResolvedValue([announcement]);
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listAnnouncements });
    render(<App api={api} />);

    expect(await screen.findByRole("article", { name: "Critical announcement: Archive hours" })).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector(".announcement img")).toBeNull();
    const link = screen.getByRole("link", { name: "Open link" });
    expect(link).toHaveAttribute("href", announcement.linkUrl);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(listAnnouncements).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("keeps routine announcement bodies collapsed until opened", async () => {
    const user = userEvent.setup();
    const announcement = { id: "routine", title: "Archive schedule", body: "Full schedule details", severity: "info" as const,
      linkUrl: null, isActive: true, publishedAt: "2026-09-25", expiresAt: null, createdByAccountId: ACCOUNT.id, createdAt: "2026-09-25", updatedAt: "2026-09-25" };
    render(<App api={fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listAnnouncements: vi.fn().mockResolvedValue([announcement]) })} />);
    const article = await screen.findByRole("article", { name: "Information announcement: Archive schedule" });
    const details = article.querySelector("details")!;
    expect(details.open).toBe(false);
    await user.click(within(article).getByText("Archive schedule"));
    expect(details.open).toBe(true);
    expect(within(article).getByText("Full schedule details")).toBeVisible();
  });

  it("has no hard-coded announcement fallback when the authenticated API returns none", async () => {
    const listAnnouncements = vi.fn().mockResolvedValue([]);
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listAnnouncements });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalledOnce());
    expect(document.querySelector(".announcement-feed")).toBeNull();
  });

  it("lets the Owner create, edit, publish, unpublish, and explicitly delete announcements without a fifth navigation item", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const base = {
      id: "announcement-1",
      title: "Archive hours",
      body: "Closes at 18:00.",
      severity: "warning" as const,
      linkUrl: null,
      isActive: false,
      publishedAt: null,
      expiresAt: null,
      createdByAccountId: ACCOUNT.id,
      createdAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z",
    };
    const createAnnouncement = vi.fn().mockResolvedValue(base);
    const updateAnnouncement = vi.fn().mockImplementation(async (_id, input) => ({
      ...base,
      ...input,
      title: "Archive schedule",
      updatedAt: "2026-08-17T10:01:00.000Z",
    }));
    const publishAnnouncement = vi.fn().mockResolvedValue({
      ...base,
      title: "Archive schedule",
      isActive: true,
      publishedAt: "2026-08-17T10:02:00.000Z",
      updatedAt: "2026-08-17T10:02:00.000Z",
    });
    const unpublishAnnouncement = vi.fn().mockResolvedValue({
      ...base,
      title: "Archive schedule",
      isActive: false,
      publishedAt: "2026-08-17T10:02:00.000Z",
      updatedAt: "2026-08-17T10:03:00.000Z",
    });
    const deleteAnnouncement = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listAllAnnouncements: vi.fn().mockResolvedValue([]),
      createAnnouncement,
      updateAnnouncement,
      publishAnnouncement,
      unpublishAnnouncement,
      deleteAnnouncement,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    expect(within(screen.getByRole("complementary", { name: "Primary navigation" })).getAllByRole("button")).toHaveLength(4);
    const dialog = await openOwnerAdministration("Announcements");
    await user.type(within(dialog).getByLabelText("Title"), "Archive hours");
    await user.type(within(dialog).getByLabelText("Body"), "Closes at 18:00.");
    await user.selectOptions(within(dialog).getByLabelText("Severity"), "warning");
    await user.click(within(dialog).getByRole("button", { name: "Create announcement" }));
    await waitFor(() => expect(createAnnouncement).toHaveBeenCalledWith({
      title: "Archive hours",
      body: "Closes at 18:00.",
      severity: "warning",
      linkUrl: null,
      expiresAt: null,
    }));

    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Archive schedule");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAnnouncement).toHaveBeenCalledWith("announcement-1", expect.objectContaining({ title: "Archive schedule" })));

    await user.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(publishAnnouncement).toHaveBeenCalledWith("announcement-1"));
    await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(unpublishAnnouncement).toHaveBeenCalledWith("announcement-1"));
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Delete announcement “Archive schedule”? This removes it immediately.");
    await waitFor(() => expect(deleteAnnouncement).toHaveBeenCalledWith("announcement-1"));
    await waitFor(() => expect(within(dialog).queryByText("Archive schedule")).not.toBeInTheDocument());
  });

  it("does not expose announcement administration to Members", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue({ ...ACCOUNT, role: "member" as const }) });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    expect(screen.queryByRole("button", { name: "Administration" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(within(screen.getByRole("menu", { name: "Account" })).queryByRole("menuitem", { name: "Administration" })).not.toBeInTheDocument();
  });

  it("renders the canonical Library without a duplicate product destination or redundant breadcrumb", async () => {
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    await openLibrary(api);

    expect(screen.queryByText("Your research files")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Library", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shared Library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scholarly records" })).not.toBeInTheDocument();
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
    // Zero-copy: the outside-workspace drop is silently prevented — no
    // descriptive notice renders.
    expect(screen.queryByText(/Drop files into the Library workspace/)).not.toBeInTheDocument();

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

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    // The reserved upload reports a different MIME than the browser now
    // infers: the same name/size/checksum must still renew successfully.
    const chooseInput = await screen.findByLabelText("Choose the original file and continue paper.pdf");
    await user.upload(chooseInput, new File(["source"], "paper.pdf", { type: "application/x-pdf" }));

    await waitFor(() => expect(renewUpload).toHaveBeenCalledWith("file-1"));
    await waitFor(() => expect(completeUpload).toHaveBeenCalledWith("file-1"));
    expect(directUpload).toHaveBeenCalledOnce();
    expect(api.createUpload).not.toHaveBeenCalled();
  });

  it("shows the same user-facing continuation state for every unfinished upload", async () => {
    const user = userEvent.setup();
    const previousUpload = {
      ...FILE,
      id: "previous-upload-1",
      displayName: "previous.pdf",
      state: "pending_upload" as const,
      activatedAt: null,
      uploadKind: "legacy" as const,
    };
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([PENDING_MULTIPART_FILE, previousUpload]),
    });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));

    expect(await screen.findAllByText(/Ready to continue/)).toHaveLength(2);
    expect(screen.getAllByText("Choose original file and continue")).toHaveLength(2);
    expect(screen.queryByText(/multipart|legacy|remote parts|re-upload once/i)).not.toBeInTheDocument();
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
    expect(screen.getByText("1 folders were skipped.")).toBeInTheDocument();

    // Directory-only drop: nothing uploads, a concise localized message shows.
    const before = checksumFile.mock.calls.length;
    fireEvent.drop(workspace(), {
      dataTransfer: dragDataTransfer({
        files: [],
        items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true, isFile: false }), getAsFile: () => null }],
      }),
    });
    expect(checksumFile).toHaveBeenCalledTimes(before);
    expect(screen.getByText("1 folders were skipped.")).toBeInTheDocument();
  });

  it("keeps the row action menu compact and exposes folder/file actions inside it", async () => {
    const user = userEvent.setup();
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const deleteFolder = vi.fn().mockResolvedValue(undefined);
    const bulkOperation = vi.fn().mockImplementation(async (input: BulkOperationInput) => ({
      action: input.action,
      atomic: true as const,
      items: input.items.map((selected) => ({ ...selected, outcome: "succeeded" as const })),
    }));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      deleteFile,
      deleteFolder,
      bulkOperation,
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
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Move “paper.pdf” to the recycle bin?"));

    const folderMenu = await openRowMenu("Sources");
    expect(within(folderMenu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(folderMenu).getByRole("menuitem", { name: "Move" })).toBeInTheDocument();
    await user.click(within(folderMenu).getByRole("menuitem", { name: "Move to trash" }));
    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith(FOLDER.id));
    expect(window.confirm).toHaveBeenCalledWith("Move “Sources” and its active contents to the recycle bin?");
  });

  it("refreshes a stale folder row after a recycle conflict and retries with the reconciled revision", async () => {
    const user = userEvent.setup();
    const freshFolder = { ...FOLDER, version: "n".repeat(43), updatedAt: "2026-08-18T01:00:00.000Z" };
    const listEntries = vi.fn()
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] })
      .mockResolvedValue({ folder: null, folders: [freshFolder], files: [] });
    const deleteFolder = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, "invalid_state"))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries, deleteFolder });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    let menu = await openRowMenu("Sources");
    await user.click(within(menu).getByRole("menuitem", { name: "Move to trash" }));
    await waitFor(() => expect(deleteFolder).toHaveBeenNthCalledWith(1, FOLDER.id));
    expect(await screen.findByRole("status")).toHaveTextContent("this view was refreshed");
    expect(listEntries).toHaveBeenCalledTimes(2);

    menu = await openRowMenu("Sources");
    await user.click(within(menu).getByRole("menuitem", { name: "Move to trash" }));
    await waitFor(() => expect(deleteFolder).toHaveBeenNthCalledWith(2, FOLDER.id));
    expect(await screen.findByRole("status")).toHaveTextContent("Folder moved to the recycle bin");
  });

  it("closes the row menu on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const trigger = await screen.findByRole("button", { name: "Open actions for paper.pdf" });
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
    expect(within(dialog).getByTestId("pdf-reader")).toHaveAttribute("data-source", "https://signed.invalid/preview");
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
    const retry = await screen.findByRole("button", { name: "Continue paper.pdf upload" });
    await user.click(retry);

    await waitFor(() => expect(completeUpload).toHaveBeenCalledWith("file-1"));
    expect(renewUpload).not.toHaveBeenCalled();
    expect(directUpload).toHaveBeenCalledOnce();
  });

  it("reuses completed multipart part 1 and schedules only missing part 2", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdef"], "resumable.pdf", { type: "application/pdf" });
    const initial = multipartTransfer({
      completedParts: [{ partNumber: 1, sizeBytes: 3, etag: "etag-1" }],
      completedBytes: 3,
    });
    const reconciled = multipartTransfer({
      completedParts: [
        { partNumber: 1, sizeBytes: 3, etag: "etag-1" },
        { partNumber: 2, sizeBytes: 3, etag: "etag-2" },
      ],
      completedBytes: 6,
    });
    const authorizeUploadPart = vi.fn().mockResolvedValue({
      method: "PUT",
      url: "https://storage.invalid/part-2",
      headers: { "Content-Length": "3", "Content-MD5": FILE.checksum },
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const directPartUpload = vi.fn().mockResolvedValue(undefined);
    const completeMultipartUpload = vi.fn().mockResolvedValue(FILE);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: PENDING_MULTIPART_FILE, transfer: initial }),
      getUploadStatus: vi.fn().mockResolvedValue(reconciled),
      authorizeUploadPart,
      resumeUpload: vi.fn(),
      completeMultipartUpload,
    });
    render(<App
      api={api}
      checksumFile={vi.fn().mockResolvedValue(FILE.checksum)}
      directPartUpload={directPartUpload}
    />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(completeMultipartUpload).toHaveBeenCalledWith(PENDING_MULTIPART_FILE.id, reconciled.version));
    expect(authorizeUploadPart).toHaveBeenCalledTimes(1);
    expect(authorizeUploadPart).toHaveBeenCalledWith(PENDING_MULTIPART_FILE.id, 2, {
      version: initial.version,
      sizeBytes: 3,
      contentMd5: FILE.checksum,
    });
    expect(directPartUpload).toHaveBeenCalledTimes(1);
    expect((directPartUpload.mock.calls[0]![1] as Blob).size).toBe(3);
  });

  it("offers same-session multipart continuation as a button rather than a file picker", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdef"], "same-session.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name };
    const initial = multipartTransfer({ partSizeBytes: 6, totalParts: 1 }, pending);
    const directPartUpload = vi.fn().mockRejectedValue(new DirectUploadError("upload_unreachable", "unreachable"));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: pending, transfer: initial }),
      getUploadStatus: vi.fn(),
      authorizeUploadPart: vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" }),
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={directPartUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(screen.getByText("Needs attention")).toBeInTheDocument());
    const continueButton = await screen.findByRole("button", { name: "Continue same-session.pdf upload" });
    expect(continueButton.tagName).toBe("BUTTON");
    expect(screen.queryByLabelText("Choose the original file and continue same-session.pdf")).not.toBeInTheDocument();
    expect(directPartUpload).toHaveBeenCalledTimes(3);
  });

  it("claims one scheduler slot before a same-session multipart retry status request", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdef"], "single-retry.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name };
    const transfer = multipartTransfer({ partSizeBytes: 6, totalParts: 1 }, pending);
    let resolveStatus: ((value: MultipartTransfer) => void) | undefined;
    const getUploadStatus = vi.fn(() => new Promise<MultipartTransfer>((resolve) => {
      resolveStatus = resolve;
    }));
    const directPartUpload = vi.fn().mockRejectedValue(new DirectUploadError("upload_unreachable", "unreachable"));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: pending, transfer }),
      getUploadStatus,
      authorizeUploadPart: vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" }),
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={directPartUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(screen.getByText("Needs attention")).toBeInTheDocument());
    expect(directPartUpload).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole("button", { name: "Continue single-retry.pdf upload" }));
    await waitFor(() => expect(getUploadStatus).toHaveBeenCalledOnce());
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pending" }));
    await user.click(within(screen.getByRole("complementary", { name: "Primary navigation" })).getByRole("button", { name: "All resources" }));
    expect(getUploadStatus).toHaveBeenCalledOnce();

    resolveStatus!(transfer);
    await waitFor(() => expect(directPartUpload).toHaveBeenCalledTimes(6));
    expect(getUploadStatus).toHaveBeenCalledOnce();
  });

  it("pauses multipart work by aborting the in-flight PUT and retaining server state", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdef"], "pause-part.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name };
    const initial = multipartTransfer({ partSizeBytes: 6, totalParts: 1 }, pending);
    const paused = multipartTransfer({ state: "paused", version: "p".repeat(43), partSizeBytes: 6, totalParts: 1 }, pending);
    let activeSignal: AbortSignal | undefined;
    const directPartUpload = vi.fn((_authorization: unknown, _bytes: Blob, options?: { signal?: AbortSignal }) => {
      activeSignal = options?.signal;
      return new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new DOMException("paused", "AbortError")), { once: true });
      });
    });
    const pauseUpload = vi.fn().mockResolvedValue(paused);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: pending, transfer: initial }),
      getUploadStatus: vi.fn(),
      authorizeUploadPart: vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" }),
      pauseUpload,
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={directPartUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(directPartUpload).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Pause pause-part.pdf upload" }));

    await waitFor(() => expect(pauseUpload).toHaveBeenCalledWith(pending.id, initial.version));
    expect(activeSignal?.aborted).toBe(true);
    expect(await screen.findByRole("button", { name: "Continue pause-part.pdf upload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abandon pause-part.pdf upload" })).toBeInTheDocument();
  });

  it("refresh reselect verifies identity and resumes existing multipart parts", async () => {
    const user = userEvent.setup();
    const pending = { ...PENDING_MULTIPART_FILE, displayName: "refresh.pdf" };
    const selected = new File(["abcdef"], pending.displayName, { type: "application/x-pdf" });
    const status = multipartTransfer({
      file: pending,
      state: "paused",
      completedParts: [{ partNumber: 1, sizeBytes: 3, etag: "etag-1" }],
      completedBytes: 3,
    }, pending);
    const resumed = multipartTransfer({ file: pending, version: "r".repeat(43) }, pending);
    const authorizeUploadPart = vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part-2", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" });
    const resumeUpload = vi.fn().mockResolvedValue(resumed);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([pending]),
      getUploadStatus: vi.fn()
        .mockResolvedValueOnce(status)
        .mockResolvedValueOnce({ kind: "complete", file: FILE }),
      authorizeUploadPart,
      resumeUpload,
      completeMultipartUpload: vi.fn(),
    });
    render(<App
      api={api}
      checksumFile={vi.fn().mockResolvedValue(FILE.checksum)}
      directPartUpload={vi.fn().mockResolvedValue(undefined)}
    />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    await user.upload(await screen.findByLabelText("Choose the original file and continue refresh.pdf"), selected);

    await waitFor(() => expect(authorizeUploadPart).toHaveBeenCalledTimes(1));
    expect(authorizeUploadPart.mock.calls[0]?.[1]).toBe(2);
    expect(authorizeUploadPart.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ version: resumed.version }));
    expect(resumeUpload).toHaveBeenCalledWith(pending.id, status.version);
    expect(api.createUpload).not.toHaveBeenCalled();
    expect(api.renewUpload).not.toHaveBeenCalled();
  });

  it("rejects a same-name different-content reselect before status or part authorization", async () => {
    const user = userEvent.setup();
    const pending = { ...PENDING_MULTIPART_FILE, displayName: "same-name.pdf" };
    const getUploadStatus = vi.fn();
    const authorizeUploadPart = vi.fn();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([pending]),
      getUploadStatus,
      authorizeUploadPart,
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue("different-checksum==")} />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    await user.upload(
      await screen.findByLabelText("Choose the original file and continue same-name.pdf"),
      new File(["abcdef"], "same-name.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByText("Choose the original file for this unfinished upload and try again.")).toBeInTheDocument();
    expect(getUploadStatus).not.toHaveBeenCalled();
    expect(authorizeUploadPart).not.toHaveBeenCalled();
  });

  it("bounds multipart scheduling to three concurrent parts", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdefghij"], "concurrency.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name, sizeBytes: selected.size };
    const initial = multipartTransfer({ partSizeBytes: 2, totalParts: 5 }, pending);
    const resolvers: Array<() => void> = [];
    let active = 0;
    let maximum = 0;
    const directPartUpload = vi.fn(() => new Promise<void>((resolve) => {
      active += 1;
      maximum = Math.max(maximum, active);
      resolvers.push(() => {
        active -= 1;
        resolve();
      });
    }));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: pending, transfer: initial }),
      getUploadStatus: vi.fn().mockResolvedValue({ kind: "complete", file: FILE }),
      authorizeUploadPart: vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" }),
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={directPartUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(directPartUpload).toHaveBeenCalledTimes(3));
    expect(maximum).toBe(3);
    resolvers.shift()!();
    await waitFor(() => expect(directPartUpload).toHaveBeenCalledTimes(4));
    resolvers.shift()!();
    await waitFor(() => expect(directPartUpload).toHaveBeenCalledTimes(5));
    for (const resolve of resolvers.splice(0)) resolve();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Uploaded"));
    expect(maximum).toBeLessThanOrEqual(3);
  });

  it("bounds a repeatedly failing part to three authorization and PUT attempts", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdef"], "retry-part.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name };
    const authorizeUploadPart = vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" });
    const directPartUpload = vi.fn().mockRejectedValue(new DirectUploadError("upload_unreachable", "unreachable"));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({
        file: pending,
        transfer: multipartTransfer({ partSizeBytes: 6, totalParts: 1 }, pending),
      }),
      getUploadStatus: vi.fn(),
      authorizeUploadPart,
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={directPartUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(screen.getByText("Needs attention")).toBeInTheDocument(), { timeout: 3000 });
    expect(directPartUpload).toHaveBeenCalledTimes(3);
    expect(authorizeUploadPart).toHaveBeenCalledTimes(3);
  });

  it("automatically reconciles a lost multipart completion response", async () => {
    const user = userEvent.setup();
    const selected = new File(["abcdef"], "lost-complete.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name };
    const full = multipartTransfer({
      file: pending,
      completedParts: [
        { partNumber: 1, sizeBytes: 3, etag: "etag-1" },
        { partNumber: 2, sizeBytes: 3, etag: "etag-2" },
      ],
      completedBytes: 6,
    }, pending);
    const getUploadStatus = vi.fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce({ kind: "complete", file: FILE });
    const completeMultipartUpload = vi.fn().mockRejectedValue(new ApiError(503, "storage_unavailable"));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: pending, transfer: multipartTransfer({}, pending) }),
      getUploadStatus,
      authorizeUploadPart: vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" }),
      resumeUpload: vi.fn(),
      completeMultipartUpload,
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={vi.fn().mockResolvedValue(undefined)} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Uploaded"));
    expect(completeMultipartUpload).toHaveBeenCalledOnce();
    expect(getUploadStatus).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Continue lost-complete.pdf upload" })).not.toBeInTheDocument();
  });

  it("explicitly abandons only the current multipart session", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const selected = new File(["abcdef"], "abandon.pdf", { type: "application/pdf" });
    const pending = { ...PENDING_MULTIPART_FILE, displayName: selected.name };
    const initial = multipartTransfer({}, pending);
    const abandonMultipartUpload = vi.fn().mockResolvedValue(undefined);
    const directPartUpload = vi.fn((_authorization: unknown, _bytes: Blob, options?: { signal?: AbortSignal }) => new Promise<void>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("paused", "AbortError")), { once: true });
    }));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      createUpload: vi.fn().mockResolvedValue({ file: pending, transfer: initial }),
      getUploadStatus: vi.fn(),
      authorizeUploadPart: vi.fn().mockResolvedValue({ method: "PUT", url: "https://storage.invalid/part", headers: {}, expiresAt: "2026-08-13T00:05:00.000Z" }),
      pauseUpload: vi.fn(),
      resumeUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
      abandonMultipartUpload,
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directPartUpload={directPartUpload} />);

    await user.upload(await screen.findByLabelText("Upload files"), selected);
    await waitFor(() => expect(directPartUpload).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Abandon abandon.pdf upload" }));
    await waitFor(() => expect(abandonMultipartUpload).toHaveBeenCalledWith(pending.id, initial.version));
    expect(screen.queryByText("abandon.pdf")).not.toBeInTheDocument();
  });

  it("hydrates authoritative status before abandoning a recovered multipart job with no transfer", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const pending = { ...PENDING_MULTIPART_FILE, displayName: "hydrate-abandon.pdf" };
    const selected = new File(["abcdef"], pending.displayName, { type: "application/pdf" });
    const authoritative = multipartTransfer({ file: pending, version: "a".repeat(43) }, pending);
    const getUploadStatus = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, "storage_unavailable"))
      .mockResolvedValueOnce(authoritative);
    const abandonMultipartUpload = vi.fn().mockResolvedValue(undefined);
    const abandonLegacyUpload = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([pending]),
      getUploadStatus,
      abandonMultipartUpload,
      abandonLegacyUpload,
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    await user.upload(await screen.findByLabelText(`Choose the original file and continue ${pending.displayName}`), selected);
    await waitFor(() => expect(getUploadStatus).toHaveBeenCalledOnce());
    const job = document.querySelector(".upload-job");
    expect(job).toBeInstanceOf(HTMLElement);
    await user.click(within(job as HTMLElement).getByRole("button", { name: `Abandon ${pending.displayName} upload` }));

    await waitFor(() => expect(abandonMultipartUpload).toHaveBeenCalledWith(pending.id, authoritative.version));
    expect(getUploadStatus).toHaveBeenCalledTimes(2);
    expect(abandonLegacyUpload).not.toHaveBeenCalled();
  });

  it("never falls through to legacy abandon when recovered multipart status hydration fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const pending = { ...PENDING_MULTIPART_FILE, displayName: "failed-hydration.pdf" };
    const selected = new File(["abcdef"], pending.displayName, { type: "application/pdf" });
    const getUploadStatus = vi.fn().mockRejectedValue(new ApiError(503, "storage_unavailable"));
    const abandonMultipartUpload = vi.fn().mockResolvedValue(undefined);
    const abandonLegacyUpload = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([pending]),
      getUploadStatus,
      abandonMultipartUpload,
      abandonLegacyUpload,
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    await user.upload(await screen.findByLabelText(`Choose the original file and continue ${pending.displayName}`), selected);
    await waitFor(() => expect(getUploadStatus).toHaveBeenCalledOnce());
    const job = document.querySelector(".upload-job");
    expect(job).toBeInstanceOf(HTMLElement);
    await user.click(within(job as HTMLElement).getByRole("button", { name: `Abandon ${pending.displayName} upload` }));

    await waitFor(() => expect(getUploadStatus).toHaveBeenCalledTimes(2));
    expect(abandonMultipartUpload).not.toHaveBeenCalled();
    expect(abandonLegacyUpload).not.toHaveBeenCalled();
    expect(within(job as HTMLElement).getByRole("alert")).toHaveTextContent("File services are temporarily unavailable");
  });

  it("uses legacy abandon only for a durably classified legacy upload", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const pending = {
      ...PENDING_MULTIPART_FILE,
      id: "legacy-pending-1",
      displayName: "legacy-abandon.pdf",
      uploadKind: "legacy" as const,
    };
    const selected = new File(["abcdef"], pending.displayName, { type: "application/pdf" });
    const abandonLegacyUpload = vi.fn().mockResolvedValue(undefined);
    const abandonMultipartUpload = vi.fn().mockResolvedValue(undefined);
    const directUpload = vi.fn((_authorization: unknown, _bytes: Blob, options?: { signal?: AbortSignal }) => new Promise<void>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("paused", "AbortError")), { once: true });
    }));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([pending]),
      renewUpload: vi.fn().mockResolvedValue({
        method: "POST",
        url: "https://storage.invalid",
        fields: {},
        expiresAt: "2026-08-20T23:59:00.000Z",
      }),
      abandonLegacyUpload,
      abandonMultipartUpload,
    });
    render(<App api={api} checksumFile={vi.fn().mockResolvedValue(FILE.checksum)} directUpload={directUpload} />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    await user.upload(await screen.findByLabelText(`Choose the original file and continue ${pending.displayName}`), selected);
    await waitFor(() => expect(directUpload).toHaveBeenCalledOnce());
    const job = document.querySelector(".upload-job");
    expect(job).toBeInstanceOf(HTMLElement);
    await user.click(within(job as HTMLElement).getByRole("button", { name: `Abandon ${pending.displayName} upload` }));

    await waitFor(() => expect(abandonLegacyUpload).toHaveBeenCalledWith(pending.id));
    expect(abandonMultipartUpload).not.toHaveBeenCalled();
  });

  it("opens authorized downloads through a native anchor without fetch or Blob buffering", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const createDownload = vi.fn().mockResolvedValue({
      method: "GET",
      url: "https://storage.invalid/download?signature=short-lived",
      expiresAt: "2026-08-13T00:05:00.000Z",
      sizeBytes: FILE.sizeBytes,
      etag: "stable-etag",
      acceptRanges: "bytes" as const,
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      createDownload,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Download" }));
    await waitFor(() => expect(createDownload).toHaveBeenCalledWith(FILE.id));
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toBe("https://storage.invalid/download?signature=short-lived");
    expect(anchor.download).toBe(FILE.displayName);
    expect(fetchSpy).not.toHaveBeenCalled();
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

    await user.click(await screen.findByRole("button", { name: "Recycle" }));
    await user.click(await screen.findByRole("button", { name: "Restore file paper.pdf" }));
    await waitFor(() => expect(restoreFile).toHaveBeenCalledWith("file-1"));
    await user.click(screen.getByRole("button", { name: "Delete paper.pdf forever" }));
    await waitFor(() => expect(permanentlyDeleteFile).toHaveBeenCalledWith("file-1", deleted.version));
  });

  it("combines manager-visible Library recycle rows without widening account restore or purge authority", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const accountDeleted = { ...FILE, state: "deleted" as const, deletedAt: "2026-08-13T00:00:00.000Z" };
    const staleVersion = "r".repeat(43);
    const currentVersion = "q".repeat(43);
    const libraryDeleted = {
      version: staleVersion,
      canonicalTitle: null,
      file: {
        id: "library-recycled-file",
        displayName: "shared-source.pdf",
        mediaType: "application/pdf",
        sizeBytes: 8192,
        deletedAt: "2026-08-14T00:00:00.000Z",
      },
    };
    const listLibraryRecycle = vi.fn().mockResolvedValue([])
      .mockResolvedValueOnce([libraryDeleted])
      .mockResolvedValueOnce([{ ...libraryDeleted, version: currentVersion }])
      .mockResolvedValueOnce([]);
    const restoreLibraryHolding = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, "concurrent_change"))
      .mockResolvedValueOnce(undefined);
    const restoreFile = vi.fn().mockResolvedValue(FILE);
    const permanentlyDeleteFile = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [accountDeleted] }),
      listLibraries: vi.fn().mockResolvedValue([DEFAULT_LIBRARY]),
      listLibraryRecycle,
      restoreLibraryHolding,
      restoreFile,
      permanentlyDeleteFile,
    });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Recycle" }));
    const libraryRow = (await screen.findByText("shared-source.pdf")).closest('[data-entry-kind="library-recycle-holding"]');
    expect(libraryRow).toBeInstanceOf(HTMLElement);
    const libraryRowElement = libraryRow as HTMLElement;
    expect(libraryRowElement.querySelector(".file-badge--pdf")).not.toBeNull();
    expect(within(libraryRowElement).getByRole("checkbox", { name: "Select shared-source.pdf" })).toBeInTheDocument();
    expect(within(libraryRowElement).getByRole("button", { name: /forever/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete paper.pdf forever" })).toBeInTheDocument();

    await user.click(within(libraryRowElement).getByRole("button", { name: "Restore file shared-source.pdf" }));
    await waitFor(() => expect(restoreLibraryHolding).toHaveBeenNthCalledWith(
      1,
      DEFAULT_LIBRARY.id,
      libraryDeleted.file.id,
      staleVersion,
    ));
    await waitFor(() => expect(listLibraryRecycle).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("The catalogue was refreshed");

    const refreshedRow = (await screen.findByText("shared-source.pdf")).closest('[data-entry-kind="library-recycle-holding"]');
    expect(refreshedRow).toBeInstanceOf(HTMLElement);
    await user.click(within(refreshedRow as HTMLElement).getByRole("button", { name: "Restore file shared-source.pdf" }));
    await waitFor(() => expect(restoreLibraryHolding).toHaveBeenNthCalledWith(
      2,
      DEFAULT_LIBRARY.id,
      libraryDeleted.file.id,
      currentVersion,
    ));
    await waitFor(() => expect(screen.queryByText("shared-source.pdf")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Restore file paper.pdf" }));
    await waitFor(() => expect(restoreFile).toHaveBeenCalledWith(accountDeleted.id));
    await user.click(screen.getByRole("button", { name: "Delete paper.pdf forever" }));
    await waitFor(() => expect(permanentlyDeleteFile).toHaveBeenCalledWith(accountDeleted.id, accountDeleted.version));
  });

  it("does not request or expose Library governance recycle entries for a Member", async () => {
    const user = userEvent.setup();
    const member = { id: "member-1", loginName: "Reader", role: "member" as const };
    const memberLibrary = { ...DEFAULT_LIBRARY, role: "member" as const };
    const accountDeleted = { ...FILE, state: "deleted" as const, deletedAt: "2026-08-13T00:00:00.000Z" };
    const listLibraryRecycle = vi.fn().mockResolvedValue([]);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(member),
      listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [accountDeleted] }),
      listLibraries: vi.fn().mockResolvedValue([memberLibrary]),
      listLibraryRecycle,
    });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Recycle" }));
    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    await waitFor(() => expect(api.listLibraries).toHaveBeenCalled());
    expect(listLibraryRecycle).not.toHaveBeenCalled();
    expect(document.querySelector('[data-entry-kind="library-recycle-holding"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Loading items…")).not.toBeInTheDocument();
  });

  it("signs out and returns to the login gate", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), logout });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "AC AcademicCloud" })).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });

  it("switches language immediately, persists the choice, and updates document.lang", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "资料库" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(window.localStorage.getItem("academiccloud.language")).toBe("zh-CN");

    await user.click(screen.getByRole("menuitem", { name: "English" }));
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

    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New folder" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "中文" }));
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
    const dialog = screen.getByRole("dialog", { name: "paper.pdf" });
    expect(dialog.querySelector('[data-testid="pdf-reader"]')).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Retry" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Close preview" }));

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "中文" }));
    await user.click(screen.getByRole("button", { name: "打开 paper.pdf 的操作菜单" }));
    await user.click(within(screen.getByRole("menu", { name: "paper.pdf 的操作" })).getByRole("menuitem", { name: "预览" }));
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
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "中文" }));
    await screen.findByRole("heading", { name: "资料库" });
    await user.upload(await screen.findByLabelText("上传文件"), new File(["x"], "a.pdf", { type: "application/pdf" }));
    checksumResolvers[0]!(FILE.checksum);

    await waitFor(() => expect(screen.getByText("无法连接到上传服务，请检查网络后重试。")).toBeInTheDocument());
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

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "中文" }));
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

    for (const viewName of ["Favorites", "Pending", "Recycle"]) {
      await user.click(screen.getByRole("button", { name: viewName }));
      const before = checksumFile.mock.calls.length;
      const dropEvent = fireEvent.drop(workspace(), { dataTransfer: fileDrag });
      expect(dropEvent).toBe(false); // default prevented: no browser navigation
      expect(checksumFile).toHaveBeenCalledTimes(before); // nothing enqueued
      // Zero-copy: no descriptive drop sentence anywhere.
      expect(screen.queryByText(/Drop files into the Library workspace/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "All resources" }));
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

    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("File services are temporarily unavailable");

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

    await user.click(screen.getByRole("button", { name: "Recycle" }));
    await waitFor(() => expect(listRecycle).toHaveBeenCalled());
    expect(screen.getByText("Recycle bin is empty")).toBeInTheDocument();
  });

  it("retries favorites when entering the view after an initial failure (retry fails visibly)", async () => {
    const user = userEvent.setup();
    const listFavorites = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, "storage_unavailable")) // library mount
      .mockRejectedValueOnce(new ApiError(503, "storage_unavailable")); // favorites enter retry
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listFavorites });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    // The library star-state failure never leaks into the shared error area.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    // The retry failure surfaces as an actionable Favorites error — the page
    // is NOT silently stuck in permanent loading.
    expect(await screen.findByRole("alert")).toHaveTextContent("File services are temporarily unavailable");
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(listFavorites).toHaveBeenCalledTimes(2);
  });

  it("retries favorites when entering the view after an initial failure (retry succeeds)", async () => {
    const user = userEvent.setup();
    const listFavorites = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, "storage_unavailable"))
      .mockResolvedValueOnce({ files: [FILE], folders: [] });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listFavorites });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(listFavorites).toHaveBeenCalledTimes(2);
  });

  it("aborted favorites requests never surface stale errors after switching views", async () => {
    const user = userEvent.setup();
    const listFavorites = vi.fn((signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listFavorites });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(screen.getByRole("button", { name: "Pending" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(await screen.findByText(/was not uploaded because an active or pending file with the same name already exists in this folder/i)).toHaveTextContent(
      "No duplicate was created.",
    );
  });

  it("pausing a running upload releases its slot for the next queued file", async () => {
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
    await user.click(screen.getByRole("button", { name: "Pause c.pdf upload" }));

    await waitFor(() => expect(checksumFile).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "Continue c.pdf upload" })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Continue c.pdf upload" }));
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

    await user.click(screen.getByRole("button", { name: "Continue a.pdf upload" }));
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

    await user.click(screen.getByRole("button", { name: "Continue a.pdf upload" }));
    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(2));

    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    expect(screen.getByText("Verifying upload")).toBeInTheDocument();
    expect(screen.getByText("1 in progress or needing attention")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pending" }));
    await user.click(within(screen.getByRole("complementary", { name: "Primary navigation" })).getByRole("button", { name: "All resources" }));
    expect(completeUpload).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Verifying upload")).toBeInTheDocument();

    settleRetryComplete!();
    await waitFor(() => expect(screen.queryByText("Verifying upload")).not.toBeInTheDocument());
    expect(completeUpload).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded");
  });

  it("uses a supported file picker capability and shows upload activity immediately", async () => {
    const user = userEvent.setup();
    const selected = new File(["source"], "picker-source.pdf", { type: "application/pdf" });
    const sourceHandle = {
      kind: "file" as const,
      name: selected.name,
      getFile: vi.fn().mockResolvedValue(selected),
      queryPermission: vi.fn().mockResolvedValue("granted" as PermissionState),
      requestPermission: vi.fn().mockResolvedValue("granted" as PermissionState),
    };
    const picker = vi.fn().mockResolvedValue([sourceHandle]);
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: picker });
    const checksumFile = vi.fn(() => new Promise<string>(() => undefined));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    window.localStorage.removeItem(ACTIVITY_PREFERENCE_KEY);
    render(<App api={api} checksumFile={checksumFile} />);

    await user.click(await screen.findByRole("button", { name: "Upload resources" }));

    await waitFor(() => expect(picker).toHaveBeenCalledWith({ multiple: true }));
    expect(await screen.findByRole("heading", { name: "Activity Center" })).toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "Expand background tasks" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(selected.name)).not.toBeInTheDocument();
    await user.click(expand);
    expect(window.localStorage.getItem(ACTIVITY_PREFERENCE_KEY)).toBe("1");
    expect(screen.getByText(selected.name)).toBeInTheDocument();
    expect(screen.getByText("Calculating checksum")).toBeInTheDocument();
  });

  it("offers the standard picker while an embedded browser leaves the enhanced picker pending", async () => {
    const user = userEvent.setup();
    const picker = vi.fn(() => new Promise(() => undefined));
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: picker });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Upload resources" }));

    await waitFor(() => expect(picker).toHaveBeenCalledWith({ multiple: true }));
    expect(await screen.findByRole("button", { name: "Use standard file selection" })).toBeInTheDocument();
  });

  it("reveals manual source selection only after automatic pending recovery is unavailable", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listPending: vi.fn().mockResolvedValue([PENDING_MULTIPART_FILE]),
    });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Pending" }));
    expect(screen.queryByRole("button", { name: "Choose the original file and continue resumable.pdf" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue upload" }));

    expect(await screen.findByRole("button", { name: "Choose the original file and continue resumable.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Automatic source access is unavailable");
  });

  it("restores server-authoritative metadata activity after an App reload", async () => {
    const user = userEvent.setup();
    const job = {
      id: "job-activity-1",
      kind: "metadata_suggestion" as const,
      resourceId: LIBRARY_HOLDINGS[0]!.file.id,
      state: "queued" as const,
      progress: 0,
      attempts: 1,
      resultRef: null,
      errorCode: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const getLatestLibraryMetadataSuggestionStates = vi.fn().mockResolvedValue([{
      fileId: job.resourceId,
      state: "queued",
      job,
    }]);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
      getLatestLibraryMetadataSuggestionStates,
    });

    window.localStorage.removeItem(ACTIVITY_PREFERENCE_KEY);
    const first = render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "Activity Center" })).toBeInTheDocument();
    expect(screen.queryByText("AI cataloguing")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand background tasks" }));
    expect(await screen.findByText("AI cataloguing")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    first.unmount();

    render(<App api={api} />);
    expect(await screen.findByText("AI cataloguing")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse background tasks" })).toHaveAttribute("aria-expanded", "true");
    expect(getLatestLibraryMetadataSuggestionStates).toHaveBeenCalledTimes(2);
  });

  it("shows a normalized AI failure category and retries through the durable endpoint", async () => {
    const user = userEvent.setup();
    const failedJob = {
      id: "job-failed-1",
      kind: "metadata_suggestion" as const,
      resourceId: LIBRARY_HOLDINGS[0]!.file.id,
      state: "failed" as const,
      progress: 0,
      attempts: 1,
      resultRef: null,
      errorCode: "compute_dispatch_failed" as const,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: new Date().toISOString(),
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const generate = vi.fn().mockResolvedValue({ ...failedJob, id: "job-retry-1", state: "queued", errorCode: null, finishedAt: null });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
      getLatestLibraryMetadataSuggestionStates: vi.fn().mockResolvedValue([{
        fileId: failedJob.resourceId,
        state: "failed",
        job: failedJob,
      }]),
      generateLibraryMetadataSuggestions: generate,
    });
    window.localStorage.removeItem(ACTIVITY_PREFERENCE_KEY);
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "Expand background tasks" }));
    expect(await screen.findByText("Scheduling failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry AI cataloguing" }));
    await waitFor(() => expect(generate).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, LIBRARY_HOLDINGS[0]!.file.id));
  });

  it("reports a failed AI status discovery and offers a read-only retry", async () => {
    const user = userEvent.setup();
    const generate = vi.fn();
    const states = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, "storage_unavailable"))
      .mockResolvedValue([]);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
      getLatestLibraryMetadataSuggestionStates: states,
      generateLibraryMetadataSuggestions: generate,
    });
    render(<App api={api} />);
    expect(await screen.findByText("AI status could not be refreshed. Existing tasks are unchanged.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh AI status" }));
    await waitFor(() => expect(screen.queryByText("AI status could not be refreshed. Existing tasks are unchanged.")).not.toBeInTheDocument());
    expect(states).toHaveBeenCalledTimes(2);
    expect(generate).not.toHaveBeenCalled();
  });

  it("recovers Activity polling after a failed status read and stops when the job completes", async () => {
    vi.useFakeTimers();
    try {
      const job = {
        id: "poll-recovery", kind: "metadata_suggestion", resourceId: LIBRARY_HOLDINGS[0]!.file.id,
        state: "queued", progress: 0, attempts: 1, resultRef: null, errorCode: null,
        createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      };
      const states = vi.fn()
        .mockResolvedValueOnce([{ fileId: job.resourceId, state: "queued", job }])
        .mockRejectedValueOnce(new ApiError(503, "storage_unavailable"))
        .mockResolvedValueOnce([{ fileId: job.resourceId, state: "ai_succeeded_reviewable", job: { ...job, state: "succeeded", finishedAt: new Date().toISOString() } }]);
      const api = fakeApi({
        getSession: vi.fn().mockResolvedValue(ACCOUNT),
        listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
        getLatestLibraryMetadataSuggestionStates: states,
      });
      let mounted!: ReturnType<typeof render>;
      await act(async () => { mounted = render(<App api={api} />); });
      expect(screen.getByText("Queued")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(states).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(screen.getByText("AI status could not be refreshed. Existing tasks are unchanged.")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(states).toHaveBeenCalledTimes(3);
      expect(screen.getByText("Extraction complete — awaiting review and adoption")).toBeInTheDocument();
      expect(screen.queryByText("AI status could not be refreshed. Existing tasks are unchanged.")).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(states).toHaveBeenCalledTimes(3);
      mounted.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["manuscript.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1024, false],
    ["large-scan.pdf", "application/pdf", 512 * 1024 * 1024 + 1, false],
    ["transcription.txt", "text/plain", 1024, true],
  ] as const)("opens searched %s through its available document action", async (displayName, mediaType, sizeBytes, previewable) => {
    const user = userEvent.setup();
    const holding = { ...LIBRARY_HOLDINGS[0]!, file: { ...LIBRARY_HOLDINGS[0]!.file, displayName, mediaType, sizeBytes } };
    const createLibraryDownload = vi.fn().mockResolvedValue({ method: "GET", url: "https://signed.invalid/resource", expiresAt: "2026-09-10T00:00:00Z" });
    const getDetails = vi.fn().mockResolvedValue({
      displayTitle: displayName, originalFilename: displayName, metadataVersion: "m".repeat(43), bibliographyVersion: "b".repeat(43),
      bibliography: null, metadata: null, fieldAuthorities: [], canEditMetadata: false, file: holding.file,
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([holding]),
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [{
        fileId: holding.file.id, canonicalTitle: null, authorLabels: [], contributorLabels: [], date: null,
        publisher: null, materialType: null, materialClass: null, language: null, displayName, mediaType, sizeBytes, holding,
      }], nextCursor: null }),
      createLibraryDownload,
      getLibraryHoldingDetails: getDetails,
    });
    render(<App api={api} />);
    await user.type(await screen.findByLabelText("Search Library"), "manuscript");
    const results = await screen.findByRole("region", { name: "Search results" });
    await user.click(within(results).getByRole("button", { name: displayName }));
    let dialog = await screen.findByRole("dialog", { name: displayName });
    if (previewable) {
      expect(createLibraryDownload).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, holding.file.id, "inline");
      expect(within(dialog).getByTitle(`Preview of ${displayName}`)).toHaveAttribute("src", "https://signed.invalid/resource");
      await user.click(within(dialog).getByRole("button", { name: "Resource details" }));
      dialog = await screen.findByRole("dialog", { name: displayName });
      await user.click(await within(dialog).findByRole("button", { name: "Preview" }));
      expect(createLibraryDownload).toHaveBeenCalledTimes(1);
    } else {
      await within(dialog).findByText("File information");
      expect(createLibraryDownload).not.toHaveBeenCalled();
      expect(within(dialog).queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Download" }));
      await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, holding.file.id));
    }
  });

  it("shows only observable download preparing, started, and failed states", async () => {
    const user = userEvent.setup();
    let resolveDownload!: (authorization: { method: "GET"; url: string; expiresAt: string }) => void;
    const createLibraryDownload = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveDownload = resolve; }))
      .mockRejectedValueOnce(new ApiError(503, "storage_unavailable"));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
      createLibraryDownload,
    });
    render(<App api={api} />);

    await user.click(within(await openRowMenu("book.pdf")).getByRole("menuitem", { name: "Download" }));
    expect(await screen.findByText("Preparing")).toBeInTheDocument();
    resolveDownload({ method: "GET", url: "https://storage.invalid/book", expiresAt: new Date().toISOString() });
    expect(await screen.findByText("Started")).toBeInTheDocument();

    await user.click(within(await openRowMenu("book.pdf")).getByRole("menuitem", { name: "Download" }));
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});

describe("document preview session", () => {
  type Authorization = Awaited<ReturnType<AcademicCloudApi["createLibraryDownload"]>>;
  function deferredAuthorization() {
    let resolve!: (authorization: Authorization) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Authorization>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }
  function authorization(url: string): Authorization {
    return { method: "GET", url, expiresAt: "2026-09-10T00:00:00Z" };
  }
  function sessionApi(overrides: Partial<AcademicCloudApi> = {}) {
    const holding = LIBRARY_HOLDINGS[0]!;
    return fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([holding]),
      createLibraryDownload: vi.fn().mockResolvedValue(authorization("https://signed.invalid/current.pdf")),
      getLibraryHoldingDetails: vi.fn().mockResolvedValue({
        displayTitle: holding.file.displayName, originalFilename: holding.file.displayName,
        metadataVersion: "m".repeat(43), bibliographyVersion: "b".repeat(43),
        bibliography: null, metadata: null, fieldAuthorities: [], canEditMetadata: false, file: holding.file,
      }),
      generateLibraryCitation: vi.fn(),
      ...overrides,
    });
  }

  function researchApi(): WorkspaceApi {
    const resource = { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source", title: "book.pdf", mediaType: "application/pdf", libraryId: DEFAULT_LIBRARY.id };
    const note = { id: "research-note", resourceId: resource.resourceId, sourceId: resource.sourceId, physicalPage: 7, locator: null,
      body: "Private research text", revision: 1, createdAt: "2026-09-15", updatedAt: "2026-09-15", deletedAt: null };
    return {
      progress: vi.fn().mockResolvedValue(null), saveProgress: vi.fn().mockImplementation(async (resourceId, input) => ({ ...input, resourceId, revision: input.revision + 1, updatedAt: "2026-09-24" })),
    recent: vi.fn().mockResolvedValue({ items: [], resources: [], nextBeforeId: null }), highlights: vi.fn().mockResolvedValue({ items: [], nextBeforeId: null }), createHighlight: vi.fn(), updateHighlight: vi.fn(),
    collections: vi.fn().mockResolvedValue([]), resource: vi.fn().mockResolvedValue({ resource, reading: null, collectionIds: [] }),
      notes: vi.fn().mockResolvedValue({ items: [note], resources: [resource], nextBeforeId: null }),
      note: vi.fn().mockResolvedValue({ note, resource }), createNote: vi.fn(), updateNote: vi.fn(), saveReading: vi.fn(),
      reading: vi.fn().mockResolvedValue({ items: [], resources: [], nextBeforeId: null }),
      createCollection: vi.fn(), updateCollection: vi.fn(), setCollectionItem: vi.fn(), collectionItems: vi.fn(),
    };
  }

  it("puts a Library holding into My research from its row menu", async () => {
    const user = userEvent.setup();
    const workspace = researchApi();
    const api = sessionApi({ workspace });
    render(<App api={api} />);

    await screen.findByRole("button", { name: "book.pdf" });
    await user.click(screen.getByRole("button", { name: "Open actions for book.pdf" }));
    await user.click(screen.getByRole("menuitem", { name: "Put in my research" }));

    const research = await screen.findByRole("region", { name: "My research" });
    expect(workspace.saveReading).toHaveBeenCalledWith("library-file-0", {
      status: "queued", important: false, toCite: false, revision: 0,
    });
    expect(window.location.pathname).toBe("/research");
    expect(screen.queryByRole("dialog", { name: "My research" })).not.toBeInTheDocument();
    expect(within(research).getByRole("heading", { name: "Page notes" })).toBeInTheDocument();
  });

  it("opens private Page Notes as a page and restores research through Back, Forward and refresh", async () => {
    const user = userEvent.setup();
    const api = sessionApi({ workspace: researchApi(), createLibraryDownload: vi.fn().mockResolvedValue({
      ...authorization("https://signed.invalid/research.pdf"), source: { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source" },
    }) });
    const app = render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const preview = await screen.findByRole("dialog", { name: "book.pdf" });
    const trigger = within(preview).getByRole("button", { name: "Page notes" });
    await user.click(trigger);
    const research = await screen.findByRole("region", { name: "My research" });
    await within(research).findByText("Private research text");
    expect(window.location.pathname).toBe("/research");
    expect(preview).not.toBeInTheDocument();
    expect(await within(research).findByTitle("Source: book.pdf")).toHaveAttribute("data-page", "1");
    expect(api.createLibraryDownload).toHaveBeenCalledTimes(2);
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(research).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "book.pdf" })).toBeVisible();
    act(() => window.history.forward());
    const restored = await screen.findByRole("region", { name: "My research" });
    expect(window.location.pathname).toBe("/research");
    await within(restored).findByText("Private research text");
    await within(restored).findByTitle("Source: book.pdf");
    await waitFor(() => expect(api.createLibraryDownload).toHaveBeenCalledTimes(3));

    // A remount models a full application reload with the same browser entry.
    app.unmount();
    render(<App api={api} />);
    const refreshed = await screen.findByRole("region", { name: "My research" });
    await within(refreshed).findByText("Private research text");
    expect(window.location.pathname).toBe("/research");
    await within(refreshed).findByTestId("pdf-reader");
    await waitFor(() => expect(api.createLibraryDownload).toHaveBeenCalledTimes(4));
    expect(window.location.search + window.location.hash).toBe("");
    expect(JSON.stringify(window.history.state)).not.toMatch(/Private research text|signed\.invalid/u);
    await user.click(within(refreshed).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("restores the active document after Library switching and reload without persisting content", async () => {
    const user = userEvent.setup();
    const workspace = researchApi();
    const api = sessionApi({ workspace });
    const app = render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "Open actions for book.pdf" }));
    await user.click(screen.getByRole("menuitem", { name: "Put in my research" }));
    const research = await screen.findByRole("region", { name: "My research" });
    await within(research).findByRole("heading", { name: "book.pdf" });
    await user.click(within(research).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    const notice = document.querySelector(".app-notice") as HTMLElement;
    expect(notice).toBeVisible();
    await user.click(within(notice).getByRole("button", { name: "Dismiss" }));
    expect(document.querySelector(".app-notice")).toBeNull();
    const preference = window.sessionStorage.getItem("academiccloud.view.v1:account-1:research-active");
    expect(JSON.parse(preference!)).toEqual({ resourceId: "library-file-0", sourceId: "research-source" });
    app.unmount();
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "My research" }));
    const restored = await screen.findByRole("region", { name: "My research" });
    expect(await within(restored).findByRole("heading", { name: "book.pdf" })).toBeVisible();
    expect(workspace.resource).toHaveBeenCalledWith("library-file-0");
  });

  it("keeps all research selected after leaving a resource and refreshing", async () => {
    const user = userEvent.setup();
    const api = sessionApi({ workspace: researchApi() });
    const app = render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "Open actions for book.pdf" }));
    await user.click(screen.getByRole("menuitem", { name: "Put in my research" }));
    const research = await screen.findByRole("region", { name: "My research" });
    await within(research).findByRole("heading", { name: "book.pdf" });
    await user.click(within(research).getByRole("button", { name: "All research" }));
    expect(await within(research).findByRole("button", { name: "My resources" })).toBeVisible();
    expect(window.location.pathname).toBe("/research");

    app.unmount();
    render(<App api={api} />);
    const refreshed = await screen.findByRole("region", { name: "My research" });
    expect(await within(refreshed).findByRole("button", { name: "My resources" })).toBeVisible();
    expect(within(refreshed).queryByRole("button", { name: "All research" })).not.toBeInTheDocument();
    await user.click(within(refreshed).getByRole("button", { name: "Page notes" }));
    expect(await within(refreshed).findByText("Private research text")).toBeVisible();
    expect(document.title).toBe("My research · AcademicCloud");
    await user.click(within(refreshed).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(document.title).toBe("AcademicCloud");
  });

  it("opens the private note editor directly from an explicit PDF page jump", async () => {
    const user = userEvent.setup();
    const api = sessionApi({ workspace: researchApi(), createLibraryDownload: vi.fn().mockResolvedValue({
      ...authorization("https://signed.invalid/research.pdf"), source: { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source" },
    }) });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const preview = await screen.findByRole("dialog", { name: "book.pdf" });
    await user.click(within(preview).getByRole("button", { name: "Next page" }));
    expect(preview.querySelector('[data-testid="pdf-reader"]')?.getAttribute("data-page")).toBe("2");
    await user.click(within(preview).getByRole("button", { name: "Page notes" }));
    const research = await screen.findByRole("region", { name: "My research" });
    expect(window.location.pathname).toBe("/research");
    expect(preview).not.toBeInTheDocument();
    const editor = await within(research).findByRole("form", { name: "Write a page note" });
    expect(within(editor).getByRole("spinbutton", { name: "PDF page" })).toHaveValue(2);
    expect(within(editor).getByRole("textbox", { name: "Note" })).toHaveFocus();
  });

  it("protects an inline Reader draft when switching back to Library", async () => {
    const user = userEvent.setup();
    const api = sessionApi({ workspace: researchApi(), createLibraryDownload: vi.fn().mockResolvedValue({ ...authorization("https://signed.invalid/research.pdf"), source: { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source" } }) });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "My research" }));
    const research = await screen.findByRole("region", { name: "My research" });
    await user.click(within(research).getByRole("button", { name: "Page notes" }));
    await user.click(await within(research).findByRole("button", { name: "Open resource" }));
    const reader = await within(research).findByTestId("pdf-reader");
    expect(reader).toHaveAttribute("data-page", "7");
    await user.click(within(reader).getByRole("button", { name: "Next page" }));
    await user.click(within(research).getByRole("button", { name: "Write a page note" }));
    const editor = within(research).getByRole("form", { name: "Write a page note" });
    await user.type(within(editor).getByRole("textbox", { name: "Note" }), "Private Reader page eight draft");
    await user.click(within(research).getByRole("button", { name: "Library" }));
    expect(await within(research).findByText("Save or discard your note changes before leaving.")).toBeInTheDocument();
    expect(within(editor).getByRole("textbox", { name: "Note" })).toHaveValue("Private Reader page eight draft");
    expect(within(editor).getByRole("spinbutton", { name: "PDF page" })).toHaveValue(8);
    expect(window.location.pathname).toBe("/research");
    expect(JSON.stringify(window.history.state)).not.toMatch(/Private Reader|signed\.invalid/u);
    await user.click(within(editor).getByRole("button", { name: "Discard changes" }));
    await user.click(within(research).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it.each(["note", "collection"] as const)("preserves an unsaved %s on the research page through Back until discard", async (draft) => {
    const user = userEvent.setup();
    const api = sessionApi({ workspace: researchApi(), createLibraryDownload: vi.fn().mockResolvedValue({
      ...authorization("https://signed.invalid/research.pdf"), source: { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source" },
    }) });
    render(<App api={api} />);
    const row = await screen.findByRole("button", { name: "book.pdf" });
    await user.click(row);
    const preview = await screen.findByRole("dialog", { name: "book.pdf" });
    const trigger = within(preview).getByRole("button", { name: "Page notes" });
    await user.click(trigger);
    const research = await screen.findByRole("region", { name: "My research" });
    await within(research).findByText("Private research text");
    const editor = await within(research).findByRole("form", { name: "Write a page note" });
    if (draft === "collection") await user.click(within(editor).getByRole("button", { name: "Cancel" }));
    const input = within(research).getByRole("textbox", { name: draft === "note" ? "Note" : "Collection name" });
    await user.type(input, "Private unsaved draft");
    const draftHistoryState: unknown = window.history.state;
    const historyLength = window.history.length;
    act(() => window.history.back());
    await within(research).findByText(`Save or discard your ${draft} changes before leaving.`);
    await waitFor(() => expect(window.history.state).toEqual(draftHistoryState));
    expect(input).toHaveValue("Private unsaved draft");
    expect(research).toBeInTheDocument();
    expect(window.location.pathname).toBe("/research");
    expect(window.history.length).toBe(historyLength);
    expect(JSON.stringify(window.history.state)).not.toMatch(/Private|signed\.invalid/u);
    expect(window.location.hash + window.location.search).toBe("");
    await user.click(within(research).getByRole("button", { name: "Discard changes" }));
    await user.click(within(research).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(research).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
    expect(row).toBeVisible();
    expect(document.querySelector('[data-testid="pdf-reader"]')).toBeNull();
    expect(api.createLibraryDownload).toHaveBeenCalledTimes(2);
  });

  it("blocks Back while a research page write is pending and returns to Library after it saves", async () => {
    const user = userEvent.setup();
    const researchApiValue = researchApi();
    let finish!: (value: Awaited<ReturnType<WorkspaceApi["saveReading"]>>) => void;
    researchApiValue.saveReading = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const api = sessionApi({ workspace: researchApiValue, createLibraryDownload: vi.fn().mockResolvedValue({
      ...authorization("https://signed.invalid/research.pdf"), source: { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source" },
    }) });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const preview = await screen.findByRole("dialog", { name: "book.pdf" });
    await user.click(within(preview).getByRole("button", { name: "Page notes" }));
    const research = await screen.findByRole("region", { name: "My research" });
    const editor = await within(research).findByRole("form", { name: "Write a page note" });
    await user.click(within(editor).getByRole("button", { name: "Cancel" }));
    const status = await within(research).findByRole("combobox", { name: "Reading status" });
    await user.selectOptions(status, "reading");
    expect(status).toBeDisabled();
    const pendingHistoryState: unknown = window.history.state;
    act(() => window.history.back());
    await within(research).findByText("Save or discard your note changes before leaving.");
    await waitFor(() => expect(window.history.state).toEqual(pendingHistoryState));
    expect(research).toBeInTheDocument();
    expect(window.location.pathname).toBe("/research");
    await act(async () => finish({ resourceId: LIBRARY_HOLDINGS[0]!.file.id, status: "reading", important: false, toCite: false, revision: 1, updatedAt: "2026-09-21" }));
    expect(status).toHaveValue("reading");
    act(() => window.history.back());
    await waitFor(() => expect(research).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
    expect(document.querySelector('[data-testid="pdf-reader"]')).toBeNull();
  });

  it("opens a saved note page in the independent research reader", async () => {
    const user = userEvent.setup(); const api = sessionApi({ workspace: researchApi(), createLibraryDownload: vi.fn().mockResolvedValue({ ...authorization("https://signed.invalid/research.pdf"), source: { resourceId: LIBRARY_HOLDINGS[0]!.file.id, sourceId: "research-source" } }) });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "My research" }));
    const research = await screen.findByRole("region", { name: "My research" });
    await user.click(within(research).getByRole("button", { name: "Page notes" }));
    await user.click(await within(research).findByRole("button", { name: "Open resource" }));
    expect(await within(research).findByTestId("pdf-reader")).toHaveAttribute("data-page", "7");
    expect(screen.queryByRole("dialog", { name: "book.pdf" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/research");
    await user.click(within(research).getByRole("button", { name: "All research" }));
    expect(within(research).queryByTestId("pdf-reader")).not.toBeInTheDocument();
    await within(research).findByText("Private research text");
    await user.click(within(research).getByRole("button", { name: "Library" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it.each(["sourceId", "resourceId"] as const)("rejects a fresh inline authorization with a different %s in Research", async (mismatch) => {
    const user = userEvent.setup();
    const holding = LIBRARY_HOLDINGS[0]!;
    const wrongSource = mismatch === "sourceId"
      ? { resourceId: holding.file.id, sourceId: "changed-source" }
      : { resourceId: "different-resource", sourceId: "research-source" };
    const api = sessionApi({ workspace: researchApi(),
      getLibraryHoldingDetails: vi.fn().mockResolvedValue({ holding, displayTitle: "book.pdf", originalFilename: "book.pdf",
        metadataVersion: "m".repeat(43), bibliographyVersion: "b".repeat(43), bibliography: null, metadata: null, fieldAuthorities: [], canEditMetadata: false, file: holding.file }),
      createLibraryDownload: vi.fn().mockResolvedValueOnce({ ...authorization("https://signed.invalid/original.pdf"), source: { resourceId: holding.file.id, sourceId: "research-source" } })
        .mockResolvedValueOnce({ ...authorization("https://signed.invalid/replacement.pdf"), source: wrongSource }),
    });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const preview = await screen.findByRole("dialog", { name: "book.pdf" });
    await user.click(within(preview).getByRole("button", { name: "Page notes" }));
    const research = await screen.findByRole("region", { name: "My research" });
    expect(await within(research).findByRole("alert")).toHaveTextContent("The source file changed. Return to the Library and reopen it.");
    expect(window.location.pathname).toBe("/research");
    expect(preview).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="pdf-reader"]')).toBeNull();
    expect(api.createLibraryDownload).toHaveBeenCalledTimes(2);
  });

  it("blocks an original-file download when the source changes after the Reader opens", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const holding = LIBRARY_HOLDINGS[0]!;
    const original = { ...authorization("https://signed.invalid/original.pdf"), source: { resourceId: holding.file.id, sourceId: "research-source" } };
    const replaced = { ...authorization("https://signed.invalid/replacement.pdf"), source: { resourceId: holding.file.id, sourceId: "changed-source" } };
    const createLibraryDownload = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(original).mockResolvedValueOnce(replaced);
    const api = sessionApi({ workspace: researchApi(), createLibraryDownload });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    await user.click(within(await screen.findByRole("dialog", { name: "book.pdf" })).getByRole("button", { name: "Page notes" }));
    const research = await screen.findByRole("region", { name: "My research" });
    expect(await within(research).findByTitle("Source: book.pdf")).toHaveAttribute("data-page", "1");
    await user.click(within(research).getByRole("button", { name: "Download original" }));
    await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledTimes(3));
    expect(click).not.toHaveBeenCalled();
    expect(within(research).getByTitle("Source: book.pdf")).toHaveAttribute("data-page", "1");
    click.mockRestore();
  });

  it.each(["account", "library"] as const)("opens the %s preview shell before source authorization completes", async (scope) => {
    const user = userEvent.setup();
    const pending = deferredAuthorization();
    const createDownload = vi.fn().mockReturnValue(pending.promise);
    const api = sessionApi(scope === "account" ? {
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      listLibraryHoldings: vi.fn().mockResolvedValue([]), createDownload,
    } : { createLibraryDownload: createDownload });
    render(<App api={api} />);
    const name = scope === "account" ? FILE.displayName : LIBRARY_HOLDINGS[0]!.file.displayName;
    if (scope === "account") await user.click(within(await openRowMenu(name)).getByRole("menuitem", { name: "Preview" }));
    else await user.click(await screen.findByRole("button", { name }));
    const shell = await screen.findByRole("dialog", { name });
    expect(within(shell).getByRole("status")).toBeInTheDocument();
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toBeNull();
    expect(within(shell).getByRole("button", { name: "Download" })).toBeEnabled();
    expect(createDownload).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(authorization("https://signed.invalid/ready.pdf")));
    expect(screen.getByRole("dialog", { name })).toBe(shell);
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toHaveAttribute("data-source", "https://signed.invalid/ready.pdf");
  });

  it("does not reopen a closed document when its source authorization arrives late", async () => {
    const user = userEvent.setup();
    const pending = deferredAuthorization();
    const api = sessionApi({ createLibraryDownload: vi.fn().mockReturnValue(pending.promise) });
    render(<App api={api} />);
    const trigger = await screen.findByRole("button", { name: "book.pdf" });
    await user.click(trigger);
    const shell = await screen.findByRole("dialog", { name: "book.pdf" });
    await user.click(within(shell).getByRole("button", { name: "Close preview" }));
    await act(async () => pending.resolve(authorization("https://signed.invalid/late.pdf")));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="pdf-reader"]')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("never lets a closed request replace a reopened document's source", async () => {
    const user = userEvent.setup();
    const first = deferredAuthorization();
    const second = deferredAuthorization();
    const createLibraryDownload = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<App api={sessionApi({ createLibraryDownload })} />);
    const trigger = await screen.findByRole("button", { name: "book.pdf" });
    await user.click(trigger);
    await user.click(within(await screen.findByRole("dialog", { name: "book.pdf" })).getByRole("button", { name: "Close preview" }));
    await user.click(trigger);
    const reopened = await screen.findByRole("dialog", { name: "book.pdf" });
    await act(async () => second.resolve(authorization("https://signed.invalid/new.pdf")));
    const frame = reopened.querySelector('[data-testid="pdf-reader"]');
    expect(frame).toHaveAttribute("data-source", "https://signed.invalid/new.pdf");
    await act(async () => first.resolve(authorization("https://signed.invalid/old.pdf")));
    expect(reopened.querySelector('[data-testid="pdf-reader"]')).toBe(frame);
    expect(frame).toHaveAttribute("data-source", "https://signed.invalid/new.pdf");
    expect(createLibraryDownload).toHaveBeenCalledTimes(2);
  });

  it("keeps authorization errors in the same shell and retries without initiating a download", async () => {
    const user = userEvent.setup();
    const retry = deferredAuthorization();
    const createLibraryDownload = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, "preview_unavailable"))
      .mockReturnValueOnce(retry.promise);
    render(<App api={sessionApi({ createLibraryDownload })} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const shell = await screen.findByRole("dialog", { name: "book.pdf" });
    expect(await within(shell).findByRole("alert")).toHaveTextContent("Online preview is currently unavailable");
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toBeNull();
    expect(within(shell).getByRole("button", { name: "Download" })).toBeEnabled();
    await user.click(within(shell).getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("dialog", { name: "book.pdf" })).toBe(shell);
    await act(async () => retry.resolve(authorization("https://signed.invalid/retried.pdf")));
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toHaveAttribute("data-source", "https://signed.invalid/retried.pdf");
    expect(within(shell).queryByRole("alert")).not.toBeInTheDocument();
    expect(createLibraryDownload.mock.calls).toEqual([
      [DEFAULT_LIBRARY.id, LIBRARY_HOLDINGS[0]!.file.id, "inline"],
      [DEFAULT_LIBRARY.id, LIBRARY_HOLDINGS[0]!.file.id, "inline"],
    ]);
  });

  it("retains one reader and authorization across Details close and its Preview action", async () => {
    const user = userEvent.setup();
    const api = sessionApi();
    render(<App api={api} />);
    const trigger = await screen.findByRole("button", { name: "book.pdf" });
    await user.click(trigger);
    const shell = await screen.findByRole("dialog", { name: "book.pdf" });
    const frame = await within(shell).findByTitle("Preview of book.pdf");
    await user.click(within(shell).getByRole("button", { name: "Resource details" }));
    let details = await screen.findByRole("dialog", { name: "book.pdf" });
    expect(details).not.toBe(shell);
    expect(shell).toHaveAttribute("inert");
    expect(frame).toBeInTheDocument();
    await user.click(await within(details).findByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog", { name: "book.pdf" })).toBe(shell);
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toBe(frame);
    expect(shell).not.toHaveAttribute("inert");

    await user.click(within(shell).getByRole("button", { name: "Resource details" }));
    details = await screen.findByRole("dialog", { name: "book.pdf" });
    await user.click(within(details).getByRole("button", { name: "Close resource details" }));
    expect(screen.getByRole("dialog", { name: "book.pdf" })).toBe(shell);
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toBe(frame);
    expect(api.createLibraryDownload).toHaveBeenCalledTimes(1);
    await user.click(within(shell).getByRole("button", { name: "Close preview" }));
    expect(trigger).toHaveFocus();
  });

  it("reopens loaded Details without briefly mounting the workspace-loading dialog", async () => {
    const user = userEvent.setup();
    render(<App api={sessionApi()} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const shell = await screen.findByRole("dialog", { name: "book.pdf" });
    await user.click(within(shell).getByRole("button", { name: "Resource details" }));
    const first = await screen.findByRole("dialog", { name: "book.pdf" });
    await within(first).findByText("File information");
    await user.click(within(first).getByRole("button", { name: "Close resource details" }));

    const loadingDialogs: Element[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("dialog.deferred-dialog")) loadingDialogs.push(node);
        loadingDialogs.push(...node.querySelectorAll("dialog.deferred-dialog"));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      await user.click(within(shell).getByRole("button", { name: "Resource details" }));
      const reopened = await screen.findByRole("dialog", { name: "book.pdf" });
      await within(reopened).findByText("File information");
      // A final DOM snapshot misses a fallback that mounted and disappeared
      // during import resolution; retain observed additions across the click.
      expect(loadingDialogs).toEqual([]);
    } finally {
      observer.disconnect();
    }
  });

  it("updates the reading title after metadata save without replacing the source reader", async () => {
    const user = userEvent.setup();
    const holding = LIBRARY_HOLDINGS[0]!;
    const detail = {
      holding, displayTitle: holding.file.displayName, originalFilename: holding.file.displayName,
      metadataVersion: "m".repeat(43), bibliographyVersion: "b".repeat(43),
      bibliography: null, metadata: null, fieldAuthorities: [], canEditMetadata: true, file: holding.file,
    };
    const updated = { ...holding, canonicalTitle: "New canonical title", catalogueDisplayTitle: "New canonical title" };
    const api = sessionApi({
      getLibraryHoldingDetails: vi.fn().mockResolvedValue(detail),
      updateLibraryHoldingMetadata: vi.fn().mockResolvedValue({ ...detail, holding: updated, displayTitle: "New canonical title" }),
    });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "book.pdf" }));
    const shell = screen.getByRole("dialog", { name: "book.pdf" });
    const frame = await within(shell).findByTitle("Preview of book.pdf");
    await user.click(within(shell).getByRole("button", { name: "Resource details" }));
    await user.click(await screen.findByRole("button", { name: "Edit title and contributors" }));
    await user.type(screen.getByLabelText("Canonical title"), "New canonical title");
    await user.click(screen.getByRole("button", { name: "Save metadata" }));
    await waitFor(() => expect(api.updateLibraryHoldingMetadata).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog", { name: "New canonical title" })).toBe(shell);
    expect(shell.querySelector('[data-testid="pdf-reader"]')).toBe(frame);
    expect(frame).toHaveAttribute("title", "Preview of New canonical title");
    expect(api.createLibraryDownload).toHaveBeenCalledTimes(1);
  });

  it("retains the document under Citation and browser Back closes the entire session", async () => {
    const user = userEvent.setup();
    const api = sessionApi();
    render(<App api={api} />);
    const trigger = await screen.findByRole("button", { name: "book.pdf" });
    await user.click(trigger);
    const shell = await screen.findByRole("dialog", { name: "book.pdf" });
    const frame = await within(shell).findByTitle("Preview of book.pdf");
    await user.click(within(shell).getByRole("button", { name: "Citation" }));
    const citation = await screen.findByRole("dialog", { name: "book.pdf" });
    expect(citation).not.toBe(shell);
    expect(shell).toHaveAttribute("inert");
    expect(frame).toBeInTheDocument();
    expect(api.createLibraryDownload).toHaveBeenCalledTimes(1);
    act(() => window.history.back());
    await waitFor(() => expect(document.querySelectorAll("dialog[open]")).toHaveLength(0));
    expect(frame).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("resource-scope catalogue interactions", () => {
  it("selects a real Library checkbox and limits a mixed account/Library toolbar to shared capabilities", async () => {
    const user = userEvent.setup();
    const holding = { ...LIBRARY_HOLDINGS[0], canonicalTitle: "Canonical book", authorLabels: ["Author A", "Author B"] };
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [] }),
      listLibraryHoldings: vi.fn().mockResolvedValue([holding]),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const libraryCheckbox = await screen.findByRole("checkbox", { name: "Select Author A、Author B Canonical book" });
    await user.click(libraryCheckbox);
    expect(libraryCheckbox).toBeChecked();
    let toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByRole("button", { name: "Add favorites" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Move" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select Sources" }));
    toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByText("2 selected")).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Add favorites" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Move" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Move to trash" })).not.toBeInTheDocument();
  });

  it("shows exactly one contextual Favorite action and updates it from authoritative state", async () => {
    const user = userEvent.setup();
    const listFavorites = vi.fn()
      .mockResolvedValueOnce({ files: [FILE], folders: [] })
      .mockResolvedValue({ files: [FILE], folders: [{ ...FOLDER, ancestors: [] }] });
    const setFolderFavorite = vi.fn().mockResolvedValue(undefined);
    const setFileFavorite = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      listFavorites,
      setFolderFavorite,
      setFileFavorite,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await user.click(await screen.findByRole("checkbox", { name: "Select Sources" }));
    await user.click(screen.getByRole("checkbox", { name: "Select paper.pdf" }));
    let toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByRole("button", { name: "Add favorites" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Remove favorites" })).not.toBeInTheDocument();
    await user.click(within(toolbar).getByRole("button", { name: "Add favorites" }));
    await waitFor(() => expect(setFolderFavorite).toHaveBeenCalledWith(FOLDER.id, true));
    expect(setFileFavorite).not.toHaveBeenCalled();
    await waitFor(() => expect(listFavorites).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("checkbox", { name: "Select Sources" }));
    await user.click(screen.getByRole("checkbox", { name: "Select paper.pdf" }));
    toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByRole("button", { name: "Remove favorites" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Add favorites" })).not.toBeInTheDocument();
  });

  it("preserves Member Favorite capability without exposing destructive Library actions", async () => {
    const user = userEvent.setup();
    const member = { id: "member-1", loginName: "Reader", role: "member" as const };
    const memberLibrary = { ...DEFAULT_LIBRARY, role: "member" as const };
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(member),
      listLibraries: vi.fn().mockResolvedValue([memberLibrary]),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]]),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await user.click(await screen.findByRole("checkbox", { name: "Select book.pdf" }));
    const toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByRole("button", { name: "Add favorites" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Move to trash" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Move" })).not.toBeInTheDocument();
  });

  it("keeps Library Favorites on the composed catalogue title and Library Preview/Download routes", async () => {
    const user = userEvent.setup();
    const holding = { ...LIBRARY_HOLDINGS[0]!, canonicalTitle: "Canonical favorite title", authorLabels: ["Favorite Author"] };
    const createLibraryDownload = vi.fn().mockResolvedValue({
      method: "GET", url: "https://storage.invalid/library", expiresAt: "2026-08-19T00:00:00.000Z",
    });
    const createDownload = vi.fn();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listFavorites: vi.fn().mockResolvedValue({
        files: [], folders: [], libraryHoldings: [{ library: DEFAULT_LIBRARY, holding }],
      }),
      createLibraryDownload,
      createDownload,
    });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("Favorite Author Canonical favorite title")).toBeInTheDocument();
    expect(screen.queryByText("book.pdf")).not.toBeInTheDocument();
    let menu = await openRowMenu("Favorite Author Canonical favorite title");
    await user.click(within(menu).getByRole("menuitem", { name: "Preview" }));
    await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, holding.file.id, "inline"));
    expect(await screen.findByRole("heading", { name: "Favorite Author Canonical favorite title" })).toBeInTheDocument();
    expect(createDownload).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Close preview" }));
    menu = await openRowMenu("Favorite Author Canonical favorite title");
    await user.click(within(menu).getByRole("menuitem", { name: "Download" }));
    await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, holding.file.id));
    expect(createDownload).not.toHaveBeenCalled();
  });

  it("selects account and Library Recycle rows and restores through each domain lifecycle", async () => {
    const user = userEvent.setup();
    const accountDeleted = { ...FILE, state: "deleted" as const, deletedAt: "2026-08-18T00:00:00.000Z" };
    const libraryDeleted = {
      version: "r".repeat(43), canonicalTitle: "Canonical recycled title",
      file: { id: "library-deleted", displayName: "acquired.pdf", mediaType: "application/pdf", sizeBytes: 8, deletedAt: "2026-08-18T00:00:00.000Z" },
    };
    const restoreFile = vi.fn().mockResolvedValue(FILE);
    const restoreLibraryHolding = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [accountDeleted] }),
      listLibraryRecycle: vi.fn().mockResolvedValue([libraryDeleted]),
      restoreFile,
      restoreLibraryHolding,
    });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "Recycle" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select paper.pdf" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select Canonical recycled title" }));
    const toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Delete forever" })).toBeInTheDocument();
    await user.click(within(toolbar).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restoreFile).toHaveBeenCalledWith(accountDeleted.id));
    expect(restoreLibraryHolding).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, libraryDeleted.file.id, libraryDeleted.version);
  });

  it("uses direct folder recycle from the top toolbar and reports partial permanent deletion truthfully", async () => {
    const user = userEvent.setup();
    const deleteFolder = vi.fn().mockResolvedValue(undefined);
    const bulkOperation = vi.fn();
    const rootApi = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [] }),
      deleteFolder,
      bulkOperation,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const first = render(<App api={rootApi} />);
    await screen.findByRole("heading", { name: "Library" });
    await user.click(await screen.findByRole("checkbox", { name: "Select Sources" }));
    await user.click(screen.getByRole("button", { name: "Move to trash" }));
    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith(FOLDER.id));
    expect(bulkOperation).not.toHaveBeenCalled();
    first.unmount();

    const accountDeleted = { ...FILE, state: "deleted" as const, deletedAt: "2026-08-18T00:00:00.000Z" };
    const libraryDeleted = {
      version: "r".repeat(43), canonicalTitle: null,
      file: { id: "library-deleted", displayName: "library.pdf", mediaType: "application/pdf", sizeBytes: 8, deletedAt: "2026-08-18T00:00:00.000Z" },
    };
    const permanentlyDeleteFile = vi.fn().mockResolvedValue(undefined);
    const permanentlyDeleteLibraryHolding = vi.fn().mockRejectedValue(new ApiError(409, "concurrent_change"));
    const recycleApi = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [accountDeleted] }),
      listLibraryRecycle: vi.fn().mockResolvedValue([libraryDeleted]),
      permanentlyDeleteFile,
      permanentlyDeleteLibraryHolding,
    });
    render(<App api={recycleApi} />);
    await user.click(await screen.findByRole("button", { name: "Recycle" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select paper.pdf" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select library.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete forever" }));
    await waitFor(() => expect(permanentlyDeleteFile).toHaveBeenCalledWith(accountDeleted.id, accountDeleted.version));
    expect(permanentlyDeleteLibraryHolding).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, libraryDeleted.file.id, libraryDeleted.version);
    expect(await screen.findByRole("status")).toHaveTextContent("Permanently deleted 1 of 2");
    expect(screen.getByRole("checkbox", { name: "Select library.pdf" })).toBeChecked();
  });
});

describe("bounded atomic bulk operations", () => {
  it("selects mixed rows, applies contextual Favorites only where missing, and clears on success", async () => {
    const user = userEvent.setup();
    const bulkOperation = vi.fn().mockImplementation(async (input: BulkOperationInput) => ({
      action: input.action,
      atomic: true as const,
      items: input.items.map((selected) => ({ ...selected, outcome: "succeeded" as const })),
    }));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      bulkOperation,
      setFolderFavorite: vi.fn().mockResolvedValue(undefined),
      setFileFavorite: vi.fn().mockResolvedValue(undefined),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(await screen.findByRole("checkbox", { name: "Select Sources" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select paper.pdf" }));
    const toolbar = screen.getByRole("toolbar", { name: "Selected item actions" });
    expect(within(toolbar).getByText("2 selected")).toBeInTheDocument();
    await user.click(within(toolbar).getByRole("button", { name: "Add favorites" }));

    await waitFor(() => expect(api.setFolderFavorite).toHaveBeenCalledWith(FOLDER.id, true));
    expect(api.setFileFavorite).toHaveBeenCalledWith(FILE.id, true);
    expect(bulkOperation).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar", { name: "Selected item actions" })).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Updated 2 selected items");
  });

  it("confirms destructive recycle, reports atomic failure, and retains a retryable selection", async () => {
    const user = userEvent.setup();
    const bulkOperation = vi.fn().mockRejectedValue(new ApiError(409, "concurrent_change"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      bulkOperation,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const checkbox = await screen.findByRole("checkbox", { name: "Select paper.pdf" });
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Move to trash" }));

    await waitFor(() => expect(bulkOperation).toHaveBeenCalledWith({
      action: "recycle",
      items: [{ kind: "file", id: FILE.id, version: FILE.version }],
    }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 selected items"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The batch was not applied");
    expect(screen.getByRole("status")).toHaveTextContent("No selected item was changed");
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("toolbar", { name: "Selected item actions" })).not.toBeInTheDocument();
  });

  it("bulk-restores selected recycle roots and exposes touch-sized labeled selection controls", async () => {
    const user = userEvent.setup();
    const deleted = {
      ...FILE,
      state: "deleted" as const,
      deletedAt: "2026-08-17T12:00:00.000Z",
      version: "r".repeat(43),
    };
    const bulkOperation = vi.fn().mockImplementation(async (input: BulkOperationInput) => ({
      action: input.action,
      atomic: true as const,
      items: input.items.map((selected) => ({ ...selected, outcome: "succeeded" as const })),
    }));
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listRecycle: vi.fn().mockResolvedValue({ folders: [], files: [deleted] }),
      bulkOperation,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await user.click(screen.getByRole("button", { name: "Recycle" }));

    const checkbox = await screen.findByRole("checkbox", { name: "Select paper.pdf" });
    expect(checkbox.closest(".entry-select-control")).not.toBeNull();
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(bulkOperation).toHaveBeenCalledWith({
      action: "restore",
      items: [{ kind: "file", id: deleted.id, version: deleted.version }],
    }));
  });

  it("moves a selected batch through the existing keyboard-safe destination dialog", async () => {
    const user = userEvent.setup();
    const destination = { ...FOLDER, id: "folder-2", name: "Destination", version: "d".repeat(43) };
    const listEntries = vi.fn((folderId: string | null) => Promise.resolve(
      folderId === null
        ? { folder: null, folders: [FOLDER, destination], files: [] }
        : { folder: destination, folders: [], files: [] },
    ));
    const bulkOperation = vi.fn().mockImplementation(async (input: BulkOperationInput) => ({
      action: input.action,
      atomic: true as const,
      items: input.items.map((selected) => ({ ...selected, outcome: "succeeded" as const })),
    }));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries, bulkOperation });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(await screen.findByRole("checkbox", { name: "Select Sources" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “1 selected”" });
    await user.click(within(dialog).getByRole("button", { name: "Destination" }));
    await waitFor(() => expect(listEntries).toHaveBeenCalledWith(destination.id, expect.any(AbortSignal)));
    await user.click(within(dialog).getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(bulkOperation).toHaveBeenCalledWith({
      action: "move",
      items: [{ kind: "folder", id: FOLDER.id, version: FOLDER.version }],
      destinationFolderId: destination.id,
    }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears stale selection on navigation before another view renders", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await user.click(await screen.findByRole("checkbox", { name: "Select paper.pdf" }));
    expect(screen.getByRole("toolbar", { name: "Selected item actions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.queryByRole("toolbar", { name: "Selected item actions" })).not.toBeInTheDocument();
  });
});

describe("scholarly record detail component (not a global shell destination)", () => {
  const EMPTY_RECORD: ScholarlyRecord = {
    id: "record-1",
    label: "Private source",
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    artifactCount: 0,
    artifacts: [],
    nextBeforeArtifactId: null,
  };
  const ATTACHED_RECORD: ScholarlyRecord = {
    ...EMPTY_RECORD,
    artifactCount: 1,
    artifacts: [{
      id: "artifact-1",
      recordId: EMPTY_RECORD.id,
      attachmentState: "attached",
      createdAt: EMPTY_RECORD.createdAt,
      updatedAt: EMPTY_RECORD.updatedAt,
      version: {
        id: "version-1",
        createdAt: EMPTY_RECORD.createdAt,
        updatedAt: EMPTY_RECORD.updatedAt,
        file: { id: FILE.id, displayName: FILE.displayName, state: "active", availability: "available" },
      },
    }],
  };

  it("creates a distinct record, attaches a current-folder file, detaches, and reattaches stable identities", async () => {
    const user = userEvent.setup();
    const createScholarlyRecord = vi.fn().mockResolvedValue(EMPTY_RECORD);
    const attachFileToScholarlyRecord = vi.fn().mockResolvedValue(ATTACHED_RECORD);
    const detached = {
      ...ATTACHED_RECORD,
      artifacts: ATTACHED_RECORD.artifacts.map((artifact) => ({ ...artifact, attachmentState: "detached" as const })),
    };
    const detachScholarlyArtifact = vi.fn().mockResolvedValue(detached);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      listScholarlyRecords: vi.fn().mockResolvedValue({ records: [], nextBeforeId: null }),
      getScholarlyRecord: vi.fn().mockResolvedValue(EMPTY_RECORD),
      createScholarlyRecord,
      attachFileToScholarlyRecord,
      detachScholarlyArtifact,
    });
    render(<LanguageProvider><ScholarlyRecordsDialog api={api} availableFiles={[FILE]} onClose={vi.fn()} returnFocus={null} /></LanguageProvider>);
    const dialog = await screen.findByRole("dialog", { name: "Scholarly records" });
    expect(within(dialog).getByText("No scholarly records")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Record label"), EMPTY_RECORD.label);
    await user.click(within(dialog).getByRole("button", { name: "Create record" }));
    await waitFor(() => expect(createScholarlyRecord).toHaveBeenCalledWith(EMPTY_RECORD.label));

    await user.selectOptions(within(dialog).getByLabelText("Files in this folder"), FILE.id);
    await user.click(within(dialog).getByRole("button", { name: "Attach file" }));
    await waitFor(() => expect(attachFileToScholarlyRecord).toHaveBeenCalledWith(EMPTY_RECORD.id, FILE.id));
    expect(within(dialog).getAllByText(FILE.displayName).length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText("Attached")).toBeInTheDocument();
    expect(within(dialog).getByText("Available")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Detach" }));
    await waitFor(() => expect(detachScholarlyArtifact).toHaveBeenCalledWith(EMPTY_RECORD.id, "artifact-1"));
    expect(within(dialog).getByText("Detached")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reattach" }));
    await waitFor(() => expect(attachFileToScholarlyRecord).toHaveBeenLastCalledWith(EMPTY_RECORD.id, FILE.id));
  });

  it("is available to Members and keeps conflict feedback in the record dialog", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue({ ...ACCOUNT, role: "member" as const }),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      listScholarlyRecords: vi.fn().mockResolvedValue({ records: [EMPTY_RECORD], nextBeforeId: null }),
      getScholarlyRecord: vi.fn().mockResolvedValue(EMPTY_RECORD),
      attachFileToScholarlyRecord: vi.fn().mockRejectedValue(new ApiError(409, "conflict")),
    });
    render(<LanguageProvider><ScholarlyRecordsDialog api={api} availableFiles={[FILE]} onClose={vi.fn()} returnFocus={null} /></LanguageProvider>);
    const dialog = await screen.findByRole("dialog", { name: "Scholarly records" });
    await user.selectOptions(await within(dialog).findByLabelText("Files in this folder"), FILE.id);
    await user.click(within(dialog).getByRole("button", { name: "Attach file" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already attached to another scholarly record");
    expect(within(dialog).getByLabelText("Files in this folder")).toHaveValue(FILE.id);
  });

  it("does not let a stale artifact page overwrite a newly selected record", async () => {
    const user = userEvent.setup();
    const first: ScholarlyRecord = {
      ...ATTACHED_RECORD,
      artifactCount: 2,
      nextBeforeArtifactId: "artifact-1",
    };
    const second: ScholarlyRecord = {
      ...EMPTY_RECORD,
      id: "record-2",
      label: "Second source",
    };
    let resolveOlder!: (record: ScholarlyRecord) => void;
    const olderPage = new Promise<ScholarlyRecord>((resolve) => {
      resolveOlder = resolve;
    });
    const getScholarlyRecord = vi.fn((recordId: string, _signal?: AbortSignal, beforeArtifactId?: string) => {
      if (recordId === first.id && beforeArtifactId) return olderPage;
      return Promise.resolve(recordId === first.id ? first : second);
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listScholarlyRecords: vi.fn().mockResolvedValue({ records: [first, second], nextBeforeId: null }),
      getScholarlyRecord,
    });
    render(<LanguageProvider><ScholarlyRecordsDialog api={api} availableFiles={[]} onClose={vi.fn()} returnFocus={null} /></LanguageProvider>);
    const dialog = await screen.findByRole("dialog", { name: "Scholarly records" });
    await within(dialog).findByRole("heading", { name: first.label });
    await user.click(within(dialog).getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(getScholarlyRecord).toHaveBeenCalledWith(first.id, undefined, "artifact-1"));
    await user.click(within(dialog).getByRole("button", { name: /Second source/ }));
    await within(dialog).findByRole("heading", { name: second.label });

    resolveOlder({ ...first, nextBeforeArtifactId: null });
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: second.label })).toBeInTheDocument());
  });
});

describe("zero-descriptive-copy", () => {
  it("removes all marketing and explanatory copy from the login screen", async () => {
    const api = fakeApi();
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "AC AcademicCloud" })).toBeInTheDocument();
    expect(screen.queryByText(/quieter home|private academic workspace|private by design|welcome back|sign in to continue/i)).not.toBeInTheDocument();
    expect(screen.queryByText("A quieter home for serious work.")).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
    expect(screen.queryByText(/privacy/i)).not.toBeInTheDocument();
    // The functional login surface is intact.
    expect(screen.getByLabelText("Login name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中文" })).toBeInTheDocument();
  });

  it("renders every empty state without explanatory second sentences", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listLibraries: vi.fn().mockResolvedValue([]) });
    render(<App api={api} />);

    expect(await screen.findByText("Library is unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/upload a source file|create a folder to begin/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("No favorites yet")).toBeInTheDocument();
    expect(screen.queryByText(/star files and folders in the library/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pending" }));
    expect(await screen.findByText("No pending uploads")).toBeInTheDocument();
    expect(screen.queryByText(/choose the exact same local file|interrupted or unverified uploads/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(await screen.findByText("Recycle bin is empty")).toBeInTheDocument();
    expect(screen.queryByText(/restoring keeps the original stored bytes|soft-deleted files and folders/i)).not.toBeInTheDocument();
  });

  it("shows a terse preview footer: no descriptive claims and no verbose new-tab text", async () => {
    const user = userEvent.setup();
    const createDownload = vi.fn().mockResolvedValue({
      method: "GET",
      url: "https://signed.invalid/preview",
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
      createDownload,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const menu = await openRowMenu("paper.pdf");
    await user.click(within(menu).getByRole("menuitem", { name: "Preview" }));
    const dialog = await screen.findByRole("dialog", { name: "paper.pdf" });

    expect(within(dialog).queryByText(/short-lived|expires automatically/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /new tab/i })).not.toBeInTheDocument();
    // Open remains accessible with the terse label and the signed inline URL.
    expect(within(dialog).getByRole("link", { name: "Open" })).toHaveAttribute("href", "https://signed.invalid/preview#page=1");

    // Download is a separate, normal authoritative path (attachment) that must
    // not reuse the inline preview URL.
    await user.click(within(dialog).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(createDownload).toHaveBeenLastCalledWith("file-1"));
  });

  it("renders no runtime inline styles anywhere in the drive UI (production CSP)", async () => {
    const user = userEvent.setup();
    const createDownload = vi.fn().mockResolvedValue({
      method: "GET",
      url: "https://signed.invalid/preview",
      expiresAt: "2026-08-13T00:05:00.000Z",
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
      createDownload,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await openRowMenu("paper.pdf");
    const menu = await openRowMenu("Sources");
    await user.click(within(menu).getByRole("menuitem", { name: "Move" }));
    await screen.findByRole("dialog", { name: "Move “Sources”" });
    expect(document.querySelectorAll("[style]")).toHaveLength(0);
  });
});

describe("mobile presentation structure", () => {
  it("exposes exactly four real destinations with active-state semantics", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    // The desktop sidebar landmark exists (it becomes the mobile bottom
    // navigation via CSS — same four real destinations, no fake ones).
    const nav = screen.getByRole("complementary", { name: "Primary navigation" });
    expect(document.querySelector(".sidebar")).not.toBeNull();
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    // Exact DOM/semantic/visual order — not just membership.
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(["All resources", "Favorites", "Pending", "Recycle"]);
    expect(within(nav).getByRole("button", { name: "All resources" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("button", { name: "Favorites" }));
    expect(within(nav).getByRole("button", { name: "Favorites" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "All resources" })).not.toHaveAttribute("aria-current");
  });

  it("structures catalogue rows for the mobile presentation: name/actions separated, truncation-capable filename, metadata line", async () => {
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await screen.findByText("paper.pdf");

    const rows = document.querySelectorAll(".entry-table .entry-row:not(.entry-row--head)");
    expect(rows).toHaveLength(2);
    for (const row of Array.from(rows)) {
      expect(row.querySelector(".entry-name")).not.toBeNull();
      expect(row.querySelector(".entry-actions")).not.toBeNull();
      expect(row.querySelector(".entry-mobile-meta")).not.toBeNull();
    }

    const fileRow = screen.getByText("paper.pdf").closest(".entry-row") as HTMLElement;
    expect(fileRow.querySelector(".entry-filename")).not.toBeNull();
    expect(within(fileRow).getByText("PDF · 6 B")).toBeInTheDocument();
    expect(within(fileRow).getByRole("button", { name: "Add paper.pdf to favorites" })).toBeInTheDocument();
    expect(within(fileRow).getByRole("button", { name: "Open actions for paper.pdf" })).toBeInTheDocument();

    const folderRow = screen.getByRole("button", { name: "Sources" }).closest(".entry-row") as HTMLElement;
    expect(within(folderRow).getByText("Folder")).toBeInTheDocument();
  });

  it("keeps star and more controls independent of truncating long filenames", async () => {
    const longName = `${"中古中国与粟特文明".repeat(40)}.pdf`;
    const longFile = { ...FILE, displayName: longName };
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [longFile] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const filename = await screen.findByText(longName);
    expect(filename.className).toContain("entry-filename");
    const row = filename.closest(".entry-row") as HTMLElement;
    expect(row.querySelector(".entry-actions")).not.toBeNull();
    expect(within(row).getByRole("button", { name: `Open actions for ${longName}` })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: `Add ${longName} to favorites` })).toBeInTheDocument();
  });

  it("provides the compact back control with the real parent label when nested", async () => {
    const user = userEvent.setup();
    const listEntries = vi.fn()
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] })
      .mockResolvedValueOnce({ folder: FOLDER, folders: [], files: [] })
      .mockResolvedValueOnce({ folder: null, folders: [FOLDER], files: [] });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listEntries });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    // At the root there is nothing to go back to.
    expect(screen.queryByRole("button", { name: /Back to/ })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Sources" }));
    await screen.findByRole("heading", { name: "Sources", level: 1 });
    const back = screen.getByRole("button", { name: "Back to Library" });
    await user.click(back);

    await waitFor(() => expect(listEntries).toHaveBeenLastCalledWith(null, expect.anything()));
    expect(screen.getByRole("heading", { name: "Library", level: 1 })).toBeInTheDocument();
  });

  it("renders Favorites through the same mobile catalogue structure as Library", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listFavorites: vi.fn().mockResolvedValue({ files: [FILE], folders: [] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    const table = document.querySelector(".entry-table");
    expect(table).not.toBeNull();
    expect(table!.querySelector(".entry-mobile-meta")).not.toBeNull();
  });

  it("exposes the compact account menu with account name, language, and sign out", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), logout });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    const popover = document.querySelector(".account-popover") as HTMLElement;
    const menu = within(popover).getByRole("menu", { name: "Account" });
    expect(within(popover).getByText("Scholar")).toBeInTheDocument();
    // Menu keyboard contract: focus moves into the menu on open.
    expect(within(menu).getByRole("menuitem", { name: "中文" })).toHaveFocus();
    await user.click(within(menu).getByRole("menuitem", { name: "中文" }));
    expect(await within(menu).findByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();

    // Escape closes the popover and restores focus to the trigger.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "账户" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the account menu on outside pointer down", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("menu", { name: "Account" })).not.toBeInTheDocument();
  });

  it("keeps upload queue jobs in the stacked mobile structure", async () => {
    const user = userEvent.setup();
    const checksumFile = vi.fn(() => new Promise<string>(() => {}));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT) });
    render(<App api={api} checksumFile={checksumFile} />);
    await screen.findByRole("heading", { name: "Library" });

    await user.upload(await screen.findByLabelText("Upload files"), [new File(["a"], "a.pdf", { type: "application/pdf" })]);
    const job = document.querySelector(".upload-job") as HTMLElement;
    expect(job).not.toBeNull();
    expect(job.querySelector("progress")).not.toBeNull();
    expect(job.querySelector(".upload-percent")).not.toBeNull();
    expect(within(job).getByRole("button", { name: "Pause a.pdf upload" })).toBeInTheDocument();
    expect(within(job).getByRole("button", { name: "Abandon a.pdf upload" })).toBeInTheDocument();
  });
});

describe("governance audit presentation", () => {
  it("shows loading and then the exclusive empty state", async () => {
    const user = userEvent.setup();
    let resolvePage!: (page: { events: []; nextBeforeId: null; retentionPolicy: "latest_20000_events" }) => void;
    const listAuditEvents = vi.fn(() => new Promise<{ events: []; nextBeforeId: null; retentionPolicy: "latest_20000_events" }>((resolve) => {
      resolvePage = resolve;
    }));
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listAuditEvents });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const dialog = await openOwnerAdministration("Activity log");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading audit events");
    expect(within(dialog).queryByText("No governance events")).not.toBeInTheDocument();
    resolvePage({ events: [], nextBeforeId: null, retentionPolicy: "latest_20000_events" });
    expect(await within(dialog).findByText("No governance events")).toBeInTheDocument();
  });

  it("keeps an initial error exclusive from empty and retries safely", async () => {
    const user = userEvent.setup();
    const listAuditEvents = vi.fn()
      .mockRejectedValueOnce(new ApiError(500, "request_failed"))
      .mockResolvedValueOnce({ events: [], nextBeforeId: null, retentionPolicy: "latest_20000_events" as const });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listAuditEvents });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const dialog = await openOwnerAdministration("Activity log");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not load audit events");
    expect(within(dialog).queryByText("No governance events")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("No governance events")).toBeInTheDocument();
    expect(listAuditEvents).toHaveBeenCalledTimes(2);
  });

  it("keeps the audit launch Owner-only and renders fixed, opaque event fields", async () => {
    const user = userEvent.setup();
    const listAuditEvents = vi.fn().mockResolvedValue({
      events: [{
        id: 7,
        occurredAt: "2026-08-17T08:00:00.000Z",
        action: "drive.file_purge_complete" as const,
        outcome: "succeeded" as const,
        actorKind: "system" as const,
        actorAccountId: null,
        targetKind: "file" as const,
        targetId: "file-opaque-7",
        reason: null,
      }],
      nextBeforeId: null,
      retentionPolicy: "latest_20000_events" as const,
    });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), listAuditEvents });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const trigger = screen.getByRole("button", { name: "Account menu" });
    const dialog = await openOwnerAdministration("Activity log");
    expect(await within(dialog).findByText("Permanent deletion completed")).toBeInTheDocument();
    expect(within(dialog).getByText("file · file-opaque-7")).toBeInTheDocument();
    expect(within(dialog).queryByText(/paper\.pdf|private note|search/i)).not.toBeInTheDocument();
    expect(listAuditEvents).toHaveBeenCalledWith(undefined, 50);
    await user.click(within(dialog).getByRole("button", { name: "Close administration" }));
    expect(trigger).toHaveFocus();
  });

  it("does not expose the audit launch to Members", async () => {
    const member = { id: "member-1", loginName: "Reader", role: "member" as const };
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(member) });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(within(screen.getByRole("menu", { name: "Account" })).queryByRole("menuitem", { name: "Administration" })).not.toBeInTheDocument();
  });
});

describe("Shared Library contribution UI", () => {
  const library = { id: "library-1", name: "Sources", role: "manager" as const, isDefault: false, createdAt: "2026-08-18T00:00:00.000Z" };
  const contribution = {
    id: "contribution-1",
    libraryId: library.id,
    artifactId: "artifact-1",
    state: "submitted" as const,
    revision: 0,
    recordId: "record-1",
    recordLabel: "Submitted source",
    submitterLoginName: "Member",
    file: { id: "file-1", displayName: "submitted.pdf", mediaType: "application/pdf", sizeBytes: 12, state: "active" as const },
    submittedAt: "2026-08-18T00:00:00.000Z",
    reviewedAt: null,
  };

  it("selects the canonical Library by default without exposing manual Library creation", async () => {
    const user = userEvent.setup();
    const canonical = { ...library, id: "canonical-library", name: "Canonical corpus", isDefault: true };
    const listLibraryHoldings = vi.fn().mockResolvedValue([]);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([library, canonical]),
      listLibraryHoldings,
      listLibraryMembers: vi.fn().mockResolvedValue([]),
      listLibraryContributions: vi.fn().mockResolvedValue([]),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
    await waitFor(() => expect(listLibraryHoldings).toHaveBeenCalledWith(canonical.id));
    expect(screen.queryByRole("button", { name: "Shared Library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create library" })).not.toBeInTheDocument();
  });

  it("renders holdings and Owner folders in one catalogue with reused badges, actions, and CAS recycle", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const canonical = { ...library, id: "canonical-library", name: "Canonical corpus", isDefault: true };
    const createLibraryDownload = vi.fn().mockResolvedValue({
      method: "GET" as const,
      url: "https://example.invalid/library-download",
      expiresAt: "2026-08-18T00:05:00.000Z",
    });
    const recycleLibraryHolding = vi.fn().mockResolvedValue(undefined);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [FOLDER], files: [] }),
      listLibraries: vi.fn().mockResolvedValue([canonical]),
      listLibraryHoldings: vi.fn().mockResolvedValue(LIBRARY_HOLDINGS),
      createLibraryDownload,
      recycleLibraryHolding,
    });
    render(<App api={api} />);

    const table = await screen.findByRole("table", { name: "Catalogue" });
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const headingRow = within(table).getByRole("row", { name: /Name.*Size.*Updated/ });
    await waitFor(() => expect(table.querySelector('[data-entry-kind="library-holding"]')).not.toBeNull());
    const holdingRow = table.querySelector('[data-entry-kind="library-holding"]');
    expect(holdingRow).not.toBeNull();
    expect(Boolean(headingRow.compareDocumentPosition(holdingRow!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(within(table).getByRole("button", { name: "Sources" })).toBeInTheDocument();
    expect(holdingRow?.querySelector(".file-badge--pdf")).not.toBeNull();
    expect(table.querySelector('[data-entry-kind="library-holding"] .file-badge--img')).not.toBeNull();
    expect(table.querySelector('[data-entry-kind="library-holding"] .file-badge--txt')).not.toBeNull();
    expect(table.querySelector('[data-entry-kind="library-holding"] .file-badge--file')).not.toBeNull();
    expect(within(holdingRow as HTMLElement).getByText("book.pdf")).toBeInTheDocument();
    expect(within(holdingRow as HTMLElement).queryByText("book.pdf", { selector: ".entry-secondary" })).not.toBeInTheDocument();
    expect(screen.queryByText("The shared scholarly corpus available to your account.")).not.toBeInTheDocument();
    expect(screen.queryByText("当前账户可访问的共享学术资料。")).not.toBeInTheDocument();

    await user.click(within(holdingRow as HTMLElement).getByRole("button", { name: "Add book.pdf to favorites" }));
    await waitFor(() => expect(api.setFileFavorite).toHaveBeenCalledWith("library-file-0", true));

    await user.click(within(holdingRow as HTMLElement).getByRole("button", { name: "book.pdf" }));
    await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledWith(canonical.id, "library-file-0", "inline"));
    await user.click(screen.getByRole("button", { name: "Close preview" }));

    const menu = await openRowMenu("book.pdf");
    expect(within(menu).getByRole("menuitem", { name: "Resource details" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Preview" }));
    await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledWith(canonical.id, "library-file-0", "inline"));
    await user.click(screen.getByRole("button", { name: "Close preview" }));

    const menuAfterPreview = await openRowMenu("book.pdf");
    await user.click(within(menuAfterPreview).getByRole("menuitem", { name: "Move to trash" }));
    await waitFor(() => expect(recycleLibraryHolding).toHaveBeenCalledWith(canonical.id, "library-file-0", LIBRARY_HOLDINGS[0]!.version));
    confirm.mockRestore();
  });

  it("does not expose Library recycle to Members while retaining catalogue actions", async () => {
    const member = { id: "member-1", loginName: "Reader", role: "member" as const };
    const canonical = { ...library, id: "canonical-library", isDefault: true, role: "member" as const };
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(member),
      listLibraries: vi.fn().mockResolvedValue([canonical]),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
    });
    render(<App api={api} />);

    const row = await screen.findByRole("row", { name: /book\.pdf/ });
    const menu = await openRowMenu("book.pdf");
    expect(within(menu).getByRole("menuitem", { name: "Preview" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Move to trash" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Add book.pdf to favorites" })).toBeInTheDocument();
  });

  it("shows only explicitly submitted reviewer rows and approves through the scoped API", async () => {
    const user = userEvent.setup();
    const reviewLibraryContribution = vi.fn().mockResolvedValue({ ...contribution, state: "approved" as const, revision: 1 });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([library]),
      listLibraryHoldings: vi.fn().mockResolvedValue([]),
      listLibraryMembers: vi.fn().mockResolvedValue([]),
      listLibraryContributions: vi.fn().mockResolvedValue([contribution]),
      reviewLibraryContribution,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const dialog = await openOwnerAdministration("Contribution review");
    expect(await within(dialog).findByRole("heading", { name: "Contribution review" })).toBeInTheDocument();
    expect(screen.getByText("submitted.pdf")).toBeInTheDocument();
    expect(screen.queryByText("unrelated-private.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(reviewLibraryContribution).toHaveBeenCalledWith(library.id, contribution.id, "approve"));
    expect(await screen.findByText("No submitted contributions")).toBeInTheDocument();
  });

  it("surfaces pending contributions in the ordinary Owner navigation and opens review directly", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([library]),
      listLibraryHoldings: vi.fn().mockResolvedValue([]),
      listLibraryContributions: vi.fn().mockResolvedValue([contribution]),
      listLibraryMembers: vi.fn().mockResolvedValue([]),
    });
    render(<App api={api} />);
    const pending = await screen.findByRole("button", { name: "Pending contributions · 1" });
    await user.click(pending);
    const dialog = await screen.findByRole("dialog", { name: "Administration" });
    expect(within(dialog).getByRole("heading", { name: "Contribution review" })).toBeInTheDocument();
    expect(await within(dialog).findByText("submitted.pdf")).toBeInTheDocument();
  });

  it("clears Library-scoped contribution rows immediately when switching Libraries", async () => {
    const user = userEvent.setup();
    const secondLibrary = { ...library, id: "library-2", name: "Second sources" };
    const listLibraryContributions = vi.fn().mockImplementation(async (libraryId: string) => {
      if (libraryId === library.id) return [contribution];
      return await new Promise<never>(() => undefined);
    });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([library, secondLibrary]),
      listLibraryHoldings: vi.fn().mockResolvedValue([]),
      listLibraryMembers: vi.fn().mockResolvedValue([]),
      listLibraryContributions,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const dialog = await openOwnerAdministration("Contribution review");
    expect(await screen.findByText("submitted.pdf")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Second sources/ }));

    await waitFor(() => expect(screen.queryByText("submitted.pdf")).not.toBeInTheDocument());
    expect(listLibraryContributions).toHaveBeenLastCalledWith(secondLibrary.id);
  });

  it("prevents Library switching while a scoped review mutation is in flight", async () => {
    const user = userEvent.setup();
    const secondLibrary = { ...library, id: "library-2", name: "Second sources" };
    let resolveReview!: (value: Awaited<ReturnType<AcademicCloudApi["reviewLibraryContribution"]>>) => void;
    const pendingReview = new Promise<Awaited<ReturnType<AcademicCloudApi["reviewLibraryContribution"]>>>((resolve) => {
      resolveReview = resolve;
    });
    const reviewLibraryContribution = vi.fn().mockReturnValue(pendingReview);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([library, secondLibrary]),
      listLibraryHoldings: vi.fn().mockResolvedValue([]),
      listLibraryMembers: vi.fn().mockResolvedValue([]),
      listLibraryContributions: vi.fn().mockImplementation(async (libraryId: string) => libraryId === library.id ? [contribution] : []),
      reviewLibraryContribution,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const dialog = await openOwnerAdministration("Contribution review");
    expect(await screen.findByText("submitted.pdf")).toBeInTheDocument();
    const secondButton = within(dialog).getByRole("button", { name: /Second sources/ });

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(reviewLibraryContribution).toHaveBeenCalledWith(library.id, contribution.id, "approve"));
    expect(secondButton).toBeDisabled();
    await user.click(secondButton);
    expect(secondButton).toHaveClass("button--quiet");

    resolveReview({ ...contribution, state: "approved", revision: 1, reviewedAt: "2026-08-18T00:01:00.000Z" });
    await waitFor(() => expect(secondButton).toBeEnabled());
    await user.click(secondButton);
    await waitFor(() => expect(secondButton).not.toHaveClass("button--quiet"));
  });

  it("supports contribution submission when mounted by a future resource-detail flow", async () => {
    const user = userEvent.setup();
    const memberLibrary = { ...library, role: "member" as const };
    const record = {
      id: "record-1",
      label: "Private record",
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
      artifactCount: 1,
      nextBeforeArtifactId: null,
      artifacts: [{
        id: "artifact-1",
        recordId: "record-1",
        attachmentState: "attached" as const,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        version: { id: "version-1", createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", file: { id: "file-1", displayName: "private.pdf", state: "active" as const, availability: "available" as const } },
      }],
    };
    const submitLibraryContribution = vi.fn().mockResolvedValue(contribution);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue({ id: "member-1", loginName: "Member", role: "member" as const }),
      listLibraries: vi.fn().mockResolvedValue([memberLibrary]),
      listScholarlyRecords: vi.fn().mockResolvedValue({ records: [{ ...record, artifacts: undefined, nextBeforeArtifactId: undefined }], nextBeforeId: null }),
      getScholarlyRecord: vi.fn().mockResolvedValue(record),
      submitLibraryContribution,
    });
    render(<LanguageProvider><ScholarlyRecordsDialog api={api} availableFiles={[FILE]} onClose={vi.fn()} returnFocus={null} /></LanguageProvider>);
    const dialog = await screen.findByRole("dialog", { name: "Scholarly records" });
    const submit = await within(dialog).findByRole("button", { name: "Submit to shared library" });
    await user.click(submit);
    await waitFor(() => expect(submitLibraryContribution).toHaveBeenCalledWith(memberLibrary.id, "artifact-1"));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Submitted");
  });

  it("shows a Member only their own contribution statuses and allows explicit withdrawal", async () => {
    const user = userEvent.setup();
    const memberLibrary = { ...library, role: "member" as const };
    const withdrawn = { ...contribution, state: "withdrawn" as const, revision: 1, reviewedAt: "2026-08-18T00:01:00.000Z" };
    const withdrawLibraryContribution = vi.fn().mockResolvedValue(withdrawn);
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue({ id: "member-1", loginName: "Member", role: "member" as const }),
      listLibraries: vi.fn().mockResolvedValue([memberLibrary]),
      listLibraryHoldings: vi.fn().mockResolvedValue([]),
      listMyLibraryContributions: vi.fn().mockResolvedValue([contribution]),
      withdrawLibraryContribution,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    expect(await screen.findByText("submitted.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(withdrawLibraryContribution).toHaveBeenCalledWith(memberLibrary.id, contribution.id));
    expect(await screen.findByText(/withdrawn/i)).toBeInTheDocument();
  });
});

describe("row menu focus safety", () => {
  it("restores trigger focus when scroll or resize closes the menu with focus inside", async () => {
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockResolvedValue({ folder: null, folders: [], files: [FILE] }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    const trigger = await screen.findByRole("button", { name: "Open actions for paper.pdf" });
    const menu = await openRowMenu("paper.pdf");
    const item = within(menu).getByRole("menuitem", { name: "Download" });
    item.focus();
    expect(item).toHaveFocus();

    fireEvent.scroll(window);
    expect(screen.queryByRole("menu", { name: "Actions for paper.pdf" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    const menu2 = await openRowMenu("paper.pdf");
    within(menu2).getByRole("menuitem", { name: "Download" }).focus();
    fireEvent.resize(window);
    expect(screen.queryByRole("menu", { name: "Actions for paper.pdf" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("library search", () => {
  const searchHolding = { ...LIBRARY_HOLDINGS[0]!, canonicalTitle: "Searchable title", catalogueDisplayTitle: "Searchable title" };
  const searchResult = {
    holding: searchHolding,
    fileId: "library-file-0",
    mediaType: "application/pdf",
    sizeBytes: 12,
    canonicalTitle: "Searchable title",
    authorLabels: [],
    date: null,
    publisher: null,
    materialType: null,
    displayName: "book.pdf",
  };

  it("renders holdings while the unrelated Owner folder request is pending", async () => {
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listEntries: vi.fn().mockReturnValue(new Promise(() => undefined)),
      listLibraryHoldings: vi.fn().mockResolvedValue([searchHolding]),
    });
    render(<App api={api} />);
    expect(await screen.findByRole("button", { name: "Searchable title" })).toBeInTheDocument();
    expect(screen.queryByText("This folder is empty")).not.toBeInTheDocument();
  });

  it("keeps search selection across pages and uses real identities outside the browse page", async () => {
    const user = userEvent.setup();
    const second = { ...LIBRARY_HOLDINGS[1]!, canonicalTitle: "Second result", catalogueDisplayTitle: "Second result" };
    const searchLibraryHoldings = vi.fn().mockResolvedValueOnce({ results: [searchResult], nextCursor: "page-2" })
      .mockResolvedValue({ results: [{ ...searchResult, fileId: second.file.id, holding: second }], nextCursor: null });
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT), searchLibraryHoldings,
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[2]!]),
    });
    render(<App api={api} />);
    await user.type(await screen.findByLabelText("Search Library"), "search");
    await user.click(await screen.findByRole("checkbox", { name: "Select Searchable title" }));
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select Second result" }));
    expect(screen.getByRole("checkbox", { name: "Select Searchable title" })).toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add favorites" }));
    await waitFor(() => expect(api.setFileFavorite).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.setFileFavorite).mock.calls).toEqual([[searchHolding.file.id, true], [second.file.id, true]]);
    expect(api.bulkOperation).not.toHaveBeenCalled();
  });

  it("clears the previous selection when a query changes or returns to browsing", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraryHoldings: vi.fn().mockResolvedValue([searchHolding]),
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [searchResult], nextCursor: null }),
    });
    render(<App api={api} />);
    const input = await screen.findByLabelText("Search Library");
    await user.type(input, "first");
    await user.click(await screen.findByRole("checkbox", { name: "Select Searchable title" }));
    await user.type(input, " second");
    expect(await screen.findByRole("checkbox", { name: "Select Searchable title" })).not.toBeChecked();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select Searchable title" }));
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("checkbox", { name: "Select Searchable title" })).not.toBeChecked();
  });

  it("ignores a legacy summary's late hydration after leaving the Library", async () => {
    const user = userEvent.setup();
    let resolve!: (detail: unknown) => void;
    const { holding: _holding, ...legacyResult } = searchResult;
    const api = fakeApi({ getSession: vi.fn().mockResolvedValue(ACCOUNT),
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [legacyResult], nextCursor: null }),
      getLibraryHoldingDetails: vi.fn().mockReturnValue(new Promise((yes) => { resolve = yes; })),
    });
    render(<App api={api} />);
    await user.type(await screen.findByLabelText("Search Library"), "search");
    await user.click(await screen.findByRole("button", { name: "Searchable title" }));
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await act(async () => resolve({ holding: searchHolding }));
    expect(api.createLibraryDownload).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the normal folder catalogue when the search field is empty", async () => {
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([DEFAULT_LIBRARY]),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });

    expect(await screen.findByLabelText("Search Library")).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Catalogue" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Search results" })).not.toBeInTheDocument();
    expect(screen.queryByText("No matching resources")).not.toBeInTheDocument();
  });

  it("searches the whole library, hides the folder table, and restores it on clear", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([DEFAULT_LIBRARY]),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [searchResult], nextCursor: null }),
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const input = await screen.findByLabelText("Search Library");
    expect(await screen.findByRole("table", { name: "Catalogue" })).toBeInTheDocument();

    await user.type(input, "search");
    expect(await screen.findByRole("region", { name: "Search results" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Search results" })).getByRole("table", { name: "Catalogue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "book.pdf" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("table", { name: "Catalogue" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Search results" })).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("opens search result reading directly without eager details or AI requests", async () => {
    const user = userEvent.setup();
    const getLibraryHoldingDetails = vi.fn().mockResolvedValue({
      displayTitle: "Searchable title",
      originalFilename: "book.pdf",
      metadataVersion: "v".repeat(43),
      metadata: null,
      canEditMetadata: true,
      file: { id: "library-file-0", mediaType: "application/pdf", sizeBytes: 12, updatedAt: "2026-08-18T00:00:00.000Z" },
    });
    const createLibraryDownload = vi.fn().mockResolvedValue({ url: "https://files.example.test/read.pdf" });
    const api = fakeApi({
      getSession: vi.fn().mockResolvedValue(ACCOUNT),
      listLibraries: vi.fn().mockResolvedValue([DEFAULT_LIBRARY]),
      listLibraryHoldings: vi.fn().mockResolvedValue([LIBRARY_HOLDINGS[0]!]),
      searchLibraryHoldings: vi.fn().mockResolvedValue({ results: [searchResult], nextCursor: null }),
      getLibraryHoldingDetails,
      createLibraryDownload,
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Library" });
    const input = await screen.findByLabelText("Search Library");

    await user.type(input, "search");
    await user.click(await screen.findByRole("button", { name: "Searchable title" }));

    await waitFor(() => expect(createLibraryDownload).toHaveBeenCalledWith(DEFAULT_LIBRARY.id, "library-file-0", "inline"));
    expect(getLibraryHoldingDetails).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Searchable title" })).toBeInTheDocument();
  });
});
