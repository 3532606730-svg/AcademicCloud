# OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## State
ACTIVE — source-only repair branch; production untouched.

## Trigger
`OPS-STORAGE-INCIDENT01` proved two separate facts after the exact RAM permission repair:

1. raw production `ListParts` is now authorized and returns HTTP 200;
2. the exact `ali-oss` runtime exposes XML scalar fields such as `isTruncated` and `nextPartNumberMarker` as strings (for example `"false"` and `"0"`), while AcademicCloud's client port declared already-normalized boolean/numeric fields.

The adapter therefore treated `"false"` as truthy and rejected `"0"` as a non-integer marker, turning a successful provider response into `storage_unavailable`.

## Goal
Repair the proven SDK/runtime contract mismatch at the Aliyun client boundary without changing product semantics, persistence, multipart lifecycle, provider permissions, credentials, schema, or production state.

## Authorized Scope
- independent branch `codex/storage-runtime-contract-repair-20260820` only;
- normalize raw `ali-oss` `ListParts` XML scalar values into the existing canonical `AliyunOssClientPort` shape before they reach `AliyunOssStorageAdapter`;
- normalize and validate multipart part number/size fields defensively when supplied as XML strings;
- add deterministic regression coverage for the exact production-observed `"false"` / `"0"` shape and malformed scalar rejection;
- run focused/full repository tests, typechecks, and builds before any release decision;
- keep Metadata Suggestion diagnosis separate from this proven upload repair.

## Explicit Non-Goals / Forbidden
- no production deployment, restart, RAM/OSS mutation, credential change, migration, SQLite write, pending-upload mutation, manual complete/abort, or metadata mutation;
- no RF-SEARCH01 modification or rebuild;
- no broad storage-adapter refactor during the incident repair;
- no changes to upload part size, retry policy, CAS semantics, object keys, authorization scope, or Library authority;
- no Metadata Range patch until its current failing boundary is separately reproduced and proven.

## Repair Design
The raw SDK object is no longer returned directly as the canonical client port. `client.ts` adapts the SDK methods and normalizes `ListParts` before returning the provider-neutral shape used by the storage adapter.

Accepted provider scalar representations are deliberately bounded:

- booleans: `true` / `false`, `1` / `0`, and their string equivalents;
- non-negative integers: safe integers or digit-only decimal strings;
- multipart part numbers remain 1–10,000 and sizes remain positive;
- malformed or ambiguous provider values fail closed with stable internal errors.

## Current Implementation
- `ff208c3` — normalize ali-oss multipart response scalars at the SDK boundary;
- `93f627f` — add exact production-shape regression tests for string scalars.

## Verification Status
- isolated TypeScript strict compile of the changed client boundary with local stubs: PASS;
- repository-native tests/typecheck/build: PENDING (must pass before this branch is considered releasable);
- production touched: false.

## Next Action
Run repository-native focused/full verification on this exact branch. If green, independently review the diff and only then decide whether to build a release artifact. Do not deploy or alter production as part of this task without a separate explicit Owner gate.
