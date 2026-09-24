import { randomUUID } from "node:crypto";
import type { Persistence } from "../persistence/contracts.js";
import { WorkspaceError, type PageNote, type ReadingState, type ReaderProgress, type TextHighlight, type ResearchCollection,
  type WorkspaceRepository, type WorkspacePage, type WorkspaceResource } from "./model.js";

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value)) throw new WorkspaceError("invalid_input");
  return value;
}
function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new WorkspaceError("invalid_input");
  return value;
}
function text(value: string, max: number, multiline = false): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u : /[\x00-\x1f\x7f]/u).test(normalized)) {
    throw new WorkspaceError("invalid_input");
  }
  return normalized;
}
function paging(beforeId: string | undefined, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkspaceError("invalid_input");
  return { beforeId: beforeId === undefined ? null : identifier(beforeId), limit };
}
function page<T>(items: T[], limit: number, id: (item: T) => string): WorkspacePage<T> {
  return { items: items.slice(0, limit), nextBeforeId: items.length > limit ? id(items[limit - 1]!) : null };
}

export class WorkspaceService {
  constructor(private readonly persistence: Persistence, private readonly repository: WorkspaceRepository,
    private readonly now: () => Date = () => new Date(), private readonly newId: () => string = randomUUID) {}

  private requireAccount(accountId: string): void {
    const account = this.persistence.repositories.accounts.findById(accountId);
    if (!account || account.state !== "active") throw new WorkspaceError("not_found");
  }
  private requireResource(accountId: string, resourceId: string): WorkspaceResource {
    this.requireAccount(accountId);
    const resource = this.repository.resolveResources(accountId, [identifier(resourceId)])[0];
    if (!resource) throw new WorkspaceError("not_found");
    return resource;
  }
  private requireCollection(accountId: string, id: string): ResearchCollection {
    this.requireAccount(accountId);
    const collection = this.repository.getCollection(accountId, identifier(id));
    if (!collection) throw new WorkspaceError("not_found");
    return collection;
  }
  private requirePdfSource(accountId: string, resourceId: string, sourceId: string): WorkspaceResource {
    const resource = this.requireResource(accountId, resourceId);
    identifier(sourceId);
    if (resource.sourceId !== sourceId) throw new WorkspaceError("concurrent_change");
    if (resource.mediaType !== "application/pdf") throw new WorkspaceError("invalid_input");
    return resource;
  }
  progress(accountId: string, resourceId: string) {
    const resource = this.requireResource(accountId, resourceId);
    return { progress: this.repository.getProgress(accountId, resourceId, resource.sourceId) };
  }
  saveProgress(accountId: string, resourceId: string, input: Pick<ReaderProgress, "sourceId" | "physicalPage" | "revision">) {
    return this.persistence.runInTransaction(() => {
      this.requirePdfSource(accountId, resourceId, input.sourceId);
      if (!Number.isSafeInteger(input.physicalPage) || input.physicalPage < 1 || input.physicalPage > 1_000_000) throw new WorkspaceError("invalid_input");
      const progress: ReaderProgress = { resourceId, sourceId: input.sourceId, physicalPage: input.physicalPage,
        revision: revision(input.revision) + 1, updatedAt: this.now().toISOString() };
      if (!this.repository.saveProgress(accountId, progress, input.revision)) throw new WorkspaceError("concurrent_change");
      return progress;
    });
  }
  recent(accountId: string, beforeId?: string, limit?: number) {
    this.requireAccount(accountId);
    const query = paging(beforeId, limit);
    const result = page(this.repository.listProgress(accountId, query.beforeId, query.limit + 1), query.limit, (item) => item.sourceId);
    const resources = this.repository.resolveResources(accountId, result.items.map((item) => item.resourceId));
    const authorized = new Set(resources.map((item) => item.resourceId));
    return { ...result, items: result.items.filter((item) => authorized.has(item.resourceId)), resources };
  }
  highlights(accountId: string, filter: { resourceId: string; sourceId: string; deleted?: boolean; beforeId?: string; limit?: number }) {
    this.requirePdfSource(accountId, filter.resourceId, filter.sourceId);
    const query = paging(filter.beforeId, filter.limit);
    return page(this.repository.listHighlights(accountId, { ...filter, deleted: filter.deleted ?? false, ...query, limit: query.limit + 1 }), query.limit, (item) => item.id);
  }
  createHighlight(accountId: string, input: Pick<TextHighlight, "resourceId" | "sourceId" | "physicalPage" | "text" | "rects" | "color">) {
    return this.persistence.runInTransaction(() => {
      this.requirePdfSource(accountId, input.resourceId, input.sourceId);
      if (!Number.isSafeInteger(input.physicalPage) || input.physicalPage < 1 || input.physicalPage > 1_000_000
        || !["yellow", "green", "blue", "pink"].includes(input.color) || !Array.isArray(input.rects)
        || input.rects.length < 1 || input.rects.length > 100) throw new WorkspaceError("invalid_input");
      const rects = input.rects.map((r) => {
        if (!r || typeof r !== "object" || Object.keys(r).some((k) => !["x", "y", "width", "height"].includes(k))
          || ![r.x, r.y, r.width, r.height].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
          || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001) throw new WorkspaceError("invalid_input");
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const now = this.now().toISOString();
      const highlight: TextHighlight = { id: this.newId(), resourceId: input.resourceId, sourceId: input.sourceId,
        physicalPage: input.physicalPage, text: text(input.text, 10_000, true), rects, color: input.color,
        revision: 1, createdAt: now, updatedAt: now, deletedAt: null };
      this.repository.createHighlight(accountId, highlight);
      return highlight;
    });
  }
  updateHighlight(accountId: string, id: string, input: Pick<TextHighlight, "color" | "revision"> & { deleted: boolean }) {
    return this.persistence.runInTransaction(() => {
      this.requireAccount(accountId);
      const current = this.repository.getHighlight(accountId, identifier(id));
      if (!current) throw new WorkspaceError("not_found");
      this.requirePdfSource(accountId, current.resourceId, current.sourceId);
      if (!["yellow", "green", "blue", "pink"].includes(input.color) || typeof input.deleted !== "boolean") throw new WorkspaceError("invalid_input");
      const now = this.now().toISOString();
      const highlight: TextHighlight = { ...current, color: input.color, revision: revision(input.revision) + 1,
        updatedAt: now, deletedAt: input.deleted ? current.deletedAt ?? now : null };
      if (!this.repository.saveHighlight(accountId, highlight, input.revision)) throw new WorkspaceError("concurrent_change");
      return highlight;
    });
  }
  resource(accountId: string, resourceId: string) {
    const resource = this.requireResource(accountId, resourceId);
    return { resource, reading: this.repository.getReading(accountId, resourceId),
      collectionIds: this.repository.listResourceCollections(accountId, resourceId) };
  }
  collections(accountId: string) {
    this.requireAccount(accountId);
    return this.repository.listCollections(accountId);
  }
  createCollection(accountId: string, name: string) {
    return this.persistence.runInTransaction(() => {
      this.requireAccount(accountId);
      if (this.repository.listCollections(accountId).length >= 200) throw new WorkspaceError("limit_exceeded");
      const now = this.now().toISOString();
      const collection: ResearchCollection = { id: this.newId(), name: text(name, 120), revision: 1,
        archivedAt: null, createdAt: now, updatedAt: now, itemCount: 0 };
      this.repository.createCollection(accountId, collection);
      return collection;
    });
  }
  updateCollection(accountId: string, id: string, input: { name: string; archived: boolean; revision: number }) {
    return this.persistence.runInTransaction(() => {
      const current = this.requireCollection(accountId, id);
      const now = this.now().toISOString();
      const updated = { ...current, name: text(input.name, 120), archivedAt: input.archived ? current.archivedAt ?? now : null,
        revision: revision(input.revision) + 1, updatedAt: now };
      if (!this.repository.saveCollection(accountId, updated, input.revision)) throw new WorkspaceError("concurrent_change");
      return updated;
    });
  }
  collectionItems(accountId: string, id: string, beforeId?: string, limit?: number) {
    this.requireCollection(accountId, id);
    const query = paging(beforeId, limit);
    const result = page(this.repository.listCollectionItems(accountId, id, query.beforeId, query.limit + 1), query.limit, (item) => item.resourceId);
    return { ...result, resources: this.repository.resolveResources(accountId, result.items.map((item) => item.resourceId)) };
  }
  setCollectionItem(accountId: string, id: string, resourceId: string, included: boolean, expectedRevision: number): ResearchCollection {
    return this.persistence.runInTransaction(() => {
      const collection = this.requireCollection(accountId, id);
      identifier(resourceId);
      if (typeof included !== "boolean") throw new WorkspaceError("invalid_input");
      if (revision(expectedRevision) !== collection.revision) throw new WorkspaceError("concurrent_change");
      if (included) {
        if (collection.archivedAt) throw new WorkspaceError("not_found");
        this.requireResource(accountId, resourceId);
      }
      const now = this.now().toISOString();
      if (!this.repository.setCollectionItem(accountId, id, resourceId, included, now)) return collection;
      const updated = { ...collection, revision: collection.revision + 1, updatedAt: now,
        itemCount: collection.itemCount + (included ? 1 : -1) };
      if (!this.repository.saveCollection(accountId, updated, expectedRevision)) throw new WorkspaceError("concurrent_change");
      return updated;
    });
  }
  saveReading(accountId: string, resourceId: string, input: Pick<ReadingState, "status" | "important" | "toCite" | "revision">) {
    return this.persistence.runInTransaction(() => {
      this.requireResource(accountId, resourceId);
      if (![null, "queued", "reading", "finished"].includes(input.status)
        || typeof input.important !== "boolean" || typeof input.toCite !== "boolean") throw new WorkspaceError("invalid_input");
      const updated: ReadingState = { resourceId, ...input, revision: revision(input.revision) + 1, updatedAt: this.now().toISOString() };
      if (!this.repository.saveReading(accountId, updated, input.revision)) throw new WorkspaceError("concurrent_change");
      return updated;
    });
  }
  reading(accountId: string, beforeId?: string, limit?: number) {
    this.requireAccount(accountId);
    const query = paging(beforeId, limit);
    const result = page(this.repository.listReading(accountId, query.beforeId, query.limit + 1, true), query.limit, (item) => item.resourceId);
    return { ...result, resources: this.repository.resolveResources(accountId, result.items.map((item) => item.resourceId)) };
  }
  notes(accountId: string, filter: { resourceId?: string; deleted?: boolean; beforeId?: string; limit?: number } = {}) {
    this.requireAccount(accountId);
    if (filter.resourceId !== undefined) identifier(filter.resourceId);
    const query = paging(filter.beforeId, filter.limit);
    const result = page(this.repository.listNotes(accountId, { ...filter, ...query, limit: query.limit + 1 }), query.limit, (item) => item.id);
    return { ...result, resources: this.repository.resolveResources(accountId, [...new Set(result.items.map((item) => item.resourceId))]) };
  }
  note(accountId: string, id: string) {
    this.requireAccount(accountId);
    const note = this.repository.getNote(accountId, identifier(id));
    if (!note) throw new WorkspaceError("not_found");
    return { note, resource: this.repository.resolveResources(accountId, [note.resourceId])[0] ?? null };
  }
  createNote(accountId: string, input: Pick<PageNote, "resourceId" | "sourceId" | "physicalPage" | "locator" | "body">) {
    return this.persistence.runInTransaction(() => {
      const resource = this.requireResource(accountId, input.resourceId);
      identifier(input.sourceId);
      if (resource.sourceId !== input.sourceId) throw new WorkspaceError("concurrent_change");
      if (resource.mediaType !== "application/pdf" || !Number.isSafeInteger(input.physicalPage)
        || input.physicalPage < 1 || input.physicalPage > 1_000_000) throw new WorkspaceError("invalid_input");
      const now = this.now().toISOString();
      const note: PageNote = { id: this.newId(), resourceId: input.resourceId, sourceId: input.sourceId,
        physicalPage: input.physicalPage, locator: input.locator === null ? null : text(input.locator, 200),
        body: text(input.body, 20_000, true), revision: 1, createdAt: now, updatedAt: now, deletedAt: null };
      this.repository.createNote(accountId, note);
      return note;
    });
  }
  updateNote(accountId: string, id: string, input: Pick<PageNote, "body" | "locator" | "revision"> & { deleted: boolean }) {
    return this.persistence.runInTransaction(() => {
      this.requireAccount(accountId);
      const current = this.repository.getNote(accountId, identifier(id));
      if (!current) throw new WorkspaceError("not_found");
      const now = this.now().toISOString();
      const note: PageNote = { ...current, body: text(input.body, 20_000, true),
        locator: input.locator === null ? null : text(input.locator, 200), revision: revision(input.revision) + 1,
        deletedAt: input.deleted ? current.deletedAt ?? now : null, updatedAt: now };
      if (!this.repository.saveNote(accountId, note, input.revision)) throw new WorkspaceError("concurrent_change");
      return note;
    });
  }
  *exportLines(accountId: string): Generator<string> {
    this.requireAccount(accountId);
    const line = (type: string, value: unknown) => `${JSON.stringify({ type, value })}\n`;
    yield line("manifest", { format: "academiccloud.personal-workspace", version: 1, exportedAt: this.now().toISOString(),
      consistency: "paged-traversal", includesArchivedAndDeleted: true });
    // Only authored state and stable identifiers are exported. No current file
    // metadata, storage keys, other-account content or signed URLs are joined.
    for (const collection of this.repository.listCollections(accountId)) {
      this.requireAccount(accountId);
      yield line("collection", collection);
      let beforeId: string | null = null;
      while (true) {
        this.requireAccount(accountId);
        const items = this.repository.listCollectionItems(accountId, collection.id, beforeId, 100);
        for (const item of items) yield line("collection_item", item);
        if (items.length < 100) break;
        beforeId = items.at(-1)!.resourceId;
      }
    }
    let beforeId: string | null = null;
    while (true) {
      this.requireAccount(accountId);
      const states = this.repository.listReading(accountId, beforeId, 100);
      for (const state of states) yield line("reading", state);
      if (states.length < 100) break;
      beforeId = states.at(-1)!.resourceId;
    }
    beforeId = null;
    while (true) {
      this.requireAccount(accountId);
      const notes = this.repository.listNotes(accountId, { beforeId, limit: 100 });
      for (const note of notes) yield line("page_note", note);
      if (notes.length < 100) break;
      beforeId = notes.at(-1)!.id;
    }
    beforeId = null;
    while (true) {
      this.requireAccount(accountId);
      const states = this.repository.listProgress(accountId, beforeId, 100, false);
      for (const state of states) yield line("reader_progress", state);
      if (states.length < 100) break;
      beforeId = states.at(-1)!.sourceId;
    }
    beforeId = null;
    while (true) {
      this.requireAccount(accountId);
      const highlights = this.repository.listHighlights(accountId, { beforeId, limit: 100 });
      for (const highlight of highlights) yield line("text_highlight", highlight);
      if (highlights.length < 100) break;
      beforeId = highlights.at(-1)!.id;
    }
    yield line("complete", { completedAt: this.now().toISOString() });
  }
}
