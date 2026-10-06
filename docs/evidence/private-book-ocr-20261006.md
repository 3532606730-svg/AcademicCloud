# Private whole-book OCR — October6 candidate

Owner explicitly requested whole-book OCR and scholarly differentiation, continuing direct qualified deployment without a new backup. ADR-050 records the narrowed implementation and superseded historical stop line. Execution remains the existing vNext branch; no main merge or paid activation.

## Candidate behavior

The Reader processes a PDF of up to500 physical pages sequentially on the requesting account's own paired local engine. The existing500 retained-result account quota remains; preflight checks missing pages against remaining slots. Saved private results are durable checkpoints, not a persistent background queue. Hide/leave pauses; explicit resume reconciles saved/active work. Low confidence, unsupported script, truncation and no-text outcomes remain distinguishable. Machine history and manual correction CAS are retained.

Source-bound metadata progress and streaming authenticated TXT/JSONL export introduce no migration or native/runtime change. Exports retain source/page/frame/engine lineage, machine and corrected text, explicit missing pages and an end marker; reads continue to recheck account/source authority. Initial production remains8f6c721/native662/schema40 until candidate qualification and coordinated activation.

## Verification so far

Backend real Auth/HTTP/SQLite and existing OCR/migration focused suite:21/21 passed. Backend and contracts types/build passed. New500-page metadata-only coverage does not parse book-sized payloads; source/access replacement/recycle/revision/privacy/Owner non-exception and streamed per-row authorization are covered.

Frontend focused verification passes56/56 across8 files and typecheck. It covers real PdfReader sequential intrinsic-rotation capture without display navigation, source/hidden/unmount cancellation, same-source active reconciliation, concurrently saved page skipping, manual failure resume, quota and preservation of selected history/correction drafts. Logs: output/vnext/book-ocr-20261006/frontend-focused-tests.log and frontend-typecheck.log. Independent Sol/xhigh read-only review passes with no remaining material finding. A concrete concurrent-checkpoint duplicate was repaired and covered by regression. Exact Linux/host release and normal Owner book/export acceptance are pending. No complete real book, whole-book CER or new production capability is claimed at this checkpoint.

The ignored exact-release helper allows only OCR backend/contracts and frontend runtime changes, with all other manifest identities unchanged. Its three concrete comparator checks and Bash syntax pass. No backup, runtime selection or cloud/native action was performed for this evidence.

Product direction and primary-source comparison: [scholarly workbench evaluation](../evaluation/scholarly-workbench-direction.md). Later search/evidence/question/interoperability directions remain proposals.

## First exact release and real cover finding

Core/frontend925bd865f020e4474378948ed7735497fe7b8e32 is deployed after exact Linux/host artifact qualification;5180files,42,976,966bytes,5163 unchanged manifest identities. Archivea4b548d9e061ba3c93b5f83c96ee0ef8e0344f5a2a15b3cb25d6dddf4bdd79fb; manifest656382a107732b60af60c166f67a5f5fbc2674d1e672126994ac92b58729158e. Core1504566 active/NRestarts0 and schema40/40migrations/11admissions/integrity/FK pass; native662 and configuration stay unchanged. No new production backup, migration or rollback. Source925 publication and fetched-remote clean equality passed.

Normal signed-in Owner MongoliaToday313 opens the whole-book panel with1 saved page and2 total private results. First start stopped at cover/page1 because PNG exceeded2MiB, before any engine submission. The original page4 remains its checkpoint. This is a concrete transport-size finding, not a model failure. Book-only bounded PNG fitting before inference is being repaired; initial dimensions are retained for ordinary pages and final submitted dimensions/digest remain explicit. Local receipts: output/vnext/book-ocr-20261006/; cover-frame-stop.png captures the stop. Full-book and actual file-download acceptance remain pending.

## Cover frame repair qualification

Book-only capture re-renders oversized PNGs at a size-derived smaller scale before inference, using one cleared canvas and at most5 attempts; last fallback is at most400,000 pixels, with the unchanged2MiB/dimension limits. Ordinary pages retain original bounds. Only the final PNG is hashed/encoded/submitted. Six meaningful regressions cover normal/oversized/bounded-no-fit/source/abort/hash behavior. Latest frontend suite62/62 across8files and typecheck pass; same independent reviewer passes the repair and925-based frontend-only release helper. Logs: frame-fit-focused-tests.log, frame-fit-typecheck.log. Initial backend21 remains green/unchanged. Exact repair release and real book/download acceptance are pending.
