# ADR-040: Loopback catalog export bridge

- Status: Accepted
- Date: 2026-09-02
- Supersedes: the manual request-file handoff and no-resident-bridge consequence in ADR-039 only

## Context

ADR-039 established the correct batch-catalog authority boundary: Core scopes a private export capability to exact resource/content identities, Local Compute performs bounded PDF text extraction and selective PaddleOCR, an external reviewer returns an untrusted strict results document, and Core always previews before explicit Owner-selected apply.

The initial V1 exposed the Core-to-Local-Compute transport as a manual operator workflow: download the private export request, invoke the Local Compute CLI, locate the resulting ZIP, then continue review. Real Owner use showed that this implementation detail is unnecessary product friction and increases the chance of mixing batches or sharing the wrong artifact.

Moving PDF rendering/OCR into Core is not acceptable. It would violate the existing Core/Compute isolation and put heavy document processing back on the small control-plane host. Re-enabling the main Local Pull reasoning worker is also unnecessary and would couple this deterministic export path to a separately paused AI runtime.

## Decision

The normal Batch Catalog export path becomes one browser action backed by a dedicated Local Compute loopback bridge.

1. The browser asks Core for the existing private `academiccloud.catalog-export-request.v1` document for the exact currently selected PDF resource IDs.
2. The browser sends that document directly in memory to a Local Compute bridge bound only to `127.0.0.1`.
3. The bridge validates the request with the existing strict parser and invokes the existing bounded `createCatalogEvidencePackage` implementation with native PDF text plus selective PaddleOCR.
4. The bridge returns only the resulting `academiccloud-catalog-batch-*.zip` bytes to the browser. The browser downloads that ZIP for external review.
5. The private export request is no longer downloaded or persisted by the normal UI path.

The bridge is a small transport wrapper around the existing exporter, not a second cataloguing engine. It does not run the reasoning model, claim Core jobs, write canonical metadata, import results, or apply changes. The main Local Pull worker may remain disabled/absent/paused.

External review and results import remain human-mediated. This ADR does not add an external AI API, ChatGPT API integration, new paid service, new credentials, or automatic apply.

## Loopback security boundary

- Listen on literal `127.0.0.1` only; never bind `0.0.0.0`, a LAN address, or IPv6 wildcard.
- Accept browser export requests only from an exact configured Origin allowlist. Production allows `https://cloud.ajtlab.top`; development origins may be explicitly configured.
- Require `Content-Type: application/json` plus the dedicated `X-AcademicCloud-Catalog-Bridge: 1` header. Normal CORS preflight must succeed before the browser can send the private request.
- Never use wildcard CORS and never allow credentials on the loopback request.
- Process at most one export at a time.
- Cap the request body at the existing 2 MiB export-request limit and retain all existing evidence/ZIP limits from ADR-039.
- Do not log, echo, cache, or persist the private request or its capability token.
- Return only bounded status/error codes or the ZIP payload. Do not include request contents in errors.
- Set `Cache-Control: no-store` on bridge responses.

Modern browsers may require a one-time user permission for a public HTTPS site to access a loopback/local-network endpoint. That browser permission is accepted as the local-device consent boundary; the application should surface only a concise actionable error when access is unavailable rather than permanent explanatory prose.

## Lifecycle

The bridge has its own Local Compute service entry and release artifact. It is independent from `academiccloud-local-compute.service` (the outbound AI Local Pull worker). A Windows user-login launcher may start the WSL distribution so the enabled bridge is available without a manual command. Installing/enabling that service and launcher on the Owner machine is a deployment action and remains separately gated from repository implementation.

## Preserved ADR-039 invariants

Everything not explicitly superseded above remains authoritative, including:

- exact `resourceId` and immutable source-identity matching;
- the 24-hour in-memory Core export capability;
- first 15 plus last 5 pages, at most 20 pages;
- selective OCR and all per-page/per-resource/ZIP bounds;
- JSON-only final evidence package with no PDF or rendered-page bytes;
- strict stateless results import;
- mutation-free preview;
- explicit Owner selection and confirmation before apply;
- collision, stale-state, audit, canonical-authority, and unchanged-object-key protections.

## Consequences

The normal user workflow becomes: select PDFs → Batch Catalog → generate evidence package → external review → import results → preview → explicitly apply selected records. The user no longer handles the private request file or invokes a Local Compute command.

Core remains small and Local Compute retains heavy extraction/OCR. The idle bridge adds a local loopback service but no cloud resident service, database queue, schema migration, or recurring infrastructure cost.

## Rollback

The frontend can fall back to the ADR-039 manual request/CLI path if the loopback bridge is removed. Removing the bridge service and browser integration does not require a database rollback and does not alter resource bytes, object keys, canonical metadata, authority history, or prior evidence.