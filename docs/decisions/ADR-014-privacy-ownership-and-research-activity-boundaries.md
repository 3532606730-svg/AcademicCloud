# ADR-014 — Privacy, Ownership, Scholarly Resource, and Research-Activity Boundaries

**Date:** 2026-08-17  
**Status:** Accepted

## Context

AcademicCloud is moving from a private/multi-user drive toward a long-lived scholarly workspace and shared academic library. The same underlying scholarly resource may be accessible to several accounts, while each account may have private reading progress, annotations, research questions, collections, citation work, and other research activity.

A conventional team-drive rule such as “admins can read everything attached to a shared file” is too broad for this product. At the same time, AcademicCloud needs shared catalog metadata, collaboration, system governance, integrity checks, and eventually OCR/RAG. These concerns require durable ownership and authorization boundaries before the research layer is implemented.

## Decision

AcademicCloud adopts the following durable principle:

> **Shared resource does not imply shared research activity.**

Product authorization is divided into six conceptual data planes.

### 1. Physical Artifact

A physical artifact is a stored byte object or file representation: PDF, image, DOCX, transcription file, object key, checksum, media type, size, and artifact-level lifecycle metadata.

Artifact visibility follows the resource/Library authorization that owns or exposes it. File bytes remain behind the storage abstraction.

### 2. Scholarly Resource / Scholarly Record

A Scholarly Record is the logical academic object rather than one particular file. It may represent a book, article, manuscript, inscription, archival document, map, photograph, or another scholarly object.

A record may have multiple attached artifacts or related versions, for example an original scan, another scan, edition, translation, transcription, or later OCR-derived artifact. Canonical metadata and provenance belong to this resource plane when they are intended to describe the shared scholarly object rather than one user's private interpretation.

### 3. Personal Research Overlay

Personal Research Overlay data is account-scoped and private by default. It includes, when implemented:

- Reading State and reading progress;
- `important` / `to_cite` flags;
- Favorites and personal Recent state;
- Personal Tags;
- personal Collections and Saved Research Views;
- private acquisition/research notes such as “why do I have this?”;
- private annotations, highlights, and page notes;
- Citation Workspace state and page-level evidence organization;
- Evidence Bundles;
- Research Questions and private resource/evidence links;
- private search/history state if such history is stored.

The product/API authorization model grants no implicit read authority over another account's Personal Research Overlay merely because an account has an `owner` or future administrative/governance role.

This is a product authorization rule, not a claim that a host/database operator is cryptographically unable to inspect storage. Infrastructure access remains governed separately by production security procedures. A future client-side-encrypted Private Vault may provide stronger operator-blind confidentiality, but it is not required by this ADR.

### 4. Collaborative Overlay

Collaborative data is explicitly shared within an authorized Library or collaboration scope. Examples include:

- Library Tags;
- contribution/review state;
- shared catalog and canonical records;
- shared provenance/source-confidence fields;
- explicitly shared annotations or notes if such a feature is later approved.

Personal data does not become collaborative merely because its underlying resource is shared. Crossing from Personal Research Overlay into Collaborative Overlay requires an explicit, separately authorized product action.

### 5. Governance / Operations

Governance data includes accounts, invitations, account status, announcements, permissions, quota/storage statistics, security audit events, backup/integrity state, and operational evidence.

Administrative authority may read and manage governance data as required by its role. Governance must not become a back door for research surveillance.

Security audit may record actions such as login failures, upload/delete/restore, invitation/account administration, permission changes, and sharing actions. It must not by default record or expose reading page, reading duration, search terms, annotation content, research questions, `to_cite` state, or equivalent private research behavior merely for administrator visibility.

### 6. Derived Intelligence

OCR, extracted text, indexes, embeddings, retrieval results, and RAG outputs are derived data. Their effective authorization must never exceed the authority of the requesting account over the source resource and any private overlay used to produce the result.

The durable rule is:

> **AI / derived-intelligence authority ≤ requesting user's effective authority.**

There is no “AI super-admin” research view.

## Additional Invariants

### Folder and Collection are different concepts

- **Folder** is storage hierarchy/location.
- **Collection** is research-semantic organization.

A resource may belong to multiple Collections without duplicating the underlying artifact.

### Canonical metadata and personal interpretation are different

Shared/canonical metadata may include author, title, publication, language, date, repository, shelfmark, identifiers, and other resource facts. A user's note such as “use this against chapter 3” or “relevant to my thesis section” is Personal Research Overlay data.

### Original artifacts and derived artifacts are different

An acquired original artifact should remain preservable evidence with a stable identity/checksum. OCR, corrected OCR, translations, transcriptions, annotated exports, and other transformations are separate derived artifacts or relationships with explicit lineage. Research annotation must not silently rewrite an original PDF merely for convenience.

### Duplicate detection must not leak inaccessible resources

Fingerprint/checksum comparison may use broader internal mechanisms if safe, but user-visible results may only reveal duplicates within resources the requesting account is authorized to know exist. An API must not disclose that another user's inaccessible private file exists because its checksum matches.

### Reading state is multi-dimensional

When implemented, reading workflow should support a primary state such as `unread | queued | reading | finished`, independent private flags such as `important` and `to_cite`, and progress such as `last_page` / `last_opened_at`. This permits combinations such as “reading + important + to-cite + page 147”.

## Consequences

- Personal overlay tables/repositories/APIs must be explicitly account-scoped; hiding fields only in the frontend is insufficient.
- Shared Library implementation must preserve the separation between a shared Scholarly Record and each member's private overlay.
- Search, analytics, auditing, exports, and AI integrations must classify which data plane they operate on before implementation.
- Cross-account tests must verify non-disclosure, not only write isolation.
- Future task cards must state data ownership/visibility and how data may cross a privacy boundary.
- Heavy intelligence services remain isolated from the authoritative Core Drive and must preserve source authorization.

## Non-goals

This ADR does not require client-side encryption, a mature RDF/semantic-web stack, a complete authority-control system, OCR, embeddings, RAG, or public collaboration. Those require separate task scope and, where appropriate, separate Owner gates.
