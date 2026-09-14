import { useEffect, useState } from "react";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";
import { useHistoryDialog } from "./view-context.ts";
import { useModalDialog } from "./use-modal-dialog.ts";

export interface PreviewDocument {
  requestId: number;
  file: { displayName: string; mediaType: string };
  url: string | null;
  error: unknown;
  returnFocus: HTMLElement | null;
  retry: () => void;
}

export function PreviewDialog({ preview, covered = false, onClose, onDownload, onDetails, onCitation }: {
  preview: PreviewDocument;
  covered?: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDetails?: ((trigger: HTMLElement) => void) | undefined;
  onCitation?: ((trigger: HTMLElement) => void) | undefined;
}) {
  const { t, language } = useLanguage();
  const close = useHistoryDialog(onClose);
  const dialogRef = useModalDialog(close, covered, preview.returnFocus);
  const [loaded, setLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setImageFailed(false);
  }, [preview.requestId, preview.url]);
  const failure = preview.error
    ? describeError(preview.error, language)
    : imageFailed ? t("preview.imageFailed") : null;

  return (
    <dialog ref={dialogRef} className="preview-modal" aria-labelledby="preview-title"
      data-covered={covered || undefined} aria-hidden={covered || undefined} inert={covered}>
      <header>
        <div className="preview-heading">
          <span className="preview-eyebrow">{t("preview.reading")}</span>
          <h2 id="preview-title">{preview.file.displayName}</h2>
        </div>
        <button className="button button--quiet preview-close-button" type="button"
          onClick={close} aria-label={t("preview.closeAria")}>{t("preview.close")}</button>
      </header>
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
              <iframe src={preview.url} onLoad={() => setLoaded(true)}
                title={t("preview.frameTitle", { name: preview.file.displayName })} referrerPolicy="no-referrer" />
            ))}
          </>
        )}
      </div>
      <footer>
        <div className="preview-document-actions">
          {onDetails && <button className="button button--quiet" type="button"
            onClick={(event) => onDetails(event.currentTarget)}>{t("preview.details")}</button>}
          {onCitation && <button className="button button--quiet" type="button"
            onClick={(event) => onCitation(event.currentTarget)}>{t("preview.citation")}</button>}
        </div>
        <div className="preview-file-actions">
          {preview.url
            ? <a className="button preview-open-button" href={preview.url} target="_blank" rel="noreferrer">{t("preview.open")}</a>
            : <button className="button preview-open-button" type="button" disabled>{t("preview.open")}</button>}
          <button className="button preview-download-button" type="button" onClick={onDownload}>{t("menu.download")}</button>
        </div>
      </footer>
    </dialog>
  );
}
