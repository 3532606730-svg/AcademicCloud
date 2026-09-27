import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from "react";
import { ApiError } from "./api.ts";
import type { CollectionItem, PageNote, ReadingState, ResearchCollection, ResourceWorkspace, WorkspaceApi, WorkspacePage, WorkspaceResource, ReaderProgress, TextHighlight } from "./workspace-api.ts";
import { useLanguage } from "./i18n-react.tsx";
import { describeError, formatDate } from "./i18n.ts";
import { useModalDialog } from "./use-modal-dialog.ts";
import { readViewPreference, writeViewPreference, useHistoryDialog } from "./view-context.ts";
import { WorkspaceSwitch } from "./workspace-switch.tsx";
import { PdfReader, type PdfHighlight } from "./pdf-reader.tsx";
import { readerLocalKey, rememberReaderFile, restoreReaderFile, verifyReaderFile, type ReaderFilePicker, type ReaderSourceIdentity } from "./reader-local-source.ts";
import type { RecoverableFileHandle } from "./file-source-recovery.ts";
import { LocalLibraryFolder } from "./local-library-folder.tsx";
import { LOCAL_LIBRARY_EVENT } from "./local-library.ts";
import "./workspace.css";

const COPY = {
  "zh-CN": {
    overview: "研究概览", notes: "页码笔记", reading: "我的资料", collections: "收藏集", close: "关闭我的研究", back: "返回",
    empty: "暂无记录", loading: "正在加载…", retry: "重试", more: "加载更多", all: "全部研究", saved: "已保存",
    collectionName: "收藏集名称", createCollection: "新建收藏集", archive: "归档", restore: "恢复", archived: "已归档",
    rename: "重命名", save: "保存", cancel: "取消", discard: "放弃更改", deleted: "回收站", active: "返回笔记",
    newNote: "写页码笔记", edit: "编辑", remove: "移入回收站", page: "PDF 页码", locator: "书上页码 / 卷叶（可选）",
    body: "笔记内容", physicalHelp: "从 PDF 首页计数；书上页码可另填。", open: "打开资料", atPage: "PDF 第 {page} 页",
    unavailable: "资料暂不可用", oldSource: "笔记属于旧文件版本", changedSource: "文件内容已更新，请重新打开资料后写笔记。",
    noPdf: "页码笔记适用于 PDF。", unsaved: "笔记尚未保存，请先保存或放弃更改。", unsavedCollection: "收藏集更改尚未保存，请先保存或放弃更改。", conflict: "内容已在别处修改。草稿已保留，请重新加载后核对。",
    export: "导出我的研究", status: "阅读状态", none: "未设置", queued: "待读", inProgress: "在读", finished: "已读", latest: "最新已保存内容", useDraft: "核对后使用我的草稿",
    important: "重要", toCite: "待引用", added: "已加入收藏集", removed: "已移出收藏集", removeItem: "移出收藏集", editCollection: "编辑收藏集",
    readerView: "阅读视图", sourceView: "原文", previousPage: "上一页", nextPage: "下一页", jumpPage: "跳转", goToPage: "跳转此页",
    retryReader: "重新打开", openNewTab: "在新页打开", downloadSource: "下载原件", readerLoading: "正在打开原件…",
    readerExpired: "原件链接已过期；翻页时会重新验证。",
    readerSourceChanged: "原件已有新版本，请返回资料库重新打开。",
  },
  en: {
    overview: "Overview", notes: "Page notes", reading: "My resources", collections: "Collections", close: "Close my research", back: "Back",
    empty: "No records yet", loading: "Loading…", retry: "Retry", more: "Load more", all: "All research", saved: "Saved",
    collectionName: "Collection name", createCollection: "Create collection", archive: "Archive", restore: "Restore", archived: "Archived",
    rename: "Rename", save: "Save", cancel: "Cancel", discard: "Discard changes", deleted: "Deleted notes", active: "Current notes",
    newNote: "Write a page note", edit: "Edit", remove: "Move note to trash", page: "PDF page", locator: "Printed page / volume / leaf (optional)",
    body: "Note", physicalHelp: "Count from the first PDF page; printed pages can be entered separately.", open: "Open resource", atPage: "PDF page {page}",
    unavailable: "Resource unavailable", oldSource: "Note belongs to an earlier file version", changedSource: "File content has changed. Reopen the resource before writing a note.",
    noPdf: "Page notes are available for PDFs.", unsaved: "Save or discard your note changes before leaving.", unsavedCollection: "Save or discard your collection changes before leaving.", conflict: "This record changed elsewhere. Your draft is preserved; reload and compare before saving.",
    export: "Export my research", status: "Reading status", none: "Not set", queued: "To read", inProgress: "Reading", finished: "Finished", latest: "Latest saved note", useDraft: "Reviewed: keep my draft",
    important: "Important", toCite: "To cite", added: "Added to collection", removed: "Removed from collection", removeItem: "Remove from collection", editCollection: "Edit collection",
    readerView: "Reading view", sourceView: "Source", previousPage: "Previous", nextPage: "Next", jumpPage: "Go", goToPage: "Go to page",
    retryReader: "Reopen", openNewTab: "Open in new tab", downloadSource: "Download original", readerLoading: "Opening source…",
    readerExpired: "The source link expired; page navigation will reauthorize it.",
    readerSourceChanged: "The source file changed. Return to the Library and reopen it.",
  },
};

type Editor = { note: PageNote | null; resource: WorkspaceResource; initialPhysicalPage?: number; lockPage?: boolean };
type ReaderAuthorization = ReaderSourceIdentity & { url: string; expiresAt?: string; download: () => Promise<void> };
type DocumentTab = { resource: WorkspaceResource; page: number };

export function WorkspaceDialog({ api, accountId, initialResourceId, expectedSourceId, initialPhysicalPage, returnFocus, onClose, onOpenResource, onAuthorizeReader, onRouteChange, onRegisterNavigationGuard, asPage = false }: {
  api: WorkspaceApi;
  accountId?: string;
  initialResourceId?: string;
  expectedSourceId?: string;
  initialPhysicalPage?: number;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onOpenResource: (resource: WorkspaceResource, physicalPage?: number) => Promise<() => void>;
  onAuthorizeReader?: (resource: WorkspaceResource) => Promise<ReaderAuthorization>;
  onRouteChange?: (resource: WorkspaceResource | null) => void;
  onRegisterNavigationGuard?: (guard: (() => boolean) | null) => void;
  asPage?: boolean;
}) {
  const { language, t } = useLanguage();
  const c = COPY[language];
  const readingStatusLabel = (status: ReadingState["status"] | null | undefined) => status === "finished" ? c.finished : status === "reading" ? c.inProgress : status === "queued" ? c.queued : c.none;
  const [resourceId, setResourceId] = useState(initialResourceId);
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>([]);
  const tabsRef = useRef(documentTabs); tabsRef.current = documentTabs;
  const [recent, setRecent] = useState<WorkspacePage<ReaderProgress> | null>(null);
  const [recentVisible, setRecentVisible] = useState(12);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [recentBusy, setRecentBusy] = useState(false);
  const recentRequest = useRef<AbortController | null>(null);
  const [noteFontSize, setNoteFontSize] = useState(15);
  const [highlights, setHighlights] = useState<TextHighlight[]>([]);
  const [highlightCursor, setHighlightCursor] = useState<string | null>(null);
  const [highlightBusy, setHighlightBusy] = useState(false);
  // Keep late initial/paginated reads from resurrecting or hiding local writes.
  const highlightChanges = useRef(new Map<string, TextHighlight>());
  const [progressReady, setProgressReady] = useState<string | null>(null);
  const [progressRetry, setProgressRetry] = useState(0);
  const [progressIssue, setProgressIssue] = useState<{ key: string; latest: ReaderProgress | null; conflict: boolean } | null>(null);
  const [focusReading, setFocusReading] = useState(false);
  const progressContext = useRef<{ key: string; resource: WorkspaceResource; revision: number; savedPage: number | null; pendingPage: number | null; failed: boolean } | null>(null);
  const progressWrite = useRef<Promise<unknown>>(Promise.resolve());
  const progressTimer = useRef<number | null>(null);
  const requestedPage = useRef(initialPhysicalPage);
  const activeSource = useRef<string | null>(null);

  const [loadedResource, setResource] = useState<ResourceWorkspace | null>(null);
  const resource = loadedResource?.resource.resourceId === resourceId ? loadedResource : null;
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [notes, setNotes] = useState<WorkspacePage<PageNote> | null>(null);
  const [reading, setReading] = useState<WorkspacePage<ReadingState> | null>(null);
  const [items, setItems] = useState<WorkspacePage<CollectionItem> | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [tab, setTab] = useState<"notes" | "reading" | "collections">("reading");
  const [deleted, setDeleted] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [readerPage, setReaderPage] = useState(initialPhysicalPage ?? 1);
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const readerNavigation = useRef<((page: number) => Promise<boolean>) | null>(null);
  const [readerView, setReaderView] = useState<"source" | "notes">("source");
  const pendingInitialNote = useRef(initialPhysicalPage !== undefined);
  const [noteDirty, setNoteDirty] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [editingCollection, setEditingCollection] = useState<ResearchCollection | null>(null);
  const collectionDirty = Boolean(collectionName) || Boolean(editingCollection && editingCollection.name !== collections.find((entry) => entry.id === editingCollection.id)?.name);
  const dirty = noteDirty || collectionDirty;
  const mounted = useRef(true);
  const canLeave = () => {
    if (dirty || busy || highlightBusy) { setNotice(collectionDirty ? c.unsavedCollection : c.unsaved); return false; }
    return true;
  };
  const canLeaveRef = useRef(canLeave);
  canLeaveRef.current = canLeave;
  useEffect(() => {
    if (!asPage || !onRegisterNavigationGuard) return;
    onRegisterNavigationGuard(() => canLeaveRef.current());
    return () => onRegisterNavigationGuard(null);
  }, [asPage, onRegisterNavigationGuard]);
  const close = useHistoryDialog(onClose, { enabled: !asPage, canClose: canLeave });
  const dialog = useModalDialog(close, false, returnFocus);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirty && !busy && !highlightBusy) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, busy, highlightBusy]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setNotes(null); setReading(null); setItems(null);
    // Revalidate the resource independently. Side-panel refreshes keep the
    // same reader mounted, while lost access or a changed source removes it.
    if (!resourceId) setResource(null);
    const resourceLoad = resourceId ? api.resource(resourceId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setResource(next);
    }).catch((caught) => {
      if (controller.signal.aborted) return;
      setResource(null);
      if (!(caught instanceof ApiError && caught.status === 404)) setError(caught);
    }) : Promise.resolve();
    const load = async () => {
      const [nextCollections, nextNotes, nextReading, nextItems] = await Promise.all([
        api.collections(controller.signal),
        tab === "notes" || resourceId ? api.notes({ ...(resourceId ? { resourceId } : {}), deleted }, controller.signal) : Promise.resolve(null),
        !resourceId && tab === "reading" ? api.reading(undefined, controller.signal) : Promise.resolve(null),
        !resourceId && tab === "collections" && collectionId ? api.collectionItems(collectionId, undefined, controller.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      setCollections(nextCollections); setNotes(nextNotes); setReading(nextReading); setItems(nextItems);
      await resourceLoad;
      if (!controller.signal.aborted) setLoading(false);
    };
    void load().catch((caught) => { if (!controller.signal.aborted) { setError(caught); setLoading(false); } });
    return () => controller.abort();
  }, [api, resourceId, tab, collectionId, deleted, reload]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null); setNotice("");
    try { await work(); }
    catch (caught) { if (mounted.current) setError(caught); }
    finally { if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    if (notice !== c.saved) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice, c.saved]);
  const routeCallback = useRef(onRouteChange); routeCallback.current = onRouteChange;
  useEffect(() => {
    if (resource && resource.resource.resourceId === initialResourceId && (!expectedSourceId || resource.resource.sourceId === expectedSourceId)) routeCallback.current?.(resource.resource);
  }, [resource?.resource.resourceId, resource?.resource.sourceId, initialResourceId, expectedSourceId]);
  const refresh = () => { setReload((n) => n + 1); if (progressContext.current?.failed) setProgressRetry((value) => value + 1); };
  const finishEditor = () => { setEditor(null); setNoteDirty(false); setNotice(""); };
  const tabSource = documentTabs.find((entry) => entry.resource.resourceId === resourceId)?.resource.sourceId;
  const expected = tabSource ?? (resourceId === initialResourceId ? expectedSourceId : undefined);
  const sourceMatches = !expected || resource?.resource.sourceId === expected;
  const readerResource = asPage && onAuthorizeReader && resource?.resource.mediaType === "application/pdf" && sourceMatches ? resource.resource : null;
  useEffect(() => {
    setResourceId(initialResourceId); requestedPage.current = initialPhysicalPage;
    pendingInitialNote.current = initialPhysicalPage !== undefined;
    setRenderedPage(null);
  }, [initialResourceId, initialPhysicalPage, expectedSourceId]);
  useEffect(() => {
    const controller = new AbortController();
    setRecentVisible(12);
    setRecent(null);
    setRecentBusy(false);
    void api.recent(undefined, controller.signal).then((next) => { if (!controller.signal.aborted) setRecent(next); }).catch((caught) => { if (!controller.signal.aborted) setError(caught); });
    return () => { controller.abort(); recentRequest.current?.abort(); recentRequest.current = null; };
  }, [api, reload]);
  useEffect(() => {
    const saved = readViewPreference<Array<{ resourceId: string; sourceId: string; page: number }>>(accountId, "research-tabs", []);
    if (!Array.isArray(saved) || saved.length > 12) return;
    const controller = new AbortController();
    const valid = saved.filter((entry) => entry && typeof entry.resourceId === "string" && entry.resourceId.length <= 128 && typeof entry.sourceId === "string" && entry.sourceId.length <= 128 && Number.isSafeInteger(entry.page) && entry.page > 0 && entry.page <= 1_000_000);
    void Promise.all(valid.map(async (entry) => {
      try { const current = await api.resource(entry.resourceId, controller.signal); return current.resource.sourceId === entry.sourceId ? { resource: current.resource, page: entry.page } : null; }
      catch { return null; }
    })).then((entries) => { if (!controller.signal.aborted) setDocumentTabs((current) => [...current, ...entries.filter((entry): entry is DocumentTab => Boolean(entry) && !current.some((tab) => tab.resource.resourceId === entry!.resource.resourceId))].slice(0, 12)); });
    return () => controller.abort();
  }, [accountId, api]);
  useEffect(() => {
    writeViewPreference(accountId, "research-tabs", documentTabs.map((entry) => ({ resourceId: entry.resource.resourceId, sourceId: entry.resource.sourceId, page: entry.page })));
  }, [accountId, documentTabs]);
  useEffect(() => {
    if (!resource || !sourceMatches) return;
    const current = resource.resource;
    setDocumentTabs((tabs) => {
      const existing = tabs.find((entry) => entry.resource.resourceId === current.resourceId);
      if (existing) return tabs.map((entry) => entry === existing ? { ...entry, resource: current } : entry);
      return tabs.length < 12 ? [...tabs, { resource: current, page: 1 }] : tabs;
    });
  }, [resource, sourceMatches]);
  const sourceKey = resource && sourceMatches ? resource.resource.resourceId + ":" + resource.resource.sourceId : null;
  const flushProgress = (context = progressContext.current) => {
    if (!context || context.failed || context.pendingPage === null) return;
    const nextPage = context.pendingPage; context.pendingPage = null;
    progressWrite.current = progressWrite.current.catch(() => {}).then(async () => {
      if (context.failed || context.savedPage === nextPage) return;
      const saved = await api.saveProgress(context.resource.resourceId, { sourceId: context.resource.sourceId, physicalPage: nextPage, revision: context.revision });
      context.revision = saved.revision; context.savedPage = nextPage;
      if (!mounted.current || activeSource.current !== context.key) return;
      setRecent((previous) => ({ items: [saved, ...(previous?.items ?? []).filter((entry) => entry.resourceId !== saved.resourceId)], resources: [context.resource, ...(previous?.resources ?? []).filter((entry) => entry.resourceId !== context.resource.resourceId)], nextBeforeId: previous?.nextBeforeId ?? null }));
    }).catch(async (caught) => {
      context.failed = true;
      const conflict = caught instanceof ApiError && caught.code === "concurrent_change";
      let latest: ReaderProgress | null = null;
      if (conflict) { try { latest = await api.progress(context.resource.resourceId); } catch { /* Keep the explicit retry action. */ } }
      if (mounted.current && activeSource.current === context.key) setProgressIssue({ key: context.key, latest, conflict });
    });
  };
  useEffect(() => {
    setProgressIssue(null); setProgressReady(null); setRenderedPage(null); setHighlights([]); setHighlightCursor(null);
    highlightChanges.current = new Map();
    progressContext.current = null; activeSource.current = sourceKey;
    if (!resource || !sourceKey) return;
    const current = resource.resource;
    const explicitPage = requestedPage.current; requestedPage.current = undefined;
    const tabPage = tabsRef.current.find((entry) => entry.resource.resourceId === current.resourceId && entry.resource.sourceId === current.sourceId)?.page || undefined;
    const controller = new AbortController();
    const context = { key: sourceKey, resource: current, revision: 0, savedPage: null as number | null, pendingPage: null as number | null, failed: false };
    void progressWrite.current.catch(() => {}).then(() => api.progress(current.resourceId, controller.signal)).then((saved) => {
      if (controller.signal.aborted) return;
      context.revision = saved?.sourceId === current.sourceId ? saved.revision : 0; context.savedPage = saved?.physicalPage ?? null;
      progressContext.current = context;
      setReaderPage(explicitPage ?? tabPage ?? saved?.physicalPage ?? 1);
      setProgressReady(sourceKey);
    }).catch((caught) => { if (!controller.signal.aborted) { setError(caught); setReaderPage(explicitPage ?? tabPage ?? 1); setProgressReady(sourceKey); context.failed = true; progressContext.current = context; } });
    void api.highlights({ resourceId: current.resourceId, sourceId: current.sourceId }, controller.signal).then((page) => {
      if (!controller.signal.aborted) {
        const merged = new Map(page.items.map((item) => [item.id, item]));
        for (const [id, item] of highlightChanges.current) { if (item.deletedAt) merged.delete(id); else merged.set(id, item); }
        setHighlights([...merged.values()]); setHighlightCursor(page.nextBeforeId);
      }
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught); });
    return () => { controller.abort(); if (progressTimer.current !== null) window.clearTimeout(progressTimer.current); flushProgress(context); };
  }, [api, sourceKey, progressRetry]);
  const resolveProgress = async (useLatest: boolean) => {
    const context = progressContext.current;
    if (!context || context.key !== sourceKey) return;
    try {
      const latest = await api.progress(context.resource.resourceId);
      if (!mounted.current || progressContext.current !== context) return;
      if (latest && latest.sourceId !== context.resource.sourceId) { setError(new ApiError(409, "concurrent_change")); return; }
      context.revision = latest?.revision ?? 0; context.savedPage = latest?.physicalPage ?? null;
      if (useLatest && latest) {
        const moved = await readerNavigation.current?.(latest.physicalPage);
        if (!moved || !mounted.current || progressContext.current !== context) return;
        // Do not persist until the target page has actually rendered.
        context.failed = false; context.pendingPage = null;
      } else {
        context.failed = false; context.pendingPage = renderedPage;
        flushProgress(context);
      }
      setProgressIssue(null);
    } catch (caught) { if (mounted.current) setError(caught); }
  };
  const rendered = (page: number) => {
    setRenderedPage(page);
    if (!resource || !sourceKey || progressReady !== sourceKey) return;
    const current = resource.resource; const key = sourceKey;
    setDocumentTabs((tabs) => tabs.map((entry) => entry.resource.resourceId === current.resourceId ? { ...entry, page } : entry));
    if (progressTimer.current !== null) window.clearTimeout(progressTimer.current);
    const context = progressContext.current;
    if (!context || context.key !== key) return;
    context.pendingPage = page;
    progressTimer.current = window.setTimeout(() => flushProgress(context), 600);
  };
  const selectDocument = (entry: WorkspaceResource, page?: number) => {
    if (!canLeave()) return;
    if (!tabsRef.current.some((item) => item.resource.resourceId === entry.resourceId) && tabsRef.current.length >= 12) {
      setNotice(language === "zh-CN" ? "已打开 12 份资料，请先关闭一个标签。" : "Close a document tab before opening another (12 maximum)."); return;
    }
    if (resourceId === entry.resourceId && resource?.resource.sourceId === entry.sourceId) {
      if (page !== undefined) void readerNavigation.current?.(page);
      return;
    }
    requestedPage.current = page; pendingInitialNote.current = false;
    setEditor(null); setNoteDirty(false); setDeleted(false); setNotice(""); setReaderView("source"); setRenderedPage(null);
    setDocumentTabs((tabs) => tabs.some((item) => item.resource.resourceId === entry.resourceId) ? tabs : [...tabs, { resource: entry, page: page ?? 0 }]);
    setResourceId(entry.resourceId); onRouteChange?.(entry);
  };
  const showOverview = (nextTab = tab) => {
    if (!canLeave()) return;
    setEditor(null); setNoteDirty(false); setResourceId(undefined); setTab(nextTab); setCollectionId(null); setNotice(""); onRouteChange?.(null);
  };
  const closeDocument = (id: string) => {
    if (id === resourceId && !canLeave()) return;
    const currentTabs = tabsRef.current; const index = currentTabs.findIndex((entry) => entry.resource.resourceId === id);
    const remaining = currentTabs.filter((entry) => entry.resource.resourceId !== id);
    setDocumentTabs(remaining);
    if (id !== resourceId) return;
    const next = remaining[Math.min(index, remaining.length - 1)];
    setEditor(null); setNoteDirty(false);
    if (next) { requestedPage.current = next.page; setResourceId(next.resource.resourceId); onRouteChange?.(next.resource); }
    else { setResourceId(undefined); onRouteChange?.(null); }
  };
  useEffect(() => {
    if (!pendingInitialNote.current || !initialPhysicalPage || !resource || resourceId !== initialResourceId || !sourceMatches || resource.resource.mediaType !== "application/pdf") return;
    if (readerResource && renderedPage !== initialPhysicalPage) return;
    pendingInitialNote.current = false;
    setEditor({ note: null, resource: resource.resource, initialPhysicalPage, lockPage: Boolean(readerResource) });
    setReaderView("notes");
  }, [initialPhysicalPage, initialResourceId, resource, resourceId, sourceMatches, readerResource, renderedPage]);
  const selectedCollection = collections.find((entry) => entry.id === collectionId);
  const latestCollection = editingCollection ? collections.find((entry) => entry.id === editingCollection.id) : undefined;
  const collectionConflict = latestCollection && latestCollection.revision !== editingCollection?.revision ? latestCollection : null;
  const formLocked = busy || editor !== null || editingCollection !== null;
  const locked = formLocked || Boolean(collectionName);
  const changeMembership = async (collection: ResearchCollection, fileId: string, included: boolean) => {
    const next = await api.setCollectionItem(collection, fileId, included);
    setCollections((current) => current.map((entry) => entry.id === next.id ? next : entry));
  };
  const open = (entry: WorkspaceResource, physicalPage?: number) => {
    if (asPage && entry.mediaType === "application/pdf") { selectDocument(entry, physicalPage); return Promise.resolve(); }
    return run(async () => {
    const commit = await onOpenResource(entry, physicalPage);
    if (asPage) commit();
    else close.replaceWith(commit);
    });
  };
  const moreNotes = () => run(async () => {
    const next = await api.notes({ ...(resourceId ? { resourceId } : {}), deleted, beforeId: notes!.nextBeforeId! });
    if (mounted.current) setNotes((current) => current ? { ...next, items: [...current.items, ...next.items], resources: [...current.resources, ...next.resources] } : current);
  });
  const moreRecent = async () => {
    if (!recent || recentRequest.current) return;
    if (recentVisible < recent.items.length) { setRecentVisible((count) => count + 12); return; }
    const cursor = recent.nextBeforeId;
    if (!cursor) return;
    const controller = new AbortController();
    recentRequest.current = controller;
    setRecentBusy(true);
    try {
      const next = await api.recent(cursor, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setRecent((current) => current?.nextBeforeId === cursor ? {
        ...next,
        items: [...current.items, ...next.items.filter((entry) => !current.items.some((existing) => existing.resourceId === entry.resourceId))],
        resources: [...current.resources, ...next.resources.filter((entry) => !current.resources.some((existing) => existing.resourceId === entry.resourceId))],
      } : current);
      setRecentVisible((count) => count + 12);
    } catch (caught) {
      if (!controller.signal.aborted && mounted.current) setError(caught);
    } finally {
      if (recentRequest.current === controller) { recentRequest.current = null; if (mounted.current) setRecentBusy(false); }
    }
  };
  const resourceCards = (entries: Array<{ resourceId: string }>, resources: WorkspaceResource[]) => entries.length ? <div className="research-resources">{entries.map((entry) => {
    const current = resources.find((r) => r.resourceId === entry.resourceId);
    const state = "status" in entry ? entry as ReadingState : undefined;
    return <article className="research-resource" key={entry.resourceId}>
      <button className="research-resource-title" type="button" disabled={locked || !current} onClick={() => { if (!current) return; selectDocument(current); }}>{current?.title ?? c.unavailable}</button>
      {state && <div className="research-badges">{state.status && <span>{state.status === "reading" ? c.inProgress : state.status === "finished" ? c.finished : c.queued}</span>}{state.important && <span>{c.important}</span>}{state.toCite && <span>{c.toCite}</span>}</div>}
      <div className="research-row-actions">{current && <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void open(current)}>{c.open}</button>}
        {tab === "collections" && selectedCollection && <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void run(async () => { await changeMembership(selectedCollection, entry.resourceId, false); refresh(); })}>{c.removeItem}</button>}</div>
    </article>;
  })}</div> : <p className="research-empty">{c.empty}</p>;
  return <ResearchFrame asPage={asPage} dialogRef={dialog}>
    <header className="research-header">{asPage ? <><div className="brand research-brand"><span>AC</span> AcademicCloud</div><WorkspaceSwitch active="research" onLibrary={close} onResearch={() => showOverview()} /><h2 id="research-title" className="visually-hidden">{t("workspace.title")}</h2>{accountId && <LocalLibraryFolder accountId={accountId} />}<span className="research-private-label">{language === "zh-CN" ? "私人研究空间" : "Private workspace"}</span></> : <><h2 id="research-title">{t("workspace.title")}</h2><button className="button button--quiet" type="button" onClick={close} aria-label={c.close}>{t("preview.close")}</button></>}</header>
    {asPage && <div className="research-document-tabs" role="tablist" aria-label={language === "zh-CN" ? "打开的资料" : "Open documents"}>
      <button type="button" role="tab" aria-selected={!resourceId} className="research-home-tab" onClick={() => showOverview()}>{c.overview}</button>
      {documentTabs.map((entry) => <div className={entry.resource.resourceId === resourceId ? "research-document-tab is-active" : "research-document-tab"} key={entry.resource.resourceId}>
        <button type="button" role="tab" aria-selected={entry.resource.resourceId === resourceId} onClick={() => selectDocument(entry.resource, entry.page || undefined)} title={entry.resource.title}>{entry.resource.title}</button>
        <button type="button" className="research-tab-close" aria-label={(language === "zh-CN" ? "关闭标签：" : "Close tab: ") + entry.resource.title} onClick={() => closeDocument(entry.resource.resourceId)}>×</button>
      </div>)}
    </div>}
    <div className="research-body">
      <div className={`research-workbench${resourceId ? " research-workbench--resource" : ""}${readerResource ? " research-workbench--reader" : ""}${readerResource && focusReading ? " research-workbench--focused" : ""}`}>
        {(asPage || !resourceId) && <aside className="research-rail" aria-label={language === "zh-CN" ? "研究导航" : "Research navigation"}>
          <nav className="research-tabs" aria-label={language === "zh-CN" ? "研究功能" : "Research sections"}>{(["reading", "collections", "notes"] as const).map((value) => <button type="button" key={value} aria-current={!resourceId && tab === value ? "page" : undefined} onClick={() => showOverview(value)}>{c[value]}</button>)}</nav>
          {asPage && <section className={`research-recents${recentExpanded ? " research-recents--expanded" : ""}`}><h3>{language === "zh-CN" ? "最近阅读" : "Recently read"}</h3>
            <button className="research-recents-toggle" type="button" aria-expanded={recentExpanded} aria-controls="research-recents-list" onClick={() => setRecentExpanded((expanded) => !expanded)}>{language === "zh-CN" ? "最近阅读" : "Recently read"}{recent?.items.length ? ` (${recent.items.length})` : ""} <span aria-hidden="true">{recentExpanded ? "▴" : "▾"}</span></button>
            <div className="research-recents-list" id="research-recents-list">
              {recent?.items.length ? recent.items.slice(0, recentVisible).map((entry) => { const item = recent.resources.find((candidate) => candidate.resourceId === entry.resourceId); return item ? <button type="button" key={entry.resourceId} aria-current={resourceId === entry.resourceId ? "page" : undefined} onClick={() => selectDocument(item, entry.physicalPage)}><span>{item.title}</span><small>{c.atPage.replace("{page}", String(entry.physicalPage))}</small></button> : null; }) : <p>{language === "zh-CN" ? "阅读资料后，会在这里继续上次阅读。" : "Return to your recent documents here."}</p>}
              {(recentVisible < (recent?.items.length ?? 0) || recent?.nextBeforeId) && <button type="button" disabled={recentBusy} onClick={() => void moreRecent()}>{recentBusy ? c.loading : c.more}</button>}
            </div>
          </section>}
        </aside>}
        <main className={`research-main${readerResource ? " research-main--reader" : ""}`}>
          {resourceId && <div className="research-document-heading"><button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => showOverview()}>{c.all}</button><h3 title={resource?.resource.title}>{resource?.resource.title ?? (loading ? c.loading : c.unavailable)}</h3>{readerResource && <button type="button" className="button button--small button--quiet" aria-pressed={focusReading} disabled={locked} onClick={() => setFocusReading((value) => !value)}>{language === "zh-CN" ? (focusReading ? "显示侧栏" : "专注阅读") : (focusReading ? "Show sidebars" : "Focus reading")}</button>}{resource && sourceMatches && !readerResource && <button className="button button--small button--primary" type="button" disabled={locked} onClick={() => void open(resource.resource)}>{c.open}</button>}</div>}
          {!!error && <div className="research-error" role="alert"><p>{error instanceof ApiError && error.code === "concurrent_change" ? c.conflict : describeError(error, language)}</p><button className="button button--small" type="button" disabled={busy} onClick={refresh}>{c.retry}</button></div>}
          {progressIssue && progressIssue.key === sourceKey && <div className="research-progress-issue" role="status"><span>{progressIssue.conflict ? (language === "zh-CN" ? "另一窗口已更新阅读位置。当前页面保留，笔记未受影响。" : "Another window updated the reading position. Your current page and notes are preserved.") : (language === "zh-CN" ? "阅读位置暂未保存，可继续阅读后重试。" : "Reading position could not be saved. You can keep reading and retry.")}</span><button type="button" className="button button--small button--quiet" onClick={() => void resolveProgress(false)}>{language === "zh-CN" ? "继续当前页" : "Keep current page"}</button>{progressIssue.latest?.sourceId === resource?.resource.sourceId && <button type="button" className="button button--small button--quiet" onClick={() => void resolveProgress(true)}>{language === "zh-CN" ? "转到最新位置" : "Go to latest position"}</button>}</div>}
          {notice && <p role="status" className="research-notice">{notice}</p>}
          {loading && !readerResource && <p role="status" className="research-empty">{c.loading}</p>}
          {readerResource && <nav className="research-view-switch" aria-label={c.readerView}>
            <button type="button" aria-current={readerView === "source" ? "page" : undefined} onClick={() => setReaderView("source")}>{c.sourceView}</button>
            <button type="button" aria-current={readerView === "notes" ? "page" : undefined} onClick={() => setReaderView("notes")}>{c.notes}</button>
          </nav>}
          <div className={readerResource ? `research-resource-layout research-resource-layout--${readerView}` : "research-resource-content"}>
          {readerResource && progressReady !== sourceKey && <div className="research-reader"><p className="research-reader-message" role="status">{c.readerLoading}</p></div>}
          {readerResource && onAuthorizeReader && progressReady === sourceKey && <ResearchReader key={`${readerResource.resourceId}:${readerResource.sourceId}`} resource={readerResource}
            accountId={accountId} sourceControlsLocked={highlightBusy} onAuthorize={onAuthorizeReader} page={readerPage} onPageChange={(page) => { setRenderedPage(null); setReaderPage(page); }}
            onPageRendered={rendered} onPageUnavailable={() => setRenderedPage(null)} navigationRef={readerNavigation}
            highlights={highlights} onCreateHighlight={async (draft) => {
              if (highlightBusy || !readerResource || draft.physicalPage !== renderedPage) throw new Error(c.readerLoading);
              const key = sourceKey; setHighlightBusy(true);
              try { const saved = await api.createHighlight({ ...draft, resourceId: readerResource.resourceId, sourceId: readerResource.sourceId }); if (mounted.current && activeSource.current === key) { highlightChanges.current.set(saved.id, saved); setHighlights((previous) => [...previous.filter((item) => item.id !== saved.id), saved]); setNotice(c.saved); } }
              finally { if (mounted.current) setHighlightBusy(false); }
            }} onDeleteHighlight={async (highlight) => {
              const stored = highlights.find((entry) => entry.id === highlight.id); if (!stored) throw new Error(c.unavailable);
              const key = sourceKey; setHighlightBusy(true);
              try { const saved = await api.updateHighlight(stored, { color: stored.color, deleted: true }); if (mounted.current && activeSource.current === key) { highlightChanges.current.set(saved.id, saved); setHighlights((previous) => previous.filter((entry) => entry.id !== stored.id)); setNotice(c.saved); } }
              finally { if (mounted.current) setHighlightBusy(false); }
            }} onNewNote={() => { if (renderedPage !== readerPage || locked) return; setEditor({ note: null, resource: readerResource, initialPhysicalPage: readerPage, lockPage: true }); setFocusReading(false); setReaderView("notes"); }} />}
          <div className={readerResource ? "research-resource-details" : undefined} style={{ "--note-font-size": `${noteFontSize}px` } as CSSProperties}>
          {readerResource && <div className="research-note-tools"><span>{c.notes}</span><button type="button" className="button button--small button--quiet" disabled={noteFontSize <= 12} aria-label={language === "zh-CN" ? "减小笔记字号" : "Smaller note text"} onClick={() => setNoteFontSize((value) => Math.max(12, value - 1))}>A−</button><button type="button" className="button button--small button--quiet" disabled={noteFontSize >= 24} aria-label={language === "zh-CN" ? "增大笔记字号" : "Larger note text"} onClick={() => setNoteFontSize((value) => Math.min(24, value + 1))}>A+</button></div>}
          {readerResource && highlightCursor && <button type="button" className="button button--small" onClick={() => void run(async () => {
            const key = sourceKey;
            const next = await api.highlights({ resourceId: readerResource.resourceId, sourceId: readerResource.sourceId, beforeId: highlightCursor });
            if (!mounted.current || activeSource.current !== key) return;
            setHighlights((previous) => {
              const merged = new Map([...previous, ...next.items].map((item) => [item.id, item]));
              for (const [id, item] of highlightChanges.current) { if (item.deletedAt) merged.delete(id); else merged.set(id, item); }
              return [...merged.values()];
            });
            setHighlightCursor(next.nextBeforeId);
          })}>{language === "zh-CN" ? "加载更多高亮" : "Load more highlights"}</button>}
          {resource && <details className="research-settings-disclosure" open={readerResource ? undefined : true}><summary>{language === "zh-CN" ? "阅读状态与收藏集" : "Reading status & collections"}</summary>
          {resource && <section className="research-resource-settings" aria-label={c.status}>
        <div className="research-reading-controls"><label>{c.status}<select disabled={locked} value={resource.reading?.status ?? ""} onChange={(e) => {
          const status = (e.target.value || null) as ReadingState["status"];
          void run(async () => { const next = await api.saveReading(resourceId!, { status, important: resource.reading?.important ?? false, toCite: resource.reading?.toCite ?? false, revision: resource.reading?.revision ?? 0 }); setResource((r) => r ? { ...r, reading: next } : r); setNotice(c.saved); });
        }}><option value="">{c.none}</option><option value="queued">{c.queued}</option><option value="reading">{c.inProgress}</option><option value="finished">{c.finished}</option></select></label>
          {(["important", "toCite"] as const).map((flag) => <label className="research-check" key={flag}><input type="checkbox" disabled={locked} checked={resource.reading?.[flag] ?? false} onChange={(e) => {
            const checked = e.target.checked;
            void run(async () => { const next = await api.saveReading(resourceId!, { status: resource.reading?.status ?? null, important: resource.reading?.important ?? false, toCite: resource.reading?.toCite ?? false, revision: resource.reading?.revision ?? 0, [flag]: checked }); setResource((r) => r ? { ...r, reading: next } : r); setNotice(c.saved); });
          }} />{c[flag]}</label>)}
        </div>
        <fieldset className="research-collection-picks" disabled={locked}><legend>{c.collections}</legend>{collections.filter((entry) => !entry.archivedAt).map((collection) => <label className="research-check" key={collection.id}><input type="checkbox" checked={resource.collectionIds.includes(collection.id)} onChange={(e) => {
          const included = e.target.checked;
          void run(async () => { await changeMembership(collection, resourceId!, included); setResource((r) => r ? { ...r, collectionIds: included ? [...r.collectionIds, collection.id] : r.collectionIds.filter((id) => id !== collection.id) } : r); setNotice(included ? c.added : c.removed); });
        }} />{collection.name}</label>)}</fieldset>
      </section>}
      {(resourceId || tab === "collections") && <form className="research-collection-form" onSubmit={(event) => {
        event.preventDefault(); void run(async () => { await api.createCollection(collectionName); setCollectionName(""); refresh(); });
      }}><input aria-label={c.collectionName} value={collectionName} maxLength={120} disabled={formLocked} onChange={(e) => setCollectionName(e.target.value)} placeholder={c.collectionName} /><button className="button button--small" type="submit" disabled={formLocked || !collectionName.trim()}>{c.createCollection}</button>{collectionName && <button className="button button--small button--quiet" type="button" disabled={busy} onClick={() => { setCollectionName(""); setNotice(""); }}>{c.discard}</button>}</form>}
          </details>}
          {!resourceId && tab === "collections" && <form className="research-collection-form" onSubmit={(event) => {
            event.preventDefault(); void run(async () => { await api.createCollection(collectionName); setCollectionName(""); refresh(); });
          }}><input aria-label={c.collectionName} value={collectionName} maxLength={120} disabled={formLocked} onChange={(e) => setCollectionName(e.target.value)} placeholder={c.collectionName} /><button className="button button--small" type="submit" disabled={formLocked || !collectionName.trim()}>{c.createCollection}</button>{collectionName && <button className="button button--small button--quiet" type="button" disabled={busy} onClick={() => { setCollectionName(""); setNotice(""); }}>{c.discard}</button>}</form>}
      {(resourceId || tab === "notes") && <>
        <div className="research-section-heading"><h3 className={resourceId ? undefined : "visually-hidden"}>{c.notes}</h3><div><button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => setDeleted((value) => !value)}>{deleted ? c.active : c.deleted}</button>
          {resource && !deleted && <button className="button button--small button--primary" type="button" disabled={locked || resource.resource.mediaType !== "application/pdf" || !sourceMatches || Boolean(readerResource && renderedPage !== readerPage)} onClick={() => { const notePage = readerResource ? renderedPage : resourceId === initialResourceId ? initialPhysicalPage : undefined; setEditor({ note: null, resource: resource.resource, ...(notePage ? { initialPhysicalPage: notePage } : {}), lockPage: Boolean(readerResource) }); if (readerResource) setReaderView("notes"); }}>{c.newNote}</button>}</div></div>
        {readerResource && <p className="research-current-page">{renderedPage === readerPage ? c.atPage.replace("{page}", String(readerPage)) : c.readerLoading}</p>}
        {resource && !sourceMatches && <p role="status">{c.changedSource}</p>}
        {resource && resource.resource.mediaType !== "application/pdf" && <p className="research-muted">{c.noPdf}</p>}
        {editor && <NoteEditor key={editor.note?.id ?? "new"} editor={editor} api={api} busy={busy} run={run} onDirty={setNoteDirty}
          onCancel={finishEditor} onSaved={() => { finishEditor(); refresh(); setNotice(c.saved); }} />}
        {notes && (notes.items.length ? <div className="research-notes">{notes.items.map((note) => {
          const current = notes.resources.find((r) => r.resourceId === note.resourceId);
          const matches = current?.sourceId === note.sourceId;
          return <article className="research-note" key={note.id}><div className="research-note-meta"><span>{c.atPage.replace("{page}", String(note.physicalPage))}{note.locator ? ` · ${note.locator}` : ""}</span><time dateTime={note.updatedAt}>{formatDate(note.updatedAt, language)}</time></div>
            {!resourceId && <h4>{current?.title ?? c.unavailable}</h4>}
            <p className="research-note-body">{note.body}</p>
            {!current ? <p className="research-muted">{c.unavailable}</p> : !matches ? <p className="research-muted">{c.oldSource}</p> : null}
            <div className="research-row-actions"><button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => setEditor({ note, resource: current ?? { resourceId: note.resourceId, sourceId: note.sourceId, title: c.unavailable, mediaType: "application/pdf", libraryId: null } })}>{c.edit}</button>
              <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void run(async () => { await api.updateNote(note, { body: note.body, locator: note.locator, deleted: !note.deletedAt }); refresh(); })}>{note.deletedAt ? c.restore : c.remove}</button>
              {current && matches && <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => { if (readerResource && current.resourceId === readerResource.resourceId && current.sourceId === readerResource.sourceId) { void readerNavigation.current?.(note.physicalPage); setReaderView("source"); } else void open(current, note.physicalPage); }}>{readerResource && current.resourceId === readerResource.resourceId ? c.goToPage : c.open}</button>}</div>
          </article>;
        })}</div> : !loading && <p className="research-empty">{c.empty}</p>)}
        {notes?.nextBeforeId && <button className="button" type="button" disabled={locked} onClick={() => void moreNotes()}>{c.more}</button>}
      </>}
          {readerResource && <a className="research-inspector-export research-reader-export" href="/api/workspace/export" download="academiccloud-personal-workspace.ndjson">{c.export}<span aria-hidden="true">↗</span></a>}
          </div>
          </div>
      {!resourceId && tab === "reading" && reading && <>{resourceCards(reading.items.filter((entry) => entry.status || entry.important || entry.toCite), reading.resources)}{reading.nextBeforeId && <button className="button" disabled={locked} type="button" onClick={() => void run(async () => { const next = await api.reading(reading.nextBeforeId!); setReading({ ...next, items: [...reading.items, ...next.items], resources: [...reading.resources, ...next.resources] }); })}>{c.more}</button>}</>}
          {!resourceId && tab === "collections" && <>
        <div className="research-collections">{collections.map((collection) => <div className="research-collection" key={collection.id}><button className="research-collection-name" type="button" disabled={locked} aria-pressed={collectionId === collection.id} onClick={() => setCollectionId(collection.id)}>{collection.name}<span>{collection.itemCount}{collection.archivedAt ? ` · ${c.archived}` : ""}</span></button>
          <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => setEditingCollection(collection)} aria-label={`${c.editCollection}: ${collection.name}`}>{c.rename}</button><button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void run(async () => { await api.updateCollection(collection, collection.name, !collection.archivedAt); refresh(); })}>{collection.archivedAt ? c.restore : c.archive}</button></div>)}</div>
        {editingCollection && <form className="research-collection-form" onSubmit={(event) => { event.preventDefault(); void run(async () => {
          try { await api.updateCollection(editingCollection, editingCollection.name, !!editingCollection.archivedAt); }
          catch (caught) { if (caught instanceof ApiError && caught.code === "concurrent_change") setCollections(await api.collections()); throw caught; }
          setEditingCollection(null); refresh();
        }); }}><input aria-label={c.rename} value={editingCollection.name} maxLength={120} disabled={busy} onChange={(e) => setEditingCollection({ ...editingCollection, name: e.target.value })} /><button className="button" type="submit" disabled={busy || !editingCollection.name.trim() || collectionConflict !== null}>{c.save}</button><button className="button button--quiet" type="button" disabled={busy} onClick={() => setEditingCollection(null)}>{c.cancel}</button></form>}
        {editingCollection && collectionConflict && <div className="research-conflict"><p>{collectionConflict.name}</p><button className="button" type="button" disabled={busy} onClick={() => setEditingCollection({ ...collectionConflict, name: editingCollection.name })}>{c.useDraft}</button></div>}
        {selectedCollection && <h3 className="research-section-heading">{selectedCollection.name}</h3>}{items && resourceCards(items.items, items.resources)}
        {items?.nextBeforeId && <button className="button" type="button" disabled={locked} onClick={() => void run(async () => { const next = await api.collectionItems(collectionId!, items.nextBeforeId!); setItems({ ...next, items: [...items.items, ...next.items], resources: [...items.resources, ...next.resources] }); })}>{c.more}</button>}
          </>}
        </main>
        <aside className="research-inspector" aria-label={c.overview}>
          <div className="research-inspector-heading"><strong>{c.overview}</strong></div>
          <dl className="research-inspector-facts">
            <div><dt>{c.notes}</dt><dd>{notes?.items.length ?? 0}</dd></div>
            <div><dt>{c.collections}</dt><dd>{collections.length}</dd></div>
            <div><dt>{c.status}</dt><dd>{resourceId ? readingStatusLabel(resource?.reading?.status) : c.all}</dd></div>
          </dl>
          <a className="research-inspector-export" href="/api/workspace/export" download="academiccloud-personal-workspace.ndjson">{c.export}<span aria-hidden="true">↗</span></a>
        </aside>
      </div>
    </div>
  </ResearchFrame>;
}

function ResearchFrame({ asPage, dialogRef, children }: {
  asPage: boolean;
  dialogRef: ReturnType<typeof useModalDialog>;
  children: ReactNode;
}) {
  if (asPage) return <section className="research-dialog research-page" aria-labelledby="research-title">{children}</section>;
  return <dialog ref={dialogRef} className="research-dialog" aria-labelledby="research-title">{children}</dialog>;
}

function ResearchReader({ resource, accountId, sourceControlsLocked, onAuthorize, page, onPageChange, onPageRendered, onPageUnavailable, navigationRef, highlights, onCreateHighlight, onDeleteHighlight, onNewNote }: {
  accountId?: string | undefined;
  sourceControlsLocked: boolean;
  highlights: TextHighlight[];
  onCreateHighlight: (highlight: Omit<PdfHighlight, "id">) => Promise<void>;
  onDeleteHighlight: (highlight: PdfHighlight) => Promise<void>;
  onNewNote: () => void;
  resource: WorkspaceResource;
  onAuthorize: (resource: WorkspaceResource) => Promise<ReaderAuthorization>;
  page: number;
  onPageChange: (page: number) => void;
  onPageRendered: (page: number) => void;
  onPageUnavailable: () => void;
  navigationRef: RefObject<((page: number) => Promise<boolean>) | null>;
}) {
  const { language } = useLanguage();
  const c = COPY[language];
  const [authorization, setAuthorization] = useState<ReaderAuthorization | null>(null);
  const [authorizing, setAuthorizing] = useState(true);
  const [linkStale, setLinkStale] = useState(false);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const currentAuthorization = useRef<ReaderAuthorization | null>(null);
  const renewal = useRef<Promise<boolean> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [localFile, setLocalFile] = useState<File | undefined>();
  const [localBusy, setLocalBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const [localRevision, setLocalRevision] = useState(0);
  const localInput = useRef<HTMLInputElement>(null);
  const localOperation = useRef<AbortController | null>(null);
  const localPreferred = useRef(true);
  const localKey = accountId ? readerLocalKey(accountId, resource.resourceId, resource.sourceId) : null;
  const zh = language === "zh-CN";
  const pageCount = useRef<number | null>(null);
  const callbacks = useRef({ onPageRendered, onPageUnavailable });
  callbacks.current = { onPageRendered, onPageUnavailable };
  const request = useRef(0);
  const mounted = useRef(false);
  const authorizeRef = useRef(onAuthorize);
  authorizeRef.current = onAuthorize;
  const authorizeSource = async (): Promise<boolean> => {
    const current = ++request.current;
    localOperation.current?.abort();
    const controller = new AbortController(); localOperation.current = controller;
    if (!currentAuthorization.current) callbacks.current.onPageUnavailable();
    setError(null); setAuthorizing(true);
    try {
      const next = await authorizeRef.current(resource);
      if (!mounted.current || current !== request.current) return false;
      if (!localFile && localPreferred.current && localKey && !currentAuthorization.current) {
        const restored = await restoreReaderFile(localKey, next, controller.signal);
        if (!mounted.current || current !== request.current || controller.signal.aborted) return false;
        setLocalFile(restored.file);
        if (restored.needsSelection) setLocalMessage(zh ? "本地文件已移动、改变或需要重新授权，请重新选择。" : "Reselect the local file: it moved, changed, or needs permission.");
      }
      currentAuthorization.current = next;
      setAuthorization(next); setLinkStale(false);
      return true;
    } catch (caught) {
      if (mounted.current && current === request.current) {
        if (caught instanceof ApiError && [401,403,404,409].includes(caught.status)) { currentAuthorization.current = null; setAuthorization(null); setLocalFile(undefined); callbacks.current.onPageUnavailable(); }
        setError(caught);
      }
      return false;
    } finally {
      if (mounted.current && current === request.current) setAuthorizing(false);
    }
  };
  const authorize = (): Promise<boolean> => {
    if (renewal.current) return renewal.current;
    const pending = authorizeSource().finally(() => { if (renewal.current === pending) renewal.current = null; });
    renewal.current = pending; return pending;
  };
  const getRangeUrl = async (): Promise<string> => {
    const active = currentAuthorization.current;
    if (!active || (active.expiresAt && Date.parse(active.expiresAt) - 10_000 <= Date.now())) {
      if (!await authorize()) throw new Error("Reader authorization unavailable");
    }
    const next = currentAuthorization.current;
    if (!mounted.current || !next) throw new Error("Reader closed");
    return next.url;
  };
  useEffect(() => {
    mounted.current = true;
    void authorize();
    return () => { mounted.current = false; request.current++; localOperation.current?.abort(); };
  }, [resource.resourceId, resource.sourceId]);
  useEffect(() => {
    const refresh = () => setLocalRevision((value) => value + 1);
    window.addEventListener(LOCAL_LIBRARY_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_LIBRARY_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (!localPreferred.current || !localRevision || !authorization || !localKey || sourceControlsLocked || localBusy || localFile) return;
    const controller = new AbortController();
    void restoreReaderFile(localKey, authorization, controller.signal).then((restored) => {
      if (!mounted.current || controller.signal.aborted || !restored.file) return;
      localPreferred.current = true; setLocalFile(restored.file);
      setLocalMessage(zh ? "已自动关联本地原件，资料库与研究共用此文件。" : "Local original linked; Library and Research share this file.");
    });
    return () => controller.abort();
  }, [localRevision, authorization, localKey, sourceControlsLocked, localBusy, localFile, zh]);
  useEffect(() => {
    if (!authorization?.expiresAt) return;
    const refreshAt = Date.parse(authorization.expiresAt) - 10_000;
    if (!Number.isFinite(refreshAt) || refreshAt <= Date.now()) { setLinkStale(true); return; }
    const timer = window.setTimeout(() => setLinkStale(true), refreshAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [authorization]);
  const readerUrl = authorization ? (() => {
    const url = new URL(authorization.url, window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    hash.set("page", String(page));
    url.hash = hash.toString();
    return url.toString();
  })() : null;
  const goToPage = async (next: number) => {
    if (authorizing || localBusy || !Number.isSafeInteger(next) || next < 1 || next > (pageCount.current ?? 1_000_000)) return false;
    if ((!authorization || linkStale || (authorization.expiresAt && Date.parse(authorization.expiresAt) - 10_000 <= Date.now())) && !(await authorize())) return false;
    onPageChange(next);
    return true;
  };
  const useLocalFile = async (file: File, handle: RecoverableFileHandle | null) => {
    if (sourceControlsLocked || localBusy || authorizing) return;
    localOperation.current?.abort();
    const controller = new AbortController(); localOperation.current = controller;
    const current = ++request.current;
    setLocalBusy(true); setLocalMessage(zh ? "正在核对本地原件…" : "Checking local original…");
    try {
      const next = await authorizeRef.current(resource);
      await verifyReaderFile(file, next, controller.signal);
      if (!mounted.current || current !== request.current || controller.signal.aborted) return;
      const remembered = localKey ? await rememberReaderFile(localKey, handle) : false;
      if (!mounted.current || current !== request.current || controller.signal.aborted) return;
      localPreferred.current = true;
      currentAuthorization.current = next;
      setLocalFile(file); setAuthorization(next); setError(null); setLinkStale(false);
      setLocalMessage(remembered
        ? (zh ? "已记住本地原件；下次授权有效时自动读取。" : "Local original remembered; reused while permission remains valid.")
        : (zh ? "已从本地读取；此浏览器重新打开后需再次选择文件。" : "Reading locally; select the file again after reopening this browser."));
    } catch (caught) {
      if (!mounted.current || controller.signal.aborted) return;
      setLocalMessage(caught instanceof Error && caught.message === "reader_file_mismatch"
        ? (zh ? "文件与此资料的原件不一致，请选择下载的同一版本 PDF。" : "This file does not match the original. Select the same PDF version.")
        : caught instanceof Error && caught.message === "reader_identity_unavailable"
          ? (zh ? "暂时无法核对原件，请刷新后重试。" : "Original identity unavailable. Refresh and retry.")
          : describeError(caught, language));
    } finally { if (mounted.current && current === request.current) setLocalBusy(false); }
  };
  const selectLocal = async () => {
    const picker = (window as Window & { showOpenFilePicker?: ReaderFilePicker }).showOpenFilePicker;
    if (!picker) { localInput.current?.click(); return; }
    try {
      const [handle] = await picker({ multiple: false, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
      if (handle) await useLocalFile(await handle.getFile(), handle);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      // Embedded/older browsers can expose the picker but disallow it.
      localInput.current?.click();
    }
  };
  const useOnline = async () => {
    if (sourceControlsLocked || localBusy) return;
    localOperation.current?.abort(); localPreferred.current = false;
    // The reading preference is session-local; retain the stable file association
    // so downloading again after an online rename reuses the same local original.
    if (!mounted.current) return;
    setLocalFile(undefined); setLocalMessage("");
    await authorize();
  };
  useImperativeHandle(navigationRef, () => goToPage);
  return <section className="research-reader" aria-label={c.sourceView}>
    <div className="research-reader-content">
      {authorizing && !authorization && <p role="status" className="research-reader-message">{c.readerLoading}</p>}
      {error !== null && <div className="research-reader-message" role="alert"><p>{error instanceof ApiError && error.code === "concurrent_change" ? c.readerSourceChanged : describeError(error, language)}</p><button className="button button--small" type="button" onClick={() => void authorize()}>{c.retryReader}</button></div>}
      {authorization && <PdfReader url={authorization.sizeBytes ? `${resource.resourceId}:${resource.sourceId}:${documentEpoch}` : authorization.url} remoteSource={authorization.sizeBytes ? { size: authorization.sizeBytes, getUrl: getRangeUrl } : undefined} localFile={localFile} title={resource.title} page={page} onPageChange={(next) => void goToPage(next)}
        highlights={highlights} onCreateHighlight={onCreateHighlight} onDeleteHighlight={onDeleteHighlight} onNewNote={onNewNote}
        navigationPending={authorizing || localBusy} onRetry={() => { void authorize().then((ok) => { if (ok) setDocumentEpoch((value) => value + 1); }); }} onDocumentLoaded={(count) => { pageCount.current = count; }}
        onPageRendered={(next) => callbacks.current.onPageRendered(next)} onPageUnavailable={() => callbacks.current.onPageUnavailable()} />}
    </div>
    <div className="research-reader-toolbar research-reader-file-actions">
      <input ref={localInput} type="file" accept="application/pdf,.pdf" hidden aria-label={zh ? "选择本地原件" : "Select local original"} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void useLocalFile(file, null); }} />
      <span className="research-reader-source-kind">{localFile ? (zh ? "本地原件" : "Local original") : (zh ? "在线原件" : "Online original")}</span>
      <button className="button button--small button--quiet" type="button" disabled={authorizing || localBusy || sourceControlsLocked} onClick={() => localInput.current?.click()}>{zh ? "使用本地原件" : "Use local original"}</button>
      {typeof (window as Window & { showOpenFilePicker?: ReaderFilePicker }).showOpenFilePicker === "function" && <button className="button button--small button--quiet" type="button" disabled={authorizing || localBusy || sourceControlsLocked} onClick={() => void selectLocal()} title={zh ? "选择文件并记住读取授权，下次优先使用" : "Remember read access and prefer this file next time"}>{zh ? "关联并记住" : "Link and remember"}</button>}
      {localFile && <button className="button button--small button--quiet" type="button" disabled={authorizing || localBusy || sourceControlsLocked} onClick={() => void useOnline()}>{zh ? "切回在线原件" : "Use online original"}</button>}
      {linkStale && <span className="research-reader-expired" role="status">{c.readerExpired}</span>}
      {readerUrl && !linkStale && <a className="button button--small button--quiet" href={readerUrl} target="_blank" rel="noreferrer">{c.openNewTab}</a>}
      <button className="button button--small button--quiet" type="button" disabled={!authorization} onClick={() => { if (authorization) void authorization.download().catch(setError); }}>{c.downloadSource}</button>
    </div>
    {localMessage && <p className="research-local-message" role="status">{localMessage}</p>}
  </section>;
}

function NoteEditor({ editor, api, busy, run, onDirty, onCancel, onSaved }: {
  editor: Editor; api: WorkspaceApi; busy: boolean; run: (work: () => Promise<void>) => Promise<void>;
  onDirty: (dirty: boolean) => void; onCancel: () => void; onSaved: () => void;
}) {
  const { language } = useLanguage(); const c = COPY[language];
  const [body, setBody] = useState(editor.note?.body ?? "");
  const [baseline, setBaseline] = useState(editor.note);
  const [latest, setLatest] = useState<PageNote | null>(null);
  const [locator, setLocator] = useState(editor.note?.locator ?? "");
  const initialPage = editor.note?.physicalPage ?? editor.initialPhysicalPage ?? 1;
  const [physicalPage, setPhysicalPage] = useState(String(initialPage));
  const dirty = body !== (editor.note?.body ?? "") || locator !== (editor.note?.locator ?? "") || physicalPage !== String(initialPage);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const content = { body: body.trim(), locator: locator.trim() || null };
      if (baseline) {
        try { await api.updateNote(baseline, { ...content, deleted: !!baseline.deletedAt }); }
        catch (caught) {
          if (caught instanceof ApiError && caught.code === "concurrent_change") {
            const current = await api.note(baseline.id);
            setLatest(current.note);
          }
          throw caught;
        }
      } else await api.createNote({ ...content, resourceId: editor.resource.resourceId, sourceId: editor.resource.sourceId, physicalPage: Number(physicalPage) });
      onSaved();
    });
  };
  return <form className="research-note-editor" onSubmit={save} aria-label={editor.note ? c.edit : c.newNote}>
    <div className="research-note-location"><label>{c.page}<input type="number" min={1} max={1_000_000} step={1} required disabled={busy || !!editor.note || editor.lockPage} value={physicalPage} onChange={(e) => setPhysicalPage(e.target.value)} /></label><label>{c.locator}<input maxLength={200} disabled={busy} value={locator} onChange={(e) => setLocator(e.target.value)} /></label></div>
    {!editor.note && <p className="research-muted">{editor.lockPage ? (language === "zh-CN" ? "已关联创建笔记时正在阅读的页面。" : "Linked to the page you were reading when this note was started.") : c.physicalHelp}</p>}
    <label>{c.body}<textarea autoFocus required rows={7} maxLength={20_000} disabled={busy} value={body} onChange={(e) => setBody(e.target.value)} /></label>
    {latest && <div className="research-conflict"><h4>{c.latest}</h4>{latest.locator && <p>{latest.locator}</p>}<p className="research-note-body">{latest.body}</p><button className="button" type="button" disabled={busy} onClick={() => { setBaseline(latest); setLatest(null); }}>{c.useDraft}</button></div>}
    <div className="research-row-actions"><button className="button button--primary" type="submit" disabled={busy || !body.trim() || latest !== null}>{c.save}</button><button className="button button--quiet" type="button" disabled={busy} onClick={onCancel}>{dirty ? c.discard : c.cancel}</button></div>
  </form>;
}
