import { useEffect, useRef, useState } from "react";
import type { FolderEntry } from "./api.ts";

export type WorkspaceView = "library" | "pending" | "recycle" | "favorites";
const PREFIX = "academiccloud.view.v1:";
const VIEWS: readonly string[] = ["library", "pending", "recycle", "favorites"];

// Account-scoped, tab-lifetime preferences only. No credential, signed URL,
// result content or private search text is ever placed in the address bar.
export function readViewPreference<T>(accountId: string | undefined, section: string, fallback: T): T {
  if (!accountId) return fallback;
  try {
    const value = window.sessionStorage.getItem(`${PREFIX}${accountId}:${section}`);
    if (!value || value.length > 32_768) return fallback;
    return JSON.parse(value) as T;
  } catch { return fallback; }
}

export function writeViewPreference(accountId: string | undefined, section: string, value: unknown): void {
  if (!accountId) return;
  try { window.sessionStorage.setItem(`${PREFIX}${accountId}:${section}`, JSON.stringify(value)); } catch { /* Optional preference. */ }
}

export function clearViewPreferences(accountId: string): void {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(`${PREFIX}${accountId}:`)) window.sessionStorage.removeItem(key);
    }
    if (window.history.state?.academiccloudView?.accountId === accountId) window.history.replaceState(null, "");
  } catch { /* Sign-out never depends on optional storage. */ }
}

interface WorkspaceLocation { view: WorkspaceView; path: FolderEntry[] }
function validLocation(value: unknown): WorkspaceLocation {
  const empty: WorkspaceLocation = { view: "library", path: [] };
  if (!value || typeof value !== "object") return empty;
  const input = value as Partial<WorkspaceLocation>;
  if (!VIEWS.includes(input.view ?? "")) return empty;
  const path = Array.isArray(input.path) && input.path.length <= 64 && input.path.every((entry) =>
    entry && typeof entry.id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(entry.id)
    && typeof entry.name === "string" && entry.name.length <= 255 && entry.state === "active") ? input.path : [];
  return { view: input.view!, path };
}

export function useWorkspaceLocation(accountId: string) {
  const [initial] = useState(() => validLocation(readViewPreference(accountId, "workspace", null)));
  const [view, setView] = useState<WorkspaceView>(initial.view);
  const [path, setPath] = useState<FolderEntry[]>(initial.path);
  const previous = useRef<string | null>(null);
  const restoring = useRef(false);
  useEffect(() => {
    const location = { view, path };
    writeViewPreference(accountId, "workspace", location);
    const serialized = JSON.stringify(location);
    if (previous.current !== serialized) {
      const state = { ...window.history.state, academiccloudView: { accountId, ...location } };
      if (previous.current === null || restoring.current) window.history.replaceState(state, "");
      else window.history.pushState(state, "");
      previous.current = serialized;
    }
    restoring.current = false;
  }, [accountId, path, view]);
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const saved = event.state?.academiccloudView;
      if (saved?.accountId !== accountId) return;
      const location = validLocation(saved);
      restoring.current = true;
      setView(location.view);
      setPath(location.path);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [accountId]);
  return { view, setView, path, setPath };
}

interface HistoryDialogEntry {
  id: string;
  close: () => void;
  canClose: () => boolean;
  closing: boolean;
  state: unknown;
}

interface HistoryDialogClose {
  (): void;
  /** Replace this dialog after asynchronous preparation has succeeded. */
  replaceWith: (commit: () => void) => void;
}

// Coordinate nested overlays in one listener. A covered Preview must never
// react to Back before its research dialog has accepted (or blocked) that exit.
const historyDialogs: HistoryDialogEntry[] = [];
let pendingDialogExit: { entry: HistoryDialogEntry; commit?: () => void } | null = null;
let historyListenerActive = false;

function dialogIds(state: unknown): string[] {
  const saved = state as { academiccloudDialogs?: unknown; academiccloudDialog?: unknown } | null;
  if (Array.isArray(saved?.academiccloudDialogs) && saved.academiccloudDialogs.every((id) => typeof id === "string")) {
    return saved.academiccloudDialogs;
  }
  return typeof saved?.academiccloudDialog === "string" ? [saved.academiccloudDialog] : [];
}

function activeDialogs(): HistoryDialogEntry[] { return historyDialogs.filter((entry) => !entry.closing); }

function dialogState(state: unknown, entries: HistoryDialogEntry[]) {
  const next = { ...(state && typeof state === "object" ? state : {}) } as Record<string, unknown>;
  const ids = entries.map((entry) => entry.id);
  if (ids.length) {
    next.academiccloudDialog = ids.at(-1);
    next.academiccloudDialogs = ids;
  } else {
    delete next.academiccloudDialog;
    delete next.academiccloudDialogs;
  }
  return next;
}

function releaseHistoryListener() {
  if (!historyDialogs.length && !pendingDialogExit && historyListenerActive) {
    window.removeEventListener("popstate", restoreHistoryDialogs);
    historyListenerActive = false;
  }
}

function restoreHistoryDialogs(event: PopStateEvent) {
  if (pendingDialogExit) {
    const { entry, commit } = pendingDialogExit;
    pendingDialogExit = null;
    if (commit) {
      entry.closing = true;
      commit();
      entry.close();
    }
    // Closing and immediately reopening can mount the next overlay before the
    // asynchronous Back event. Give that new overlay its own step now.
    const remaining = activeDialogs();
    if (remaining.length && JSON.stringify(dialogIds(event.state)) !== JSON.stringify(remaining.map((item) => item.id))) {
      window.history.pushState(dialogState(event.state, remaining), "");
    }
    releaseHistoryListener();
    return;
  }
  const entries = activeDialogs();
  const target = dialogIds(event.state);
  const leaving = [...entries].reverse().filter((entry) => !target.includes(entry.id));
  if (!leaving.length) return;
  // Check every affected guard before closing anything, including a browser
  // history jump that would otherwise destroy both the draft and its document.
  if (leaving.some((entry) => !entry.canClose())) {
    window.history.pushState(entries.at(-1)!.state, "");
    return;
  }
  for (const entry of leaving) {
    entry.closing = true;
    entry.close();
  }
}

/** Each reading/research overlay is one Back step; history contains only opaque dialog IDs. */
export function useHistoryDialog(onClose: () => void, options: { canClose?: () => boolean } = {}): HistoryDialogClose {
  const callbacks = useRef({ onClose, canClose: options.canClose });
  callbacks.current = { onClose, canClose: options.canClose };
  const entryRef = useRef<HistoryDialogEntry | null>(null);
  if (!entryRef.current) entryRef.current = {
    id: crypto.randomUUID(), closing: false, state: null,
    close: () => callbacks.current.onClose(),
    canClose: () => callbacks.current.canClose?.() ?? true,
  };
  const entry = entryRef.current;
  useEffect(() => {
    entry.closing = false;
    historyDialogs.push(entry);
    const entries = activeDialogs();
    entry.state = dialogState(window.history.state, entries);
    if (!pendingDialogExit && JSON.stringify(dialogIds(window.history.state)) !== JSON.stringify(entries.map((item) => item.id))) {
      window.history.pushState(entry.state, "");
    }
    if (!historyListenerActive) {
      window.addEventListener("popstate", restoreHistoryDialogs);
      historyListenerActive = true;
    }
    return () => {
      const index = historyDialogs.indexOf(entry);
      if (index !== -1) historyDialogs.splice(index, 1);
      releaseHistoryListener();
    };
  }, [entry]);
  const leave = (commit?: () => void) => {
    if (entry.closing || pendingDialogExit || activeDialogs().at(-1) !== entry || (!commit && !entry.canClose())) return;
    if (window.history.state?.academiccloudDialog === entry.id) {
      pendingDialogExit = { entry, ...(commit ? { commit } : {}) };
      window.history.back();
      // A transition waits for Back before mounting/reusing Preview, so no
      // departed research entry remains underneath the new document.
      if (commit) return;
    }
    entry.closing = true;
    commit?.();
    entry.close();
  };
  const close: HistoryDialogClose = () => leave();
  close.replaceWith = (commit) => leave(commit);
  return close;
}
