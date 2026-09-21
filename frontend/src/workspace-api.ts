export interface WorkspaceResource { resourceId: string; title: string; mediaType: string | null; libraryId: string | null; sourceId: string }
export interface ReadingState { resourceId: string; status: "queued" | "reading" | "finished" | null; important: boolean; toCite: boolean; revision: number; updatedAt: string }
export interface ResearchCollection { id: string; name: string; revision: number; archivedAt: string | null; createdAt: string; updatedAt: string; itemCount: number }
export interface CollectionItem { collectionId: string; resourceId: string; createdAt: string }
export interface PageNote { id: string; resourceId: string; sourceId: string; physicalPage: number; locator: string | null; body: string; revision: number; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface WorkspacePage<T> { items: T[]; nextBeforeId: string | null; resources: WorkspaceResource[] }
export interface ResourceWorkspace { resource: WorkspaceResource; reading: ReadingState | null; collectionIds: string[] }
export interface WorkspaceApi {
  collections(signal?: AbortSignal): Promise<ResearchCollection[]>;
  createCollection(name: string): Promise<ResearchCollection>;
  updateCollection(collection: ResearchCollection, name: string, archived: boolean): Promise<ResearchCollection>;
  collectionItems(id: string, beforeId?: string, signal?: AbortSignal): Promise<WorkspacePage<CollectionItem>>;
  setCollectionItem(collection: ResearchCollection, resourceId: string, included: boolean): Promise<ResearchCollection>;
  resource(resourceId: string, signal?: AbortSignal): Promise<ResourceWorkspace>;
  saveReading(resourceId: string, state: Pick<ReadingState, "status" | "important" | "toCite" | "revision">): Promise<ReadingState>;
  reading(beforeId?: string, signal?: AbortSignal): Promise<WorkspacePage<ReadingState>>;
  notes(filter: { resourceId?: string; deleted?: boolean; beforeId?: string }, signal?: AbortSignal): Promise<WorkspacePage<PageNote>>;
  note(id: string, signal?: AbortSignal): Promise<{ note: PageNote; resource: WorkspaceResource | null }>;
  createNote(input: Pick<PageNote, "resourceId" | "sourceId" | "physicalPage" | "locator" | "body">): Promise<PageNote>;
  updateNote(note: PageNote, input: Pick<PageNote, "body" | "locator"> & { deleted: boolean }): Promise<PageNote>;
}
export function createWorkspaceApi(request: <T>(path: string, init?: RequestInit) => Promise<T>): WorkspaceApi {
  const root = "/api/workspace";
  const enc = encodeURIComponent;
  const body = <T>(path: string, method: string, input: unknown) => request<T>(root + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const get = <T>(path: string, signal?: AbortSignal) => request<T>(root + path, signal ? { signal } : {});
  const query = (input: Record<string, string | boolean | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) if (value !== undefined) params.set(key, String(value));
    return params.size ? `?${params}` : "";
  };
  return {
    collections: (signal) => get<{ collections: ResearchCollection[] }>("/collections", signal).then((r) => r.collections),
    createCollection: (name) => body<{ collection: ResearchCollection }>("/collections", "POST", { name }).then((r) => r.collection),
    updateCollection: (c, name, archived) => body<{ collection: ResearchCollection }>(`/collections/${enc(c.id)}`, "PATCH", { name, archived, revision: c.revision }).then((r) => r.collection),
    collectionItems: (id, beforeId, signal) => get(`/collections/${enc(id)}/items${query({ beforeId })}`, signal),
    setCollectionItem: (collection, resourceId, included) => body<{ collection: ResearchCollection }>(`/collections/${enc(collection.id)}/items/${enc(resourceId)}`, "PUT", { included, revision: collection.revision }).then((r) => r.collection),
    resource: (resourceId, signal) => get(`/resources/${enc(resourceId)}`, signal),
    saveReading: (resourceId, state) => body<{ reading: ReadingState }>(`/resources/${enc(resourceId)}/reading`, "PUT", state).then((r) => r.reading),
    reading: (beforeId, signal) => get(`/reading${query({ beforeId })}`, signal),
    notes: (filter, signal) => get(`/notes${query(filter)}`, signal),
    note: (id, signal) => get(`/notes/${enc(id)}`, signal),
    createNote: (input) => body<{ note: PageNote }>("/notes", "POST", input).then((r) => r.note),
    updateNote: (note, input) => body<{ note: PageNote }>(`/notes/${enc(note.id)}`, "PATCH", { ...input, revision: note.revision }).then((r) => r.note),
  };
}
