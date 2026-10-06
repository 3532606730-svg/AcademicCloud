# ADR-051 — Device-owned private book jobs and bounded warm OCR

Date: 2026-10-06. Status: Accepted for private background/performance implementation by the Owner's request to continue, improve full-book speed, continue after leaving the website and retain resumable checkpoints. Implementation is not yet deployed. Local searchable-PDF output and Library publication are evaluated below; they are not automatically enabled by starting a private job.

## Evidence and decision

The deployed ADR-050 browser-owned run completed Mongolia Today313/313 and actual TXT/JSONL exports. The312 new saved pages span107.972minutes including an explicit pause; successive completion gaps have median19.335s/P9526.711s. These are end-to-end timings, not model-only latency or accuracy. The paired Paddle adapter creates and closes a native sidecar for every page, although the pinned Python sidecar already supports repeated requests in one process.

Replace browser ownership for a newly selected background run with a durable, account-private Core book job assigned to that account's own explicitly paired device. The browser starts, observes, pauses, resumes or cancels; closing or signing out of the website does not itself cancel the job. The device and connector must remain running. After a machine/connector restart, existing memory-only credential policy remains: normal re-pairing and explicit reassignment/resume are required. No autostart or persisted plaintext token is added.

This supersedes only ADR-050 browser lifecycle ownership for the new device path and ADR-049 fresh-per-page native lifecycle inside bounded book slices. Existing current-page and legacy browser-run behavior remain valid. No cloud fallback, paid activation, Owner device borrowing, automatic corpus dispatch, new Core resident service or main merge is included.

## Durable task and authority

Append schema041 with private book job and page-receipt tables and a separate device transport-feature field (`pdf_book_v1`). Do not repurpose Catalog jobs/roles or change engine capabilities to pretend an old image-only connector can process PDFs. Keep500 physical pages and500 retained results per account; preflight and completion checks count actual missing/saved pages, with no eviction or overwrite. Current-page requests and active book work share the authoritative account capacity gate.

Core freezes account/device, resource/source and declared page count in the job. Page receipts link existing private results without copying machine text/images. Result and receipt commit atomically. Equal repeated payloads return the same receipt without a second quota charge; different payloads conflict. Old attempts cannot save after takeover, pause, cancellation, loss of source/access, account auth-revision change or device revocation. Successful pages remain available when a task pauses/fails/cancels. A restarted Core recovers expired leases from persisted state; no unbounded unattended retries of failed OCR pages are added.

Every claim, heartbeat, source grant and page submission checks effective account/device authority and current immutable source. Source grants use the existing StorageAdapter and a fixed attachment filename, bounded expiry and post-signing recheck; no permanent OSS credentials or storage key API is introduced. The connector downloads a bounded source into private temporary storage, checks declared length/PDF header and available checksum, verifies decoded page count, then renders pages locally. It uses intrinsic rotation and the existing2000×2800/5.6M-pixel/2MiB-PNG bounds, including bounded fitting. Core never decodes the PDF. Images are transported only as bounded submission validation input and are not retained.

The existing `client_rendered_unverified` origin includes the paired device as a client. A device's checksum/render claim does not become server certification of PDF-page provenance. Private results, corrections and exports retain their current source authorization and never gain canonical or shared authority automatically.

## Native performance and isolation

Use one existing pinned Paddle sidecar per bounded slice: at most8 completed pages and a45-second condition for starting another page. A currently running page retains its original90-second deadline, so45 seconds is not a hard maximum lock lifetime. Maintain the same-user NativeResourceGuard throughout the slice. Await confirmed native child closure before releasing the lease, then yield at least the existing2-second interval before reacquisition. A close failure must leave the guard fail-closed; never release a live native holder. Source/auth loss, pause/cancel, lease loss and invalid results stop the slice. Do not keep GPU models alive across released leases or hold the guard for the entire book.

Keep the current model, Python sidecar hash, native lock protocol and page deadlines. Record content-free rendering/inference/ack timing where practical, then measure the actual book path before claiming a speedup. CPU PDF work must not starve network lease heartbeats. A usable existing PDF text layer is a later fast-path contract marked `native_text`; it cannot be stored as fabricated OCR engine output in the current result schema.

## Derived PDF and Library reuse

Recommend an optional local searchable PDF plus TXT/JSONL, generated from saved results without rerunning OCR. Preserve the acquired original and create a separately named derived file with source/checksum/engine/page coverage. Do not add a second text layer to already searchable pages blindly. Unicode fonts, intrinsic rotation/CropBox geometry, extractability and page appearance need real verification. Human corrections cannot inherit machine line offsets after text changes without remapping. Existing exports remain usable while that output contract is implemented separately.

Recommend an explicit “submit OCR to Library” path followed by source-bound review/publication. A published machine-derived version can benefit authorized members and avoid repeated work; private notes, personal corrections, device details and private research activity do not cross into it implicitly. Readers should be able to choose original versus published derived copy. Never replace original bytes/sourceId automatically. Malicious/incorrect OCR, omitted pages, wrong edition/scan, stale source, mismatched text geometry and accidental private content are material review risks. Shared publication/storage/retention requires its own accepted contract and cannot be inferred from a private job completion.

## Qualification, release and rollback

Verify private/Owner non-exception and source/device/account invalidation, durable lease takeover/idempotent receipts, quota/capacity races, legacy connector compatibility, source-grant recheck, bounded rendering, native closure-before-release/fairness, and browser closure/reopen/explicit re-pair resume. Qualify exact Core/frontend/native candidate with schema041 append-only preservation and unchanged models/configuration. Root remains the sole coordinated operator, with direct deployment and no new production backup as already instructed by the Owner. Rollback pauses new jobs, selects prior Core/frontend/native without downmigration, and preserves all accepted results/receipts; a live native holder must close before selector changes.
