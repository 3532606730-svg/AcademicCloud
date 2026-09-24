import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "./api.ts";
import type { CollectionItem, PageNote, ReadingState, ResearchCollection, ResourceWorkspace, WorkspaceApi, WorkspacePage, WorkspaceResource } from "./workspace-api.ts";
import { useLanguage } from "./i18n-react.tsx";
import { describeError, formatDate } from "./i18n.ts";
import { useModalDialog } from "./use-modal-dialog.ts";
import { useHistoryDialog } from "./view-context.ts";
import "./workspace.css";

const COPY = {
  "zh-CN": {
    overview: "研究概览", notes: "页码笔记", reading: "我的资料", collections: "收藏集", close: "关闭我的研究", back: "返回",
    empty: "暂无记录", loading: "正在加载…", retry: "重试", more: "加载更多", all: "全部研究", saved: "已保存",
    collectionName: "收藏集名称", createCollection: "新建收藏集", archive: "归档", restore: "恢复", archived: "已归档",
    rename: "重命名", save: "保存", cancel: "取消", discard: "放弃更改", deleted: "已删除笔记", active: "当前笔记",
    newNote: "写页码笔记", edit: "编辑", remove: "移入笔记回收站", page: "PDF 页码", locator: "书上页码 / 卷叶（可选）",
    body: "笔记内容", physicalHelp: "从 PDF 首页计数；书上页码可另填。", open: "打开资料", atPage: "PDF 第 {page} 页",
    unavailable: "资料暂不可用", oldSource: "笔记属于旧文件版本", changedSource: "文件内容已更新，请重新打开资料后写笔记。",
    noPdf: "页码笔记适用于 PDF。", unsaved: "笔记尚未保存，请先保存或放弃更改。", unsavedCollection: "收藏集更改尚未保存，请先保存或放弃更改。", conflict: "内容已在别处修改。草稿已保留，请重新加载后核对。",
    export: "导出我的研究", status: "阅读状态", none: "未设置", queued: "待读", inProgress: "在读", finished: "已读", latest: "最新已保存内容", useDraft: "核对后使用我的草稿",
    important: "重要", toCite: "待引用", added: "已加入收藏集", removed: "已移出收藏集", removeItem: "移出收藏集", editCollection: "编辑收藏集",
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
  },
};

type Editor = { note: PageNote | null; resource: WorkspaceResource; initialPhysicalPage?: number };
export function WorkspaceDialog({ api, initialResourceId, expectedSourceId, initialPhysicalPage, returnFocus, onClose, onOpenResource, onRouteChange, onRegisterNavigationGuard, asPage = false }: {
  api: WorkspaceApi;
  initialResourceId?: string;
  expectedSourceId?: string;
  initialPhysicalPage?: number;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onOpenResource: (resource: WorkspaceResource, physicalPage?: number) => Promise<() => void>;
  onRouteChange?: (resource: WorkspaceResource | null) => void;
  onRegisterNavigationGuard?: (guard: (() => boolean) | null) => void;
  asPage?: boolean;
}) {
  const { language, t } = useLanguage();
  const c = COPY[language];
  const readingStatusLabel = (status: ReadingState["status"] | null | undefined) => status === "finished" ? c.finished : status === "reading" ? c.inProgress : status === "queued" ? c.queued : c.none;
  const [resourceId, setResourceId] = useState(initialResourceId);
  const [resource, setResource] = useState<ResourceWorkspace | null>(null);
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [notes, setNotes] = useState<WorkspacePage<PageNote> | null>(null);
  const [reading, setReading] = useState<WorkspacePage<ReadingState> | null>(null);
  const [items, setItems] = useState<WorkspacePage<CollectionItem> | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [tab, setTab] = useState<"notes" | "reading" | "collections">("notes");
  const [deleted, setDeleted] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const pendingInitialNote = useRef(initialPhysicalPage !== undefined);
  const [noteDirty, setNoteDirty] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [editingCollection, setEditingCollection] = useState<ResearchCollection | null>(null);
  const collectionDirty = Boolean(collectionName) || Boolean(editingCollection && editingCollection.name !== collections.find((entry) => entry.id === editingCollection.id)?.name);
  const dirty = noteDirty || collectionDirty;
  const mounted = useRef(true);
  const canLeave = () => {
    if (dirty || busy) { setNotice(collectionDirty ? c.unsavedCollection : c.unsaved); return false; }
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
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setResource(null); setNotes(null); setReading(null); setItems(null);
    const load = async () => {
      const [nextCollections, nextResource, nextNotes, nextReading, nextItems] = await Promise.all([
        api.collections(controller.signal),
        resourceId ? api.resource(resourceId, controller.signal).catch((caught) => {
          if (caught instanceof ApiError && caught.status === 404) return null;
          throw caught;
        }) : Promise.resolve(null),
        tab === "notes" || resourceId ? api.notes({ ...(resourceId ? { resourceId } : {}), deleted }, controller.signal) : Promise.resolve(null),
        !resourceId && tab === "reading" ? api.reading(undefined, controller.signal) : Promise.resolve(null),
        !resourceId && tab === "collections" && collectionId ? api.collectionItems(collectionId, undefined, controller.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      setCollections(nextCollections); setResource(nextResource); setNotes(nextNotes); setReading(nextReading); setItems(nextItems); setLoading(false);
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
  const refresh = () => setReload((n) => n + 1);
  const finishEditor = () => { setEditor(null); setNoteDirty(false); setNotice(""); };
  const sourceMatches = !expectedSourceId || resourceId !== initialResourceId || resource?.resource.sourceId === expectedSourceId;
  useEffect(() => {
    if (!pendingInitialNote.current || !initialPhysicalPage || !resource || resourceId !== initialResourceId || !sourceMatches || resource.resource.mediaType !== "application/pdf") return;
    pendingInitialNote.current = false;
    setEditor({ note: null, resource: resource.resource, initialPhysicalPage });
  }, [initialPhysicalPage, initialResourceId, resource, resourceId, sourceMatches]);
  const selectedCollection = collections.find((entry) => entry.id === collectionId);
  const latestCollection = editingCollection ? collections.find((entry) => entry.id === editingCollection.id) : undefined;
  const collectionConflict = latestCollection && latestCollection.revision !== editingCollection?.revision ? latestCollection : null;
  const formLocked = busy || editor !== null || editingCollection !== null;
  const locked = formLocked || Boolean(collectionName);
  const changeMembership = async (collection: ResearchCollection, fileId: string, included: boolean) => {
    const next = await api.setCollectionItem(collection, fileId, included);
    setCollections((current) => current.map((entry) => entry.id === next.id ? next : entry));
  };
  const open = (entry: WorkspaceResource, physicalPage?: number) => run(async () => {
    const commit = await onOpenResource(entry, physicalPage);
    if (asPage) commit();
    else close.replaceWith(commit);
  });
  const moreNotes = () => run(async () => {
    const next = await api.notes({ ...(resourceId ? { resourceId } : {}), deleted, beforeId: notes!.nextBeforeId! });
    if (mounted.current) setNotes((current) => current ? { ...next, items: [...current.items, ...next.items], resources: [...current.resources, ...next.resources] } : current);
  });
  const resourceCards = (entries: Array<{ resourceId: string }>, resources: WorkspaceResource[]) => entries.length ? <div className="research-resources">{entries.map((entry) => {
    const current = resources.find((r) => r.resourceId === entry.resourceId);
    const state = "status" in entry ? entry as ReadingState : undefined;
    return <article className="research-resource" key={entry.resourceId}>
      <button className="research-resource-title" type="button" disabled={locked || !current} onClick={() => { if (!current) return; setResourceId(entry.resourceId); onRouteChange?.(current); }}>{current?.title ?? c.unavailable}</button>
      {state && <div className="research-badges">{state.status && <span>{state.status === "reading" ? c.inProgress : state.status === "finished" ? c.finished : c.queued}</span>}{state.important && <span>{c.important}</span>}{state.toCite && <span>{c.toCite}</span>}</div>}
      <div className="research-row-actions">{current && <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void open(current)}>{c.open}</button>}
        {tab === "collections" && selectedCollection && <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void run(async () => { await changeMembership(selectedCollection, entry.resourceId, false); refresh(); })}>{c.removeItem}</button>}</div>
    </article>;
  })}</div> : <p className="research-empty">{c.empty}</p>;
  return <ResearchFrame asPage={asPage} dialogRef={dialog}>
    <header className="research-header"><h2 id="research-title">{t("workspace.title")}</h2><button className="button button--quiet" type="button" onClick={close} aria-label={asPage ? c.back : c.close}>{asPage ? c.back : t("preview.close")}</button></header>
    <div className="research-body">
      <div className={`research-workbench${resourceId ? " research-workbench--resource" : ""}`}>
        {!resourceId && <aside className="research-rail" aria-label={t("workspace.title")}>
          <nav className="research-tabs" aria-label={t("workspace.title")}>{(["notes", "reading", "collections"] as const).map((value) => <button type="button" key={value} disabled={locked} aria-current={tab === value ? "page" : undefined} onClick={() => { setTab(value); setCollectionId(null); setNotice(""); }}>{c[value]}</button>)}</nav>
        </aside>}
        <main className="research-main">
          {resourceId && <div className="research-document-heading"><button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => { setResourceId(undefined); setCollectionId(null); onRouteChange?.(null); }}>{c.all}</button><h3>{resource?.resource.title ?? (loading ? c.loading : c.unavailable)}</h3>{resource && sourceMatches && <button className="button button--small button--primary" type="button" disabled={locked} onClick={() => void open(resource.resource)}>{c.open}</button>}</div>}
          {!!error && <div className="research-error" role="alert"><p>{error instanceof ApiError && error.code === "concurrent_change" ? c.conflict : describeError(error, language)}</p><button className="button button--small" type="button" disabled={busy} onClick={refresh}>{c.retry}</button></div>}
          {notice && <p role="status" className="research-notice">{notice}</p>}
          {loading && <p role="status" className="research-empty">{c.loading}</p>}
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
      {(resourceId || tab === "notes") && <>
        <div className="research-section-heading"><h3 className={resourceId ? undefined : "visually-hidden"}>{c.notes}</h3><div><button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => setDeleted((value) => !value)}>{deleted ? c.active : c.deleted}</button>
          {resource && !deleted && <button className="button button--small button--primary" type="button" disabled={locked || resource.resource.mediaType !== "application/pdf" || !sourceMatches} onClick={() => setEditor({ note: null, resource: resource.resource, ...(resourceId === initialResourceId && initialPhysicalPage ? { initialPhysicalPage } : {}) })}>{c.newNote}</button>}</div></div>
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
              {current && matches && <button className="button button--small button--quiet" type="button" disabled={locked} onClick={() => void open(current, note.physicalPage)}>{c.open}</button>}</div>
          </article>;
        })}</div> : !loading && <p className="research-empty">{c.empty}</p>)}
        {notes?.nextBeforeId && <button className="button" type="button" disabled={locked} onClick={() => void moreNotes()}>{c.more}</button>}
      </>}
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
    <div className="research-note-location"><label>{c.page}<input type="number" min={1} max={1_000_000} step={1} required disabled={busy || !!editor.note} value={physicalPage} onChange={(e) => setPhysicalPage(e.target.value)} /></label><label>{c.locator}<input maxLength={200} disabled={busy} value={locator} onChange={(e) => setLocator(e.target.value)} /></label></div>
    {!editor.note && <p className="research-muted">{c.physicalHelp}</p>}
    <label>{c.body}<textarea autoFocus required rows={7} maxLength={20_000} disabled={busy} value={body} onChange={(e) => setBody(e.target.value)} /></label>
    {latest && <div className="research-conflict"><h4>{c.latest}</h4>{latest.locator && <p>{latest.locator}</p>}<p className="research-note-body">{latest.body}</p><button className="button" type="button" disabled={busy} onClick={() => { setBaseline(latest); setLatest(null); }}>{c.useDraft}</button></div>}
    <div className="research-row-actions"><button className="button button--primary" type="submit" disabled={busy || !body.trim() || latest !== null}>{c.save}</button><button className="button button--quiet" type="button" disabled={busy} onClick={onCancel}>{dirty ? c.discard : c.cancel}</button></div>
  </form>;
}
