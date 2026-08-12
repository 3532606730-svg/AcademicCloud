export interface Account {
  id: string;
  loginName: string;
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

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  authentication_required: "Your session has expired. Please sign in again.",
  invalid_credentials: "The login name or password is incorrect.",
  authentication_busy: "Sign-in is temporarily busy. Please wait a moment and try again.",
  invalid_origin: "This request did not come from the configured AcademicCloud site.",
  invalid_request: "Some information was invalid. Check the form and try again.",
  unsupported_media_type: "The server could not accept this request format.",
  payload_too_large: "This file is larger than the server allows.",
  rate_limit_exceeded: "Too many attempts. Please wait before trying again.",
  name_conflict: "An item with that name already exists here.",
  folder_not_empty: "This folder must be empty before it can be moved to the recycle bin.",
  invalid_move: "That destination would create an invalid folder structure.",
  invalid_state: "This item changed state. Refresh the view and try again.",
  upload_incomplete: "The upload has not reached storage yet. Retry verification shortly.",
  upload_metadata_mismatch: "Storage received a file that does not match the reserved upload.",
  storage_unavailable: "Object storage is temporarily unavailable. Your metadata is still safe.",
  not_found: "The item no longer exists or is not available to this account.",
  internal_error: "AcademicCloud encountered an unexpected error.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(ERROR_MESSAGES[code] ?? `Request failed (${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Fetcher = typeof fetch;

export interface AcademicCloudApi {
  getSession(signal?: AbortSignal): Promise<Account>;
  login(loginName: string, password: string): Promise<Account>;
  logout(): Promise<void>;
  listEntries(folderId: string | null, signal?: AbortSignal): Promise<EntriesResponse>;
  listPending(folderId: string | null, signal?: AbortSignal): Promise<FileEntry[]>;
  listRecycle(signal?: AbortSignal): Promise<RecycleResponse>;
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

  #json<T>(path: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
    return this.#request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async getSession(signal?: AbortSignal): Promise<Account> {
    const response = await this.#request<{ account: Account }>(
      "/api/auth/session",
      signal ? { signal } : {},
    );
    return response.account;
  }

  async login(loginName: string, password: string): Promise<Account> {
    const response = await this.#json<{ account: Account }>("/api/auth/login", "POST", { loginName, password });
    return response.account;
  }

  logout(): Promise<void> {
    return this.#request<void>("/api/auth/logout", { method: "POST" });
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

  async createFolder(name: string, parentId: string | null): Promise<FolderEntry> {
    const response = await this.#json<{ folder: FolderEntry }>("/api/drive/folders", "POST", { name, parentId });
    return response.folder;
  }

  async updateFolder(folderId: string, update: { name?: string; parentId?: string | null }): Promise<FolderEntry> {
    const response = await this.#json<{ folder: FolderEntry }>(
      `/api/drive/folders/${encodeURIComponent(folderId)}`,
      "PATCH",
      update,
    );
    return response.folder;
  }

  deleteFolder(folderId: string): Promise<void> {
    return this.#request<void>(`/api/drive/folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
  }

  async restoreFolder(folderId: string): Promise<FolderEntry> {
    const response = await this.#json<{ folder: FolderEntry }>(
      `/api/drive/folders/${encodeURIComponent(folderId)}/restore`,
      "POST",
    );
    return response.folder;
  }

  async createUpload(input: {
    folderId: string | null;
    displayName: string;
    mediaType: string;
    sizeBytes: number;
    checksum: { algorithm: "md5"; value: string };
  }): Promise<{ file: FileEntry; upload: UploadAuthorization }> {
    return this.#json("/api/drive/uploads", "POST", input);
  }

  async renewUpload(fileId: string): Promise<UploadAuthorization> {
    const response = await this.#json<{ upload: UploadAuthorization }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/authorization`,
      "POST",
    );
    return response.upload;
  }

  async completeUpload(fileId: string): Promise<FileEntry> {
    const response = await this.#json<{ file: FileEntry }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/complete`,
      "POST",
    );
    return response.file;
  }

  async createDownload(fileId: string, disposition: "attachment" | "inline" = "attachment"): Promise<DownloadAuthorization> {
    const response = await this.#request<{ download: DownloadAuthorization }>(
      `/api/drive/files/${encodeURIComponent(fileId)}/download?disposition=${disposition}`,
    );
    return response.download;
  }

  async updateFile(fileId: string, update: { displayName?: string; folderId?: string | null }): Promise<FileEntry> {
    const response = await this.#json<{ file: FileEntry }>(
      `/api/drive/files/${encodeURIComponent(fileId)}`,
      "PATCH",
      update,
    );
    return response.file;
  }

  deleteFile(fileId: string): Promise<void> {
    return this.#request<void>(`/api/drive/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  }

  async restoreFile(fileId: string): Promise<FileEntry> {
    const response = await this.#json<{ file: FileEntry }>(
      `/api/drive/files/${encodeURIComponent(fileId)}/restore`,
      "POST",
    );
    return response.file;
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

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The operation was cancelled.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The operation could not be completed.";
}
