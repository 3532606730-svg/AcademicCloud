import { useEffect, useRef, useState, type FormEvent } from "react";
import { LOCAL_OCR_BOOK_FEATURE, LOCAL_OCR_LIMITS, OCR_ENGINE_MAX_TEXT_UNITS } from "@academiccloud/compute-contracts";
import type { LocalOcrApi, LocalOcrDevice, LocalOcrPage, LocalOcrResult } from "./local-ocr-api.ts";
import type { LocalOcrFrame, PaintedOcrPage } from "./local-ocr-frame.ts";
import { LocalOcrController, type OcrProgress } from "./local-ocr-controller.ts";
import { useLanguage } from "./i18n-react.tsx";
import { useModalDialog } from "./use-modal-dialog.ts";
import "./local-ocr.css";

export interface ReaderLocalOcr { api: LocalOcrApi; accountId: string; resourceId: string; sourceId: string }
type CorrectionDraft = { text: string; revision: number };
const errorCode = (error: unknown) => error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : "request_failed";
function ocrError(error: unknown, zh: boolean) {
  const messages: Record<string, [string, string]> = {
    expired: ["识别请求已过期。确认设备在线后可重新识别。", "OCR request expired. Check the device and explicitly try again."],
    engine_busy: ["设备正在处理其他任务，请稍后重试。", "Device is busy. Try again later."],
    engine_failed: ["本地引擎未就绪或识别失败，请检查连接器配置与兼容版本，通过测试后再试。", "Local engine is not ready or recognition failed. Check connector configuration and compatible runtime, then pass its test before retrying."],
    invalid_result: ["引擎结果未通过验证，未保存。", "Engine result failed validation and was not saved."],
    device_offline: ["设备离线，请先启动自己的连接器。", "Device is offline. Start your connector first."],
    ocr_device_offline: ["设备离线，请先启动自己的连接器。", "Device is offline. Start your connector first."],
    device_limit_exceeded: ["最多连接三台设备，请先撤销不再使用的设备。", "Up to three devices can be connected. Revoke an unused device first."],
    result_quota_exceeded: ["已达到 500 条私有结果上限，本次没有开始识别。", "The 500 private-result quota is full. OCR was not started."],
    ocr_result_quota_exceeded: ["已达到 500 条私有结果上限，本次没有开始识别。", "The 500 private-result quota is full. OCR was not started."],
    quota_exceeded: ["已达到私有结果上限，本次没有开始识别。", "Private-result quota is full. OCR was not started."],
    ocr_frame_changed: ["显示页面已变化，请在新页面绘制完成后重试。", "Displayed page changed. Wait for the new page to paint, then try again."],
    ocr_frame_unavailable: ["无法生成当前页图像，请重新打开原件。", "Current page image is unavailable. Reopen the source."],
    ocr_image_too_large: ["当前页 PNG 超过 2 MiB，未提交识别。", "Current page PNG exceeds 2 MiB and was not submitted."],
    source_changed: ["原件版本已变化，请重新打开资料。", "Source version changed. Reopen the resource."],
    access_revoked: ["资料或设备权限已失效。", "Resource or device access was revoked."],
    cancelled: ["识别已取消。", "OCR cancelled."],
    rate_limit_exceeded: ["操作太频繁，请稍后重试。", "Too many requests. Try again later."],
    request_limit_exceeded: ["当前识别请求已满，请稍后重试。", "OCR request capacity is full. Try again later."],
    limit_exceeded: ["已达到本次连接或识别限额（最多三台设备、500条私有结果，同时一个识别请求）。没有自动清除结果，请核对设备与已保存数量。", "Connection or OCR limit reached (three devices, 500 private results, one active request). Results are not automatically removed; check devices and saved results."],
    device_unavailable: ["设备连接已失效，请重新配对。", "Device connection is unavailable. Pair again."],
    request_inactive: ["识别请求已结束或失效，请核对已保存结果后再重试。", "OCR request ended or became inactive. Check saved results before retrying."],
    not_found: ["资料、版本或私有结果已不可访问，请重新打开资料。", "Resource, source or private result is unavailable. Reopen the resource."],
    invalid_request: ["识别参数无效，本次操作未完成。", "Invalid OCR input. The operation did not finish."],
    idempotency_conflict: ["请求内容发生冲突，请重新打开当前页后再试。", "OCR request input conflicted. Reopen the current page before retrying."],
  };
  return messages[errorCode(error)]?.[zh ? 0 : 1] ?? (zh ? "OCR 操作未完成，请检查连接后重试。" : "OCR operation did not finish. Check the connection and try again.");
}
const isConflict = (error: unknown) => ["concurrent_change", "revision_conflict", "ocr_result_conflict"].includes(errorCode(error));
const matches = (result: LocalOcrResult, page: LocalOcrPage) => result.resourceId === page.resourceId && result.sourceId === page.sourceId && result.physicalPage === page.physicalPage;
async function copyText(text: string, zh: boolean, message: (value: string) => void) {
  try { await navigator.clipboard.writeText(text); message(zh ? "已复制" : "Copied"); }
  catch { message(zh ? "剪贴板不可用，请选中文字后使用 Ctrl/Cmd+C。" : "Clipboard unavailable. Select the text and press Ctrl/Cmd+C."); }
}

export function CurrentPageOcr({ connection, physicalPage, painted, focusReading = false, refreshVersion = 0, blocked = false, onBusyChange }: { connection: ReaderLocalOcr; physicalPage: number; painted: PaintedOcrPage | null; focusReading?: boolean; refreshVersion?: number; blocked?: boolean; onBusyChange?: ((value: boolean) => void) | undefined }) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const { api, accountId, resourceId, sourceId } = connection;
  const page: LocalOcrPage = { resourceId, sourceId, physicalPage };
  const pageKey = `${accountId}:${resourceId}:${sourceId}:${physicalPage}`;
  const current = useRef({ pageKey, painted }); current.current = { pageKey, painted };
  const controller = useRef<LocalOcrController | null>(null);
  const [devices, setDevices] = useState<LocalOcrDevice[]>([]);
  const [deviceAccount, setDeviceAccount] = useState(accountId);
  const [deviceId, setDeviceId] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (focusReading) setOpen(false); }, [focusReading]);
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<LocalOcrResult[]>([]);
  const [result, setResult] = useState<LocalOcrResult | null>(null);
  const [retainedKey, setRetainedKey] = useState(pageKey);
  const [frame, setFrame] = useState<{ resultId: string; value: LocalOcrFrame; painted: PaintedOcrPage } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { onBusyChange?.(!!progress); return () => onBusyChange?.(false); }, [!!progress, onBusyChange]);
  const historyContext = useRef({ api, pageKey });
  const historyRequest = useRef(0); const request = useRef(0);
  const drafts = useRef(new Map<string, CorrectionDraft>());
  const draftAccount = useRef(accountId);
  if (draftAccount.current !== accountId) { drafts.current.clear(); draftAccount.current = accountId; }
  const refreshDevices = async (signal?: AbortSignal) => {
    const values = await api.devices(signal);
    if (!signal?.aborted && current.current.pageKey.startsWith(`${accountId}:`)) {
      setDevices(values);
      setDeviceAccount(accountId);
      setDeviceId((id) => values.some((device) => device.id === id && !device.revokedAt) ? id : (values.find((device) => device.online && !device.revokedAt) ?? values.find((device) => !device.revokedAt))?.id ?? "");
    }
  };
  useEffect(() => {
    const abort = new AbortController();
    void refreshDevices(abort.signal).catch(() => {});
    const interval = window.setInterval(() => void refreshDevices(abort.signal).catch(() => {}), 10_000);
    return () => { abort.abort(); window.clearInterval(interval); };
  }, [api, accountId]);
  useEffect(() => {
    setDialog(null);
    const active = new LocalOcrController(api); controller.current = active;
    return () => { active.cancel(); if (controller.current === active) controller.current = null; };
  }, [api, accountId]);
  useEffect(() => {
    request.current++; controller.current?.cancel(); setProgress(null); setFrame(null);
    return () => { request.current++; controller.current?.cancel(); };
  }, [pageKey, painted]);
  useEffect(() => {
    const abort = new AbortController(); const epoch = ++historyRequest.current;
    const preserveSelection = historyContext.current.api === api && historyContext.current.pageKey === pageKey;
    const selected = preserveSelection && result && matches(result, page) ? result : null;
    historyContext.current = { api, pageKey };
    if (!preserveSelection) { setHistory([]); setResult(null); }
    setRetainedKey(pageKey); setMessage(""); setLoading(true);
    void api.results(page, abort.signal).then((items) => {
      if (abort.signal.aborted || epoch !== historyRequest.current || current.current.pageKey !== pageKey) return;
      const valid = items.filter((item) => matches(item, page)).slice(0, 20);
      const retained = selected ? valid.find((item) => item.id === selected.id) ?? selected : valid[0] ?? null;
      setHistory(retained && !valid.some((item) => item.id === retained.id) ? [...valid.slice(0, 19), retained] : valid); setResult(retained);
    }).catch((error: unknown) => { if (!abort.signal.aborted && current.current.pageKey === pageKey) setMessage(ocrError(error, zh)); })
      .finally(() => { if (!abort.signal.aborted && current.current.pageKey === pageKey) setLoading(false); });
    return () => abort.abort();
  }, [api, pageKey, refreshVersion]);
  const keep = (value: LocalOcrResult) => {
    if (!matches(value, page) || current.current.pageKey !== pageKey) return;
    setResult(value); setHistory((items) => [value, ...items.filter((item) => item.id !== value.id)].slice(0, 20));
  };
  const recognize = async () => {
    if (blocked) return;
    setOpen(true); setMessage("");
    const device = deviceAccount === accountId ? devices.find((item) => item.id === deviceId && !item.revokedAt) : undefined;
    if (device && Date.parse(device.tokenExpiresAt) <= Date.now()) { setMessage(ocrError(new Error("device_unavailable"), zh)); return; }
    if (!device?.online) { setMessage(ocrError(new Error("device_offline"), zh)); return; }
    if (!painted || !painted.isCurrent() || progress || !controller.current) return;
    const epoch = ++request.current;
    try {
      const outcome = await controller.current.recognize(page, device.id, painted, (value) => { if (epoch === request.current && current.current.pageKey === pageKey && current.current.painted === painted) setProgress(value); });
      if (epoch !== request.current || current.current.pageKey !== pageKey || current.current.painted !== painted || !painted.isCurrent() || !outcome) return;
      historyRequest.current++;
      keep(outcome.result); setFrame({ resultId: outcome.result.id, value: outcome.frame, painted });
      setMessage(zh ? "机器结果已私有保存，请核对后修订。" : "Machine result saved privately. Review before correcting.");
    } catch (error) { if (epoch === request.current && current.current.pageKey === pageKey) setMessage(ocrError(error, zh)); }
    finally { if (epoch === request.current) setProgress(null); }
  };
  const selectResult = async (id: string) => {
    const epoch = ++historyRequest.current; setLoading(true); setMessage("");
    try { const selected = await api.result(id); if (epoch === historyRequest.current && current.current.pageKey === pageKey) keep(selected); }
    catch (error) { if (epoch === historyRequest.current && current.current.pageKey === pageKey) setMessage(ocrError(error, zh)); }
    finally { if (epoch === historyRequest.current && current.current.pageKey === pageKey) setLoading(false); }
  };
  const visibleDevices = deviceAccount === accountId ? devices : [];
  const selectedDevice = visibleDevices.find((device) => device.id === deviceId && !device.revokedAt);
  const visibleHistory = retainedKey === pageKey ? history.filter((item) => matches(item, page)) : [];
  const visibleResult = retainedKey === pageKey && result && matches(result, page) ? result : null;
  return <div className="local-ocr">
    <div className="local-ocr__actions">
      <button type="button" className="pdf-reader__text-button" disabled={!painted || !!progress || blocked} onClick={() => { if (!selectedDevice) { setDialog(document.activeElement as HTMLElement); setOpen(true); } else void recognize(); }}>{zh ? "当前页OCR" : "Current page OCR"}</button>
      <button type="button" className="pdf-reader__text-button" onClick={(event) => setDialog(event.currentTarget)}>{zh ? "连接OCR" : "Connect OCR"}</button>
      <button type="button" className="pdf-reader__text-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{zh ? "私有OCR结果" : "Private OCR results"}{visibleHistory.length ? ` (${visibleHistory.length})` : ""}</button>
      {progress && <><span role="status">{progress.state === "capturing" ? (zh ? "正在生成当前页图像…" : "Rendering current page…") : progress.state === "queued" ? (zh ? "等待本地设备…" : "Waiting for your device…") : (zh ? "正在本地识别…" : "Recognizing locally…")}</span><button type="button" onClick={() => { request.current++; controller.current?.cancel(); setProgress(null); setMessage(zh ? "识别已取消。" : "OCR cancelled."); }}>{zh ? "取消识别" : "Cancel OCR"}</button></>}
    </div>
    {open && <section className="local-ocr__panel" aria-label={zh ? "当前页私有OCR" : "Private current-page OCR"}>
      <div className="local-ocr__panel-heading"><p>{zh ? `PDF 第 ${physicalPage} 页 · 使用你的设备识别` : `PDF page ${physicalPage} · OCR on your device`}</p><button type="button" aria-label={zh ? "收起当前页OCR" : "Collapse current-page OCR"} onClick={() => setOpen(false)}>{zh ? "收起" : "Collapse"}</button></div>
      {blocked && <p className="local-ocr__hint">{zh ? "整书识别正在运行，暂停后可识别当前页。" : "Book OCR is running. Pause it before starting current-page OCR."}</p>}
      <label>{zh ? "识别设备" : "OCR device"}<select value={deviceId} disabled={!!progress} onChange={(event) => setDeviceId(event.target.value)}><option value="">{zh ? "选择已配对设备" : "Choose a paired device"}</option>{visibleDevices.filter((device) => !device.revokedAt).map((device) => <option key={device.id} value={device.id}>{device.label} · {device.online ? (zh ? "在线" : "Online") : (zh ? "离线" : "Offline")}</option>)}</select></label>
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">{zh ? "正在读取已保存结果…" : "Loading saved results…"}</p>}
      {visibleHistory.length > 0 && <label>{zh ? "当前页历史（最近20条）" : "Current page history (latest 20)"}<select value={visibleResult?.id ?? ""} disabled={loading || !!progress} onChange={(event) => void selectResult(event.target.value)}>{visibleHistory.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.machine.provenance.engineId}{drafts.current.has(item.id) ? (zh ? " · 未保存草稿" : " · Unsaved draft") : ""}</option>)}</select></label>}
      {visibleResult && <OcrResultEditor key={`${pageKey}:${visibleResult.id}`} api={api} result={visibleResult} draft={drafts.current.get(visibleResult.id)} onDraft={(value) => value === null ? drafts.current.delete(visibleResult.id) : drafts.current.set(visibleResult.id, value)} onSaved={keep} frame={frame?.resultId === visibleResult.id && frame.painted === painted && painted?.isCurrent() ? frame.value : null} />}
      {!loading && !visibleResult && <p>{zh ? "当前页还没有已保存结果。" : "No saved result for this page yet."}</p>}
    </section>}
    {dialog && <OcrConnectionDialog api={api} returnFocus={dialog} onClose={() => { setDialog(null); void refreshDevices().catch(() => {}); }} />}
  </div>;
}

function OcrResultEditor({ api, result, draft, onDraft, onSaved, frame }: { api: LocalOcrApi; result: LocalOcrResult; draft?: CorrectionDraft | undefined; onDraft: (value: CorrectionDraft | null) => void; onSaved: (result: LocalOcrResult) => void; frame: LocalOcrFrame | null }) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const [baseline, setBaseline] = useState(draft ? { ...result, revision: draft.revision } : result);
  const [text, setText] = useState(draft?.text ?? result.correctedText ?? result.machine.text ?? "");
  const [latest, setLatest] = useState<LocalOcrResult | null>(draft && draft.revision !== result.revision ? result : null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [showBoxes, setShowBoxes] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const dirty = text !== (baseline.correctedText ?? baseline.machine.text ?? "");
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy || latest || !dirty) return;
    setBusy(true); setMessage("");
    try {
      const saved = await api.correct(baseline.id, baseline.revision, text);
      if (!alive.current) return;
      setBaseline(saved); onSaved(saved); onDraft(null); setMessage(zh ? "修订已私有保存" : "Correction saved privately");
    } catch (error) {
      if (!alive.current) return;
      if (isConflict(error)) {
        setMessage(zh ? "结果已在别处修订，草稿已保留。核对最新版本后再保存。" : "Result changed elsewhere. Draft preserved. Compare the latest version before saving.");
        try { const value = await api.result(baseline.id); if (alive.current) setLatest(value); }
        catch (failure) { if (alive.current) setMessage(ocrError(failure, zh)); }
      } else setMessage(ocrError(error, zh));
    } finally { if (alive.current) setBusy(false); }
  };
  const exportText = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `ocr-page-${result.physicalPage}${dirty ? "-draft" : ""}.txt`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const status = { recognized: zh ? "已识别" : "Recognized", no_text: zh ? "没有识别到文字" : "No text recognized", low_confidence: zh ? "低置信度，请仔细核对" : "Low confidence; review carefully", unsupported_script: zh ? "引擎不支持此文字" : "Script unsupported by this engine" }[result.machine.status];
  return <div className="local-ocr__result">
    <p>{status}{result.machine.truncated ? (zh ? " · 文字已截断，结果不完整" : " · Text truncated; result incomplete") : ""} · {result.machine.provenance.engineId} {result.machine.provenance.engineVersion}</p>
    <p className="local-ocr__hint">{zh ? "原始机器文本保留，修订仅你可见。" : "Original machine text is retained; corrections are private."}</p>
    <details><summary>{zh ? "原始机器文本" : "Original machine text"}</summary><pre>{result.machine.text ?? ""}</pre></details>
    {result.machine.lineBoxes?.length ? <details><summary>{zh ? "原始行框与文字" : "Original line boxes and text"}</summary><p>{zh ? "行框按原始机器文本定位。" : "Boxes align with the original machine text."}</p>{frame && <><label><input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} />{zh ? "显示当前图像行框" : "Show boxes on current image"}</label><div className="local-ocr__frame"><img src={frame.previewUrl} alt={zh ? "本次识别的当前页图像" : "Current page image submitted for OCR"} />{showBoxes && result.machine.lineBoxes.map((line, index) => <span key={index} title={result.machine.text?.slice(line.start, line.end)} style={{ left: `${line.x * 100}%`, top: `${line.y * 100}%`, width: `${line.width * 100}%`, height: `${line.height * 100}%` }} />)}</div></>}{!frame && <p>{zh ? "历史记录保存原始文字和行框坐标。" : "History retains original text and box coordinates."}</p>}<ol>{result.machine.lineBoxes.map((line, index) => <li key={index}><span>{result.machine.text?.slice(line.start, line.end)}</span><small>{line.start}–{line.end} · ({line.x.toFixed(3)}, {line.y.toFixed(3)}, {line.width.toFixed(3)}, {line.height.toFixed(3)})</small></li>)}</ol></details> : null}
    <form onSubmit={(event) => void save(event)}><label>{zh ? "人工修订文本" : "Corrected text"}<textarea rows={7} maxLength={OCR_ENGINE_MAX_TEXT_UNITS} value={text} disabled={busy} onChange={(event) => { setText(event.target.value); onDraft(event.target.value === (baseline.correctedText ?? baseline.machine.text ?? "") ? null : { text: event.target.value, revision: baseline.revision }); }} /></label>
      {latest && <div className="local-ocr__conflict"><p>{zh ? "最新已保存修订" : "Latest saved correction"}</p><pre>{latest.correctedText ?? latest.machine.text ?? ""}</pre><button type="button" disabled={busy} onClick={() => { setBaseline(latest); onDraft(text === (latest.correctedText ?? latest.machine.text ?? "") ? null : { text, revision: latest.revision }); setLatest(null); }}>{zh ? "已核对，保留我的草稿" : "Reviewed: keep my draft"}</button><button type="button" disabled={busy} onClick={() => { setBaseline(latest); setText(latest.correctedText ?? latest.machine.text ?? ""); onSaved(latest); onDraft(null); setLatest(null); }}>{zh ? "使用最新已保存文本" : "Use latest saved text"}</button></div>}
      <div className="local-ocr__actions"><button type="submit" disabled={busy || !dirty || !!latest}>{zh ? "保存修订" : "Save correction"}</button><button type="button" onClick={() => void copyText(text, zh, setMessage)}>{zh ? "复制文本" : "Copy text"}</button><button type="button" onClick={exportText}>{zh ? "导出.txt" : "Export .txt"}</button>{dirty && <span>{zh ? "尚未保存" : "Unsaved"}</span>}</div>
    </form>{message && <p role="status">{message}</p>}
  </div>;
}

export function OcrConnectionDialog({ api, returnFocus, onClose }: { api: LocalOcrApi; returnFocus: HTMLElement; onClose: () => void }) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const [tab, setTab] = useState<"local" | "online">("local");
  const [devices, setDevices] = useState<LocalOcrDevice[]>([]); const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState<{ pairingCode: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [kit, setKit] = useState<"loading" | "available" | "unavailable">("loading");
  const [devicesState, setDevicesState] = useState<"loading" | "ready" | "failed">("loading");
  const [now, setNow] = useState(Date.now());
  const dialogRef = useModalDialog(onClose, false, returnFocus); const alive = useRef(true);
  const refresh = async (signal?: AbortSignal) => {
    try {
      const items = await api.devices(signal);
      if (alive.current && !signal?.aborted) { setDevices(items); setDevicesState("ready"); }
    } catch (error) {
      if (alive.current && !signal?.aborted) { setDevicesState("failed"); setMessage(ocrError(error, zh)); }
    }
  };
  const deviceLimitReached = devices.filter((device) => !device.revokedAt && Date.parse(device.tokenExpiresAt) > now).length >= LOCAL_OCR_LIMITS.maxDevicesPerAccount;
  useEffect(() => {
    alive.current = true; const abort = new AbortController();
    void refresh(abort.signal);
    // A download link is shown only after checking the real static package.
    void fetch("/local-ocr-connector.zip", { method: "HEAD", credentials: "same-origin", signal: abort.signal }).then((response) => {
      const type = response.headers.get("Content-Type")?.split(";")[0]?.toLowerCase();
      if (!abort.signal.aborted) setKit(response.ok && ["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(type ?? "") && Number(response.headers.get("Content-Length")) > 0 ? "available" : "unavailable");
    }).catch(() => { if (!abort.signal.aborted) setKit("unavailable"); });
    const timer = window.setInterval(() => { setNow(Date.now()); void refresh(abort.signal); }, 10_000);
    return () => { alive.current = false; abort.abort(); window.clearInterval(timer); };
  }, [api]);
  const pair = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !label.trim() || devicesState !== "ready" || deviceLimitReached) return;
    setBusy(true); setPairing(null); setMessage("");
    try { const value = await api.pairing(label.trim()); if (alive.current) { setPairing(value); setNow(Date.now()); } }
    catch (error) { if (alive.current) setMessage(ocrError(error, zh)); }
    finally { if (alive.current) setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true); setMessage("");
    try { await api.revoke(id); if (alive.current) { await refresh(); setMessage(zh ? "设备已撤销，其未完成请求已取消。" : "Device revoked; its pending requests were cancelled."); } }
    catch (error) { if (alive.current) setMessage(ocrError(error, zh)); }
    finally { if (alive.current) setBusy(false); }
  };
  const expired = !!pairing && Date.parse(pairing.expiresAt) <= now;
  const origin = window.location.origin;
  return <dialog ref={dialogRef} className="local-ocr-dialog" aria-labelledby="local-ocr-title">
    <header><h2 id="local-ocr-title">{zh ? "连接OCR" : "Connect OCR"}</h2><button type="button" onClick={onClose}>{zh ? "返回阅读" : "Back to reading"}</button></header>
    <div className="local-ocr__actions"><button type="button" aria-pressed={tab === "local"} onClick={() => setTab("local")}>{zh ? "我的本地设备" : "My local device"}</button><button type="button" aria-pressed={tab === "online"} onClick={() => setTab("online")}>{zh ? "我的在线账户" : "My online account"}</button></div>
    {tab === "local" ? <>
      <p>{zh ? "使用自己电脑上的引擎识别当前页或整书，连接仅供你的账户使用。新版连接器支持后台整书任务。" : "Recognize a page or book using an engine on your own computer. The connection is private to your account. The updated connector supports background book jobs."}</p>
      <ol><li>{zh ? "已有 Paddle 环境：直接连接。Linux/WSL 的 AcademicCloud 标准安装可以自动检测；其他安装使用配置文件指定自己的路径。" : "Already have Paddle installed: connect directly. The standard AcademicCloud installation on Linux/WSL supports detection; other installations use a configuration file with your own paths."}</li><li>{zh ? "尚未安装：按自己电脑的操作系统查看官方安装说明，安装并通过连接器测试。连接器与 OCR 引擎是两个独立安装项。" : "Not installed: follow official instructions for your computer's operating system, then pass the connector test. The connector and OCR engine are separate installations."} <a href="https://www.paddleocr.ai/main/quick_start.html" target="_blank" rel="noreferrer">PaddleOCR</a> · <a href="https://www.paddlepaddle.org.cn/install/quick" target="_blank" rel="noreferrer">PaddlePaddle</a></li><li>{zh ? "下载并解压连接器，在目录中安装依赖；运行后，把配对码粘贴到连接器提示中。配对码十分钟内有效、只能用一次；重新生成会使前一个码失效。" : "Download and extract the connector, install its dependencies, then paste the pairing code at its prompt. Codes expire in ten minutes and can be used once; generating a new code invalidates the previous one."}</li></ol>
      <p>{zh ? "首次使用请在运行引擎的 Linux/WSL 环境安装 Node.js 24。" : "Before first use, install Node.js 24 in the Linux/WSL environment running your engine."} <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">{zh ? "Node.js 官方下载" : "Official Node.js download"}</a></p>
      <p>{zh ? "所需版本：PaddlePaddle 3.3.1、PaddleOCR 3.7.0，以及安装包指定的 PP-OCRv6 small 模型。配置和模型要求见安装包说明。" : "Required versions: PaddlePaddle 3.3.1, PaddleOCR 3.7.0 and the PP-OCRv6 small models specified by the package. See its instructions for configuration and model requirements."}</p>
      {kit === "available" ? <a className="button" href="/local-ocr-connector.zip" download>{zh ? "下载本地连接器" : "Download local connector"}</a> : <p role="status">{kit === "loading" ? (zh ? "正在检查连接器安装包…" : "Checking the connector package…") : (zh ? "连接器安装包暂不可用，请稍后重新打开。" : "The connector package is unavailable. Reopen this dialog later.")}</p>}
      <p>{zh ? "标准 Linux/WSL 安装：" : "Standard Linux/WSL installation:"}</p><pre>npm install{"\n"}npm start -- --core {origin} --pair --detect-installed</pre>
      <p>{zh ? "其他本地安装（用自己的配置文件完整路径替换 /absolute/member-ocr.json）：" : "Other local installations (replace /absolute/member-ocr.json with your configuration file's full path):"}</p><pre>npm start -- --core {origin} --pair --config /absolute/member-ocr.json</pre>
      <p>{zh ? "按安装包示例填写自己的 Python、侧车、模型和缓存路径。检查失败时按连接器提示修复。" : "Use the package example to configure your Python, sidecar, model and cache paths. Follow connector diagnostics if checks fail."}</p>
      <form onSubmit={(event) => void pair(event)}><label>{zh ? "设备名称" : "Device name"}<input autoFocus required maxLength={80} value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)} placeholder={zh ? "例如：我的笔记本" : "For example: My laptop"} /></label><button type="submit" disabled={busy || !label.trim() || devicesState !== "ready" || deviceLimitReached}>{zh ? "生成配对码" : "Generate pairing code"}</button></form>
      {deviceLimitReached && <p>{zh ? `已连接 ${LOCAL_OCR_LIMITS.maxDevicesPerAccount} 台设备；重新配对前，请在下方撤销不再使用的旧连接。已保存的 OCR 结果会保留。` : `All ${LOCAL_OCR_LIMITS.maxDevicesPerAccount} device slots are in use. Revoke an unused connection below before pairing again. Saved OCR results are retained.`}</p>}
      {pairing && <div className="local-ocr__pairing"><p>{expired ? (zh ? "配对码已过期，请生成新码。" : "Pairing code expired. Generate a new one.") : (zh ? `有效至 ${new Date(pairing.expiresAt).toLocaleTimeString()}，粘贴到连接器的输入提示中。` : `Valid until ${new Date(pairing.expiresAt).toLocaleTimeString()}. Paste into the connector's input prompt.`)}</p>{!expired && <><code>{pairing.pairingCode}</code><button type="button" onClick={() => void copyText(pairing.pairingCode, zh, setMessage)}>{zh ? "复制配对码" : "Copy pairing code"}</button></>}</div>}
      <h3>{zh ? "已配对设备" : "Paired devices"}</h3>
      {devicesState === "loading" && <p role="status">{zh ? "正在读取设备…" : "Loading paired devices…"}</p>}
      {devicesState === "ready" && !devices.length && <p>{zh ? "暂无设备。配对并通过测试后会出现在这里。" : "No devices yet. Paired devices appear after passing the test."}</p>}
      {devicesState === "failed" && <button type="button" disabled={busy} onClick={() => { setMessage(""); setDevicesState("loading"); void refresh(); }}>{zh ? "重新读取设备" : "Reload devices"}</button>}
      <ul className="local-ocr__devices">{devices.map((device) => <li key={device.id}><strong>{device.label}</strong><span>{device.revokedAt ? (zh ? "已撤销" : "Revoked") : Date.parse(device.tokenExpiresAt) <= now ? (zh ? "连接已过期" : "Connection expired") : device.online ? (zh ? "在线" : "Online") : (zh ? "离线" : "Offline")}</span><small>{device.capabilities.engineId} {device.capabilities.engineVersion}</small><small>{device.transportFeatures?.includes(LOCAL_OCR_BOOK_FEATURE) ? (zh ? "支持后台整书" : "Background book jobs supported") : (zh ? "整书识别需开启阅读器" : "Book OCR requires the Reader to stay open")}</small>{device.lastSeenAt && <small>{zh ? "最近在线：" : "Last seen: "}{new Date(device.lastSeenAt).toLocaleString()}</small>}{!device.revokedAt && <button type="button" disabled={busy} onClick={() => void revoke(device.id)}>{zh ? "撤销" : "Revoke"}</button>}</li>)}</ul>
      <details><summary tabIndex={0}>{zh ? "连接与故障排查" : "Connection and troubleshooting"}</summary><p>{zh ? "Windows：安装 Node.js24 后，在 Windows PowerShell 中进入新版连接器的解压目录，运行下面的内存检查。若提示虚拟内存紧张，先保存并退出占用较大的程序，再检查。" : "Windows: after installing Node.js24, open Windows PowerShell in the updated connector's extracted folder and run the memory check below. If it reports memory pressure, save and close large applications, then check again."}</p><pre>node compute/dist/member-host-memory.js</pre><p>{zh ? "后台整书任务可在关闭网站后继续，电脑和连接器须保持运行。电脑或连接器重启后重新配对，再到阅读器手动继续；连接器不会自动启动。旧连接器识别整书时须保持阅读器开启。手机可发起任务并查看结果，OCR在自己的配对电脑上运行。" : "Background book jobs continue after you close the website while your computer and connector stay running. After restarting the computer or connector, pair again and resume manually in the Reader; the connector does not start automatically. Older connectors require the Reader to stay open for book OCR. A phone can start jobs and view results; recognition runs on your own paired computer."}</p></details>
    </> : <><p>{zh ? "在线账户接入尚未开放。" : "Online account connection is not available yet."}</p><a href="https://ai.baidu.com/tech/ocr" target="_blank" rel="noreferrer">{zh ? "百度OCR官方介绍" : "Official Baidu OCR information"}</a></>}
    {message && <p role="status">{message}</p>}
  </dialog>;
}
