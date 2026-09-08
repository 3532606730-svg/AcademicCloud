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

/** A reading overlay is one Back step; signed source URLs never enter history. */
export function useHistoryDialog(onClose: () => void): () => void {
  const id = useRef(crypto.randomUUID());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (window.history.state?.academiccloudDialog !== id.current) {
      window.history.pushState({ ...window.history.state, academiccloudDialog: id.current }, "");
    }
    const restore = (event: PopStateEvent) => {
      if (event.state?.academiccloudDialog !== id.current) closeRef.current();
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return () => {
    if (window.history.state?.academiccloudDialog === id.current) window.history.back();
    closeRef.current();
  };
}
