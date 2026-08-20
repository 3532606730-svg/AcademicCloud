# OPS-METADATA-MEMORY01-DIAGNOSIS — Metadata Suggestion Core Stall

## State
DIAGNOSIS COMPLETE — follow-on development boundary implemented by ARCH-COMPUTE01;
production remediation remains separately gated.

## Trigger

Production `POST /api/libraries/:libraryId/holdings/:fileId/metadata/suggestions`
entered the heavy PDF/front-matter OCR path and the entire backend stopped making
timely progress.

## Proven first boundary

The Node process remained alive with no restart, OOM, or OOM-kill. The cgroup was
already above `MemoryHigh=320MiB` at approximately 328 MiB under a 384 MiB hard
limit. PDF page access/rendering, native canvas/PNG allocation, and Tesseract in
the same request process pushed the cgroup into sustained memory reclaim, which
blocked the Node event loop and therefore stalled unrelated Core routes.

## Classification

```text
TRIGGER=POST metadata suggestions heavy OCR/extraction path
MEMORY_GROWTH_SOURCE=PDF.js/native page rendering plus canvas/PNG/OCR working set in Core
FIRST_LARGE_ALLOCATION=bounded PDF page/rendering runtime and native canvas backing memory before/through OCR
ROOT_CAUSE=single-document memory spike against an insufficient Core runtime limit, expressed as cgroup reclaim/event-loop starvation
OOM=false
OOM_KILL=false
NODE_RESTART=false
REPEATING_LEAK_ESTABLISHED=false
CONCURRENCY_AMPLIFICATION=latent under the old in-process design
CODE_CHANGE_REQUIRED=true
```

Historical storage-provider failures remain separate: the earlier
`UserDisableError` Metadata Suggestion records occurred during the disabled OSS
window. This later incident reached the local compute path and is not evidence of
a renewed RAM/OSS permission defect.

## Resolution boundary

ADR-031 and OCR-METADATA-GHA01 move only the heavy execution into one clean
Compute process/job and leave Core authority/lightweight rules/canonical writes
unchanged. No production memory, service, storage, database, or release mutation
was performed during diagnosis or development.
