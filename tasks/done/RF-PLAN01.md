# RF-PLAN01 — Pre-OCR Execution Decomposition

## Task ID
RF-PLAN01 — Pre-OCR Execution Decomposition

## Goal
Compile the Owner-approved Pre-OCR Research Foundation program into a dependency-safe executable repository queue of bounded, independently reviewable task cards without implementing product code.

## Scope
Planning/documentation only.

Recover and reconcile:
- `AGENTS.md`;
- `.agents/skills/academiccloud-workflow/SKILL.md`;
- `CURRENT_STATUS.md`;
- `TASK_BOARD.md`;
- `ROADMAP.md`;
- ADR-014;
- current code/data-model facts needed to size dependencies correctly.

Create a coverage/dependency plan and materialize appropriately sized Ready task cards for the approved Pre-OCR program areas:
- Core Research UX;
- Personal Research Overlay;
- Scholarly Records / Metadata / Provenance / Relationships;
- Research Intake;
- Annotation / Citation / Evidence / Research Questions;
- Shared Academic Library;
- Pre-OCR Integrity / Identity / Derived-artifact Hardening.

Large areas must be split into smaller vertical Epics where implementation/review risk would otherwise produce a giant diff. The task IDs and exact splits may follow repository conventions, but every approved roadmap capability must be accounted for in exactly one primary implementation workstream or explicitly classified as a later/non-blocking backlog item.

Every generated implementation card must use the standard task sections and state, where relevant:
- product/data ownership plane under ADR-014;
- default visibility and cross-account boundary;
- scope and explicit non-goals;
- schema/migration expectations and append-only migration rules;
- server-authoritative authorization requirements;
- rollback/concurrency/idempotency requirements where relevant;
- frontend/backend/persistence integration boundaries;
- acceptance matrix;
- adversarial review focus;
- dependency and production gates.

Update `TASK_BOARD.md` with the concrete dependency-safe continuous queue. Reconcile `CURRENT_STATUS.md` / `ROADMAP.md` only if planning reveals a factual inconsistency; do not silently change the Owner-approved product boundary.

## Non-goals
- No product implementation code.
- No database migration.
- No dependency addition.
- No production access/mutation/deployment.
- No main merge.
- No OCR/text extraction execution.
- No embeddings, retrieval, or RAG.
- No Private Vault implementation.
- No polished browser extension.
- No mature RDF/semantic-web/authority-control system.
- No full Time Machine/Rewind implementation.
- No unrelated One-Time External Sharing expansion.

## Acceptance Criteria
- `ROADMAP.md` and ADR-014 are fully represented in the executable plan; no approved capability from the current Pre-OCR inventory is silently dropped.
- Every generated task card has one bounded, independently reviewable purpose and all standard task-card sections.
- Privacy classification is explicit: Physical Artifact, Scholarly Record, Personal Research Overlay, Collaborative Overlay, Governance/Operations, or Derived Intelligence as applicable.
- Personal Research Overlay cards preserve the rule that Owner/Admin has no implicit product read authority over another account's private research activity.
- Search/duplicate/audit cards explicitly prevent cross-account existence leaks and research-surveillance creep.
- Folder and Collection remain distinct concepts.
- Original artifacts and derived artifacts/lineage remain distinct.
- Shared Library is sequenced after the private scholarly/resource model it depends on and is defined as a real ownership/domain boundary rather than a shared-folder shortcut.
- Pre-OCR hardening ends at contracts/adapters/storage/authorization boundaries and does not execute OCR/RAG.
- Non-blocking future ideas remain preserved without being made mandatory pre-OCR blockers.
- `TASK_BOARD.md` contains a concrete dependency-safe sequence and explicitly authorizes autonomous progression one green checkpoint at a time inside that sequence.
- Planning diff is documentation/task-state only, passes `git diff --check`, and introduces no secret/dependency/migration delta.
- A read-only planning review checks coverage, dependency order, privacy boundary, duplicated scope, and accidental expansion.

## Relevant ADRs
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- task-specific earlier ADRs only as needed to respect current accounts/auth/storage architecture.

## Relevant Modules / Files
- `AGENTS.md`
- `.agents/skills/academiccloud-workflow/SKILL.md`
- `ROADMAP.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `DECISION_LOG.md`
- `tasks/ready/`
- current persistence/domain/API code only for dependency discovery; no product-code edits.

## Current State
**Complete in repository planning; independently reviewed PASS.** The prior repository/local continuous objective through OPS01A remains complete. The Owner-approved Pre-OCR Research Foundation is now represented by `docs/architecture/pre-ocr-execution-plan.md`, a matching executable `TASK_BOARD.md` sequence, and 25 bounded Ready cards from `RF-AUDIT01` through terminal `RF-DERIVED01`. The accepted production UX01 generation remains unchanged and separately gated.

## Completed
- Owner approved the Pre-OCR Research Foundation program boundary.
- ADR-014 records privacy, ownership, scholarly-resource, personal-overlay, governance, and future intelligence authority rules.
- `ROADMAP.md` records the complete approved Pre-OCR product inventory and non-blocking future backlog.
- Recovered the clean Git checkpoint, current code/data model, task lifecycle, accepted ADRs, production separation, and stop boundary without relying on chat memory.
- Selected this card as the only executable repository/local task; `PROD-03C2` remains parked and non-executable.
- Added `docs/architecture/pre-ocr-execution-plan.md` with a 25-checkpoint dependency sequence and an exactly-once primary capability coverage matrix.
- Materialized 25 bounded Ready cards from `RF-AUDIT01` through terminal `RF-DERIVED01`; every card has the exact 13 standard sections.
- Split ownership-domain migration, provenance versus lineage, Library catalog versus provenance/grouping, and integrity versus recovery versus authorization-matrix work into independent risk/checkpoint boundaries.
- Defined future Library-safe ownership before Scholarly Records, contributor-independent Library promotion, one leak-safe duplicate/search authority path, stable Artifact-Version Page anchors, no research-surveillance audit, and production-disabled/test-fixture-only derived contracts.
- Reconciled `PROJECT_SPEC.md`, `ROADMAP.md`, `CURRENT_STATUS.md`, and `TASK_BOARD.md` where the previous objective or Shared Library authorization state was stale.
- Incorporated the first independent read-only planning review findings, including task sizing, audit allowlists, non-disclosing duplicate/search behavior, legacy-file lifecycle/identity rules, ownership transfer, deterministic non-AI intake suggestion boundary, and exact Library privacy promotion semantics.
- Repaired final independent-review findings: account/private export now precedes explicit Library export integration; approved Library resources are immediately readable and require a dedicated terminal-promotion ADR; recovery cannot treat global Owner as authority over another account's overlay; Page identity has one concurrency-safe natural-key mapping preserving earlier progress.
- Received final independent read-only Reviewer verdict **PASS** with no remaining blocker or medium finding.
- Added no product code, migration, dependency, runtime configuration, production access, OCR execution, or main merge.

## Remaining
None inside RF-PLAN01 planning scope.

The containing Git checkpoint closes this task. The separately bounded `RF-AUDIT01` card is the next executable repository/local Epic.

## Blockers
None for RF-PLAN01 closure.

The generated queue retains mandatory Owner gates for OCR/text-extraction execution, full-text indexing, embeddings/retrieval/RAG, production access/migration/deployment, main merge, real credentials/cost, destructive real-data work, or any unrecorded product boundary.

## Last Verification
2026-08-17 final planning verification from baseline `775f9eabba363ca0d7f4bf06493c6f677268cbd7`:

- execution plan, Task Board, and Ready directory contain the same 25 unique RF task IDs in the same order;
- every generated Ready card and this Done card has the exact 13 standard sections;
- all literal repository/ADR references exist;
- the complete approved Roadmap inventory is assigned exactly once as primary implementation scope;
- tracked and newly created files pass whitespace checks;
- high-confidence secret-like scan: 0 hits;
- product-code, migration, dependency, runtime/deployment delta: 0;
- independent read-only Reviewer: **PASS**, no blocker or medium finding;
- production and OCR/Intelligence execution were not contacted or changed.

## Next Action
Create the local RF-PLAN01 Git checkpoint, recover from repository state, move `RF-AUDIT01` from Ready to Doing, and execute it as the first bounded Pre-OCR implementation Epic.
