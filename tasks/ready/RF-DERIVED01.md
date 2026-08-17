# RF-DERIVED01 — Derived Intelligence Contracts Only

## Task ID
RF-DERIVED01 — Derived Intelligence Contracts Only

## Goal
Finish Pre-OCR readiness with isolated OCR adapter, extracted-text storage/lineage, and future indexing/retrieval authorization contracts—without executing OCR or creating real derived content.

## Scope
Define production-disabled interfaces and additive empty persistence contracts for derived jobs/artifacts/text segments tied to source Resource/Artifact Version/Page/provenance and explicit lineage. Define authority evaluation so any future derived read/write inherits current source and applicable private-overlay authority. Provide only an unconfigured production adapter plus deterministic in-memory test fixtures; package/typecheck/compiled acceptance the contracts. Add append-only migration(s) only if empty derived-state schema is required.

## Non-goals
- No OCR engine/library/binary, extraction call, real document/text ingestion, background/resident worker, provider/network request, queue service, full-text index/search, embeddings, retrieval, RAG, AI model, production configuration, or user execution endpoint.

## Acceptance Criteria
- No production adapter can extract: the default is explicitly unavailable/fail-closed. Tests use synthetic strings/pages only and never read real academic files.
- Derived identities require stable source Resource/Artifact-Version/Page IDs, adapter/version/provenance, creation state, checksum where applicable, and explicit original→derived lineage.
- Authorization is evaluated against current effective source authority before job visibility, derived metadata/content, counts, or future index results; inaccessible and nonexistent sources are non-disclosing.
- Personal-derived state remains private when based on Personal Overlay input; no AI/service super-admin path exists.
- Source lifecycle/membership/revocation changes deterministically remove effective derived access without deleting original/derived provenance.
- Interfaces stay behind module/storage abstractions and add no Alibaba/direct provider dependency or resident memory load.
- Migration (if any), restart, backup/restore, permission matrix, compiled/artifact gates, zero-real-input/network proof, and secret/dependency scans pass.
- Independent review focuses on accidentally executable extraction, authority inheritance, source revocation, lineage gaps, hidden network/provider calls, and scope creep into OCR/index/RAG.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- identity/lineage/authorization-matrix decisions
- a new derived-contract ADR if exact job/storage authority is not already resolved

## Relevant Modules / Files
- new derived contract/domain/repository modules and synthetic fixtures
- research identity/page/lineage/effective-authority modules
- `backend/src/storage/storage-adapter.ts` only through an isolated derived abstraction if needed
- `scripts/production-artifact.mjs`, compiled acceptance, contract docs/tests

## Current State
Blocked on `RF-AUTHMATRIX01`. No derived/OCR/text/index module exists, and execution remains explicitly unauthorized.

## Completed
- ADR-014 fixes source-derived authorization and no AI super-admin.
- RF-PLAN01 records this as the terminal Pre-OCR contract checkpoint.

## Remaining
- record exact empty-state/interface/authority/lineage contract;
- implement production-disabled contracts and synthetic fixtures only;
- prove no engine/network/real input and run all runtime/artifact/permission gates;
- independently review, checkpoint, then stop.

## Blockers
Any executable OCR/text extraction, real artifact input, index/search engine, embeddings/retrieval/RAG, external service/cost, production contact, or resident worker is a mandatory Owner gate.

## Last Verification
2026-08-17 baseline and approved program contain no derived implementation; current authorization explicitly stops before OCR/text extraction execution.

## Next Action
After `RF-AUTHMATRIX01`, implement only fail-closed contracts and synthetic tests; on green checkpoint, stop the continuous objective before OCR.
