# Pre-OCR Research Foundation Execution Plan

**Status:** Independently reviewed execution plan; `RF-PLAN01` complete
**Baseline:** `775f9eabba363ca0d7f4bf06493c6f677268cbd7`
**Current schema head:** append-only migration 009 (`RF-AUDIT01`)

This plan compiles `ROADMAP.md` and ADR-014 into the executable task queue. It does not add product behavior, authorize production rollout, or authorize OCR/text extraction, embeddings, retrieval, or RAG.

## Sequencing Principles

1. Establish governance event boundaries before adding research-domain mutations, but never record private reading, search, annotation, citation, evidence, or note content as administrative audit.
2. Replace the current account-only ownership substrate with an explicit ownership-domain parent before adding Scholarly Records. Existing IDs, object keys, lifecycle state, recycle provenance, and account isolation must survive the deterministic migration unchanged.
3. Extend the current Drive through explicit scholarly identities rather than renaming a file or folder into a Scholarly Record or Collection. An accepted future Library artifact must be owned by its Library domain, not remain lifecycle-dependent on its contributor account.
4. Establish private Scholarly Record and Personal Research Overlay semantics before creating any Shared Library domain rows or membership.
5. Keep canonical metadata, personal interpretation, collaborative catalog state, governance evidence, and future derived data in separate authority planes.
6. Allocate every schema change as a new migration after the then-current head. Historical migrations 001–009 are immutable.
7. Treat every API as server-authoritative. Client-supplied account, role, owner-domain, Library membership, provenance authority, or visibility claims are never trusted.
8. End the program at tested identity, integrity, adapter, storage, and authorization contracts. Do not execute OCR or create real extracted text, indexes, embeddings, retrieval, or RAG state.

## Dependency-Safe Queue

| Order | Task | Primary purpose | Depends on |
|---:|---|---|---|
| 1 | `RF-AUDIT01` | Governance/security audit foundation without research surveillance | current Accounts/Drive baseline |
| 2 | `RF-OWNERSHIP01` | Explicit account ownership domains and future Library-safe Drive ownership substrate | `RF-AUDIT01` |
| 3 | `RF-BULK01` | Safe bulk operations over existing Drive/Favorites lifecycle | `RF-OWNERSHIP01` |
| 4 | `RF-DOMAIN01` | Scholarly Record, Artifact attachment, stable Resource/Artifact/Version identity | `RF-OWNERSHIP01` |
| 5 | `RF-META01` | Bounded canonical metadata templates and minimal Authority identifiers | `RF-DOMAIN01` |
| 6 | `RF-PROV01` | Provenance/acquisition facts, fingerprinting, accessible-scope duplicate contract | `RF-DOMAIN01`, `RF-META01` |
| 7 | `RF-LINEAGE01` | Edition/scan/translation/transcription and derived-artifact relationship graph | `RF-PROV01` |
| 8 | `RF-STATS01` | Account-Drive statistics and ownership-domain-extensible quota-policy foundation | `RF-OWNERSHIP01`, `RF-DOMAIN01` |
| 9 | `RF-OVERLAY01` | Private reading state/progress/flags, Recent, acquisition-research note | `RF-DOMAIN01`, `RF-PROV01` |
| 10 | `RF-ORGANIZE01` | Personal Tags, Collections, and Favorites integration | `RF-OVERLAY01` |
| 11 | `RF-SEARCH01` | Single authority-scoped metadata/name search contract for files, folders, and resources | `RF-META01`, `RF-ORGANIZE01` |
| 12 | `RF-VIEWS01` | Private Saved Research Views over the authorized query surface | `RF-SEARCH01`, `RF-ORGANIZE01` |
| 13 | `RF-INTAKE01` | Research Inbox, triage, deterministic suggestion boundary, duplicate-aware acquisition, intake API | `RF-PROV01`, `RF-SEARCH01` |
| 14 | `RF-ANNOTATE01` | Sidecar annotations, highlights, page notes, stable Artifact-Version Page anchors | `RF-LINEAGE01`, `RF-OVERLAY01` |
| 15 | `RF-CITE01` | Private Citation Workspace and stable page-level Evidence references | `RF-ANNOTATE01`, `RF-META01` |
| 16 | `RF-EVIDENCE01` | Evidence Bundles, Research Questions, explicit question/resource/evidence links | `RF-CITE01` |
| 17 | `RF-EXPORT01` | Structured scholarly/citation/evidence export contracts | `RF-EVIDENCE01`, `RF-META01` |
| 18 | `RF-LIBRARY01` | Library domain creation, membership, and Library-scoped permissions | private model through `RF-EXPORT01` |
| 19 | `RF-LIBRARY02` | Trusted Contributor and contribution review/promotion workflow | `RF-LIBRARY01` |
| 20 | `RF-LIBRARY03` | Shared catalog, Library Tags, canonical/original naming governance | `RF-LIBRARY02`, `RF-META01` |
| 21 | `RF-LIBRARY04` | Shared provenance confidence and leak-safe duplicate/version grouping | `RF-LIBRARY03`, `RF-PROV01`, `RF-LINEAGE01` |
| 22 | `RF-INTEGRITY01` | Read-only identity/metadata/object consistency monitor | all product tasks through `RF-LIBRARY04` |
| 23 | `RF-RECOVERY01` | Metadata snapshot and isolated logical-recovery rehearsal foundation | `RF-INTEGRITY01`, `RF-EXPORT01` |
| 24 | `RF-AUTHMATRIX01` | Complete cross-plane permission/ownership/export matrix verification | `RF-RECOVERY01` |
| 25 | `RF-DERIVED01` | OCR adapter, extracted-text storage, lineage and future index/retrieval authorization contracts only | `RF-AUTHMATRIX01` |

The queue is intentionally linear for autonomous execution even where some implementation dependencies could form a DAG. A later card may not be pulled forward merely because it is locally convenient.

## Complete Capability Coverage

Each approved capability has exactly one primary implementation task. Later tasks may integrate with or verify it without taking over its primary scope.

| Approved capability | Primary task | Data plane and boundary |
|---|---|---|
| Security / Administrative Audit | `RF-AUDIT01` | Governance/Operations; never research-activity surveillance |
| Account ownership-domain substrate and future Library-safe uploader/owner separation | `RF-OWNERSHIP01` | Physical Artifact/Core Drive authority foundation; no Library rows yet |
| Bulk move, recycle, Favorite changes, explicit partial-failure semantics | `RF-BULK01` | Physical Artifact/Core Drive; account-authorized only |
| Storage capacity, file-count, recycle/pending statistics and quota foundation | `RF-STATS01` | Governance/Operations; aggregate/account-scoped |
| Scholarly Record separate from physical file | `RF-DOMAIN01` | Scholarly Record versus Physical Artifact |
| Multiple Artifacts/Versions per record and stable Resource/Artifact/Version identity | `RF-DOMAIN01` | Explicit identities; no implicit reinterpretation of legacy files |
| Canonical metadata and Book/Article/Manuscript/Inscription/Archival Document templates | `RF-META01` | Scholarly Record canonical facts |
| Minimal Person/Place/Language/Work/Institution authority foundation | `RF-META01` | Normalized canonical references; not mature RDF |
| Provenance/acquisition facts, checksums/fingerprints, safe duplicate detection | `RF-PROV01` | Scholarly/Physical planes; inaccessible match indistinguishable from no match |
| Edition/scan/translation/transcription/derived-artifact relationships and lineage | `RF-LINEAGE01` | Explicit acyclic relation/lineage; original preserved |
| Reading state/progress/last opened/Important/To Cite | `RF-OVERLAY01` | Personal Research Overlay; private per account |
| Recent | `RF-OVERLAY01` | Personal Research Overlay; no Owner/Admin visibility |
| Private acquisition/research note | `RF-OVERLAY01` | Personal Research Overlay, distinct from canonical provenance |
| Personal Tags | `RF-ORGANIZE01` | Personal Research Overlay; distinct from Library Tags |
| Collections | `RF-ORGANIZE01` | Personal Research Overlay; distinct from Folder hierarchy |
| Favorites integration with the personal research model | `RF-ORGANIZE01` | Existing private Favorites integrated without semantic merger |
| Metadata/name Search over files/folders/resources | `RF-SEARCH01` | Authorized source metadata only; not OCR full text |
| Saved Research Views | `RF-VIEWS01` | Private query definitions over authorized resources |
| Research Inbox and attach/create/archive/discard triage | `RF-INTAKE01` | Personal intake workflow; server-authoritative transitions |
| Metadata/provenance capture, deterministic non-AI suggestion boundary, and stable intake API | `RF-INTAKE01` | No browser extension/OCR/AI requirement and no cross-account leak |
| Sidecar annotations, highlights, page notes, stable Page identity | `RF-ANNOTATE01` | Personal Research Overlay; originals never rewritten |
| Citation Workspace and page-level Evidence references | `RF-CITE01` | Personal Research Overlay; stable source anchors |
| Evidence Bundles, Research Questions, explicit links | `RF-EVIDENCE01` | Personal Research Overlay; references do not duplicate bytes |
| Structured scholarly/citation output foundation | `RF-EXPORT01` | Authorized export contract; no hidden/private cross-account data |
| Library as real ownership domain, membership and permissions | `RF-LIBRARY01` | Collaborative Overlay plus explicit Library ownership |
| Trusted Contributor and contribution review | `RF-LIBRARY02` | Library-scoped authority only |
| Library Tags and shared catalog/canonical/original naming governance | `RF-LIBRARY03` | Collaborative catalog; Personal Overlays remain private |
| Shared provenance/source confidence and duplicate/version grouping | `RF-LIBRARY04` | Collaborative facts derived only from Library-authorized resources |
| Integrity Monitor | `RF-INTEGRITY01` | Governance/Operations; detect/report, never destructive auto-repair |
| Metadata snapshot/recovery foundation | `RF-RECOVERY01` | Governance/Operations; bounded isolated logical-state recovery contracts |
| Full permission/ownership matrix | `RF-AUTHMATRIX01` | Cross-plane verification including exports and future derived data |
| OCR adapter boundary | `RF-DERIVED01` | Derived Intelligence contract only; no OCR execution |
| Extracted-text storage contract tied to source/version/page/provenance | `RF-DERIVED01` | Empty/test-only derived contract; no real extracted content |
| Future indexing/retrieval/RAG authorization boundary | `RF-DERIVED01` | Authority cannot exceed requester/source authority; no engine execution |

## Cross-Cutting Acceptance Contract

Every implementation card in this queue must:

- start from a clean checkpoint and move only its own card from Ready to Doing;
- preserve migrations 001–009 and every migration added by earlier cards; production startup remains migration fail-closed;
- test Owner and Member behavior, same-account success, cross-account denial, disabled-account/session behavior where applicable, and authority-field rejection;
- use database transactions/CAS or explicit idempotency where concurrent writes could overwrite, duplicate, revive, or misattribute state;
- preserve rollback at the transaction boundary and never auto-delete or rewrite original academic bytes;
- integrate persistence/domain/service/API/frontend where the task exposes user behavior, with responsive/mobile coverage and no unnecessary primary navigation item;
- exercise restart persistence, backup/isolated restore, redeploy migration count zero, compiled acceptance, and production-artifact validation whenever persisted/runtime behavior changes;
- receive independent adversarial review focused on authorization, existence leaks, privacy-plane mixing, concurrency, rollback, schema compatibility, and scope expansion;
- remain repository/local only. Production access, migration, credentials, paid infrastructure, deployment, main merge, and destructive real-data actions remain Owner-gated.

## Explicit Non-Blocking Backlog

The following remain recorded but are not tasks in this queue and do not block Pre-OCR completion:

- Private Vault/client-side encryption;
- External Deposit Link;
- polished browser extension after the intake API is stable;
- mature Authority/RDF/semantic-web integration;
- full Time Machine/Rewind;
- unrelated One-Time External Sharing expansion and optional extra session-management UX.

## Terminal Boundary

`RF-DERIVED01` is the final executable Pre-OCR card. When it is independently green and checkpointed, stop. Starting an OCR engine, extracting text from any artifact, building a full-text index, generating embeddings, performing retrieval, running RAG, contacting production, or deploying the accumulated repository changes requires a new explicit Owner authorization.
