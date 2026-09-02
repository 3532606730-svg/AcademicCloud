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
- Give the catalog bridge its own catalog-only release namespace, verifier, release selector, service lifecycle, and rollback checks rather than extending the reasoning-worker release package.
- Add the exact CSP loopback destination, Windows login launcher, bounded browser response consumption, cancellation propagation, and focused regression/security tests needed by that path.

## Non-goals

- No OpenAI/DeepSeek/ChatGPT API integration.
- No automatic external review or automatic results apply.
- No database/schema migration.
- No canonical metadata, object-key, source-byte, or production-resource mutation as part of this implementation.
- No activation, repointing, or packaging requirement for the main Local Pull reasoning worker.
- No llama.cpp/NuExtract dependency in the catalog-only bridge release.
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
- [x] Batch Catalog dialog implementation is fixed to the initially selected PDFs; background whole-Library hydration is removed and the V1 500-resource bound is enforced defensively in the dialog.
- [x] Redundant operator-facing description/export-hint paragraphs are removed while explicit apply confirmation remains.
- [x] Normal export implementation no longer downloads the private export-request JSON; it sends it directly to the loopback bridge and downloads only `academiccloud-catalog-batch-*.zip`.
- [x] Bridge binds only `127.0.0.1`, uses exact Origin allowlisting, exact JSON media-type validation, normal CORS preflight plus a dedicated request header, no credentials, no-store responses, bounded request/response sizes, and concurrency one.
- [x] Browser consumes error and ZIP bodies with explicit byte bounds instead of trusting `Content-Length`; abort/unmount cancellation propagates to the loopback request/exporter.
- [x] Bridge reuses the existing strict export-request parser and bounded evidence-package implementation; no reasoning worker dependency is introduced.
- [x] Production CSP source template permits only exact `http://127.0.0.1:43117` for this new browser connection.
- [x] Catalog bridge release packaging is isolated under `catalog-releases/<commit>` and `catalog-current`, includes only Node/Paddle plus the bridge compute package, and does not require llama.cpp or NuExtract.
- [x] Catalog activation verifies the main worker active/enabled state and `/current` target are unchanged and rolls back only bridge state on failure.
- [x] Windows-login WSL launcher input is restricted to a conservative ASCII distribution-name alphabet before generating a `.cmd` file.
- [x] Focused frontend and Compute regression tests exist for the main selection/handoff/CORS/concurrency/error boundaries; further audit-edge coverage was added where the repository write path permitted it.
- [ ] Execute the applicable frontend/Compute typecheck, builds, shell syntax checks, and focused tests in an environment with the repository dependencies available; repair any failures before merge/deploy.
- [ ] Exercise catalog-only release assembly/verifier/activation against the Owner WSL runtime and confirm the main AI worker state remains unchanged.
- [ ] Verify Chrome signed-in production-origin → WSL loopback behavior, including Local Network Access permission, cancellation, and a real evidence ZIP.
- [ ] Perform final read-only diff/security review after executable verification and reconcile this card with the verified checkpoint.

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
- `scripts/local-compute/assemble-catalog-bridge-release.sh`
- `scripts/local-compute/verify-catalog-bridge-release.sh`
- `scripts/local-compute/activate-catalog-bridge-release.sh`
- `scripts/local-compute/install-catalog-bridge-autostart.ps1`
- `docs/decisions/ADR-039-human-mediated-batch-catalog-roundtrip.md`
- `docs/decisions/ADR-040-loopback-catalog-export-bridge.md`

## Current State

Owner browser evidence on 2026-09-02 exposed two product problems. First, opening Batch Catalog with two selected PDFs initially showed those two and then asynchronously replaced the dialog list with the wider Library PDF set (94 in the observed production state). Second, the normal export flow leaked a transport implementation detail into the product by requiring the Owner to download a private request and invoke Local Compute manually.

The active correction branch `fix/batch-catalog-selection-ux` removes whole-Library hydration and keeps the visible/export candidate set fixed to the initial explicit selection. It implements ADR-040: Core still creates the exact scoped in-memory capability, but the browser passes it directly to a dedicated loopback Local Compute bridge; that bridge runs the existing bounded native-text/selective-PaddleOCR exporter and returns only the evidence ZIP.

A second whole-path audit found that the first bridge draft still extended the main Local Compute release package/verifier, which would have made bridge deployment depend on llama.cpp/NuExtract despite the runtime code not using them. That coupling has been removed: the existing main worker assembler/verifier were restored to their base contents, while the bridge now has a separate catalog-only assembler/verifier and `catalog-current` selector. The audit also tightened exact JSON media-type handling, browser/bridge disconnect cancellation, bounded streaming of loopback bodies, the defensive 500-item UI bound, and Windows launcher input validation.

No backend route, schema, apply authority, source identity, production data mutation, or main reasoning-worker state is changed by these repository edits. Repository changes remain on PR #11. Automated execution has not yet been observed for this PR, so verification must not be claimed until the applicable tests/typechecks/release scripts actually run.

## Completed

- Original ADR-039 implementation and first real local roundtrip.
- Owner-observed selection regression root cause isolated and code-corrected.
- Redundant Batch Catalog explanatory prose removed.
- ADR-040 accepted and ADR-039 transport consequence reconciled.
- Loopback bridge, exact CSP destination, service definition, login launcher, browser client, and focused tests implemented on the isolated fix branch.
- Whole-path source audit completed across browser → Core → loopback bridge → PDF/OCR → ZIP → results preview → apply, plus deployment/release boundaries.
- Main reasoning-worker release assembler/verifier restored; catalog-only release assembler/verifier/activation path added.
- PR #11 remains separate from production deployment.

## Remaining

- Run frontend typecheck and focused/full frontend tests.
- Run Compute typecheck/build and focused/full Compute tests.
- Run shell/PowerShell syntax or parser checks for the deployment scripts.
- Build and verify one exact catalog-only release in Owner WSL, then activate it and prove `/current` plus main-worker active/enabled states are unchanged.
- Run one real Chrome production-origin loopback export and cancel-path smoke test.
- Repair any verification failures.
- Final diff/security review and task checkpoint reconciliation.
- Only after a separate production gate: deploy the frontend/CSP changes and install+enable the bridge service/login launcher on the Owner machine.

## Blockers

The current connector can update/read the private GitHub repository but does not expose the Owner's active Windows/WSL checkout, and this PR currently has no automatic GitHub Actions run. Repository source hardening is therefore ahead of executable verification in this session.

## Last Verification

Read-only source review confirmed the pre-fix UI root cause, the existing Core capability/source-authorization fail-closed checks, the existing bounded evidence extractor, and the unchanged preview/apply authority boundary. The second audit additionally caught and removed an unintended packaging dependency on the paused reasoning stack and tightened loopback cancellation/body bounds. No automated test, build, shell execution, WSL service activation, or real-browser Local Network Access result is claimed yet for the new delta.

## Next Action

Run the new/focused Frontend and Compute verification plus catalog-only release assembly/verification on the exact PR head. Repair any failures, then perform the real Windows/WSL/Chrome smoke test and final diff/security review. Do not merge or deploy production until those gates are green and the separate production gate is authorized.
