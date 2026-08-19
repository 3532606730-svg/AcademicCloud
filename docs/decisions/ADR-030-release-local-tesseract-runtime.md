# ADR-030 — Release-Local Tesseract Runtime

**Date:** 2026-08-19
**Status:** Accepted by Owner for the final combined release

## Context

RF-FRONTMATTEROCR01 requires exact Tesseract 5.5.3 and `tessdata_fast`
4.1.0 models `eng`, `chi_sim`, and `chi_tra`. The production host cannot be
assumed to contain that engine or those models, and the approved deployment
must not install packages, replace host libraries, download models at runtime,
or add a resident OCR service.

The official Tesseract 5.5.3 release does not publish an upstream Linux x86_64
binary suitable for the AcademicCloud artifact. The Owner therefore authorized
the controlled artifact pipeline to build the exact official released source
tag and package the verified runtime release-locally.

## Decision

- The artifact pipeline builds exact Tesseract tag `5.5.3`, resolves and
  records its signed tag/commit identity, and verifies a pinned source-archive
  SHA-256 before compilation. It never follows `latest` or an unpinned binary.
- Compilation occurs only in the fixed Linux x86_64 CI builder. The evidence
  records the runner image identity, compiler/toolchain, CMake, and relevant
  build-dependency versions. Build dependencies are ephemeral CI inputs and
  are never installed on production.
- The release contains a bounded local runtime under
  `runtime/tesseract/{bin,lib,tessdata,licenses}`. The pipeline derives the
  minimum non-baseline dynamic dependency closure with `readelf`/`ldd`, fails
  on unresolved or build-workspace paths, and records SHA-256 for every binary,
  shared library, model, and notice.
- Exact official `tessdata_fast` tag `4.1.0` provides only `eng`, `chi_sim`, and
  `chi_tra`; every model source identity and SHA-256 is pinned and verified
  during the build. The application performs no runtime download.
- AcademicCloud resolves the release-local executable and model directory
  explicitly. Any required library path is scoped only to the OCR child
  process. No global `PATH`, `LD_LIBRARY_PATH`, `TESSDATA_PREFIX`, host package,
  service, or environment policy is changed.
- Extracted-artifact verification repeats exact engine version, ELF64 x86-64,
  dynamic-closure resolution, model discovery/hash checks, a tiny deterministic
  synthetic OCR probe, PDF.js/canvas, Argon2id, better-sqlite3, and compiled
  application acceptance. The independent fresh runner repeats those checks
  without network access after download/extraction.
- The manifest and runtime evidence record source/build/runtime/model identities
  and hashes. Applicable upstream license/copyright notices ship with the
  runtime.

## Consequences

- OCR is self-contained in the immutable application release and fails closed
  if any runtime component differs or is unavailable.
- Production deployment remains an artifact unpack/select operation; it does
  not gain package-manager, compiler, host-library, daemon, cloud-OCR, paid
  service, or infrastructure-policy authority.
- The previous application plus the fresh pre-final schema-v19 backup remains
  the inseparable rollback pair after migrations 020–021 begin.

## Alternatives Rejected

- **Assume a host Tesseract:** version/model provenance and reproducibility are
  unknown.
- **Install packages on production:** expands the host mutation and rollback
  boundary beyond the authorized release.
- **Download models at runtime:** creates a network/supply-chain dependency in
  the application path.
- **Copy arbitrary builder libraries:** obscures the dependency closure and can
  ship unrelated or incompatible binaries.
- **Cloud OCR or resident daemon:** expands authority, cost, privacy, and fault
  domains beyond the bounded local adapter.
