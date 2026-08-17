import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  ApiClient,
  ApiError,
  type AcademicCloudApi,
  type Account,
  type BulkAction,
  type BulkItem,
  type Invitation,
  type ManagedAccount,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
  type FavoritesResponse,
  type RecycleResponse,
  type ScholarlyRecord,
  type ScholarlyRecordSummary,
} from "./api.ts";
import { uploadDirectly, type UploadProgressMetrics } from "./direct-upload.ts";
import { AnnouncementAdministrationDialog, AnnouncementFeed } from "./announcements.tsx";
import { AuditDialog } from "./audit.tsx";
import { describeError, formatCount, formatDate } from "./i18n.ts";
import { LanguageProvider, LanguageSwitch, useLanguage, type Translator } from "./i18n-react.tsx";
import {
  ArrowLeftIcon,
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

function takeInvitationTokenFromLocation(): string | null {
  const match = /^#\/invite\/([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
  if (!match) return null;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return match[1]!;
}

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
  const [invitationToken, setInvitationToken] = useState<string | null>(takeInvitationTokenFromLocation);
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
    if (invitationToken) {
      return (
        <RegistrationView
          api={api}
          inviteToken={invitationToken}
          onCancel={() => setInvitationToken(null)}
          onRegistered={() => setInvitationToken(null)}
        />
      );
    }
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

function RegistrationView({
  api,
  inviteToken,
  onCancel,
  onRegistered,
}: {
  api: AcademicCloudApi;
  inviteToken: string;
  onCancel: () => void;
  onRegistered: () => void;
}) {
  const { language, t } = useLanguage();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError(new ApiError(400, "password_mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await api.registerMember(inviteToken, loginName, password);
      setPassword("");
      setConfirmation("");
      onRegistered();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="registration-title">
        <h1 className="brand" id="registration-title"><span>AC</span> {t("registration.title")}</h1>
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="registration-name">{t("login.nameLabel")}</label>
          <input id="registration-name" autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} required autoFocus />
          <label htmlFor="registration-password">{t("login.passwordLabel")}</label>
          <input id="registration-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
          <label htmlFor="registration-confirm">{t("registration.confirmPassword")}</label>
          <input id="registration-confirm" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          <button className="button button--primary button--wide" type="submit" disabled={submitting}>{submitting ? t("registration.submitting") : t("registration.submit")}</button>
          <button className="button button--quiet button--wide" type="button" onClick={onCancel}>{t("registration.cancel")}</button>
        </form>
        <div className="login-language"><LanguageSwitch labelled /></div>
      </section>
    </main>
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
      <section className="login-card" aria-labelledby="brand-title">
        <h1 className="brand" id="brand-title"><span>AC</span> AcademicCloud</h1>
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
  | { kind: "file"; item: FileEntry; returnFocus: HTMLElement | null }
  | { kind: "bulk"; items: SelectableEntry[]; returnFocus: HTMLElement | null };

type SelectableEntry =
  | { kind: "folder"; item: FolderEntry }
  | { kind: "file"; item: FileEntry };

function selectionKey(kind: SelectableEntry["kind"], id: string): string {
  return `${kind}:${id}`;
}

function toBulkItem(entry: SelectableEntry): BulkItem {
  return { kind: entry.kind, id: entry.item.id, version: entry.item.version };
}

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
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [dropOverlay, setDropOverlay] = useState<DropOverlayState | null>(null);
  const [favorites, setFavorites] = useState<FavoritesResponse | null>(null);
  const [favoritesError, setFavoritesError] = useState<unknown>(null);
  const [favoriteFileIds, setFavoriteFileIds] = useState<ReadonlySet<string>>(new Set());
  const [favoriteFolderIds, setFavoriteFolderIds] = useState<ReadonlySet<string>>(new Set());
  const [accountAdministrationOpen, setAccountAdministrationOpen] = useState(false);
  const [announcementAdministrationOpen, setAnnouncementAdministrationOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [announcementRevision, setAnnouncementRevision] = useState(0);
  const dragDepthRef = useRef(0);
  const newFolderTriggerRef = useRef<HTMLButtonElement>(null);
  const recordTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const currentFolderId = path.at(-1)?.id ?? null;

  const visibleSelectableEntries: SelectableEntry[] = view === "library"
    ? [
        ...entries.folders.map((item): SelectableEntry => ({ kind: "folder", item })),
        ...entries.files.map((item): SelectableEntry => ({ kind: "file", item })),
      ]
    : view === "favorites" && favorites !== null
      ? [
          ...favorites.folders.map((item): SelectableEntry => ({ kind: "folder", item })),
          ...favorites.files.map((item): SelectableEntry => ({ kind: "file", item })),
        ]
      : view === "recycle"
        ? [
            ...recycle.folders.map((item): SelectableEntry => ({ kind: "folder", item })),
            ...recycle.files.map((item): SelectableEntry => ({ kind: "file", item })),
          ]
        : [];
  const selectedEntries = visibleSelectableEntries.filter((entry) =>
    selectedKeys.has(selectionKey(entry.kind, entry.item.id)));

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [currentFolderId, revision, view]);

  // Server-backed favorites: the API response is the single source of truth
  // (never localStorage). The lifecycle is VIEW-AWARE so entering Favorites
  // always gives a real opportunity to obtain current data — a previous
  // failure can never strand the Favorites page in permanent loading.
  //  - library:     load/refetch for star state (revision reconciles)
  //  - favorites:   load/refetch as the real Favorites view
  //  - pending/recycle: no Favorites fetch at all
  // Failures live in a dedicated state shown only inside the Favorites view
  // (no cross-view error leaks); aborted requests are silently discarded.
  useEffect(() => {
    if (view !== "library" && view !== "favorites") return;
    const controller = new AbortController();
    setFavoritesError(null);
    api.listFavorites(controller.signal).then(
      (response) => {
        setFavorites(response);
        setFavoriteFileIds(new Set(response.files.map((file) => file.id)));
        setFavoriteFolderIds(new Set(response.folders.map((folder) => folder.id)));
      },
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setFavoritesError(caught);
        }
      },
    );
    return () => controller.abort();
  }, [api, revision, view]);

  // Global external-file-drop protection: ONLY the Library workspace (in
  // library view) may defer to the workspace upload handler. Every other
  // genuine external file drop anywhere in the app — including the workspace
  // while viewing Favorites/Pending/Recycle — is prevented from browser
  // navigation and never enqueues. Text/link/internal drags are untouched.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      if (view === "library" && workspaceRef.current?.contains(event.target as Node)) return; // workspace uploads
      // Silent: browser navigation is prevented, nothing enqueues, and no
      // descriptive notice renders (zero-copy policy).
      event.preventDefault();
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [view]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Explicit four-way request state machine: the Favorites view owns its
    // listFavorites lifecycle and must NEVER fall through to listRecycle.
    const request: Promise<void> = view === "library"
      ? api.listEntries(currentFolderId, controller.signal).then(setEntries)
      : view === "pending"
        ? api.listPending(currentFolderId, controller.signal).then(setPending)
        : view === "recycle"
          ? api.listRecycle(controller.signal).then(setRecycle)
          : Promise.resolve();

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
        const message = caught instanceof ApiError && caught.code === "name_conflict"
          ? t("upload.nameConflict", { name: job.file.name })
          : describeError(caught, language);
        patchJob(job.id, { phase: "error", error: message });
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

  function passwordChanged() {
    for (const job of jobs) job.controller.abort();
    setPasswordChangeOpen(false);
    onSignedOut();
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

  function toggleSelection(entry: SelectableEntry): void {
    const key = selectionKey(entry.kind, entry.item.id);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (next.size < 100) next.add(key);
      return next;
    });
  }

  async function runBulk(action: BulkAction, destinationFolderId?: string | null): Promise<void> {
    if (selectedEntries.length === 0) return;
    setBusyId("bulk");
    setError(null);
    setNotice("");
    try {
      await api.bulkOperation({
        action,
        items: selectedEntries.map(toBulkItem),
        ...(action === "move" ? { destinationFolderId: destinationFolderId ?? null } : {}),
      });
      setSelectedKeys(new Set());
      setNotice(t("bulk.completed", { count: selectedEntries.length }));
      refresh();
    } catch (caught: unknown) {
      // Every RF-BULK01 action is atomic. Keep the selection so the user can
      // inspect/retry it, and state explicitly that no selected item changed.
      setError(caught);
      setNotice(t("bulk.failedAtomic"));
      throw caught;
    } finally {
      setBusyId(null);
    }
  }

  function goToView(next: DriveViewName) {
    setView(next);
    setSelectedKeys(new Set());
    setError(null);
    setNotice("");
  }

  function enterFolder(folder: FolderEntry) {
    setPath((current) => [...current, folder]);
    setSelectedKeys(new Set());
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
      setNotice(t("drop.notUploaded"));
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
    <div className="app-shell" inert={preview !== null || moveRequest !== null || accountAdministrationOpen || announcementAdministrationOpen || passwordChangeOpen || auditOpen || recordDialogOpen}>
      <a className="skip-link" href="#main-content">{t("nav.skip")}</a>
      <header className="topbar">
        <div className="brand"><span>AC</span> AcademicCloud</div>
        <div className="account-menu">
          <LanguageSwitch />
          <AccountMenu
            accountName={account.loginName}
            owner={account.role === "owner"}
            busy={busyId === "logout"}
            onManageAccounts={() => setAccountAdministrationOpen(true)}
            onManageAnnouncements={() => setAnnouncementAdministrationOpen(true)}
            onManageAudit={() => setAuditOpen(true)}
            onChangePassword={() => setPasswordChangeOpen(true)}
            onSignOut={() => void signOut()}
          />
          <span className="avatar desktop-avatar" aria-hidden="true">{account.loginName.slice(0, 1).toUpperCase()}</span>
          <span className="account-name">{account.loginName}</span>
          {account.role === "owner" && (
            <>
              <button className="button button--quiet account-action-button" type="button" onClick={() => setAccountAdministrationOpen(true)}>
                {t("account.manage")}
              </button>
              <button className="button button--quiet account-action-button" type="button" onClick={() => setAnnouncementAdministrationOpen(true)}>
                {t("announcements.manage")}
              </button>
              <button className="button button--quiet account-action-button" type="button" onClick={() => setAuditOpen(true)}>
                {t("audit.manage")}
              </button>
            </>
          )}
          <button className="button button--quiet account-action-button" type="button" onClick={() => setPasswordChangeOpen(true)}>
            {t("password.change")}
          </button>
          <button className="button button--quiet sign-out-button" type="button" onClick={() => void signOut()} disabled={busyId === "logout"}>
            {t("nav.signOut")}
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label={t("nav.primaryAria")}>
        <nav>
          <button className={view === "library" ? "nav-item is-active" : "nav-item"} aria-current={view === "library" ? "page" : undefined} onClick={() => goToView("library")}>
            <LibraryIcon size={18} /> {t("nav.library")}
          </button>
          <button className={view === "favorites" ? "nav-item is-active" : "nav-item"} aria-current={view === "favorites" ? "page" : undefined} onClick={() => goToView("favorites")}>
            <StarIcon size={18} /> {t("nav.favorites")}
          </button>
          <button className={view === "pending" ? "nav-item is-active" : "nav-item"} aria-current={view === "pending" ? "page" : undefined} onClick={() => goToView("pending")}>
            <PendingIcon size={18} /> {t("nav.pending")}
          </button>
          <button className={view === "recycle" ? "nav-item is-active" : "nav-item"} aria-current={view === "recycle" ? "page" : undefined} onClick={() => goToView("recycle")}>
            <RecycleIcon size={18} /> {t("nav.recycle")}
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
              <button
                className="back-button"
                type="button"
                aria-label={t("nav.backAria", { name: path.at(-2)?.name ?? t("nav.library") })}
                onClick={() => goToCrumb(path.length - 2)}
              >
                <ArrowLeftIcon size={20} />
              </button>
            )}
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
              <button ref={recordTriggerRef} className="button button--secondary" type="button" onClick={() => setRecordDialogOpen(true)}>
                {t("records.open")}
              </button>
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

        {view === "library" && path.length === 0 && (
          <AnnouncementFeed api={api} revision={announcementRevision} />
        )}

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
                      <button className="button button--small" type="button" aria-label={t("upload.verifyRetryAria", { name: job.file.name })} onClick={() => void retryJob(job)}>{t("upload.retry")}</button>
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
            {selectedEntries.length > 0 && (
              <BulkToolbar
                mode="library"
                selectedCount={selectedEntries.length}
                busy={busyId === "bulk"}
                onClear={() => setSelectedKeys(new Set())}
                onMove={(trigger) => setMoveRequest({ kind: "bulk", items: selectedEntries, returnFocus: trigger })}
                onRecycle={() => {
                  if (window.confirm(t("bulk.recycleConfirm", { count: selectedEntries.length }))) {
                    void runBulk("recycle").catch(() => undefined);
                  }
                }}
                onFavoriteAdd={() => void runBulk("favorite_add").catch(() => undefined)}
                onFavoriteRemove={() => void runBulk("favorite_remove").catch(() => undefined)}
              />
            )}
            {loading ? <LoadingRows /> : isLibraryEmpty ? (
              <EmptyState title={t("folder.emptyTitle")} />
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
                selectedKeys={selectedKeys}
                onToggleSelected={toggleSelection}
                selectionDisabled={busyId === "bulk"}
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
            {loading ? <LoadingRows /> : pending.length === 0 ? (
              <EmptyState title={t("pending.emptyTitle")} />
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
            {selectedEntries.length > 0 && (
              <BulkToolbar
                mode="favorites"
                selectedCount={selectedEntries.length}
                busy={busyId === "bulk"}
                onClear={() => setSelectedKeys(new Set())}
                onMove={(trigger) => setMoveRequest({ kind: "bulk", items: selectedEntries, returnFocus: trigger })}
                onRecycle={() => {
                  if (window.confirm(t("bulk.recycleConfirm", { count: selectedEntries.length }))) {
                    void runBulk("recycle").catch(() => undefined);
                  }
                }}
                onFavoriteRemove={() => void runBulk("favorite_remove").catch(() => undefined)}
              />
            )}
            {favoritesError !== null ? (
              <div className="alert alert--error" role="alert">
                {describeError(favoritesError, language)}
                <button type="button" onClick={refresh}>{t("pending.refresh")}</button>
              </div>
            ) : favorites === null ? <LoadingRows /> : favorites.files.length + favorites.folders.length === 0 ? (
              <EmptyState title={t("favorites.emptyTitle")} />
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
                selectedKeys={selectedKeys}
                onToggleSelected={toggleSelection}
                selectionDisabled={busyId === "bulk"}
              />
            )}
          </section>
        )}

        {view === "recycle" && (
          <section aria-labelledby="recycle-title">            <div className="section-heading"><h2 id="recycle-title">{t("recycle.title")}</h2>{!loading && <span>{t("folder.items", { count: formatCount(language, recycle.folders.length + recycle.files.length) })}</span>}</div>
            {selectedEntries.length > 0 && (
              <BulkToolbar
                mode="recycle"
                selectedCount={selectedEntries.length}
                busy={busyId === "bulk"}
                onClear={() => setSelectedKeys(new Set())}
                onRestore={() => void runBulk("restore").catch(() => undefined)}
              />
            )}
            {loading ? <LoadingRows /> : recycle.folders.length + recycle.files.length === 0 ? (
              <EmptyState title={t("recycle.emptyTitle")} />
            ) : (
              <div className="card-list">
                {recycle.folders.map((folder) => (
                  <article className="recycle-card" key={folder.id}>
                    <label className="entry-select-control">
                      <input
                        className="entry-select"
                        type="checkbox"
                        aria-label={t("bulk.selectAria", { name: folder.name })}
                        checked={selectedKeys.has(selectionKey("folder", folder.id))}
                        disabled={busyId === "bulk" || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("folder", folder.id)))}
                        onChange={() => toggleSelection({ kind: "folder", item: folder })}
                      />
                      <span className="entry-select-box" aria-hidden="true" />
                    </label>
                    <FolderBadge />
                    <div className="entry-primary"><strong>{folder.name}</strong><span>{t("recycle.folderDeleted", { date: formatDate(folder.deletedAt, language) })}</span></div>
                    <button className="button button--small" type="button" aria-label={t("recycle.restoreFolderAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => void runAction(folder.id, t("recycle.folderRestored"), () => api.restoreFolder(folder.id))}>{t("recycle.restore")}</button>
                  </article>
                ))}
                {recycle.files.map((file) => (
                  <article className="recycle-card" key={file.id}>
                    <label className="entry-select-control">
                      <input
                        className="entry-select"
                        type="checkbox"
                        aria-label={t("bulk.selectAria", { name: file.displayName })}
                        checked={selectedKeys.has(selectionKey("file", file.id))}
                        disabled={busyId === "bulk" || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("file", file.id)))}
                        onChange={() => toggleSelection({ kind: "file", item: file })}
                      />
                      <span className="entry-select-box" aria-hidden="true" />
                    </label>
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
      {recordDialogOpen && (
        <ScholarlyRecordsDialog
          api={api}
          availableFiles={entries.files}
          onClose={() => setRecordDialogOpen(false)}
          returnFocus={recordTriggerRef.current}
        />
      )}
      {accountAdministrationOpen && (
        <AccountAdministrationDialog
          api={api}
          ownerId={account.id}
          onClose={() => setAccountAdministrationOpen(false)}
        />
      )}
      {announcementAdministrationOpen && (
        <AnnouncementAdministrationDialog
          api={api}
          onClose={() => setAnnouncementAdministrationOpen(false)}
          onChanged={() => setAnnouncementRevision((value) => value + 1)}
        />
      )}
      {auditOpen && <AuditDialog api={api} onClose={() => setAuditOpen(false)} />}
      {passwordChangeOpen && (
        <PasswordChangeDialog
          api={api}
          onClose={() => setPasswordChangeOpen(false)}
          onChanged={passwordChanged}
        />
      )}
      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} onDownload={() => void downloadFile(preview.file)} />}
      {moveRequest && (
        <MoveDialog
          api={api}
          request={moveRequest}
          onClose={() => setMoveRequest(null)}
          onMove={async (folderId) => {
            if (moveRequest.kind === "bulk") {
              await api.bulkOperation({
                action: "move",
                items: moveRequest.items.map(toBulkItem),
                destinationFolderId: folderId,
              });
              setSelectedKeys(new Set());
              setNotice(t("bulk.completed", { count: moveRequest.items.length }));
            } else if (moveRequest.kind === "folder") {
              await api.updateFolder(moveRequest.item.id, { parentId: folderId });
              setNotice(t("move.folderMoved"));
            } else {
              await api.updateFile(moveRequest.item.id, { folderId });
              setNotice(t("move.fileMoved"));
            }
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

function invitationStatusKey(status: Invitation["status"]) {
  switch (status) {
    case "available": return "accounts.invitationAvailable" as const;
    case "expired": return "accounts.invitationExpired" as const;
    case "consumed": return "accounts.invitationConsumed" as const;
    case "revoked": return "accounts.invitationRevoked" as const;
  }
}

function ScholarlyRecordsDialog({
  api,
  availableFiles,
  onClose,
  returnFocus,
}: {
  api: AcademicCloudApi;
  availableFiles: FileEntry[];
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const { language, t } = useLanguage();
  const [records, setRecords] = useState<ScholarlyRecordSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ScholarlyRecord | null>(null);
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [fileId, setFileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const dialogRef = useModalDialog(onClose, busy !== null, returnFocus);
  const selected = selectedRecord?.id === selectedId ? selectedRecord : null;
  const attachableFiles = availableFiles.filter((file) => file.state === "active");

  function replaceRecord(record: ScholarlyRecord): void {
    const summary: ScholarlyRecordSummary = {
      id: record.id,
      label: record.label,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      artifactCount: record.artifactCount,
    };
    setRecords((current) => current.some((item) => item.id === record.id)
      ? current.map((item) => item.id === record.id ? summary : item)
      : [summary, ...current]);
    setSelectedRecord(record);
    setSelectedId(record.id);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.listScholarlyRecords(controller.signal).then(
      (page) => {
        setRecords(page.records);
        setNextBeforeId(page.nextBeforeId);
        setSelectedId((current) => current && page.records.some((record) => record.id === current)
          ? current
          : page.records[0]?.id ?? null);
      },
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
      },
    ).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedRecord(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setError(null);
    api.getScholarlyRecord(selectedId, controller.signal).then(
      (record) => setSelectedRecord(record),
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
      },
    ).finally(() => {
      if (!controller.signal.aborted) setDetailLoading(false);
    });
    return () => controller.abort();
  }, [api, selectedId]);

  async function loadMoreRecords(): Promise<void> {
    if (!nextBeforeId) return;
    setBusy("more-records");
    setError(null);
    try {
      const page = await api.listScholarlyRecords(undefined, nextBeforeId);
      setRecords((current) => [
        ...current,
        ...page.records.filter((record) => !current.some((existing) => existing.id === record.id)),
      ]);
      setNextBeforeId(page.nextBeforeId);
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function loadMoreArtifacts(): Promise<void> {
    if (!selected?.nextBeforeArtifactId) return;
    setBusy("more-artifacts");
    setError(null);
    try {
      const page = await api.getScholarlyRecord(selected.id, undefined, selected.nextBeforeArtifactId);
      setSelectedRecord((current) => current?.id === page.id ? {
        ...page,
        artifacts: [
          ...current.artifacts,
          ...page.artifacts.filter((artifact) => !current.artifacts.some((existing) => existing.id === artifact.id)),
        ],
      } : current);
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function createRecord(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const created = await api.createScholarlyRecord(label);
      replaceRecord(created);
      setLabel("");
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function attach(recordId: string, selectedFileId: string): Promise<void> {
    setBusy(`attach:${selectedFileId}`);
    setError(null);
    try {
      replaceRecord(await api.attachFileToScholarlyRecord(recordId, selectedFileId));
      setFileId("");
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function detach(recordId: string, artifactId: string): Promise<void> {
    setBusy(`detach:${artifactId}`);
    setError(null);
    try {
      replaceRecord(await api.detachScholarlyArtifact(recordId, artifactId));
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog ref={dialogRef} className="scholarly-records-modal" aria-labelledby="scholarly-records-title">
      <header>
        <h2 id="scholarly-records-title">{t("records.title")}</h2>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={busy !== null}>{t("preview.close")}</button>
      </header>
      <div className="scholarly-records-body">
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        <form className="scholarly-record-create" onSubmit={(event) => void createRecord(event)}>
          <label htmlFor="scholarly-record-label">{t("records.label")}</label>
          <input
            id="scholarly-record-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            minLength={1}
            maxLength={255}
            required
          />
          <button className="button button--primary" type="submit" disabled={busy !== null}>{t("records.create")}</button>
        </form>
        {loading ? <LoadingRows /> : records.length === 0 ? (
          <EmptyState title={t("records.empty")} />
        ) : (
          <div className="scholarly-records-layout">
            <nav className="scholarly-record-list" aria-label={t("records.listAria")}>
              {records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className={record.id === selectedId ? "is-selected" : undefined}
                  aria-current={record.id === selectedId ? "page" : undefined}
                  onClick={() => setSelectedId(record.id)}
                >
                  <strong>{record.label}</strong>
                  <span>{t("records.artifactCount", { count: record.artifactCount })}</span>
                </button>
              ))}
              {nextBeforeId && (
                <button type="button" disabled={busy !== null} onClick={() => void loadMoreRecords()}>
                  {t("records.loadMore")}
                </button>
              )}
            </nav>
            {detailLoading && !selected && <LoadingRows />}
            {selected && (
              <section className="scholarly-record-detail" aria-labelledby="scholarly-record-detail-title">
                <div className="section-heading">
                  <h3 id="scholarly-record-detail-title">{selected.label}</h3>
                  <span>{formatDate(selected.updatedAt, language)}</span>
                </div>
                <form
                  className="scholarly-attach-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (fileId) void attach(selected.id, fileId);
                  }}
                >
                  <label htmlFor="scholarly-attach-file">{t("records.currentFolderFiles")}</label>
                  <select id="scholarly-attach-file" value={fileId} onChange={(event) => setFileId(event.target.value)} required>
                    <option value="">{t("records.chooseFile")}</option>
                    {attachableFiles.map((file) => <option key={file.id} value={file.id}>{file.displayName}</option>)}
                  </select>
                  <button className="button button--secondary" type="submit" disabled={busy !== null || !fileId}>{t("records.attach")}</button>
                </form>
                {selected.artifacts.length === 0 ? (
                  <p className="muted">{t("records.noArtifacts")}</p>
                ) : (
                  <div className="scholarly-artifact-list">
                    {selected.artifacts.map((artifact) => {
                      const file = artifact.version?.file ?? null;
                      return (
                        <article key={artifact.id} className="scholarly-artifact-row">
                          <div>
                            <strong>{file?.displayName || t("records.tombstoned")}</strong>
                            <span>{t(`records.${artifact.attachmentState}`)}</span>
                            <span>{t(`records.${file?.availability ?? "tombstoned"}`)}</span>
                          </div>
                          {artifact.attachmentState === "attached" ? (
                            <button className="button button--small" type="button" disabled={busy !== null} onClick={() => void detach(selected.id, artifact.id)}>{t("records.detach")}</button>
                          ) : file?.availability === "available" ? (
                            <button className="button button--small" type="button" disabled={busy !== null} onClick={() => void attach(selected.id, file.id)}>{t("records.reattach")}</button>
                          ) : null}
                        </article>
                      );
                    })}
                    {selected.nextBeforeArtifactId && (
                      <button className="button button--secondary" type="button" disabled={busy !== null} onClick={() => void loadMoreArtifacts()}>
                        {t("records.loadMore")}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

function AccountAdministrationDialog({
  api,
  ownerId,
  onClose,
}: {
  api: AcademicCloudApi;
  ownerId: string;
  onClose: () => void;
}) {
  const { language, t } = useLanguage();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const dialogRef = useModalDialog(onClose, busyId !== null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([api.listAccounts(showArchived), api.listInvitations()]).then(
      ([nextAccounts, nextInvitations]) => {
        if (!live) return;
        setAccounts(nextAccounts);
        setInvitations(nextInvitations);
      },
      (caught: unknown) => {
        if (live) setError(caught);
      },
    ).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [api, showArchived]);

  async function createInvitation() {
    setBusyId("create-invitation");
    setError(null);
    setOneTimeLink(null);
    try {
      const created = await api.createInvitation();
      setOneTimeLink(`${window.location.origin}/#/invite/${created.rawToken}`);
      setInvitations((current) => [created.invitation, ...current.filter((item) => item.id !== created.invitation.id)]);
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setBusyId(`invite-${invitationId}`);
    setError(null);
    try {
      const updated = await api.revokeInvitation(invitationId);
      setInvitations((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function setMemberState(account: ManagedAccount, state: ManagedAccount["state"]) {
    setBusyId(`account-${account.id}`);
    setError(null);
    try {
      const updated = await api.setAccountState(account.id, state);
      setAccounts((current) => updated.state === "archived" && !showArchived
        ? current.filter((item) => item.id !== updated.id)
        : current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <dialog ref={dialogRef} className="account-administration-modal" aria-labelledby="account-administration-title">
      <header>
        <h2 id="account-administration-title">{t("accounts.title")}</h2>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={busyId !== null} aria-label={t("accounts.closeAria")}>{t("preview.close")}</button>
      </header>
      <div className="account-administration-body">
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        {loading ? <LoadingRows /> : (
          <>
            <section aria-labelledby="account-list-title">
              <div className="account-administration-section-heading">
                <h3 id="account-list-title">{t("accounts.members")}</h3>
                <button className="button button--quiet button--small" type="button" disabled={busyId !== null} onClick={() => setShowArchived((current) => !current)}>
                  {showArchived ? t("accounts.hideArchived") : t("accounts.showArchived")}
                </button>
              </div>
              <div className="account-administration-list">
                {accounts.map((account) => (
                  <article className="account-administration-row" key={account.id}>
                    <div>
                      <strong>{account.loginName}</strong>
                      <span>{account.role === "owner" ? t("accounts.owner") : t("accounts.member")} · {account.state === "active" ? t("accounts.active") : account.state === "disabled" ? t("accounts.disabled") : t("accounts.archived")}</span>
                    </div>
                    {account.role === "member" && account.id !== ownerId && (
                      <div className="account-administration-row-actions">
                        {account.state === "active" && (
                          <button className="button button--small button--danger" type="button" disabled={busyId !== null} onClick={() => void setMemberState(account, "disabled")}>{t("accounts.disable")}</button>
                        )}
                        {account.state === "disabled" && (
                          <>
                            <button className="button button--small" type="button" disabled={busyId !== null} onClick={() => void setMemberState(account, "active")}>{t("accounts.enable")}</button>
                            <button className="button button--small button--quiet" type="button" disabled={busyId !== null} onClick={() => void setMemberState(account, "archived")}>{t("accounts.archive")}</button>
                          </>
                        )}
                        {account.state === "archived" && (
                          <button className="button button--small" type="button" disabled={busyId !== null} onClick={() => void setMemberState(account, "disabled")}>{t("accounts.unarchive")}</button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <section aria-labelledby="invitation-list-title">
              <div className="account-administration-section-heading">
                <h3 id="invitation-list-title">{t("accounts.invitations")}</h3>
                <button className="button button--primary button--small" type="button" disabled={busyId !== null} onClick={() => void createInvitation()}>{t("accounts.createInvitation")}</button>
              </div>
              {oneTimeLink !== null && (
                <div className="invitation-link" role="status">
                  <label htmlFor="one-time-invitation-link">{t("accounts.oneTimeLink")}</label>
                  <input id="one-time-invitation-link" readOnly value={oneTimeLink} onFocus={(event) => event.currentTarget.select()} />
                  <button className="button button--quiet button--small" type="button" onClick={() => setOneTimeLink(null)}>{t("accounts.dismissLink")}</button>
                </div>
              )}
              {invitations.length === 0 ? <p className="account-administration-empty">{t("accounts.noInvitations")}</p> : (
                <div className="account-administration-list">
                  {invitations.map((invitation) => (
                    <article className="account-administration-row" key={invitation.id}>
                      <div>
                        <strong>{t(invitationStatusKey(invitation.status))}</strong>
                        <span>{t("accounts.expires", { date: formatDate(invitation.expiresAt, language) })}</span>
                      </div>
                      {invitation.status === "available" && (
                        <button className="button button--small button--danger" type="button" disabled={busyId !== null} onClick={() => void revokeInvitation(invitation.id)}>{t("accounts.revoke")}</button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}

function PasswordChangeDialog({
  api,
  onClose,
  onChanged,
}: {
  api: AcademicCloudApi;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { language, t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useModalDialog(onClose, submitting);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmation) {
      setError(new ApiError(400, "password_mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      onChanged();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="password-change-modal" aria-labelledby="password-change-title">
      <form onSubmit={(event) => void submit(event)}>
        <header>
          <h2 id="password-change-title">{t("password.change")}</h2>
          <button className="button button--quiet" type="button" onClick={onClose} disabled={submitting} aria-label={t("password.closeAria")}>{t("preview.close")}</button>
        </header>
        <div className="password-change-body">
          {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
          <label htmlFor="password-current">{t("password.current")}</label>
          <input id="password-current" name="currentPassword" type="password" autoComplete="current-password" minLength={1} maxLength={1024} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoFocus />
          <label htmlFor="password-new">{t("password.new")}</label>
          <input id="password-new" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          <label htmlFor="password-confirm">{t("password.confirm")}</label>
          <input id="password-confirm" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          <div className="password-change-actions">
            <button className="button button--quiet" type="button" onClick={onClose} disabled={submitting}>{t("password.cancel")}</button>
            <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? t("password.saving") : t("password.save")}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
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
    // simplest robust behavior is to close the menu. If keyboard focus is
    // inside the menu at that moment, the focused menuitem would detach from
    // the document — restore focus to the row trigger instead of leaving
    // focus stranded.
    const closeOnMove = () => {
      const focusInside = menuRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (focusInside) triggerRef.current?.focus();
    };
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

function BulkToolbar({
  mode,
  selectedCount,
  busy,
  onClear,
  onMove,
  onRecycle,
  onRestore,
  onFavoriteAdd,
  onFavoriteRemove,
}: {
  mode: "library" | "favorites" | "recycle";
  selectedCount: number;
  busy: boolean;
  onClear: () => void;
  onMove?: (trigger: HTMLElement) => void;
  onRecycle?: () => void;
  onRestore?: () => void;
  onFavoriteAdd?: () => void;
  onFavoriteRemove?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="bulk-toolbar" data-mode={mode} role="toolbar" aria-label={t("bulk.toolbarAria")}>
      <strong>{t("bulk.selected", { count: selectedCount })}</strong>
      <div className="bulk-toolbar-actions">
        {onMove && (
          <button className="button button--small" type="button" disabled={busy} onClick={(event) => onMove(event.currentTarget)}>
            {t("bulk.move")}
          </button>
        )}
        {onFavoriteAdd && <button className="button button--small" type="button" disabled={busy} onClick={onFavoriteAdd}>{t("bulk.favoriteAdd")}</button>}
        {onFavoriteRemove && <button className="button button--small" type="button" disabled={busy} onClick={onFavoriteRemove}>{t("bulk.favoriteRemove")}</button>}
        {onRestore && <button className="button button--small" type="button" disabled={busy} onClick={onRestore}>{t("bulk.restore")}</button>}
        {onRecycle && <button className="button button--small button--danger" type="button" disabled={busy} onClick={onRecycle}>{t("bulk.recycle")}</button>}
        <button className="button button--small button--quiet" type="button" disabled={busy} onClick={onClear}>{t("bulk.clear")}</button>
      </div>
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
  selectedKeys,
  onToggleSelected,
  selectionDisabled,
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
  selectedKeys: ReadonlySet<string>;
  onToggleSelected: (entry: SelectableEntry) => void;
  selectionDisabled: boolean;
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
        <div className={selectedKeys.has(selectionKey("folder", folder.id)) ? "entry-row is-selected" : "entry-row"} role="row" key={folder.id}>
          <div className="entry-name" role="cell">
            <label className="entry-select-control">
              <input
                className="entry-select"
                type="checkbox"
                aria-label={t("bulk.selectAria", { name: folder.name })}
                checked={selectedKeys.has(selectionKey("folder", folder.id))}
                disabled={selectionDisabled || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("folder", folder.id)))}
                onChange={() => onToggleSelected({ kind: "folder", item: folder })}
              />
              <span className="entry-select-box" aria-hidden="true" />
            </label>
            <FolderIcon size={20} className="file-badge file-badge--folder" />
            <div className="entry-name-body">
              <button className="entry-link" type="button" onClick={() => onEnterFolder(folder)}>{folder.name}</button>
              <span className="entry-mobile-meta">{t("folder.kind")}</span>
            </div>
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
        <div className={selectedKeys.has(selectionKey("file", file.id)) ? "entry-row is-selected" : "entry-row"} role="row" key={file.id}>
          <div className="entry-name" role="cell">
            <label className="entry-select-control">
              <input
                className="entry-select"
                type="checkbox"
                aria-label={t("bulk.selectAria", { name: file.displayName })}
                checked={selectedKeys.has(selectionKey("file", file.id))}
                disabled={selectionDisabled || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("file", file.id)))}
                onChange={() => onToggleSelected({ kind: "file", item: file })}
              />
              <span className="entry-select-box" aria-hidden="true" />
            </label>
            <FileBadge file={file} />
            <div className="entry-name-body">
              <strong className="entry-filename" title={file.displayName}>{file.displayName}</strong>
              <span className="entry-mobile-meta">{fileKindLabel(file, t)} · {formatBytes(file.sizeBytes)}</span>
            </div>
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

function fileKindLabel(file: FileEntry, t: Translator): string {
  if (file.mediaType === "application/pdf") return t("file.kindPdf");
  if (file.mediaType.startsWith("image/")) return t("file.kindImage");
  if (file.mediaType.startsWith("text/")) return t("file.kindText");
  return t("file.kindFile");
}

// Compact account access for the mobile topbar: avatar trigger + popover with
// account name, language switch, and sign out. Desktop keeps its always
// visible row; CSS decides which presentation shows at which width. The
// popover renders only while open, so the desktop controls stay unique. The
// interactive section is a real ARIA menu (menuitem roles, arrow/Home/End
// navigation, focus moves in on open) mirroring RowMenu semantics.
function AccountMenu({
  accountName,
  owner,
  busy,
  onManageAccounts,
  onManageAnnouncements,
  onManageAudit,
  onChangePassword,
  onSignOut,
}: {
  accountName: string;
  owner: boolean;
  busy: boolean;
  onManageAccounts: () => void;
  onManageAnnouncements: () => void;
  onManageAudit: () => void;
  onChangePassword: () => void;
  onSignOut: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    // Same movement policy as RowMenu: closing must never strand focus on a
    // detached element.
    const closeOnMove = () => {
      const focusInside = menuRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (focusInside) triggerRef.current?.focus();
    };
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

  // Move focus into the menu when it opens (keyboard contract of a menu).
  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not([disabled])')?.focus();
    }
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
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
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not([disabled])') ?? []);
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
    <div className="account-trigger-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.menuAria")}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
      </button>
      {open && (
        <div ref={menuRef} className="account-popover">
          <p className="account-popover-name">{accountName}</p>
          <div className="account-popover-menu" role="menu" aria-label={t("account.menuLabel")} onKeyDown={onMenuKeyDown}>
            <LanguageSwitch labelled menuitem />
            {owner && (
              <>
                <button
                  className="account-popover-signout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    onManageAccounts();
                  }}
                >
                  {t("account.manage")}
                </button>
                <button
                  className="account-popover-signout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    onManageAnnouncements();
                  }}
                >
                  {t("announcements.manage")}
                </button>
                <button
                  className="account-popover-signout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    onManageAudit();
                  }}
                >
                  {t("audit.manage")}
                </button>
              </>
            )}
            <button
              className="account-popover-signout"
              type="button"
              role="menuitem"
              onClick={() => {
                close(false);
                onChangePassword();
              }}
            >
              {t("password.change")}
            </button>
            <button
              className="account-popover-signout"
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                close(false);
                onSignOut();
              }}
            >
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
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

function PreviewDialog({ preview, onClose, onDownload }: { preview: PreviewState; onClose: () => void; onDownload: () => void }) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog(onClose, false, preview.returnFocus);

  return (
      <dialog ref={dialogRef} className="preview-modal" aria-labelledby="preview-title">
        <header>
          <h2 id="preview-title">{preview.file.displayName}</h2>
          <button className="button button--quiet preview-close-button" type="button" onClick={onClose} aria-label={t("preview.closeAria")}>{t("preview.close")}</button>
        </header>
        <div className="preview-content">
          {preview.file.mediaType.startsWith("image/") ? (
            <img src={preview.url} alt={t("preview.imageAlt", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
          ) : (
            <iframe src={preview.url} title={t("preview.frameTitle", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
          )}
        </div>
        <footer>
          <a className="button preview-open-button" href={preview.url} target="_blank" rel="noreferrer">{t("preview.open")}</a>
          <button className="button preview-download-button" type="button" onClick={onDownload}>{t("menu.download")}</button>
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
  const currentParentIds = request.kind === "bulk"
    ? new Set(request.items.map((entry) => entry.kind === "folder" ? entry.item.parentId : entry.item.folderId))
    : new Set([request.kind === "folder" ? request.item.parentId : request.item.folderId]);
  const selectedFolderIds = new Set(
    request.kind === "bulk"
      ? request.items.filter((entry) => entry.kind === "folder").map((entry) => entry.item.id)
      : request.kind === "folder" ? [request.item.id] : [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.listEntries(destinationId, controller.signal).then(
      (response) => setFolders(response.folders.filter((folder) => !selectedFolderIds.has(folder.id))),
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
      },
    ).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [api, destinationId, request]);

  const itemName = request.kind === "bulk"
    ? t("bulk.selected", { count: request.items.length })
    : request.kind === "folder" ? request.item.name : request.item.displayName;

  return (
      <dialog ref={dialogRef} className="move-modal" aria-labelledby="move-title">
        <header>
          <h2 id="move-title">{t("move.title", { name: itemName })}</h2>
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
            disabled={moving || loading || (currentParentIds.size === 1 && currentParentIds.has(destinationId))}
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

function EmptyState({ title }: { title: string }) {
  return <div className="empty-state"><span aria-hidden="true">◇</span><h3>{title}</h3></div>;
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
