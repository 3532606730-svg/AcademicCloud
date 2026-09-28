import { useEffect, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  LibraryHolding,
  LibrarySummary,
  MetadataRecoveryItem,
  MetadataRecoveryResult,
} from "./api.ts";
import { useLanguage } from "./i18n-react.tsx";
import { libraryHoldingDisplayTitle } from "./library-display-title.ts";
import { useModalDialog } from "./use-modal-dialog.ts";

function canRecover(item: MetadataRecoveryItem): boolean {
  return item.status === "missing" || item.status === "retryable";
}

/** Explicit, bounded recovery of selected holdings through the durable queue. */
export function MetadataRecoveryDialog({
  api,
  library,
  holdings,
  returnFocus,
  onClose,
  onSettled,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  holdings: LibraryHolding[];
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onSettled: (results: MetadataRecoveryResult[] | null) => void;
}) {
  const { language, t } = useLanguage();
  // Parent refreshes must not replace the user's reviewed selection/snapshot.
  const [selection] = useState(() => ({ library, holdings: [...holdings] }));
  const [items, setItems] = useState<MetadataRecoveryItem[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<MetadataRecoveryResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [revision, setRevision] = useState(0);
  const submittedRef = useRef(false);
  const closedRef = useRef(false);
  const ids = selection.holdings.map((holding) => holding.file.id);
  const validSelection = selection.library.role === "manager" && ids.length > 0 && ids.length <= 100
    && new Set(ids).size === ids.length;
  const dialogRef = useModalDialog(() => { closedRef.current = true; onClose(); }, false, returnFocus);

  useEffect(() => {
    closedRef.current = false;
    return () => { closedRef.current = true; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setReadFailed(false);
    setItems(null);
    setSelectedIds(new Set());
    if (!validSelection || !api.getLibraryMetadataRecovery) {
      setLoading(false);
      setReadFailed(true);
      return () => controller.abort();
    }
    const requestedIds = selection.holdings.map((holding) => holding.file.id);
    void api.getLibraryMetadataRecovery(selection.library.id, requestedIds, controller.signal).then((snapshot) => {
      if (controller.signal.aborted || closedRef.current) return;
      const byId = new Map(snapshot.map((item) => [item.fileId, item]));
      // Never submit a partial or mismatched authorization/snapshot response.
      if (snapshot.length !== requestedIds.length || byId.size !== requestedIds.length
        || requestedIds.some((id) => !byId.has(id))) {
        setReadFailed(true);
        return;
      }
      const ordered = requestedIds.map((id) => byId.get(id)!);
      setItems(ordered);
      if (!submittedRef.current) setSelectedIds(new Set(ordered.filter(canRecover).map((item) => item.fileId)));
    }, () => {
      if (!controller.signal.aborted && !closedRef.current) setReadFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted && !closedRef.current) setLoading(false);
    });
    return () => controller.abort();
  }, [api, revision, selection, validSelection]);

  const chosen = items?.filter((item) => canRecover(item) && selectedIds.has(item.fileId)) ?? [];
  const resultsById = new Map(results?.map((result) => [result.fileId, result]) ?? []);
  const itemsById = new Map(items?.map((item) => [item.fileId, item]) ?? []);

  function close() {
    closedRef.current = true;
    onClose();
  }

  async function submit() {
    if (submittedRef.current || loading || !validSelection || chosen.length === 0 || !api.recoverLibraryMetadata) return;
    // Synchronous guard also blocks a second activation before React rerenders.
    submittedRef.current = true;
    setSubmitted(true);
    setSubmitting(true);
    const request = chosen.map((item) => ({
      fileId: item.fileId,
      sourceVersion: item.sourceVersion,
      expectedJobId: item.job?.id ?? null,
      expectedAttempts: item.job?.attempts ?? null,
    }));
    let response: MetadataRecoveryResult[] | null = null;
    try {
      response = await api.recoverLibraryMetadata(selection.library.id, request);
      if (!closedRef.current) setResults(response);
    } catch {
      // A lost response is not proof that queue insertion failed. This dialog
      // allows only status reads from now on; it never repeats the mutation.
      if (!closedRef.current) setSubmissionUnknown(true);
    } finally {
      if (!closedRef.current) setSubmitting(false);
      // Even a closed dialog must reconcile jobs accepted by the server.
      onSettled(response);
    }
  }

  function statusText(item: MetadataRecoveryItem | MetadataRecoveryResult): string {
    if (item.status === "active") {
      return t(item.job?.state === "running" ? "metadataRecovery.running" : "metadataRecovery.active");
    }
    return t(`metadataRecovery.${item.status}`);
  }

  return <dialog ref={dialogRef} className="batch-naming-modal metadata-recovery-modal" aria-labelledby="metadata-recovery-title">
    <div className="batch-naming-heading">
      <h2 id="metadata-recovery-title">{t("metadataRecovery.title")}</h2>
      <button className="button button--quiet" type="button" onClick={close}>{t("preview.close")}</button>
    </div>
    <p>{t("metadataRecovery.intro")}</p>
    <p className="muted">{t("metadataRecovery.persistent")}</p>
    {loading && <p role="status">{t("metadataRecovery.loading")}</p>}
    {readFailed && <p className="alert alert--error" role="alert">{t("metadataRecovery.readFailed")}</p>}
    {submissionUnknown && <p className="alert alert--error" role="alert">{t("metadataRecovery.submissionUnknown")}</p>}
    {results !== null && <p role="status">{t("metadataRecovery.resultSummary", {
      queued: results.filter((item) => item.status === "queued" || item.status === "retried").length,
      unchanged: results.filter((item) => item.status !== "queued" && item.status !== "retried").length,
    })}</p>}
    <ul className="metadata-recovery-list">
      {selection.holdings.map((holding) => {
        const item = itemsById.get(holding.file.id);
        const result = resultsById.get(holding.file.id);
        const title = libraryHoldingDisplayTitle(holding, language);
        return <li className="batch-naming-item" key={holding.file.id}>
          <label className="batch-naming-select">
            <input type="checkbox" aria-label={t("bulk.selectAria", { name: title })}
              checked={selectedIds.has(holding.file.id)}
              disabled={submitted || loading || !item || !canRecover(item)}
              onChange={() => setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(holding.file.id)) next.delete(holding.file.id);
                else next.add(holding.file.id);
                return next;
              })} />
            <span className="batch-naming-main"><strong>{title}</strong>
              {result ? <span>{statusText(result)}</span> : item && <span>{statusText(item)}</span>}
            </span>
          </label>
        </li>;
      })}
    </ul>
    {!loading && items !== null && !submitted && chosen.length === 0 && <p>{t("metadataRecovery.noEligible")}</p>}
    <div className="batch-naming-actions">
      {results === null && !submitting && <button className="button button--quiet" type="button"
        disabled={loading || !validSelection} onClick={() => setRevision((value) => value + 1)}>{t("metadataRecovery.refresh")}</button>}
      {!submitted && <button className="button" type="button" disabled={loading || readFailed || chosen.length === 0 || !api.recoverLibraryMetadata}
        onClick={() => void submit()}>{t("metadataRecovery.submit", { count: chosen.length })}</button>}
      {submitting && <span role="status">{t("metadataRecovery.submitting")}</span>}
    </div>
  </dialog>;
}
