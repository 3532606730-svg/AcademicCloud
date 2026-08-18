# AcademicCloud Task Board

**Last reconciled:** 2026-08-19

## Current Phase

**`RF-META01 — Canonical Metadata, Templates, and Minimal Authorities` remains complete and independently green. The separately authorized `PROD-07B` hotfix is complete: production now runs exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at unchanged schema v18/history 001–018. The bounded continuation has reached STOP.**

The canonical shared-corpus authority, catalogue presentation/lifecycle repair, and canonical scholarly metadata destination remain green. PROD-07B aligns ordinary root account rows and canonical Library holdings as sibling catalogue rows, restores the ordinary account-folder `移入回收站` action through its direct lifecycle endpoint, and exposes explicit destructive confirmation plus global-Owner-only permanent deletion for recycled account resources and eligible recycled Library holdings. Library membership/manager/contributor/uploader authority alone never grants permanent deletion.

Verification remains proportionate: changed-risk tests and focused independent review only. Do not replay PROD-05A/PROD-06A or broad historical production acceptance.

## Doing

None. The authorized objective is exhausted at STOP.

## Completed

| Task | Task card | Bounded result |
|---|---|---|
| PROD-07B | `tasks/done/PROD-07B.md` | Exact 18-file hotfix deployed without migration; fresh v18 rollback backup, exclusive Library purge proof/revalidation, and non-destructive production smoke are recorded |
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

RF-METASUGGEST01 and RF-SEARCH01 remain durable future scope and are not authorized for production. PROD-07B was a separate explicit Owner hotfix/deployment window and did not include migration 019, suggestion code, OCR, search, or RAG.

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

Production is exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at schema v18/history 001–018. `PROD-05A`, `PROD-06A`, `PROD-07A`, and `PROD-07B` are closed and must not be rerun.

PROD-07B release evidence:
- previous release `2322169bc33415734d025010c465900c7fbc6bd9`;
- no migration command ran; schema/history/checksums remain exact v18 / 001–018; rollback was not used;
- integrity `ok`, foreign-key violations zero, safe aggregates unchanged, health/readiness green, loopback-only API, autostart disabled, and protected systemd/Nginx/logrotate hashes unchanged;
- Linux x64 / Node 24 archive SHA-256 `ad084372db6e128cc4a7ff2beae4dbbe7c8b1077c0bb07db926d69bacfbcbca6` and manifest SHA-256 `7fe3b0608dddf7431af9cc3bb0ff4a0de40401c2257b2a6eadd4e76eb69287e8`;
- exact public asset hashes match the release; forged unauthenticated calls to account-folder, account-file, and Library permanent-delete routes returned 401; no real production resource was recycled or purged.

Current rollback pair:
- release `2322169bc33415734d025010c465900c7fbc6bd9`;
- schema-v18 backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite`, 667,648 bytes, SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`;
- receipt SHA-256 `aebe203e88ad047e97f765aa0ccbad441dabe6cf193a7fe9bc10125391d55e67`;
- age ciphertext SHA-256 `2a5c0decfab2133db708c027416e5f558dfc08ed25e5c7fe11a9b5d29eb0f7ec`, verified off-host at private backup commit `49e72e5`.

No continuing authority exists for production mutation, visible test-data cleanup/permanent deletion, `PROD-03C2`, infrastructure changes, main merge, OCR/text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, or AI extraction.

## Completed Milestones Relevant to This Round

RF-AUDIT01, RF-OWNERSHIP01, RF-DOMAIN01, RF-LIBRARY01, RF-LIBRARY02, RF-SHAREDDEFAULT01, L2-CREDENTIALRESET01, L1-UX03/04/05/06, RF-META01, PROD-05A, PROD-06A, PROD-07A, and PROD-07B are completed baselines. Final records: `tasks/done/RF-META01.md`, `tasks/done/PROD-07A.md`, and `tasks/done/PROD-07B.md`.

## Separate Parked Production Work

`PROD-03C2` destructive disposable-object confirmation/cleanup remains a separate Owner gate. PROD-07B deployed the controls and server lifecycle but did not recycle or permanently delete a real production resource. Any future destructive confirmation must use a dedicated disposable object and must not be inferred from this completed deployment.
