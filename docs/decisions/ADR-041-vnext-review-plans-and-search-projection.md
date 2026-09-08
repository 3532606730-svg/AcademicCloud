# ADR-041 — Explicit Catalog review plans and bounded Library search

Status: Accepted, implementation in progress (2026-09-06).

## Context

The Owner accepted the 360 review and authorized full vNext remediation, integration, deployment, migrations and live Catalog Apply. Preview previously hid replacement semantics, Apply reparsed/replanned the batch for each selection, and search hydrated the complete Library before selecting a page. These decisions correct existing product paths within the modular Core, SQLite, storage adapter and isolated Compute architecture.

## Decision

Catalog results v2 expresses bibliographic changes as an allowlisted `set` object and an explicit `clear` array. Absent fields preserve current values. Null and empty replacement arrays are rejected; clearing required identity fields is forbidden. Legacy v1 remains readable with conservative preserve semantics and a visible warning. Unchanged contributor identities and authority links are retained. A type change incompatible with existing subtype facts is explicitly unsupported and preserves those facts.

Preview exposes every writable field with current/proposed values, operation, authority and evidence state. Invalid contracts fail before planning; stale identities and collisions block items. Conflicting human values, explicit clears and unverified external evidence each require explicit acknowledgement. External disposition and confidence never confer canonical authority; confidence is an uncalibrated self-rating. Successful Apply is a human decision and records human field authority. UNKNOWN cannot be selected until an explicit corrected proposal exists.

Migration 036 adds a contributor-collection authority marker independently of surviving contributor rows. Explicit list replacement, removal, ordering and clearing remain human decisions after later AI retries, including an intentionally empty list. Catalog records this marker only for an explicitly supplied list operation and shows authority-only adoption in Preview. The complete normal bibliography editor treats its submitted list as a human decision. The existing restore-AI control can explicitly release that collection decision. Individual contributor identities and authority links remain separately preserved. Historical migration 023 and its scoped contributor-authority constraint remain unchanged.

Core stores immutable actor/Library-bound plans for 30 minutes, with four plans and a conservative 32 MiB aggregate memory budget. Preview returns an opaque 256-bit plan ID and per-item version. Apply references that plan, revalidates each selected resource in its own transaction and applies exactly the represented changes under existing CAS and filename collision checks. Completed items replay their prior result for retries; expired, evicted or restarted plans require Preview again. Plans do not survive restart and are not a durable job system. No private research overlay enters this path.

Transport limits are route-specific: results/Preview 8 MiB, Apply 256 KiB with at most 500 selections, export request 128 KiB. Core and nginx agree. No full results document is duplicated in Apply. Plan memory overflow is an actionable request to use a smaller batch, not an implicit global limit increase.

Library search uses a rebuildable SQLite projection of canonical bibliographic facts and authority aliases. Transactional dirty markers follow source edits; authoritative holdings and current membership determine visibility. SQL selects, ranks, sorts and pages candidates before bounded hydration. Matching, normalization, Unicode ordering and cursor identity remain equivalent to the prior implementation. Migration 035 adds derived state only; database initialization migrates, validates immutable runtime admissions, and builds the projection. Production startup asserts readiness rather than silently repairing deployment state.

Useful UI context is stored in account-scoped session storage/history state. Research query text is not put in URLs. Resource titles open reading; management and evidence remain secondary, with explicit review before catalog changes.

Reproducible installation uses npm 11.19.1 and strict versioned lifecycle-script permissions. SQLite uses its packaged prebuild; other required native build scripts remain explicitly allowed. The same policy applies to CI and assembled release packages.

Release qualification may also run on the existing Owner Ubuntu 24.04/WSL machine when GitHub account authorization or hosted execution is unavailable. An exact committed source archive, non-root Node 24 build, complete Linux checks, reproducible production packaging and extracted-runtime verification remain mandatory. This avoids added cost and keeps build work off the small production host. Local qualification does not claim remote CI success or waive source publication/main synchronization; those states remain explicit until the external service permits them.

## Consequences and verification

Core keeps bounded ephemeral review state and SQLite derived search tables, with no new resident services or paid infrastructure. Tests must cover full Preview/Apply persistence equivalence, human conflicts/clear/preserve, plan isolation/expiry/retry, per-item rollback and linear revalidation; SQL search equivalence and 100/1,000/10,000 benchmarks; fresh initialization/readiness; transport boundaries; and UI journeys. Production-relevant findings remain open until deployed and verified through normal signed-in workflows.

Original source bytes, identities, provenance, authorization and private overlays are unchanged by display-name/bibliographic correction. Migration history and ruleset admissions remain immutable. Reverting application behavior does not require deleting projection tables or original data; a forward release can rebuild derived search state. A previous release that rejects migrations 035–036 is not a directly compatible rollback target. Preserve collection decisions and use the existing release recovery mechanism with a schema-compatible release.
