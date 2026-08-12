import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  ApiClient,
  ApiError,
  describeError,
  type AcademicCloudApi,
  type Account,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
  type RecycleResponse,
} from "./api.ts";
import { uploadDirectly } from "./direct-upload.ts";
import { calculateFileMd5 } from "./md5.ts";

type AuthState =
  | { phase: "checking" }
  | { phase: "anonymous"; message?: string }
  | { phase: "authenticated"; account: Account };

export interface AppProps {
  api?: AcademicCloudApi;
  checksumFile?: typeof calculateFileMd5;
  directUpload?: typeof uploadDirectly;
}

export function App({ api: injectedApi, checksumFile = calculateFileMd5, directUpload = uploadDirectly }: AppProps) {
  const [auth, setAuth] = useState<AuthState>({ phase: "checking" });
  const api = useMemo(
    () =>
      injectedApi ??
      new ApiClient({
        onUnauthorized: () => setAuth({ phase: "anonymous", message: "Your session expired. Please sign in again." }),
      }),
    [injectedApi],
  );

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal).then(
      (account) => setAuth({ phase: "authenticated", account }),
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAuth({
            phase: "anonymous",
            ...(error instanceof ApiError && error.status === 401 ? {} : { message: describeError(error) }),
          });
        }
      },
    );
    return () => controller.abort();
  }, [api]);

  if (auth.phase === "checking") {
    return <LoadingScreen />;
  }

  if (auth.phase === "anonymous") {
    return (
      <LoginView
        api={api}
        {...(auth.message === undefined ? {} : { initialMessage: auth.message })}
        onAuthenticated={(account) => setAuth({ phase: "authenticated", account })}
      />
    );
  }

  return (
    <DriveView
      account={auth.account}
      api={api}
      checksumFile={checksumFile}
      directUpload={directUpload}
      onSignedOut={(message) => setAuth({ phase: "anonymous", ...(message ? { message } : {}) })}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="centered-shell" aria-busy="true">
      <div className="loading-mark" aria-hidden="true">AC</div>
      <p role="status">Opening your library…</p>
    </main>
  );
}

function LoginView({
  api,
  initialMessage,
  onAuthenticated,
}: {
  api: AcademicCloudApi;
  initialMessage?: string;
  onAuthenticated: (account: Account) => void;
}) {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialMessage ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      onAuthenticated(await api.login(loginName, password));
    } catch (caught: unknown) {
      setError(describeError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <p className="eyebrow">Private academic workspace</p>
        <h1 id="login-title">A quieter home for serious work.</h1>
        <p>
          AcademicCloud keeps your source files organized and recoverable, without turning your library into a feed.
        </p>
        <div className="privacy-note">
          <span aria-hidden="true">●</span>
          Private by design · short-lived file access
        </div>
      </section>
      <section className="login-card" aria-labelledby="signin-title">
        <div className="brand"><span>AC</span> AcademicCloud</div>
        <h2 id="signin-title">Welcome back</h2>
        <p className="muted">Sign in to continue to your library.</p>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="login-name">Login name</label>
          <input
            id="login-name"
            name="loginName"
            autoComplete="username"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            required
            autoFocus
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="button button--primary button--wide" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

type DriveViewName = "library" | "pending" | "recycle";
type UploadPhase = "checking" | "reserving" | "uploading" | "verifying" | "complete" | "error";

interface UploadJob {
  id: string;
  file: File;
  fileId: string | null;
  phase: UploadPhase;
  progress: number;
  uploaded: boolean;
  error: string | null;
  controller: AbortController;
}

interface PreviewState {
  file: FileEntry;
  url: string;
  returnFocus: HTMLElement | null;
}

type MoveRequest =
  | { kind: "folder"; item: FolderEntry; returnFocus: HTMLElement | null }
  | { kind: "file"; item: FileEntry; returnFocus: HTMLElement | null };

const EMPTY_ENTRIES: EntriesResponse = { folder: null, folders: [], files: [] };
const EMPTY_RECYCLE: RecycleResponse = { folders: [], files: [] };

function DriveView({
  account,
  api,
  checksumFile,
  directUpload,
  onSignedOut,
}: {
  account: Account;
  api: AcademicCloudApi;
  checksumFile: typeof calculateFileMd5;
  directUpload: typeof uploadDirectly;
  onSignedOut: (message?: string) => void;
}) {
  const [view, setView] = useState<DriveViewName>("library");
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [entries, setEntries] = useState<EntriesResponse>(EMPTY_ENTRIES);
  const [pending, setPending] = useState<FileEntry[]>([]);
  const [recycle, setRecycle] = useState<RecycleResponse>(EMPTY_RECYCLE);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const currentFolderId = path.at(-1)?.id ?? null;

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const request = view === "library"
      ? api.listEntries(currentFolderId, controller.signal).then(setEntries)
      : view === "pending"
        ? api.listPending(currentFolderId, controller.signal).then(setPending)
        : api.listRecycle(controller.signal).then(setRecycle);

    request.catch((caught: unknown) => {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(describeError(caught));
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [api, currentFolderId, revision, view]);

  async function signOut() {
    setBusyId("logout");
    for (const job of jobs) job.controller.abort();
    try {
      await api.logout();
      onSignedOut();
    } catch (caught: unknown) {
      setError(describeError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function runAction(id: string, successMessage: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      refresh();
      return true;
    } catch (caught: unknown) {
      setError(describeError(caught));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function goToView(next: DriveViewName) {
    setView(next);
    setError("");
    setNotice("");
  }

  function enterFolder(folder: FolderEntry) {
    setPath((current) => [...current, folder]);
    setError("");
  }

  function goToCrumb(index: number) {
    setPath(index < 0 ? [] : path.slice(0, index + 1));
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    await runAction("new-folder", `Created “${name}”.`, async () => {
      await api.createFolder(name, currentFolderId);
      setNewFolderName("");
    });
  }

  function renameFolder(folder: FolderEntry) {
    const name = window.prompt("New folder name", folder.name)?.trim();
    if (name && name !== folder.name) {
      void runAction(folder.id, "Folder renamed.", () => api.updateFolder(folder.id, { name }));
    }
  }

  function moveFolder(folder: FolderEntry) {
    setMoveRequest({
      kind: "folder",
      item: folder,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  }

  function deleteFolder(folder: FolderEntry) {
    if (window.confirm(`Move the empty folder “${folder.name}” to the recycle bin?`)) {
      void runAction(folder.id, "Folder moved to the recycle bin.", () => api.deleteFolder(folder.id));
    }
  }

  function renameFile(file: FileEntry) {
    const displayName = window.prompt("New file name", file.displayName)?.trim();
    if (displayName && displayName !== file.displayName) {
      void runAction(file.id, "File renamed.", () => api.updateFile(file.id, { displayName }));
    }
  }

  function moveFile(file: FileEntry) {
    setMoveRequest({
      kind: "file",
      item: file,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  }

  function deleteFile(file: FileEntry) {
    if (window.confirm(`Move “${file.displayName}” to the recycle bin? The stored file will be preserved.`)) {
      void runAction(file.id, "File moved to the recycle bin.", () => api.deleteFile(file.id));
    }
  }

  async function downloadFile(file: FileEntry) {
    await runAction(`download-${file.id}`, "A short-lived download was opened.", async () => {
      const authorization = await api.createDownload(file.id);
      const anchor = document.createElement("a");
      anchor.href = authorization.url;
      anchor.download = file.displayName;
      anchor.rel = "noopener noreferrer";
      anchor.click();
    });
  }

  async function openPreview(file: FileEntry) {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusyId(`preview-${file.id}`);
    setError("");
    try {
      const authorization = await api.createDownload(file.id, "inline");
      setPreview({
        file,
        url: authorization.url,
        returnFocus,
      });
    } catch (caught: unknown) {
      setError(describeError(caught));
    } finally {
      setBusyId(null);
    }
  }

  function patchJob(jobId: string, patch: Partial<UploadJob>) {
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, ...patch } : job));
  }

  async function uploadFile(file: File, existing?: FileEntry) {
    if (file.size < 1) {
      setError("Empty files cannot be uploaded.");
      return;
    }
    const controller = new AbortController();
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: UploadJob = {
      id: jobId,
      file,
      fileId: existing?.id ?? null,
      phase: "checking",
      progress: 0,
      uploaded: false,
      error: null,
      controller,
    };
    setJobs((current) => [job, ...current.filter((item) => item.fileId !== existing?.id)]);
    setError("");

    try {
      const checksum = await checksumFile(file, {
        signal: controller.signal,
        onProgress: (fraction) => patchJob(jobId, { progress: fraction * 0.15 }),
      });
      const mediaType = file.type || "application/octet-stream";

      if (existing && (
        existing.displayName !== file.name ||
        existing.sizeBytes !== file.size ||
        existing.mediaType !== mediaType ||
        existing.checksum !== checksum
      )) {
        throw new Error("Choose the same file originally reserved for this pending upload.");
      }

      patchJob(jobId, { phase: "reserving", progress: 0.15 });
      const reserved = existing
        ? { file: existing, upload: await api.renewUpload(existing.id) }
        : await api.createUpload({
            folderId: currentFolderId,
            displayName: file.name,
            mediaType,
            sizeBytes: file.size,
            checksum: { algorithm: "md5", value: checksum },
          });
      patchJob(jobId, { fileId: reserved.file.id, phase: "uploading" });
      await directUpload(reserved.upload, file, {
        signal: controller.signal,
        onProgress: (fraction) => patchJob(jobId, { progress: 0.15 + fraction * 0.75 }),
      });
      patchJob(jobId, { phase: "verifying", uploaded: true, progress: 0.92 });
      await api.completeUpload(reserved.file.id);
      patchJob(jobId, { phase: "complete", progress: 1 });
      setNotice(`Uploaded “${file.name}”.`);
      refresh();
    } catch (caught: unknown) {
      patchJob(jobId, { phase: "error", error: describeError(caught) });
    }
  }

  async function retryJob(job: UploadJob) {
    if (!job.fileId) {
      setJobs((current) => current.filter((item) => item.id !== job.id));
      await uploadFile(job.file);
      return;
    }

    const controller = new AbortController();
    patchJob(job.id, { controller, phase: job.uploaded ? "verifying" : "reserving", error: null });
    try {
      if (!job.uploaded) {
        patchJob(job.id, { phase: "verifying", progress: Math.max(job.progress, 0.92) });
        try {
          await api.completeUpload(job.fileId);
          patchJob(job.id, { phase: "complete", uploaded: true, progress: 1 });
          setNotice(`Uploaded “${job.file.name}”.`);
          refresh();
          return;
        } catch (caught: unknown) {
          if (!(caught instanceof ApiError && caught.code === "upload_incomplete")) throw caught;
        }
        const authorization = await api.renewUpload(job.fileId);
        patchJob(job.id, { phase: "uploading", progress: 0.15 });
        await directUpload(authorization, job.file, {
          signal: controller.signal,
          onProgress: (fraction) => patchJob(job.id, { progress: 0.15 + fraction * 0.75 }),
        });
        patchJob(job.id, { uploaded: true, phase: "verifying", progress: 0.92 });
      }
      await api.completeUpload(job.fileId);
      patchJob(job.id, { phase: "complete", progress: 1 });
      setNotice(`Uploaded “${job.file.name}”.`);
      refresh();
    } catch (caught: unknown) {
      patchJob(job.id, { phase: "error", error: describeError(caught) });
    }
  }

  const activeJobs = jobs.filter((job) => job.phase !== "complete");
  const isLibraryEmpty = entries.folders.length === 0 && entries.files.length === 0;

  return (
    <>
    <div className="app-shell" inert={preview !== null || moveRequest !== null}>
      <a className="skip-link" href="#main-content">Skip to files</a>
      <header className="topbar">
        <div className="brand"><span>AC</span> AcademicCloud</div>
        <div className="account-menu">
          <span className="avatar" aria-hidden="true">{account.loginName.slice(0, 1).toUpperCase()}</span>
          <span className="account-name">{account.loginName}</span>
          <button className="button button--quiet" type="button" onClick={() => void signOut()} disabled={busyId === "logout"}>
            Sign out
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Primary navigation">
        <nav>
          <button className={view === "library" ? "nav-item is-active" : "nav-item"} aria-current={view === "library" ? "page" : undefined} onClick={() => goToView("library")}>
            <span aria-hidden="true">▦</span> Library
          </button>
          <button className={view === "pending" ? "nav-item is-active" : "nav-item"} aria-current={view === "pending" ? "page" : undefined} onClick={() => goToView("pending")}>
            <span aria-hidden="true">↑</span> Pending uploads
          </button>
          <button className={view === "recycle" ? "nav-item is-active" : "nav-item"} aria-current={view === "recycle" ? "page" : undefined} onClick={() => goToView("recycle")}>
            <span aria-hidden="true">↺</span> Recycle bin
          </button>
        </nav>
        <div className="sidebar-note">
          <strong>Private storage</strong>
          <span>Files open with short-lived links.</span>
        </div>
      </aside>

      <main id="main-content" className="workspace" tabIndex={-1}>
        <div className="workspace-head">
          <div>
            <p className="eyebrow">{view === "recycle" ? "Recoverable items" : "Your research files"}</p>
            <h1>{view === "library" ? path.at(-1)?.name ?? "Library" : view === "pending" ? "Pending uploads" : "Recycle bin"}</h1>
          </div>
          {view === "library" && (
            <label className="button button--primary upload-button">
              Upload files
              <input
                className="visually-hidden"
                type="file"
                multiple
                onChange={(event) => {
                  for (const file of Array.from(event.target.files ?? [])) void uploadFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {view !== "recycle" && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <ol>
              <li><button type="button" onClick={() => goToCrumb(-1)} aria-current={path.length === 0 ? "page" : undefined}>Library</button></li>
              {path.map((folder, index) => (
                <li key={folder.id}>
                  <span aria-hidden="true">/</span>
                  <button type="button" onClick={() => goToCrumb(index)} aria-current={index === path.length - 1 ? "page" : undefined}>
                    {folder.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {error && <div className="alert alert--error" role="alert">{error} <button type="button" onClick={() => setError("")}>Dismiss</button></div>}
        {notice && <div className="alert alert--success" role="status">{notice}</div>}

        {activeJobs.length > 0 && (
          <section className="upload-queue" aria-labelledby="upload-queue-title">
            <div className="section-heading">
              <h2 id="upload-queue-title">Upload activity</h2>
              <span>{activeJobs.length} in progress or needing attention</span>
            </div>
            {activeJobs.map((job) => (
              <div className="upload-job" key={job.id}>
                <div>
                  <strong>{job.file.name}</strong>
                  <span>{uploadPhaseLabel(job.phase)}</span>
                </div>
                <progress value={job.progress} max={1} aria-label={`${job.file.name} upload progress`} />
                <span>{Math.round(job.progress * 100)}%</span>
                {job.phase === "error" ? (
                  <div className="job-error">
                    <span role="alert">{job.error}</span>
                    <button className="button button--small" type="button" aria-label={`Verify stored copy or retry ${job.file.name}`} onClick={() => void retryJob(job)}>Verify or retry</button>
                    <button className="button button--small button--quiet" type="button" aria-label={`Dismiss ${job.file.name} upload status`} onClick={() => setJobs((current) => current.filter((item) => item.id !== job.id))}>Dismiss</button>
                  </div>
                ) : (
                  <button className="button button--small button--quiet" type="button" aria-label={`Cancel ${job.file.name} upload`} onClick={() => job.controller.abort()}>Cancel</button>
                )}
              </div>
            ))}
          </section>
        )}

        {view === "library" && (
          <>
            <form className="new-folder" onSubmit={(event) => void createFolder(event)}>
              <label htmlFor="folder-name">New folder</label>
              <div>
                <input id="folder-name" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Reading notes" maxLength={255} />
                <button className="button" type="submit" disabled={!newFolderName.trim() || busyId === "new-folder"}>Create</button>
              </div>
            </form>
            <section aria-labelledby="contents-title">
              <div className="section-heading">
                <h2 id="contents-title">Contents</h2>
                {!loading && <span>{entries.folders.length + entries.files.length} items</span>}
              </div>
              {loading ? <LoadingRows /> : isLibraryEmpty ? (
                <EmptyState title="This folder is ready" text="Upload a source file or create a folder to begin." />
              ) : (
                <EntryTable
                  folders={entries.folders}
                  files={entries.files}
                  busyId={busyId}
                  onEnterFolder={enterFolder}
                  onRenameFolder={renameFolder}
                  onMoveFolder={moveFolder}
                  onDeleteFolder={deleteFolder}
                  onPreview={(file) => void openPreview(file)}
                  onDownload={(file) => void downloadFile(file)}
                  onRenameFile={renameFile}
                  onMoveFile={moveFile}
                  onDeleteFile={deleteFile}
                />
              )}
            </section>
          </>
        )}

        {view === "pending" && (
          <section aria-labelledby="pending-title">
            <div className="section-heading">
              <h2 id="pending-title">Reserved uploads</h2>
              <button className="button button--quiet" type="button" onClick={refresh}>Refresh</button>
            </div>
            <p className="section-copy">If an upload was interrupted, choose the exact same local file to renew its short-lived authorization and continue.</p>
            {loading ? <LoadingRows /> : pending.length === 0 ? (
              <EmptyState title="No pending uploads" text="Interrupted or unverified uploads will appear here." />
            ) : (
              <div className="card-list">
                {pending.map((file) => (
                  <article className="pending-card" key={file.id}>
                    <FileBadge file={file} />
                    <div className="entry-primary"><strong>{file.displayName}</strong><span>{formatBytes(file.sizeBytes)} · Reserved {formatDate(file.createdAt)}</span></div>
                    <label className="button button--small" aria-label={`Choose same file for ${file.displayName}`}>
                      Choose same file
                      <input className="visually-hidden" type="file" onChange={(event) => {
                        const selected = event.target.files?.[0];
                        if (selected) void uploadFile(selected, file);
                        event.target.value = "";
                      }} />
                    </label>
                    <button className="button button--small button--quiet" type="button" aria-label={`Verify ${file.displayName} again`} onClick={() => void runAction(file.id, "Storage verification retried.", () => api.completeUpload(file.id))}>
                      Verify again
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "recycle" && (
          <section aria-labelledby="recycle-title">
            <div className="section-heading"><h2 id="recycle-title">Recoverable items</h2>{!loading && <span>{recycle.folders.length + recycle.files.length} items</span>}</div>
            <p className="section-copy">Restoring keeps the original stored bytes. Permanent deletion cannot be undone.</p>
            {loading ? <LoadingRows /> : recycle.folders.length + recycle.files.length === 0 ? (
              <EmptyState title="The recycle bin is empty" text="Soft-deleted files and folders remain recoverable here." />
            ) : (
              <div className="card-list">
                {recycle.folders.map((folder) => (
                  <article className="recycle-card" key={folder.id}>
                    <span className="file-badge file-badge--folder" aria-hidden="true">DIR</span>
                    <div className="entry-primary"><strong>{folder.name}</strong><span>Folder · Deleted {formatDate(folder.deletedAt)}</span></div>
                    <button className="button button--small" type="button" aria-label={`Restore folder ${folder.name}`} disabled={busyId === folder.id} onClick={() => void runAction(folder.id, "Folder restored.", () => api.restoreFolder(folder.id))}>Restore</button>
                  </article>
                ))}
                {recycle.files.map((file) => (
                  <article className="recycle-card" key={file.id}>
                    <FileBadge file={file} />
                    <div className="entry-primary"><strong>{file.displayName}</strong><span>{formatBytes(file.sizeBytes)} · Deleted {formatDate(file.deletedAt)}</span></div>
                    <button className="button button--small" type="button" aria-label={`Restore file ${file.displayName}`} disabled={busyId === file.id} onClick={() => void runAction(file.id, "File restored.", () => api.restoreFile(file.id))}>Restore</button>
                    <button className="button button--small button--danger" type="button" aria-label={`Delete ${file.displayName} forever`} disabled={busyId === file.id} onClick={() => {
                      if (window.confirm(`Permanently delete “${file.displayName}”? This removes the stored object and cannot be undone.`)) {
                        void runAction(file.id, "File permanently deleted.", () => api.permanentlyDeleteFile(file.id));
                      }
                    }}>Delete forever</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

    </div>

      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} />}
      {moveRequest && (
        <MoveDialog
          api={api}
          request={moveRequest}
          onClose={() => setMoveRequest(null)}
          onMove={async (folderId) => {
            if (moveRequest.kind === "folder") {
              await api.updateFolder(moveRequest.item.id, { parentId: folderId });
            } else {
              await api.updateFile(moveRequest.item.id, { folderId });
            }
            setNotice(moveRequest.kind === "folder" ? "Folder moved." : "File moved.");
            refresh();
            setMoveRequest(null);
          }}
        />
      )}
    </>
  );
}

function EntryTable({
  folders,
  files,
  busyId,
  onEnterFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onPreview,
  onDownload,
  onRenameFile,
  onMoveFile,
  onDeleteFile,
}: {
  folders: FolderEntry[];
  files: FileEntry[];
  busyId: string | null;
  onEnterFolder: (folder: FolderEntry) => void;
  onRenameFolder: (folder: FolderEntry) => void;
  onMoveFolder: (folder: FolderEntry) => void;
  onDeleteFolder: (folder: FolderEntry) => void;
  onPreview: (file: FileEntry) => void;
  onDownload: (file: FileEntry) => void;
  onRenameFile: (file: FileEntry) => void;
  onMoveFile: (file: FileEntry) => void;
  onDeleteFile: (file: FileEntry) => void;
}) {
  return (
    <div className="entry-table" role="table" aria-label="Folder contents">
      <div className="entry-row entry-row--head" role="row">
        <span role="columnheader">Name</span><span role="columnheader">Size</span><span role="columnheader">Updated</span><span role="columnheader">Actions</span>
      </div>
      {folders.map((folder) => (
        <div className="entry-row" role="row" key={folder.id}>
          <div className="entry-name" role="cell">
            <span className="file-badge file-badge--folder" aria-hidden="true">DIR</span>
            <button className="entry-link" type="button" onClick={() => onEnterFolder(folder)}>{folder.name}</button>
          </div>
          <span role="cell">—</span>
          <span role="cell">{formatDate(folder.updatedAt)}</span>
          <div className="entry-actions" role="cell">
            <button type="button" aria-label={`Rename folder ${folder.name}`} disabled={busyId === folder.id} onClick={() => onRenameFolder(folder)}>Rename</button>
            <button type="button" aria-label={`Move folder ${folder.name}`} disabled={busyId === folder.id} onClick={() => onMoveFolder(folder)}>Move</button>
            <button className="danger-link" type="button" aria-label={`Recycle folder ${folder.name}`} disabled={busyId === folder.id} onClick={() => onDeleteFolder(folder)}>Recycle</button>
          </div>
        </div>
      ))}
      {files.map((file) => (
        <div className="entry-row" role="row" key={file.id}>
          <div className="entry-name" role="cell">
            <FileBadge file={file} />
            <div className="entry-primary"><strong>{file.displayName}</strong><span>{file.mediaType}</span></div>
          </div>
          <span role="cell">{formatBytes(file.sizeBytes)}</span>
          <span role="cell">{formatDate(file.updatedAt)}</span>
          <div className="entry-actions" role="cell">
            {isPreviewable(file) && <button type="button" aria-label={`Preview ${file.displayName}`} disabled={busyId === `preview-${file.id}`} onClick={() => onPreview(file)}>Preview</button>}
            <button type="button" aria-label={`Download ${file.displayName}`} disabled={busyId === `download-${file.id}`} onClick={() => onDownload(file)}>Download</button>
            <button type="button" aria-label={`Rename file ${file.displayName}`} disabled={busyId === file.id} onClick={() => onRenameFile(file)}>Rename</button>
            <button type="button" aria-label={`Move file ${file.displayName}`} disabled={busyId === file.id} onClick={() => onMoveFile(file)}>Move</button>
            <button className="danger-link" type="button" aria-label={`Recycle file ${file.displayName}`} disabled={busyId === file.id} onClick={() => onDeleteFile(file)}>Recycle</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileBadge({ file }: { file: FileEntry }) {
  const label = file.mediaType === "application/pdf" ? "PDF" : file.mediaType.startsWith("image/") ? "IMG" : file.mediaType.startsWith("text/") ? "TXT" : "FILE";
  return <span className={`file-badge file-badge--${label.toLowerCase()}`} aria-hidden="true">{label}</span>;
}

function PreviewDialog({ preview, onClose }: { preview: PreviewState; onClose: () => void }) {
  const dialogRef = useModalDialog(onClose, false, preview.returnFocus);

  return (
      <dialog ref={dialogRef} className="preview-modal" aria-labelledby="preview-title">
        <header>
          <div><p className="eyebrow">Short-lived preview</p><h2 id="preview-title">{preview.file.displayName}</h2></div>
          <button className="button button--quiet" type="button" onClick={onClose} aria-label="Close preview">Close</button>
        </header>
        <div className="preview-content">
          {preview.file.mediaType.startsWith("image/") ? (
            <img src={preview.url} alt={`Preview of ${preview.file.displayName}`} referrerPolicy="no-referrer" />
          ) : (
            <iframe src={preview.url} title={`Preview of ${preview.file.displayName}`} referrerPolicy="no-referrer" />
          )}
        </div>
        <footer>
          <span>This link expires automatically.</span>
          <a className="button" href={preview.url} target="_blank" rel="noreferrer">Open in a new tab</a>
        </footer>
      </dialog>
  );
}

function MoveDialog({
  api,
  request,
  onClose,
  onMove,
}: {
  api: AcademicCloudApi;
  request: MoveRequest;
  onClose: () => void;
  onMove: (folderId: string | null) => Promise<void>;
}) {
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moving, setMoving] = useState(false);
  const dialogRef = useModalDialog(onClose, moving, request.returnFocus);
  const destinationId = path.at(-1)?.id ?? null;
  const currentParentId = request.kind === "folder" ? request.item.parentId : request.item.folderId;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api.listEntries(destinationId, controller.signal).then(
      (response) => setFolders(response.folders.filter((folder) => request.kind !== "folder" || folder.id !== request.item.id)),
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(describeError(caught));
      },
    ).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [api, destinationId, request]);

  const itemName = request.kind === "folder" ? request.item.name : request.item.displayName;

  return (
      <dialog ref={dialogRef} className="move-modal" aria-labelledby="move-title">
        <header>
          <div><p className="eyebrow">Choose destination</p><h2 id="move-title">Move “{itemName}”</h2></div>
          <button className="button button--quiet" type="button" onClick={onClose} disabled={moving}>Close</button>
        </header>
        <nav className="breadcrumbs" aria-label="Destination breadcrumb">
          <ol>
            <li><button type="button" onClick={() => setPath([])} aria-current={path.length === 0 ? "page" : undefined}>Library</button></li>
            {path.map((folder, index) => (
              <li key={folder.id}>
                <span aria-hidden="true">/</span>
                <button type="button" onClick={() => setPath(path.slice(0, index + 1))} aria-current={index === path.length - 1 ? "page" : undefined}>{folder.name}</button>
              </li>
            ))}
          </ol>
        </nav>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <div className="destination-list" aria-busy={loading}>
          {loading ? <LoadingRows /> : folders.length === 0 ? (
            <p className="muted">This folder has no subfolders.</p>
          ) : folders.map((folder) => (
            <button className="destination-folder" type="button" key={folder.id} onClick={() => setPath((current) => [...current, folder])}>
              <span className="file-badge file-badge--folder" aria-hidden="true">DIR</span>
              <span>{folder.name}</span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
        <footer>
          <span>Destination: {path.at(-1)?.name ?? "Library"}</span>
          <button
            className="button button--primary"
            type="button"
            disabled={moving || loading || destinationId === currentParentId}
            onClick={() => {
              setMoving(true);
              setError("");
              void onMove(destinationId).catch((caught: unknown) => {
                setError(describeError(caught));
              }).finally(() => setMoving(false));
            }}
          >
            {moving ? "Moving…" : "Move here"}
          </button>
        </footer>
      </dialog>
  );
}

function useModalDialog(onClose: () => void, closeDisabled = false, returnFocus?: HTMLElement | null) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!closeDisabledRef.current) onCloseRef.current();
    };
    const fallbackKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    dialog.addEventListener("cancel", cancel);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      document.addEventListener("keydown", fallbackKeys);
      dialog.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus();
    }

    return () => {
      dialog.removeEventListener("cancel", cancel);
      document.removeEventListener("keydown", fallbackKeys);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return dialogRef;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span aria-hidden="true">◇</span><h3>{title}</h3><p>{text}</p></div>;
}

function LoadingRows() {
  return <div className="loading-rows" role="status"><span /><span /><span /><span className="visually-hidden">Loading items…</span></div>;
}

function isPreviewable(file: FileEntry): boolean {
  return [
    "application/pdf",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ].includes(file.mediaType);
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1_024;
  let index = 0;
  while (value >= 1_024 && index < units.length - 1) {
    value /= 1_024;
    index += 1;
  }
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)} ${units[index]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function uploadPhaseLabel(phase: UploadPhase): string {
  switch (phase) {
    case "checking": return "Calculating checksum";
    case "reserving": return "Requesting secure upload";
    case "uploading": return "Sending directly to object storage";
    case "verifying": return "Verifying stored file";
    case "complete": return "Complete";
    case "error": return "Needs attention";
  }
}
