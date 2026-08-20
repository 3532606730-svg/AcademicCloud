# OPS-DEPENDENCY01 — Core Dependency Health & Owner System Status

## Goal
Make core dependency failure visible before the Owner discovers it by clicking random product actions.

## Scope
Add bounded Owner-only status/readiness evidence for:

- API/process identity;
- SQLite integrity/schema/migration-head summary where cheap/safe;
- OSS adapter availability;
- one bounded provider stat capability and, where appropriate, tiny Range capability;
- multipart control-plane capability without creating/aborting real uploads;
- backup freshness/last-known-good receipt;
- disk/memory/swap/cgroup/OOM state;
- TLS/certificate horizon where already available.

Separate cheap process liveness from deeper dependency readiness. Expensive or provider-mutating probes must never sit on a high-frequency public health endpoint.

## UX
Owner-only `系统状态` should show stable categories such as 正常 / 警告 / 不可用 / 未验证 plus last successful check, without secrets/provider payloads.

## Non-goals
No paid monitoring SaaS, no automatic repair, no credential rotation, no provider mutation, no broad inventory scan, no user-private content exposure.

## Acceptance
A simulated/provider-fixture outage can leave process liveness green while dependency status clearly reports storage unavailable; operators can distinguish API/database/storage/runtime failures without exposing secrets.
