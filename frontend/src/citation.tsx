import { useEffect, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  CitationLocator,
  CitationLocatorType,
  CitationResult,
  CitationStyleId,
  LibraryHolding,
  LibrarySummary,
} from "./api.ts";
import { useLanguage } from "./i18n-react.tsx";

const STYLES: ReadonlyArray<{ id: CitationStyleId; label: string }> = [
  { id: "chicago-notes-bibliography", label: "Chicago Notes & Bibliography" },
  { id: "lishi-yanjiu", label: "《历史研究》" },
  { id: "wenshizhe", label: "《文史哲》" },
  { id: "gb-t-7714-2025", label: "GB/T 7714—2025" },
];

const LOCATORS: readonly CitationLocatorType[] = [
  "page", "page_range", "volume", "fascicle", "chapter", "juan", "folio",
  "line", "item", "document_number", "archive_call_number", "custom",
];

interface LocatorDraft extends CitationLocator { id: number; }

function useCitationDialog(onClose: () => void, busy: boolean, returnFocus?: HTMLElement | null) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!busyRef.current) closeRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLElement>("select, button, input")?.focus();
    return () => {
      dialog.removeEventListener("cancel", cancel);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      previous?.focus();
    };
  }, [returnFocus]);
  return ref;
}

export async function copyCitationText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy") ?? false;
  textarea.remove();
  if (!copied) throw new Error("clipboard_unavailable");
}

function locatorLabel(type: CitationLocatorType, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(`citation.locator.${type}`);
}

export function CitationDialog({
  api,
  library,
  holding,
  returnFocus,
  onClose,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  holding: LibraryHolding;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [style, setStyle] = useState<CitationStyleId>("lishi-yanjiu");
  const [locators, setLocators] = useState<LocatorDraft[]>([{ id: 1, type: "page", value: "" }]);
  const [result, setResult] = useState<CitationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<"citation" | "fullNote" | "shortNote" | "bibliography" | null>(null);
  const nextId = useRef(2);
  const dialogRef = useCitationDialog(onClose, generating, returnFocus);

  function updateLocator(id: number, update: Partial<LocatorDraft>) {
    setLocators((current) => current.map((locator) => locator.id === id ? { ...locator, ...update } : locator));
    setResult(null);
    setCopied(null);
  }

  function requestLocators(): CitationLocator[] | null {
    const normalized: CitationLocator[] = [];
    for (const locator of locators) {
      const value = locator.value.trim();
      const label = locator.label?.trim();
      if (!value && !label) continue;
      if (!value || (locator.type === "custom" && !label)) return null;
      normalized.push({
        type: locator.type,
        value,
        ...(locator.type === "folio" && locator.side ? { side: locator.side } : {}),
        ...(locator.type === "custom" ? { label: label! } : {}),
      });
    }
    return normalized;
  }

  async function generate() {
    const normalized = requestLocators();
    if (!api.generateLibraryCitation || normalized === null) {
      setError(true);
      return;
    }
    setGenerating(true);
    setError(false);
    setCopied(null);
    try {
      setResult(await api.generateLibraryCitation(library.id, holding.file.id, { style, locators: normalized }));
    } catch {
      setResult(null);
      setError(true);
    } finally {
      setGenerating(false);
    }
  }

  async function copy(kind: "citation" | "fullNote" | "shortNote" | "bibliography", value: string) {
    try {
      await copyCitationText(value);
      setCopied(kind);
      setError(false);
    } catch {
      setCopied(null);
      setError(true);
    }
  }

  const title = holding.catalogueDisplayTitle || holding.canonicalTitle || holding.file.displayName;
  return (
    <dialog ref={dialogRef} className="citation-modal" aria-labelledby="citation-dialog-title">
      <header>
        <div><span className="citation-eyebrow">{t("citation.action")}</span><h2 id="citation-dialog-title">{title}</h2></div>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={generating} aria-label={t("citation.closeAria")}>{t("preview.close")}</button>
      </header>
      <div className="citation-body">
        {error && <div className="alert alert--error" role="alert">{t("citation.error")}</div>}
        <label className="citation-style-field">{t("citation.style")}
          <select value={style} onChange={(event) => { setStyle(event.target.value as CitationStyleId); setResult(null); setCopied(null); }}>
            {STYLES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <fieldset className="citation-locators">
          <legend>{t("citation.locators")}</legend>
          {locators.map((locator) => (
            <div className="citation-locator-row" key={locator.id}>
              <select aria-label={t("citation.locatorType")} value={locator.type} onChange={(event) => {
                const type = event.target.value as CitationLocatorType;
                setLocators((current) => current.map((item) => {
                  if (item.id !== locator.id) return item;
                  const { side: _side, label: _label, ...base } = item;
                  return { ...base, type };
                }));
                setResult(null);
                setCopied(null);
              }}>
                {LOCATORS.map((type) => <option key={type} value={type}>{locatorLabel(type, t)}</option>)}
              </select>
              {locator.type === "custom" && <input aria-label={t("citation.customLabel")} placeholder={t("citation.customLabel")} maxLength={32} value={locator.label ?? ""} onChange={(event) => updateLocator(locator.id, { label: event.target.value })} />}
              <input aria-label={t("citation.locatorValue")} placeholder={t("citation.locatorValue")} maxLength={128} value={locator.value} onChange={(event) => updateLocator(locator.id, { value: event.target.value })} />
              {locator.type === "folio" && <select aria-label={t("citation.folioSide")} value={locator.side ?? ""} onChange={(event) => {
                const side = event.target.value;
                if (side) updateLocator(locator.id, { side: side as "recto" | "verso" });
                else setLocators((current) => current.map((item) => {
                  if (item.id !== locator.id) return item;
                  const { side: _side, ...base } = item;
                  return base;
                }));
                setResult(null);
              }}>
                <option value="">{t("citation.folioUnspecified")}</option><option value="recto">{t("citation.recto")}</option><option value="verso">{t("citation.verso")}</option>
              </select>}
              <button className="button button--small button--quiet" type="button" aria-label={t("citation.removeLocator")} onClick={() => { setLocators((current) => current.filter((item) => item.id !== locator.id)); setResult(null); }}>{t("alert.dismiss")}</button>
            </div>
          ))}
          {locators.length < 12 && <button className="button button--small" type="button" onClick={() => setLocators((current) => [...current, { id: nextId.current++, type: "page", value: "" }])}>{t("citation.addLocator")}</button>}
        </fieldset>
        <button className="button button--primary citation-generate" type="button" disabled={generating} onClick={() => void generate()}>{generating ? t("citation.generating") : t("citation.generate")}</button>
        {result && <div className="citation-results" aria-live="polite">
          {result.completeness === "partial" && <p className="citation-partial">{t("citation.partial")}</p>}
          <CitationOutput label={result.outputs.fullNote ? t("citation.fullNote") : t("citation.citation")} kind={result.outputs.fullNote ? "fullNote" : "citation"} value={result.outputs.fullNote ?? result.outputs.citation} copied={copied} onCopy={copy} />
          {result.outputs.shortNote && <CitationOutput label={t("citation.shortNote")} kind="shortNote" value={result.outputs.shortNote} copied={copied} onCopy={copy} />}
          <CitationOutput label={t("citation.bibliography")} kind="bibliography" value={result.outputs.bibliography} copied={copied} onCopy={copy} />
          <details className="citation-provenance"><summary>{t("citation.provenance")}</summary><p>{result.style.label} · {result.style.revision} · {result.style.processor} {result.style.processorVersion}</p><code>{result.style.sha256}</code></details>
        </div>}
      </div>
    </dialog>
  );
}

function CitationOutput({
  label,
  kind,
  value,
  copied,
  onCopy,
}: {
  label: string;
  kind: "citation" | "fullNote" | "shortNote" | "bibliography";
  value: string;
  copied: "citation" | "fullNote" | "shortNote" | "bibliography" | null;
  onCopy: (kind: "citation" | "fullNote" | "shortNote" | "bibliography", value: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  return <section className="citation-output"><header><h3>{label}</h3><button className="button button--small button--quiet" type="button" onClick={() => void onCopy(kind, value)}>{copied === kind ? t("citation.copied") : t("citation.copy")}</button></header><p>{value}</p></section>;
}
