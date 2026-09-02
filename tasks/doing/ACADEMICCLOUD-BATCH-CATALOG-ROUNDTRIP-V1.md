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
- [x] Batch Catalog dialog is fixed to the initially selected PDFs; background whole-Library hydration is removed and the V1 500-resource bound is enforced defensively in the dialog.
- [x] Redundant operator-facing description/export-hint paragraphs are removed while explicit apply confirmation remains.
- [x] Normal export no longer downloads the private export-request JSON; it sends it directly to the loopback bridge and downloads only `academiccloud-catalog-batch-*.zip`.
- [x] Bridge binds only `127.0.0.1`, uses exact Origin allowlisting, exact JSON media-type validation, normal CORS preflight plus a dedicated request header, no credentials, no-store responses, bounded request/response sizes, and concurrency one.
- [x] Browser consumes error and ZIP bodies with explicit byte bounds instead of trusting `Content-Length`; abort/close/unmount cancellation propagates to the loopback request/exporter.
- [x] Active local export can be cancelled by closing the dialog; import/apply remain protected from closing while their mutation-sensitive operation is busy.
- [x] Bridge reuses the existing strict export-request parser and bounded evidence-package implementation; no reasoning worker dependency is introduced.
- [x] Production CSP source template permits only exact `http://127.0.0.1:43117` for this browser connection.
- [x] Catalog bridge release packaging is isolated under `catalog-releases/<commit>` and `catalog-current`, includes only Node/Paddle plus the bridge compute package, and does not require llama.cpp or NuExtract.
- [x] Catalog activation verifies the main worker active/enabled state and `/current` target are unchanged, rejects an unexpected pre-existing `catalog-current` target before mutation, and rolls back only bridge state on failure.
- [x] Windows-login WSL launcher input is restricted to a conservative ASCII distribution-name alphabet before generating a `.cmd` file.
- [x] Focused frontend and Compute regression tests cover selection scope, handoff, response bounds, cancellation, CORS/origin/header/media-type rules, concurrency, and symlinked release-selector entrypoint behavior.
- [x] Exact PR-head CI executes contracts typecheck/test/build, Compute typecheck/build plus catalog exporter/bridge tests, full Frontend typecheck/test/build, and Bash/PowerShell deployment-script syntax checks.
- [x] Final repository diff/security review completed after executable CI; no main-worker release files, backend route, migration, or production mutation entered the final PR delta.
- [x] Catalog-only release assembly/verifier/activation passed in Owner WSL `AcademicCloudComputeV2`; bridge remained stable with zero restarts, Windows localhost forwarding reached it, and the main AI worker state remained unchanged.
- [ ] Verify Chrome signed-in production-origin → WSL loopback behavior, including Local Network Access permission, cancellation, and a real evidence ZIP.

## Relevant ADRs

- ADR-031 — heavy document execution remains outside Core.
- ADR-037 — Local Compute isolation remains authoritative.
- ADR-039 — batch catalogue evidence/results/authority contract remains authoritative except for the manual transport step.
- ADR-040 — loopback catalog export bridge supersedes the manual private-request file/CLI handoff only.

## Relevant Modules / Files

- `.github/workflows/catalog-roundtrip-ci.yml`
- `frontend/src/batch-catalog.tsx`
- `frontend/src/batch-catalog.test.tsx`
- `frontend/src/batch-catalog-boundaries.test.tsx`
- `frontend/src/catalog-local-bridge.ts`
- `frontend/src/catalog-local-bridge.test.ts`
- `compute/src/catalog-batch-export.ts`
- `compute/src/catalog-bridge.ts`
- `compute/src/catalog-bridge-entrypoint.ts`
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

Owner browser evidence on 2026-09-02 exposed two product problems: opening Batch Catalog with two selected PDFs expanded to 94 Library PDFs after background hydration, and the normal export workflow exposed an unnecessary private-request/CLI handoff.

PR #11 on `fix/batch-catalog-selection-ux` fixes the selection scope, removes the redundant copy, and implements ADR-040. Core still creates the exact scoped in-memory capability; the browser passes it directly to a dedicated loopback Local Compute bridge; the bridge runs the existing bounded native-text/selective-PaddleOCR exporter and returns only the evidence ZIP.

A whole-path audit removed an unintended draft dependency on the paused reasoning stack. The main worker assembler/verifier are unchanged from the base branch. The bridge has a separate catalog-only assembler/verifier, `catalog-releases/<commit>` namespace, `catalog-current` selector, service, activation rollback, and pre-mutation drift guard. Browser and bridge cancellation/body/media-type boundaries were tightened, and local export can now be cancelled by closing the dialog without leaving OCR running in the background.

Owner WSL validation exposed and then closed two deployment-specific defects before production: activation originally probed health too early after `Type=simple` startup, and the bridge direct-entrypoint check failed when systemd invoked it through the `catalog-current` symlink. The activation now waits for bounded health readiness and emits service/journal diagnostics on real exit; the bridge entrypoint resolves symlinks before deciding whether to execute `main()`, with a dedicated CI regression test.

Catalog roundtrip CI run `33652399464` passed against implementation head `b5fd7e3ef85f54d88ea9d5feeaa50c3f6ee13fbd`, including the symlink entrypoint regression. The Owner then assembled and verified the exact catalog-only release for that commit in `AcademicCloudComputeV2`. Activation passed with `LISTENER=127.0.0.1:43117`, health `{"status":"ok","service":"academiccloud-catalog-bridge","version":1}`, `BRIDGE_RESTARTS=0`, and `catalog-current` pointing to the immutable release. The main Local Pull worker remained `inactive`/`not-found`, and its `/current` selector remained absent according to the guarded activation snapshot. Windows itself reached the WSL bridge at `127.0.0.1:43117` with HTTP 200, and the exact production-origin CORS preflight returned HTTP 204 with `Access-Control-Allow-Origin: https://cloud.ajtlab.top`.

An earlier attempt to run the entire pre-existing Compute suite exposed the unchanged `pdf-text.test.ts` timing case `range-backed document loading uses the aggregate request budget while later parser work stays bounded` failing twice on hosted runners with its existing 20 ms page-text budget. Neither `pdf-text.ts` nor that test is changed by this PR. The catalog CI therefore keeps full Compute typecheck/build but runs the affected catalog exporter/bridge tests instead of silently weakening or editing the unrelated timing test.

No backend route, schema, apply authority, source identity, production data mutation, or main reasoning-worker state is changed by these repository edits. Production remains untouched.

## Completed

- Original ADR-039 implementation and first real local roundtrip.
- Owner-observed selection regression root cause isolated and corrected.
- Redundant Batch Catalog explanatory prose removed.
- ADR-040 accepted and ADR-039 transport consequence reconciled.
- Loopback bridge, exact CSP destination, service definition, login launcher, browser client, and focused tests implemented.
- Whole-path source/security audit completed across browser → Core → loopback bridge → PDF/OCR → ZIP → results preview → apply, including release/deployment boundaries.
- Main reasoning-worker release assembler/verifier restored to base; independent catalog-only release path added.
- Browser streaming bounds, cancellation propagation, close-to-cancel UX, media-type handling, 500-item bound, launcher validation, and release-state fail-closed checks completed.
- Catalog roundtrip CI added and latest implementation head verified green.
- Owner WSL release assembly/verifier/activation, WSL health, Windows localhost forwarding, and exact-origin CORS preflight passed on the immutable `b5fd7e3ef85f54d88ea9d5feeaa50c3f6ee13fbd` release.

## Remaining

- Install/verify the Windows-login launcher so the bridge is restored automatically after Windows/WSL restart.
- Run one real Chrome production-origin loopback export and cancel-path smoke test.
- Only after a separate production gate: merge/deploy the frontend/CSP changes and enable the production-facing workflow; no production Apply is part of this gate.

## Blockers

The remaining validation requires the signed-in Owner Chrome session and the production frontend/CSP update; the connected tooling does not expose the Owner's Chrome session. No repository, WSL runtime, or network blocker remains for the catalog bridge itself.

## Last Verification

`Catalog roundtrip CI` run `33652399464` completed successfully against `b5fd7e3ef85f54d88ea9d5feeaa50c3f6ee13fbd`. Owner-machine validation then completed successfully: catalog-only assembly PASS, verifier PASS, guarded activation PASS, stable listener `127.0.0.1:43117`, health PASS, zero bridge restarts, main worker state unchanged, Windows localhost forwarding HTTP 200, and exact production-origin CORS preflight HTTP 204.

## Next Action

Install the idempotent Windows-login launcher for `AcademicCloudComputeV2`. After a separate production deployment authorization, deploy the verified frontend/CSP delta to `cloud.ajtlab.top`, then run one signed-in Chrome evidence-ZIP export plus cancellation smoke test. Do not Apply real catalog results during this smoke test.
