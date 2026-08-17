# RF-STATS01 — Storage Statistics and Quota Foundations

## Task ID
RF-STATS01 — Storage Statistics and Quota Foundations

## Goal
Expose trustworthy account-scoped storage/recycle/pending statistics and a future-safe quota policy boundary without enforcing an unapproved quota or adding a monitoring service.

## Scope
Add bounded aggregate queries and authenticated API/UI for account-Drive logical file count, active known bytes, pending/recycle/purging states, and clearly labeled unknown-size data. Owner may see separately classified system-level aggregates needed for capacity governance, while Members see only their own account-domain aggregates. Define an ownership-domain-extensible quota-policy interface/config boundary and status semantics without hard-coding future Library quotas; quota enforcement is not included unless this card is explicitly amended. No migration is expected.

## Non-goals
- No object-store listing, billing claim, production capacity probe, resident metrics stack, per-research-action analytics, or quota enforcement.
- No inference that database metadata equals provider billing or physical disk usage.
- No production contact, dependency addition, or historical migration edit.

## Acceptance Criteria
- Statistics are calculated from authoritative server-side metadata with explicit state inclusion/exclusion and unknown-size handling; arithmetic is overflow-safe and deterministic.
- Member results include only that account. Owner aggregate governance results do not expose filenames, private overlay activity, research interests, or account-specific content beyond the approved aggregate contract.
- Cross-account identifiers, owner IDs, roles, filters, and quota values supplied by clients are rejected or ignored in favor of server authority.
- Concurrent state transitions yield transactionally coherent snapshots or explicitly documented bounded eventual semantics; no double counting across recycle/purge states.
- Quota status distinguishes configured/unconfigured/unknown and cannot falsely claim enforcement.
- Backend/frontend tests cover Owner/Member, disabled account, cross-account injection, null sizes, large integers, every file state, concurrent transitions, empty/error/loading, responsive/mobile accessibility.
- Migration/dependency delta is zero; full gates and independent review pass.
- Independent review focuses on privacy leakage through aggregates, false precision, arithmetic errors, unbounded queries, and accidental enforcement/data loss.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- current storage/lifecycle ADRs
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- `backend/src/drive/`, `backend/src/persistence/sqlite/`
- new bounded statistics service/repository modules
- `backend/src/platform/application.ts`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- backend/frontend/compiled acceptance tests

## Current State
Blocked by `RF-DOMAIN01` and queue order. File metadata contains logical sizes and lifecycle states, but there is no account-domain statistics or future-safe quota-policy surface.

## Completed
- Existing stored-file state and ownership metadata provide the bounded source model.
- RF-PLAN01 assigned statistics/quota foundations exactly once to this card.

## Remaining
- define aggregate/state semantics and quota-policy unknown states;
- implement repository/service/API/UI without provider contact;
- test privacy, arithmetic, concurrency, and responsive behavior;
- independently review and checkpoint.

## Blockers
Real provider/billing access, paid monitoring, production capacity mutation, or enforcing a quota that can reject/delete user data requires a separate Owner decision.

## Last Verification
2026-08-17 code inspection confirmed `StoredFile` carries owner, lifecycle, nullable size, and revision; no statistics repository or quota policy currently exists.

## Next Action
Start after `RF-LINEAGE01` in the queue, with `RF-OWNERSHIP01` and `RF-DOMAIN01` green; specify exact aggregate definitions and implement a read-only, account-domain-authorized vertical slice.
