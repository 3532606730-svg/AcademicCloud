import { useEffect, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  BatchNamingPreviewItem,
  BatchNamingResultItem,
  LibraryHolding,
  LibrarySummary,
  MaterialType,
} from "./api.ts";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

const MATERIAL_TYPES: ReadonlyArray<{ value: MaterialType; key: "typeBook" | "typeArticle" | "typeManuscript" | "typeInscription" | "typeArchivalDocument" }> = [
  { value: "book", key: "typeBook" },
  { value: "article", key: "typeArticle" },
  { value: "manuscript", key: "typeManuscript" },
  { value: "inscription", key: "typeInscription" },
  { value: "archival_document", key: "typeArchivalDocument" },
];

function materialLabel(t: (key: Parameters<ReturnType<typeof useLanguage>["t"]>[0]) => string, value: MaterialType): string {
  const entry = MATERIAL_TYPES.find((item) => item.value === value);
  return entry ? t(`metadata.${entry.key}`) : value;
}

/**
 * Manager-only batch naming. Preview → edit/select/deselect → explicit confirm
 * → per-item apply through the existing canonical metadata CAS path. OCR/Compute
 * is never required and never runs here.
 */
export function BatchNamingDialog({
  api,
  library,
  holdings,
  onClose,
  onApplied,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  holdings: LibraryHolding[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const { language, t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<BatchNamingPreviewItem[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [titles, setTitles] = useState<Readonly<Record<string, string>>>({});
  const [materials, setMaterials] = useState<Readonly<Record<string, MaterialType>>>({});
  const [results, setResults] = useState<BatchNamingResultItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!api.previewLibraryBatchNaming) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    api.previewLibraryBatchNaming(library.id, holdings.map((holding) => holding.file.id))
      .then((preview) => {
        if (cancelled) return;
        const available = preview.items.filter((item) => item.status === "available");
        setItems(preview.items);
        setSelectedIds(new Set(
          // Unresolved/low-confidence items remain unchanged by default:
          // pre-select only reliable proposals for resources without a
          // canonical title.
          available
            .filter((item) => item.proposedConfidence === "medium" && !item.canonicalTitle)
            .map((item) => item.fileId),
        ));
        setTitles(Object.fromEntries(
          available.map((item) => [item.fileId, item.proposedTitle ?? ""]),
        ));
        setMaterials(Object.fromEntries(
          available.map((item) => [item.fileId, item.materialType ?? "book"]),
        ));
      })
      .catch((caught: unknown) => setError(caught))
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [api, library.id, holdings]);

  function selectReliable() {
    if (!items) return;
    setSelectedIds(new Set(
      items
        .filter((item) => item.status === "available" && item.proposedConfidence === "medium")
        .map((item) => item.fileId),
    ));
  }

  function toggle(fileId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function apply() {
    if (!api.applyLibraryBatchNaming || !items) return;
    const chosen = items.filter((item) => selectedIds.has(item.fileId));
    if (chosen.length === 0) return;
    if (!window.confirm(t("batchNaming.applyConfirm", { count: chosen.length }))) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await api.applyLibraryBatchNaming(library.id, chosen.map((item) => ({
        fileId: item.fileId,
        metadataVersion: item.metadataVersion,
        sourceVersion: item.sourceVersion,
        canonicalTitle: (titles[item.fileId] ?? item.proposedTitle ?? "").trim(),
        materialType: materials[item.fileId] ?? item.materialType ?? "book",
      })));
      setResults(response.results);
      if (response.results.some((result) => result.status === "applied")) onApplied();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const appliedCount = results?.filter((result) => result.status === "applied").length ?? 0;
  const failedCount = results ? results.length - appliedCount : 0;

  return (
    <dialog
      ref={dialogRef}
      className="batch-naming-modal"
      aria-labelledby="batch-naming-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="batch-naming-heading">
        <h2 id="batch-naming-title">{t("batchNaming.title")}</h2>
        <button className="button button--quiet" type="button" onClick={onClose} aria-label={t("batchNaming.close")}>{t("batchNaming.close")}</button>
      </div>
      {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
      {results !== null && (
        <div className="alert alert--success" role="status">
          {t("batchNaming.resultSummary", { applied: appliedCount, failed: failedCount })}
          <ul className="batch-naming-results">
            {results.map((result) => {
              const item = items?.find((candidate) => candidate.fileId === result.fileId);
              const label = result.status === "applied"
                ? t("batchNaming.resultApplied")
                : result.status === "stale"
                  ? t("batchNaming.resultStale")
                  : result.status === "conflict"
                    ? t("batchNaming.resultConflict")
                    : result.status === "invalid_input"
                      ? t("batchNaming.resultInvalidInput")
                      : t("batchNaming.resultNotFound");
              return <li key={result.fileId} data-status={result.status}>{item?.displayName ?? result.fileId} — {label}</li>;
            })}
          </ul>
        </div>
      )}
      {items === null ? (
        <p className="muted" role="status">{t("batchNaming.loading")}</p>
      ) : items.filter((item) => item.status === "available").length === 0 ? (
        <p className="muted">{t("batchNaming.empty")}</p>
      ) : (
        <div className="batch-naming-list">
          {items.map((item) => (
            <article className="batch-naming-item" key={item.fileId} data-unavailable={item.status === "unavailable" ? "true" : undefined}>
              {item.status === "unavailable" ? (
                <p className="muted">{t("batchNaming.unavailableItem")}</p>
              ) : (
                <>
                  <label className="batch-naming-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.fileId)}
                      disabled={busy}
                      onChange={() => toggle(item.fileId)}
                    />
                    <span className="batch-naming-main">
                      <strong>{item.displayName}</strong>
                      {item.canonicalTitle && <small>{t("batchNaming.currentTitle", { title: item.canonicalTitle })}</small>}
                      {!item.canonicalTitle && item.proposedTitle === null && <small>{t("batchNaming.noProposal")}</small>}
                    </span>
                  </label>
                  <div className="batch-naming-fields">
                    <label>
                      <span className="visually-hidden">{t("batchNaming.proposedTitle")}</span>
                      <input
                        type="text"
                        maxLength={512}
                        value={titles[item.fileId] ?? ""}
                        disabled={busy}
                        onChange={(event) => setTitles((current) => ({ ...current, [item.fileId]: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="visually-hidden">{t("batchNaming.materialType")}</span>
                      <select
                        value={materials[item.fileId] ?? "book"}
                        disabled={busy}
                        onChange={(event) => setMaterials((current) => ({ ...current, [item.fileId]: event.target.value as MaterialType }))}
                      >
                        {MATERIAL_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{materialLabel(t, type.value)}</option>
                        ))}
                      </select>
                    </label>
                    {item.proposedConfidence !== null && (
                      <span className={`batch-naming-confidence is-${item.proposedConfidence}`}>
                        {item.proposedConfidence === "medium" ? t("batchNaming.confidenceMedium") : t("batchNaming.confidenceLow")}
                      </span>
                    )}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      <footer className="batch-naming-actions">
        <button className="button button--quiet" type="button" disabled={busy || !items} onClick={selectReliable}>
          {t("batchNaming.selectReliable")}
        </button>
        <span className="batch-naming-spacer" />
        <button className="button button--quiet" type="button" disabled={busy} onClick={onClose}>{t("batchNaming.cancel")}</button>
        <button className="button button--primary" type="button" disabled={busy || selectedIds.size === 0} onClick={() => void apply()}>
          {busy ? t("batchNaming.applying") : t("batchNaming.apply")}
        </button>
      </footer>
    </dialog>
  );
}
