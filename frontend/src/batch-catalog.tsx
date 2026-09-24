import { useEffect, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  CatalogApplyResult,
  CatalogPreview,
  LibraryHolding,
  LibrarySummary,
} from "./api.ts";
import {
  exportCatalogEvidenceLocally,
  LocalCatalogBridgeError,
  localCatalogErrorText,
  localCatalogProgressText,
  localCatalogReadyText,
  localCatalogText,
} from "./catalog-local-bridge.ts";
import { describeError } from "./i18n.ts";
import { BatchCatalogReview, canSelectCatalogItem, EMPTY_ACKNOWLEDGEMENTS, type ReviewAcknowledgements } from "./batch-catalog-review.tsx";
import { clearReviewDraft, getReviewDraft, saveReviewDraft, type CatalogReviewDraft, type CatalogReviewSession } from "./catalog-review-draft.ts";
import { useLanguage } from "./i18n-react.tsx";

const MAX_RESULTS_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_RESOURCES = 500;
function isPdfHolding(holding: LibraryHolding): boolean {
  return holding.file.mediaType?.toLowerCase() === "application/pdf";
}

function isUncataloguedPdfHolding(holding: LibraryHolding): boolean {
  return isPdfHolding(holding) && holding.materialClass == null;
}

function boundedPdfHoldings(holdings: readonly LibraryHolding[]): LibraryHolding[] {
  return holdings.filter(isPdfHolding).slice(0, MAX_BATCH_RESOURCES);
}

async function loadUncataloguedPdfHoldings(
  api: AcademicCloudApi,
  libraryId: string,
): Promise<{ holdings: LibraryHolding[]; truncated: boolean }> {
  if (!api.listLibraryHoldingsSorted) {
    const eligible = (await api.listLibraryHoldings(libraryId)).filter(isUncataloguedPdfHolding);
    return {
      holdings: eligible.slice(0, MAX_BATCH_RESOURCES),
      truncated: eligible.length > MAX_BATCH_RESOURCES,
    };
  }

  const selected: LibraryHolding[] = [];
  const selectedIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;

  for (;;) {
    const page = await api.listLibraryHoldingsSorted(libraryId, "newest", cursor);
    for (const holding of page.holdings) {
      if (!isUncataloguedPdfHolding(holding) || selectedIds.has(holding.file.id)) continue;
      if (selected.length >= MAX_BATCH_RESOURCES) {
        truncated = true;
        break;
      }
      selected.push(holding);
      selectedIds.add(holding.file.id);
    }

    if (truncated || page.nextCursor === null) break;
    if (page.nextCursor === cursor || seenCursors.has(page.nextCursor)) throw new Error("invalid_input");
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return { holdings: selected, truncated };
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function BatchCatalogDialog({
  api,
  library,
  initialHoldings,
  reviewSession,
  onClose,
  onApplied,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  initialHoldings: LibraryHolding[];
  reviewSession?: CatalogReviewSession;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { language, t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const closedRef = useRef(false);
  const [holdings, setHoldings] = useState<LibraryHolding[]>(() => boundedPdfHoldings(initialHoldings));
  const [resourceIds, setResourceIds] = useState<ReadonlySet<string>>(
    () => new Set(boundedPdfHoldings(initialHoldings).map((entry) => entry.file.id)),
  );
  const [uncataloguedTruncated, setUncataloguedTruncated] = useState(false);
  const [acknowledgements, setAcknowledgements] = useState<ReviewAcknowledgements>({ ...EMPTY_ACKNOWLEDGEMENTS });
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [selectedPreviewIds, setSelectedPreviewIds] = useState<ReadonlySet<string>>(new Set());
  const [applyResults, setApplyResults] = useState<CatalogApplyResult[] | null>(null);
  const [exportStatus, setExportStatus] = useState<string>("");
  const [exportStatusKind, setExportStatusKind] = useState<"progress" | "success" | "warning">("progress");
  const [localExportError, setLocalExportError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultsDocument, setResultsDocument] = useState<unknown>(null);
  const [resumeDraft, setResumeDraft] = useState<CatalogReviewDraft | null>(() => getReviewDraft(reviewSession, library.id));
  const [refreshRecoveryAvailable, setRefreshRecoveryAvailable] = useState(true);

  useEffect(() => {
    if (resultsDocument === null) return;
    setRefreshRecoveryAvailable(saveReviewDraft(reviewSession, { libraryId: library.id, document: resultsDocument,
      selectedResourceIds: [...selectedPreviewIds], results: applyResults ?? [] }));
  }, [applyResults, library.id, resultsDocument, reviewSession, selectedPreviewIds]);

  useEffect(() => {
    closedRef.current = false;
    dialogRef.current?.showModal();
    return () => {
      closedRef.current = true;
      exportAbortRef.current?.abort();
    };
  }, []);

  const exportActive = busy && exportAbortRef.current !== null;

  function closeDialog(): void {
    closedRef.current = true;
    exportAbortRef.current?.abort();
    if (resultsDocument !== null) {
      saveReviewDraft(reviewSession, {
        libraryId: library.id,
        document: resultsDocument,
        selectedResourceIds: [...selectedPreviewIds],
        results: applyResults ?? [],
      });
    }
    onClose();
  }

  function toggleResource(resourceId: string): void {
    setResourceIds((current) => {
      const next = new Set(current);
      if (next.has(resourceId)) next.delete(resourceId); else if (next.size < MAX_BATCH_RESOURCES) next.add(resourceId);
      return next;
    });
  }

  async function selectUncatalogued(): Promise<void> {
    setBusy(true); setError(null); setExportStatus(""); setLocalExportError(""); setUncataloguedTruncated(false);
    try {
      const selection = await loadUncataloguedPdfHoldings(api, library.id);
      if (closedRef.current) return;
      setHoldings(selection.holdings);
      setResourceIds(new Set(selection.holdings.map((entry) => entry.file.id)));
      setUncataloguedTruncated(selection.truncated);
    } catch (caught: unknown) {
      if (!closedRef.current) setError(caught);
    } finally {
      if (!closedRef.current) setBusy(false);
    }
  }

  async function exportRequest(): Promise<void> {
    if (!api.createCatalogBatchExportRequest || resourceIds.size < 1 || resourceIds.size > MAX_BATCH_RESOURCES) return;
    const controller = new AbortController();
    exportAbortRef.current?.abort();
    exportAbortRef.current = controller;
    setBusy(true); setError(null); setExportStatus(""); setExportStatusKind("progress"); setLocalExportError("");
    try {
      const request = await api.createCatalogBatchExportRequest(library.id, [...resourceIds]);
      if (controller.signal.aborted) return;
      const localPackage = await exportCatalogEvidenceLocally(request, fetch, controller.signal, (progress) => {
        if (controller.signal.aborted || closedRef.current) return;
        setExportStatusKind("progress");
        setExportStatus(localCatalogProgressText(language, progress));
      });
      if (controller.signal.aborted || closedRef.current) return;
      downloadBlob(localPackage.filename, localPackage.blob);
      setExportStatusKind(localPackage.failedResources > 0 ? "warning" : "success");
      setExportStatus(localCatalogReadyText(language, request.manifest.resources.length, localPackage.failedResources));
    } catch (caught: unknown) {
      if (caught instanceof LocalCatalogBridgeError) {
        if (caught.code === "cancelled" || closedRef.current) return;
        setExportStatus("");
        setLocalExportError(localCatalogErrorText(language, caught.code));
      } else if (!closedRef.current) {
        setError(caught);
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      if (!closedRef.current) setBusy(false);
    }
  }

  async function importResults(file: File): Promise<void> {
    setError(null); setApplyResults(null); setPreview(null); setResultsDocument(null); setResumeDraft(null); setAcknowledgements({ ...EMPTY_ACKNOWLEDGEMENTS });
    setRefreshRecoveryAvailable(true);
    if (file.size < 2 || file.size > MAX_RESULTS_BYTES || !api.previewCatalogBatchResults) {
      setError(Object.assign(new Error("catalog_results_invalid"), { code: "catalog_results_invalid" })); return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const nextPreview = await api.previewCatalogBatchResults(library.id, parsed);
      if (closedRef.current) return;
      setResultsDocument(parsed);
      setPreview(nextPreview);
      setSelectedPreviewIds(new Set());
    } catch (caught: unknown) {
      if (!closedRef.current) setError(caught instanceof SyntaxError
        ? Object.assign(new Error("catalog_results_invalid"), { code: "catalog_results_invalid" }) : caught);
    } finally { if (!closedRef.current) setBusy(false); }
  }

  async function resumeReview(): Promise<void> {
    const draft = resumeDraft;
    if (!draft || !api.previewCatalogBatchResults) return;
    setResumeDraft(null);
    setBusy(true); setError(null); setAcknowledgements({ ...EMPTY_ACKNOWLEDGEMENTS });
    try {
      const nextPreview = await api.previewCatalogBatchResults(library.id, draft.document);
      if (closedRef.current) return;
      const completedIds = new Set(draft.results.filter((entry) => entry.status === "applied" || entry.status === "unchanged").map((entry) => entry.resourceId));
      const reviewableIds = new Set(nextPreview.items.filter(canSelectCatalogItem).map((entry) => entry.resourceId));
      const selected = new Set(draft.selectedResourceIds.filter((resourceId) => reviewableIds.has(resourceId) && !completedIds.has(resourceId)));
      setResultsDocument(draft.document);
      setPreview(nextPreview);
      setApplyResults(draft.results.length > 0 ? draft.results : null);
      setSelectedPreviewIds(selected);
      clearReviewDraft(reviewSession, library.id);
    } catch (caught: unknown) {
      if (!closedRef.current) { setResumeDraft(draft); setError(caught); }
    } finally { if (!closedRef.current) setBusy(false); }
  }

  function changeSelection(ids: ReadonlySet<string>): void {
    setSelectedPreviewIds(ids);
    setAcknowledgements({ ...EMPTY_ACKNOWLEDGEMENTS });
  }

  const selectedItems = preview?.items.filter((item) => selectedPreviewIds.has(item.resourceId)) ?? [];
  const acknowledged = selectedItems.every((item) =>
    (!item.requiresAcknowledgement.evidence || acknowledgements.evidence)
    && (!item.requiresAcknowledgement.humanConflict || acknowledgements.humanConflict)
    && (!item.requiresAcknowledgement.clear || acknowledgements.clear));

  async function apply(): Promise<void> {
    if (!preview || !api.applyCatalogBatchResults || selectedPreviewIds.size < 1 || !acknowledged) return;
    setBusy(true); setError(null);
    try {
      const response = await api.applyCatalogBatchResults(
        library.id,
        preview.planId,
        preview.items.filter((entry) => selectedPreviewIds.has(entry.resourceId)).map((entry) => ({
          resourceId: entry.resourceId,
          previewVersion: entry.previewVersion,
          ...(entry.requiresAcknowledgement.evidence && acknowledgements.evidence ? { acknowledgeEvidence: true as const } : {}),
          ...(entry.requiresAcknowledgement.humanConflict && acknowledgements.humanConflict ? { acknowledgeHumanConflict: true as const } : {}),
          ...(entry.requiresAcknowledgement.clear && acknowledgements.clear ? { acknowledgeClear: true as const } : {}),
        })),
      );
      if (closedRef.current) return;
      setApplyResults((previous) => [...new Map([...(previous ?? []), ...response.results].map((entry) => [entry.resourceId, entry])).values()]);
      const completed = new Set(response.results.filter((entry) => entry.status === "applied" || entry.status === "unchanged").map((entry) => entry.resourceId));
      changeSelection(new Set([...selectedPreviewIds].filter((id) => !completed.has(id))));
      if (response.results.some((entry) => entry.status === "applied")) onApplied();
    } catch (caught: unknown) {
      if (!closedRef.current) setError(caught);
    } finally { if (!closedRef.current) setBusy(false); }
  }

  return (
    <dialog ref={dialogRef} className="batch-naming-modal batch-catalog-modal" aria-labelledby="batch-catalog-title" onCancel={(event) => {
      event.preventDefault();
      if (!busy || exportActive) closeDialog();
    }}>
      <div className="batch-naming-heading">
        <h2 id="batch-catalog-title">{t("batchCatalog.title")}</h2>
        <button className="button button--quiet" type="button" disabled={busy && !exportActive} onClick={closeDialog}>{t("batchCatalog.close")}</button>
      </div>
      {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
      {localExportError && <div className="alert alert--error" role="alert">{localExportError}</div>}
      {resumeDraft && <div className="alert alert--warning" role="status">
        <span>{t("batchCatalog.resumeHint")}</span>
        <button className="button button--small" type="button" disabled={busy} onClick={() => void resumeReview()}>{t("batchCatalog.resume")}</button>
      </div>}
      {resultsDocument !== null && !refreshRecoveryAvailable && <div className="alert alert--warning" role="status">
        {language === "zh-CN"
          ? "浏览器存储不可用或已满。当前页面仍可继续审阅；刷新前请完成审阅，刷新后可能无法恢复这份草稿。"
          : "Browser storage is unavailable or full. You can keep reviewing on this page, but this draft may not survive a refresh."}
      </div>}
      <ol className="catalog-steps" aria-label={language === "zh-CN" ? "批量编目步骤" : "Batch catalog steps"}>
        {(language === "zh-CN" ? ["选择资料", "准备证据", "导入结果", "审核建议", "确认应用", "逐项结果"] : ["Select", "Evidence", "Import", "Review", "Confirm", "Results"]).map((step, index) => <li key={step} aria-current={index === (applyResults ? 5 : preview ? 3 : 0) ? "step" : undefined}><span>{index + 1}</span>{step}</li>)}
      </ol>
      {busy && <p className="catalog-busy" role="status">{language === "zh-CN" ? "正在处理，请稍候…" : "Working, please wait…"}</p>}
      <details className="catalog-preparation" open={!preview}>
      <summary>{language === "zh-CN" ? "选择资料、准备证据与导入" : "Selection, evidence and import"}</summary>
      <section aria-labelledby="batch-catalog-export-title">
        <h3 id="batch-catalog-export-title">{t("batchCatalog.exportTitle")}</h3>
        <div className="batch-catalog-selection-actions">
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => void selectUncatalogued()}>{language === "zh-CN" ? "选择未编目 PDF" : "Select uncatalogued PDFs"}</button>
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => setResourceIds(new Set(holdings.map((entry) => entry.file.id)))}>{t("batchCatalog.selectAll", { count: holdings.length })}</button>
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => setResourceIds(new Set())}>{t("batchCatalog.clear")}</button>
          <strong>{t("batchCatalog.selected", { count: resourceIds.size })}</strong>
        </div>
        {uncataloguedTruncated && (
          <div className="alert alert--warning" role="status">
            {language === "zh-CN"
              ? "已选择前 500 个未编目 PDF；仍有更多未编目 PDF，请分批处理。"
              : "Selected the first 500 uncatalogued PDFs; more remain and require another batch."}
          </div>
        )}
        <div className="batch-catalog-resource-list">
          {holdings.map((holding) => (
            <label key={holding.file.id}>
              <input type="checkbox" checked={resourceIds.has(holding.file.id)} disabled={busy} onChange={() => toggleResource(holding.file.id)} />
              <span>{holding.file.displayName}</span>
            </label>
          ))}
        </div>
        <button className="button button--primary" type="button" disabled={busy || resourceIds.size < 1} onClick={() => void exportRequest()}>{localCatalogText(language, "generate")}</button>
        {exportStatus && (
          <div className={`alert ${exportStatusKind === "success" ? "alert--success" : "alert--warning"}`} role="status">
            {exportStatus}
          </div>
        )}
      </section>
      <section aria-labelledby="batch-catalog-import-title">
        <h3 id="batch-catalog-import-title">{t("batchCatalog.importTitle")}</h3>
        <input aria-label={t("batchCatalog.importTitle")} type="file" accept="application/json,.json" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0]; if (file) void importResults(file); event.currentTarget.value = "";
        }} />
      </section>
      </details>
      {preview && (
        <section aria-labelledby="batch-catalog-preview-title">
          <h3 id="batch-catalog-preview-title">{t("batchCatalog.previewTitle")}</h3>
          <BatchCatalogReview key={preview.planId} preview={preview} selected={selectedPreviewIds}
            onSelectionChange={changeSelection} acknowledgements={acknowledgements} onAcknowledge={setAcknowledgements}
            busy={busy} results={applyResults} />
          <button className="button button--primary" type="button" disabled={busy || selectedPreviewIds.size < 1 || !acknowledged} onClick={() => void apply()}>{t("batchCatalog.apply", { count: selectedPreviewIds.size })}</button>
        </section>
      )}
      {applyResults && <div className={`alert ${applyResults.every((item) => item.status === "applied" || item.status === "unchanged") ? "alert--success" : "alert--warning"}`} role="status">{t("batchCatalog.applyResult", { applied: applyResults.filter((entry) => entry.status === "applied").length, total: applyResults.length })}</div>}
      <footer className="batch-naming-actions"><button className="button button--quiet" type="button" disabled={busy && !exportActive} onClick={closeDialog}>{t("batchCatalog.close")}</button></footer>
    </dialog>
  );
}
