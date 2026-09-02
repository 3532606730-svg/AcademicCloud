# ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1

## Task ID

`ACADEMICCLOUD-BATCH-CATALOG-ROUNDTRIP-V1`

## Goal

Provide the human-mediated Library cataloguing roundtrip with bounded Local Compute evidence extraction, strict external results, side-effect-free preview, explicit Owner selection, and identity/collision/authority-safe apply, while keeping the normal export interaction bounded to the PDFs the Owner actually selected.

## Scope

- Preserve ADR-039 identity, evidence, preview, collision, and apply boundaries.
- Fix the Owner-observed selection regression where the Batch Catalog dialog expanded from the initial two PDFs to the wider loaded Library set.
- Remove redundant explanatory copy from the Batch Catalog dialog.
- Implement ADR-040 so the normal browser path sends the private Core export request directly in memory to a dedicated `127.0.0.1` Local Compute bridge and downloads only the final evidence ZIP.
- Keep PDF rendering/selective PaddleOCR in Local Compute and keep the main AI Local Pull reasoning worker independent/disabled.
- Add the exact CSP loopback destination, loopback service unit, Windows login launcher, and focused regression/security tests needed by that path.

## Non-goals

- No OpenAI/DeepSeek/ChatGPT API integration.
- No automatic external review or automatic results apply.
- No database/schema migration.
- No canonical metadata, object-key, source-byte, or production-resource mutation as part of this implementation.
- No activation of the main Local Pull reasoning worker.
- No wildcard localhost/LAN browser access.
- No production deployment or live Owner-machine service installation without the separate deployment gate.

## Acceptance Criteria

- [x] Match only by durable resource ID and existing immutable source fingerprint.
- [x] JSON-only evidence ZIP; no PDF/image bytes; bounded 15+5 selective extraction.
- [x] Strict results schema, size/enumeration/path/duplicate checks, and full manifest digest verification.
- [x] `academiccloud.filename.v1` exact Owner-approved formats; no placeholder or numeric suffix invention.
- [x] Preview is mutation-free; AUTO remains visible; REVIEW needs explicit selection; UNKNOWN cannot apply.
- [x] Same-content duplicate and different-content collision fail closed without overwrite.
- [x] Apply revalidates preview/source state, preserves object key, records normal audit, and establishes Owner-confirmed human authority.
- [x] First real local Owner UI roundtrip passed on `Mongolia Between China and the USSR .pdf`: 88 pages, bounded 20-page evidence, 18 native-text pages, 2 PaddleOCR pages, JSON-only/privacy/identity gates green, and UNKNOWN import preview mutation-disabled.
- [x] Batch Catalog dialog implementation is now fixed to the initially selected PDFs; background whole-Library hydration is removed.
- [x] Redundant operator-facing description/export-hint paragraphs are removed while explicit apply confirmation remains.
- [x] Normal export implementation no longer downloads the private export-request JSON; it sends it directly to the loopback bridge and downloads only `academiccloud-catalog-batch-*.zip`.
- [x] Bridge implementation binds only `127.0.0.1`, uses exact Origin allowlisting, normal CORS preflight plus a dedicated request header, no credentials, no-store responses, bounded request/response sizes, and concurrency one.
- [x] Bridge reuses the existing strict export-request parser and bounded evidence-package implementation; no reasoning worker dependency is introduced.
- [x] Production CSP source template permits only exact `http://127.0.0.1:43117` for this new browser connection.
- [x] Dedicated systemd unit and idempotent Windows-login WSL launcher are present for later gated installation.
- [x] Focused frontend and Compute regression tests are added for selection scope, in-memory request handoff, ZIP-only browser download, unavailable Local Compute handling, exact-origin/preflight restrictions, dedicated header, and concurrency one.
- [ ] Execute the applicable frontend/Compute typecheck and focused tests in an environment with the repository dependencies available; repair any failures before merge/deploy.
- [ ] Perform read-only final diff/security review and reconcile this card with the verified checkpoint.

## Relevant ADRs

- ADR-031 — heavy document execution remains outside Core.
- ADR-037 — Local Compute isolation remains authoritative.
- ADR-039 — batch catalogue evidence/results/authority contract remains authoritative except for the manual transport step.
- ADR-040 — loopback catalog export bridge supersedes the manual private-request file/CLI handoff only.

## Relevant Modules / Files

- `frontend/src/batch-catalog.tsx`
- `frontend/src/batch-catalog.test.tsx`
- `frontend/src/catalog-local-bridge.ts`
- `frontend/src/catalog-local-bridge.test.ts`
- `compute/src/catalog-batch-export.ts`
- `compute/src/catalog-bridge.ts`
- `compute/test/catalog-bridge.test.ts`
- `deployment/nginx/academiccloud-security-headers.conf`
- `deployment/systemd/academiccloud-catalog-bridge.service`
- `scripts/local-compute/install-catalog-bridge-autostart.ps1`
- `docs/decisions/ADR-039-human-mediated-batch-cataloguing-roundtrip.md`
- `docs/decisions/ADR-040-loopback-catalog-export-bridge.md`

## Current State

Owner browser evidence on 2026-09-02 exposed two product problems. First, opening Batch Catalog with two selected PDFs initially showed those two and then asynchronously replaced the dialog list with the wider Library PDF set (94 in the observed production state). Second, the normal export flow leaked a transport implementation detail into the product by requiring the Owner to download a private request and invoke Local Compute manually.

The active correction branch `fix/batch-catalog-selection-ux` now removes whole-Library hydration and keeps the visible/export candidate set fixed to the initial explicit selection. It also implements ADR-040: Core still creates the exact scoped in-memory capability, but the browser passes it directly to a dedicated loopback Local Compute bridge; that bridge runs the existing bounded native-text/selective-PaddleOCR exporter and returns only the evidence ZIP. The main reasoning worker remains unrelated and can stay disabled/paused. No backend route, schema, apply authority, source identity, or production data mutation is changed.

Repository changes are published on PR #11. Automated execution has not yet been observed for this PR because the repository has no workflow run attached to this feature-base PR; verification must not be claimed until the applicable tests/typechecks actually run.

## Completed

- Original ADR-039 implementation and first real local roundtrip.
- Owner-observed selection regression root cause isolated and code-corrected.
- Redundant Batch Catalog explanatory prose removed.
- ADR-040 accepted and ADR-039 transport consequence reconciled.
- Loopback bridge, exact CSP destination, service definition, login launcher, browser client, and focused tests implemented on the isolated fix branch.
- PR #11 opened and remains separate from production deployment.

## Remaining

- Run focused/new frontend tests plus frontend typecheck.
- Run focused/new Compute bridge tests plus Compute typecheck/build.
- Repair any verification failures.
- Final diff/security review and task checkpoint reconciliation.
- Only after a separate production gate: deploy the frontend/CSP/Compute release, install+enable the bridge service and login launcher on the Owner machine, then verify the normal signed-in browser path.

## Blockers

The current execution environment can update/read the private GitHub repository but does not expose the Owner's active Windows/WSL checkout and this PR has no automatic GitHub Actions run. Repository implementation is therefore ahead of executable verification in this session.

## Last Verification

Read-only source review confirmed the pre-fix root cause in `frontend/src/batch-catalog.tsx`: an effect called `listLibraryHoldingsSorted` and replaced the initial selection list with up to 500 Library PDFs. Read-only architecture review confirmed that `compute/src/catalog-batch-export.ts` already exports the strict request parser and bounded evidence-package function needed by the bridge, so the implementation does not duplicate extraction/OCR logic. Chrome's current Local Network Access model permits secure public pages to request loopback access with an explicit user permission; the CSP still needed the exact loopback `connect-src`, which is now present. No automated test/typecheck result is claimed yet for the new delta.

## Next Action

Run the new/focused Frontend and Compute verification on the exact PR head, repair failures, then complete read-only diff/security review. Do not merge or deploy production until that evidence is green and the separate production gate is authorized.
