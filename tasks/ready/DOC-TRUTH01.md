# DOC-TRUTH01 — Repository Current-Truth Hygiene

## Goal
Prevent repository-as-memory from becoming contradictory as releases/tasks evolve.

## Baseline
`CURRENT_STATE.json` now carries compact current pointers. ADRs and task cards preserve historical reasoning/evidence.

## Scope
- define which fields belong only in `CURRENT_STATE.json` (declared production release/schema/migration head, active incident/task, frozen artifact pointer);
- remove/reduce duplicated mutable production facts in README/PROJECT_SPEC/explanatory docs;
- generate or validate human-facing status summaries from current state where practical;
- add a CI/repository check that rejects contradictory production/schema/task declarations in designated authoritative files;
- retain exact historical SHAs in completed release/task evidence without trying to rewrite history.

## Important Rule
Do not require a commit to contain its own SHA. Final synchronized repository HEAD is external evidence; artifact source and production release identities are explicit separate concepts.

## Non-goals
No product/runtime change, no migration, no production contact, no deletion of historical task evidence.

## Acceptance
A stale README/PROJECT_SPEC production pointer can no longer silently override current operational truth, and agents have one documented order for resolving current vs historical state.
