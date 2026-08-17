# ADR-021 — Explicit Library Contribution Review and Ownership Promotion

**Date:** 2026-08-18
**Status:** Accepted

## Context

RF-LIBRARY01 provides Library membership and Library-owned holdings, but it intentionally does not decide how a Member's private scholarly resource crosses into that domain. A shared-folder shortcut would expose unrelated private Drive state, while a contributor-account alias would make an approved holding depend on the contributor remaining active.

## Decision

RF-LIBRARY02 treats one attached Scholarly Artifact and its current active Version/File as the submission unit for one Library.

- A submitter must be an active account with effective membership in the target Library and must own the attached Artifact through the account domain. The Record, Artifact, Version, and active File must remain in the same account domain at submission time.
- The accelerated minimum accepts only a single-Artifact Record. A partial promotion would either violate the Record/Artifact ownership foreign key or silently move unsubmitted sibling artifacts, so a multi-Artifact Record is rejected until a later explicit whole-Record selection design exists.
- `submitted → approved | rejected | withdrawn` is the only state progression. A partial or terminal state cannot be rewritten. A partial unique index permits one submitted contribution per `(Library, Artifact)` while allowing a rejected/withdrawn artifact to be submitted again when it remains account-owned.
- Reviewer listing and preview/download are scoped to explicitly submitted rows and an effective Library manager. Contributors may inspect their own explicit submission; no route enumerates the contributor's other Drive or Personal Research Overlay rows.
- Contribution candidates remain state/ownership consistent: `submitted`, `rejected`, and `withdrawn` rows expose bytes only while the complete Record/Artifact/Version/File chain remains in the contributor's account domain; `approved` rows expose bytes only while that chain remains in the contribution Library domain. If another Library promotes an Artifact that was submitted concurrently, every stale submission becomes inert and non-disclosing without fabricating a reviewer decision in the other Library.
- Approval validates the current active submitter, manager authority, contribution revision, attached state, active file, and unchanged account-domain ownership. One immediate SQLite transaction inserts a private `library_ownership_promotions` intent, defers foreign-key checking for the coordinated ownership update, promotes Record/Artifact/Version/File to the Library domain, clears incompatible account-folder placement, updates the contribution to terminal `approved`, writes the governance event, and removes the intent. Stable IDs, object key/bytes, uploader provenance, and private Favorite/Overlay rows remain intact.
- Database guards require every new contribution to begin as `submitted` at revision zero without reviewer evidence, and require every transition to `approved` to have the matching live promotion intent plus a complete target-Library ownership chain. Ordinary repository state updates are narrowed to rejection or withdrawal; approval cannot be manufactured through a generic create/update path.
- Rejection and withdrawal update only contribution state/revision/reviewer evidence. They do not mutate ownership, folder placement, file lifecycle, or object bytes.
- A disabled/archived submitter cannot complete a stale approval. After approval, the Library domain—not contributor account state—authorizes holdings access.
- Concurrent terminal actions use the contribution revision/state compare-and-set. Exactly one action wins; the loser sees a conflict and cannot duplicate ownership promotion or audit evidence.
- The frontend clears Library-scoped rows on selection changes and prevents switching Libraries while a scoped mutation and its refresh are still in flight, so a late response cannot be rendered under a different Library authority context.

The promotion intent is an internal database guard, not a client authority field. Existing RF-DOMAIN01 identity immutability triggers accept owner-domain changes only while the matching intent exists; no reverse-transfer operation is introduced.

## Non-goals

No public/external contribution, automatic approval, Trusted Contributor bypass, canonical metadata merge, Personal Overlay promotion, object deletion, OCR, embeddings, retrieval, RAG, production migration, or production deployment is authorized.
