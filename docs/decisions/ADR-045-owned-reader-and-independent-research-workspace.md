# ADR-045 — Owned PDF reader and independent private Research workspace

Status: accepted by Owner direction, 2026-09-24; owned reader deployed September25. Local-file and usability continuation deployed as 57b8723934446706440f7625fd02cd2262b4d712.

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

### September25 local original and interaction continuation

Owner explicitly requests reading downloaded originals in Research, immediate highlight feedback, left/right keyboard navigation, edge-wheel page turns and removal of the footer license link. The license/notice assets remain distributed unchanged.

Research may read one explicitly selected local PDF through PDF.js range transport after current server authorization and size/MD5 equality with the authorized source generation. It never discovers Downloads automatically, trusts a filename, copies bytes to Core, or imports a new resource. Account/resource/source-scoped read-only handles may be remembered in the existing IndexedDB store when the browser permits; each reopen rechecks authorization, permission and bytes. Unsupported/revoked/moved/changed files require selection; online reading remains available. Switching online changes only the session reading preference and retains the stable local association, including after online renaming. The selected folder is the destination for new downloads; changing it does not move an already associated original. Private sidecars retain existing source/account checks. This is local byte transport, not offline authentication, offline note synchronization, or a native filesystem client. No migration, service, cost or Compute change. Removing the feature leaves only optional browser handles and does not change original files or authored overlays.

Pending highlight rectangles render immediately with an explicit saving state; rejection removes only that pending overlay and retains a same-page retry draft. Initial/paged reads merge completed local writes. Page turns retain one active canvas and suppress same-gesture wheel inertia; editable fields/selected text keep their keyboard semantics.

The Owner refined the local-directory direction: Library and Research must share one physical PDF, with research membership represented only in private product state. One explicitly selected local folder receives streamed, checksum-verified downloads; both download entry points use the same account/source handle. A repeated download first reuses matching local bytes. Adding/removing research membership never copies, moves or deletes disk files. The abandoned two-subfolder proposal is not implemented. Filename/source suffixes prevent title collisions; changed existing bytes are preserved under their existing name. Directory write permission is requested only through the user's folder picker; unsupported browsers retain ordinary downloads plus explicit single-file selection. No automatic scan of Downloads, background filesystem service or disk deletion.

Reviewed 2026-09-24: Zotero official PDF Reader and Note Editor (`https://www.zotero.org/support/pdf_reader`) provides separate annotation/note workflows and source/page links. Mozilla PDF.js FAQ (`https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions`) documents CORS and HTTP Range loading; official Getting Started (`https://mozilla.github.io/pdf.js/getting_started/`) documents separate worker/display layers. We reuse PDF.js under its bundled license and implement the AcademicCloud UI, not copy Zotero code.

Acceptance is changed-path tests plus synthetic desktop/mobile browser QA and normal signed-in production paths. Historical1124 tests need not repeat. Production identity, migrations/rollback and author/private-source safety remain real release gates.

### September25 usability repair

Owner requests repairing the observed UX issues before deployment: renew authorized range URLs without destroying a same-source PDF document; distinguish reading-position conflicts from authored-note conflicts, preserving concurrent updates; allow focused reading with collapsed navigation/notes; restore the last authorized active document on returning to Research; clarify AI extraction versus canonical adoption without changing authority; compact Library notices, announcements and catalogue spacing. No schema, Compute, provider or resident service change. Verification remains affected-path tests and one actual browser smoke, not a full historical suite.
