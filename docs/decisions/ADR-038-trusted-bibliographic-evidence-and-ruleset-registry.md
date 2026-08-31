# ADR-038 — Trusted Bibliographic Evidence Validation and Ruleset Registry

**Date:** 2026-08-28
**Status:** Accepted by Owner; v8/schema33 deployed and A passed; bounded v9/prompt-v6 sparse-output admission and B/C acceptance pending

## Context

Rulesets v4, v5, and v6 attempted to correct a real modern-monograph
misclassification by adding deterministic title and publication heuristics to
`authoritativeMaterialClass`. Three production attempts demonstrated that this
created a second semantic classifier whose finite title vocabulary and
whole-inspection edition markers cannot be the final material-class contract.

The same review found three adjacent correctness defects:

- the one-page path synthesized provenance for every populated canonical fact,
  even when Qwen supplied no field evidence row;
- an existing empty contributor profile with no human or AI contributor
  authority could never receive its first supported AI contributor; and
- migrations 029–031 rebuilt the immutable AI evidence table solely to extend
  its ruleset-version `CHECK`.

Production is exact Core/frontend and selected Compute
`fd97542ea37f0422d0ef6b7c9af9f68cf032b6b1` at schema/history 31. Core is
healthy. The main Local Compute worker remains `PAUSED`, disabled, and inactive.
No v6 final-product canary, NORMAL transition, forced-loss test, or corpus run
is authorized before this correction passes.

## Decision

### Qwen proposes; the trusted runtime validates

Ruleset `l1-intelligent-library01-v7` with prompt
`l1-intelligent-library01-prompt-v4` is a new generation. Ruleset v6 remains
immutable historical evidence and is not reinterpreted.

Qwen proposes `materialClass`, canonical facts, per-field evidence, and bounded
class-support signals. The trusted Compute runtime does not replace that
proposal with a second title classifier. It validates that:

- every cited page or embedded-metadata source is authority-eligible;
- every transient evidence excerpt occurs in that exact source;
- every populated fact value is supported by its cited excerpt; and
- the proposed class has the positive, page-bound support required for that
  class and no conflicting class support.

Transient excerpts are validation inputs only. They are stripped before the
callback and are not logged or persisted. Persisted field provenance retains
the exact source/page identity and evidence digest. A one-page inspection has
no relaxed path: missing field evidence never inherits the page identity or
overall confidence.

`primary_source_modern_edition` requires both positive primary/historical-work
support and positive modern editorial/translation/facsimile/reprint mediation
support. Publisher, publication date, ISBN, or person presence does not satisfy
either requirement. `traditional_book` likewise requires positive source-work
and traditional-artifact support. Modern analytical title words may be supplied
to Qwen as auxiliary context but are neither necessary nor sufficient and are
never a trusted-runtime override list.

Unsupported or conflicting class proposals become `unknown` with ambiguous
status. Unsupported optional facts are omitted during the bounded evidence
repair path; a repair may only remove facts or downgrade class to `unknown`,
never introduce or change a fact. Unsupported required title evidence or a
repair that still invents provenance fails the result closed.

The local llama.cpp transport uses its compatible generic `json_object` response
mode rather than the hosted-only nested JSON-Schema grammar. The trusted
runtime still performs the complete schema, evidence, class-support, and
authority validation before any callback can be persisted; transport mode does
not weaken the structured-output contract.

### Bounded v8 class-evidence transport correction

The first v7 production A attempt proved that the deeply nested fact result can
be validated and pruned safely, but the pinned 1.7B model can still confuse a
class-support signal with `materialClass`, cite a pages-array position instead
of the supplied page identity, or paraphrase rather than copy the requested
class excerpt. Those outputs correctly became `unknown`; changing their
interpretation under the already-persisted v7 identity would not be acceptable.

Ruleset `l1-intelligent-library01-v8` with prompt
`l1-intelligent-library01-prompt-v5` therefore retains the v7 fact pipeline and
adds one bounded Qwen class-evidence pass only when the validated fact result is
still `unknown`. The shallow llama.cpp JSON Schema constrains Qwen to a
controlled class, its independent confidence, and up to four IDs selected from
runtime-supplied evidence candidates. Candidates are script-neutral bounded
chunks of the already selected usable pages. Qwen still makes the semantic
proposal; the trusted runtime only resolves IDs to exact page text, applies the
existing positive-signal requirements, rejects title/metadata-only support,
and retains `unknown` on missing or conflicting support. It does not add a
title-keyword classifier.

For a supported modern scholarly class, the trusted projection also removes
source-edition facts that are structurally incompatible with that class. This
prevents a bare value coincidence from promoting a historical-source field;
all retained facts still require their own value-bound evidence. A model-supplied
exact fact excerpt may repair an incorrect pages-array ordinal only by resolving
to the actual eligible selected page containing that same excerpt. The runtime
never invents the excerpt or fact and class evidence never receives this repair.

Schema v33 is an append-only registry admission for exact v8/prompt-v5. It does
not rebuild, update, delete, or reinterpret the immutable evidence table or the
v1–v7 registry history. Unknown identities remain foreign-key rejected.

### Bounded v9 sparse-output correction

The real B retry on exact `6b68d1a…` proved that the v8 input/context correction
removed the former prompt overflow but did not remove completion truncation.
The pinned model treated the full nested fact JSON Schema embedded in the
generic-JSON prompt as an exhaustive checklist and emitted unsupported null or
empty canonical paths plus corresponding evidence rows until the 8,192-token
completion limit. The worker failed closed, persisted only the failure, and
promoted no bibliographic fact.

Ruleset `l1-intelligent-library01-v9` with prompt
`l1-intelligent-library01-prompt-v6` changes only that model-facing guidance.
It supplies a compact sparse shape contract and explicitly defines controlled
field names as vocabulary rather than fields to populate. Unsupported, absent,
null, and empty facts and their evidence rows must be omitted. The complete
trusted canonical parser, per-field value/excerpt validation, class-support
requirements, human authority, current-attempt callback checks, and persisted
structured-output digest remain unchanged and authoritative.

Schema v34 is one append-only registry admission for exact v9/prompt-v6. It
does not rebuild or reinterpret the evidence table or alter immutable v1–v8
history; unregistered contract/ruleset/prompt combinations remain foreign-key
rejected.

### Human authority and first contributor enrichment

Human contributor authority always preserves the current contributor set.
Otherwise an existing empty, unowned contributor set may be filled by the
current valid AI run. Existing AI-owned contributors may be replaced only
through the same exact current-run authority/provenance path. No AI run may
overwrite a human-authoritative contributor.

### Schema v32 ruleset admission

Schema v32 performs the final evidence-table rebuild for version admission. It
adds an append-only bibliographic ruleset registry keyed by exact contract,
ruleset, and prompt identity; registers immutable v1–v7 history; and replaces
the enumerated ruleset/prompt `CHECK` with a foreign key to that registry.

The AI evidence table retains its structured-output digest, contract,
immutability, retention, owner-domain, record, file, suggestion-run, confidence,
and auto-apply checks. Unknown or unregistered identities fail closed. Future
rulesets require an explicit append-only registry admission and application
contract update, but no longer require rebuilding historical AI evidence.
Registry rows cannot be updated or deleted. Migration verification must prove
v1–v6 byte-for-byte logical preservation, v7 admission, unknown rejection,
SQLite integrity, foreign keys, backup/restore, and zero redeploy migrations.

### Final production acceptance

After exact release, encrypted off-host schema31 backup, and schema32 cutover,
three isolated real canaries must cover a modern scholarly monograph, a
historical/primary-source modern edition, and an OCR-needed multilingual
resource. Each must prove positive class evidence, value-supported field
provenance, no hallucinated fact promotion, display rules, human authority,
and callback/current-attempt/API/UI consistency.

Forced-loss/lease recovery follows those canaries. On PASS, the exact main
Local Compute release transitions to `NORMAL`, systemd enabled and active,
whole-job concurrency one, with demand-driven runtime lifecycle retained.

Technical or one-shot canaries do not establish product usability. Final
acceptance requires the signed-in Owner to use only the normal production
website for both a new PDF upload/admission and an existing-resource AI retry.
The ordinary product must create and display queued work, the normal worker
must claim and run it, callback must persist, and refresh/relogin plus
failure/retry UX must retain correct state. No Codex-created job, SSH trigger,
database write, internal endpoint, or one-shot worker may satisfy that gate.
The completed UI must show structured bibliography and provenance, preserve
the original object key, and project the authorized display/download name:
modern scholarship uses `author + title`, historical sources use
`title + supported version`, and unknown omits guesses.

This zero-additional-cost architecture depends on the Owner Local Compute
machine being online. When it is offline, jobs remain safely queued and resume
when the worker returns; the product must not represent that state as immediate
cloud execution.

## Consequences

- Ruleset v4–v6 production failures remain historical evidence, not patterns
  to extend with per-book regular expressions.
- A valid page reference proves only source identity until the exact fact value
  and class-support contract also pass.
- Sparse, ambiguous output is preferred to invented bibliographic completeness.
- The one final schema32 migration removes the evidence-table rebuild loop
  while keeping new ruleset admission explicit and fail-closed.
- NORMAL and full-corpus work remain blocked until the architecture and three
  isolated canaries pass; project acceptance remains blocked until the normal
  Owner browser-only path also passes.

## Relationship to earlier decisions

- ADR-032 human authority and canonical CAS rules remain unchanged.
- ADR-033 remains authoritative for the exact Paddle/Qwen runtime and privacy
  boundary; this ADR replaces its insufficient page-only fact validation.
- ADR-034 display projection remains unchanged.
- ADR-036 admission/current-generation semantics remain unchanged.
- ADR-037 remains authoritative for Local Pull, leases, offline queueing, and
  runtime lifecycle; this ADR adds the mandatory final normal-browser gate.
