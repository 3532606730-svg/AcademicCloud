import type { DocumentSourceDescriptor } from "../drive/document-source.js";

export type ReadingStatus = "queued" | "reading" | "finished" | null;
export interface ReadingState {
  resourceId: string;
  status: ReadingStatus;
  important: boolean;
  toCite: boolean;
  revision: number;
  updatedAt: string;
}
export interface ResearchCollection {
  id: string;
  name: string;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}
export interface CollectionItem { collectionId: string; resourceId: string; createdAt: string }
export interface PageNote extends DocumentSourceDescriptor {
  id: string;
  physicalPage: number;
  locator: string | null;
  body: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
/** Current authorized presentation only; unavailable resources are omitted. */
export interface WorkspaceResource {
  resourceId: string;
  title: string;
  mediaType: string | null;
  libraryId: string | null;
  sourceId: string;
}
export interface WorkspacePage<T> { items: T[]; nextBeforeId: string | null }
export type WorkspaceErrorCode = "not_found" | "invalid_input" | "concurrent_change" | "limit_exceeded";
export class WorkspaceError extends Error {
  constructor(readonly code: WorkspaceErrorCode) { super(code); this.name = "WorkspaceError"; }
}

export interface WorkspaceRepository {
  resolveResources(accountId: string, resourceIds: string[]): WorkspaceResource[];
  getReading(accountId: string, resourceId: string): ReadingState | null;
  saveReading(accountId: string, state: ReadingState, expectedRevision: number): boolean;
  listReading(accountId: string, beforeId: string | null, limit: number, activeOnly?: boolean): ReadingState[];
  listCollections(accountId: string): ResearchCollection[];
  getCollection(accountId: string, id: string): ResearchCollection | null;
  createCollection(accountId: string, collection: ResearchCollection): void;
  saveCollection(accountId: string, collection: ResearchCollection, expectedRevision: number): boolean;
  listCollectionItems(accountId: string, collectionId: string, beforeId: string | null, limit: number): CollectionItem[];
  listResourceCollections(accountId: string, resourceId: string): string[];
  setCollectionItem(accountId: string, collectionId: string, resourceId: string, included: boolean, now: string): boolean;
  getNote(accountId: string, id: string): PageNote | null;
  listNotes(accountId: string, filter: { resourceId?: string; deleted?: boolean; beforeId: string | null; limit: number }): PageNote[];
  createNote(accountId: string, note: PageNote): void;
  saveNote(accountId: string, note: PageNote, expectedRevision: number): boolean;
}
