import { useEffect, useRef, useState } from "react";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";
import { useHistoryDialog } from "./view-context.ts";
import { useModalDialog } from "./use-modal-dialog.ts";
import { CloseIcon, DownloadIcon, FileIcon, QuoteIcon, TextIcon } from "./icons.tsx";
import { PdfReader } from "./pdf-reader.tsx";

export interface PreviewDocument {
  requestId: number;
  file: { displayName: string; mediaType: string; sizeBytes?: number };
  url: string | null;
  error: unknown;
  returnFocus: HTMLElement | null;
  retry: () => void;
  expiresAt?: string;
  renew?: () => Promise<{ url: string; expiresAt?: string }>;
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

export function PreviewDialog({ preview, covered = false, onClose, onDownload, onDetails, onCitation, onResearch, onAddToResearch }: {
  preview: PreviewDocument;
  covered?: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDetails?: ((trigger: HTMLElement) => void) | undefined;
  onCitation?: ((trigger: HTMLElement) => void) | undefined;
  onResearch?: ((trigger: HTMLElement, physicalPage?: number) => void) | undefined;
  onAddToResearch?: ((trigger: HTMLElement) => Promise<void>) | undefined;
}) {
  const { t, language } = useLanguage();
  const close = useHistoryDialog(onClose);
  const dialogRef = useModalDialog(close, covered, preview.returnFocus);
  const [loaded, setLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [readerUrl, setReaderUrl] = useState(preview.url);
  const [selectedPage, setSelectedPage] = useState(() => pdfPageFromUrl(preview.url));
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState(preview.expiresAt);
  const [navigationPending, setNavigationPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [readerError, setReaderError] = useState<unknown>(null);
  const request = useRef(0);
  const isPdf = preview.file.mediaType === "application/pdf";
  useEffect(() => {
    setLoaded(false);
    setImageFailed(false);
    setReaderUrl(preview.url);
    const page = pdfPageFromUrl(preview.url);
    setSelectedPage(page);
    setRenderedPage(null);
    setExpiresAt(preview.expiresAt);
    setActionError(null); setReaderError(null); setNavigationPending(false);
    request.current++;
    return () => { request.current++; };
  }, [preview.requestId, preview.url]);
  const goToPage = async (page: number, forceRenew = false) => {
    if (!preview.url || !Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return;
    const current = ++request.current;
    setReaderError(null); setNavigationPending(true); setRenderedPage(null);
    try {
      if (forceRenew || (expiresAt && Date.parse(expiresAt) - 10_000 <= Date.now())) {
        if (!preview.renew) { preview.retry(); return; }
        const fresh = await preview.renew();
        if (request.current !== current) return;
        setReaderUrl(fresh.url); setExpiresAt(fresh.expiresAt);
      }
      if (request.current === current) { setSelectedPage(page); setLoaded(false); }
    } catch (error) {
      if (request.current === current) { setReaderError(error); setReaderUrl(null); }
    } finally {
      if (request.current === current) setNavigationPending(false);
    }
  };
  const failure = preview.error || readerError
    ? describeError(preview.error || readerError, language)
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
      <div className="preview-content" aria-busy={!loaded && !failure}>
        {failure ? (
          <div className="preview-error" role="alert">
            <p>{failure}</p>
            <button className="button" type="button" onClick={() => readerError ? void goToPage(selectedPage, true) : preview.retry()}>{t("preview.retry")}</button>
          </div>
        ) : (
          <>
            {!loaded && !(isPdf && readerUrl) && <p className={preview.url ? "preview-loading" : "preview-opening"} role="status">
              <span className="preview-progress" aria-hidden="true" />
              {t("preview.loading")}
            </p>}
            {isPdf && readerUrl ? <PdfReader url={readerUrl.split("#")[0]!} title={preview.file.displayName} page={selectedPage}
              remoteSource={preview.file.sizeBytes ? { size: preview.file.sizeBytes, getUrl: async () => readerUrl.split("#")[0]! } : undefined}
              onPageChange={(page) => void goToPage(page)} onPageRendered={(page) => { setRenderedPage(page); setLoaded(true); }}
              onPageUnavailable={() => setRenderedPage(null)} onRetry={() => void goToPage(selectedPage, true)} navigationPending={navigationPending} /> : !isPdf && preview.url && (preview.file.mediaType.startsWith("image/") ? (
              <img src={preview.url} onLoad={() => setLoaded(true)} onError={() => setImageFailed(true)}
                alt={t("preview.imageAlt", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
            ) : (
              <iframe src={readerUrl ?? preview.url} onLoad={() => setLoaded(true)}
                title={t("preview.frameTitle", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
            ))}
          </>
        )}
      </div>
      {!!actionError && <p className="preview-action-error" role="alert">{describeError(actionError, language)}</p>}
      <footer>
        <div className="preview-document-actions">
          {onDetails && <button className="button button--quiet" type="button"
            onClick={(event) => onDetails(event.currentTarget)}><FileIcon size={17} />{t("preview.details")}</button>}
          {onCitation && <button className="button button--quiet" type="button"
            onClick={(event) => onCitation(event.currentTarget)}><QuoteIcon size={17} />{t("preview.citation")}</button>}
          {onResearch && <button className="button button--quiet" type="button" disabled={isPdf && renderedPage !== selectedPage}
            onClick={(event) => onResearch(event.currentTarget, isPdf ? renderedPage! : undefined)}><TextIcon size={17} />{t("workspace.notes")}</button>}
          {onAddToResearch && <button className="button button--primary" type="button" disabled={actionPending} onClick={(event) => {
            const trigger = event.currentTarget; setActionPending(true); setActionError(null);
            void onAddToResearch(trigger).catch(setActionError).finally(() => setActionPending(false));
          }}>{actionPending ? (language === "zh-CN" ? "正在加入…" : "Adding…") : t("workspace.add")}</button>}
        </div>
        <div className="preview-file-actions">
          {preview.url
            ? <a className="button preview-open-button" href={isPdf ? `${(readerUrl ?? preview.url).split("#")[0]}#page=${selectedPage}` : preview.url} target="_blank" rel="noreferrer">{t("preview.open")}</a>
            : <button className="button preview-open-button" type="button" disabled>{t("preview.open")}</button>}
          <button className="button button--primary preview-download-button" type="button" onClick={onDownload}><DownloadIcon size={17} />{t("menu.download")}</button>
        </div>
      </footer>
    </dialog>
  );
}
