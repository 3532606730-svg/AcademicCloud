import { useEffect, useRef, useState } from "react";
import { LOCAL_OCR_BOOK_FEATURE } from "@academiccloud/compute-contracts";
import type { LocalOcrBook, LocalOcrBookJob, LocalOcrDevice } from "./local-ocr-api.ts";
import { LocalOcrBookController, backgroundBookBusy, bookOcrSummary, readBookOcrSnapshot, validateBookJob, type BookOcrDocument, type BookOcrState } from "./local-ocr-book-controller.ts";
import { OcrConnectionDialog, type ReaderLocalOcr } from "./local-ocr-ui.tsx";
import { useLanguage } from "./i18n-react.tsx";

const busy = (state: BookOcrState["state"]) => ["checking", "waiting", "capturing", "queued", "running"].includes(state);
const errorCode = (error: unknown) => error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : "request_failed";
const supportsBook = (device: LocalOcrDevice | undefined) => device?.transportFeatures?.includes(LOCAL_OCR_BOOK_FEATURE) ?? false;
const sourceLost = (code: string) => ["not_found", "source_changed", "access_revoked", "invalid_result"].includes(code);
function message(code: string | undefined, zh: boolean) {
  const messages: Record<string, [string, string]> = {
    book_page_limit: ["整书识别目前支持最多500页的PDF。", "Whole-book OCR supports PDFs of up to 500 pages."],
    book_quota_exceeded: ["剩余私有结果额度不足以识别未完成页面。", "Remaining private-result quota cannot cover the missing pages."],
    account_busy: ["你的账户正在处理另一个识别请求，结束后可继续。", "Your account has another OCR request. Resume after it ends."],
    engine_busy: ["设备正忙，空闲后可继续。", "Device is busy. Resume when it is available."],
    engine_failed: ["本页识别失败。检查连接器后可继续。", "This page failed. Check your connector, then resume."],
    device_offline: ["设备离线，请启动连接器后继续。", "Device is offline. Start your connector, then resume."],
    device_unavailable: ["设备连接已失效，请重新配对并手动继续。", "Device connection is unavailable. Pair again, then resume manually."],
    device_feature_unsupported: ["该连接器需要更新才能在网站关闭后继续整书任务。", "Update this connector to continue whole-book jobs after closing the website."],
    expired: ["请求已过期，检查设备后可手动继续；整书任务保留七天。", "Request expired. Check the device, then resume manually; book jobs are retained for seven days."],
    invalid_result: ["结果身份或内容未通过验证，请重新打开原件。", "Result identity or content failed validation. Reopen the source."],
    not_found: ["原件或连接已不可访问，请重新打开资料并检查设备。", "Source or connection is unavailable. Reopen the resource and check your device."],
    source_changed: ["原件版本已变化，请重新打开资料。", "Source version changed. Reopen the resource."],
    access_revoked: ["资料或设备权限已失效，请重新打开资料并检查连接。", "Resource or device access was revoked. Reopen the resource and check the connection."],
    limit_exceeded: ["已达到识别额度或同时请求上限，请检查已保存数量和设备。", "OCR quota or request capacity reached. Check saved results and your device."],
    quota_exceeded: ["剩余私有结果额度不足，识别未开始。", "Private-result quota is insufficient. OCR was not started."],
    ocr_image_too_large: ["本页PNG超过2MiB，识别已停止。", "This page PNG exceeds 2 MiB. OCR stopped."],
    request_inactive: ["请求已结束，核对保存进度后可继续。", "Request ended. Check saved progress, then resume."],
    idempotency_conflict: ["待确认请求的设备或原件不一致，请刷新任务后再操作。", "The pending request has a different device or source. Refresh the job before continuing."],
  };
  return messages[code ?? ""]?.[zh ? 0 : 1] ?? (zh ? "操作未完成，检查连接后可继续。" : "Operation did not finish. Check the connection, then resume.");
}
type PendingStart = { clientRequestId: string; deviceId: string };
function pendingStart(key: string): PendingStart | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    return value && typeof value === "object" && "clientRequestId" in value && "deviceId" in value && typeof value.clientRequestId === "string" && typeof value.deviceId === "string" ? value as PendingStart : null;
  } catch { return null; }
}
function retainStart(key: string, value: PendingStart | null) {
  try { if (value) window.sessionStorage.setItem(key, JSON.stringify(value)); else window.sessionStorage.removeItem(key); } catch { /* The in-tab request retains its key in memory. */ }
}

export function WholeBookOcr({ connection, document: sourceDocument, pageCount, focusReading = false, onReview, onCheckpoint, blocked = false, onBusyChange }: {
  connection: ReaderLocalOcr; document: BookOcrDocument | null; pageCount: number | null;
  onReview: (physicalPage: number) => void; onCheckpoint?: (() => void) | undefined;
  blocked?: boolean; onBusyChange?: ((value: boolean) => void) | undefined;
  focusReading?: boolean;
}) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const { api, accountId, resourceId, sourceId } = connection;
  const bookKey = JSON.stringify([accountId, resourceId, sourceId, pageCount]);
  const storageKey = `academiccloud.ocr.pending-book:${bookKey}`;
  const current = useRef({ bookKey, sourceDocument }); current.current = { bookKey, sourceDocument };
  const controller = useRef<LocalOcrBookController | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (focusReading) setOpen(false); }, [focusReading]);
  const [devices, setDevices] = useState<LocalOcrDevice[]>([]);
  const [deviceId, setDeviceId] = useState(""); const [deviceAccount, setDeviceAccount] = useState(accountId);
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<BookOcrState>({ state: "paused", book: null, physicalPage: null });
  const [job, setJob] = useState<LocalOcrBookJob | null>(null);
  const [loaded, setLoaded] = useState(false); const [changing, setChanging] = useState(false);
  const [uncertain, setUncertain] = useState(false); const pending = useRef<PendingStart | null>(null);
  const latest = useRef({ state, job, changing }); latest.current = { state, job, changing };
  const [retainedKey, setRetainedKey] = useState(bookKey); const [notice, setNotice] = useState("");
  const request = useRef(0); const mounted = useRef(true); const checkpoint = useRef(onCheckpoint); checkpoint.current = onCheckpoint;
  const input: LocalOcrBook | null = Number.isSafeInteger(pageCount) && pageCount !== null && pageCount >= 1 && pageCount <= 500 ? { resourceId, sourceId, pageCount } : null;
  const currentRequest = (epoch: number) => mounted.current && current.current.bookKey === bookKey && epoch === request.current;
  const refreshDevices = async (signal?: AbortSignal) => {
    const values = await api.devices(signal);
    if (!mounted.current || signal?.aborted || current.current.bookKey !== bookKey) return;
    setDevices(values); setDeviceAccount(accountId);
    setDeviceId((id) => values.some((device) => device.id === id && !device.revokedAt && Date.parse(device.tokenExpiresAt) > Date.now()) ? id : (values.find((device) => device.online && !device.revokedAt && Date.parse(device.tokenExpiresAt) > Date.now() && supportsBook(device)) ?? values.find((device) => device.online && !device.revokedAt && Date.parse(device.tokenExpiresAt) > Date.now()))?.id ?? "");
  };
  const read = async (signal?: AbortSignal, epoch = request.current) => {
    if (!input) return null;
    try {
      const snapshot = await readBookOcrSnapshot(api, input, signal);
      if (!signal?.aborted && currentRequest(epoch)) {
        setState({ state: snapshot.book.pages.length === pageCount ? "completed" : "paused", book: snapshot.book, physicalPage: null });
        setJob(snapshot.job); setLoaded(true); setNotice(""); setUncertain(false);
        if (pending.current && snapshot.jobs.some((value) => value.clientRequestId === pending.current?.clientRequestId)) { pending.current = null; retainStart(storageKey, null); }
        checkpoint.current?.();
      }
      return snapshot;
    } catch (error) {
      if (!signal?.aborted && currentRequest(epoch)) {
        setLoaded(false); setNotice(message(errorCode(error), zh));
        if (sourceLost(errorCode(error))) { setState({ state: "paused", book: null, physicalPage: null }); setJob(null); }
      }
      throw error;
    }
  };
  const pauseLegacy = (hidden = false) => {
    request.current++; controller.current?.pause();
    setState((value) => ({ state: "paused", book: value.book, physicalPage: value.physicalPage }));
    setNotice(hidden ? (zh ? "页面已隐藏，识别暂停。返回后可继续未识别页。" : "Page hidden; OCR paused. Return to resume missing pages.") : (zh ? "识别已暂停，已保存页面可继续使用。" : "OCR paused. Saved pages are retained."));
  };
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController(); void refreshDevices(abort.signal).catch(() => {});
    const interval = window.setInterval(() => void refreshDevices(abort.signal).catch(() => {}), 10_000);
    return () => { mounted.current = false; abort.abort(); window.clearInterval(interval); };
  }, [api, accountId, bookKey]);
  useEffect(() => {
    const active = new LocalOcrBookController(api); controller.current = active;
    const abort = new AbortController(); const epoch = ++request.current;
    setState({ state: "paused", book: null, physicalPage: null }); setJob(null); setLoaded(false); setChanging(false);
    setRetainedKey(bookKey); setNotice(""); setDialog(null); setUncertain(false); pending.current = pendingStart(storageKey);
    void read(abort.signal, epoch).catch(() => {});
    const timer = window.setInterval(() => {
      if (backgroundBookBusy(latest.current.job) && !latest.current.changing && !busy(latest.current.state.state)) void read(abort.signal).catch(() => {});
    }, 5_000);
    return () => { request.current++; abort.abort(); window.clearInterval(timer); active.pause(); if (controller.current === active) controller.current = null; };
  }, [api, bookKey, sourceDocument]);
  useEffect(() => {
    const hidden = () => { if (window.document.visibilityState === "hidden" && busy(latest.current.state.state)) pauseLegacy(true); };
    window.document.addEventListener("visibilitychange", hidden);
    return () => window.document.removeEventListener("visibilitychange", hidden);
  }, [bookKey, zh]);
  const selectedDevices = deviceAccount === accountId ? devices.filter((device) => !device.revokedAt && Date.parse(device.tokenExpiresAt) > Date.now()) : [];
  const device = selectedDevices.find((value) => value.id === deviceId);
  const retained = retainedKey === bookKey;
  const visible = retained ? state : { state: "paused" as const, book: null, physicalPage: null };
  const visibleJob = retained ? job : null; const book = visible.book; const summary = book ? bookOcrSummary(book) : null;
  const background = !!visibleJob && !["succeeded", "cancelled"].includes(visibleJob.state);
  const useBackground = background || supportsBook(device) || pending.current !== null;
  const legacyRunning = busy(visible.state); const serverRunning = backgroundBookBusy(visibleJob);
  const running = legacyRunning || serverRunning;
  const noQuota = !!book && book.pageCount - book.pages.length > book.quota.remaining;
  const canResume = background && ["paused", "failed"].includes(visibleJob!.state) && Date.parse(visibleJob!.expiresAt) > Date.now();
  useEffect(() => { onBusyChange?.(running || changing); return () => onBusyChange?.(false); }, [running, changing, onBusyChange]);
  const start = async () => {
    if (!input || !sourceDocument?.isCurrent() || !controller.current || !loaded || running || changing || uncertain || blocked || noQuota) return;
    if (!device?.online) { setNotice(message("device_offline", zh)); return; }
    if (background && !canResume) return;
    if (useBackground) {
      if (!supportsBook(device)) { setNotice(message("device_feature_unsupported", zh)); return; }
      const epoch = ++request.current; setChanging(true); setNotice(""); let creating = false;
      try {
        const snapshot = await read(undefined, epoch);
        if (!snapshot || !currentRequest(epoch)) return;
        if (backgroundBookBusy(snapshot.job) || snapshot.book.accountBusy) throw new Error("account_busy");
        if (snapshot.book.pageCount - snapshot.book.pages.length > snapshot.book.quota.remaining) throw new Error("book_quota_exceeded");
        const resumable = snapshot.job && ["paused", "failed"].includes(snapshot.job.state);
        if (resumable && Date.parse(snapshot.job!.expiresAt) <= Date.now()) throw new Error("expired");
        if (!resumable) {
          pending.current ??= { clientRequestId: crypto.randomUUID(), deviceId: device.id }; retainStart(storageKey, pending.current);
          if (pending.current.deviceId !== device.id) throw new Error("idempotency_conflict");
        }
        creating = !resumable;
        const value = resumable ? await api.resumeBook(snapshot.job!.id, device.id) : await api.createBook({ ...input, ...pending.current! });
        validateBookJob(input, value);
        if (resumable ? value.id !== snapshot.job!.id : value.clientRequestId !== pending.current!.clientRequestId || value.deviceId !== pending.current!.deviceId) throw new Error("invalid_result");
        if (currentRequest(epoch)) { setJob(value); pending.current = null; retainStart(storageKey, null); setUncertain(false); }
      } catch (error) {
        if (currentRequest(epoch)) {
          setNotice(message(errorCode(error), zh));
          const rejected = creating && error && typeof error === "object" && "status" in error && [400, 404, 429, 503].includes(Number(error.status));
          if (rejected) { pending.current = null; retainStart(storageKey, null); setUncertain(false); }
          else if (pending.current) setUncertain(true);
          if (sourceLost(errorCode(error))) { setLoaded(false); setState({ state: "paused", book: null, physicalPage: null }); setJob(null); }
        }
      } finally { if (currentRequest(epoch)) setChanging(false); }
      return;
    }
    if (window.document.visibilityState === "hidden") { pauseLegacy(true); return; }
    const epoch = ++request.current; setNotice("");
    const outcome = await controller.current.run(input, device.id, sourceDocument, (value) => {
      if (!currentRequest(epoch) || current.current.sourceDocument !== sourceDocument) return;
      setState(value); if (value.state === "checking" && value.book?.pages.length) checkpoint.current?.();
    });
    if (currentRequest(epoch) && current.current.sourceDocument === sourceDocument) setState(outcome);
  };
  const mutate = async (action: "pause" | "cancel") => {
    if (!input || !visibleJob || changing) return;
    const epoch = ++request.current; setChanging(true); setNotice("");
    try {
      const value = validateBookJob(input, await (action === "pause" ? api.pauseBook(visibleJob.id) : api.cancelBook(visibleJob.id)));
      if (currentRequest(epoch)) { setJob(value); setNotice(action === "pause" ? (zh ? "后台任务已暂停，已保存页面保留。" : "Background job paused. Saved pages are retained.") : (zh ? "后台任务已取消，已保存页面保留。" : "Background job cancelled. Saved pages are retained.")); }
    } catch (error) { if (currentRequest(epoch)) { setNotice(message(errorCode(error), zh)); if (sourceLost(errorCode(error))) { setLoaded(false); setState({ state: "paused", book: null, physicalPage: null }); setJob(null); } } }
    finally { if (currentRequest(epoch)) setChanging(false); }
  };
  const jobStatus = visibleJob?.state === "queued" ? (zh ? "后台任务已排队，等待所选连接器。" : "Background job queued; waiting for the selected connector.") : visibleJob?.state === "running" ? (zh ? "后台设备正在识别，可关闭网站。" : "Your device is recognizing in the background. You can close the website.") : visibleJob?.state === "paused" ? (zh ? "后台任务已暂停，选择在线设备后手动继续。" : "Background job paused. Choose an online device and resume manually.") : visibleJob?.state === "failed" ? message(visibleJob.errorCode ?? undefined, zh) : visibleJob?.state === "cancelled" ? (zh ? "后台任务已取消，已保存页面保留。" : "Background job cancelled. Saved pages are retained.") : "";
  const status = notice || jobStatus || (visible.state === "completed" ? (zh ? "所有页面已处理。" : "All pages processed.") : visible.state === "failed" ? message(visible.errorCode, zh) : legacyRunning ? (zh ? "正在处理PDF第" + (visible.physicalPage ?? "—") + "页…" : "Processing PDF page " + (visible.physicalPage ?? "—") + "…") : "");
  const failedPage = visibleJob?.failedPhysicalPage ?? (visible.state === "failed" ? visible.physicalPage : null);
  return <div className="local-ocr local-ocr-book">
    <div className="local-ocr__actions"><button type="button" className="pdf-reader__text-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{zh ? "整书OCR" : "Whole-book OCR"}</button>{running && <span role="status">{status}</span>}</div>
    {open && <section className="local-ocr__panel" aria-label={zh ? "整书私有OCR" : "Private whole-book OCR"}>
      <div className="local-ocr__panel-heading"><strong>{zh ? "整书OCR" : "Whole-book OCR"}</strong><button type="button" aria-label={zh ? "收起整书OCR" : "Collapse whole-book OCR"} onClick={() => setOpen(false)}>{zh ? "收起" : "Collapse"}</button></div>
      <p>{useBackground ? (zh ? "新版连接器在你自己的电脑上处理整书，关闭网站仍会继续。电脑和连接器须保持运行；重启后重新配对，再手动继续任务。" : "The updated connector processes the book on your own computer and continues after you close the website. Keep the computer and connector running; after a restart, pair again and resume the job manually.") : (zh ? "该连接器使用阅读器逐页识别。保持阅读器和连接器开启、设备唤醒；隐藏页面或离开阅读器会暂停。更新连接器可使用后台任务。" : "This connector uses the Reader to process pages. Keep the Reader and connector open and your device awake; hiding the page or leaving the Reader pauses OCR. Update the connector for background jobs.")}</p>
      {pageCount !== null && pageCount > 500 && <p role="status">{message("book_page_limit", zh)}</p>}
      <label>{zh ? "整书识别设备" : "Book OCR device"}<select value={deviceId} disabled={running || changing} onChange={(event) => setDeviceId(event.target.value)}><option value="">{zh ? "选择已配对设备" : "Choose a paired device"}</option>{selectedDevices.map((value) => <option key={value.id} value={value.id}>{value.label} · {value.online ? (zh ? "在线" : "Online") : (zh ? "离线" : "Offline")} · {supportsBook(value) ? (zh ? "后台整书" : "Background books") : (zh ? "需开启阅读器" : "Reader required")}</option>)}</select></label>
      <div className="local-ocr__actions">
        <button type="button" disabled={changing || legacyRunning} onClick={(event) => setDialog(event.currentTarget)}>{zh ? "管理OCR连接" : "Manage OCR connection"}</button>
        <button type="button" disabled={!input || !sourceDocument || !loaded || running || changing || uncertain || blocked || !deviceId || noQuota || summary?.processed === pageCount || (background && (!canResume || !supportsBook(device)))} onClick={() => void start()}>{summary?.processed || canResume ? (zh ? "继续未识别页" : "Resume missing pages") : (zh ? "开始整书识别" : "Start whole-book OCR")}</button>
        {running && <button type="button" disabled={changing} onClick={() => serverRunning ? void mutate("pause") : pauseLegacy()}>{zh ? "暂停识别" : "Pause book OCR"}</button>}
        {background && <button type="button" disabled={changing} onClick={() => void mutate("cancel")}>{zh ? "取消后台任务" : "Cancel background job"}</button>}
        <button type="button" disabled={!input || legacyRunning || changing} onClick={() => { const epoch = ++request.current; void read(undefined, epoch).catch(() => {}); }}>{zh ? "刷新保存进度" : "Refresh saved progress"}</button>
      </div>
      {blocked && !serverRunning && <p>{zh ? "等待当前页识别结束后可开始。" : "Start after current-page OCR ends."}</p>}
      {serverRunning && <p className="local-ocr__hint">{zh ? "执行设备：" : "Assigned device: "}{selectedDevices.find((value) => value.id === visibleJob?.deviceId)?.label ?? (zh ? "原配对设备" : "Original paired device")}</p>}
      {book && summary && <p>{zh ? "已处理" + summary.processed + "/" + book.pageCount + "页 · 需核对" + summary.issues.length + "页 · 无文字" + summary.noText + "页 · 私有结果" + book.quota.used + "/" + book.quota.limit : summary.processed + "/" + book.pageCount + " pages processed · " + summary.issues.length + " need review · " + summary.noText + " without text · Private results " + book.quota.used + "/" + book.quota.limit}</p>}
      {status && <p role="status">{failedPage ? (zh ? "停止在PDF第" + failedPage + "页。" : "Stopped at PDF page " + failedPage + ". ") : ""}{status}</p>}
      {uncertain && <p role="status">{zh ? "请求结果尚未确认，请刷新任务后再操作。" : "Request outcome is unknown. Refresh the job before continuing."}</p>}
      {background && !canResume && !serverRunning && <p>{zh ? "任务已超过七天保留期，取消此任务后可重新开始。" : "This job has passed its seven-day retention period. Cancel it before starting again."}</p>}
      {noQuota && <p role="status">{message("book_quota_exceeded", zh)}</p>}
      {book && summary && summary.processed > 0 && <div className="local-ocr__actions"><a href={api.bookExportUrl({ resourceId, sourceId, pageCount: book.pageCount }, "txt")} download>{zh ? "导出已保存文字.txt" : "Export saved text .txt"}</a><a href={api.bookExportUrl({ resourceId, sourceId, pageCount: book.pageCount }, "jsonl")} download>{zh ? "导出逐页记录.jsonl" : "Export page records .jsonl"}</a></div>}
      {summary && summary.issues.length > 0 && <details><summary>{zh ? "需要核对的页面" : "Pages needing review"}</summary><ol className="local-ocr-book__pages">{summary.issues.map((page) => <li key={page.physicalPage}><button type="button" onClick={() => onReview(page.physicalPage)}>{zh ? "查看第" + page.physicalPage + "页" : "Review page " + page.physicalPage}</button> · {page.status === "unsupported_script" ? (zh ? "不支持此文字" : "Unsupported script") : page.status === "low_confidence" ? (zh ? "低置信度" : "Low confidence") : ""}{page.truncated ? (zh ? " · 已截断" : " · Truncated") : ""}{page.hasCorrection ? (zh ? " · 已有修订" : " · Corrected") : ""}</li>)}</ol></details>}
      {failedPage && <button type="button" onClick={() => onReview(failedPage)}>{zh ? "查看失败页" : "Review failed page"}</button>}
    </section>}
    {dialog && <OcrConnectionDialog api={api} returnFocus={dialog} onClose={() => { setDialog(null); void refreshDevices().catch(() => {}); }} />}
  </div>;
}
