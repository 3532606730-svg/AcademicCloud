import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from "pdfjs-dist";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";
import { cMapUrl, standardFontDataUrl, wasmUrl, iccUrl, workerUrl } from "./pdf-assets.ts";
import { useLanguage } from "./i18n-react.tsx";
import { remotePdfTransport } from "./remote-pdf-transport.ts";
import { localPdfTransport } from "./local-pdf-transport.ts";
import { captureOcrFrame, type PaintedOcrPage } from "./local-ocr-frame.ts";
import { CurrentPageOcr, type ReaderLocalOcr } from "./local-ocr-ui.tsx";
import "./pdf-reader.css";

type PdfEngine = typeof import("pdfjs-dist");
let enginePromise: Promise<PdfEngine> | undefined;

function loadEngine(): Promise<PdfEngine> {
  enginePromise ??= import("pdfjs-dist").then((engine) => {
    engine.GlobalWorkerOptions.workerSrc = workerUrl;
    return engine;
  }).catch((error: unknown) => {
    enginePromise = undefined;
    throw error;
  });
  return enginePromise;
}

export interface PdfHighlightRect { x: number; y: number; width: number; height: number }
export interface PdfHighlight {
  id: string;
  physicalPage: number;
  text: string;
  rects: PdfHighlightRect[];
  color: "yellow" | "green" | "blue" | "pink";
}
type SelectionHighlight = Omit<PdfHighlight, "id">;
type PageGeometry = { page: number; pdfPage: PDFPageProxy; viewport: ReturnType<PDFPageProxy["getViewport"]>; sheet: HTMLDivElement };
const HIGHLIGHT_COLORS = { yellow: "#f5d94a", green: "#7fcfa0", blue: "#8bbfee", pink: "#ee9dbb" };
const MAX_TEXT_PAGES = 500;
const MAX_TEXT_CHARS = 5_000_000;
const MAX_SEARCH_RESULTS = 100;

export interface PdfReaderProps {
  url: string;
  localFile?: File | undefined;
  remoteSource?: { size: number; getUrl: () => Promise<string> } | undefined;
  title: string;
  /** Authorized physical page. Navigation requests do not change this locally. */
  page: number;
  onPageChange: (page: number) => void;
  onDocumentLoaded?: (pageCount: number) => void;
  onPageRendered?: (page: number) => void;
  onPageUnavailable?: () => void;
  onError?: (error: unknown) => void;
  /** Refresh the source authorization when provided; otherwise reload locally. */
  onRetry?: () => void;
  navigationPending?: boolean;
  highlights?: PdfHighlight[];
  onCreateHighlight?: (highlight: SelectionHighlight) => void | Promise<void>;
  onDeleteHighlight?: (highlight: PdfHighlight) => void | Promise<void>;
  onNewNote?: () => void;
  localOcr?: ReaderLocalOcr | undefined;
}

const MAX_CANVAS_PIXELS = 12_000_000;
const MAX_CANVAS_DIMENSION = 8192;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export function PdfReader(props: PdfReaderProps) {
  const { url, localFile, title, page, navigationPending = false } = props;
  const remoteSize = props.remoteSource?.size;
  const { language } = useLanguage();
  const zh = language === "zh-CN";
  const callbacks = useRef(props);
  callbacks.current = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const geometry = useRef<PageGeometry | null>(null);
  const textOperation = useRef(0);
  const textStream = useRef<{ cancel: () => Promise<void> } | null>(null);
  const alive = useRef(true);
  const [rotation, setRotation] = useState(0);
  const [geometryVersion, setGeometryVersion] = useState(0);
  const [selection, setSelection] = useState<SelectionHighlight | null>(null);
  const [showHighlights, setShowHighlights] = useState(true);
  const [panel, setPanel] = useState<"search" | "highlights" | null>(null);
  const [toolMessage, setToolMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingHighlight, setPendingHighlight] = useState<SelectionHighlight | null>(null);
  const highlightRequest = useRef(0);
  const highlightSaving = useRef(false);
  const wheelGesture = useRef({ lastAt: 0, direction: 0, distance: 0, blocked: false });
  const wheelLanding = useRef<{ url: string; page: number } | null>(null);
  const [query, setQuery] = useState("");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [results, setResults] = useState<Array<{ page: number; excerpt: string }>>([]);
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  const [documentState, setDocumentState] = useState<{ document: PDFDocumentProxy; engine: PdfEngine; url: string; localFile?: File | undefined } | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [rendering, setRendering] = useState(true);
  const [textUnavailable, setTextUnavailable] = useState(false);
  const [pageDraft, setPageDraft] = useState(String(page));
  const [availableWidth, setAvailableWidth] = useState(0);
  const [zoom, setZoom] = useState<number | "width">("width");
  const [renderedScale, setRenderedScale] = useState(1);
  const [paintedOcrPage, setPaintedOcrPage] = useState<PaintedOcrPage | null>(null);
  const ocrSourceKey = props.localOcr ? `${props.localOcr.accountId}:${props.localOcr.resourceId}:${props.localOcr.sourceId}` : "";
  const currentView = useRef({ url, localFile, page, rotation, zoom, availableWidth, retry, navigationPending, ocrSourceKey });
  currentView.current = { url, localFile, page, rotation, zoom, availableWidth, retry, navigationPending, ocrSourceKey };
  const document = documentState?.url === url && documentState.localFile === localFile ? documentState.document : null;
  const pageCount = document?.numPages ?? null;
  const validPage = pageCount !== null && Number.isSafeInteger(page) && page >= 1 && page <= pageCount;
  const busy = !document || rendering || navigationPending;

  useEffect(() => { alive.current = true; return () => { alive.current = false; textOperation.current++; void textStream.current?.cancel().catch(() => {}); }; }, []);
  useEffect(() => { textOperation.current++; void textStream.current?.cancel().catch(() => {}); setTextBusy(false); setResults([]); setSelection(null); setToolMessage(""); }, [url, localFile, retry]);
  useEffect(() => { highlightRequest.current++; highlightSaving.current = false; setPendingHighlight(null); setSaving(false); }, [url, localFile, retry]);

  useEffect(() => { setPageDraft(String(page)); }, [page]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => { if (element.clientWidth > 0) setAvailableWidth(Math.max(1, element.clientWidth - 32)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    setDocumentState(null);
    setError(null);
    setRendering(true);
    callbacks.current.onPageUnavailable?.();
    void (async () => {
      try {
        const engine = await loadEngine();
        if (cancelled) return;
        const options: DocumentInitParameters = {
          ...(localFile ? { range: localPdfTransport(engine.PDFDataRangeTransport, localFile, (failure) => {
            if (cancelled) return;
            setError(failure); setRendering(false); callbacks.current.onError?.(failure);
            void task?.destroy().catch(() => {});
          }), length: localFile.size } : remoteSize ? { range: remotePdfTransport(engine.PDFDataRangeTransport, remoteSize, () => callbacks.current.remoteSource!.getUrl(), (failure) => {
            if (cancelled) return;
            setError(failure); setRendering(false); callbacks.current.onError?.(failure);
            void task?.destroy().catch(() => {});
          }), length: remoteSize } : { url }),
          cMapPacked: true,
          cMapUrl, standardFontDataUrl, wasmUrl, iccUrl,
          // Fetch only needed ranges when the storage adapter supports them.
          disableAutoFetch: true,
          disableStream: true,
          rangeChunkSize: 256 * 1024,
          enableXfa: false,
          canvasMaxAreaInBytes: MAX_CANVAS_PIXELS * 4,
          verbosity: 0,
        };
        task = engine.getDocument(options);
        const loadedDocument = await task.promise;
        if (cancelled) return;
        setDocumentState({ document: loadedDocument, engine, url, localFile });
        callbacks.current.onDocumentLoaded?.(loadedDocument.numPages);
      } catch (failure) {
        if (cancelled) return;
        setError(failure);
        setRendering(false);
        callbacks.current.onError?.(failure);
      }
    })();
    return () => {
      cancelled = true;
      // Aborts network requests and terminates this document's dedicated worker.
      if (task) void task.destroy().catch(() => {});
    };
  }, [url, localFile, retry, remoteSize]);

  useEffect(() => {
    const host = surfaceRef.current;
    callbacks.current.onPageUnavailable?.();
    geometry.current = null;
    setPaintedOcrPage(null);
    setSelection(null);
    if (!document || !documentState || !host || !availableWidth || !validPage) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    let pdfPage: PDFPageProxy | undefined;
    let canvas: HTMLCanvasElement | undefined;
    const snapshot = currentView.current;
    const sheet = window.document.createElement("div");
    sheet.className = "pdf-reader__sheet";
    setRendering(true);
    setError(null);
    setTextUnavailable(false);

    // Serialize cancellation/cleanup before rendering again, including the same
    // PDFPageProxy during zoom changes. Never paint two tasks into one canvas.
    const previousRender = renderQueue.current;
    renderQueue.current = previousRender.catch(() => {}).then(async () => {
      if (cancelled) return;
      try {
        pdfPage = await document.getPage(page);
        if (cancelled) return;
        const pageRotation = (pdfPage.rotate + rotation) % 360;
        const original = pdfPage.getViewport({ scale: 1, rotation: pageRotation });
        const scale = zoom === "width" ? Math.min(MAX_ZOOM, availableWidth / original.width) : zoom;
        const viewport = pdfPage.getViewport({ scale, rotation: pageRotation });
        const outputScale = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
          MAX_CANVAS_DIMENSION / viewport.width,
          MAX_CANVAS_DIMENSION / viewport.height,
        );
        canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("aria-hidden", "true");
        sheet.style.width = `${viewport.width}px`;
        sheet.style.height = `${viewport.height}px`;
        sheet.style.setProperty("--total-scale-factor", String(viewport.scale * pdfPage.userUnit));
        sheet.style.setProperty("--scale-round-x", "1px");
        sheet.style.setProperty("--scale-round-y", "1px");
        sheet.append(canvas);
        host.replaceChildren(sheet);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("PDF canvas unavailable");
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (cancelled) return;
        const paintedGeometry = { page, pdfPage, viewport, sheet };
        geometry.current = paintedGeometry;
        const isCurrent = () => {
          const selected = currentView.current;
          return !cancelled && alive.current && geometry.current === paintedGeometry && !selected.navigationPending
            && selected.url === snapshot.url && selected.localFile === snapshot.localFile && selected.page === snapshot.page
            && selected.rotation === snapshot.rotation && selected.zoom === snapshot.zoom && selected.availableWidth === snapshot.availableWidth
            && selected.retry === snapshot.retry && selected.ocrSourceKey === snapshot.ocrSourceKey;
        };
        const sourcePage = pdfPage;
        setPaintedOcrPage({ isCurrent, capture: (signal) => captureOcrFrame(sourcePage, pageRotation, isCurrent, signal) });
        setGeometryVersion((value) => value + 1);
        setRenderedScale(scale);
        setRendering(false);
        callbacks.current.onPageRendered?.(page);

        // PDF-native text only. Scanned pages remain scans; no OCR is performed.
        const textContainer = window.document.createElement("div");
        textContainer.className = "pdf-reader__text textLayer";
        textContainer.dataset.mainRotation = String(pageRotation);
        sheet.append(textContainer);
        textLayer = new documentState.engine.TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container: textContainer,
          viewport,
        });
        try {
          await textLayer.render();
          if (!cancelled && !textContainer.textContent?.trim()) setTextUnavailable(true);
        } catch {
          if (!cancelled) {
            textContainer.remove();
            setTextUnavailable(true);
          }
        }
      } catch (failure) {
        if (cancelled) return;
        setError(failure);
        setRendering(false);
        callbacks.current.onError?.(failure);
      } finally {
        if (cancelled) {
          pdfPage?.cleanup();
          if (canvas) { canvas.width = 0; canvas.height = 0; }
        }
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      sheet.remove();
      // If rendering already settled, release its cached decoded images now.
      void renderQueue.current.finally(() => {
        pdfPage?.cleanup();
        if (canvas) { canvas.width = 0; canvas.height = 0; }
      }).catch(() => {});
    };
  }, [document, documentState, page, validPage, availableWidth, zoom, rotation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [page, url]);

  useEffect(() => {
    if (wheelLanding.current?.url === url && wheelLanding.current.page === geometry.current?.page) {
      const viewport = scrollRef.current;
      viewport?.scrollTo({ top: viewport.scrollHeight, left: 0 });
      wheelLanding.current = null;
    }
  }, [geometryVersion, url]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const now = performance.now();
      const direction = Math.sign(event.deltaY);
      const gesture = wheelGesture.current;
      // Require a fresh gesture after a turn; momentum must not skip pages.
      if (now - gesture.lastAt > 220 || direction !== gesture.direction) {
        gesture.distance = 0; gesture.blocked = false;
      }
      gesture.lastAt = now; gesture.direction = direction;
      const edge = direction > 0
        ? viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2
        : viewport.scrollTop <= 2;
      if (!edge) { gesture.distance = 0; return; }
      if (busy || !pageCount || error) { gesture.blocked = true; return; }
      const target = page + direction;
      if (target < 1 || target > pageCount) return;
      event.preventDefault();
      if (gesture.blocked || !window.getSelection()?.isCollapsed) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      gesture.distance += Math.abs(event.deltaY) * unit;
      if (gesture.distance < 80) return;
      gesture.blocked = true; gesture.distance = 0;
      wheelLanding.current = direction < 0 ? { url, page: target } : null;
      callbacks.current.onPageChange(target);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [busy, pageCount, page, url, error]);

  useEffect(() => {
    let frame: number | null = null;
    const capture = () => {
      frame = null;
      const current = geometry.current;
      const selected = window.getSelection();
      if (!current || rendering || navigationPending || !selected || selected.isCollapsed || selected.rangeCount !== 1) { setSelection(null); return; }
      const textLayer = current.sheet.querySelector(".textLayer");
      const range = selected.getRangeAt(0);
      if (!textLayer?.contains(range.startContainer) || !textLayer.contains(range.endContainer)) { setSelection(null); return; }
      const text = selected.toString().trim();
      if (!text || text.length > 8000) { setSelection(null); return; }
      const bounds = current.sheet.getBoundingClientRect();
      const [x0, y0, x1, y1] = current.pdfPage.view as [number, number, number, number];
      if (!bounds.width || !bounds.height || x1 <= x0 || y1 <= y0) { setSelection(null); return; }
      const rects: PdfHighlightRect[] = [];
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width < 1 || rect.height < 1) continue;
        const left = Math.max(bounds.left, rect.left), top = Math.max(bounds.top, rect.top);
        const right = Math.min(bounds.right, rect.right), bottom = Math.min(bounds.bottom, rect.bottom);
        if (right <= left || bottom <= top) continue;
        const points = ([[left, top], [right, top], [left, bottom], [right, bottom]] as Array<[number, number]>).map(([x, y]) => current.viewport.convertToPdfPoint((x - bounds.left) * current.viewport.width / bounds.width, (y - bounds.top) * current.viewport.height / bounds.height));
        const xs = points.map(([x]) => Math.max(0, Math.min(1, (x - x0) / (x1 - x0))));
        const ys = points.map(([, y]) => Math.max(0, Math.min(1, (y1 - y) / (y1 - y0))));
        const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        if (box.width > 0 && box.height > 0 && !rects.some((item) => Math.abs(item.x-box.x)<0.0001 && Math.abs(item.y-box.y)<0.0001 && Math.abs(item.width-box.width)<0.0001 && Math.abs(item.height-box.height)<0.0001)) rects.push(box);
        if (rects.length > 100) { setSelection(null); return; }
      }
      setSelection(rects.length > 0 && rects.length <= 100 ? { physicalPage: current.page, text, rects, color: "yellow" } : null);
    };
    // A drag can emit many selection changes within one painted frame.
    const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(capture); };
    window.document.addEventListener("selectionchange", schedule);
    return () => { window.document.removeEventListener("selectionchange", schedule); if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [rendering, navigationPending, geometryVersion]);

  useEffect(() => {
    const current = geometry.current;
    if (!current) return;
    current.sheet.querySelector(".pdf-reader__highlights")?.remove();
    if (!showHighlights) return;
    const layer = window.document.createElement("div");
    layer.className = "pdf-reader__highlights";
    layer.setAttribute("aria-hidden", "true");
    const [x0, y0, x1, y1] = current.pdfPage.view as [number, number, number, number];
    const visibleHighlights = pendingHighlight ? [...(props.highlights ?? []), pendingHighlight] : props.highlights ?? [];
    for (const highlight of visibleHighlights) {
      if (highlight.physicalPage !== current.page) continue;
      for (const rect of highlight.rects) {
        if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) continue;
        const a = current.viewport.convertToViewportPoint(x0 + rect.x * (x1-x0), y1 - rect.y * (y1-y0));
        const b = current.viewport.convertToViewportPoint(x0 + (rect.x+rect.width) * (x1-x0), y1 - (rect.y+rect.height) * (y1-y0));
        const mark = window.document.createElement("span");
        mark.style.left = Math.min(a[0], b[0]) + "px";
        mark.style.top = Math.min(a[1], b[1]) + "px";
        mark.style.width = Math.abs(b[0]-a[0]) + "px";
        mark.style.height = Math.abs(b[1]-a[1]) + "px";
        mark.style.backgroundColor = HIGHLIGHT_COLORS[highlight.color] ?? HIGHLIGHT_COLORS.yellow;
        layer.append(mark);
      }
    }
    current.sheet.append(layer);
    return () => layer.remove();
  }, [props.highlights, pendingHighlight, showHighlights, geometryVersion]);

  const copySelection = async () => {
    if (!selection) return;
    try { await navigator.clipboard.writeText(selection.text); setToolMessage(zh ? "选中文字已复制" : "Selected text copied"); }
    catch { setToolMessage(zh ? "无法访问剪贴板，请选中文字后使用 Ctrl/Cmd+C" : "Clipboard unavailable; select text and press Ctrl/Cmd+C"); }
  };
  const createHighlight = async () => {
    if (!selection || selection.physicalPage !== page || !props.onCreateHighlight || saving || highlightSaving.current || busy) return;
    const draft = selection;
    const request = ++highlightRequest.current;
    highlightSaving.current = true;
    setSaving(true);
    setPendingHighlight(draft);
    setShowHighlights(true);
    setSelection(null);
    setToolMessage(zh ? "高亮正在保存…" : "Saving highlight…");
    window.getSelection()?.removeAllRanges();
    try {
      await props.onCreateHighlight(draft);
      if (alive.current && request === highlightRequest.current) setToolMessage(zh ? "高亮已保存" : "Highlight saved");
    } catch {
      if (alive.current && request === highlightRequest.current) {
        // Preserve a retryable draft only while its original page is visible.
        if (geometry.current?.page === draft.physicalPage) setSelection((current) => current ?? draft);
        setToolMessage(zh ? "高亮未保存，请重试" : "Highlight was not saved; please retry");
      }
    } finally {
      if (alive.current && request === highlightRequest.current) { highlightSaving.current = false; setPendingHighlight(null); setSaving(false); }
    }
  };
  const removeHighlights = async (items: PdfHighlight[]) => {
    if (!props.onDeleteHighlight || saving) return;
    setSaving(true);
    try { for (const item of items) await props.onDeleteHighlight(item); if (alive.current) setToolMessage(zh ? "高亮已删除" : "Highlights removed"); }
    catch { if (alive.current) setToolMessage(zh ? "部分高亮未删除，请重试" : "Some highlights were not removed; please retry"); }
    finally { if (alive.current) setSaving(false); }
  };
  const cancelTextOperation = () => { textOperation.current++; void textStream.current?.cancel().catch(() => {}); setTextBusy(false); setToolMessage(zh ? "已取消" : "Cancelled"); };
  const readText = async (mode: "search" | "export") => {
    if (!document || textBusy) return;
    const start = Number(rangeStart), end = rangeEnd ? Number(rangeEnd) : Math.min(document.numPages, MAX_TEXT_PAGES);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > document.numPages || end-start+1 > MAX_TEXT_PAGES) {
      setToolMessage(zh ? "请选择有效页码范围，每次最多 500 页" : "Choose a valid range of up to 500 pages"); return;
    }
    const needle = query.trim().toLocaleLowerCase();
    if (mode === "search" && !needle) { setPanel("search"); return; }
    const operation = ++textOperation.current;
    const deadline = Date.now() + 120_000;
    const isCancelled = () => operation !== textOperation.current || !alive.current;
    setTextBusy(true); setToolMessage(""); if (mode === "search") setResults([]);
    const found: Array<{ page: number; excerpt: string }> = [];
    const chunks: string[] = [];
    let totalChars = 0, nonempty = false, reachedLimit = false;
    try {
      for (let physicalPage=start; physicalPage<=end; physicalPage++) {
        if (isCancelled()) return;
        if (Date.now() > deadline) { reachedLimit = true; break; }
        const pdfPage = await document.getPage(physicalPage);
        if (isCancelled()) return;
        const reader = pdfPage.streamTextContent().getReader();
        textStream.current = reader;
        let text = "";
        try {
          while (!isCancelled()) {
            const next = await reader.read();
            if (next.done) break;
            for (const item of next.value.items) {
              if (!("str" in item)) continue;
              const part = item.str + (item.hasEOL ? "\n" : " ");
              if (Date.now() > deadline || totalChars + text.length + part.length > MAX_TEXT_CHARS) { reachedLimit = true; break; }
              text += part;
            }
            if (reachedLimit) break;
          }
        } finally { await reader.cancel().catch(() => {}); if (textStream.current === reader) textStream.current = null; }
        if (isCancelled()) return;
        totalChars += text.length;
        nonempty ||= !!text.trim();
        if (mode === "export") chunks.push((zh ? "第 " : "Page ") + physicalPage + (zh ? " 页" : "") + "\n" + text + "\n");
        else {
          const lower = text.toLocaleLowerCase();
          let index = lower.indexOf(needle);
          while (index >= 0 && found.length < MAX_SEARCH_RESULTS) {
            found.push({ page: physicalPage, excerpt: text.slice(Math.max(0,index-40), Math.min(text.length,index+needle.length+80)) });
            index = lower.indexOf(needle, index + Math.max(1,needle.length));
          }
          setResults([...found]);
          if (found.length >= MAX_SEARCH_RESULTS) reachedLimit = true;
        }
        setToolMessage((zh ? "正在读取第 " : "Reading page ") + physicalPage + " / " + end);
        if (reachedLimit) break;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      if (isCancelled()) return;
      if (!nonempty) { setToolMessage(props.localOcr ? (zh ? "此范围没有可提取的 PDF 原生文字；扫描页可使用当前页OCR。" : "No native PDF text in this range; scanned pages can use current-page OCR.") : (zh ? "此范围没有可提取的 PDF 原生文字。" : "No native PDF text in this range.")); return; }
      if (mode === "export") {
        if (reachedLimit) { setToolMessage(zh ? "已达到本次文字或时间上限，请缩小页码范围后导出" : "Text or time limit reached; export a smaller page range"); return; }
        const objectUrl = URL.createObjectURL(new Blob(["\ufeff", chunks.join("\n")], { type: "text/plain;charset=utf-8" }));
        const link = window.document.createElement("a"); link.href = objectUrl;
        link.download = title.replace(/[\\/:*?"<>|]/g, "_") + "-" + start + "-" + end + ".txt";
        link.click(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      setToolMessage(mode === "export" ? (zh ? "所选页码范围的原生文字已导出" : "Native text from the selected range exported") : (reachedLimit ? (zh ? "已达到本次搜索上限，请缩小页码范围继续" : "Search limit reached; narrow the page range to continue") : (zh ? "搜索完成，共 " + found.length + " 处" : "Search complete: " + found.length + " matches")));
    } catch { if (!isCancelled()) setToolMessage(zh ? "读取原生文字失败，请重试" : "Could not read native text; please retry"); }
    finally { if (!isCancelled()) setTextBusy(false); }
  };

  const goToPage = (target: number) => {
    if (!pageCount || navigationPending || !Number.isSafeInteger(target) || target < 1 || target > pageCount || target === page) return;
    props.onPageChange(target);
  };
  const submitPage = (event: FormEvent) => { event.preventDefault(); goToPage(Number(pageDraft)); };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || busy) return;
    if ((event.target as HTMLElement).closest("dialog")) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "PageDown" || event.key === "PageUp") {
      if (!window.getSelection()?.isCollapsed) return;
      event.preventDefault();
      wheelLanding.current = null;
      goToPage(page + (event.key === "ArrowRight" || event.key === "PageDown" ? 1 : -1));
    }
  };
  const retryDocument = () => {
    if (props.onRetry) props.onRetry();
    else setRetry((value) => value + 1);
  };
  const changeZoom = (delta: number) => setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((renderedScale + delta) * 100) / 100)));
  const invalidPage = pageCount !== null && !validPage;

  return (
    <section className="pdf-reader" onKeyDown={onKeyDown} aria-label={zh ? `PDF 阅读器：${title}` : `PDF reader: ${title}`}>
      <div className="pdf-reader__toolbar">
        <form className="pdf-reader__navigation" onSubmit={submitPage} aria-label={zh ? "PDF 页码导航" : "PDF page navigation"}>
          <button type="button" className="pdf-reader__icon-button" disabled={!pageCount || page <= 1 || navigationPending}
            onClick={() => goToPage(page - 1)} aria-label={zh ? "上一页" : "Previous page"} title={zh ? "上一页（← / Page Up）" : "Previous page (← / Page Up)"}>‹</button>
          <label className="pdf-reader__page-label"><span>{zh ? "页码" : "Page"}</span>
            <input aria-label={zh ? "PDF 页码" : "PDF page number"} type="number" min={1} max={pageCount ?? 1} step={1}
              required disabled={!pageCount || navigationPending} value={pageDraft} onChange={(event) => setPageDraft(event.target.value)} />
          </label>
          <span className="pdf-reader__total">/ {pageCount ?? "—"}</span>
          <button type="submit" className="pdf-reader__text-button" disabled={!pageCount || navigationPending || Number(pageDraft) === page}>{zh ? "前往" : "Go"}</button>
          <button type="button" className="pdf-reader__icon-button" disabled={!pageCount || page >= pageCount || navigationPending}
            onClick={() => goToPage(page + 1)} aria-label={zh ? "下一页" : "Next page"} title={zh ? "下一页（→ / Page Down）" : "Next page (→ / Page Down)"}>›</button>
        </form>
        <div className="pdf-reader__zoom" role="group" aria-label={zh ? "页面缩放" : "Page zoom"}>
          <button type="button" className="pdf-reader__icon-button" disabled={!document || renderedScale <= MIN_ZOOM}
            onClick={() => changeZoom(-0.25)} aria-label={zh ? "缩小" : "Zoom out"}>−</button>
          <span className="pdf-reader__scale" aria-live="off">{Math.round(renderedScale * 100)}%</span>
          <button type="button" className="pdf-reader__icon-button" disabled={!document || renderedScale >= MAX_ZOOM}
            onClick={() => changeZoom(0.25)} aria-label={zh ? "放大" : "Zoom in"}>+</button>
          <button type="button" className="pdf-reader__text-button" disabled={!document} aria-pressed={zoom === "width"}
            onClick={() => setZoom("width")}>{zh ? "适应宽度" : "Fit width"}</button>
        </div>
      </div>
      <div className="pdf-reader__tools" role="toolbar" aria-label={zh ? "阅读工具" : "Reading tools"}>
        <button type="button" disabled={busy} onClick={() => setRotation((value) => (value + 270) % 360)} aria-label={zh ? "向左旋转" : "Rotate left"}>↶</button>
        <button type="button" disabled={busy} onClick={() => setRotation((value) => (value + 90) % 360)} aria-label={zh ? "向右旋转" : "Rotate right"}>↷</button>
        <span className="pdf-reader__tool-divider" />
        <button type="button" aria-pressed={!showHighlights} onClick={() => setShowHighlights(false)}>{zh ? "原文" : "Original"}</button>
        <button type="button" aria-pressed={showHighlights} onClick={() => setShowHighlights(true)}>{zh ? "显示高亮" : "Show highlights"}</button>
        <button type="button" disabled={!selection || busy} onMouseDown={(event) => event.preventDefault()} onClick={() => void copySelection()}>{zh ? "复制选文" : "Copy selection"}</button>
        {props.onCreateHighlight && <button type="button" disabled={!selection || busy || saving} onMouseDown={(event) => event.preventDefault()} onClick={() => void createHighlight()}>{saving ? (zh ? "保存中…" : "Saving…") : (zh ? "高亮选文" : "Highlight selection")}</button>}
        <button type="button" aria-expanded={panel === "search"} onClick={() => setPanel((value) => value === "search" ? null : "search")}>{zh ? "搜索 / 导出" : "Search / export"}</button>
        {props.highlights && <button type="button" aria-expanded={panel === "highlights"} onClick={() => setPanel((value) => value === "highlights" ? null : "highlights")}>{zh ? "高亮列表" : "Highlights"} ({props.highlights.length})</button>}
        {props.onNewNote && <button type="button" disabled={busy} onClick={props.onNewNote}>{zh ? "新建笔记" : "New note"}</button>}
      </div>
      {props.localOcr && <CurrentPageOcr connection={props.localOcr} physicalPage={page} painted={!busy && !error && paintedOcrPage?.isCurrent() ? paintedOcrPage : null} />}
      {panel === "search" && <div className="pdf-reader__panel">
        <form className="pdf-reader__search-form" onSubmit={(event) => { event.preventDefault(); void readText("search"); }}>
          <input aria-label={zh ? "搜索 PDF 原生文字" : "Search native PDF text"} placeholder={zh ? "在原生文字中搜索" : "Search native text"} value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} />
          <label>{zh ? "从" : "From"}<input aria-label={zh ? "文字操作起始页" : "Text operation first page"} type="number" min="1" max={pageCount ?? 1} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label>
          <label>{zh ? "到" : "To"}<input aria-label={zh ? "文字操作结束页" : "Text operation last page"} type="number" min="1" max={pageCount ?? 1} placeholder={String(Math.min(pageCount ?? 1, MAX_TEXT_PAGES))} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label>
          <button type="submit" disabled={!document || textBusy || !query.trim()}>{zh ? "搜索" : "Search"}</button>
          <button type="button" disabled={!document || textBusy} onClick={() => void readText("export")}>{zh ? "导出文字" : "Export text"}</button>
          {textBusy && <button type="button" onClick={cancelTextOperation}>{zh ? "取消" : "Cancel"}</button>}
        </form>
        <p className="pdf-reader__hint">{zh ? "按需读取 PDF 原生文字，每次最多 500 页；扫描件暂不识别。" : "Reads native PDF text on demand, up to 500 pages per operation. Scanned text is not recognized."}</p>
        {results.length > 0 && <ol className="pdf-reader__results">{results.map((result, index) => <li key={index}><button type="button" onClick={() => goToPage(result.page)}><strong>{zh ? "第 " + result.page + " 页" : "Page " + result.page}</strong><span>{result.excerpt}</span></button></li>)}</ol>}
      </div>}
      {panel === "highlights" && <div className="pdf-reader__panel">
        <div className="pdf-reader__panel-heading"><strong>{zh ? "我的高亮" : "My highlights"}</strong>{props.onDeleteHighlight && (props.highlights?.length ?? 0) > 0 && <button type="button" disabled={saving} onClick={() => { if (window.confirm(zh ? "删除当前列表内的个人高亮？尚未加载的高亮、原文件和笔记不受影响。" : "Remove the highlights in this list? Unloaded highlights, source and notes are preserved.")) void removeHighlights(props.highlights ?? []); }}>{zh ? "清空列表高亮" : "Clear listed highlights"}</button>}</div>
        {!props.highlights?.length && <p className="pdf-reader__hint">{zh ? "选中原文后点击“高亮选文”。" : "Select native text and choose Highlight selection."}</p>}
        <ol className="pdf-reader__results">{props.highlights?.map((highlight) => <li key={highlight.id}><button type="button" onClick={() => goToPage(highlight.physicalPage)}><strong>{zh ? "第 " + highlight.physicalPage + " 页" : "Page " + highlight.physicalPage}</strong><span>{highlight.text}</span></button>{props.onDeleteHighlight && <button type="button" className="pdf-reader__delete" disabled={saving} onClick={() => void removeHighlights([highlight])} aria-label={zh ? "删除高亮" : "Remove highlight"}>×</button>}</li>)}</ol>
      </div>}
      {toolMessage && <div className="pdf-reader__tool-status" role="status">{toolMessage}</div>}
      <div ref={scrollRef} className="pdf-reader__viewport" tabIndex={0} onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
        role="region" aria-label={zh ? "PDF 页面，左右方向键翻页，滚动至页边继续翻页" : "PDF page; Left / Right to navigate, scroll past page edges to turn"} aria-busy={busy && !error && !invalidPage}>
        {(error || invalidPage) && <div className="pdf-reader__message" role="alert">
          <p>{invalidPage ? (zh ? `本文件共有 ${pageCount} 页，请选择有效页码。` : `This document has ${pageCount} pages. Choose a valid page.`)
            : (zh ? "PDF 暂时无法显示，请重新加载。" : "The PDF could not be displayed. Please reload it.")}</p>
          {invalidPage ? <button type="button" className="button" onClick={() => goToPage(1)}>{zh ? "前往第一页" : "Go to first page"}</button>
            : <button type="button" className="button" onClick={retryDocument}>{zh ? "重新加载" : "Reload"}</button>}
        </div>}
        {!error && !invalidPage && busy && <div className="pdf-reader__loading" role="status">
          <span className="pdf-reader__spinner" aria-hidden="true" />{zh ? "正在加载页面…" : "Loading page…"}
        </div>}
        <div ref={surfaceRef} className="pdf-reader__surface" hidden={!!error || invalidPage} />
      </div>
      <div className="pdf-reader__status" role="status">
        <span>{pageCount && !busy && !error && validPage ? (zh ? `第 ${page} / ${pageCount} 页` : `Page ${page} of ${pageCount}`) : "\u00a0"}</span>
        <span>{textUnavailable ? (zh ? "本页文字暂不可选中" : "Text selection unavailable on this page") : (zh ? "PDF 页码" : "Physical PDF pages")}</span>
      </div>
    </section>
  );
}
