# CONTRACT-CORE01 — Shared API / Error Contract Source

## Goal
Reduce frontend/backend contract drift as the domain grows.

## Scope
Choose the smallest repository-native shared contract mechanism for request/response schemas, enums and stable error codes. Options may include a small shared TypeScript package, JSON Schema or generated OpenAPI types, but framework replacement is not a goal.

Prioritize:

- Library holdings/search;
- metadata/suggestion contracts;
- upload/multipart state;
- stable error envelopes/codes;
- job/activity contracts when JOB-CORE01 exists.

## Boundaries
No broad API redesign, no public API commitment, no GraphQL migration, no new service boundary solely for contract sharing.

## Acceptance
A representative contract change cannot compile/test on one side while silently remaining stale on the other; runtime validation remains server-authoritative.
