import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  ApiClient,
  ApiError,
  type AcademicCloudApi,
  type Account,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
  type RecycleResponse,
} from "./api.ts";
import { uploadDirectly } from "./direct-upload.ts";
import { describeError, formatCount, formatDate } from "./i18n.ts";
import { LanguageProvider, LanguageSwitch, useLanguage } from "./i18n-react.tsx";
import { calculateFileMd5 } from "./md5.ts";
import { formatSpeed, UploadProgressTracker } from "./upload-metrics.ts";

type AuthState =
  | { phase: "checking" }
  | { phase: "anonymous"; message?: unknown }
  | { phase: "authenticated"; account: Account };

export interface AppProps {
  api?: AcademicCloudApi;
  checksumFile?: typeof calculateFileMd5;
  directUpload?: typeof uploadDirectly;
}

export function App({ api: injectedApi, checksumFile = calculateFileMd5, directUpload = uploadDirectly }: AppProps) {
  return (
    <LanguageProvider>
      <AppContent api={injectedApi} checksumFile={checksumFile} directUpload={directUpload} />
    </LanguageProvider>
  );
}

function AppContent({
  api: injectedApi,
  checksumFile,
  directUpload,
}: {
  api: AcademicCloudApi | undefined;
  checksumFile: typeof calculateFileMd5;
  directUpload: typeof uploadDirectly;
}) {
  const [auth, setAuth] = useState<AuthState>({ phase: "checking" });
  const api = useMemo(
    () =>
      injectedApi ??
      new ApiClient({
        // The raw error object is stored; LoginView localizes it at render
        // time, so a later language switch re-renders it correctly.
        onUnauthorized: () => setAuth({ phase: "anonymous", message: new ApiError(401, "authentication_required") }),
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
            ...(error instanceof ApiError && error.status === 401 ? {} : { message: error }),
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
        {...(auth.message === undefined ? {} : { initialError: auth.message })}
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
  const { t } = useLanguage();
  return (
    <main className="centered-shell" aria-busy="true">
      <div className="loading-mark" aria-hidden="true">AC</div>
      <p role="status">{t("app.loading")}</p>
    </main>
  );
}

function LoginView({
  api,
  initialError,
  onAuthenticated,
}: {
  api: AcademicCloudApi;
  initialError?: unknown;
  onAuthenticated: (account: Account) => void;
}) {
  const { language, t } = useLanguage();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onAuthenticated(await api.login(loginName, password));
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <p className="eyebrow">{t("login.eyebrow")}</p>
        <h1 id="login-title">{t("login.title")}</h1>
        <p>{t("login.subtitle")}</p>
        <div className="privacy-note">
          <span aria-hidden="true">●</span>
          {t("login.privacy")}
        </div>
      </section>
      <section className="login-card" aria-labelledby="signin-title">
        <div className="brand"><span>AC</span> AcademicCloud</div>
        <h2 id="signin-title">{t("login.welcome")}</h2>
        <p className="muted">{t("login.muted")}</p>
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="login-name">{t("login.nameLabel")}</label>
          <input
            id="login-name"
            name="loginName"
            autoComplete="username"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            required
            autoFocus
          />
          <label htmlFor="login-password">{t("login.passwordLabel")}</label>
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
            {submitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
        <div className="login-language">
          <LanguageSwitch labelled />
        </div>
      </section>
    </main>
  );
}

type DriveViewName = "library" | "pending" | "recycle";
type UploadPhase = "queued" | "checksum" | "reserving" | "uploading" | "verifying" | "complete" | "error" | "cancelled";

const ACTIVE_UPLOAD_PHASES: ReadonlySet<UploadPhase> = new Set(["checksum", "reserving", "uploading", "verifying"]);
const MAX_CONCURRENT_UPLOADS = 2;
const UPLOAD_METRICS_UPDATE_INTERVAL_MS = 500;

interface UploadJob {
  id: string;
  file: File;
  existing: FileEntry | null;
  fileId: string | null;
  phase: UploadPhase;
  progress: number;
  uploaded: boolean;
  error: string | null;
  controller: AbortController;
  bytesUploaded: number;
  totalBytes: number;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
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
  const { language, t } = useLanguage();
  const [view, setView] = useState<DriveViewName>("library");
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [entries, setEntries] = useState<EntriesResponse>(EMPTY_ENTRIES);
  const [pending, setPending] = useState<FileEntry[]>([]);
  const [recycle, setRecycle] = useState<RecycleResponse>(EMPTY_RECYCLE);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<unknown>(null);
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
    setError(null);

    const request = view === "library"
      ? api.listEntries(currentFolderId, controller.signal).then(setEntries)
      : view === "pending"
        ? api.listPending(currentFolderId, controller.signal).then(setPending)
        : api.listRecycle(controller.signal).then(setRecycle);

    request.catch((caught: unknown) => {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught);
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [api, currentFolderId, revision, view]);

  function patchJob(jobId: string, patch: Partial<UploadJob>) {
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, ...patch } : job));
  }

  async function runUploadWorkflow(jobId: string, file: File, existing: FileEntry | null) {
    const controller = new AbortController();
    patchJob(jobId, { controller });

    const tracker = new UploadProgressTracker(file.size);
    const lastMetricUpdate = { at: 0 };

    try {
      patchJob(jobId, { phase: "checksum", progress: 0, speedBytesPerSecond: null, etaSeconds: null });
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
        throw new Error(t("upload.sameFileMismatch"));
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
      patchJob(jobId, { fileId: reserved.file.id, phase: "uploading", totalBytes: file.size });
      await directUpload(reserved.upload, file, {
        signal: controller.signal,
        onProgress: (fraction) => patchJob(jobId, { progress: 0.15 + fraction * 0.75 }),
        onMetrics: (metrics) => {
          const now = Date.now();
          const snapshot = tracker.record(metrics.loaded, now);
          // Throttle state updates so the progress bar and speed/ETA do not
          // re-render the whole queue on every XHR progress tick.
          if (now - lastMetricUpdate.at >= UPLOAD_METRICS_UPDATE_INTERVAL_MS || snapshot.fraction >= 1) {
            lastMetricUpdate.at = now;
            patchJob(jobId, {
              progress: 0.15 + snapshot.fraction * 0.75,
              bytesUploaded: metrics.loaded,
              speedBytesPerSecond: snapshot.speedBytesPerSecond,
              etaSeconds: snapshot.etaSeconds,
            });
          }
        },
      });
      patchJob(jobId, { phase: "verifying", uploaded: true, progress: 0.92, speedBytesPerSecond: null, etaSeconds: null });
      await api.completeUpload(reserved.file.id);
      patchJob(jobId, { phase: "complete", progress: 1 });
      setNotice(t("upload.uploaded", { name: file.name }));
      refresh();
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        patchJob(jobId, { phase: "cancelled" });
      } else {
        patchJob(jobId, { phase: "error", error: describeError(caught, language) });
      }
    }
  }

  const startJob = useCallback(
    (job: UploadJob) => {
      if (job.phase !== "queued") return;
      void runUploadWorkflow(job.id, job.file, job.existing);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, checksumFile, directUpload, currentFolderId, language, refresh, t],
  );

  // Bounded concurrency pump: at most MAX_CONCURRENT_UPLOADS workflows run at
  // once; queued items wait (checksum computation included) until a slot opens.
  useEffect(() => {
    const active = jobs.filter((job) => ACTIVE_UPLOAD_PHASES.has(job.phase)).length;
    if (active >= MAX_CONCURRENT_UPLOADS) return;
    const next = jobs.find((job) => job.phase === "queued");
    if (next) startJob(next);
  }, [jobs, startJob]);

  function enqueueFile(file: File, existing?: FileEntry) {
    if (file.size < 1) {
      setError(new Error(t("upload.emptyFile")));
      return;
    }
    const job: UploadJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      existing: existing ?? null,
      fileId: existing?.id ?? null,
      phase: "queued",
      progress: 0,
      uploaded: false,
      error: null,
      controller: new AbortController(),
      bytesUploaded: 0,
      totalBytes: file.size,
      speedBytesPerSecond: null,
      etaSeconds: null,
    };
    setJobs((current) => [job, ...current.filter((item) => item.fileId !== existing?.id)]);
    setError(null);
  }

  function cancelJob(jobId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    if (job.phase === "queued") {
      patchJob(jobId, { phase: "cancelled" });
    } else {
      job.controller.abort();
    }
  }

  async function retryJob(job: UploadJob) {
    if (!job.fileId) {
      setJobs((current) => current.filter((item) => item.id !== job.id));
      enqueueFile(job.file);
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
          setNotice(t("upload.uploaded", { name: job.file.name }));
          refresh();
          return;
        } catch (caught: unknown) {
          if (!(caught instanceof ApiError && caught.code === "upload_incomplete")) throw caught;
        }
        const authorization = await api.renewUpload(job.fileId);
        patchJob(job.id, { phase: "uploading", progress: 0.15, totalBytes: job.file.size });
        await directUpload(authorization, job.file, {
          signal: controller.signal,
          onProgress: (fraction) => patchJob(job.id, { progress: 0.15 + fraction * 0.75 }),
        });
        patchJob(job.id, { uploaded: true, phase: "verifying", progress: 0.92 });
      }
      await api.completeUpload(job.fileId);
      patchJob(job.id, { phase: "complete", progress: 1 });
      setNotice(t("upload.uploaded", { name: job.file.name }));
      refresh();
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        patchJob(job.id, { phase: "cancelled" });
      } else {
        patchJob(job.id, { phase: "error", error: describeError(caught, language) });
      }
    }
  }

  async function signOut() {
    setBusyId("logout");
    for (const job of jobs) job.controller.abort();
    try {
      await api.logout();
      onSignedOut();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function runAction(id: string, successMessage: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusyId(id);
    setError(null);
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      refresh();
      return true;
    } catch (caught: unknown) {
      setError(caught);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function goToView(next: DriveViewName) {
    setView(next);
    setError(null);
    setNotice("");
  }

  function enterFolder(folder: FolderEntry) {
    setPath((current) => [...current, folder]);
    setError(null);
  }

  function goToCrumb(index: number) {
    setPath(index < 0 ? [] : path.slice(0, index + 1));
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    await runAction("new-folder", t("folder.created", { name }), async () => {
      await api.createFolder(name, currentFolderId);
      setNewFolderName("");
    });
  }

  function renameFolder(folder: FolderEntry) {
    const name = window.prompt(t("folder.promptRename"), folder.name)?.trim();
    if (name && name !== folder.name) {
      void runAction(folder.id, t("folder.renamed"), () => api.updateFolder(folder.id, { name }));
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
    if (window.confirm(t("folder.moveConfirm", { name: folder.name }))) {
      void runAction(folder.id, t("folder.moved"), () => api.deleteFolder(folder.id));
    }
  }

  function renameFile(file: FileEntry) {
    const displayName = window.prompt(t("file.promptRename"), file.displayName)?.trim();
    if (displayName && displayName !== file.displayName) {
      void runAction(file.id, t("file.renamed"), () => api.updateFile(file.id, { displayName }));
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
    if (window.confirm(t("file.recycleConfirm", { name: file.displayName }))) {
      void runAction(file.id, t("file.recycled"), () => api.deleteFile(file.id));
    }
  }

  async function downloadFile(file: FileEntry) {
    await runAction(`download-${file.id}`, t("file.downloadOpened"), async () => {
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
    setError(null);
    try {
      const authorization = await api.createDownload(file.id, "inline");
      setPreview({
        file,
        url: authorization.url,
        returnFocus,
      });
    } catch (caught: unknown) {
      // preview_unavailable renders the localized fail-safe message; the
      // Preview button never silently triggers a download.
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  const activeJobs = jobs.filter((job) => job.phase !== "complete");
  const isLibraryEmpty = entries.folders.length === 0 && entries.files.length === 0;

  return (
    <>
    <div className="app-shell" inert={preview !== null || moveRequest !== null}>
      <a className="skip-link" href="#main-content">{t("nav.skip")}</a>
      <header className="topbar">
        <div className="brand"><span>AC</span> AcademicCloud</div>
        <div className="account-menu">
          <LanguageSwitch />
          <span className="avatar" aria-hidden="true">{account.loginName.slice(0, 1).toUpperCase()}</span>
          <span className="account-name">{account.loginName}</span>
          <button className="button button--quiet" type="button" onClick={() => void signOut()} disabled={busyId === "logout"}>
            {t("nav.signOut")}
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label={t("nav.primaryAria")}>
        <nav>
          <button className={view === "library" ? "nav-item is-active" : "nav-item"} aria-current={view === "library" ? "page" : undefined} onClick={() => goToView("library")}>
            <span aria-hidden="true">▦</span> {t("nav.library")}
          </button>
          <button className={view === "pending" ? "nav-item is-active" : "nav-item"} aria-current={view === "pending" ? "page" : undefined} onClick={() => goToView("pending")}>
            <span aria-hidden="true">↑</span> {t("nav.pending")}
          </button>
          <button className={view === "recycle" ? "nav-item is-active" : "nav-item"} aria-current={view === "recycle" ? "page" : undefined} onClick={() => goToView("recycle")}>
            <span aria-hidden="true">↺</span> {t("nav.recycle")}
          </button>
        </nav>
        <div className="sidebar-note">
          <strong>{t("sidebar.privateTitle")}</strong>
          <span>{t("sidebar.privateText")}</span>
        </div>
      </aside>

      <main id="main-content" className="workspace" tabIndex={-1}>
        <div className="workspace-head">
          <div>
            <p className="eyebrow">{view === "recycle" ? t("workspace.recoverableEyebrow") : t("workspace.filesEyebrow")}</p>
            <h1>{view === "library" ? path.at(-1)?.name ?? t("nav.library") : view === "pending" ? t("nav.pending") : t("nav.recycle")}</h1>
          </div>
          {view === "library" && (
            <label className="button button--primary upload-button">
              {t("workspace.uploadFiles")}
              <input
                className="visually-hidden"
                type="file"
                multiple
                onChange={(event) => {
                  for (const file of Array.from(event.target.files ?? [])) enqueueFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {view !== "recycle" && (
          <nav className="breadcrumbs" aria-label={t("breadcrumb.aria")}>
            <ol>
              <li><button type="button" onClick={() => goToCrumb(-1)} aria-current={path.length === 0 ? "page" : undefined}>{t("nav.library")}</button></li>
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

        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)} <button type="button" onClick={() => setError(null)}>{t("alert.dismiss")}</button></div>}
        {notice && <div className="alert alert--success" role="status">{notice}</div>}

        {activeJobs.length > 0 && (
          <section className="upload-queue" aria-labelledby="upload-queue-title">
            <div className="section-heading">
              <h2 id="upload-queue-title">{t("upload.queueTitle")}</h2>
              <span>{t("upload.queueSummary", { count: activeJobs.length })}</span>
            </div>
            {activeJobs.map((job) => (
              <div className="upload-job" key={job.id}>
                <div>
                  <strong>{job.file.name}</strong>
                  <span>{t(uploadPhaseKey(job.phase))}</span>
                </div>
                <progress value={job.progress} max={1} aria-label={t("upload.progressAria", { name: job.file.name })} />
                <span>{Math.round(job.progress * 100)}%</span>
                {job.phase === "uploading" && (
                  <span className="upload-metrics">
                    {formatBytes(job.bytesUploaded)} / {formatBytes(job.totalBytes)}
                    {job.speedBytesPerSecond !== null && (
                      <>
                        {" · "}{formatSpeed(job.speedBytesPerSecond)}
                        {job.etaSeconds !== null && job.etaSeconds > 0 && <>{" · "}{t("upload.etaSeconds", { seconds: job.etaSeconds })}</>}
                      </>
                    )}
                  </span>
                )}
                {job.phase === "error" || job.phase === "cancelled" ? (
                  <div className="job-error">
                    {job.phase === "error" && <span role="alert">{job.error}</span>}
                    {job.phase === "error" && (
                      <button className="button button--small" type="button" aria-label={t("upload.verifyRetryAria", { name: job.file.name })} onClick={() => void retryJob(job)}>{t("upload.verifyOrRetry")}</button>
                    )}
                    <button className="button button--small button--quiet" type="button" aria-label={t("upload.dismissAria", { name: job.file.name })} onClick={() => setJobs((current) => current.filter((item) => item.id !== job.id))}>{t("alert.dismiss")}</button>
                  </div>
                ) : (
                  <button className="button button--small button--quiet" type="button" aria-label={t("upload.cancelAria", { name: job.file.name })} onClick={() => cancelJob(job.id)}>{t("upload.cancel")}</button>
                )}
              </div>
            ))}
          </section>
        )}

        {view === "library" && (
          <>
            <form className="new-folder" onSubmit={(event) => void createFolder(event)}>
              <label htmlFor="folder-name">{t("folder.newLabel")}</label>
              <div>
                <input id="folder-name" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder={t("folder.newPlaceholder")} maxLength={255} />
                <button className="button" type="submit" disabled={!newFolderName.trim() || busyId === "new-folder"}>{t("folder.create")}</button>
              </div>
            </form>
            <section aria-labelledby="contents-title">
              <div className="section-heading">
                <h2 id="contents-title">{t("folder.contentsTitle")}</h2>
                {!loading && <span>{t("folder.items", { count: formatCount(language, entries.folders.length + entries.files.length) })}</span>}
              </div>
              {loading ? <LoadingRows /> : isLibraryEmpty ? (
                <EmptyState title={t("folder.emptyTitle")} text={t("folder.emptyText")} />
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
              <h2 id="pending-title">{t("pending.title")}</h2>
              <button className="button button--quiet" type="button" onClick={refresh}>{t("pending.refresh")}</button>
            </div>
            <p className="section-copy">{t("pending.copy")}</p>
            {loading ? <LoadingRows /> : pending.length === 0 ? (
              <EmptyState title={t("pending.emptyTitle")} text={t("pending.emptyText")} />
            ) : (
              <div className="card-list">
                {pending.map((file) => (
                  <article className="pending-card" key={file.id}>
                    <FileBadge file={file} />
                    <div className="entry-primary"><strong>{file.displayName}</strong><span>{formatBytes(file.sizeBytes)} · {t("pending.reservedAt", { date: formatDate(file.createdAt, language) })}</span></div>
                    <label className="button button--small" aria-label={t("pending.chooseSameAria", { name: file.displayName })}>
                      {t("pending.chooseSame")}
                      <input className="visually-hidden" type="file" onChange={(event) => {
                        const selected = event.target.files?.[0];
                        if (selected) enqueueFile(selected, file);
                        event.target.value = "";
                      }} />
                    </label>
                    <button className="button button--small button--quiet" type="button" aria-label={t("pending.verifyAgainAria", { name: file.displayName })} onClick={() => void runAction(file.id, t("pending.verifyRetried"), () => api.completeUpload(file.id))}>
                      {t("pending.verifyAgain")}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "recycle" && (
          <section aria-labelledby="recycle-title">
            <div className="section-heading"><h2 id="recycle-title">{t("recycle.title")}</h2>{!loading && <span>{t("folder.items", { count: formatCount(language, recycle.folders.length + recycle.files.length) })}</span>}</div>
            <p className="section-copy">{t("recycle.copy")}</p>
            {loading ? <LoadingRows /> : recycle.folders.length + recycle.files.length === 0 ? (
              <EmptyState title={t("recycle.emptyTitle")} text={t("recycle.emptyText")} />
            ) : (
              <div className="card-list">
                {recycle.folders.map((folder) => (
                  <article className="recycle-card" key={folder.id}>
                    <span className="file-badge file-badge--folder" aria-hidden="true">DIR</span>
                    <div className="entry-primary"><strong>{folder.name}</strong><span>{t("recycle.folderDeleted", { date: formatDate(folder.deletedAt, language) })}</span></div>
                    <button className="button button--small" type="button" aria-label={t("recycle.restoreFolderAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => void runAction(folder.id, t("recycle.folderRestored"), () => api.restoreFolder(folder.id))}>{t("recycle.restore")}</button>
                  </article>
                ))}
                {recycle.files.map((file) => (
                  <article className="recycle-card" key={file.id}>
                    <FileBadge file={file} />
                    <div className="entry-primary"><strong>{file.displayName}</strong><span>{formatBytes(file.sizeBytes)} · {t("recycle.fileDeleted", { date: formatDate(file.deletedAt, language) })}</span></div>
                    <button className="button button--small" type="button" aria-label={t("recycle.restoreFileAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => void runAction(file.id, t("file.restored"), () => api.restoreFile(file.id))}>{t("recycle.restore")}</button>
                    <button className="button button--small button--danger" type="button" aria-label={t("recycle.deleteForeverAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => {
                      if (window.confirm(t("file.permanentConfirm", { name: file.displayName }))) {
                        void runAction(file.id, t("file.permanentDeleted"), () => api.permanentlyDeleteFile(file.id));
                      }
                    }}>{t("recycle.deleteForever")}</button>
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
            setNotice(moveRequest.kind === "folder" ? t("move.folderMoved") : t("move.fileMoved"));
            refresh();
            setMoveRequest(null);
          }}
        />
      )}
    </>
  );
}

function uploadPhaseKey(phase: UploadPhase) {
  switch (phase) {
    case "queued": return "phase.queued" as const;
    case "checksum": return "phase.checksum" as const;
    case "reserving": return "phase.reserving" as const;
    case "uploading": return "phase.uploading" as const;
    case "verifying": return "phase.verifying" as const;
    case "complete": return "phase.complete" as const;
    case "error": return "phase.error" as const;
    case "cancelled": return "phase.cancelled" as const;
  }
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
  const { language, t } = useLanguage();
  return (
    <div className="entry-table" role="table" aria-label={t("table.aria")}>
      <div className="entry-row entry-row--head" role="row">
        <span role="columnheader">{t("table.name")}</span><span role="columnheader">{t("table.size")}</span><span role="columnheader">{t("table.updated")}</span><span role="columnheader">{t("table.actions")}</span>
      </div>
      {folders.map((folder) => (
        <div className="entry-row" role="row" key={folder.id}>
          <div className="entry-name" role="cell">
            <span className="file-badge file-badge--folder" aria-hidden="true">DIR</span>
            <button className="entry-link" type="button" onClick={() => onEnterFolder(folder)}>{folder.name}</button>
          </div>
          <span role="cell">—</span>
          <span role="cell">{formatDate(folder.updatedAt, language)}</span>
          <div className="entry-actions" role="cell">
            <button type="button" aria-label={t("table.renameFolderAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => onRenameFolder(folder)}>{t("table.rename")}</button>
            <button type="button" aria-label={t("table.moveFolderAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => onMoveFolder(folder)}>{t("table.move")}</button>
            <button className="danger-link" type="button" aria-label={t("table.recycleFolderAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => onDeleteFolder(folder)}>{t("table.recycle")}</button>
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
          <span role="cell">{formatDate(file.updatedAt, language)}</span>
          <div className="entry-actions" role="cell">
            {isPreviewable(file) && <button type="button" aria-label={t("table.previewAria", { name: file.displayName })} disabled={busyId === `preview-${file.id}`} onClick={() => onPreview(file)}>{t("table.preview")}</button>}
            <button type="button" aria-label={t("table.downloadAria", { name: file.displayName })} disabled={busyId === `download-${file.id}`} onClick={() => onDownload(file)}>{t("table.download")}</button>
            <button type="button" aria-label={t("table.renameFileAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => onRenameFile(file)}>{t("table.rename")}</button>
            <button type="button" aria-label={t("table.moveFileAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => onMoveFile(file)}>{t("table.move")}</button>
            <button className="danger-link" type="button" aria-label={t("table.recycleFileAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => onDeleteFile(file)}>{t("table.recycle")}</button>
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
  const { t } = useLanguage();
  const dialogRef = useModalDialog(onClose, false, preview.returnFocus);

  return (
      <dialog ref={dialogRef} className="preview-modal" aria-labelledby="preview-title">
        <header>
          <div><p className="eyebrow">{t("preview.eyebrow")}</p><h2 id="preview-title">{preview.file.displayName}</h2></div>
          <button className="button button--quiet" type="button" onClick={onClose} aria-label={t("preview.closeAria")}>{t("preview.close")}</button>
        </header>
        <div className="preview-content">
          {preview.file.mediaType.startsWith("image/") ? (
            <img src={preview.url} alt={t("preview.imageAlt", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
          ) : (
            <iframe src={preview.url} title={t("preview.frameTitle", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
          )}
        </div>
        <footer>
          <span>{t("preview.expires")}</span>
          <a className="button" href={preview.url} target="_blank" rel="noreferrer">{t("preview.openTab")}</a>
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
  const { language, t } = useLanguage();
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [moving, setMoving] = useState(false);
  const dialogRef = useModalDialog(onClose, moving, request.returnFocus);
  const destinationId = path.at(-1)?.id ?? null;
  const currentParentId = request.kind === "folder" ? request.item.parentId : request.item.folderId;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.listEntries(destinationId, controller.signal).then(
      (response) => setFolders(response.folders.filter((folder) => request.kind !== "folder" || folder.id !== request.item.id)),
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
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
          <div><p className="eyebrow">{t("move.eyebrow")}</p><h2 id="move-title">{t("move.title", { name: itemName })}</h2></div>
          <button className="button button--quiet" type="button" onClick={onClose} disabled={moving}>{t("preview.close")}</button>
        </header>
        <nav className="breadcrumbs" aria-label={t("move.destinationBreadcrumb")}>
          <ol>
            <li><button type="button" onClick={() => setPath([])} aria-current={path.length === 0 ? "page" : undefined}>{t("nav.library")}</button></li>
            {path.map((folder, index) => (
              <li key={folder.id}>
                <span aria-hidden="true">/</span>
                <button type="button" onClick={() => setPath(path.slice(0, index + 1))} aria-current={index === path.length - 1 ? "page" : undefined}>{folder.name}</button>
              </li>
            ))}
          </ol>
        </nav>
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        <div className="destination-list" aria-busy={loading}>
          {loading ? <LoadingRows /> : folders.length === 0 ? (
            <p className="muted">{t("move.noSubfolders")}</p>
          ) : folders.map((folder) => (
            <button className="destination-folder" type="button" key={folder.id} onClick={() => setPath((current) => [...current, folder])}>
              <span className="file-badge file-badge--folder" aria-hidden="true">DIR</span>
              <span>{folder.name}</span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
        <footer>
          <span>{t("move.destination", { name: path.at(-1)?.name ?? t("nav.library") })}</span>
          <button
            className="button button--primary"
            type="button"
            disabled={moving || loading || destinationId === currentParentId}
            onClick={() => {
              setMoving(true);
              setError(null);
              void onMove(destinationId).catch((caught: unknown) => {
                setError(caught);
              }).finally(() => setMoving(false));
            }}
          >
            {moving ? t("move.moving") : t("move.submit")}
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
  const { t } = useLanguage();
  return <div className="loading-rows" role="status"><span /><span /><span /><span className="visually-hidden">{t("shared.loadingItems")}</span></div>;
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

export function formatBytes(bytes: number): string {
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
