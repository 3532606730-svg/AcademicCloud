import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  ApiClient,
  ApiError,
  type AcademicCloudApi,
  type Account,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
  type FavoritesResponse,
  type RecycleResponse,
} from "./api.ts";
import { uploadDirectly, type UploadProgressMetrics } from "./direct-upload.ts";
import { describeError, formatCount, formatDate } from "./i18n.ts";
import { LanguageProvider, LanguageSwitch, useLanguage } from "./i18n-react.tsx";
import {
  FileIcon,
  FolderIcon,
  ImageIcon,
  LibraryIcon,
  MoreIcon,
  PdfIcon,
  PendingIcon,
  RecycleIcon,
  StarIcon,
  TextIcon,
  UploadIcon,
} from "./icons.tsx";
import { calculateFileMd5 } from "./md5.ts";
import { isSameRecoveredFile } from "./recovery-identity.ts";
import { displayFileBytes, formatSpeed, UploadProgressTracker } from "./upload-metrics.ts";

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

type DriveViewName = "library" | "pending" | "recycle" | "favorites";
type UploadPhase = "queued" | "checksum" | "reserving" | "uploading" | "verifying" | "complete" | "error" | "cancelled";

const ACTIVE_UPLOAD_PHASES: ReadonlySet<UploadPhase> = new Set(["checksum", "reserving", "uploading", "verifying"]);
const MAX_CONCURRENT_UPLOADS = 2;
const UPLOAD_METRICS_UPDATE_INTERVAL_MS = 500;

interface UploadJob {
  id: string;
  file: File;
  existing: FileEntry | null;
  fileId: string | null;
  /** Immutable destination folder pinned at enqueue time. Later navigation
   *  must never move a queued upload; renewal jobs keep the folder identity
   *  already reserved server-side. */
  targetFolderId: string | null;
  /** "upload" = fresh upload; "retry" = recovery workflow for a reserved id. */
  mode: "upload" | "retry";
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

interface DropOverlayState {
  count: number | null;
}

const EMPTY_ENTRIES: EntriesResponse = { folder: null, folders: [], files: [] };
const EMPTY_RECYCLE: RecycleResponse = { folders: [], files: [] };

// Only genuine external FILE drags participate in the drop workflow. Text,
// link, and internal selection drags must pass through untouched.
function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer !== null && Array.from(dataTransfer.types).includes("Files");
}

function countDirectoryItems(dataTransfer: DataTransfer): number {
  let directories = 0;
  for (const item of Array.from(dataTransfer.items ?? [])) {
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry?.isDirectory) directories += 1;
  }
  return directories;
}

// Directory entries are NEVER traversed: directory items are skipped and
// reported; only regular files flow into the existing upload queue.
function regularFilesFrom(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
      if (entry && !entry.isFile) continue;
      const file = item.getAsFile?.();
      if (file) files.push(file);
    }
  } else {
    files.push(...Array.from(dataTransfer.files ?? []));
  }
  return files;
}

// During dragenter/dragover the browser's protected mode keeps
// DataTransfer.files empty until drop; only the item list may be enumerated.
// The overlay count therefore derives from file-kind items WITHOUT reading
// file contents. When no reliable count exists (no enumerable items, or no
// regular file among them) the count is omitted instead of lying "0 files".
function countFileDragItems(dataTransfer: DataTransfer): number | null {
  const items = dataTransfer.items;
  if (!items || items.length === 0) return null;
  let count = 0;
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry && !entry.isFile) continue;
    count += 1;
  }
  return count > 0 ? count : null;
}

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
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [dropOverlay, setDropOverlay] = useState<DropOverlayState | null>(null);
  const [favorites, setFavorites] = useState<FavoritesResponse | null>(null);
  const [favoriteFileIds, setFavoriteFileIds] = useState<ReadonlySet<string>>(new Set());
  const [favoriteFolderIds, setFavoriteFolderIds] = useState<ReadonlySet<string>>(new Set());
  const dragDepthRef = useRef(0);
  const newFolderTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const currentFolderId = path.at(-1)?.id ?? null;

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  // Server-backed favorites: the API response is the single source of truth
  // (never localStorage); a refetch on every revision reconciles the UI.
  useEffect(() => {
    const controller = new AbortController();
    api.listFavorites(controller.signal).then(
      (response) => {
        setFavorites(response);
        setFavoriteFileIds(new Set(response.files.map((file) => file.id)));
        setFavoriteFolderIds(new Set(response.folders.map((folder) => folder.id)));
      },
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught);
        }
      },
    );
    return () => controller.abort();
  }, [api, revision]);

  // Global external-file-drop protection: the Library workspace handles file
  // drops itself (overlay + pinned upload); anywhere else in the app a real
  // external file drop must NOT trigger browser file navigation. Text/link/
  // internal-selection drags are never intercepted.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      if (workspaceRef.current?.contains(event.target as Node)) return; // workspace handles it
      event.preventDefault();
      setNotice(t("drop.outsideWorkspace"));
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [t]);

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

  // Shared XHR-metrics wiring for both fresh uploads and retry re-uploads:
  // raw fraction/speed/ETA come from the actual multipart XHR transfer, and
  // the displayed file bytes map the network fraction onto file.size (capped
  // so the UI never exceeds 100% of the selected file).
  function attachUploadMetrics(jobId: string, fileSize: number) {
    const tracker = new UploadProgressTracker();
    const lastMetricUpdate = { at: 0 };
    return {
      onProgress: (fraction: number) => patchJob(jobId, { progress: 0.15 + fraction * 0.75 }),
      onMetrics: (metrics: UploadProgressMetrics) => {
        const now = Date.now();
        const snapshot = tracker.record(metrics.loaded, metrics.total, now);
        if (now - lastMetricUpdate.at >= UPLOAD_METRICS_UPDATE_INTERVAL_MS || snapshot.fraction >= 1) {
          lastMetricUpdate.at = now;
          patchJob(jobId, {
            progress: 0.15 + snapshot.fraction * 0.75,
            bytesUploaded: displayFileBytes(fileSize, snapshot.fraction),
            speedBytesPerSecond: snapshot.speedBytesPerSecond,
            etaSeconds: snapshot.etaSeconds,
          });
        }
      },
    };
  }

  async function runUploadWorkflow(job: UploadJob) {
    const controller = new AbortController();
    patchJob(job.id, { controller });

    try {
      if (job.mode === "retry" && job.fileId) {
        await runRetryWorkflow(job, controller);
        return;
      }

      const file = job.file;
      const existing = job.existing;
      patchJob(job.id, { phase: "checksum", progress: 0, speedBytesPerSecond: null, etaSeconds: null });
      const checksum = await checksumFile(file, {
        signal: controller.signal,
        onProgress: (fraction) => patchJob(job.id, { progress: fraction * 0.15 }),
      });
      const mediaType = file.type || "application/octet-stream";

      if (existing && !isSameRecoveredFile(existing, file.name, file.size, checksum)) {
        throw new Error(t("upload.sameFileMismatch"));
      }

      patchJob(job.id, { phase: "reserving", progress: 0.15 });
      const reserved = existing
        ? { file: existing, upload: await api.renewUpload(existing.id) }
        : await api.createUpload({
            // The destination is the folder pinned at enqueue time: later
            // navigation must never move queued uploads.
            folderId: job.targetFolderId,
            displayName: file.name,
            mediaType,
            sizeBytes: file.size,
            checksum: { algorithm: "md5", value: checksum },
          });
      patchJob(job.id, { fileId: reserved.file.id, phase: "uploading", totalBytes: file.size });
      await directUpload(reserved.upload, file, {
        signal: controller.signal,
        ...attachUploadMetrics(job.id, file.size),
      });
      patchJob(job.id, { phase: "verifying", uploaded: true, progress: 0.92, speedBytesPerSecond: null, etaSeconds: null });
      await api.completeUpload(reserved.file.id);
      patchJob(job.id, { phase: "complete", progress: 1 });
      setNotice(t("upload.uploaded", { name: file.name }));
      refresh();
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        patchJob(job.id, { phase: "cancelled" });
      } else {
        patchJob(job.id, { phase: "error", error: describeError(caught, language) });
      }
    }
  }

  async function runRetryWorkflow(job: UploadJob, controller: AbortController) {
    const fileId = job.fileId!;
    try {
      // Scheduler invariant: a selected job claims an ACTIVE phase BEFORE any
      // async workflow I/O can remain pending. Without this, an uploaded=true
      // retry would still read as "queued" while completeUpload is in flight
      // and the pump could select the same job again.
      patchJob(job.id, { phase: "verifying", progress: Math.max(job.progress, 0.92) });
      if (!job.uploaded) {
        // Verify-first: the stored copy may already be complete.
        try {
          await api.completeUpload(fileId);
          patchJob(job.id, { phase: "complete", uploaded: true, progress: 1 });
          setNotice(t("upload.uploaded", { name: job.file.name }));
          refresh();
          return;
        } catch (caught: unknown) {
          if (!(caught instanceof ApiError && caught.code === "upload_incomplete")) throw caught;
        }
        const authorization = await api.renewUpload(fileId);
        patchJob(job.id, { phase: "uploading", progress: 0.15, totalBytes: job.file.size });
        await directUpload(authorization, job.file, {
          signal: controller.signal,
          ...attachUploadMetrics(job.id, job.file.size),
        });
        patchJob(job.id, { uploaded: true, phase: "verifying", progress: 0.92, speedBytesPerSecond: null, etaSeconds: null });
      }
      await api.completeUpload(fileId);
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

  const startJob = useCallback(
    (job: UploadJob) => {
      if (job.phase !== "queued") return;
      void runUploadWorkflow(job);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, checksumFile, directUpload, language, refresh, t],
  );

  // Bounded concurrency pump: at most MAX_CONCURRENT_UPLOADS workflows run at
  // once — fresh uploads AND retries alike; queued items wait (checksum
  // computation included) until a slot opens.
  useEffect(() => {
    const active = jobs.filter((job) => ACTIVE_UPLOAD_PHASES.has(job.phase)).length;
    if (active >= MAX_CONCURRENT_UPLOADS) return;
    const next = jobs.find((job) => job.phase === "queued");
    if (next) startJob(next);
  }, [jobs, startJob]);

  function enqueueFile(file: File, existing?: FileEntry, pinnedTargetFolderId?: string | null) {
    if (file.size < 1) {
      setError(new Error(t("upload.emptyFile")));
      return;
    }
    const job: UploadJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      existing: existing ?? null,
      fileId: existing?.id ?? null,
      // Pin the destination NOW. New uploads capture the folder visible at
      // selection time; pending-upload renewals keep the folder identity
      // already reserved server-side; retries re-queue with the original pin.
      targetFolderId: pinnedTargetFolderId !== undefined
        ? pinnedTargetFolderId
        : existing?.folderId ?? currentFolderId,
      mode: "upload",
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

  function retryJob(job: UploadJob) {
    // A retry enters the SAME bounded scheduler as fresh uploads: it waits
    // for a free slot instead of bypassing MAX_CONCURRENT_UPLOADS. The job's
    // pinned target folder and reserved file identity are preserved.
    patchJob(job.id, {
      phase: "queued",
      mode: job.fileId ? "retry" : "upload",
      error: null,
      progress: 0,
      speedBytesPerSecond: null,
      etaSeconds: null,
      controller: new AbortController(),
    });
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

  // A favorite folder opens the REAL folder in the Library — never a virtual
  // copy — using the server-provided ancestor chain.
  function enterFavoriteFolder(folder: FolderEntry) {
    const entry = favorites?.folders.find((candidate) => candidate.id === folder.id);
    setPath(entry ? [...entry.ancestors, folder] : [folder]);
    setView("library");
    setError(null);
  }

  async function toggleFileFavorite(file: FileEntry) {
    const active = favoriteFileIds.has(file.id);
    const next = new Set(favoriteFileIds);
    if (active) next.delete(file.id);
    else next.add(file.id);
    setFavoriteFileIds(next);
    try {
      await api.setFileFavorite(file.id, !active);
    } catch (caught: unknown) {
      setError(caught);
    }
    // Refetch reconciles server truth (also covers failures that flipped
    // back optimistically).
    refresh();
  }

  async function toggleFolderFavorite(folder: FolderEntry) {
    const active = favoriteFolderIds.has(folder.id);
    const next = new Set(favoriteFolderIds);
    if (active) next.delete(folder.id);
    else next.add(folder.id);
    setFavoriteFolderIds(next);
    try {
      await api.setFolderFavorite(folder.id, !active);
    } catch (caught: unknown) {
      setError(caught);
    }
    refresh();
  }

  function goToCrumb(index: number) {
    setPath(index < 0 ? [] : path.slice(0, index + 1));
  }

  function openNewFolderDialog() {
    newFolderTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setError(null);
    setNewFolderOpen(true);
  }

  async function createFolder(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await runAction("new-folder", t("folder.created", { name: trimmed }), async () => {
      await api.createFolder(trimmed, currentFolderId);
      setNewFolderOpen(false);
    });
  }

  function renameFolder(folder: FolderEntry) {
    const name = window.prompt(t("folder.promptRename"), folder.name)?.trim();
    if (name && name !== folder.name) {
      void runAction(folder.id, t("folder.renamed"), () => api.updateFolder(folder.id, { name }));
    }
  }

  function moveFolder(folder: FolderEntry, returnFocus?: HTMLElement | null) {
    setMoveRequest({
      kind: "folder",
      item: folder,
      returnFocus: returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
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

  function moveFile(file: FileEntry, returnFocus?: HTMLElement | null) {
    setMoveRequest({
      kind: "file",
      item: file,
      returnFocus: returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
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

  async function openPreview(file: FileEntry, returnFocus?: HTMLElement | null) {
    // The originating row-action trigger is passed explicitly: the removed
    // portal menuitem must never be captured as the restore target.
    const fallbackFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusyId(`preview-${file.id}`);
    setError(null);
    try {
      const authorization = await api.createDownload(file.id, "inline");
      setPreview({
        file,
        url: authorization.url,
        returnFocus: returnFocus ?? fallbackFocus,
      });
    } catch (caught: unknown) {
      // preview_unavailable renders the localized fail-safe message; the
      // Preview button never silently triggers a download.
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  // Drag-and-drop (library view only). A depth counter prevents child-element
  // dragenter/dragleave pairs from flashing the overlay. Non-file drags are
  // never intercepted.
  function onWorkspaceDragEnter(event: React.DragEvent<HTMLElement>) {
    if (!hasFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) {
      setDropOverlay({ count: countFileDragItems(event.dataTransfer) });
    }
  }

  function onWorkspaceDragOver(event: React.DragEvent<HTMLElement>) {
    if (!hasFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onWorkspaceDragLeave(event: React.DragEvent<HTMLElement>) {
    if (!hasFileDrag(event.dataTransfer)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDropOverlay(null);
  }

  function onWorkspaceDrop(event: React.DragEvent<HTMLElement>) {
    if (!hasFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDropOverlay(null);
    const dataTransfer = event.dataTransfer;
    // Snapshot the destination EXACTLY once: later navigation must never
    // redirect these uploads.
    const pinnedFolderId = currentFolderId;
    const files = regularFilesFrom(dataTransfer);
    const directoryCount = countDirectoryItems(dataTransfer);
    const validFiles = files.filter((file) => file.size >= 1);
    if (validFiles.length > 0) {
      for (const file of validFiles) enqueueFile(file, undefined, pinnedFolderId);
      if (validFiles.length > 1) {
        setNotice(t("upload.enqueuedCount", { count: validFiles.length }));
      }
    } else if (files.length > 0) {
      setError(new Error(t("upload.emptyFile")));
    }
    if (directoryCount > 0) {
      setNotice(t("drop.directorySkipped", { count: directoryCount }));
    } else if (validFiles.length === 0 && files.length === 0) {
      setNotice(t("drop.onlyDirectories"));
    }
  }

  const activeJobs = jobs.filter((job) => job.phase !== "complete");
  const isLibraryEmpty = entries.folders.length === 0 && entries.files.length === 0;
  const workspaceTitle = view === "library"
    ? path.at(-1)?.name ?? t("nav.library")
    : view === "pending"
      ? t("nav.pending")
      : view === "recycle"
        ? t("nav.recycle")
        : t("nav.favorites");

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
            <LibraryIcon size={18} /> {t("nav.library")}
          </button>
          <button className={view === "pending" ? "nav-item is-active" : "nav-item"} aria-current={view === "pending" ? "page" : undefined} onClick={() => goToView("pending")}>
            <PendingIcon size={18} /> {t("nav.pending")}
          </button>
          <button className={view === "recycle" ? "nav-item is-active" : "nav-item"} aria-current={view === "recycle" ? "page" : undefined} onClick={() => goToView("recycle")}>
            <RecycleIcon size={18} /> {t("nav.recycle")}
          </button>
          <button className={view === "favorites" ? "nav-item is-active" : "nav-item"} aria-current={view === "favorites" ? "page" : undefined} onClick={() => goToView("favorites")}>
            <StarIcon size={18} /> {t("nav.favorites")}
          </button>
        </nav>
      </aside>

      <main
        id="main-content"
        className="workspace"
        tabIndex={-1}
        ref={workspaceRef}
        onDragEnter={view === "library" ? onWorkspaceDragEnter : undefined}
        onDragOver={view === "library" ? onWorkspaceDragOver : undefined}
        onDragLeave={view === "library" ? onWorkspaceDragLeave : undefined}
        onDrop={view === "library" ? onWorkspaceDrop : undefined}
      >
        <header className="workspace-head">
          <div className="workspace-title">
            {view === "library" && path.length > 0 && (
              <nav className="breadcrumbs" aria-label={t("breadcrumb.aria")}>
                <ol>
                  <li><button type="button" onClick={() => goToCrumb(-1)}>{t("nav.library")}</button></li>
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
            <h1>{workspaceTitle}</h1>
            {view === "library" && !loading && (
              <p className="workspace-summary">
                {t("workspace.itemSummary", {
                  files: formatCount(language, entries.files.length),
                  folders: formatCount(language, entries.folders.length),
                })}
              </p>
            )}
            {view === "favorites" && favorites !== null && (
              <p className="workspace-summary">
                {t("workspace.itemSummary", {
                  files: formatCount(language, favorites.files.length),
                  folders: formatCount(language, favorites.folders.length),
                })}
              </p>
            )}
          </div>
          {view === "library" && (
            <div className="command-bar">
              <button className="button button--secondary" type="button" onClick={openNewFolderDialog}>
                {t("workspace.newFolder")}
              </button>
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
            </div>
          )}
        </header>

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
                <span className="upload-percent">{Math.round(job.progress * 100)}%</span>
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
          <section aria-labelledby="contents-title">
            <h2 id="contents-title" className="visually-hidden">{t("folder.contentsTitle")}</h2>
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
                onPreview={(file, trigger) => void openPreview(file, trigger)}
                onDownload={(file) => void downloadFile(file)}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onDeleteFile={deleteFile}
                starFileIds={favoriteFileIds}
                starFolderIds={favoriteFolderIds}
                onToggleFileFavorite={(file) => void toggleFileFavorite(file)}
                onToggleFolderFavorite={(folder) => void toggleFolderFavorite(folder)}
              />
            )}
          </section>
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

        {view === "favorites" && (
          <section aria-labelledby="favorites-title">
            <h2 id="favorites-title" className="visually-hidden">{t("nav.favorites")}</h2>
            {favorites === null ? <LoadingRows /> : favorites.files.length + favorites.folders.length === 0 ? (
              <EmptyState title={t("favorites.emptyTitle")} text={t("favorites.emptyText")} />
            ) : (
              <EntryTable
                folders={favorites.folders}
                files={favorites.files}
                busyId={busyId}
                onEnterFolder={enterFavoriteFolder}
                onRenameFolder={renameFolder}
                onMoveFolder={moveFolder}
                onDeleteFolder={deleteFolder}
                onPreview={(file, trigger) => void openPreview(file, trigger)}
                onDownload={(file) => void downloadFile(file)}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onDeleteFile={deleteFile}
                starFileIds={favoriteFileIds}
                starFolderIds={favoriteFolderIds}
                onToggleFileFavorite={(file) => void toggleFileFavorite(file)}
                onToggleFolderFavorite={(folder) => void toggleFolderFavorite(folder)}
              />
            )}
          </section>
        )}

        {view === "recycle" && (
          <section aria-labelledby="recycle-title">            <div className="section-heading"><h2 id="recycle-title">{t("recycle.title")}</h2>{!loading && <span>{t("folder.items", { count: formatCount(language, recycle.folders.length + recycle.files.length) })}</span>}</div>
            <p className="section-copy">{t("recycle.copy")}</p>
            {loading ? <LoadingRows /> : recycle.folders.length + recycle.files.length === 0 ? (
              <EmptyState title={t("recycle.emptyTitle")} text={t("recycle.emptyText")} />
            ) : (
              <div className="card-list">
                {recycle.folders.map((folder) => (
                  <article className="recycle-card" key={folder.id}>
                    <FolderBadge />
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

        {dropOverlay !== null && view === "library" && (
          <div className="drop-overlay" role="status" aria-label={t("drop.aria")}>
            <div className="drop-panel">
              <UploadIcon size={30} className="drop-icon" />
              <strong>{t("drop.title", { folder: path.at(-1)?.name ?? t("nav.library") })}</strong>
              {dropOverlay.count !== null && <span>{t("drop.count", { count: dropOverlay.count })}</span>}
            </div>
          </div>
        )}
      </main>

    </div>

      {newFolderOpen && (
        <NewFolderDialog
          onClose={() => setNewFolderOpen(false)}
          onCreate={(name) => void createFolder(name)}
          busy={busyId === "new-folder"}
          returnFocus={newFolderTriggerRef.current}
        />
      )}
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

function NewFolderDialog({
  onClose,
  onCreate,
  busy,
  returnFocus,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
  busy: boolean;
  returnFocus?: HTMLElement | null;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const dialogRef = useModalDialog(onClose, busy, returnFocus);

  return (
    <dialog ref={dialogRef} className="new-folder-modal" aria-labelledby="new-folder-title">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || busy) return;
          onCreate(trimmed);
        }}
      >
        <header>
          <h2 id="new-folder-title">{t("folder.dialogTitle")}</h2>
          <button className="button button--quiet" type="button" onClick={onClose} disabled={busy} aria-label={t("folder.closeAria")}>{t("preview.close")}</button>
        </header>
        <div className="new-folder-body">
          <label htmlFor="new-folder-name">{t("folder.newLabel")}</label>
          <input
            id="new-folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("folder.newPlaceholder")}
            maxLength={255}
            autoFocus
          />
        </div>
        <footer>
          <button className="button button--quiet" type="button" onClick={onClose} disabled={busy}>{t("folder.cancel")}</button>
          <button className="button button--primary" type="submit" disabled={busy || !name.trim()}>{t("folder.create")}</button>
        </footer>
      </form>
    </dialog>
  );
}

interface RowMenuItem {
  key: string;
  label?: string;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: (trigger: HTMLElement) => void;
}

function RowMenu({
  triggerLabel,
  menuLabel,
  items,
}: {
  triggerLabel: string;
  menuLabel: string;
  items: RowMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  // Production CSP is style-src 'self' (no unsafe-inline): the menu must
  // NEVER be positioned through runtime inline `style` attributes. Positioning
  // is pure CSS relative to the trigger; a flip CLASS handles viewport-bottom
  // menus instead of computed pixel coordinates.
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const trigger = triggerRef.current;
    const rect = trigger?.getBoundingClientRect();
    const regularItems = items.filter((item) => !item.separator);
    const estimatedHeight = regularItems.length * 36 + (items.length - regularItems.length) * 9 + 12;
    setOpensUp(rect !== undefined && rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    // Viewport/layout movement invalidates the CSS-relative snapshot: the
    // simplest robust behavior is to close the menu.
    const closeOnMove = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", closeOnMove);
    window.addEventListener("scroll", closeOnMove, true);
    document.addEventListener("scroll", closeOnMove, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", closeOnMove);
      window.removeEventListener("scroll", closeOnMove, true);
      document.removeEventListener("scroll", closeOnMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }

  return (
    <div className="row-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => (open ? close(true) : openMenu())}
      >
        <MoreIcon size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={opensUp ? "row-menu row-menu--up" : "row-menu"}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => item.separator ? (
            <div key={item.key} className="row-menu-separator" role="separator" />
          ) : (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={item.danger ? "row-menu-item row-menu-item--danger" : "row-menu-item"}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.(triggerRef.current ?? document.body);
                close(true);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  starFileIds,
  starFolderIds,
  onToggleFileFavorite,
  onToggleFolderFavorite,
}: {
  folders: FolderEntry[];
  files: FileEntry[];
  busyId: string | null;
  onEnterFolder: (folder: FolderEntry) => void;
  onRenameFolder: (folder: FolderEntry) => void;
  onMoveFolder: (folder: FolderEntry, trigger?: HTMLElement) => void;
  onDeleteFolder: (folder: FolderEntry) => void;
  onPreview: (file: FileEntry, trigger?: HTMLElement) => void;
  onDownload: (file: FileEntry) => void;
  onRenameFile: (file: FileEntry) => void;
  onMoveFile: (file: FileEntry, trigger?: HTMLElement) => void;
  onDeleteFile: (file: FileEntry) => void;
  starFileIds?: ReadonlySet<string>;
  starFolderIds?: ReadonlySet<string>;
  onToggleFileFavorite?: (file: FileEntry) => void;
  onToggleFolderFavorite?: (folder: FolderEntry) => void;
}) {
  const { language, t } = useLanguage();
  return (
    <div className="entry-table" role="table" aria-label={t("table.aria")}>
      <div className="entry-row entry-row--head" role="row">
        <span role="columnheader">{t("table.name")}</span>
        <span role="columnheader">{t("table.size")}</span>
        <span role="columnheader">{t("table.updated")}</span>
        <span role="columnheader" className="entry-actions-head"><span className="visually-hidden">{t("table.actions")}</span></span>
      </div>
      {folders.map((folder) => (
        <div className="entry-row" role="row" key={folder.id}>
          <div className="entry-name" role="cell">
            <FolderIcon size={20} className="file-badge file-badge--folder" />
            <button className="entry-link" type="button" onClick={() => onEnterFolder(folder)}>{folder.name}</button>
          </div>
          <span role="cell" className="entry-meta">—</span>
          <span role="cell" className="entry-meta">{formatDate(folder.updatedAt, language)}</span>
          <div className="entry-actions" role="cell">
            {onToggleFolderFavorite && (
              <StarButton
                active={starFolderIds?.has(folder.id) ?? false}
                name={folder.name}
                onToggle={() => onToggleFolderFavorite(folder)}
              />
            )}
            <RowMenu
              triggerLabel={t("menu.openAria", { name: folder.name })}
              menuLabel={t("menu.aria", { name: folder.name })}
              items={[
                { key: "rename", label: t("menu.rename"), disabled: busyId === folder.id, onSelect: () => onRenameFolder(folder) },
                { key: "move", label: t("menu.move"), disabled: busyId === folder.id, onSelect: (trigger) => onMoveFolder(folder, trigger) },
                { key: "separator", separator: true },
                { key: "trash", label: t("menu.trash"), danger: true, disabled: busyId === folder.id, onSelect: () => onDeleteFolder(folder) },
              ]}
            />
          </div>
        </div>
      ))}
      {files.map((file) => (
        <div className="entry-row" role="row" key={file.id}>
          <div className="entry-name" role="cell">
            <FileBadge file={file} />
            <strong className="entry-filename" title={file.displayName}>{file.displayName}</strong>
          </div>
          <span role="cell" className="entry-meta">{formatBytes(file.sizeBytes)}</span>
          <span role="cell" className="entry-meta">{formatDate(file.updatedAt, language)}</span>
          <div className="entry-actions" role="cell">
            {onToggleFileFavorite && (
              <StarButton
                active={starFileIds?.has(file.id) ?? false}
                name={file.displayName}
                onToggle={() => onToggleFileFavorite(file)}
              />
            )}
            <RowMenu
              triggerLabel={t("menu.openAria", { name: file.displayName })}
              menuLabel={t("menu.aria", { name: file.displayName })}
              items={[
                ...(isPreviewable(file) ? [{ key: "preview", label: t("menu.preview"), disabled: busyId === `preview-${file.id}`, onSelect: (trigger: HTMLElement) => onPreview(file, trigger) }] : []),
                { key: "download", label: t("menu.download"), disabled: busyId === `download-${file.id}`, onSelect: () => onDownload(file) },
                { key: "separator-1", separator: true },
                { key: "rename", label: t("menu.rename"), disabled: busyId === file.id, onSelect: () => onRenameFile(file) },
                { key: "move", label: t("menu.move"), disabled: busyId === file.id, onSelect: (trigger) => onMoveFile(file, trigger) },
                { key: "separator-2", separator: true },
                { key: "trash", label: t("menu.trash"), danger: true, disabled: busyId === file.id, onSelect: () => onDeleteFile(file) },
              ]}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StarButton({ active, name, onToggle }: { active: boolean; name: string; onToggle: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className={active ? "star-button is-active" : "star-button"}
      aria-pressed={active}
      aria-label={active ? t("fav.removeAria", { name }) : t("fav.addAria", { name })}
      onClick={onToggle}
    >
      <StarIcon size={16} />
    </button>
  );
}

function FileBadge({ file }: { file: FileEntry }) {
  if (file.mediaType === "application/pdf") return <PdfIcon size={19} className="file-badge file-badge--pdf" />;
  if (file.mediaType.startsWith("image/")) return <ImageIcon size={19} className="file-badge file-badge--img" />;
  if (file.mediaType.startsWith("text/")) return <TextIcon size={19} className="file-badge file-badge--txt" />;
  return <FileIcon size={19} className="file-badge file-badge--file" />;
}

function FolderBadge() {
  return <FolderIcon size={19} className="file-badge file-badge--folder" />;
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
              <FolderIcon size={18} className="file-badge file-badge--folder" />
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
      (dialog.querySelector<HTMLElement>("input:not([disabled]), [autofocus]") ??
        dialog.querySelector<HTMLElement>("button:not([disabled]), a[href]"))?.focus();
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
