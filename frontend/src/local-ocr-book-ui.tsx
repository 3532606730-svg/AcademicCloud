import { useEffect, useRef, useState } from "react";
import type { LocalOcrBook, LocalOcrDevice } from "./local-ocr-api.ts";
import { LocalOcrBookController, bookOcrSummary, type BookOcrDocument, type BookOcrState } from "./local-ocr-book-controller.ts";
import { OcrConnectionDialog, type ReaderLocalOcr } from "./local-ocr-ui.tsx";
import { useLanguage } from "./i18n-react.tsx";

const busy = (state: BookOcrState["state"]) => ["checking", "waiting", "capturing", "queued", "running"].includes(state);
function message(code: string | undefined, zh: boolean) {
  const messages: Record<string, [string, string]> = {
    book_page_limit: ["整书识别目前支持最多500页的PDF。", "Whole-book OCR supports PDFs of up to 500 pages."],
    book_quota_exceeded: ["剩余私有结果额度不足以识别未完成页面。", "Remaining private-result quota cannot cover the missing pages."],
    account_busy: ["你的设备正在处理另一个识别请求。结束后可继续。", "Your account has another OCR request. Resume after it ends."],
    engine_busy: ["设备正忙，空闲后可继续。", "Device is busy. Resume when it is available."],
    engine_failed: ["本页识别失败。检查连接器后可继续。", "This page failed. Check your connector, then resume."],
    device_offline: ["设备离线，请启动连接器后继续。", "Device is offline. Start your connector, then resume."],
    expired: ["本页请求已过期，检查设备后可继续。", "This page request expired. Check the device, then resume."],
    invalid_result: ["本页结果未通过验证，检查设备后可继续。", "This page result failed validation. Check the device, then resume."],
    not_found: ["原件或连接已不可访问，请重新打开资料并检查设备。", "Source or connection is unavailable. Reopen the resource and check your device."],
    limit_exceeded: ["已达到识别额度或同时请求上限，请检查已保存数量和设备。", "OCR quota or request capacity reached. Check saved results and your device."],
    ocr_image_too_large: ["本页PNG超过2MiB，识别已停止。", "This page PNG exceeds 2 MiB. OCR stopped."],
    request_inactive: ["本页请求已结束，核对保存进度后可继续。", "This page request ended. Check saved progress, then resume."],
  };
  return messages[code ?? ""]?.[zh ? 0 : 1] ?? (zh ? "操作未完成，检查连接后可继续。" : "Operation did not finish. Check the connection, then resume.");
}

export function WholeBookOcr({ connection, document: sourceDocument, pageCount, onReview, onCheckpoint, blocked = false, onBusyChange }: {
  connection: ReaderLocalOcr; document: BookOcrDocument | null; pageCount: number | null;
  onReview: (physicalPage: number) => void; onCheckpoint?: (() => void) | undefined;
  blocked?: boolean; onBusyChange?: ((value: boolean) => void) | undefined;
}) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const { api, accountId, resourceId, sourceId } = connection;
  const bookKey = `${accountId}:${resourceId}:${sourceId}:${pageCount}`;
  const current = useRef({ bookKey, sourceDocument }); current.current = { bookKey, sourceDocument };
  const controller = useRef<LocalOcrBookController | null>(null);
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<LocalOcrDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [deviceAccount, setDeviceAccount] = useState(accountId);
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<BookOcrState>({ state: "paused", book: null, physicalPage: null });
  const latestState = useRef(state); latestState.current = state;
  const [retainedKey, setRetainedKey] = useState(bookKey);
  const [notice, setNotice] = useState("");
  const request = useRef(0); const mounted = useRef(true);
  const input: LocalOcrBook | null = pageCount !== null && pageCount <= 500 ? { resourceId, sourceId, pageCount } : null;
  const refreshDevices = async (signal?: AbortSignal) => {
    const values = await api.devices(signal);
    if (!mounted.current || signal?.aborted || !current.current.bookKey.startsWith(`${accountId}:`)) return;
    setDevices(values); setDeviceAccount(accountId);
    setDeviceId((id) => values.some((device) => device.id === id && !device.revokedAt) ? id : (values.find((device) => device.online && !device.revokedAt) ?? values.find((device) => !device.revokedAt))?.id ?? "");
  };
  const pause = (hidden = false) => {
    request.current++; controller.current?.pause();
    setState((value) => ({ state: "paused", book: value.book, physicalPage: value.physicalPage }));
    setNotice(hidden ? (zh ? "页面已隐藏，识别暂停。返回后可继续未识别页。" : "Page hidden; OCR paused. Return to resume missing pages.") : (zh ? "识别已暂停，已保存页面可继续使用。" : "OCR paused. Saved pages are retained."));
  };
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController(); void refreshDevices(abort.signal).catch(() => {});
    const interval = window.setInterval(() => void refreshDevices(abort.signal).catch(() => {}), 10_000);
    return () => { mounted.current = false; abort.abort(); window.clearInterval(interval); };
  }, [api, accountId]);
  useEffect(() => {
    const active = new LocalOcrBookController(api); controller.current = active;
    const abort = new AbortController(); const epoch = ++request.current;
    setState({ state: "paused", book: null, physicalPage: null }); setRetainedKey(bookKey); setNotice(""); setDialog(null);
    if (input) void api.bookProgress(input, abort.signal).then((book) => {
      if (!abort.signal.aborted && current.current.bookKey === bookKey && epoch === request.current) setState({ state: book.pages.length === book.pageCount ? "completed" : "paused", book, physicalPage: null });
    }).catch((error: unknown) => { if (!abort.signal.aborted && current.current.bookKey === bookKey && epoch === request.current) setNotice(message(error && typeof error === "object" && "code" in error ? String(error.code) : undefined, zh)); });
    return () => { request.current++; abort.abort(); active.pause(); if (controller.current === active) controller.current = null; };
  }, [api, bookKey, sourceDocument]);
  useEffect(() => {
    const hidden = () => { if (window.document.visibilityState === "hidden" && busy(latestState.current.state)) pause(true); };
    window.document.addEventListener("visibilitychange", hidden);
    return () => window.document.removeEventListener("visibilitychange", hidden);
  }, [bookKey, zh]);
  const start = async () => {
    if (!input || !sourceDocument || !sourceDocument.isCurrent() || !controller.current || busy(state.state) || blocked) return;
    if (window.document.visibilityState === "hidden") { pause(true); return; }
    const device = deviceAccount === accountId ? devices.find((value) => value.id === deviceId && !value.revokedAt) : undefined;
    if (!device?.online || Date.parse(device.tokenExpiresAt) <= Date.now()) { setNotice(message("device_offline", zh)); return; }
    const epoch = ++request.current; setNotice("");
    const active = controller.current;
    const outcome = await active.run(input, device.id, sourceDocument, (value) => {
      if (epoch !== request.current || current.current.bookKey !== bookKey || current.current.sourceDocument !== sourceDocument) return;
      setState(value); if (value.state === "checking" && value.book?.pages.length) onCheckpoint?.();
    });
    if (epoch === request.current && current.current.bookKey === bookKey && current.current.sourceDocument === sourceDocument) setState(outcome);
  };
  const refresh = async () => {
    if (!input || busy(state.state)) return;
    const epoch = ++request.current;
    try {
      const book = await api.bookProgress(input);
      if (mounted.current && epoch === request.current && current.current.bookKey === bookKey) {
        setState({ state: book.pages.length === book.pageCount ? "completed" : "paused", book, physicalPage: null }); setNotice(""); onCheckpoint?.();
      }
    } catch (error) { if (mounted.current && epoch === request.current && current.current.bookKey === bookKey) setNotice(message(error && typeof error === "object" && "code" in error ? String(error.code) : undefined, zh)); }
  };
  const visible = retainedKey === bookKey ? state : { state: "paused" as const, book: null, physicalPage: null };
  const book = visible.book; const summary = book ? bookOcrSummary(book) : null;
  const running = busy(visible.state);
  useEffect(() => { onBusyChange?.(running); return () => onBusyChange?.(false); }, [running, onBusyChange]);
  const selectedDevices = deviceAccount === accountId ? devices.filter((device) => !device.revokedAt) : [];
  const status = visible.state === "completed" ? (zh ? "所有页面已处理。" : "All pages processed.") : visible.state === "failed" ? message(visible.errorCode, zh) : running ? (zh ? `正在处理PDF第${visible.physicalPage ?? "—"}页…` : `Processing PDF page ${visible.physicalPage ?? "—"}…`) : notice;
  return <div className="local-ocr local-ocr-book">
    <div className="local-ocr__actions"><button type="button" className="pdf-reader__text-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{zh ? "整书OCR" : "Whole-book OCR"}</button>{running && <span role="status">{status}</span>}</div>
    {open && <section className="local-ocr__panel" aria-label={zh ? "整书私有OCR" : "Private whole-book OCR"}>
      <p>{zh ? "按PDF物理页顺序识别，使用你选择的本地设备。保持阅读器和连接器开启，设备保持唤醒；隐藏页面或离开阅读器会暂停。" : "Process physical PDF pages in order on your selected local device. Keep the Reader and connector open and your device awake; hiding the page or leaving the Reader pauses OCR."}</p>
      {pageCount !== null && pageCount > 500 && <p role="status">{message("book_page_limit", zh)}</p>}
      <label>{zh ? "整书识别设备" : "Book OCR device"}<select value={deviceId} disabled={running} onChange={(event) => setDeviceId(event.target.value)}><option value="">{zh ? "选择已配对设备" : "Choose a paired device"}</option>{selectedDevices.map((device) => <option key={device.id} value={device.id}>{device.label} · {device.online ? (zh ? "在线" : "Online") : (zh ? "离线" : "Offline")}</option>)}</select></label>
      <div className="local-ocr__actions"><button type="button" disabled={running} onClick={(event) => setDialog(event.currentTarget)}>{zh ? "管理OCR连接" : "Manage OCR connection"}</button><button type="button" disabled={!input || !sourceDocument || running || blocked || !deviceId || summary?.processed === pageCount} onClick={() => void start()}>{summary?.processed ? (zh ? "继续未识别页" : "Resume missing pages") : (zh ? "开始整书识别" : "Start whole-book OCR")}</button>{running && <button type="button" onClick={() => pause()}>{zh ? "暂停识别" : "Pause book OCR"}</button>}<button type="button" disabled={!input || running} onClick={() => void refresh()}>{zh ? "刷新保存进度" : "Refresh saved progress"}</button></div>
      {blocked && <p>{zh ? "等待当前页识别结束后可开始。" : "Start after current-page OCR ends."}</p>}
      {book && summary && <p>{zh ? `已处理${summary.processed}/${book.pageCount}页 · 需核对${summary.issues.length}页 · 无文字${summary.noText}页 · 私有结果${book.quota.used}/${book.quota.limit}` : `${summary.processed}/${book.pageCount} pages processed · ${summary.issues.length} need review · ${summary.noText} without text · Private results ${book.quota.used}/${book.quota.limit}`}</p>}
      {status && <p role="status">{visible.state === "failed" && visible.physicalPage ? (zh ? `停止在PDF第${visible.physicalPage}页。` : `Stopped at PDF page ${visible.physicalPage}. `) : ""}{status}</p>}
      {book && book.pageCount - book.pages.length > book.quota.remaining && <p role="status">{message("book_quota_exceeded", zh)}</p>}
      {book && summary && summary.processed > 0 && <div className="local-ocr__actions"><a href={api.bookExportUrl({ resourceId, sourceId, pageCount: book.pageCount }, "txt")} download>{zh ? "导出已保存文字.txt" : "Export saved text .txt"}</a><a href={api.bookExportUrl({ resourceId, sourceId, pageCount: book.pageCount }, "jsonl")} download>{zh ? "导出逐页记录.jsonl" : "Export page records .jsonl"}</a></div>}
      {summary && summary.issues.length > 0 && <details><summary>{zh ? "需要核对的页面" : "Pages needing review"}</summary><ol className="local-ocr-book__pages">{summary.issues.map((page) => <li key={page.physicalPage}><button type="button" onClick={() => onReview(page.physicalPage)}>{zh ? `查看第${page.physicalPage}页` : `Review page ${page.physicalPage}`}</button> · {page.status === "unsupported_script" ? (zh ? "不支持此文字" : "Unsupported script") : page.status === "low_confidence" ? (zh ? "低置信度" : "Low confidence") : ""}{page.truncated ? (zh ? " · 已截断" : " · Truncated") : ""}{page.hasCorrection ? (zh ? " · 已有修订" : " · Corrected") : ""}</li>)}</ol></details>}
      {visible.state === "failed" && visible.physicalPage && <button type="button" onClick={() => onReview(visible.physicalPage!)}>{zh ? "查看失败页" : "Review failed page"}</button>}
    </section>}
    {dialog && <OcrConnectionDialog api={api} returnFocus={dialog} onClose={() => { setDialog(null); void refreshDevices().catch(() => {}); }} />}
  </div>;
}
