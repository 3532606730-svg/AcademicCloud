# OPS-STORAGE-APP-REPAIR01 — Aliyun Runtime Contract Repair

## State
ACTIVE — source-only repair branch; production untouched.

## Trigger
`OPS-STORAGE-INCIDENT01` proved two separate facts after the exact RAM permission repair:

1. raw production `ListParts` is now authorized and returns HTTP 200;
2. the exact `ali-oss` runtime exposes XML scalar fields `isTruncated` and `nextPartNumberMarker` as strings (for example `"false"` and `"0"`), while AcademicCloud's client port declared already-normalized boolean/numeric fields.

The adapter therefore treated `"false"` as truthy and rejected `"0"` as a non-integer marker, turning a successful provider response into `storage_unavailable`.

## Goal
Repair the proven SDK/runtime contract mismatch at the narrowest correct boundary without changing product semantics, persistence, multipart lifecycle, provider permissions, credentials, schema, or production state.

## Authorized Scope
- independent branch `codex/storage-runtime-contract-repair-20260820` only;
- normalize only the production-proven raw `ali-oss` `ListParts` top-level XML scalars into the existing canonical `AliyunOssClientPort` shape before they reach `AliyunOssStorageAdapter`;
- leave multipart part-row validation in the existing storage adapter rather than introducing a second parser;
- add deterministic regression coverage for the exact production-observed `"false"` / `"0"` shape, truncated string markers, omitted non-truncated marker, and malformed scalar rejection;
- run focused/full repository tests, typechecks, and builds before any release decision;
- keep Metadata Suggestion diagnosis separate from this proven upload repair.

## Explicit Non-Goals / Forbidden
- no production deployment, restart, RAM/OSS mutation, credential change, migration, SQLite write, pending-upload mutation, manual complete/abort, or metadata mutation;
- no RF-SEARCH01 modification or rebuild;
- no broad storage-adapter refactor during the incident repair;
- no changes to upload part size, retry policy, CAS semantics, object keys, authorization scope, or Library authority;
- no speculative normalization of unrelated provider response fields;
- no Metadata Range patch until its current failing boundary is separately reproduced and proven.

## Repair Design
`client.ts` keeps the existing OSS SDK instance and existing behavior for `signatureUrlV4`, `head`, `get`, `delete`, multipart init/complete/abort, and browser custom-domain signing. Before the native client is exposed, only its `listParts` method is wrapped so the two XML scalar fields are normalized into the canonical port shape.

Accepted provider scalar representations are deliberately bounded:

- booleans: `true` / `false`, `1` / `0`, and their string equivalents;
- non-negative markers: safe integers or digit-only decimal strings;
- an omitted marker is allowed only for a non-truncated result and canonicalizes to `0`;
- a truncated result without a marker, malformed boolean, fractional marker, or non-array `parts` value fails closed;
- part rows continue through the pre-existing `AliyunOssStorageAdapter` validation unchanged.

## Current Implementation
- `94429d6` — isolate normalization to native `ListParts` while preserving the original SDK instance for every other method;
- `5466a2a` — regression coverage narrowed to the exact production-observed scalar mismatch and fail-closed cases.

## Verification Status
- isolated TypeScript strict compile of the exact changed client boundary with local module stubs: PASS;
- isolated runtime smoke with a fake SDK instance returning `{ isTruncated: "false", nextPartNumberMarker: "0" }`: PASS; wrapped `listParts` returns canonical `false` / `0` and other SDK methods remain on the same instance;
- repository-native tests/typecheck/build: PENDING (must pass before this branch is considered releasable);
- production touched: false.

## Next Action
Run repository-native focused/full verification on this exact branch. If green, independently review the diff and only then decide whether to build a release artifact. Do not deploy or alter production as part of this task without a separate explicit Owner gate.
