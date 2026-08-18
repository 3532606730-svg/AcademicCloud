# AcademicCloud Task Board

**Last reconciled:** 2026-08-18

## Current Phase

**`RF-META01 — Canonical Metadata, Templates, and Minimal Authorities` is complete and independently green. The separately authorized `PROD-07A` production release is complete: production now runs exact release `2322169bc33415734d025010c465900c7fbc6bd9` at schema v18/history 001–018. The bounded continuation has reached STOP.**

The canonical shared-corpus authority, catalogue presentation/lifecycle repair, and canonical scholarly metadata destination are green: root `资料库` uses one established catalogue table, prefers canonical title with accepted-filename fallback, exposes ordinary `资料详情`, and retains the manager-only Library-domain recycle → Recycle list → CAS restore lifecycle without widening Member authority or exposing Library permanent delete.

Verification remains proportionate: changed-risk tests and focused independent review only. Do not replay PROD-05A/PROD-06A or broad historical production acceptance.

## Doing

None. The authorized objective is exhausted at STOP.

## Completed

| Task | Task card | Bounded result |
|---|---|---|
| PROD-07A | `tasks/done/PROD-07A.md` | Exact RF-META01 release deployed with migration 018, fresh verified rollback backup, and green focused production acceptance |

## Parked — Preserved, Not Authorized

| Order | Task | Task card | Bounded result |
|---:|---|---|---|
| 1 | RF-METASUGGEST01 | `tasks/ready/RF-METASUGGEST01.md` | Preserved only; not authorized in this run |
| 2 | RF-SEARCH01 | `tasks/ready/RF-SEARCH01.md` | Preserved only; not authorized in this run |
| 3 | STOP | — | Reached; independent Owner/ChatGPT review is now required |

Current execution boundary:

```text
L1-UX06   ← DONE
→ RF-META01   ← DONE
→ STOP   ← REACHED
```

RF-METASUGGEST01 and RF-SEARCH01 remain durable future scope and are not authorized for production. PROD-07A was a separate explicit Owner deployment window and did not include migration 019 or suggestion code.

## Bibliographic Suggestion Contract — Later in This Round

ADR-025 governs RF-METASUGGEST01 after L1-UX06 and RF-META01. For PDFs with a usable existing text layer, default discovery is first 15 pages + last 5 pages and may classify title/copyright/CIP/colophon/front-matter evidence. Every proposal is evidence-backed and requires authorization before becoming canonical. Pure image-only PDFs return `OCR deferred`; no OCR, AI extraction, external catalogue lookup or network enrichment is authorized.

## Product Model — Authoritative Short Form

```text
Member upload
  → 待审核
  → Owner approve
      → shared 资料库
      → all active authorized members can browse / preview / download

Shared resource
  + User A private Favorites / reading / tags / notes / annotations / citations
  + User B private Favorites / reading / tags / notes / annotations / citations
```

Ordinary Members do not gain shared folder/canonical-metadata/destructive corpus authority merely because they can contribute. `Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit tables remain internal concepts; normal UI uses `资料` / `资料详情`.

## Parked Pre-OCR Queue After This Round

After STOP, preserved later order begins:

```text
RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
→ RF-VIEWS01
→ RF-INTAKE01
→ RF-ANNOTATE01
→ RF-CITE01
→ RF-EVIDENCE01
→ RF-EXPORT01
→ RF-LIBRARY03
→ RF-LIBRARY04
→ RF-INTEGRITY01
→ RF-RECOVERY01
→ RF-AUTHMATRIX01
→ RF-DERIVED01
→ STOP BEFORE OCR
```

Starting any parked card requires a new Owner decision after this four-card review.

## Production State and Gate

Production is exact release `2322169bc33415734d025010c465900c7fbc6bd9` at schema v18/history 001–018. `PROD-05A`, `PROD-06A`, and `PROD-07A` are closed and must not be rerun.

PROD-07A release evidence:
- previous release `855b63c49f12f3375972774e7bc7385088b0495e`;
- migration 018 applied exactly once; rollback was not used;
- integrity `ok`, foreign-key violations zero, health/readiness green, loopback-only API, and autostart policy unchanged;
- corrected Linux x64 / Node 24 archive SHA-256 `fca93a9ce844b713d73a26d146655ecd9689555b7ddf94d18b8a3d6202ebdc17` and manifest SHA-256 `d6ec107a038fec7b53e6fcc2ebc0a7902d1991be252180a23fc9a0db407ea287`.

Current rollback pair:
- release `855b63c49f12f3375972774e7bc7385088b0495e`;
- schema-v17 backup `academiccloud-pre-prod07a-20260818T135032Z.sqlite`, SHA-256 `b7abaa36355c40c88ab539b2a59e32c20f130539146246c33bd66a6b21579911`;
- receipt SHA-256 `95ed7830d2dbb565c1b5222191bec63d920ba44635bf118e421c45e99a8092e8`;
- age ciphertext SHA-256 `1fc7de13aa27f64f42d5fb7625486b700c17312526d3949ce164549a2b74296f`, verified off-host at private backup commit `7c29aa6a9bc9171db5c235e427a580118220a6e0`.

No continuing authority exists for production mutation, visible test-data cleanup/permanent deletion, `PROD-03C2`, infrastructure changes, main merge, OCR/text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, or AI extraction.

## Completed Milestones Relevant to This Round

RF-AUDIT01, RF-OWNERSHIP01, RF-DOMAIN01, RF-LIBRARY01, RF-LIBRARY02, RF-SHAREDDEFAULT01, L2-CREDENTIALRESET01, L1-UX03/04/05/06, RF-META01, PROD-05A, PROD-06A, and PROD-07A are completed baselines. Final records: `tasks/done/RF-META01.md` and `tasks/done/PROD-07A.md`.

## Separate Parked Production Work

`PROD-03C2` permanent-delete confirmation remains a separate Owner gate. L1-UX06 may expose normal recoverable `移入回收站` behavior only; it must not bypass lifecycle semantics or permanently delete production data.
