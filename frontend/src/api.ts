import { ERROR_MESSAGES } from "./i18n.ts";

export interface Account {
  id: string;
  loginName: string;
  role: "owner" | "member";
}

export interface ManagedAccount extends Account {
  state: "active" | "disabled";
  createdAt: string;
}

export interface Invitation {
  id: string;
  createdByAccountId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByAccountId: string | null;
  revokedAt: string | null;
  status: "available" | "expired" | "consumed" | "revoked";
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  linkUrl: string | null;
  isActive: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdByAccountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  severity: Announcement["severity"];
  linkUrl: string | null;
  expiresAt: string | null;
}

export type AuditEventKind =
  | "auth.login" | "auth.logout" | "auth.password_change"
  | "accounts.owner_bootstrap" | "accounts.register" | "accounts.invitation_create"
  | "accounts.invitation_revoke" | "accounts.member_state_change"
  | "announcements.create" | "announcements.edit" | "announcements.publish" | "announcements.unpublish"
  | "drive.upload_activate" | "drive.folder_recycle" | "drive.folder_restore"
  | "drive.file_recycle" | "drive.file_restore" | "drive.file_purge_request" | "drive.file_purge_complete";
export type AuditOutcome = "succeeded" | "denied" | "failed" | "busy";
export type AuditActorKind = "account" | "system" | "anonymous";
export type AuditTargetType = "account" | "invitation" | "announcement" | "file" | "folder";
export type AuditReasonCode =
  | "invalid_credentials" | "invalid_current_password" | "password_change_conflict" | "password_unchanged"
  | "invalid_invitation" | "login_unavailable" | "authorization_denied" | "not_found" | "invalid_target"
  | "invalid_state" | "invalid_input" | "rate_limit_exceeded" | "kdf_overloaded" | "storage_unavailable"
  | "upload_incomplete" | "upload_metadata_mismatch" | "name_conflict" | "concurrent_change";
export interface AuditEvent {
  id: number;
  occurredAt: string;
  action: AuditEventKind;
  outcome: AuditOutcome;
  actorKind: AuditActorKind;
  actorAccountId: string | null;
  targetKind: AuditTargetType | null;
  targetId: string | null;
  reason: AuditReasonCode | null;
}
export interface AuditPage {
  events: AuditEvent[];
  nextBeforeId: number | null;
  retentionPolicy: "latest_20000_events";
}

export type FolderState = "active" | "deleted";
export type FileState = "pending_upload" | "active" | "deleted" | "purging" | "purged";

export interface FolderEntry {
  id: string;
  parentId: string | null;
  name: string;
  state: FolderState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: string;
}

export interface FileEntry {
  id: string;
  folderId: string | null;
  displayName: string;
  mediaType: string;
  sizeBytes: number;
  checksumAlgorithm: "md5";
  checksum: string;
  state: FileState;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  deletedAt: string | null;
  purgedAt: string | null;
  version: string;
}

export type BulkAction = "move" | "recycle" | "restore" | "favorite_add" | "favorite_remove";
export type BulkResourceKind = "folder" | "file";

export interface BulkItem {
  kind: BulkResourceKind;
  id: string;
  version: string;
}

export interface BulkOperationInput {
  action: BulkAction;
  items: BulkItem[];
  destinationFolderId?: string | null;
}

export interface BulkOperationResult {
  action: BulkAction;
  atomic: true;
  items: Array<BulkItem & { outcome: "succeeded" }>;
}

export type ScholarlyAttachmentState = "attached" | "detached";
export type ScholarlyAvailability = "available" | "unavailable" | "tombstoned";

export interface ScholarlyRecordSummary {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
}

export interface ScholarlyRecord extends ScholarlyRecordSummary {
  artifacts: ScholarlyArtifact[];
  nextBeforeArtifactId: string | null;
}

export interface ScholarlyRecordPage {
  records: ScholarlyRecordSummary[];
  nextBeforeId: string | null;
}

export interface ScholarlyArtifact {
  id: string;
  recordId: string;
  attachmentState: ScholarlyAttachmentState;
  createdAt: string;
  updatedAt: string;
  version: {
    id: string;
    createdAt: string;
    updatedAt: string;
    file: {
      id: string;
      displayName: string;
      state: FileState;
      availability: ScholarlyAvailability;
    } | null;
  } | null;
}

export interface UploadAuthorization {
  method: "POST";
  url: string;
  fields: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface DownloadAuthorization {
  method: "GET";
  url: string;
  expiresAt: string;
}

export interface EntriesResponse {
  folder: FolderEntry | null;
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface RecycleResponse {
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface FavoriteFolderEntry extends FolderEntry {
  /** Root-first ancestor chain used to open the real folder in the Library. */
  ancestors: FolderEntry[];
}

export interface FavoritesResponse {
  files: FileEntry[];
  folders: FavoriteFolderEntry[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    // English fallback message; the UI renders localized text by code via
    // describeError in i18n.ts. Backend error codes remain stable.
    super(ERROR_MESSAGES.en[code] ?? `Request failed (${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Fetcher = typeof fetch;

export interface AcademicCloudApi {
  getSession(signal?: AbortSignal): Promise<Account>;
  login(loginName: string, password: string): Promise<Account>;
  registerMember(inviteToken: string, loginName: string, password: string): Promise<ManagedAccount>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
  createInvitation(): Promise<{ invitation: Invitation; rawToken: string }>;
  listInvitations(): Promise<Invitation[]>;
  revokeInvitation(invitationId: string): Promise<Invitation>;
  listAccounts(): Promise<ManagedAccount[]>;
  setAccountState(accountId: string, state: "active" | "disabled"): Promise<ManagedAccount>;
  listAnnouncements(signal?: AbortSignal): Promise<Announcement[]>;
  listAllAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(input: AnnouncementInput): Promise<Announcement>;
  updateAnnouncement(announcementId: string, input: AnnouncementInput): Promise<Announcement>;
  publishAnnouncement(announcementId: string): Promise<Announcement>;
  unpublishAnnouncement(announcementId: string): Promise<Announcement>;
  listAuditEvents(beforeId?: number, limit?: number, signal?: AbortSignal): Promise<AuditPage>;
  listEntries(folderId: string | null, signal?: AbortSignal): Promise<EntriesResponse>;
  listPending(folderId: string | null, signal?: AbortSignal): Promise<FileEntry[]>;
  listRecycle(signal?: AbortSignal): Promise<RecycleResponse>;
  listFavorites(signal?: AbortSignal): Promise<FavoritesResponse>;
  bulkOperation(input: BulkOperationInput): Promise<BulkOperationResult>;
  listScholarlyRecords(signal?: AbortSignal, beforeId?: string, limit?: number): Promise<ScholarlyRecordPage>;
  getScholarlyRecord(recordId: string, signal?: AbortSignal, beforeArtifactId?: string, limit?: number): Promise<ScholarlyRecord>;
  createScholarlyRecord(label: string): Promise<ScholarlyRecord>;
  attachFileToScholarlyRecord(recordId: string, fileId: string): Promise<ScholarlyRecord>;
  detachScholarlyArtifact(recordId: string, artifactId: string): Promise<ScholarlyRecord>;
  setFileFavorite(fileId: string, favorite: boolean): Promise<void>;
  setFolderFavorite(folderId: string, favorite: boolean): Promise<void>;
  createFolder(name: string, parentId: string | null): Promise<FolderEntry>;
  updateFolder(folderId: string, update: { name?: string; parentId?: string | null }): Promise<FolderEntry>;
  deleteFolder(folderId: string): Promise<void>;
  restoreFolder(folderId: string): Promise<FolderEntry>;
  createUpload(input: {
    folderId: string | null;
    displayName: string;
    mediaType: string;
    sizeBytes: number;
    checksum: { algorithm: "md5"; value: string };
  }): Promise<{ file: FileEntry; upload: UploadAuthorization }>;
  renewUpload(fileId: string): Promise<UploadAuthorization>;
  completeUpload(fileId: string): Promise<FileEntry>;
  createDownload(fileId: string, disposition?: "attachment" | "inline"): Promise<DownloadAuthorization>;
  updateFile(fileId: string, update: { displayName?: string; folderId?: string | null }): Promise<FileEntry>;
  deleteFile(fileId: string): Promise<void>;
  restoreFile(fileId: string): Promise<FileEntry>;
  permanentlyDeleteFile(fileId: string): Promise<void>;
}

export class ApiClient implements AcademicCloudApi {
  readonly #fetch: Fetcher;
  readonly #onUnauthorized: () => void;

  constructor(options: { fetcher?: Fetcher; onUnauthorized?: () => void } = {}) {
    this.#fetch = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.#onUnauthorized = options.onUnauthorized ?? (() => undefined);
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const response = await this.#fetch(path, {
      ...init,
      credentials: "same-origin",
      headers,
    });

    if (!response.ok) {
      let code = "request_failed";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string") {
          code = body.error;
        }
      } catch {
        // A proxy or network edge may return a non-JSON error page.
      }
      if (response.status === 401 && code === "authentication_required") {
        this.#onUnauthorized();
      }
      throw new ApiError(response.status, code);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // JSON body request: the body is REQUIRED by the type signature, so an
  // accidental "Content-Type: application/json with an empty body" request
  // (rejected by the Fastify JSON parser with 400) cannot be constructed.
  #jsonBody<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
    return this.#request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Bodyless action: sends NO Content-Type and NO body. Fastify routes for
  // these actions are bodyless by contract (POST/PUT/DELETE alike).
  #action<T>(path: string, method: "POST" | "PUT" | "DELETE"): Promise<T> {
    return this.#request<T>(path, { method });
  }

  async getSession(signal?: AbortSignal): Promise<Account> {
    const response = await this.#request<{ account: Account }>(
      "/api/auth/session",
      signal ? { signal } : {},
    );
    return response.account;
  }

  async login(loginName: string, password: string): Promise<Account> {
    const response = await this.#jsonBody<{ account: Account }>("/api/auth/login", "POST", { loginName, password });
    return response.account;
  }

  async registerMember(inviteToken: string, loginName: string, password: string): Promise<ManagedAccount> {
    const response = await this.#jsonBody<{ account: ManagedAccount }>("/api/auth/register", "POST", {
      inviteToken,
      loginName,
      password,
    });
    return response.account;
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.#jsonBody<void>("/api/auth/password", "POST", { currentPassword, newPassword });
  }

  logout(): Promise<void> {
    return this.#action<void>("/api/auth/logout", "POST");
  }

  createInvitation(): Promise<{ invitation: Invitation; rawToken: string }> {
    return this.#action("/api/accounts/invitations", "POST");
  }

  async listInvitations(): Promise<Invitation[]> {
    return (await this.#request<{ invitations: Invitation[] }>("/api/accounts/invitations")).invitations;
  }

  async revokeInvitation(invitationId: string): Promise<Invitation> {
    return (await this.#action<{ invitation: Invitation }>(
      `/api/accounts/invitations/${encodeURIComponent(invitationId)}`,
      "DELETE",
    )).invitation;
  }

  async listAccounts(): Promise<ManagedAccount[]> {
    return (await this.#request<{ accounts: ManagedAccount[] }>("/api/accounts")).accounts;
  }

  async setAccountState(accountId: string, state: "active" | "disabled"): Promise<ManagedAccount> {
    return (await this.#jsonBody<{ account: ManagedAccount }>(
      `/api/accounts/${encodeURIComponent(accountId)}/state`,
      "PATCH",
      { state },
    )).account;
  }

  async listAnnouncements(signal?: AbortSignal): Promise<Announcement[]> {
    return (await this.#request<{ announcements: Announcement[] }>(
      "/api/announcements",
      signal ? { signal } : {},
    )).announcements;
  }

  async listAllAnnouncements(): Promise<Announcement[]> {
    return (await this.#request<{ announcements: Announcement[] }>("/api/announcements/admin")).announcements;
  }

  async createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
    return (await this.#jsonBody<{ announcement: Announcement }>(
      "/api/announcements",
      "POST",
      input,
    )).announcement;
  }

  async updateAnnouncement(announcementId: string, input: AnnouncementInput): Promise<Announcement> {
    return (await this.#jsonBody<{ announcement: Announcement }>(
      `/api/announcements/${encodeURIComponent(announcementId)}`,
      "PATCH",
      input,
    )).announcement;
  }

  publishAnnouncement(announcementId: string): Promise<Announcement> {
    return this.#action<{ announcement: Announcement }>(
      `/api/announcements/${encodeURIComponent(announcementId)}/publish`,
      "POST",
    ).then((response) => response.announcement);
  }

  unpublishAnnouncement(announcementId: string): Promise<Announcement> {
    return this.#action<{ announcement: Announcement }>(
      `/api/announcements/${encodeURIComponent(announcementId)}/unpublish`,
      "POST",
    ).then((response) => response.announcement);
  }

  listAuditEvents(beforeId?: number, limit?: number, signal?: AbortSignal): Promise<AuditPage> {
    const query = new URLSearchParams();
    if (beforeId !== undefined) query.set("beforeId", String(beforeId));
    if (limit !== undefined) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.#request<AuditPage>(`/api/audit/events${suffix}`, signal ? { signal } : {});
  }

  async listEntries(folderId: string | null, signal?: AbortSignal): Promise<EntriesResponse> {
    return this.#request<EntriesResponse>(drivePath("entries", folderId), signal ? { signal } : {});
  }

  async listPending(folderId: string | null, signal?: AbortSignal): Promise<FileEntry[]> {
    const response = await this.#request<{ files: FileEntry[] }>(
      drivePath("uploads", folderId),
      signal ? { signal } : {},
    );
    return response.files;
  }

  listRecycle(signal?: AbortSignal): Promise<RecycleResponse> {
    return this.#request<RecycleResponse>("/api/drive/recycle", signal ? { signal } : {});
  }

  listFavorites(signal?: AbortSignal): Promise<FavoritesResponse> {
    return this.#request<FavoritesResponse>("/api/favorites", signal ? { signal } : {});
  }

  bulkOperation(input: BulkOperationInput): Promise<BulkOperationResult> {
    return this.#jsonBody<BulkOperationResult>("/api/drive/bulk", "POST", input);
  }

  listScholarlyRecords(signal?: AbortSignal, beforeId?: string, limit?: number): Promise<ScholarlyRecordPage> {
    const query = new URLSearchParams();
    if (beforeId !== undefined) query.set("beforeId", beforeId);
    if (limit !== undefined) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.#request<ScholarlyRecordPage>(
      `/api/research/records${suffix}`,
      signal ? { signal } : {},
    );
  }

  async getScholarlyRecord(
    recordId: string,
    signal?: AbortSignal,
    beforeArtifactId?: string,
    limit?: number,
  ): Promise<ScholarlyRecord> {
    const query = new URLSearchParams();
    if (beforeArtifactId !== undefined) query.set("beforeArtifactId", beforeArtifactId);
    if (limit !== undefined) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await this.#request<{ record: ScholarlyRecord }>(
      `/api/research/records/${encodeURIComponent(recordId)}${suffix}`,
      signal ? { signal } : {},
    );
    return response.record;
  }

  async createScholarlyRecord(label: string): Promise<ScholarlyRecord> {
    const response = await this.#jsonBody<{ record: ScholarlyRecord }>(
      "/api/research/records",
      "POST",
      { label },
    );
    return response.record;
  }

  async attachFileToScholarlyRecord(recordId: string, fileId: string): Promise<ScholarlyRecord> {
    const response = await this.#jsonBody<{ record: ScholarlyRecord }>(
      `/api/research/records/${encodeURIComponent(recordId)}/artifacts`,
      "POST",
      { fileId },
    );
    return response.record;
  }

  async detachScholarlyArtifact(recordId: string, artifactId: string): Promise<ScholarlyRecord> {
    const response = await this.#request<{ record: ScholarlyRecord }>(
      `/api/research/records/${encodeURIComponent(recordId)}/artifacts/${encodeURIComponent(artifactId)}`,
      { method: "DELETE" },
    );
    return response.record;
  }

  setFileFavorite(fileId: string, favorite: boolean): Promise<void> {
    return this.#action<void>(
      `/api/favorites/files/${encodeURIComponent(fileId)}`,
      favorite ? "PUT" : "DELETE",
    );
  }

  setFolderFavorite(folderId: string, favorite: boolean): Promise<void> {
    return this.#action<void>(
      `/api/favorites/folders/${encodeURIComponent(folderId)}`,
      favorite ? "PUT" : "DELETE",
    );
  }

  async createFolder(name: string, parentId: string | null): Promise<FolderEntry> {
    const response = await this.#jsonBody<{ folder: FolderEntry }>("/api/drive/folders", "POST", { name, parentId });
    return response.folder;
  }

  async updateFolder(folderId: string, update: { name?: string; parentId?: string | null }): Promise<FolderEntry> {
    const response = await this.#jsonBody<{ folder: FolderEntry }>(
      `/api/drive/folders/${encodeURIComponent(folderId)}`,
      "PATCH",
      update,
    );
    return response.folder;
  }

  deleteFolder(folderId: string): Promise<void> {
    return this.#request<void>(`/api/drive/folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
  }

  restoreFolder(folderId: string): Promise<FolderEntry> {
    return this.#action<{ folder: FolderEntry }>(
      `/api/drive/folders/${encodeURIComponent(folderId)}/restore`,
      "POST",
    ).then((response) => response.folder);
  }

  async createUpload(input: {
    folderId: string | null;
    displayName: string;
    mediaType: string;
    sizeBytes: number;
    checksum: { algorithm: "md5"; value: string };
  }): Promise<{ file: FileEntry; upload: UploadAuthorization }> {
    return this.#jsonBody("/api/drive/uploads", "POST", input);
  }

  renewUpload(fileId: string): Promise<UploadAuthorization> {
    return this.#action<{ upload: UploadAuthorization }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/authorization`,
      "POST",
    ).then((response) => response.upload);
  }

  completeUpload(fileId: string): Promise<FileEntry> {
    return this.#action<{ file: FileEntry }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/complete`,
      "POST",
    ).then((response) => response.file);
  }

  async createDownload(fileId: string, disposition: "attachment" | "inline" = "attachment"): Promise<DownloadAuthorization> {
    const response = await this.#request<{ download: DownloadAuthorization }>(
      `/api/drive/files/${encodeURIComponent(fileId)}/download?disposition=${disposition}`,
    );
    return response.download;
  }

  async updateFile(fileId: string, update: { displayName?: string; folderId?: string | null }): Promise<FileEntry> {
    const response = await this.#jsonBody<{ file: FileEntry }>(
      `/api/drive/files/${encodeURIComponent(fileId)}`,
      "PATCH",
      update,
    );
    return response.file;
  }

  deleteFile(fileId: string): Promise<void> {
    return this.#request<void>(`/api/drive/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  }

  restoreFile(fileId: string): Promise<FileEntry> {
    return this.#action<{ file: FileEntry }>(
      `/api/drive/files/${encodeURIComponent(fileId)}/restore`,
      "POST",
    ).then((response) => response.file);
  }

  permanentlyDeleteFile(fileId: string): Promise<void> {
    return this.#request<void>(`/api/drive/files/${encodeURIComponent(fileId)}/permanent`, { method: "DELETE" });
  }
}

function drivePath(resource: "entries" | "uploads", folderId: string | null): string {
  return folderId === null
    ? `/api/drive/${resource}`
    : `/api/drive/${resource}?folderId=${encodeURIComponent(folderId)}`;
}
