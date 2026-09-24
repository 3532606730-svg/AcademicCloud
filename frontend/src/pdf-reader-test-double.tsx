import { useEffect, useRef, useState } from "react";
import type { PdfReaderProps } from "./pdf-reader.tsx";
/** Controlled rendering boundary: integration tests exercise parent source/page state without canvas/network. */
export const pdfReaderControl = { autoRender: true, mounts: 0 };
export function MockPdfReader(props: PdfReaderProps) {
  const latest = useRef(props); latest.current = props;
  const [draft, setDraft] = useState(String(props.page));
  useEffect(() => { pdfReaderControl.mounts++; latest.current.onDocumentLoaded?.(16); return () => latest.current.onPageUnavailable?.(); }, []);
  useEffect(() => { setDraft(String(props.page)); latest.current.onPageUnavailable?.(); if (pdfReaderControl.autoRender) latest.current.onPageRendered?.(props.page); }, [props.page, props.url]);
  return <section title={"Preview of " + props.title} data-testid="pdf-reader" data-source={props.url} data-page={props.page} aria-label="PDF document">
    <span title={"Source: " + props.title} data-source={props.url} data-page={props.page} />
    <form onSubmit={(event) => { event.preventDefault(); props.onPageChange(Number(draft)); }}>
      <button type="button" aria-label="Previous page" disabled={props.page <= 1 || props.navigationPending} onClick={() => props.onPageChange(props.page - 1)}>Previous</button>
      <label>PDF page<input type="number" aria-label="PDF page" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
      <button type="submit">Go</button>
      <button type="button" aria-label="Next page" disabled={props.page >= 16 || props.navigationPending} onClick={() => props.onPageChange(props.page + 1)}>Next</button>
    </form>
    <button type="button" onClick={() => props.onPageRendered?.(props.page)}>Finish rendering test page</button>
  </section>;
}
