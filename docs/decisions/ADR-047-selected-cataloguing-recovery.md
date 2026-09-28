# ADR-047 — Selected cataloguing recovery

Date: 2026-09-28
Status: Accepted and locally implemented/verified within reliable intake; not deployed.

## Decision

Add an explicit Library selection recovery path using the existing durable job
queue. A manager first previews at most100 selected active holdings, then submits
only missing jobs or safe infrastructure failures. This is an extension of existing
metadata generation/retry, not a historical automatic sweep or ZIP processing queue.

Both preview and submission authorize every selected ID against the current active
account and Library manager membership before any job write. An inaccessible ID
rejects the entire request without partial dispatch or per-ID existence disclosure.
Non-PDF items are reported unsupported. Active and successful jobs, including older
processing versions, are preserved. Existing canonical metadata, bibliography,
human authorities and extracted/accepted/reviewable suggestions are left for review.
This evidence guard spans all runs; a newer filename-only run cannot hide an older
review result and make that resource eligible for batch recovery.

The only automatic batch retry eligibility is `compute_dispatch_failed` or
`compute_source_unavailable`, with unchanged source/processing key and the original
requester. Timeouts, model/validation/PDF/limit errors and authorization/source
changes require individual diagnosis through existing details. A retry does not
rebind an old job to another actor. An exhausted100-attempt job is not retryable,
so it cannot roll back other eligible selections through the database attempt cap.
This policy does not change deliberate individual
generation/retry or any callback, human-authority, evidence or model contract.

Preview returns the current Catalog source fingerprint and latest job ID/attempt
count. Submission compares that exact snapshot inside one SQLite transaction before
creating or retrying a job. A lost-response replay returns stale after the original
attempt changes, even if that attempt has already failed again. No new idempotency
store or migration is required. New jobs use existing backfill priority100; retried
jobs retain their priority. Provider dispatch and optional filename enrichment remain
in the existing reconciler outside this transaction. The response means queued,
not that processing or bibliography is complete. Jobs remain discoverable in the
existing Library/Activity after refresh, including when Local Compute is offline.

The dialog freezes its preview and submits once. Unknown HTTP outcomes offer a
read-only status refresh; refresh never retries. Closing or reloading does not cancel
persisted jobs. A new deliberate recovery requires a fresh preview. Internal parser,
path, credential or transport details are not presented in user-facing errors.

## Known source exclusions

The existing exact internal-fixture exclusions are reused. Six previously diagnosed
`SOURCE_REPLACEMENT_REQUIRED` sources are excluded by resource ID plus exact
checksum algorithm/value and byte size, independently of mutable filename/revision.
Two of these sources had no job, so error-code filtering alone is insufficient.
Different replacement bytes no longer match this damaged-source rule. These guards
neither modify nor delete sources and are evaluated only after authorization.

Evidence: the September1 batch request has88 IDs and the corrected result82; the
six-item difference matches the retained verification exclusion set and all six
September23 inventory byte tuples. Existing task evidence is in
`tasks/doing/ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG.md`. Retained local evidence
under `D:/AcademicCloudCompute/staging/full-library-batch-catalog/run-20260901-batch-001/`
has SHA256 request73fd15af93e78343c119f09bc805bd16a3aaa5110560006ba20c0642bc26b332,
corrected result6465a23a89bd156f9fe6d5578c6075761e715f8996ac4716e9cbc19544c6b081,
verifier43774b29c6530be945c8520d375617ff2cb7b48a76e24ab9ae9f27f707bf90e5.
No filenames, signed source access or document text enter the exclusion registry.

## Compatibility and remaining work

No schema migration, dependency, service, model, source mutation or added cost.
Previous compatible runtimes can read the same queued jobs; rollback removes only
the new UI/API entry point. Existing deadlines/leases/CAS and permission checks
remain effective. Stateless preview expires by live source/job comparison rather
than time. Main merge and production deployment are not performed by this decision;
the coordinated release and signed-in acceptance gate remains open.

This closes a bounded historical job-recovery gap; it does not complete persistent
per-page/ZIP recovery, independently adjudicated bibliographic quality, immutable
sourceId orchestration or full-corpus acceptance. Known damaged bytes still need
replacement. No actual corpus execution is part of local implementation/testing.

## Verification

September28 local verification passed:59 backend recovery/service/HTTP tests,
backend types, frontend51 component/API/i18n tests plus initial5 and final27 scoped
App/mobile tests (overlapping runs, not a full-suite total), frontend types/build
and independent source review. Historical evidence shadowing and exhausted100
attempts received regressions; the evidence query uses existing Record indexes.

Synthetic normal-login browser checks at1440x1000 and390x844 passed selection,
preview, one submission and Activity recovery after reload. Exactly two POSTs
created two jobs and retried two existing attempts; active/success/invalid rows,
human metadata and private notes stayed unchanged. No worker or source retrieval
was involved. Browser testing found and fixed the mobile Activity covering the
last checkbox by reserving measured dock height; ordinary pointer selection now
passes with Activity both expanded and collapsed, with no horizontal overflow.
Evidence: `output/vnext/recovery-browser-20260928/verification.json`; parent reviewed
the final mobile screenshots. Local browser/service were closed after verification.

Check input bounds, manager/Member and cross-Library nondisclosure, all-or-nothing
authorization and persistence rollback, missing/retry/skip outcomes, historical
success and human-data preservation, source/job snapshot races and replay after
quick failure, original requester, damaged-source exclusions and replacement,
durable recovery, and unknown-outcome UI behavior. Validate the ordinary signed-in
selection path with synthetic local data and no running inference worker.
