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
