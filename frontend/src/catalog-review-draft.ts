import type { CatalogApplyResult } from "./api.ts";

const MAX_BATCH_RESOURCES = 500;
const REVIEW_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_REVIEW_DRAFTS = 4;
const MAX_REVIEW_DRAFT_BYTES = 32 * 1024 * 1024;
const REVIEW_DRAFT_STORAGE_PREFIX = "academiccloud.catalog-review.v1:";

export interface CatalogReviewSession { readonly accountId: string; }

export interface CatalogReviewDraft {
  libraryId: string;
  savedAt: number;
  document: unknown;
  selectedResourceIds: string[];
  results: CatalogApplyResult[];
  bytes: number;
}

const reviewDraftStore = new WeakMap<object, Map<string, CatalogReviewDraft>>();
const encoder = new TextEncoder();

function draftBytes(draft: Pick<CatalogReviewDraft, "document" | "selectedResourceIds" | "results">): number {
  return encoder.encode(JSON.stringify({ document: draft.document,
    selectedResourceIds: draft.selectedResourceIds, results: draft.results })).byteLength;
}

function reviewDraftStorageKey(accountId: string): string {
  return `${REVIEW_DRAFT_STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

function readStoredReviewDrafts(accountId: string): Map<string, CatalogReviewDraft> {
  const drafts = new Map<string, CatalogReviewDraft>();
  try {
    const serialized = window.sessionStorage.getItem(reviewDraftStorageKey(accountId));
    if (!serialized || serialized.length > MAX_REVIEW_DRAFT_BYTES) return drafts;
    const entries: unknown = JSON.parse(serialized);
    if (!Array.isArray(entries) || entries.length > MAX_REVIEW_DRAFTS) return drafts;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const draft = entry as Partial<CatalogReviewDraft>;
      if (typeof draft.libraryId !== "string" || draft.libraryId.length > 128
        || typeof draft.savedAt !== "number" || !Number.isFinite(draft.savedAt)
        || !Array.isArray(draft.selectedResourceIds) || draft.selectedResourceIds.length > MAX_BATCH_RESOURCES
        || !draft.selectedResourceIds.every((id) => typeof id === "string" && id.length <= 128)
        || !Array.isArray(draft.results) || draft.results.length > MAX_BATCH_RESOURCES
        || draft.results.some((result) => !result || typeof result.resourceId !== "string" || typeof result.status !== "string")) continue;
      const bytes = draftBytes({ document: draft.document, selectedResourceIds: draft.selectedResourceIds, results: draft.results });
      if (bytes > MAX_REVIEW_DRAFT_BYTES || [...drafts.values()].reduce((total, previous) => total + previous.bytes, 0) + bytes > MAX_REVIEW_DRAFT_BYTES) continue;
      drafts.set(draft.libraryId, { libraryId: draft.libraryId, savedAt: draft.savedAt,
        document: draft.document, selectedResourceIds: draft.selectedResourceIds, results: draft.results, bytes });
    }
  } catch { /* Tab storage is optional; the in-memory draft remains available. */ }
  return drafts;
}

function persistReviewDrafts(session: CatalogReviewSession, drafts: Map<string, CatalogReviewDraft>): boolean {
  const key = reviewDraftStorageKey(session.accountId);
  try {
    if (drafts.size === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify([...drafts.values()]));
    return true;
  } catch {
    // A previous draft must not masquerade as the latest selection after a
    // quota failure. The in-memory copy still supports closing and reopening.
    try { window.sessionStorage.removeItem(key); } catch { /* Storage may be wholly unavailable. */ }
    return false;
  }
}

export function clearCatalogReviewDrafts(accountId: string): void {
  try { window.sessionStorage.removeItem(reviewDraftStorageKey(accountId)); } catch { /* Sign-out must still complete. */ }
}

function reviewDraftsFor(session: CatalogReviewSession): Map<string, CatalogReviewDraft> {
  let drafts = reviewDraftStore.get(session);
  if (!drafts) { drafts = readStoredReviewDrafts(session.accountId); reviewDraftStore.set(session, drafts); }
  return drafts;
}

function discardExpiredReviewDrafts(session: CatalogReviewSession, now = Date.now()): void {
  const drafts = reviewDraftsFor(session);
  let changed = false;
  for (const [libraryId, draft] of drafts) {
    if (now < draft.savedAt || now - draft.savedAt > REVIEW_DRAFT_TTL_MS) { drafts.delete(libraryId); changed = true; }
  }
  if (changed) persistReviewDrafts(session, drafts);
}

export function getReviewDraft(session: CatalogReviewSession | undefined, libraryId: string): CatalogReviewDraft | null {
  if (!session) return null;
  discardExpiredReviewDrafts(session);
  return reviewDraftsFor(session).get(libraryId) ?? null;
}

export function saveReviewDraft(session: CatalogReviewSession | undefined, draft: Omit<CatalogReviewDraft, "savedAt" | "bytes">): boolean {
  if (!session) return false;
  const bytes = draftBytes(draft);
  if (bytes > MAX_REVIEW_DRAFT_BYTES) return false;
  discardExpiredReviewDrafts(session);
  const drafts = reviewDraftsFor(session);
  drafts.set(draft.libraryId, { ...draft, savedAt: Date.now(), bytes });
  const totalBytes = () => [...drafts.values()].reduce((total, entry) => total + entry.bytes, 0);
  while (drafts.size > MAX_REVIEW_DRAFTS || totalBytes() > MAX_REVIEW_DRAFT_BYTES) {
    const oldest = [...drafts.values()].sort((a, b) => a.savedAt - b.savedAt)[0];
    if (!oldest) break;
    drafts.delete(oldest.libraryId);
  }
  return persistReviewDrafts(session, drafts);
}

export function clearReviewDraft(session: CatalogReviewSession | undefined, libraryId: string): void {
  if (!session) return;
  const drafts = reviewDraftsFor(session);
  drafts.delete(libraryId);
  persistReviewDrafts(session, drafts);
}
