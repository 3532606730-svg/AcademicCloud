import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  CatalogApplyResult,
  CatalogPreview,
  LibraryHolding,
  LibrarySummary,
} from "./api.ts";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

const MAX_RESULTS_BYTES = 8 * 1024 * 1024;

function isPdfHolding(holding: LibraryHolding): boolean {
  return holding.file.mediaType?.toLowerCase() === "application/pdf";
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
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
  onClose,
  onApplied,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  initialHoldings: LibraryHolding[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const { language, t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [holdings, setHoldings] = useState<LibraryHolding[]>(() => initialHoldings.filter(isPdfHolding));
  const [resourceIds, setResourceIds] = useState<ReadonlySet<string>>(
    () => new Set(initialHoldings.filter(isPdfHolding).map((entry) => entry.file.id)),
  );
  const [document, setDocument] = useState<unknown>(null);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [selectedPreviewIds, setSelectedPreviewIds] = useState<ReadonlySet<string>>(new Set());
  const [applyResults, setApplyResults] = useState<CatalogApplyResult[] | null>(null);
  const [exportStatus, setExportStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  useEffect(() => {
    if (!api.listLibraryHoldingsSorted) return;
    let cancelled = false;
    void (async () => {
      const loaded: LibraryHolding[] = [];
      let cursor: string | null = null;
      do {
        const page = await api.listLibraryHoldingsSorted!(library.id, "newest", cursor);
        loaded.push(...page.holdings.filter(isPdfHolding));
        cursor = page.nextCursor;
      } while (cursor && loaded.length < 500);
      if (!cancelled) setHoldings(loaded.slice(0, 500));
    })().catch((caught: unknown) => { if (!cancelled) setError(caught); });
    return () => { cancelled = true; };
  }, [api, library.id]);

  const holdingById = useMemo(() => new Map(holdings.map((entry) => [entry.file.id, entry])), [holdings]);

  function toggleResource(resourceId: string): void {
    setResourceIds((current) => {
      const next = new Set(current);
      if (next.has(resourceId)) next.delete(resourceId); else if (next.size < 500) next.add(resourceId);
      return next;
    });
  }

  async function exportRequest(): Promise<void> {
    if (!api.createCatalogBatchExportRequest || resourceIds.size < 1) return;
    setBusy(true); setError(null); setExportStatus("");
    try {
      const request = await api.createCatalogBatchExportRequest(library.id, [...resourceIds]);
      downloadJson(`academiccloud-catalog-export-request-${request.manifest.batchId}.json`, request);
      setExportStatus(t("batchCatalog.exportPrepared", { count: request.manifest.resources.length }));
    } catch (caught: unknown) {
      setError(caught);
    } finally { setBusy(false); }
  }

  async function importResults(file: File): Promise<void> {
    setError(null); setApplyResults(null); setPreview(null); setDocument(null);
    if (file.size < 2 || file.size > MAX_RESULTS_BYTES || !api.previewCatalogBatchResults) {
      setError(new Error("invalid_input")); return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const nextPreview = await api.previewCatalogBatchResults(library.id, parsed);
      setDocument(parsed);
      setPreview(nextPreview);
      setSelectedPreviewIds(new Set(nextPreview.items.filter((entry) => entry.category === "auto").map((entry) => entry.resourceId)));
    } catch (caught: unknown) {
      setError(caught);
    } finally { setBusy(false); }
  }

  function togglePreview(resourceId: string): void {
    setSelectedPreviewIds((current) => {
      const next = new Set(current);
      if (next.has(resourceId)) next.delete(resourceId); else next.add(resourceId);
      return next;
    });
  }

  async function apply(): Promise<void> {
    if (!preview || document === null || !api.applyCatalogBatchResults || selectedPreviewIds.size < 1) return;
    if (!window.confirm(t("batchCatalog.applyConfirm", { count: selectedPreviewIds.size }))) return;
    setBusy(true); setError(null);
    try {
      const response = await api.applyCatalogBatchResults(
        library.id,
        document,
        preview.documentDigest,
        preview.items.filter((entry) => selectedPreviewIds.has(entry.resourceId)).map((entry) => ({
          resourceId: entry.resourceId,
          previewVersion: entry.previewVersion,
        })),
      );
      setApplyResults(response.results);
      if (response.results.some((entry) => entry.status === "applied")) onApplied();
    } catch (caught: unknown) {
      setError(caught);
    } finally { setBusy(false); }
  }

  return (
    <dialog ref={dialogRef} className="batch-naming-modal batch-catalog-modal" aria-labelledby="batch-catalog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="batch-naming-heading">
        <h2 id="batch-catalog-title">{t("batchCatalog.title")}</h2>
        <button className="button button--quiet" type="button" onClick={onClose}>{t("batchCatalog.close")}</button>
      </div>
      {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
      <p className="muted">{t("batchCatalog.description")}</p>
      <section aria-labelledby="batch-catalog-export-title">
        <h3 id="batch-catalog-export-title">{t("batchCatalog.exportTitle")}</h3>
        <div className="batch-catalog-selection-actions">
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => setResourceIds(new Set(holdings.map((entry) => entry.file.id)))}>{t("batchCatalog.selectAll", { count: holdings.length })}</button>
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => setResourceIds(new Set())}>{t("batchCatalog.clear")}</button>
          <strong>{t("batchCatalog.selected", { count: resourceIds.size })}</strong>
        </div>
        <div className="batch-catalog-resource-list">
          {holdings.map((holding) => (
            <label key={holding.file.id}>
              <input type="checkbox" checked={resourceIds.has(holding.file.id)} disabled={busy} onChange={() => toggleResource(holding.file.id)} />
              <span>{holding.file.displayName}</span>
            </label>
          ))}
        </div>
        <button className="button button--primary" type="button" disabled={busy || resourceIds.size < 1} onClick={() => void exportRequest()}>{t("batchCatalog.export")}</button>
        {exportStatus && <div className="alert alert--success" role="status">{exportStatus}</div>}
        <p className="muted">{t("batchCatalog.localExportHint")}</p>
      </section>
      <section aria-labelledby="batch-catalog-import-title">
        <h3 id="batch-catalog-import-title">{t("batchCatalog.importTitle")}</h3>
        <input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0]; if (file) void importResults(file); event.currentTarget.value = "";
        }} />
      </section>
      {preview && (
        <section aria-labelledby="batch-catalog-preview-title">
          <h3 id="batch-catalog-preview-title">{t("batchCatalog.previewTitle")}</h3>
          <p className="batch-catalog-counts">
            AUTO {preview.counts.AUTO} · REVIEW {preview.counts.REVIEW} · UNKNOWN {preview.counts.UNKNOWN} · STALE {preview.counts.STALE} · COLLISION {preview.counts.COLLISION} · UNCHANGED {preview.counts.UNCHANGED}
          </p>
          <div className="batch-naming-list">
            {preview.items.map((item) => {
              const selectable = item.category === "auto" || item.category === "review";
              return (
                <article className="batch-naming-item" key={item.resourceId} data-status={item.category}>
                  <label className="batch-naming-select">
                    <input type="checkbox" disabled={busy || !selectable} checked={selectedPreviewIds.has(item.resourceId)} onChange={() => togglePreview(item.resourceId)} />
                    <span className="batch-naming-main">
                      <strong>{item.currentFilename}</strong>
                      <small>{item.proposedFilename ?? t("batchCatalog.noRename")}</small>
                    </span>
                  </label>
                  <dl className="batch-catalog-detail">
                    <dt>{t("batchCatalog.titleField")}</dt><dd>{item.canonicalTitle ?? t("batchCatalog.unrecognized")}</dd>
                    <dt>{t("batchCatalog.responsibility")}</dt><dd>{item.responsibility ?? t("batchCatalog.unrecognized")}</dd>
                    <dt>{t("batchCatalog.year")}</dt><dd>{item.year ?? t("batchCatalog.unrecognized")}</dd>
                    <dt>{t("batchCatalog.class")}</dt><dd>{item.materialClass ?? "unknown"}</dd>
                    <dt>{t("batchCatalog.disposition")}</dt><dd>{item.disposition}</dd>
                    <dt>{t("batchCatalog.confidence")}</dt><dd>{item.confidence}%</dd>
                    <dt>{t("batchCatalog.identity")}</dt><dd>{t(item.identityMatch ? "batchCatalog.identityMatch" : "batchCatalog.identityMismatch")}</dd>
                    <dt>{t("batchCatalog.collision")}</dt><dd>{item.collisionStatus}</dd>
                    <dt>{t("batchCatalog.changes")}</dt><dd>{item.metadataChanges.length > 0 ? item.metadataChanges.join(", ") : t("batchCatalog.none")}</dd>
                    <dt>{t("batchCatalog.status")}</dt><dd>{item.category}</dd>
                  </dl>
                </article>
              );
            })}
          </div>
          <button className="button button--primary" type="button" disabled={busy || selectedPreviewIds.size < 1} onClick={() => void apply()}>{t("batchCatalog.apply", { count: selectedPreviewIds.size })}</button>
        </section>
      )}
      {applyResults && <div className="alert alert--success" role="status">{t("batchCatalog.applyResult", { applied: applyResults.filter((entry) => entry.status === "applied").length, total: applyResults.length })}</div>}
      <footer className="batch-naming-actions"><button className="button button--quiet" type="button" disabled={busy} onClick={onClose}>{t("batchCatalog.close")}</button></footer>
      {resourceIds.size > 0 && [...resourceIds].some((id) => !holdingById.has(id)) && <p className="muted">{t("batchCatalog.staleSelection")}</p>}
    </dialog>
  );
}
