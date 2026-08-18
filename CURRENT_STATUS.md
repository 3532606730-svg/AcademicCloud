# AcademicCloud Current Status

**Last updated:** 2026-08-19

## Current Phase

**PROD-08R — v19 Production Artifact Runtime Repair and Release Resume is active. The first v19 artifact workflow failed closed after deterministic archive creation because the extracted compiled API did not become healthy; the archive was never uploaded, independent verification was skipped, and production was not mutated. Repair is limited to proving and correcting the extracted Linux x64 / Node 24 runtime boundary. Production must not be contacted until the exact repaired artifact passes both production workflow jobs.**

The governing product rule remains ADR-022:

> **Academic resources are shared by default after Owner admission; personal research activity is private by default.**

ADR-028 records the permanent-delete authority and data-safety boundary: only the authenticated global `owner` may permanently delete eligible recycled account or Library resources; account and Library lifecycles remain domain-specific; Library object/reference/lineage exclusivity is proved again inside the destructive transaction immediately before lifecycle mutation; any changed/shared state fails closed with storage and lineage untouched. Repository support does not authorize a real production purge.

## Latest Completed Epic

`tasks/done/L1-UX07.md`

Completed result:

- semantically forward-ported the PROD-07B account and Library purge lifecycles into v19 while preserving migration 019, RF-METASUGGEST01, and the newer metadata/suggestion behavior;
- replaced scope-insensitive catalogue selection with explicit `account_folder`, `account_file`, `library_holding`, and `library_recycle_holding` resources whose selection keys and lifecycle routing cannot collide;
- added real Library catalogue/Recycle checkboxes and capability-derived toolbar actions without granting Library holdings account move/rename/recycle authority;
- made Favorites contextual and account-private: Members retain Favorite capability, Add/Remove are mutually exclusive, writes touch only missing/present relations, and Library Favorites retain canonical title plus Library Preview/Download routes;
- preserved `canonicalTitle` with original/display filename fallback across catalogue, Favorites, Preview, and Library Recycle;
- routed one selected account folder through the established direct folder recycle lifecycle and made mixed-domain restore/permanent-delete routing domain-correct;
- made sequential irreversible deletion reporting truthful about partial completion and surviving selections;
- suppressed only `production-e2e:e73af1945d52:root-folder` (`prod03c2-e2e-e73af1945d52`) from ordinary product projections;
- changed future production acceptance so its exact run-owned root is recycled, permanently deleted through the public versioned account-folder API, and verified absent only after all acceptance gates pass;
- corrected the historical PROD-07B manifest SHA transcription while preserving deployed artifact/release identity;
- did not contact, deploy to, or mutate production.

## Current Execution Boundary

```text
Failed artifact run 32168164654   ← FAILED CLOSED BEFORE UPLOAD / PRODUCTION
→ PROD-08R bounded diagnostics and exact Linux runtime repair   ← ACTIVE
→ complete two-job immutable artifact verification
→ only then revalidate and resume the already-authorized v19 production deployment
→ STOP
```

RF-META01 and RF-METASUGGEST01 remain complete. RF-METASUGGEST01 remains undeployed. RF-FRONTMATTEROCR01, RF-SEARCH01, whole-document extraction, full-text search, semantic retrieval, RAG, and the remaining Pre-OCR queue remain parked.

## Production Truth

Production remains:

- exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`;
- previous release `2322169bc33415734d025010c465900c7fbc6bd9`;
- schema/history v18 / migrations 001–018 with exact checksums;
- PROD-07A migration 018 complete and PROD-07B bounded hotfix complete;
- rollback not used;
- integrity `ok`, foreign-key violations zero, health/readiness green, and API loopback-only at the PROD-07B checkpoint;
- service autostart disabled and the recorded files-domain CSP, historical-OOM-log, and start-limit policy findings unchanged;
- no migration 019, RF-METASUGGEST01, or L1-UX07 deployment.

The current rollback pair is exact prior release `2322169bc33415734d025010c465900c7fbc6bd9` plus fresh schema-v18 backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite` (SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`). Its age ciphertext SHA-256 is `2a5c0decfab2133db708c027416e5f558dfc08ed25e5c7fe11a9b5d29eb0f7ec`, verified in private off-host backup commit `49e72e5`.

Production remains on the last confirmed `bc578863…` until PROD-08R produces a completely green immutable artifact and a fresh live preflight proves production truth unchanged. L1-UX07 is development-only until that gated deployment succeeds.

## Development Truth

- branch `codex/project-memory-reconcile-20260817` is the single authoritative development line;
- schema/history remains v19 / migrations 001–019; no migration 020 exists;
- RF-META01 and RF-METASUGGEST01 are complete and independently green;
- RF-METASUGGEST01 and migration 019 are not deployed;
- PROD-07B product behavior is forward-ported without importing deployment-only artifact mechanics;
- L1-UX07 is the current development checkpoint and no task remains Doing.

## Safety Boundaries

This checkpoint does not authorize:

- production contact, mutation, deployment, cleanup, or real permanent deletion / `PROD-03C2` confirmation;
- direct production SQLite or OSS mutation;
- main merge;
- reboot/autostart, DNS/TLS/Nginx/systemd/firewall/certificate or infrastructure-policy repair;
- credentials or paid infrastructure changes;
- RF-FRONTMATTEROCR01, RF-SEARCH01, OCR execution, whole-document extraction, full-text indexing/search, embeddings, semantic retrieval, or RAG;
- external metadata/catalogue services, ISBN APIs, web search, or AI/LLM extraction.

Any later production release or destructive confirmation remains a separate Owner gate.

## Verification Policy

L1-UX07 changed-risk evidence consists of the full backend and frontend suites, focused account/Library lifecycle and projection tests within those suites, acceptance-tool tests, backend/frontend typechecks, production builds, final diff review, and `git diff --check`. Do not replay broad historical production acceptance or contact production.

## Next Action

Make the extracted startup failure safely observable, reproduce it in the exact Linux x64 / Node 24 artifact workflow, implement only the proven minimum runtime repair, and require both artifact workflow jobs green before any production contact. Do not start OCR/search/RAG, migration 020, infrastructure repair, main merge, or unrelated work.
