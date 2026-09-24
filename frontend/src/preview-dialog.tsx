import { useEffect, useState, type FormEvent } from "react";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";
import { useHistoryDialog } from "./view-context.ts";
import { useModalDialog } from "./use-modal-dialog.ts";
import { CloseIcon, DownloadIcon, FileIcon, QuoteIcon, TextIcon } from "./icons.tsx";

export interface PreviewDocument {
  requestId: number;
  file: { displayName: string; mediaType: string };
  url: string | null;
  error: unknown;
  returnFocus: HTMLElement | null;
  retry: () => void;
}

function pdfPageFromUrl(url: string | null): number {
  if (!url) return 1;
  try {
    const page = Number(new URLSearchParams(new URL(url, window.location.href).hash.slice(1)).get("page"));
    return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
  } catch {
    return 1;
  }
}

export function PreviewDialog({ preview, covered = false, onClose, onDownload, onDetails, onCitation, onResearch }: {
  preview: PreviewDocument;
  covered?: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDetails?: ((trigger: HTMLElement) => void) | undefined;
  onCitation?: ((trigger: HTMLElement) => void) | undefined;
  onResearch?: ((trigger: HTMLElement, physicalPage?: number) => void) | undefined;
}) {
  const { t, language } = useLanguage();
  const close = useHistoryDialog(onClose);
  const dialogRef = useModalDialog(close, covered, preview.returnFocus);
  const [loaded, setLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [readerUrl, setReaderUrl] = useState(preview.url);
  const [selectedPage, setSelectedPage] = useState(() => pdfPageFromUrl(preview.url));
  const [pageDraft, setPageDraft] = useState(() => String(pdfPageFromUrl(preview.url)));
  const isPdf = preview.file.mediaType === "application/pdf";
  useEffect(() => {
    setLoaded(false);
    setImageFailed(false);
    setReaderUrl(preview.url);
    const page = pdfPageFromUrl(preview.url);
    setSelectedPage(page);
    setPageDraft(String(page));
  }, [preview.requestId, preview.url]);
  const goToPage = (page: number) => {
    if (!preview.url || !Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return;
    const url = new URL(readerUrl ?? preview.url, window.location.href);
    const params = new URLSearchParams(url.hash.slice(1));
    params.set("page", String(page));
    url.hash = params.toString();
    setSelectedPage(page);
    setPageDraft(String(page));
    setLoaded(false);
    setReaderUrl(url.toString());
  };
  const submitPage = (event: FormEvent) => {
    event.preventDefault();
    goToPage(Number(pageDraft));
  };
  const failure = preview.error
    ? describeError(preview.error, language)
    : imageFailed ? t("preview.imageFailed") : null;

  return (
    <dialog ref={dialogRef} className={isPdf ? "preview-modal preview-modal--pdf" : "preview-modal"} aria-labelledby="preview-title"
      data-covered={covered || undefined} aria-hidden={covered || undefined} inert={covered}>
      <header>
        <div className="preview-heading">
          <span className="preview-eyebrow">{t("preview.reading")}</span>
          <h2 id="preview-title">{preview.file.displayName}</h2>
        </div>
        <button className="button button--quiet preview-close-button" type="button"
          onClick={close} aria-label={t("preview.closeAria")}><CloseIcon size={19} /></button>
      </header>
      {isPdf && <form className="preview-page-controls" onSubmit={submitPage} aria-label={t("preview.pageNavigation") }>
        <button className="button button--quiet button--small" type="button" disabled={!preview.url || selectedPage <= 1}
          onClick={() => goToPage(selectedPage - 1)}>{t("preview.previousPage")}</button>
        <label>{t("preview.pdfPage")}<input type="number" min={1} max={1_000_000} step={1} required disabled={!preview.url}
          value={pageDraft} onChange={(event) => setPageDraft(event.target.value)} /></label>
        <button className="button button--quiet button--small" type="button" disabled={!preview.url || selectedPage >= 1_000_000}
          onClick={() => goToPage(selectedPage + 1)}>{t("preview.nextPage")}</button>
        <button className="button button--small" type="submit" disabled={!preview.url || Number(pageDraft) === selectedPage}>{t("preview.jumpPage")}</button>
      </form>}
      <div className="preview-content" aria-busy={!loaded && !failure}>
        {failure ? (
          <div className="preview-error" role="alert">
            <p>{failure}</p>
            <button className="button" type="button" onClick={preview.retry}>{t("preview.retry")}</button>
          </div>
        ) : (
          <>
            {!loaded && <p className={preview.url ? "preview-loading" : "preview-opening"} role="status">
              <span className="preview-progress" aria-hidden="true" />
              {t("preview.loading")}
            </p>}
            {preview.url && (preview.file.mediaType.startsWith("image/") ? (
              <img src={preview.url} onLoad={() => setLoaded(true)} onError={() => setImageFailed(true)}
                alt={t("preview.imageAlt", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
            ) : (
              <iframe src={readerUrl ?? preview.url} onLoad={() => setLoaded(true)}
                title={t("preview.frameTitle", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
            ))}
          </>
        )}
      </div>
      <footer>
        <div className="preview-document-actions">
          {onDetails && <button className="button button--quiet" type="button"
            onClick={(event) => onDetails(event.currentTarget)}><FileIcon size={17} />{t("preview.details")}</button>}
          {onCitation && <button className="button button--quiet" type="button"
            onClick={(event) => onCitation(event.currentTarget)}><QuoteIcon size={17} />{t("preview.citation")}</button>}
          {onResearch && <button className="button button--quiet" type="button"
            onClick={(event) => onResearch(event.currentTarget, isPdf ? selectedPage : undefined)}><TextIcon size={17} />{t("workspace.notes")}</button>}
        </div>
        <div className="preview-file-actions">
          {preview.url
            ? <a className="button preview-open-button" href={readerUrl ?? preview.url} target="_blank" rel="noreferrer">{t("preview.open")}</a>
            : <button className="button preview-open-button" type="button" disabled>{t("preview.open")}</button>}
          <button className="button button--primary preview-download-button" type="button" onClick={onDownload}><DownloadIcon size={17} />{t("menu.download")}</button>
        </div>
      </footer>
    </dialog>
  );
}
