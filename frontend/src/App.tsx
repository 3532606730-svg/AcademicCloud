import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  ApiClient,
  ApiError,
  type AcademicCloudApi,
  type Account,
  type BulkAction,
  type BulkItem,
  type DerivedMetadataJob,
  type Invitation,
  type LibraryHolding,
  type LibraryHoldingDetails,
  type LibraryRecycleFile,
  type LibrarySummary,
  type ManagedAccount,
  type MultipartTransfer,
  type EntriesResponse,
  type FileEntry,
  type FolderEntry,
  type FavoritesResponse,
  type RecycleResponse,
  type ScholarlyRecord,
  type ScholarlyRecordSummary,
} from "./api.ts";
import { uploadDirectly, uploadPartDirectly, type UploadProgressMetrics } from "./direct-upload.ts";
import { AnnouncementAdministrationPanel, AnnouncementFeed } from "./announcements.tsx";
import { AuditPanel } from "./audit.tsx";
import { ContributionReviewPanel, SharedLibraryPanel } from "./shared-library.tsx";
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
import { ResourceDetailsDialog } from "./resource-details.tsx";
import { BatchNamingDialog } from "./batch-naming.tsx";
import { libraryHoldingDisplayTitle } from "./library-display-title.ts";
import { LibrarySearchField, librarySearchResultToHolding } from "./library-search.tsx";
import { CitationDialog } from "./citation.tsx";
import {
  forgetSourceHandle,
  recoverRememberedSource,
  rememberSourceHandle,
  type RecoverableFileHandle,
} from "./file-source-recovery.ts";

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

function takeCredentialResetTokenFromLocation(): string | null {
  const match = /^#\/reset\/([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
  if (!match) return null;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return match[1]!;
}

export interface AppProps {
  api?: AcademicCloudApi;
  checksumFile?: typeof calculateFileMd5;
  directUpload?: typeof uploadDirectly;
  directPartUpload?: typeof uploadPartDirectly;
}

export function App({
  api: injectedApi,
  checksumFile = calculateFileMd5,
  directUpload = uploadDirectly,
  directPartUpload = uploadPartDirectly,
}: AppProps) {
  return (
    <LanguageProvider>
      <AppContent api={injectedApi} checksumFile={checksumFile} directUpload={directUpload} directPartUpload={directPartUpload} />
    </LanguageProvider>
  );
}

function AppContent({
  api: injectedApi,
  checksumFile,
  directUpload,
  directPartUpload,
}: {
  api: AcademicCloudApi | undefined;
  checksumFile: typeof calculateFileMd5;
  directUpload: typeof uploadDirectly;
  directPartUpload: typeof uploadPartDirectly;
}) {
  const [auth, setAuth] = useState<AuthState>({ phase: "checking" });
  const [invitationToken, setInvitationToken] = useState<string | null>(takeInvitationTokenFromLocation);
  const [credentialResetToken, setCredentialResetToken] = useState<string | null>(takeCredentialResetTokenFromLocation);
  const [credentialResetComplete, setCredentialResetComplete] = useState(false);
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
    if (credentialResetToken) return;
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
  }, [api, credentialResetToken]);

  if (credentialResetToken) {
    return (
      <CredentialResetView
        api={api}
        token={credentialResetToken}
        onCancel={() => setCredentialResetToken(null)}
        onComplete={() => {
          setCredentialResetToken(null);
          setCredentialResetComplete(true);
          setAuth({ phase: "anonymous" });
        }}
      />
    );
  }

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
        resetComplete={credentialResetComplete}
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
      directPartUpload={directPartUpload}
      onSignedOut={(message) => setAuth({ phase: "anonymous", ...(message ? { message } : {}) })}
    />
  );
}

function CredentialResetView({
  api,
  token,
  onCancel,
  onComplete,
}: {
  api: AcademicCloudApi;
  token: string;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const { language, t } = useLanguage();
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
      await api.redeemCredentialReset(token, password);
      setPassword("");
      setConfirmation("");
      onComplete();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="credential-reset-title">
        <h1 className="brand" id="credential-reset-title"><span>AC</span> {t("credentialReset.title")}</h1>
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="credential-reset-password">{t("credentialReset.newPassword")}</label>
          <input id="credential-reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          <label htmlFor="credential-reset-confirm">{t("credentialReset.confirmPassword")}</label>
          <input id="credential-reset-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          <button className="button button--primary button--wide" type="submit" disabled={submitting}>{submitting ? t("credentialReset.submitting") : t("credentialReset.submit")}</button>
          <button className="button button--quiet button--wide" type="button" onClick={onCancel} disabled={submitting}>{t("credentialReset.cancel")}</button>
        </form>
        <div className="login-language"><LanguageSwitch labelled /></div>
      </section>
    </main>
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
  resetComplete,
  onAuthenticated,
}: {
  api: AcademicCloudApi;
  initialError?: unknown;
  resetComplete?: boolean;
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
        {resetComplete && <div className="alert alert--success" role="status">{t("credentialReset.complete")}</div>}
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
        <p className="login-help">{t("credentialReset.loginHint")}</p>
        <div className="login-language">
          <LanguageSwitch labelled />
        </div>
      </section>
    </main>
  );
}

type DriveViewName = "library" | "pending" | "recycle" | "favorites";
type UploadPhase = "queued" | "checksum" | "reserving" | "uploading" | "paused" | "resumable" | "completing" | "verifying" | "complete" | "error" | "abandoned";

const ACTIVE_UPLOAD_PHASES: ReadonlySet<UploadPhase> = new Set(["checksum", "reserving", "uploading", "completing", "verifying"]);
const MAX_CONCURRENT_UPLOADS = 2;
const MAX_CONCURRENT_PARTS = 3;
const MAX_PART_RETRIES = 3;
const UPLOAD_METRICS_UPDATE_INTERVAL_MS = 500;
const ACTIVITY_SUCCESS_DISMISS_MS = 8_000;
const METADATA_ACTIVITY_RELOAD_WINDOW_MS = 15 * 60_000;

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
  transfer: MultipartTransfer | null;
  error: string | null;
  controller: AbortController;
  bytesUploaded: number;
  totalBytes: number;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
  sourceHandle: RecoverableFileHandle | null;
}

interface MetadataActivity {
  library: LibrarySummary;
  holding: LibraryHolding;
  job: DerivedMetadataJob;
}

interface DownloadActivity {
  id: string;
  name: string;
  phase: "preparing" | "started" | "failed";
  error: string | null;
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<RecoverableFileHandle[]>;
};

interface PreviewState {
  file: Pick<FileEntry, "displayName" | "mediaType">;
  url: string;
  returnFocus: HTMLElement | null;
  download: () => Promise<void>;
}

interface ResourceDetailsRequest {
  library: LibrarySummary;
  holding: LibraryHolding;
  returnFocus: HTMLElement | null;
}

interface CitationRequest {
  library: LibrarySummary;
  holding: LibraryHolding;
  returnFocus: HTMLElement | null;
}

const ACTIVITY_PREFERENCE_PREFIX = "academiccloud.activity-center.expanded.v1";

function activityPreferenceKey(accountId: string): string {
  return `${ACTIVITY_PREFERENCE_PREFIX}:${accountId}`;
}

function readActivityExpanded(accountId: string): boolean {
  try {
    return window.localStorage.getItem(activityPreferenceKey(accountId)) === "1";
  } catch {
    return false;
  }
}

function writeActivityExpanded(accountId: string, expanded: boolean): void {
  try {
    window.localStorage.setItem(activityPreferenceKey(accountId), expanded ? "1" : "0");
  } catch {
    // Browser-local preference is optional; activity behavior remains usable.
  }
}

type ResourceScope = "account_folder" | "account_file" | "library_holding" | "library_recycle_holding";

type AccountSelectableEntry =
  | { scope: "account_folder"; item: FolderEntry }
  | { scope: "account_file"; item: FileEntry };

type SelectableEntry =
  | AccountSelectableEntry
  | { scope: "library_holding"; library: LibrarySummary; item: LibraryHolding }
  | { scope: "library_recycle_holding"; library: LibrarySummary; item: LibraryRecycleFile };

type MoveRequest =
  | { kind: "folder"; item: FolderEntry; returnFocus: HTMLElement | null }
  | { kind: "file"; item: FileEntry; returnFocus: HTMLElement | null }
  | { kind: "bulk"; items: AccountSelectableEntry[]; returnFocus: HTMLElement | null };

function selectionKey(scope: ResourceScope, id: string, libraryId?: string): string {
  return libraryId ? `${scope}:${libraryId}:${id}` : `${scope}:${id}`;
}

function keyForEntry(entry: SelectableEntry): string {
  switch (entry.scope) {
    case "account_folder": return selectionKey(entry.scope, entry.item.id);
    case "account_file": return selectionKey(entry.scope, entry.item.id);
    case "library_holding": return selectionKey(entry.scope, entry.item.file.id, entry.library.id);
    case "library_recycle_holding": return selectionKey(entry.scope, entry.item.file.id, entry.library.id);
  }
}

function isAccountEntry(entry: SelectableEntry): entry is AccountSelectableEntry {
  return entry.scope === "account_folder" || entry.scope === "account_file";
}

function toBulkItem(entry: AccountSelectableEntry): BulkItem {
  return entry.scope === "account_folder"
    ? { kind: "folder", id: entry.item.id, version: entry.item.version }
    : { kind: "file", id: entry.item.id, version: entry.item.version };
}

interface SelectionCapabilities {
  favoriteAdd: boolean;
  favoriteRemove: boolean;
  move: boolean;
  recycle: boolean;
  restore: boolean;
  permanentDelete: boolean;
  preview: boolean;
  download: boolean;
  rename: boolean;
}

function deriveSelectionCapabilities(
  entries: readonly SelectableEntry[],
  actorRole: Account["role"],
  favoriteFileIds: ReadonlySet<string>,
  favoriteFolderIds: ReadonlySet<string>,
): SelectionCapabilities {
  const none: SelectionCapabilities = {
    favoriteAdd: false,
    favoriteRemove: false,
    move: false,
    recycle: false,
    restore: false,
    permanentDelete: false,
    preview: false,
    download: false,
    rename: false,
  };
  if (entries.length === 0) return none;

  const favoriteState = entries.map((entry): boolean | null => {
    switch (entry.scope) {
      case "account_folder": return entry.item.state === "active" ? favoriteFolderIds.has(entry.item.id) : null;
      case "account_file": return entry.item.state === "active" ? favoriteFileIds.has(entry.item.id) : null;
      case "library_holding": return favoriteFileIds.has(entry.item.file.id);
      case "library_recycle_holding": return null;
    }
  });
  const allFavoriteEligible = favoriteState.every((state) => state !== null);
  const allAccountActive = entries.every((entry) => isAccountEntry(entry) && entry.item.state === "active");
  const allAccountRecycle = entries.every((entry) => isAccountEntry(entry) && entry.item.state === "deleted");
  const allLibraryActive = entries.every((entry) => entry.scope === "library_holding");
  const allLibraryRecycle = entries.every((entry) => entry.scope === "library_recycle_holding");

  return {
    favoriteAdd: allFavoriteEligible && favoriteState.some((state) => state === false),
    favoriteRemove: allFavoriteEligible && favoriteState.every((state) => state === true),
    move: actorRole === "owner" && allAccountActive,
    recycle: actorRole === "owner" && (
      allAccountActive
      || (allLibraryActive && entries.every((entry) => entry.scope === "library_holding" && entry.library.role === "manager"))
    ),
    restore: allAccountRecycle || allLibraryRecycle || entries.every((entry) => (
      (isAccountEntry(entry) && entry.item.state === "deleted")
      || entry.scope === "library_recycle_holding"
    )),
    permanentDelete: actorRole === "owner" && entries.every((entry) => (
      (isAccountEntry(entry) && entry.item.state === "deleted")
      || entry.scope === "library_recycle_holding"
    )),
    preview: entries.every((entry) => entry.scope === "account_file" || entry.scope === "library_holding"),
    download: entries.every((entry) => entry.scope === "account_file" || entry.scope === "library_holding"),
    rename: actorRole === "owner" && allAccountActive,
  };
}

interface DropOverlayState {
  count: number | null;
}

const EMPTY_ENTRIES: EntriesResponse = { folder: null, folders: [], files: [] };
const EMPTY_RECYCLE: RecycleResponse = { folders: [], files: [] };
const EMPTY_LIBRARY_RECYCLE: { library: LibrarySummary | null; files: LibraryRecycleFile[] } = {
  library: null,
  files: [],
};

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

async function regularFileSourcesFrom(dataTransfer: DataTransfer): Promise<Array<{
  file: File;
  handle: RecoverableFileHandle | null;
}>> {
  const items = dataTransfer.items;
  if (!items || items.length === 0) {
    return Array.from(dataTransfer.files ?? []).map((file) => ({ file, handle: null }));
  }
  const sources: Array<{ file: File; handle: RecoverableFileHandle | null }> = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry && !entry.isFile) continue;
    const file = item.getAsFile?.();
    if (!file) continue;
    let handle: RecoverableFileHandle | null = null;
    const itemWithHandle = item as DataTransferItem & {
      getAsFileSystemHandle?: () => Promise<{ kind: string } & Partial<RecoverableFileHandle>>;
    };
    try {
      const candidate = await itemWithHandle.getAsFileSystemHandle?.();
      if (candidate?.kind === "file" && typeof candidate.getFile === "function") {
        handle = candidate as RecoverableFileHandle;
      }
    } catch {
      // Drag handle retention is optional; the in-memory File remains usable.
    }
    sources.push({ file, handle });
  }
  return sources;
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
  directPartUpload,
  onSignedOut,
}: {
  account: Account;
  api: AcademicCloudApi;
  checksumFile: typeof calculateFileMd5;
  directUpload: typeof uploadDirectly;
  directPartUpload: typeof uploadPartDirectly;
  onSignedOut: (message?: string) => void;
}) {
  const { language, t } = useLanguage();
  const [view, setView] = useState<DriveViewName>("library");
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [entries, setEntries] = useState<EntriesResponse>(EMPTY_ENTRIES);
  const [pending, setPending] = useState<FileEntry[]>([]);
  const [recycle, setRecycle] = useState<RecycleResponse>(EMPTY_RECYCLE);
  const [libraryRecycle, setLibraryRecycle] = useState(EMPTY_LIBRARY_RECYCLE);
  const [libraryRecycleLoading, setLibraryRecycleLoading] = useState(false);
  const [libraryRecycleError, setLibraryRecycleError] = useState<unknown>(null);
  const [libraryCatalogue, setLibraryCatalogue] = useState<{
    library: LibrarySummary | null;
    holdings: LibraryHolding[];
  }>({ library: null, holdings: [] });
  const [librarySearchActive, setLibrarySearchActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [metadataActivities, setMetadataActivities] = useState<MetadataActivity[]>([]);
  const [downloadActivities, setDownloadActivities] = useState<DownloadActivity[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(() => readActivityExpanded(account.id));
  const [uploadPickerFallbackAvailable, setUploadPickerFallbackAvailable] = useState(false);
  const [sourceRecoveryFallbacks, setSourceRecoveryFallbacks] = useState<Record<string, string>>({});
  const [recoveringSourceId, setRecoveringSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [resourceDetailsRequest, setResourceDetailsRequest] = useState<ResourceDetailsRequest | null>(null);
  const [citationRequest, setCitationRequest] = useState<CitationRequest | null>(null);
  const [batchNamingRequest, setBatchNamingRequest] = useState<{ library: LibrarySummary; holdings: LibraryHolding[] } | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [dropOverlay, setDropOverlay] = useState<DropOverlayState | null>(null);
  const [favorites, setFavorites] = useState<FavoritesResponse | null>(null);
  const [favoritesError, setFavoritesError] = useState<unknown>(null);
  const [favoriteFileIds, setFavoriteFileIds] = useState<ReadonlySet<string>>(new Set());
  const [favoriteFolderIds, setFavoriteFolderIds] = useState<ReadonlySet<string>>(new Set());
  const [accountAdministrationOpen, setAccountAdministrationOpen] = useState(false);
  const [accountAdministrationReturnFocus, setAccountAdministrationReturnFocus] = useState<HTMLElement | null>(null);
  const [announcementRevision, setAnnouncementRevision] = useState(0);
  const dragDepthRef = useRef(0);
  const preservedSelectionRef = useRef<ReadonlySet<string> | null>(null);
  const newFolderTriggerRef = useRef<HTMLButtonElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingInputRefs = useRef(new Map<string, HTMLInputElement>());
  const workspaceRef = useRef<HTMLElement>(null);
  const currentFolderId = path.at(-1)?.id ?? null;

  const favoriteLibraryHoldings = favorites?.libraryHoldings ?? [];
  const visibleSelectableEntries: SelectableEntry[] = view === "library"
    ? [
        ...entries.folders.map((item): SelectableEntry => ({ scope: "account_folder", item })),
        ...entries.files.map((item): SelectableEntry => ({ scope: "account_file", item })),
        ...(path.length === 0 && libraryCatalogue.library
          ? libraryCatalogue.holdings.map((item): SelectableEntry => ({
              scope: "library_holding",
              library: libraryCatalogue.library!,
              item,
            }))
          : []),
      ]
    : view === "favorites" && favorites !== null
      ? [
          ...favorites.folders.map((item): SelectableEntry => ({ scope: "account_folder", item })),
          ...favorites.files.map((item): SelectableEntry => ({ scope: "account_file", item })),
          ...favoriteLibraryHoldings.map(({ library, holding }): SelectableEntry => ({
            scope: "library_holding",
            library,
            item: holding,
          })),
        ]
      : view === "recycle"
        ? [
            ...recycle.folders.map((item): SelectableEntry => ({ scope: "account_folder", item })),
            ...recycle.files.map((item): SelectableEntry => ({ scope: "account_file", item })),
            ...(libraryRecycle.library
              ? libraryRecycle.files.map((item): SelectableEntry => ({
                  scope: "library_recycle_holding",
                  library: libraryRecycle.library!,
                  item,
                }))
              : []),
          ]
        : [];
  const selectedEntries = visibleSelectableEntries.filter((entry) =>
    selectedKeys.has(keyForEntry(entry)));
  const selectionCapabilities = deriveSelectionCapabilities(
    selectedEntries,
    account.role,
    favoriteFileIds,
    favoriteFolderIds,
  );

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const reconcileLibraryCatalogue = useCallback((state: {
    library: LibrarySummary | null;
    holdings: LibraryHolding[];
  }) => setLibraryCatalogue(state), []);
  const recordMetadataActivity = useCallback((
    library: LibrarySummary,
    holding: LibraryHolding,
    job: DerivedMetadataJob,
  ) => {
    setMetadataActivities((current) => [
      { library, holding, job },
      ...current.filter((activity) => activity.job.id !== job.id),
    ]);
  }, []);
  const handleResourceSuggestionJobChange = useCallback((job: DerivedMetadataJob) => {
    if (!resourceDetailsRequest) return;
    recordMetadataActivity(resourceDetailsRequest.library, resourceDetailsRequest.holding, job);
  }, [recordMetadataActivity, resourceDetailsRequest]);

  // Reload-safe Job Core discovery. The existing per-resource endpoint
  // performs the same Library authorization as Resource Details, so the
  // Activity Center never gains a broader cross-account read surface.
  useEffect(() => {
    const library = libraryCatalogue.library;
    if (!library || !api.getLatestLibraryMetadataSuggestionJob) return;
    const controller = new AbortController();
    void Promise.all(libraryCatalogue.holdings.map(async (holding) => {
      try {
        const job = await api.getLatestLibraryMetadataSuggestionJob!(library.id, holding.file.id, controller.signal);
        if (!job) return null;
        const terminalAt = job.finishedAt ? new Date(job.finishedAt).getTime() : 0;
        const recent = terminalAt > 0 && Date.now() - terminalAt <= METADATA_ACTIVITY_RELOAD_WINDOW_MS;
        return job.state === "queued" || job.state === "running" || recent
          ? { library, holding, job }
          : null;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return null;
        // Activity discovery is supplementary. Resource Details remains the
        // explicit error surface for a resource-specific request failure.
        return null;
      }
    })).then((activities) => {
      if (controller.signal.aborted) return;
      const visible = activities.filter((activity): activity is MetadataActivity => activity !== null);
      setMetadataActivities((current) => {
        const discoveredIds = new Set(visible.map((activity) => activity.job.id));
        return [
          ...visible,
          ...current.filter((activity) => !discoveredIds.has(activity.job.id)),
        ];
      });
    });
    return () => controller.abort();
  }, [api, libraryCatalogue]);

  useEffect(() => {
    if (!api.getLibraryMetadataSuggestionJob) return;
    const active = metadataActivities.filter(({ job }) => job.state === "queued" || job.state === "running");
    if (active.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.all(active.map(async (activity) => {
        try {
          const job = await api.getLibraryMetadataSuggestionJob!(
            activity.library.id,
            activity.holding.file.id,
            activity.job.id,
            controller.signal,
          );
          return { ...activity, job };
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") return activity;
          return activity;
        }
      })).then((updates) => {
        if (controller.signal.aborted) return;
        setMetadataActivities((current) => current.map((activity) => (
          updates.find((candidate) => candidate.job.id === activity.job.id) ?? activity
        )));
      });
    }, 2_000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [api, metadataActivities]);

  useEffect(() => {
    const completedIds = jobs.filter((job) => job.phase === "complete").map((job) => job.id);
    if (completedIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setJobs((current) => current.filter((job) => !completedIds.includes(job.id)));
    }, ACTIVITY_SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [jobs]);

  useEffect(() => {
    const terminalIds = metadataActivities
      .filter(({ job }) => job.state === "succeeded")
      .map(({ job }) => job.id);
    if (terminalIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setMetadataActivities((current) => current.filter(({ job }) => !terminalIds.includes(job.id)));
    }, ACTIVITY_SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [metadataActivities]);

  useEffect(() => {
    const startedIds = downloadActivities.filter((activity) => activity.phase === "started").map((activity) => activity.id);
    if (startedIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setDownloadActivities((current) => current.filter((activity) => !startedIds.includes(activity.id)));
    }, ACTIVITY_SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [downloadActivities]);

  useEffect(() => {
    if (preservedSelectionRef.current) {
      setSelectedKeys(preservedSelectionRef.current);
      preservedSelectionRef.current = null;
    } else {
      setSelectedKeys(new Set());
    }
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
        setFavoriteFileIds(new Set([
          ...response.files.map((file) => file.id),
          ...(response.libraryHoldings ?? []).map(({ holding }) => holding.file.id),
        ]));
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

  useEffect(() => {
    if (view !== "recycle") {
      setLibraryRecycle(EMPTY_LIBRARY_RECYCLE);
      setLibraryRecycleLoading(false);
      setLibraryRecycleError(null);
      return;
    }

    const controller = new AbortController();
    setLibraryRecycleLoading(true);
    setLibraryRecycleError(null);

    void (async () => {
      try {
        const libraries = await api.listLibraries(controller.signal);
        const manageable = libraries.filter((library) => library.role === "manager");
        const library = manageable.find((item) => item.isDefault) ?? manageable[0] ?? null;
        if (!library) {
          if (!controller.signal.aborted) setLibraryRecycle(EMPTY_LIBRARY_RECYCLE);
          return;
        }
        const files = await api.listLibraryRecycle(library.id, controller.signal);
        if (!controller.signal.aborted) setLibraryRecycle({ library, files });
      } catch (caught: unknown) {
        if (!(caught instanceof DOMException && caught.name === "AbortError") && !controller.signal.aborted) {
          setLibraryRecycleError(caught);
          setLibraryRecycle(EMPTY_LIBRARY_RECYCLE);
        }
      } finally {
        if (!controller.signal.aborted) setLibraryRecycleLoading(false);
      }
    })();

    return () => controller.abort();
  }, [api, revision, view]);

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

  async function delayForPartRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException("The upload was paused.", "AbortError");
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, milliseconds);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("The upload was paused.", "AbortError"));
      }, { once: true });
    });
  }

  async function runMultipartWorkflow(
    job: UploadJob,
    file: File,
    initialTransfer: MultipartTransfer,
    controller: AbortController,
  ): Promise<void> {
    if (!api.getUploadStatus || !api.authorizeUploadPart || !api.resumeUpload || !api.completeMultipartUpload) {
      throw new Error(t("upload.unavailable"));
    }
    let transfer: MultipartTransfer;
    if (initialTransfer.state === "paused") {
      const resumed = await api.resumeUpload(initialTransfer.file.id, initialTransfer.version);
      // Pause/resume advances the server CAS token; the provider-authoritative
      // completed-part snapshot was reconciled immediately before this call.
      // Preserve it so a version transition never turns valid remote parts
      // back into "missing" work.
      transfer = {
        ...resumed,
        completedParts: initialTransfer.completedParts,
        completedBytes: initialTransfer.completedBytes,
      };
    } else {
      transfer = initialTransfer;
    }
    patchJob(job.id, {
      fileId: transfer.file.id,
      transfer,
      phase: transfer.state === "completing" ? "completing" : "uploading",
      uploaded: false,
      totalBytes: file.size,
      bytesUploaded: transfer.completedBytes,
      progress: file.size > 0 ? Math.min(0.97, transfer.completedBytes / file.size) : 0,
    });
    await rememberSourceHandle(transfer.file.id, job.sourceHandle);

    if (transfer.state !== "completing") {
      const completed = new Set(transfer.completedParts.map((part) => part.partNumber));
      const missing = Array.from({ length: transfer.totalParts }, (_, index) => index + 1)
        .filter((partNumber) => !completed.has(partNumber));
      let nextIndex = 0;
      let completedBytes = transfer.completedBytes;
      const inFlight = new Map<number, number>();
      const reportProgress = () => {
        const loaded = completedBytes + [...inFlight.values()].reduce((sum, value) => sum + value, 0);
        patchJob(job.id, {
          bytesUploaded: Math.min(file.size, loaded),
          progress: file.size > 0 ? Math.min(0.97, loaded / file.size) : 0,
        });
      };
      const uploadOne = async (partNumber: number) => {
        const start = (partNumber - 1) * transfer.partSizeBytes;
        const end = Math.min(file.size, start + transfer.partSizeBytes);
        const blob = file.slice(start, end);
        const contentMd5 = await checksumFile(blob, { signal: controller.signal });
        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt += 1) {
          try {
            const authorization = await api.authorizeUploadPart!(transfer.file.id, partNumber, {
              version: transfer.version,
              sizeBytes: blob.size,
              contentMd5,
            });
            await directPartUpload(authorization, blob, {
              signal: controller.signal,
              onMetrics: ({ loaded }) => {
                inFlight.set(partNumber, loaded);
                reportProgress();
              },
            });
            inFlight.delete(partNumber);
            completedBytes += blob.size;
            reportProgress();
            return;
          } catch (caught: unknown) {
            inFlight.delete(partNumber);
            lastError = caught;
            if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
            if (attempt + 1 < MAX_PART_RETRIES) {
              await delayForPartRetry(250 * (2 ** attempt), controller.signal);
            }
          }
        }
        throw lastError;
      };
      const worker = async () => {
        while (nextIndex < missing.length) {
          const partNumber = missing[nextIndex++]!;
          await uploadOne(partNumber);
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(MAX_CONCURRENT_PARTS, Math.max(1, missing.length)) },
        () => worker(),
      ));
      const reconciled = await api.getUploadStatus(transfer.file.id);
      if (reconciled.kind === "complete") {
        patchJob(job.id, { phase: "complete", progress: 1, uploaded: true, bytesUploaded: file.size });
        await forgetSourceHandle(transfer.file.id);
        setNotice(t("upload.uploaded", { name: file.name }));
        refresh();
        return;
      }
      if (reconciled.kind !== "multipart") throw new Error(t("upload.sameFileMismatch"));
      transfer = reconciled;
      patchJob(job.id, { transfer, phase: "completing", progress: 0.98, bytesUploaded: file.size });
    }

    try {
      await api.completeMultipartUpload(transfer.file.id, transfer.version);
    } catch (caught: unknown) {
      // The provider may have committed every byte while the final HTTP
      // response was lost. Reconcile once before surfacing a recoverable
      // error so the normal path never asks the user to "verify again".
      const recovered = await api.getUploadStatus(transfer.file.id);
      if (recovered.kind !== "complete") throw caught;
    }
    patchJob(job.id, { phase: "complete", progress: 1, uploaded: true, bytesUploaded: file.size });
    await forgetSourceHandle(transfer.file.id);
    setNotice(t("upload.uploaded", { name: file.name }));
    refresh();
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
      if (existing) await rememberSourceHandle(existing.id, job.sourceHandle);

      if (existing?.uploadKind === "multipart") {
        if (!api.getUploadStatus) throw new Error(t("upload.unavailable"));
        const status = await api.getUploadStatus(existing.id);
        if (status.kind === "complete") {
          patchJob(job.id, { phase: "complete", uploaded: true, progress: 1 });
          refresh();
          return;
        }
        if (status.kind !== "multipart") throw new Error(t("upload.sameFileMismatch"));
        await runMultipartWorkflow(job, file, status, controller);
        return;
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
      await rememberSourceHandle(reserved.file.id, job.sourceHandle);
      if ("transfer" in reserved) {
        await runMultipartWorkflow(job, file, reserved.transfer, controller);
        return;
      }
      patchJob(job.id, { fileId: reserved.file.id, phase: "uploading", totalBytes: file.size });
      await directUpload(reserved.upload, file, {
        signal: controller.signal,
        ...attachUploadMetrics(job.id, file.size),
      });
      patchJob(job.id, { phase: "verifying", uploaded: true, progress: 0.92, speedBytesPerSecond: null, etaSeconds: null });
      await api.completeUpload(reserved.file.id);
      patchJob(job.id, { phase: "complete", progress: 1 });
      await forgetSourceHandle(reserved.file.id);
      setNotice(t("upload.uploaded", { name: file.name }));
      refresh();
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        patchJob(job.id, { phase: "paused" });
      } else {
        const message = caught instanceof ApiError && caught.code === "name_conflict"
          ? t("upload.nameConflict", { name: job.file.name })
          : describeError(caught, language);
        patchJob(job.id, { phase: "error", error: message });
        if (job.existing && message === t("upload.sameFileMismatch")) {
          void forgetSourceHandle(job.existing.id);
          setSourceRecoveryFallbacks((current) => ({
            ...current,
            [job.existing!.id]: t("pending.sourceStale"),
          }));
        }
      }
    }
  }

  async function runRetryWorkflow(job: UploadJob, controller: AbortController) {
    const fileId = job.fileId!;
    try {
      if (job.transfer !== null) {
        // Scheduler invariant: multipart retries must claim an ACTIVE phase
        // before the first authoritative status request. Leaving the job in
        // `queued` while that request is pending lets the React pump start the
        // same retry again on every intervening render, multiplying signed
        // part authorizations and direct PUTs for one user action.
        patchJob(job.id, { phase: "reserving" });
        if (!api.getUploadStatus) throw new Error(t("upload.unavailable"));
        const status = await api.getUploadStatus(fileId);
        if (status.kind === "complete") {
          patchJob(job.id, { phase: "complete", uploaded: true, progress: 1 });
          await forgetSourceHandle(fileId);
          refresh();
          return;
        }
        if (status.kind !== "multipart") throw new Error(t("upload.sameFileMismatch"));
        await runMultipartWorkflow(job, job.file, status, controller);
        return;
      }
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
      await forgetSourceHandle(fileId);
      setNotice(t("upload.uploaded", { name: job.file.name }));
      refresh();
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        patchJob(job.id, { phase: "paused" });
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

  function enqueueFile(
    file: File,
    existing?: FileEntry,
    pinnedTargetFolderId?: string | null,
    sourceHandle: RecoverableFileHandle | null = null,
  ) {
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
      transfer: null,
      error: null,
      controller: new AbortController(),
      bytesUploaded: 0,
      totalBytes: file.size,
      speedBytesPerSecond: null,
      etaSeconds: null,
      sourceHandle,
    };
    setJobs((current) => [job, ...current.filter((item) => item.fileId !== existing?.id)]);
    setError(null);
  }

  async function chooseFreshFiles() {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      setUploadPickerFallbackAvailable(false);
      uploadInputRef.current?.click();
      return;
    }
    setUploadPickerFallbackAvailable(true);
    try {
      const handles = await picker({ multiple: true });
      setUploadPickerFallbackAvailable(false);
      for (const handle of handles) {
        const file = await handle.getFile();
        enqueueFile(file, undefined, undefined, handle);
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
    }
  }

  async function chooseOriginalForPending(file: FileEntry) {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      pendingInputRefs.current.get(file.id)?.click();
      return;
    }
    try {
      const [handle] = await picker({ multiple: false });
      if (!handle) return;
      const selected = await handle.getFile();
      setSourceRecoveryFallbacks((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });
      enqueueFile(selected, file, undefined, handle);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setSourceRecoveryFallbacks((current) => ({ ...current, [file.id]: t("pending.sourceUnavailable") }));
      }
    }
  }

  async function resumePendingSource(file: FileEntry) {
    const sameSessionJob = jobs.find((job) => job.fileId === file.id);
    if (sameSessionJob) {
      if (sameSessionJob.phase === "paused" || sameSessionJob.phase === "resumable" || sameSessionJob.phase === "error") {
        retryJob(sameSessionJob);
      }
      return;
    }
    setRecoveringSourceId(file.id);
    setSourceRecoveryFallbacks((current) => {
      const next = { ...current };
      delete next[file.id];
      return next;
    });
    try {
      const recovered = await recoverRememberedSource(file.id);
      if (recovered.status === "available") {
        enqueueFile(recovered.file, file, undefined, recovered.handle);
        return;
      }
      const message = recovered.reason === "permission"
        ? t("pending.sourcePermissionLost")
        : recovered.reason === "stale"
          ? t("pending.sourceStale")
          : t("pending.sourceUnavailable");
      setSourceRecoveryFallbacks((current) => ({ ...current, [file.id]: message }));
    } finally {
      setRecoveringSourceId(null);
    }
  }

  function pauseJob(jobId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    if (job.phase === "queued") {
      patchJob(jobId, { phase: "paused" });
    } else {
      patchJob(jobId, { phase: "paused" });
      job.controller.abort();
      if (job.fileId && job.transfer && api.pauseUpload) {
        void api.pauseUpload(job.fileId, job.transfer.version).then(
          (transfer) => patchJob(jobId, { transfer, phase: "paused" }),
          (caught: unknown) => patchJob(jobId, { phase: "error", error: describeError(caught, language) }),
        );
      }
    }
  }

  async function abandonJob(job: UploadJob) {
    if (!window.confirm(t("upload.abandonConfirm", { name: job.file.name }))) return;
    job.controller.abort();
    try {
      if (!job.fileId) throw new Error(t("upload.abandonUnavailable"));
      const uploadKind = job.existing?.uploadKind ?? (job.transfer ? "multipart" : undefined);
      if (uploadKind === "multipart") {
        if (!api.abandonMultipartUpload) throw new Error(t("upload.abandonUnavailable"));
        let transfer = job.transfer;
        if (!transfer) {
          if (!api.getUploadStatus) throw new Error(t("upload.abandonUnavailable"));
          const status = await api.getUploadStatus(job.fileId);
          if (status.kind !== "multipart") throw new Error(t("upload.abandonUnavailable"));
          transfer = status;
          patchJob(job.id, { transfer });
        }
        await api.abandonMultipartUpload(job.fileId, transfer.version);
      } else if (uploadKind === "legacy") {
        if (!api.abandonLegacyUpload) throw new Error(t("upload.abandonUnavailable"));
        await api.abandonLegacyUpload(job.fileId);
      } else {
        throw new Error(t("upload.abandonUnavailable"));
      }
      patchJob(job.id, { phase: "abandoned" });
      await forgetSourceHandle(job.fileId);
      setJobs((current) => current.filter((item) => item.id !== job.id));
      refresh();
    } catch (caught: unknown) {
      patchJob(job.id, { phase: "error", error: describeError(caught, language) });
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
      progress: job.transfer ? job.progress : 0,
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

  function toggleSelection(entry: SelectableEntry): void {
    const key = keyForEntry(entry);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (next.size < 100) next.add(key);
      return next;
    });
  }

  async function runBulk(action: BulkAction, destinationFolderId?: string | null): Promise<void> {
    if (selectedEntries.length === 0) return;
    const accountEntries = selectedEntries.filter(isAccountEntry);
    if (accountEntries.length !== selectedEntries.length) throw new Error("account bulk received a Library resource");
    setBusyId("bulk");
    setError(null);
    setNotice("");
    try {
      await api.bulkOperation({
        action,
        items: accountEntries.map(toBulkItem),
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

  function refreshPreservingSelection(keys: ReadonlySet<string>): void {
    preservedSelectionRef.current = keys;
    refresh();
  }

  async function runFavoriteSelection(favorite: boolean): Promise<void> {
    if (selectedEntries.length === 0) return;
    setBusyId("bulk");
    setError(null);
    setNotice("");
    try {
      for (const entry of selectedEntries) {
        if (entry.scope === "account_folder") {
          const active = favoriteFolderIds.has(entry.item.id);
          if (active !== favorite) await api.setFolderFavorite(entry.item.id, favorite);
        } else if (entry.scope === "account_file") {
          const active = favoriteFileIds.has(entry.item.id);
          if (active !== favorite) await api.setFileFavorite(entry.item.id, favorite);
        } else if (entry.scope === "library_holding") {
          const active = favoriteFileIds.has(entry.item.file.id);
          if (active !== favorite) await api.setFileFavorite(entry.item.file.id, favorite);
        }
      }
      setSelectedKeys(new Set());
      setNotice(t("bulk.completed", { count: selectedEntries.length }));
      refresh();
    } catch (caught: unknown) {
      setError(caught);
      refreshPreservingSelection(new Set(selectedEntries.map(keyForEntry)));
    } finally {
      setBusyId(null);
    }
  }

  async function recycleSelected(): Promise<void> {
    if (!selectionCapabilities.recycle || selectedEntries.length === 0) return;
    if (!window.confirm(t("bulk.recycleConfirm", { count: selectedEntries.length }))) return;
    const accountEntries = selectedEntries.filter(isAccountEntry);
    if (accountEntries.length === selectedEntries.length) {
      if (accountEntries.length === 1 && accountEntries[0]?.scope === "account_folder") {
        await runAction(accountEntries[0].item.id, t("folder.moved"), () => api.deleteFolder(accountEntries[0]!.item.id));
        return;
      }
      await runBulk("recycle");
      return;
    }

    setBusyId("bulk");
    setError(null);
    setNotice("");
    const completed = new Set<string>();
    try {
      for (const entry of selectedEntries) {
        if (entry.scope !== "library_holding") throw new Error("mixed recycle selection is not supported");
        await api.recycleLibraryHolding(entry.library.id, entry.item.file.id, entry.item.version);
        completed.add(keyForEntry(entry));
      }
      setSelectedKeys(new Set());
      setNotice(t("bulk.completed", { count: completed.size }));
      refresh();
    } catch (caught: unknown) {
      setError(caught);
      setNotice(t("bulk.partialCompleted", { completed: completed.size, total: selectedEntries.length }));
      refreshPreservingSelection(new Set(selectedEntries.map(keyForEntry).filter((key) => !completed.has(key))));
    } finally {
      setBusyId(null);
    }
  }

  async function restoreSelectedRecycle(): Promise<void> {
    if (!selectionCapabilities.restore || selectedEntries.length === 0) return;
    if (selectedEntries.every(isAccountEntry)) {
      await runBulk("restore");
      return;
    }
    setBusyId("bulk");
    setError(null);
    setNotice("");
    const completed = new Set<string>();
    try {
      for (const entry of selectedEntries) {
        if (entry.scope === "account_folder") await api.restoreFolder(entry.item.id);
        else if (entry.scope === "account_file") await api.restoreFile(entry.item.id);
        else if (entry.scope === "library_recycle_holding") {
          await api.restoreLibraryHolding(entry.library.id, entry.item.file.id, entry.item.version);
        }
        completed.add(keyForEntry(entry));
      }
      setSelectedKeys(new Set());
      setNotice(t("bulk.completed", { count: completed.size }));
      refresh();
    } catch (caught: unknown) {
      setError(caught);
      setNotice(t("bulk.partialCompleted", { completed: completed.size, total: selectedEntries.length }));
      refreshPreservingSelection(new Set(selectedEntries.map(keyForEntry).filter((key) => !completed.has(key))));
    } finally {
      setBusyId(null);
    }
  }

  async function permanentlyDeleteSelectedRecycle(): Promise<void> {
    if (!selectionCapabilities.permanentDelete || selectedEntries.length === 0) return;
    if (!window.confirm(t("bulk.permanentConfirm", { count: selectedEntries.length }))) return;
    setBusyId("bulk");
    setError(null);
    setNotice("");
    const completed = new Set<string>();
    try {
      for (const entry of selectedEntries) {
        if (entry.scope === "account_folder") {
          await api.permanentlyDeleteFolder(entry.item.id, entry.item.version);
        } else if (entry.scope === "account_file") {
          await api.permanentlyDeleteFile(entry.item.id, entry.item.version);
        } else if (entry.scope === "library_recycle_holding") {
          await api.permanentlyDeleteLibraryHolding(entry.library.id, entry.item.file.id, entry.item.version);
        } else {
          throw new Error("active Library holding cannot be permanently deleted");
        }
        completed.add(keyForEntry(entry));
      }
      setSelectedKeys(new Set());
      setNotice(t("bulk.permanentCompleted", { count: completed.size }));
      refresh();
    } catch (caught: unknown) {
      setError(caught);
      setNotice(t("bulk.permanentPartial", { completed: completed.size, total: selectedEntries.length }));
      refreshPreservingSelection(new Set(selectedEntries.map(keyForEntry).filter((key) => !completed.has(key))));
    } finally {
      setBusyId(null);
    }
  }

  function goToView(next: DriveViewName) {
    if (next === "recycle" && view !== "recycle") {
      setLoading(true);
      setLibraryRecycleLoading(true);
    }
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

  async function toggleFileFavorite(file: Pick<FileEntry, "id">) {
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

  async function reconcileFolderConflict(): Promise<void> {
    if (view === "favorites") {
      const response = await api.listFavorites();
      setFavorites(response);
      setFavoriteFileIds(new Set([
        ...response.files.map((file) => file.id),
        ...(response.libraryHoldings ?? []).map(({ holding }) => holding.file.id),
      ]));
      setFavoriteFolderIds(new Set(response.folders.map((folder) => folder.id)));
      return;
    }
    const response = await api.listEntries(currentFolderId);
    setEntries(response);
  }

  function deleteFolder(folder: FolderEntry) {
    if (!window.confirm(t("folder.moveConfirm", { name: folder.name }))) return;
    void (async () => {
      setBusyId(folder.id);
      setError(null);
      setNotice("");
      try {
        await api.deleteFolder(folder.id);
        setNotice(t("folder.moved"));
        refresh();
      } catch (caught: unknown) {
        if (caught instanceof ApiError && (caught.code === "invalid_state" || caught.code === "concurrent_change")) {
          try {
            await reconcileFolderConflict();
            setNotice(t("folder.conflictRefreshed"));
          } catch (refreshError: unknown) {
            setError(refreshError);
          }
        } else {
          setError(caught);
        }
      } finally {
        setBusyId(null);
      }
    })();
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

  async function performDownload(
    fileId: string,
    name: string,
    authorize: () => Promise<{ url: string }>,
  ) {
    const activityId = `${fileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDownloadActivities((current) => [
      { id: activityId, name, phase: "preparing", error: null },
      ...current,
    ]);
    setBusyId(`download-${fileId}`);
    setError(null);
    setNotice("");
    try {
      const authorization = await authorize();
      const anchor = document.createElement("a");
      anchor.href = authorization.url;
      anchor.download = name;
      anchor.rel = "noopener noreferrer";
      anchor.click();
      setDownloadActivities((current) => current.map((activity) => activity.id === activityId
        ? { ...activity, phase: "started" }
        : activity));
      setNotice(t("file.downloadOpened"));
    } catch (caught) {
      const message = describeError(caught, language);
      setDownloadActivities((current) => current.map((activity) => activity.id === activityId
        ? { ...activity, phase: "failed", error: message }
        : activity));
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function downloadFile(file: FileEntry) {
    await performDownload(file.id, file.displayName, () => api.createDownload(file.id));
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
        download: () => downloadFile(file),
      });
    } catch (caught: unknown) {
      // preview_unavailable renders the localized fail-safe message; the
      // Preview button never silently triggers a download.
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function downloadLibraryHolding(library: LibrarySummary, holding: LibraryHolding) {
    await performDownload(
      holding.file.id,
      libraryHoldingDisplayTitle(holding, language),
      () => api.createLibraryDownload(library.id, holding.file.id),
    );
  }

  async function openLibraryPreview(
    library: LibrarySummary,
    holding: LibraryHolding,
    returnFocus?: HTMLElement | null,
  ) {
    const fallbackFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusyId(`preview-${holding.file.id}`);
    setError(null);
    try {
      const authorization = await api.createLibraryDownload(library.id, holding.file.id, "inline");
      setPreview({
        file: {
          displayName: libraryHoldingDisplayTitle(holding, language),
          mediaType: holding.file.mediaType ?? "application/octet-stream",
        },
        url: authorization.url,
        returnFocus: returnFocus ?? fallbackFocus,
        download: () => downloadLibraryHolding(library, holding),
      });
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  function openResourceDetails(library: LibrarySummary, holding: LibraryHolding, returnFocus?: HTMLElement | null) {
    setResourceDetailsRequest({
      library,
      holding,
      returnFocus: returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    });
  }

  function recycleLibraryHolding(library: LibrarySummary, holding: LibraryHolding) {
    const displayTitle = libraryHoldingDisplayTitle(holding, language);
    if (!window.confirm(t("file.recycleConfirm", { name: displayTitle }))) return;
    void (async () => {
      setBusyId(holding.file.id);
      setError(null);
      setNotice("");
      try {
        await api.recycleLibraryHolding(library.id, holding.file.id, holding.version);
        setNotice(t("file.recycled"));
        refresh();
      } catch (caught: unknown) {
        setError(caught);
        if (caught instanceof ApiError && (caught.code === "concurrent_change" || caught.code === "invalid_state")) {
          setNotice(t("file.conflictRefreshed"));
          refresh();
        }
      } finally {
        setBusyId(null);
      }
    })();
  }

  function restoreRecycledLibraryHolding(library: LibrarySummary, entry: LibraryRecycleFile) {
    const actionId = `library-restore:${entry.file.id}`;
    void (async () => {
      setBusyId(actionId);
      setError(null);
      setNotice("");
      try {
        await api.restoreLibraryHolding(library.id, entry.file.id, entry.version);
        setNotice(t("file.restored"));
        refresh();
      } catch (caught: unknown) {
        setError(caught);
        if (caught instanceof ApiError && (caught.code === "concurrent_change" || caught.code === "invalid_state")) {
          setNotice(t("file.conflictRefreshed"));
          refresh();
        }
      } finally {
        setBusyId(null);
      }
    })();
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

  async function onWorkspaceDrop(event: React.DragEvent<HTMLElement>) {
    if (!hasFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDropOverlay(null);
    const dataTransfer = event.dataTransfer;
    // Snapshot the destination EXACTLY once: later navigation must never
    // redirect these uploads.
    const pinnedFolderId = currentFolderId;
    const sources = await regularFileSourcesFrom(dataTransfer);
    const files = sources.map(({ file }) => file);
    const directoryCount = countDirectoryItems(dataTransfer);
    const validFiles = files.filter((file) => file.size >= 1);
    if (validFiles.length > 0) {
      for (const { file, handle } of sources) {
        if (file.size >= 1) enqueueFile(file, undefined, pinnedFolderId, handle);
      }
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

  const activityJobs = jobs.filter((job) => job.phase !== "abandoned");
  const activityCount = activityJobs.length + metadataActivities.length + downloadActivities.length;
  const activityFailureCount = activityJobs.filter((job) => job.phase === "error").length
    + metadataActivities.filter((activity) => activity.job.state === "failed").length
    + downloadActivities.filter((activity) => activity.phase === "failed").length;
  const isLibraryEmpty = entries.folders.length === 0 && entries.files.length === 0;
  const workspaceTitle = view === "library"
    ? path.at(-1)?.name ?? t("nav.library")
    : view === "pending"
      ? t("nav.pending")
      : view === "recycle"
      ? t("nav.recycle")
      : view === "favorites"
        ? t("nav.favorites")
        : t("nav.library");
  const recycleLoading = loading || libraryRecycleLoading;
  const recycleCount = recycle.folders.length + recycle.files.length + libraryRecycle.files.length;
  const recycleLibrary = libraryRecycle.library;

  return (
    <>
    <div className="app-shell" inert={preview !== null || resourceDetailsRequest !== null || citationRequest !== null || batchNamingRequest !== null || moveRequest !== null || accountAdministrationOpen}>
      <a className="skip-link" href="#main-content">{t("nav.skip")}</a>
      <header className="topbar">
        <div className="brand"><span>AC</span> AcademicCloud</div>
        <div className="account-menu">
          <AccountMenu
            accountName={account.loginName}
            owner={account.role === "owner"}
            busy={busyId === "logout"}
            onManage={(returnFocus) => {
              setAccountAdministrationReturnFocus(returnFocus);
              setAccountAdministrationOpen(true);
            }}
            onSignOut={() => void signOut()}
          />
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
          <div className={`workspace-title${view === "library" && path.length === 0 ? " workspace-title--catalogue" : ""}`}>
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
            {view === "library" && path.length === 0 && libraryCatalogue.holdings.length > 0 && (
              <p className="workspace-summary">{t("library.loadedCount", { count: libraryCatalogue.holdings.length })}</p>
            )}
            {view === "library" && path.length > 0 && !loading && (
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
                  files: formatCount(language, favorites.files.length + favoriteLibraryHoldings.length),
                  folders: formatCount(language, favorites.folders.length),
                })}
              </p>
            )}
          </div>
          {view === "library" && (
            <div className="command-bar">
              {account.role === "owner" && <button className="button button--quiet" type="button" onClick={openNewFolderDialog}>
                {t("workspace.newFolder")}
              </button>}
              <button className="button button--primary upload-button" type="button" onClick={() => void chooseFreshFiles()}>
                {t("workspace.uploadResources")}
              </button>
              {uploadPickerFallbackAvailable && (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => {
                    setUploadPickerFallbackAvailable(false);
                    uploadInputRef.current?.click();
                  }}
                >
                  {t("workspace.uploadFallback")}
                </button>
              )}
              <input
                ref={uploadInputRef}
                className="visually-hidden"
                type="file"
                multiple
                aria-label={t("workspace.uploadFiles")}
                onChange={(event) => {
                  setUploadPickerFallbackAvailable(false);
                  for (const file of Array.from(event.target.files ?? [])) enqueueFile(file);
                  event.target.value = "";
                }}
              />
            </div>
          )}
        </header>

        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)} <button type="button" onClick={() => setError(null)}>{t("alert.dismiss")}</button></div>}
        {notice && <div className="alert alert--success" role="status">{notice}</div>}

        {view === "library" && path.length === 0 && (
          <>
            <AnnouncementFeed api={api} revision={announcementRevision} />
            <SharedLibraryPanel
              api={api}
              revision={revision}
              onCatalogueChange={reconcileLibraryCatalogue}
              renderCatalogue={({ library, holdings, loading: holdingsLoading, nextCursor, loadingMore, sort, onSortChange, onLoadMore }) => {
                const rootFolders = account.role === "owner" ? entries.folders : [];
                const rootFiles = account.role === "owner" ? entries.files : [];
                const catalogueLoading = loading || holdingsLoading;
                const catalogueEmpty = rootFolders.length + rootFiles.length + holdings.length === 0;
                const allSelectedAreHoldings = selectedEntries.length > 0
                  && selectedEntries.every((entry) => entry.scope === "library_holding")
                  && new Set(selectedEntries.map((entry) => entry.scope === "library_holding" ? entry.library.id : "")).size === 1;
                const batchNamingAvailable = allSelectedAreHoldings
                  && library !== null
                  && library.role === "manager"
                  && api.previewLibraryBatchNaming !== undefined
                  && api.applyLibraryBatchNaming !== undefined;
                return (
                  <section aria-labelledby="contents-title">
                    <h2 id="contents-title" className="visually-hidden">{t("folder.contentsTitle")}</h2>
                    {library && (
                      <LibrarySearchField
                        api={api}
                        library={library}
                        language={language}
                        t={t}
                        sort={sort}
                        onSortChange={onSortChange}
                        onActiveChange={setLibrarySearchActive}
                        onOpenResult={(result) => openResourceDetails(library, librarySearchResultToHolding(result))}
                      />
                    )}
                    {!librarySearchActive && selectedEntries.length > 0 && (
                      <BulkToolbar
                        mode="library"
                        selectedCount={selectedEntries.length}
                        busy={busyId === "bulk"}
                        onClear={() => setSelectedKeys(new Set())}
                        {...(selectionCapabilities.move ? { onMove: (trigger: HTMLElement) => setMoveRequest({
                          kind: "bulk",
                          items: selectedEntries.filter(isAccountEntry),
                          returnFocus: trigger,
                        }) } : {})}
                        {...(selectionCapabilities.recycle ? { onRecycle: () => void recycleSelected().catch(() => undefined) } : {})}
                        {...(selectionCapabilities.favoriteAdd ? { onFavoriteAdd: () => void runFavoriteSelection(true) } : {})}
                        {...(selectionCapabilities.favoriteRemove ? { onFavoriteRemove: () => void runFavoriteSelection(false) } : {})}
                        {...(batchNamingAvailable ? { onBatchName: () => setBatchNamingRequest({
                          library: library!,
                          holdings: selectedEntries.map((entry) => (entry.scope === "library_holding" ? entry.item : entry.item)),
                        }) } : {})}
                      />
                    )}
                    {librarySearchActive ? null : catalogueLoading ? <LoadingRows /> : !library ? (
                      <EmptyState title={t("sharedLibrary.empty")} />
                    ) : catalogueEmpty ? (
                      <EmptyState title={t("folder.emptyTitle")} />
                    ) : (
                      <EntryTable
                        folders={rootFolders}
                        files={rootFiles}
                        libraryHoldings={holdings.map((holding) => ({ library, holding }))}
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
                        onPreviewHolding={(holdingLibrary, holding, trigger) => void openLibraryPreview(holdingLibrary, holding, trigger)}
                        onOpenHoldingDetails={(holdingLibrary, holding, trigger) => openResourceDetails(holdingLibrary, holding, trigger)}
                        onDownloadHolding={(holdingLibrary, holding) => void downloadLibraryHolding(holdingLibrary, holding)}
                        {...(account.role === "owner" ? {
                          onRecycleHolding: (holdingLibrary: LibrarySummary, holding: LibraryHolding) => recycleLibraryHolding(holdingLibrary, holding),
                        } : {})}
                        starFileIds={favoriteFileIds}
                        starFolderIds={favoriteFolderIds}
                        onToggleFileFavorite={(file) => void toggleFileFavorite(file)}
                        onToggleFolderFavorite={(folder) => void toggleFolderFavorite(folder)}
                        selectedKeys={selectedKeys}
                        onToggleSelected={toggleSelection}
                        selectionDisabled={busyId === "bulk"}
                      />
                    )}
                    {!librarySearchActive && nextCursor && (
                      <div className="library-load-more">
                        <button className="button button--quiet" type="button" disabled={loadingMore} onClick={onLoadMore}>
                          {loadingMore ? t("library.loadingMore") : t("library.loadMore")}
                        </button>
                      </div>
                    )}
                  </section>
                );
              }}
            />
          </>
        )}

        {activityCount > 0 && (
          <section className={`activity-center${activityExpanded ? " is-expanded" : " is-collapsed"}`} aria-labelledby="activity-center-title" aria-live="polite">
            <div className="activity-center-heading">
              <div><h2 id="activity-center-title">{t("activity.title")}</h2><span>{t("activity.summary", { count: activityCount })}</span>{activityFailureCount > 0 && <span className="activity-failed-summary">{t("activity.failedSummary", { count: activityFailureCount })}</span>}</div>
              <button
                className="button button--small button--quiet activity-toggle"
                type="button"
                aria-expanded={activityExpanded}
                aria-controls="activity-center-entries"
                onClick={() => setActivityExpanded((current) => {
                  const next = !current;
                  writeActivityExpanded(account.id, next);
                  return next;
                })}
              >{activityExpanded ? t("activity.collapse") : t("activity.expand")}</button>
              {activityJobs.length > 0 && <span className="visually-hidden">{t("upload.queueSummary", { count: activityJobs.length })}</span>}
            </div>
            {activityExpanded && <div id="activity-center-entries" className="activity-center-entries">
            {activityJobs.map((job) => (
              <div className="activity-item upload-job" key={job.id}>
                <div>
                  <strong>{job.file.name}</strong>
                  <span><span>{t("activity.upload")}</span><span aria-hidden="true"> · </span><span>{t(uploadPhaseKey(job.phase))}</span></span>
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
                {job.phase === "complete" ? (
                  <div className="job-actions">
                    <button className="button button--small button--quiet" type="button" aria-label={t("upload.dismissAria", { name: job.file.name })} onClick={() => setJobs((current) => current.filter((item) => item.id !== job.id))}>{t("alert.dismiss")}</button>
                  </div>
                ) : job.phase === "error" || job.phase === "paused" || job.phase === "resumable" ? (
                  <div className="job-error">
                    {job.phase === "error" && <span role="alert">{job.error}</span>}
                    <button className="button button--small" type="button" aria-label={t("upload.continueAria", { name: job.file.name })} onClick={() => void retryJob(job)}>{t("upload.continue")}</button>
                    <button className="button button--small button--danger" type="button" aria-label={t("upload.abandonAria", { name: job.file.name })} onClick={() => void abandonJob(job)}>{t("upload.abandon")}</button>
                    <button className="button button--small button--quiet" type="button" aria-label={t("upload.dismissAria", { name: job.file.name })} onClick={() => setJobs((current) => current.filter((item) => item.id !== job.id))}>{t("alert.dismiss")}</button>
                  </div>
                ) : (
                  <div className="job-actions">
                    <button className="button button--small button--quiet" type="button" aria-label={t("upload.pauseAria", { name: job.file.name })} onClick={() => pauseJob(job.id)}>{t("upload.pause")}</button>
                    <button className="button button--small button--danger" type="button" aria-label={t("upload.abandonAria", { name: job.file.name })} onClick={() => void abandonJob(job)}>{t("upload.abandon")}</button>
                  </div>
                )}
              </div>
            ))}
            {metadataActivities.map((activity) => (
              <div className="activity-item activity-item--compact" key={activity.job.id}>
                <div className="activity-copy">
                  <strong>{libraryHoldingDisplayTitle(activity.holding, language)}</strong>
                  <span><span>{t("activity.metadata")}</span><span aria-hidden="true"> · </span><span>{t(metadataActivityStateKey(activity.job.state))}</span></span>
                </div>
                <div className="job-actions">
                  <button className="button button--small button--quiet" type="button" onClick={() => openResourceDetails(activity.library, activity.holding)}>{t("activity.review")}</button>
                  {(activity.job.state === "succeeded" || activity.job.state === "failed") && (
                    <button className="button button--small button--quiet" type="button" onClick={() => setMetadataActivities((current) => current.filter(({ job }) => job.id !== activity.job.id))}>{t("alert.dismiss")}</button>
                  )}
                </div>
              </div>
            ))}
            {downloadActivities.map((activity) => (
              <div className="activity-item activity-item--compact" key={activity.id}>
                <div className="activity-copy">
                  <strong>{activity.name}</strong>
                  <span><span>{t("activity.download")}</span><span aria-hidden="true"> · </span><span>{t(downloadActivityStateKey(activity.phase))}</span></span>
                  {activity.error && <span className="activity-error" role="alert">{activity.error}</span>}
                </div>
                {activity.phase === "failed" && (
                  <div className="job-actions">
                    <button className="button button--small button--quiet" type="button" onClick={() => setDownloadActivities((current) => current.filter((item) => item.id !== activity.id))}>{t("alert.dismiss")}</button>
                  </div>
                )}
              </div>
            ))}
            </div>}
          </section>
        )}

        {view === "library" && account.role === "owner" && path.length > 0 && (
          <section aria-labelledby="contents-title">
            <h2 id="contents-title" className="visually-hidden">{t("folder.contentsTitle")}</h2>
            {selectedEntries.length > 0 && (
              <BulkToolbar
                mode="library"
                selectedCount={selectedEntries.length}
                busy={busyId === "bulk"}
                onClear={() => setSelectedKeys(new Set())}
                {...(selectionCapabilities.move ? { onMove: (trigger: HTMLElement) => setMoveRequest({ kind: "bulk", items: selectedEntries.filter(isAccountEntry), returnFocus: trigger }) } : {})}
                {...(selectionCapabilities.recycle ? { onRecycle: () => void recycleSelected().catch(() => undefined) } : {})}
                {...(selectionCapabilities.favoriteAdd ? { onFavoriteAdd: () => void runFavoriteSelection(true) } : {})}
                {...(selectionCapabilities.favoriteRemove ? { onFavoriteRemove: () => void runFavoriteSelection(false) } : {})}
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
                {pending.map((file) => {
                  const sameSessionJob = jobs.find((job) => job.fileId === file.id);
                  const fallback = sourceRecoveryFallbacks[file.id];
                  const sameSessionActive = sameSessionJob && !["paused", "resumable", "error"].includes(sameSessionJob.phase);
                  return <article className="pending-card" key={file.id}>
                    <FileBadge file={file} />
                    <div className="entry-primary">
                      <strong>{file.displayName}</strong>
                      <span>{formatBytes(file.sizeBytes)} · {sameSessionActive ? t("pending.inActivity") : t("pending.readyToContinue")}</span>
                      {fallback && <span className="pending-source-fallback" role="alert">{fallback}</span>}
                    </div>
                    {!sameSessionActive && !fallback && (
                      <button className="button button--small" type="button" disabled={recoveringSourceId === file.id} onClick={() => void resumePendingSource(file)}>
                        {recoveringSourceId === file.id ? t("pending.recoveringSource") : t("upload.continue")}
                      </button>
                    )}
                    {fallback && (
                      <button className="button button--small" type="button" aria-label={t("pending.chooseOriginalAria", { name: file.displayName })} onClick={() => void chooseOriginalForPending(file)}>
                        {t("pending.chooseOriginal")}
                      </button>
                    )}
                    <input
                      ref={(element) => {
                        if (element) pendingInputRefs.current.set(file.id, element);
                        else pendingInputRefs.current.delete(file.id);
                      }}
                      className="visually-hidden"
                      type="file"
                      aria-label={t("pending.chooseOriginalAria", { name: file.displayName })}
                      onChange={(event) => {
                        const selected = event.target.files?.[0];
                        if (selected) {
                          setSourceRecoveryFallbacks((current) => {
                            const next = { ...current };
                            delete next[file.id];
                            return next;
                          });
                          enqueueFile(selected, file);
                        }
                        event.target.value = "";
                      }}
                    />
                    {!fallback && <span className="visually-hidden">{t("pending.chooseOriginal")}</span>}
                    <button className="button button--small button--danger" type="button" aria-label={t("upload.abandonAria", { name: file.displayName })} onClick={() => {
                      if (!window.confirm(t("upload.abandonConfirm", { name: file.displayName }))) return;
                      void runAction(file.id, t("upload.abandoned"), async () => {
                        if (file.uploadKind === "multipart") {
                          const status = await api.getUploadStatus?.(file.id);
                          if (!status || status.kind !== "multipart" || !api.abandonMultipartUpload) throw new Error(t("upload.abandonUnavailable"));
                          await api.abandonMultipartUpload(file.id, status.version);
                        } else {
                          if (!api.abandonLegacyUpload) throw new Error(t("upload.abandonUnavailable"));
                          await api.abandonLegacyUpload(file.id);
                        }
                        await forgetSourceHandle(file.id);
                      });
                    }}>{t("upload.abandon")}</button>
                  </article>;
                })}
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
                {...(selectionCapabilities.move ? { onMove: (trigger: HTMLElement) => setMoveRequest({ kind: "bulk", items: selectedEntries.filter(isAccountEntry), returnFocus: trigger }) } : {})}
                {...(selectionCapabilities.recycle ? { onRecycle: () => void recycleSelected().catch(() => undefined) } : {})}
                {...(selectionCapabilities.favoriteAdd ? { onFavoriteAdd: () => void runFavoriteSelection(true) } : {})}
                {...(selectionCapabilities.favoriteRemove ? { onFavoriteRemove: () => void runFavoriteSelection(false) } : {})}
              />
            )}
            {favoritesError !== null ? (
              <div className="alert alert--error" role="alert">
                {describeError(favoritesError, language)}
                <button type="button" onClick={refresh}>{t("pending.refresh")}</button>
              </div>
            ) : favorites === null ? <LoadingRows /> : favorites.files.length + favorites.folders.length + favoriteLibraryHoldings.length === 0 ? (
              <EmptyState title={t("favorites.emptyTitle")} />
            ) : (
              <EntryTable
                folders={favorites.folders}
                files={favorites.files}
                libraryHoldings={favoriteLibraryHoldings}
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
                onPreviewHolding={(library, holding, trigger) => void openLibraryPreview(library, holding, trigger)}
                onOpenHoldingDetails={(library, holding, trigger) => openResourceDetails(library, holding, trigger)}
                onDownloadHolding={(library, holding) => void downloadLibraryHolding(library, holding)}
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
          <section aria-labelledby="recycle-title">
            <div className="section-heading"><h2 id="recycle-title">{t("recycle.title")}</h2>{!recycleLoading && <span>{t("folder.items", { count: formatCount(language, recycleCount) })}</span>}</div>
            {libraryRecycleError !== null && <div className="alert alert--error" role="alert">{describeError(libraryRecycleError, language)} <button type="button" onClick={() => setLibraryRecycleError(null)}>{t("alert.dismiss")}</button></div>}
            {selectedEntries.length > 0 && (
              <BulkToolbar
                mode="recycle"
                selectedCount={selectedEntries.length}
                busy={busyId === "bulk"}
                onClear={() => setSelectedKeys(new Set())}
                {...(selectionCapabilities.restore ? { onRestore: () => void restoreSelectedRecycle().catch(() => undefined) } : {})}
                {...(selectionCapabilities.permanentDelete ? { onPermanentDelete: () => void permanentlyDeleteSelectedRecycle() } : {})}
              />
            )}
            {recycleLoading ? <LoadingRows /> : recycleCount === 0 && libraryRecycleError === null ? (
              <EmptyState title={t("recycle.emptyTitle")} />
            ) : recycleCount > 0 ? (
              <div className="card-list">
                {recycle.folders.map((folder) => (
                  <article className={selectedKeys.has(selectionKey("account_folder", folder.id)) ? "recycle-card is-selected" : "recycle-card"} key={folder.id}>
                    <label className="entry-select-control">
                      <input
                        className="entry-select"
                        type="checkbox"
                        aria-label={t("bulk.selectAria", { name: folder.name })}
                        checked={selectedKeys.has(selectionKey("account_folder", folder.id))}
                        disabled={busyId === "bulk" || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("account_folder", folder.id)))}
                        onChange={() => toggleSelection({ scope: "account_folder", item: folder })}
                      />
                      <span className="entry-select-box" aria-hidden="true" />
                    </label>
                    <FolderBadge />
                    <div className="entry-primary"><strong>{folder.name}</strong><span>{t("recycle.folderDeleted", { date: formatDate(folder.deletedAt, language) })}</span></div>
                    <button className="button button--small" type="button" aria-label={t("recycle.restoreFolderAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => void runAction(folder.id, t("recycle.folderRestored"), () => api.restoreFolder(folder.id))}>{t("recycle.restore")}</button>
                    {account.role === "owner" && <button className="button button--small button--danger" type="button" aria-label={t("recycle.deleteForeverAria", { name: folder.name })} disabled={busyId === folder.id} onClick={() => {
                      if (window.confirm(t("folder.permanentConfirm", { name: folder.name }))) {
                        void runAction(folder.id, t("folder.permanentDeleted"), () => api.permanentlyDeleteFolder(folder.id, folder.version));
                      }
                    }}>{t("recycle.deleteForever")}</button>}
                  </article>
                ))}
                {recycle.files.map((file) => (
                  <article className={selectedKeys.has(selectionKey("account_file", file.id)) ? "recycle-card is-selected" : "recycle-card"} key={file.id}>
                    <label className="entry-select-control">
                      <input
                        className="entry-select"
                        type="checkbox"
                        aria-label={t("bulk.selectAria", { name: file.displayName })}
                        checked={selectedKeys.has(selectionKey("account_file", file.id))}
                        disabled={busyId === "bulk" || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("account_file", file.id)))}
                        onChange={() => toggleSelection({ scope: "account_file", item: file })}
                      />
                      <span className="entry-select-box" aria-hidden="true" />
                    </label>
                    <FileBadge file={file} />
                    <div className="entry-primary"><strong>{file.displayName}</strong><span>{formatBytes(file.sizeBytes)} · {t("recycle.fileDeleted", { date: formatDate(file.deletedAt, language) })}</span></div>
                    <button className="button button--small" type="button" aria-label={t("recycle.restoreFileAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => void runAction(file.id, t("file.restored"), () => api.restoreFile(file.id))}>{t("recycle.restore")}</button>
                    {account.role === "owner" && <button className="button button--small button--danger" type="button" aria-label={t("recycle.deleteForeverAria", { name: file.displayName })} disabled={busyId === file.id} onClick={() => {
                      if (window.confirm(t("file.permanentConfirm", { name: file.displayName }))) {
                        void runAction(file.id, t("file.permanentDeleted"), () => api.permanentlyDeleteFile(file.id, file.version));
                      }
                    }}>{t("recycle.deleteForever")}</button>}
                  </article>
                ))}
                {recycleLibrary && libraryRecycle.files.map((entry) => {
                  const restoreActionId = `library-restore:${entry.file.id}`;
                  const deleteActionId = `library-delete:${entry.file.id}`;
                  const key = selectionKey("library_recycle_holding", entry.file.id, recycleLibrary.id);
                  const displayTitle = entry.canonicalTitle?.trim() || entry.file.displayName;
                  return (
                    <article
                      className={selectedKeys.has(key) ? "recycle-card is-selected" : "recycle-card"}
                      data-entry-kind="library-recycle-holding"
                      key={`${recycleLibrary.id}:${entry.file.id}`}
                    >
                      <label className="entry-select-control">
                        <input
                          className="entry-select"
                          type="checkbox"
                          aria-label={t("bulk.selectAria", { name: displayTitle })}
                          checked={selectedKeys.has(key)}
                          disabled={busyId === "bulk" || (selectedKeys.size >= 100 && !selectedKeys.has(key))}
                          onChange={() => toggleSelection({
                            scope: "library_recycle_holding",
                            library: recycleLibrary,
                            item: entry,
                          })}
                        />
                        <span className="entry-select-box" aria-hidden="true" />
                      </label>
                      <FileBadge file={entry.file} />
                      <div className="entry-primary"><strong>{displayTitle}</strong><span>{formatBytes(entry.file.sizeBytes)} · {t("recycle.fileDeleted", { date: formatDate(entry.file.deletedAt, language) })}</span></div>
                      <button
                        className="button button--small"
                        type="button"
                        aria-label={t("recycle.restoreFileAria", { name: displayTitle })}
                        disabled={busyId === restoreActionId || busyId === deleteActionId}
                        onClick={() => restoreRecycledLibraryHolding(recycleLibrary, entry)}
                      >{t("recycle.restore")}</button>
                      {account.role === "owner" && <button
                        className="button button--small button--danger"
                        type="button"
                        aria-label={t("recycle.deleteForeverAria", { name: displayTitle })}
                        disabled={busyId === restoreActionId || busyId === deleteActionId}
                        onClick={() => {
                          if (!window.confirm(t("file.permanentConfirm", { name: displayTitle }))) return;
                          void runAction(
                            deleteActionId,
                            t("file.permanentDeleted"),
                            () => api.permanentlyDeleteLibraryHolding(recycleLibrary.id, entry.file.id, entry.version),
                          );
                        }}
                      >{t("recycle.deleteForever")}</button>}
                    </article>
                  );
                })}
              </div>
            ) : null}
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
      {accountAdministrationOpen && (
        <OwnerAdministrationDialog
          api={api}
          ownerId={account.id}
          onClose={() => setAccountAdministrationOpen(false)}
          returnFocus={accountAdministrationReturnFocus}
          onAnnouncementChanged={() => setAnnouncementRevision((value) => value + 1)}
          onLibraryChanged={refresh}
        />
      )}
      {resourceDetailsRequest && (
        <ResourceDetailsDialog
          api={api}
          library={resourceDetailsRequest.library}
          holding={resourceDetailsRequest.holding}
          returnFocus={resourceDetailsRequest.returnFocus}
          onClose={() => setResourceDetailsRequest(null)}
          onSaved={(_detail: LibraryHoldingDetails) => refresh()}
          onPreview={() => {
            const request = resourceDetailsRequest;
            setResourceDetailsRequest(null);
            void openLibraryPreview(request.library, request.holding, request.returnFocus);
          }}
          onDownload={() => void downloadLibraryHolding(resourceDetailsRequest.library, resourceDetailsRequest.holding)}
          onCitation={() => {
            const request = resourceDetailsRequest;
            setResourceDetailsRequest(null);
            setCitationRequest(request);
          }}
          onSuggestionJobChange={handleResourceSuggestionJobChange}
        />
      )}
      {citationRequest && (
        <CitationDialog
          api={api}
          library={citationRequest.library}
          holding={citationRequest.holding}
          returnFocus={citationRequest.returnFocus}
          onClose={() => setCitationRequest(null)}
        />
      )}
      {batchNamingRequest && (
        <BatchNamingDialog
          api={api}
          library={batchNamingRequest.library}
          holdings={batchNamingRequest.holdings}
          onClose={() => setBatchNamingRequest(null)}
          onApplied={() => {
            // Keep the modal open so the per-item result list stays visible;
            // the manager closes it explicitly after review.
            setSelectedKeys(new Set());
            refresh();
          }}
        />
      )}
      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} onDownload={() => void preview.download()} />}
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
    case "paused": return "phase.paused" as const;
    case "resumable": return "phase.resumable" as const;
    case "completing": return "phase.completing" as const;
    case "verifying": return "phase.verifying" as const;
    case "complete": return "phase.complete" as const;
    case "error": return "phase.error" as const;
    case "abandoned": return "phase.abandoned" as const;
  }
}

function metadataActivityStateKey(state: DerivedMetadataJob["state"]) {
  switch (state) {
    case "queued": return "activity.metadataQueued" as const;
    case "running": return "activity.metadataProcessing" as const;
    case "succeeded": return "activity.metadataSucceeded" as const;
    case "failed": return "activity.metadataFailed" as const;
  }
}

function downloadActivityStateKey(state: DownloadActivity["phase"]) {
  switch (state) {
    case "preparing": return "activity.downloadPreparing" as const;
    case "started": return "activity.downloadStarted" as const;
    case "failed": return "activity.downloadFailed" as const;
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

export function ScholarlyRecordsDialog({
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
  const [sharedLibraries, setSharedLibraries] = useState<Awaited<ReturnType<AcademicCloudApi["listLibraries"]>>>([]);
  const [submissionLibraryId, setSubmissionLibraryId] = useState("");
  const [submissionNotice, setSubmissionNotice] = useState("");
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
    Promise.all([api.listScholarlyRecords(controller.signal), api.listLibraries(controller.signal)]).then(
      ([page, libraries]) => {
        setRecords(page.records);
        setSharedLibraries(libraries);
        setSubmissionLibraryId((current) => current && libraries.some((library) => library.id === current) ? current : libraries[0]?.id ?? "");
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

  async function submitArtifact(artifactId: string): Promise<void> {
    if (!submissionLibraryId) return;
    setBusy(`submit:${artifactId}`);
    setError(null);
    setSubmissionNotice("");
    try {
      await api.submitLibraryContribution(submissionLibraryId, artifactId);
      setSubmissionNotice(t("sharedLibrary.submitted"));
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
        {submissionNotice && <div className="alert alert--success" role="status">{submissionNotice}</div>}
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
                    {sharedLibraries.length > 0 && (
                      <label className="scholarly-contribution-library" htmlFor="scholarly-contribution-library">
                        <span>{t("sharedLibrary.submitTo")}</span>
                        <select id="scholarly-contribution-library" value={submissionLibraryId} onChange={(event) => setSubmissionLibraryId(event.target.value)}>
                          <option value="">{t("sharedLibrary.chooseLibrary")}</option>
                          {sharedLibraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}
                        </select>
                      </label>
                    )}
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
                            <div className="shared-library-actions">
                              {file?.availability === "available" && submissionLibraryId && (
                                <button className="button button--small button--secondary" type="button" disabled={busy !== null} onClick={() => void submitArtifact(artifact.id)}>{t("sharedLibrary.submitTo")}</button>
                              )}
                              <button className="button button--small" type="button" disabled={busy !== null} onClick={() => void detach(selected.id, artifact.id)}>{t("records.detach")}</button>
                            </div>
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

type OwnerAdministrationSection = "members" | "contributions" | "announcements" | "activity";

function OwnerAdministrationDialog({
  api,
  ownerId,
  onClose,
  returnFocus,
  onAnnouncementChanged,
  onLibraryChanged,
}: {
  api: AcademicCloudApi;
  ownerId: string;
  onClose: () => void;
  returnFocus: HTMLElement | null;
  onAnnouncementChanged: () => void;
  onLibraryChanged: () => void;
}) {
  const { t } = useLanguage();
  const [section, setSection] = useState<OwnerAdministrationSection>("members");
  const dialogRef = useModalDialog(onClose, false, returnFocus);
  const sections: Array<{ id: OwnerAdministrationSection; label: string }> = [
    { id: "members", label: t("ownerAdmin.members") },
    { id: "contributions", label: t("ownerAdmin.contributions") },
    { id: "announcements", label: t("ownerAdmin.announcements") },
    { id: "activity", label: t("ownerAdmin.activity") },
  ];
  const activeLabel = sections.find((item) => item.id === section)?.label ?? "";

  return (
    <dialog ref={dialogRef} className="owner-administration-modal" aria-labelledby="owner-administration-title">
      <header>
        <div>
          <span className="owner-administration-kicker">AcademicCloud</span>
          <h2 id="owner-administration-title">{t("ownerAdmin.title")}</h2>
        </div>
        <button className="button button--quiet" type="button" onClick={onClose} aria-label={t("ownerAdmin.closeAria")}>{t("preview.close")}</button>
      </header>
      <div className="owner-administration-layout">
        <nav className="owner-administration-nav" aria-label={t("ownerAdmin.sectionsAria")}>
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "owner-administration-nav-item is-active" : "owner-administration-nav-item"}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <section className="owner-administration-content" aria-labelledby="owner-administration-section-title">
          <h3 id="owner-administration-section-title">{activeLabel}</h3>
          {section === "members" && <AccountAdministrationPanel api={api} ownerId={ownerId} />}
          {section === "contributions" && <ContributionReviewPanel api={api} onChanged={onLibraryChanged} />}
          {section === "announcements" && <AnnouncementAdministrationPanel api={api} onChanged={onAnnouncementChanged} />}
          {section === "activity" && <AuditPanel api={api} />}
        </section>
      </div>
    </dialog>
  );
}

function AccountAdministrationPanel({
  api,
  ownerId,
}: {
  api: AcademicCloudApi;
  ownerId: string;
}) {
  const { language, t } = useLanguage();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [credentialResetLink, setCredentialResetLink] = useState<{
    loginName: string;
    link: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  async function issueCredentialReset(account: ManagedAccount) {
    setBusyId(`credential-reset-${account.id}`);
    setError(null);
    setCredentialResetLink(null);
    try {
      const created = await api.issueCredentialReset(account.id);
      setCredentialResetLink({
        loginName: account.loginName,
        link: `${window.location.origin}/#/reset/${created.rawToken}`,
        expiresAt: created.reset.expiresAt,
      });
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  const availableInvitations = invitations.filter((invitation) => invitation.status === "available");
  const historicalInvitations = invitations.filter((invitation) => invitation.status !== "available");

  return (
      <div className="account-administration-body owner-administration-panel">
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
                        {account.state !== "archived" && (
                          <button className="button button--small" type="button" disabled={busyId !== null} onClick={() => void issueCredentialReset(account)}>{t("credentialReset.issue")}</button>
                        )}
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
              {credentialResetLink !== null && (
                <div className="invitation-link" role="status">
                  <label htmlFor="one-time-credential-reset-link">{t("credentialReset.oneTimeLink", { name: credentialResetLink.loginName })}</label>
                  <input id="one-time-credential-reset-link" readOnly value={credentialResetLink.link} onFocus={(event) => event.currentTarget.select()} />
                  <span>{t("credentialReset.expires", { date: formatDate(credentialResetLink.expiresAt, language) })}</span>
                  <button className="button button--quiet button--small" type="button" onClick={() => setCredentialResetLink(null)}>{t("accounts.dismissLink")}</button>
                </div>
              )}
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
                <>
                  {availableInvitations.length === 0 ? <p className="account-administration-empty">{t("accounts.noAvailableInvitations")}</p> : (
                    <div className="account-administration-list">
                      {availableInvitations.map((invitation) => (
                        <article className="account-administration-row" key={invitation.id}>
                          <div>
                            <strong>{t(invitationStatusKey(invitation.status))}</strong>
                            <span>{t("accounts.expires", { date: formatDate(invitation.expiresAt, language) })}</span>
                          </div>
                          <button className="button button--small button--danger" type="button" disabled={busyId !== null} onClick={() => void revokeInvitation(invitation.id)}>{t("accounts.revoke")}</button>
                        </article>
                      ))}
                    </div>
                  )}
                  {historicalInvitations.length > 0 && (
                    <details className="invitation-history">
                      <summary>{t("accounts.invitationHistory", { count: historicalInvitations.length })}</summary>
                      <div className="account-administration-list">
                        {historicalInvitations.map((invitation) => (
                          <article className="account-administration-row" key={invitation.id}>
                            <div>
                              <strong>{t(invitationStatusKey(invitation.status))}</strong>
                              <span>{t("accounts.expires", { date: formatDate(invitation.expiresAt, language) })}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
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
  onPermanentDelete,
  onFavoriteAdd,
  onFavoriteRemove,
  onBatchName,
}: {
  mode: "library" | "favorites" | "recycle";
  selectedCount: number;
  busy: boolean;
  onClear: () => void;
  onMove?: (trigger: HTMLElement) => void;
  onRecycle?: () => void;
  onRestore?: () => void;
  onPermanentDelete?: () => void;
  onFavoriteAdd?: () => void;
  onFavoriteRemove?: () => void;
  onBatchName?: () => void;
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
        {onBatchName && <button className="button button--small" type="button" disabled={busy} onClick={onBatchName}>{t("bulk.batchName")}</button>}
        {onFavoriteAdd && <button className="button button--small" type="button" disabled={busy} onClick={onFavoriteAdd}>{t("bulk.favoriteAdd")}</button>}
        {onFavoriteRemove && <button className="button button--small" type="button" disabled={busy} onClick={onFavoriteRemove}>{t("bulk.favoriteRemove")}</button>}
        {onRestore && <button className="button button--small" type="button" disabled={busy} onClick={onRestore}>{t("bulk.restore")}</button>}
        {onPermanentDelete && <button className="button button--small button--danger" type="button" disabled={busy} onClick={onPermanentDelete}>{t("bulk.permanentDelete")}</button>}
        {onRecycle && <button className="button button--small button--danger" type="button" disabled={busy} onClick={onRecycle}>{t("bulk.recycle")}</button>}
        <button className="button button--small button--quiet" type="button" disabled={busy} onClick={onClear}>{t("bulk.clear")}</button>
      </div>
    </div>
  );
}

function EntryTable({
  folders,
  files,
  libraryHoldings = [],
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
  onOpenHoldingDetails,
  onPreviewHolding,
  onDownloadHolding,
  onRecycleHolding,
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
  libraryHoldings?: Array<{ library: LibrarySummary; holding: LibraryHolding }>;
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
  onOpenHoldingDetails?: (library: LibrarySummary, holding: LibraryHolding, trigger?: HTMLElement) => void;
  onPreviewHolding?: (library: LibrarySummary, holding: LibraryHolding, trigger?: HTMLElement) => void;
  onDownloadHolding?: (library: LibrarySummary, holding: LibraryHolding) => void;
  onRecycleHolding?: (library: LibrarySummary, holding: LibraryHolding) => void;
  starFileIds?: ReadonlySet<string>;
  starFolderIds?: ReadonlySet<string>;
  onToggleFileFavorite?: (file: Pick<FileEntry, "id">) => void;
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
        <div className={selectedKeys.has(selectionKey("account_folder", folder.id)) ? "entry-row is-selected" : "entry-row"} role="row" key={folder.id}>
          <div className="entry-name" role="cell">
            <label className="entry-select-control">
              <input
                className="entry-select"
                type="checkbox"
                aria-label={t("bulk.selectAria", { name: folder.name })}
                checked={selectedKeys.has(selectionKey("account_folder", folder.id))}
                disabled={selectionDisabled || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("account_folder", folder.id)))}
                onChange={() => onToggleSelected({ scope: "account_folder", item: folder })}
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
      {libraryHoldings.map(({ library, holding }) => {
        const displayTitle = libraryHoldingDisplayTitle(holding, language);
        const key = selectionKey("library_holding", holding.file.id, library.id);
        return (
        <div className={selectedKeys.has(key) ? "entry-row is-selected" : "entry-row"} role="row" key={`${library.id}:${holding.artifactId}`} data-entry-kind="library-holding">
          <div className="entry-name" role="cell">
            <label className="entry-select-control">
              <input
                className="entry-select"
                type="checkbox"
                aria-label={t("bulk.selectAria", { name: displayTitle })}
                checked={selectedKeys.has(key)}
                disabled={selectionDisabled || (selectedKeys.size >= 100 && !selectedKeys.has(key))}
                onChange={() => onToggleSelected({ scope: "library_holding", library, item: holding })}
              />
              <span className="entry-select-box" aria-hidden="true" />
            </label>
            <FileBadge file={holding.file} />
            <div className="entry-name-body">
              {onOpenHoldingDetails ? (
                <button className="entry-link entry-filename" type="button" title={displayTitle} onClick={(event) => onOpenHoldingDetails(library, holding, event.currentTarget)}>{displayTitle}</button>
              ) : <strong className="entry-filename" title={displayTitle}>{displayTitle}</strong>}
              <span className="entry-mobile-meta">{fileKindLabel(holding.file, t)} · {formatBytes(holding.file.sizeBytes)}</span>
            </div>
          </div>
          <span role="cell" className="entry-meta">{formatBytes(holding.file.sizeBytes)}</span>
          <span role="cell" className="entry-meta">{formatDate(holding.file.updatedAt, language)}</span>
          <div className="entry-actions" role="cell">
            {onToggleFileFavorite && (
              <StarButton
                active={starFileIds?.has(holding.file.id) ?? false}
                name={displayTitle}
                onToggle={() => onToggleFileFavorite(holding.file)}
              />
            )}
            {onDownloadHolding && (
              <RowMenu
                triggerLabel={t("menu.openAria", { name: displayTitle })}
                menuLabel={t("menu.aria", { name: displayTitle })}
                items={[
                  ...(isPreviewable(holding.file) && onPreviewHolding ? [{
                    key: "preview",
                    label: t("menu.preview"),
                    disabled: busyId === `preview-${holding.file.id}`,
                    onSelect: (trigger: HTMLElement) => onPreviewHolding(library, holding, trigger),
                  }] : []),
                  {
                    key: "download",
                    label: t("menu.download"),
                    disabled: busyId === `download-${holding.file.id}`,
                    onSelect: () => onDownloadHolding(library, holding),
                  },
                  ...(library.role === "manager" && onRecycleHolding ? [
                    { key: "separator", separator: true as const },
                    {
                      key: "trash",
                      label: t("menu.trash"),
                      danger: true,
                      disabled: busyId === holding.file.id,
                      onSelect: () => onRecycleHolding(library, holding),
                    },
                  ] : []),
                ]}
              />
            )}
          </div>
        </div>
        );
      })}
      {files.map((file) => (
        <div className={selectedKeys.has(selectionKey("account_file", file.id)) ? "entry-row is-selected" : "entry-row"} role="row" key={file.id}>
          <div className="entry-name" role="cell">
            <label className="entry-select-control">
              <input
                className="entry-select"
                type="checkbox"
                aria-label={t("bulk.selectAria", { name: file.displayName })}
                checked={selectedKeys.has(selectionKey("account_file", file.id))}
                disabled={selectionDisabled || (selectedKeys.size >= 100 && !selectedKeys.has(selectionKey("account_file", file.id)))}
                onChange={() => onToggleSelected({ scope: "account_file", item: file })}
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

function fileKindLabel(file: { mediaType: string | null }, t: Translator): string {
  if (file.mediaType === "application/pdf") return t("file.kindPdf");
  if (file.mediaType?.startsWith("image/")) return t("file.kindImage");
  if (file.mediaType?.startsWith("text/")) return t("file.kindText");
  return t("file.kindFile");
}

// Compact account access for every authenticated shell: avatar trigger +
// popover with account name, language, the single Owner administration entry,
// and sign out. The
// interactive section is a real ARIA menu (menuitem roles, arrow/Home/End
// navigation, focus moves in on open) mirroring RowMenu semantics.
function AccountMenu({
  accountName,
  owner,
  busy,
  onManage,
  onSignOut,
}: {
  accountName: string;
  owner: boolean;
  busy: boolean;
  onManage: (returnFocus: HTMLElement) => void;
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
                <button
                  className="account-popover-signout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    if (triggerRef.current) onManage(triggerRef.current);
                  }}
                >
                  {t("ownerAdmin.open")}
                </button>
            )}
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

function FileBadge({ file }: { file: { mediaType: string | null } }) {
  if (file.mediaType === "application/pdf") return <PdfIcon size={19} className="file-badge file-badge--pdf" />;
  if (file.mediaType?.startsWith("image/")) return <ImageIcon size={19} className="file-badge file-badge--img" />;
  if (file.mediaType?.startsWith("text/")) return <TextIcon size={19} className="file-badge file-badge--txt" />;
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
    ? new Set(request.items.map((entry) => entry.scope === "account_folder" ? entry.item.parentId : entry.item.folderId))
    : new Set([request.kind === "folder" ? request.item.parentId : request.item.folderId]);
  const selectedFolderIds = new Set(
    request.kind === "bulk"
      ? request.items.filter((entry) => entry.scope === "account_folder").map((entry) => entry.item.id)
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
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
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

function isPreviewable(file: { mediaType: string | null }): boolean {
  if (file.mediaType === null) return false;
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
