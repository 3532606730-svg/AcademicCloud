# Catalog field quality and abstention evaluation

**Date:** 2026-09-23
**Scope:** fixed offline samples and already-recorded review evidence only.
This document does not claim production factual accuracy and does not change the
v11 result contract, validator, authority rules, or Compute rollout state.

## What this evaluation can prove

The existing qualification harness has a small, explicit gold boundary:

- `compute/scripts/nuextract-offline-qualification.ts` defines four cases with
  expected title and material class: `modern-a`, `historical-b1`,
  `historical-b2`, and `insufficient-unknown`.
- `compute/scripts/intelligent-qualification.ts` adds the broader seven-case
  structural set used by the pinned runtime qualification.
- Existing result files record validator outcome, status/class, evidence hashes,
  provenance, unsupported-fact promotion, field count, and elapsed time.

These checks are useful for contract safety and abstention boundaries. They do
not provide a field-by-field truth set for every contributor, edition,
publisher, date, identifier, or source page. A field accuracy percentage would
therefore be invented and is intentionally absent.

## Fixed-sample outcome summary

| Sample group | Count | Observed result | What it establishes |
|---|---:|---|---|
| Synthetic modern/historical/insufficient set | 4 | 4/4 validator passes; expected title/class checks pass; statuses remain reviewable (`ambiguous` in the pinned NuExtract result); evidence hashes and provenance pass | The known title/class boundary and fail-closed evidence shape work on the fixed examples |
| Pinned immutable A/B/B/unknown qualification | 4 | 4/4; field counts 9 / 10 / 10 / 4; unsupported-fact promotion 0; evidence and provenance pass | Runtime/parser/validator compatibility, not factual precision |
| Real C1/C2 sources | 2 | 2/2 validator passes; `UNKNOWN`/`ambiguous`; field counts 10 / 19; OCR used; no canonical promotion | Real-source evidence can be retained without automatic authority |
| Normal-upload Mongolia Today smoke | 1 | 1/1 validator pass; `UNKNOWN`/`ambiguous`; 19 evidence fields; no canonical/source mutation | Normal upload/recovery and abstention safety, not bibliography correctness |
| Historical 82-item human Catalog review | 82 | 1 reviewed correction, 78 UNKNOWN, 3 internal exclusions; one selected item applied after 12 review operations | Human review cost and authority separation for a real batch |

The C and normal-upload rows are deliberately classified as contract/smoke
evidence. `UNKNOWN` is a safe product state, not a claim that every extracted
field is correct.

## Field-level support/error/omission boundary

For a future factual-quality run, every expected field must be adjudicated by an
independent reviewer against the source page and assigned one of:

| Label | Meaning | Product consequence |
|---|---|---|
| `supported` | Proposed value matches the source and has bounded evidence | May remain a review candidate; human authority is still required |
| `wrong` | Proposed value conflicts with the source | Must be rejected; count as an error |
| `omitted` | Source supports a field that the result did not return | Count as an omission; never fill by inference |
| `abstained` | Result leaves the value absent or class UNKNOWN because evidence is insufficient/conflicting | Safe incomplete result; review may add an explicit human correction |
| `not_applicable` | The field does not apply to the material or source | Exclude from the denominator with a recorded reason |

The report must publish denominators and per-field counts for support, wrong,
omitted, abstained and not-applicable, plus class-confusion and reviewer action
count/time. Without those labels, retain `UNKNOWN` and do not promote a model
or a ruleset based on format/runtime qualification alone.

## Current abstention and error evidence

- The validator rejects unsupported field shapes and retains only facts with
  exact bounded evidence. Current qualification files record zero unsupported
  fact promotion and zero fake provenance.
- An earlier real-source failure exposed thirteen contributor rows with no
  source-proven role label. The repaired adapter omits roles that cannot be
  proven rather than manufacturing labels; the result remains UNKNOWN and
  passes closed-world validation.
- Earlier Qwen structured-output failures and schema-invalid results are kept as
  historical boundary evidence. They do not justify weakening the validator or
  treating a later NuExtract pass as a precision result.

## Decision

Keep automatic canonical promotion disabled for `UNKNOWN` and `ambiguous`
results. Keep field authority and contributor-list authority human-mediated.
The next quality gate is a small independently adjudicated field set, not a
larger unlabelled corpus run. Whole-corpus processing is not required to close
this evaluation and must not be used to manufacture accuracy statistics.

## Evidence sources

- `compute/scripts/nuextract-offline-qualification.ts`
- `compute/scripts/intelligent-qualification.ts`
- `output/vnext/compute-qualification/immutable-3c86437/result.json`
- `output/vnext/compute-qualification/normal-upload-unsupported-role-omission/result.json`
- `output/vnext/live-catalog-persistence-verification.json`
- `docs/decisions/ADR-038-trusted-bibliographic-evidence-and-ruleset-registry.md`
