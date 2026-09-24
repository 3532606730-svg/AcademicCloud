# ADR-045 — Owned PDF reader and independent private Research workspace

Status: accepted by Owner direction, 2026-09-24; implementation in progress, not yet deployed.

## Decision

AcademicCloud owns its PDF reader interface using exact-pinned, Apache-2.0 PDF.js. A top-level Library / My Research switch selects independent application workspaces. Each workspace's left rail contains contextual functions, not duplicate top-level switching. Research has closeable document tabs, recent reading, collections, private notes and highlights. Only the active document renders; inactive tabs retain bounded IDs/position, not workers/canvases. Library state survives a workspace switch. Unsaved authored drafts prevent navigation until saved or explicitly discarded.

The Library and Research reference the same stable resource and immutable source generation. Joining Research never copies source bytes. Physical page navigation, successful page rendering, progress, highlights and new note attachment share one controlled page. A saved note remains attached to its original source/page; later source replacement never migrates it implicitly.

Progress and highlight sidecars are per-account server-authorized state, with revision checks and source validation. Owner has no implicit access to member research. Migration039 is additive; the previous runtime must be qualified against complete history039 before being accepted for rollback. Rollback retains new sidecar tables and authored data; no downmigration.

## Reader scope

- Preview footer: idempotent “放入我的研究”.
- PDF navigation, real page count, zoom/fit, rotation, selectable native text, copy, bounded on-demand document-text search and UTF-8 text export.
- Personal text highlights with unrotated normalized page rectangles, highlight visibility/list/removal, page notes, save feedback, note font sizing and private research export.
- Independent `/research`, document tabs with close controls, recent documents with positions, personal resources/collections and Library switching.
- OCR remains disabled behind the existing reader-ocr interface. No fabricated recognized text/accuracy, scan transcription, background corpus extraction, index, embeddings or RAG.

## Performance and delivery

Browser renders PDF and requests source bytes directly from the authorized storage adapter; Core serves authentication, metadata and private sidecars. No Core PDF proxy, resident renderer or paid infrastructure. Native PDF.js resource files/worker are content-addressed with license notices; publication preserves old assets. Bounded canvas, canceled stale renders, debounced progress, one active viewer, independent reader loading and no reader reload on note save limit cost. Cross-origin GET/Range and exact CSP origins must pass before deployment; application credentials must not be broadened to obtain bucket administration.

## References and verification

Reviewed 2026-09-24: Zotero official PDF Reader and Note Editor (`https://www.zotero.org/support/pdf_reader`) provides separate annotation/note workflows and source/page links. Mozilla PDF.js FAQ (`https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions`) documents CORS and HTTP Range loading; official Getting Started (`https://mozilla.github.io/pdf.js/getting_started/`) documents separate worker/display layers. We reuse PDF.js under its bundled license and implement the AcademicCloud UI, not copy Zotero code.

Acceptance is changed-path tests plus synthetic desktop/mobile browser QA and normal signed-in production paths. Historical1124 tests need not repeat. Production identity, migrations/rollback and author/private-source safety remain real release gates.
