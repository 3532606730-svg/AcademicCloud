import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkspaceError, type PageNote } from "../../src/workspace/model.js";
import { fixture, OWNER, MEMBER, OTHER, NOW, CHECKSUM } from "./helpers.js";

const error = (code: WorkspaceError["code"]) => (value: unknown) => value instanceof WorkspaceError && value.code === code;
const noteInput = (source: { resourceId: string; sourceId: string }, body = "Private interpretation") => ({
  resourceId: source.resourceId, sourceId: source.sourceId, physicalPage: 4, locator: "卷二，葉三", body,
});
const edit = (note: PageNote, body = note.body, deleted = false) => ({ body, locator: note.locator, revision: note.revision, deleted });

test("shared source authority never reveals another member's private state or collections, including to Owner", (context) => {
  const f = fixture(context);
  const { source } = f.sharedFile();
  const ownSource = f.file("member-private");
  const note = f.workspace.createNote(MEMBER.id, noteInput(source, "member-only-sentinel"));
  const collection = f.workspace.createCollection(MEMBER.id, "member-only-collection");
  f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, true, collection.revision);
  f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "reading", important: true, toCite: true, revision: 0 });
  assert.equal(f.workspace.resource(MEMBER.id, source.resourceId).reading?.status, "reading");
  for (const actor of [OWNER, OTHER]) {
    assert.deepEqual(f.workspace.collections(actor.id), []);
    assert.deepEqual(f.workspace.notes(actor.id), { items: [], nextBeforeId: null, resources: [] });
    assert.deepEqual(f.workspace.reading(actor.id), { items: [], nextBeforeId: null, resources: [] });
    assert.deepEqual(f.workspace.notes(actor.id, { resourceId: source.resourceId }).items, []);
    assert.throws(() => f.workspace.collectionItems(actor.id, collection.id), error("not_found"));
    assert.throws(() => f.workspace.updateCollection(actor.id, collection.id, { name: "stolen", archived: true, revision: 1 }), error("not_found"));
    assert.throws(() => f.workspace.setCollectionItem(actor.id, collection.id, source.resourceId, false, 2), error("not_found"));
    assert.throws(() => f.workspace.updateNote(actor.id, note.id, edit(note, "stolen")), error("not_found"));
    assert.throws(() => f.workspace.note(actor.id, note.id), error("not_found"));
    assert.throws(() => f.workspace.updateNote(actor.id, "missing-note", edit(note, "stolen")), error("not_found"));
    assert.doesNotMatch([...f.workspace.exportLines(actor.id)].join(""), /member-only|research-000/);
    assert.throws(() => f.workspace.resource(actor.id, ownSource.resourceId), error("not_found"));
  }
  assert.deepEqual(f.workspace.resource(OWNER.id, source.resourceId).collectionIds, []);
  assert.equal(f.workspace.resource(OWNER.id, source.resourceId).reading, null);
  assert.throws(() => f.workspace.resource(OTHER.id, source.resourceId), error("not_found"));
  assert.equal(f.workspace.collections(MEMBER.id)[0]!.itemCount, 1);
});

test("replacement, access loss and recycling retain authored notes without disclosing unavailable metadata", async (context) => {
  const f = fixture(context);
  const { source, library } = f.sharedFile();
  const note = f.workspace.createNote(MEMBER.id, noteInput(source));
  let collection = f.workspace.createCollection(MEMBER.id, "Retained context");
  collection = f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, true, collection.revision);
  f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "queued", important: false, toCite: true, revision: 0 });
  f.database.prepare("UPDATE files SET checksum = 'BBBBBBBBBBBBBBBBBBBBBB==' WHERE id = ?").run(source.resourceId);
  const replacement = f.workspace.resource(MEMBER.id, source.resourceId).resource;
  assert.notEqual(replacement.sourceId, source.sourceId);
  assert.equal(f.workspace.notes(MEMBER.id).items[0]!.sourceId, source.sourceId);
  assert.throws(() => f.workspace.createNote(MEMBER.id, noteInput(source)), error("concurrent_change"));
  f.libraries.removeMember(OWNER, library.id, MEMBER.id);
  f.database.prepare("UPDATE files SET display_name = 'secret-after-revocation.pdf' WHERE id = ?").run(source.resourceId);
  assert.throws(() => f.workspace.resource(MEMBER.id, source.resourceId), error("not_found"));
  assert.deepEqual(f.workspace.note(MEMBER.id, note.id), { note, resource: null });
  for (const page of [f.workspace.notes(MEMBER.id), f.workspace.reading(MEMBER.id), f.workspace.collectionItems(MEMBER.id, collection.id)]) {
    assert.equal(page.items.length, 1);
    assert.deepEqual(page.resources, []);
    assert.doesNotMatch(JSON.stringify(page), /secret-after-revocation/);
  }
  assert.throws(() => f.workspace.createNote(MEMBER.id, noteInput(replacement)), error("not_found"));
  assert.throws(() => f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, true, collection.revision), error("not_found"));
  const amended = f.workspace.updateNote(MEMBER.id, note.id, edit(note, "Authored after access loss"));
  const deleted = f.workspace.updateNote(MEMBER.id, note.id, edit(amended, amended.body, true));
  assert.equal(f.workspace.notes(MEMBER.id, { deleted: false }).items.length, 0);
  assert.equal(f.workspace.notes(MEMBER.id, { deleted: true }).items.length, 1);
  assert.ok(f.workspace.updateNote(MEMBER.id, note.id, edit(deleted)).deletedAt === null);
  assert.doesNotMatch([...f.workspace.exportLines(MEMBER.id)].join(""), /secret-after-revocation|objects\/|BBBB/);
  f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, false, collection.revision);
  assert.equal(f.workspace.collections(MEMBER.id)[0]!.itemCount, 0);
  const owned = f.file("recycled-private");
  const retained = f.workspace.createNote(MEMBER.id, noteInput(owned));
  f.drive.deleteFile(MEMBER.id, owned.resourceId);
  assert.deepEqual(f.workspace.notes(MEMBER.id, { resourceId: owned.resourceId }).resources, []);
  assert.equal(f.workspace.updateNote(MEMBER.id, retained.id, edit(retained)).sourceId, owned.sourceId);
  await f.drive.restoreFile(MEMBER.id, owned.resourceId);
  assert.equal(f.workspace.notes(MEMBER.id, { resourceId: owned.resourceId }).resources[0]!.sourceId, owned.sourceId);
});

test("explicit flags, collection archival and note edits use CAS and immutable attachments", (context) => {
  const f = fixture(context);
  const source = f.file("source-a");
  const otherSource = f.file("source-b");
  let collection = f.workspace.createCollection(MEMBER.id, "  第一組  ");
  assert.equal(collection.name, "第一組");
  collection = f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, true, collection.revision);
  collection = f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, true, collection.revision);
  assert.equal(f.workspace.collections(MEMBER.id)[0]!.itemCount, 1);
  const archived = f.workspace.updateCollection(MEMBER.id, collection.id, { name: "第一組", archived: true, revision: collection.revision });
  assert.ok(archived.archivedAt);
  assert.throws(() => f.workspace.setCollectionItem(MEMBER.id, collection.id, otherSource.resourceId, true, archived.revision), error("not_found"));
  assert.throws(() => f.workspace.updateCollection(MEMBER.id, collection.id, { name: "stale", archived: false, revision: 1 }), error("concurrent_change"));
  assert.equal(f.workspace.collectionItems(MEMBER.id, collection.id).items.length, 1);
  assert.equal(f.workspace.updateCollection(MEMBER.id, collection.id, { name: "第一組", archived: false, revision: archived.revision }).archivedAt, null);
  const reading = f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "reading", important: true, toCite: false, revision: 0 });
  assert.throws(() => f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "finished", important: false, toCite: false, revision: 0 }), error("concurrent_change"));
  const cleared = f.workspace.saveReading(MEMBER.id, source.resourceId, { status: null, important: false, toCite: true, revision: reading.revision });
  assert.equal(cleared.revision, 2);
  assert.equal(cleared.status, null);
  const note = f.workspace.createNote(MEMBER.id, noteInput(source));
  const edited = f.workspace.updateNote(MEMBER.id, note.id, edit(note, "Changed text"));
  assert.throws(() => f.workspace.updateNote(MEMBER.id, note.id, edit(note, "stale")), error("concurrent_change"));
  assert.equal(f.workspace.notes(MEMBER.id).items[0]!.body, edited.body);
  assert.throws(() => f.repository.createNote(MEMBER.id, { ...note, id: "wrong-source", sourceId: otherSource.sourceId }), /FOREIGN KEY/);
  assert.throws(() => f.repository.setCollectionItem(OTHER.id, collection.id, source.resourceId, true, NOW.toISOString()), /FOREIGN KEY/);
  for (const assignment of ["account_id = 'workspace-other'", "file_id = 'source-b'", `source_id = '${otherSource.sourceId}'`, "physical_page = 5", "created_at = 'changed'"]) {
    assert.throws(() => f.database.prepare(`UPDATE personal_page_notes SET ${assignment} WHERE id = ?`).run(note.id), /immutable/);
  }
  assert.throws(() => f.database.prepare("DELETE FROM personal_page_notes WHERE id = ?").run(note.id), /recoverable/);
  assert.throws(() => f.database.prepare("DELETE FROM personal_collections WHERE id = ?").run(collection.id), /recoverable/);
  assert.deepEqual(f.database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("collection membership shares collection CAS and stale no-ops cannot override newer decisions", (context) => {
  const f = fixture(context);
  const first = f.file("membership-first");
  const second = f.file("membership-second");
  const initial = f.workspace.createCollection(MEMBER.id, "Concurrent collection");
  const added = f.workspace.setCollectionItem(MEMBER.id, initial.id, first.resourceId, true, initial.revision);
  assert.equal(added.revision, 2);
  assert.equal(added.itemCount, 1);
  assert.deepEqual(f.workspace.setCollectionItem(MEMBER.id, initial.id, first.resourceId, true, added.revision), added);
  assert.deepEqual(f.workspace.setCollectionItem(MEMBER.id, initial.id, second.resourceId, false, added.revision), added);
  for (const [resourceId, included] of [[first.resourceId, true], [first.resourceId, false], [second.resourceId, true], [second.resourceId, false]] as const) {
    assert.throws(() => f.workspace.setCollectionItem(MEMBER.id, initial.id, resourceId, included, initial.revision), error("concurrent_change"));
  }
  assert.throws(() => f.workspace.updateCollection(MEMBER.id, initial.id, { name: "Old draft", archived: true, revision: initial.revision }), error("concurrent_change"));
  const renamed = f.workspace.updateCollection(MEMBER.id, initial.id, { name: "Renamed", archived: false, revision: added.revision });
  assert.throws(() => f.workspace.setCollectionItem(MEMBER.id, initial.id, second.resourceId, true, added.revision), error("concurrent_change"));
  const removed = f.workspace.setCollectionItem(MEMBER.id, initial.id, first.resourceId, false, renamed.revision);
  assert.equal(removed.revision, renamed.revision + 1);
  assert.equal(removed.itemCount, 0);
  assert.equal(removed.name, "Renamed");
  assert.deepEqual(f.workspace.collectionItems(MEMBER.id, initial.id).items, []);

  // A failed collection CAS must roll back its membership write as one unit.
  context.mock.method(f.repository, "saveCollection", () => false);
  assert.throws(() => f.workspace.setCollectionItem(MEMBER.id, initial.id, second.resourceId, true, removed.revision), error("concurrent_change"));
  assert.deepEqual(f.workspace.collectionItems(MEMBER.id, initial.id).items, []);
  assert.deepEqual(f.workspace.collections(MEMBER.id), [removed]);
});

test("source projection matches Library membership, attachment and active account gates", (context) => {
  const f = fixture(context);
  const { library, source } = f.sharedFile();
  assert.equal(f.libraries.listHoldings(MEMBER.id, library.id)[0]!.file.id, source.resourceId);
  assert.equal(f.workspace.resource(MEMBER.id, source.resourceId).resource.libraryId, library.id);
  f.database.prepare(`INSERT INTO scholarly_record_metadata (record_id, owner_domain_id, material_type, canonical_title, created_by_account_id, updated_by_account_id, created_at, updated_at)
    VALUES (?, ?, 'book', 'Current canonical title', ?, ?, ?, ?)`).run(`record-${source.resourceId}`, `library:${library.id}`, OWNER.id, OWNER.id, NOW.toISOString(), NOW.toISOString());
  assert.equal(f.workspace.resource(MEMBER.id, source.resourceId).resource.title, "Current canonical title");
  f.database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'detached' WHERE id = ?").run(`artifact-${source.resourceId}`);
  assert.throws(() => f.workspace.resource(MEMBER.id, source.resourceId), error("not_found"));
  f.database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(`artifact-${source.resourceId}`);
  f.persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW);
  assert.deepEqual(f.repository.resolveResources(MEMBER.id, [source.resourceId]), []);
  assert.throws(() => f.workspace.notes(MEMBER.id), error("not_found"));
  assert.throws(() => [...f.workspace.exportLines(MEMBER.id)], error("not_found"));
});

test("bounded pages and versioned export traverse complete authored state without source metadata", (context) => {
  const f = fixture(context);
  let collection = f.workspace.createCollection(MEMBER.id, "Export collection");
  const expectedFiles: string[] = [];
  const expectedNotes: string[] = [];
  for (let i = 0; i < 105; i++) {
    const source = f.file(`page-${String(i).padStart(3, "0")}`);
    expectedFiles.push(source.resourceId);
    collection = f.workspace.setCollectionItem(MEMBER.id, collection.id, source.resourceId, true, collection.revision);
    f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "queued", important: false, toCite: true, revision: 0 });
    const note = f.workspace.createNote(MEMBER.id, noteInput(source, `Author's note ${i}`));
    expectedNotes.push(note.id);
    if (i % 2 === 0) f.workspace.updateNote(MEMBER.id, note.id, edit(note, note.body, true));
  }
  const traverse = <T,>(fetch: (cursor?: string) => { items: T[]; nextBeforeId: string | null }) => {
    const items: T[] = []; let cursor: string | undefined;
    do { const p = fetch(cursor); assert.ok(p.items.length <= 17); items.push(...p.items); cursor = p.nextBeforeId ?? undefined; } while (cursor);
    return items;
  };
  assert.deepEqual(traverse((cursor) => f.workspace.reading(MEMBER.id, cursor, 17)).map((item) => item.resourceId).sort(), expectedFiles);
  assert.deepEqual(traverse((cursor) => f.workspace.collectionItems(MEMBER.id, collection.id, cursor, 17)).map((item) => item.resourceId).sort(), expectedFiles);
  assert.deepEqual(traverse((cursor) => f.workspace.notes(MEMBER.id, { ...(cursor ? { beforeId: cursor } : {}), limit: 17 })).map((item) => item.id).sort(), expectedNotes);
  f.workspace.updateCollection(MEMBER.id, collection.id, { name: collection.name, archived: true, revision: collection.revision });
  const serialized = [...f.workspace.exportLines(MEMBER.id)].join("");
  const lines = serialized.trim().split("\n").map((line) => JSON.parse(line) as { type: string; value: Record<string, unknown> });
  assert.equal(lines[0]!.type, "manifest");
  assert.equal(lines[0]!.value.consistency, "paged-traversal");
  assert.equal(lines.at(-1)!.type, "complete");
  for (const type of ["page_note", "collection_item", "reading"]) assert.equal(lines.filter((line) => line.type === type).length, 105);
  assert.equal(lines.filter((line) => line.type === "page_note" && line.value.deletedAt !== null).length, 53);
  assert.ok(lines.find((line) => line.type === "collection")!.value.archivedAt);
  assert.doesNotMatch(serialized, /objects\/|storageProvider|canonicalTitle|\.pdf|AAAAAAAA/);
  assert.deepEqual([...f.workspace.exportLines(OWNER.id)].map((line) => JSON.parse(line).type), ["manifest", "complete"]);
});

test("reading pagination excludes cleared flags before LIMIT while retaining their CAS and export state", (context) => {
  const f = fixture(context);
  for (const resourceId of ["reading-z-clear", "reading-y-status", "reading-x-clear", "reading-w-important", "reading-v-clear", "reading-u-cite"]) {
    const source = f.file(resourceId);
    const saved = f.workspace.saveReading(MEMBER.id, source.resourceId, { status: "queued", important: false, toCite: false, revision: 0 });
    f.workspace.saveReading(MEMBER.id, source.resourceId, {
      status: resourceId.endsWith("status") ? "reading" : null,
      important: resourceId.endsWith("important"), toCite: resourceId.endsWith("cite"), revision: saved.revision,
    });
  }
  const first = f.workspace.reading(MEMBER.id, undefined, 2);
  assert.deepEqual(first.items.map((item) => item.resourceId), ["reading-y-status", "reading-w-important"]);
  assert.equal(first.nextBeforeId, "reading-w-important");
  assert.deepEqual(first.resources.map((item) => item.resourceId).sort(), ["reading-w-important", "reading-y-status"]);
  const second = f.workspace.reading(MEMBER.id, first.nextBeforeId!, 2);
  assert.deepEqual(second.items.map((item) => item.resourceId), ["reading-u-cite"]);
  assert.equal(second.nextBeforeId, null);
  const cleared = f.workspace.resource(MEMBER.id, "reading-z-clear").reading!;
  assert.equal(cleared.revision, 2);
  assert.equal(cleared.status, null);
  assert.throws(() => f.workspace.saveReading(MEMBER.id, cleared.resourceId, { status: "finished", important: false, toCite: false, revision: 0 }), error("concurrent_change"));
  const exported = [...f.workspace.exportLines(MEMBER.id)].map((line) => JSON.parse(line)).filter((line) => line.type === "reading");
  assert.equal(exported.length, 6);
  assert.deepEqual(exported.find((line) => line.value.resourceId === cleared.resourceId).value, cleared);
  assert.equal(f.workspace.saveReading(MEMBER.id, cleared.resourceId, { status: "finished", important: false, toCite: false, revision: cleared.revision }).revision, 3);
});

test("invalid page, stale source, non-PDF and malformed text cannot create authored state", (context) => {
  const f = fixture(context);
  const source = f.file("valid-pdf");
  const other = f.file("wrong-pdf");
  const nonPdf = f.file("plain-text", MEMBER.id, "text/plain");
  for (const physicalPage of [0, -1, 1.5, 1_000_001, Number.NaN]) assert.throws(() => f.workspace.createNote(MEMBER.id, { ...noteInput(source), physicalPage }), error("invalid_input"));
  for (const body of ["   ", "control\u0000", "a".repeat(20_001)]) assert.throws(() => f.workspace.createNote(MEMBER.id, noteInput(source, body)), error("invalid_input"));
  assert.throws(() => f.workspace.createNote(MEMBER.id, noteInput(nonPdf)), error("invalid_input"));
  assert.throws(() => f.workspace.createNote(MEMBER.id, { ...noteInput(source), sourceId: other.sourceId }), error("concurrent_change"));
  assert.throws(() => f.workspace.createCollection(MEMBER.id, "\n"), error("invalid_input"));
  assert.throws(() => f.workspace.notes(MEMBER.id, { limit: 101 }), error("invalid_input"));
  assert.equal(f.workspace.notes(MEMBER.id).items.length, 0);
  assert.equal(f.persistence.repositories.files.findCurrentDocumentSource(source.resourceId)!.checksum, CHECKSUM);
});
