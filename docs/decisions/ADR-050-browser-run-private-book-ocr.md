# ADR-050 — Browser-run private book OCR

Date: 2026-10-06. Status: Accepted for implementation by the Owner's explicit request to add whole-book OCR. Production remains the exact ADR-049/copy release until this candidate passes qualification.

## Decision and scope

Extend the existing paired-device OCR path to an explicitly started, sequential book run. The signed-in account uses its own online local device; there is no Owner-engine borrowing, cloud fallback, paid activation or corpus-wide dispatch. Core remains the authorization/control plane and the browser renders one bounded PNG at a time from the open PDF. Native models, leases, transport limits and the one-active-request-per-account rule remain unchanged. No new database migration, background worker or persistent page images are introduced.

This is a browser-run workflow with durable successful-page checkpoints. It is not an unattended background batch queue: leaving the Reader or hiding the page pauses processing. Reopening the same immutable source loads saved page summaries and explicit resume processes missing pages. Core/browser restart may lose an in-flight request; uncertain failures stop, refresh saved progress and require manual resume. Existing short-lived request idempotency is not durable batch idempotency. Concurrent requests still fail closed.

The first release supports PDF books up to 500 physical pages and retains the existing 500-result total quota per account, including all books and repeated recognitions. Preflight compares missing pages with remaining slots; insufficient capacity starts no new recognition. No silent eviction, overwrite or quota expansion is permitted. Each submitted page still receives server account/resource/source/device checks. Source replacement, account disable, device revocation or loss of access stops processing and prevents reading derived results.

## Progress and scholarly results

The private, source-authorized book-progress endpoint returns the latest successful saved result per physical page, selected by machine creation time and ID, not correction time. It includes result ID, rotation, machine status, truncation, correction presence and creation time, quota usage and this source's active request. An account-busy flag allows reconciliation without exposing another source's job. No page text is returned in progress. Browser pageCount defines the requested range, not a server certification of PDF provenance or book completeness.

Saved results are checkpoints even when they need review. Processed-page count is separate from low-confidence, unsupported-script and truncated-page issues; no-text pages are explicitly labeled. Resume never silently retries those pages or overwrites manual corrections. Existing current-page history and correction CAS remain the review path. All results retain `client_rendered_unverified`: image transport equality is not proof that the browser submitted the asserted PDF page.

Private TXT and JSONL exports are streamed through the authenticated server with per-page/source identifiers, outcome and missing-page markers. JSONL retains raw machine text, corrected text, revision, engine/frame provenance and geometry. TXT uses the saved correction when present and labels machine versus corrected text. Authorization/source checks continue during export. No OCR result becomes shared text, canonical bibliography, a note or a verified quotation automatically.

## Superseded boundary and verification

This narrow Owner-authorized whole-book path supersedes earlier current-continuation prohibitions on whole-book OCR in ADR-048/049 and recovery documents. Their pairing, privacy, authority, native coordination and historical acceptance remain valid. Full-text indexing/search, embeddings/RAG, automatic whole-Library execution, online account activation and new retention/deletion policies remain separate work.

Verify cross-account non-disclosure including Owner, source/access changes, quota and range limits, latest-page selection, active-request reconciliation, manual resume after uncertainty, visibility/unmount/source cancellation, bounded frame lifecycle, quality flags and source-framed exports. Qualify exact Core/frontend with unchanged schema40/native662, then test a normal signed-in Owner book run on an authorized real source. Report actual processed and flagged pages and elapsed time; sample CER must not be presented as whole-book accuracy. Deployment uses the existing coordinated operator and the Owner's direct-deploy/no-new-backup instruction. Rollback selects the previous Core/frontend and preserves all appended private results; there is no downmigration or destructive cleanup.
