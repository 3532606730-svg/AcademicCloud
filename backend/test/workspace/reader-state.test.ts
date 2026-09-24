import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkspaceError } from "../../src/workspace/model.js";
import { fixture, OWNER, MEMBER, OTHER } from "./helpers.js";
const error = (code: WorkspaceError["code"]) => (value: unknown) => value instanceof WorkspaceError && value.code === code;
const annotation = (source: { resourceId: string; sourceId: string }) => ({ ...source, physicalPage: 3,
  text: "MEMBER_PRIVATE_SELECTED_TEXT", rects: [{ x: .1, y: .2, width: .3, height: .04 }], color: "yellow" as const });

test("reader progress and highlights remain account-private with independent CAS", (context) => {
  const f = fixture(context); const { source } = f.sharedFile();
  const progress = f.workspace.saveProgress(MEMBER.id, source.resourceId, { sourceId: source.sourceId, physicalPage: 3, revision: 0 });
  const h = f.workspace.createHighlight(MEMBER.id, annotation(source));
  assert.deepEqual(f.workspace.progress(MEMBER.id, source.resourceId), { progress });
  assert.deepEqual(f.workspace.highlights(MEMBER.id, source).items, [h]);
  assert.deepEqual(f.workspace.recent(MEMBER.id).items, [progress]);
  assert.equal(f.workspace.resource(MEMBER.id, source.resourceId).reading, null);
  for (const actor of [OWNER, OTHER]) {
    assert.deepEqual(f.workspace.recent(actor.id).items, []);
    assert.throws(() => f.workspace.updateHighlight(actor.id, h.id, { color: "blue", deleted: true, revision: 1 }), error("not_found"));
    assert.doesNotMatch([...f.workspace.exportLines(actor.id)].join(""), /MEMBER_PRIVATE_SELECTED_TEXT/);
  }
  assert.equal(f.workspace.progress(OWNER.id, source.resourceId).progress, null);
  assert.deepEqual(f.workspace.highlights(OWNER.id, source).items, []);
  assert.throws(() => f.workspace.progress(OTHER.id, source.resourceId), error("not_found"));
  assert.throws(() => f.workspace.saveProgress(MEMBER.id, source.resourceId, { sourceId: source.sourceId, physicalPage: 4, revision: 0 }), error("concurrent_change"));
  assert.equal(f.workspace.saveProgress(MEMBER.id, source.resourceId, { sourceId: source.sourceId, physicalPage: 4, revision: 1 }).revision, 2);
  const deleted = f.workspace.updateHighlight(MEMBER.id, h.id, { color: "blue", deleted: true, revision: 1 });
  assert.equal(f.workspace.highlights(MEMBER.id, source).items.length, 0);
  assert.deepEqual(f.workspace.highlights(MEMBER.id, { ...source, deleted: true }).items, [deleted]);
  assert.throws(() => f.workspace.updateHighlight(MEMBER.id, h.id, { color: "pink", deleted: false, revision: 1 }), error("concurrent_change"));
  assert.equal(f.workspace.updateHighlight(MEMBER.id, h.id, { color: "pink", deleted: false, revision: 2 }).deletedAt, null);
  assert.throws(() => f.database.prepare("DELETE FROM personal_text_highlights WHERE id = ?").run(h.id), /recoverable deletion/);
  assert.throws(() => f.database.prepare("UPDATE personal_text_highlights SET physical_page = 4 WHERE id = ?").run(h.id), /attachment is immutable/);
});

test("source replacement never migrates overlays and revoked source metadata never leaks", (context) => {
  const f = fixture(context); const { source, library } = f.sharedFile();
  f.workspace.saveProgress(MEMBER.id, source.resourceId, { sourceId: source.sourceId, physicalPage: 8, revision: 0 });
  const h = f.workspace.createHighlight(MEMBER.id, annotation(source));
  f.database.prepare("UPDATE files SET checksum = 'BBBBBBBBBBBBBBBBBBBBBB==' WHERE id = ?").run(source.resourceId);
  const replacement = f.workspace.resource(MEMBER.id, source.resourceId).resource;
  assert.notEqual(replacement.sourceId, source.sourceId);
  assert.equal(f.workspace.progress(MEMBER.id, source.resourceId).progress, null);
  assert.deepEqual(f.workspace.recent(MEMBER.id).items, []);
  assert.deepEqual(f.workspace.highlights(MEMBER.id, replacement).items, []);
  assert.throws(() => f.workspace.createHighlight(MEMBER.id, annotation(source)), error("concurrent_change"));
  assert.throws(() => f.workspace.saveProgress(MEMBER.id, source.resourceId, { sourceId: source.sourceId, physicalPage: 1, revision: 1 }), error("concurrent_change"));
  const progress = f.workspace.saveProgress(MEMBER.id, source.resourceId, { sourceId: replacement.sourceId, physicalPage: 1, revision: 0 });
  assert.equal(progress.revision, 1);
  f.libraries.removeMember(OWNER, library.id, MEMBER.id);
  f.database.prepare("UPDATE files SET display_name = 'SECRET_REVOKED_NAME' WHERE id = ?").run(source.resourceId);
  assert.deepEqual(f.workspace.recent(MEMBER.id).items, []);
  assert.throws(() => f.workspace.highlights(MEMBER.id, replacement), error("not_found"));
  assert.throws(() => f.workspace.updateHighlight(MEMBER.id, h.id, { color: "blue", deleted: true, revision: 1 }), error("not_found"));
  const exported = [...f.workspace.exportLines(MEMBER.id)].map((line) => JSON.parse(line));
  assert.equal(exported.filter((line) => line.type === "reader_progress").length, 2);
  assert.equal(exported.find((line) => line.type === "text_highlight").value.sourceId, source.sourceId);
  assert.doesNotMatch(JSON.stringify(exported), /SECRET_REVOKED_NAME|objectKey|signedUrl/);
});

test("reader inputs bound pages and geometry; recent pagination is deterministic", (context) => {
  const f = fixture(context); const source = f.file("pdf-a"); const b = f.file("pdf-b"); const c = f.file("pdf-c");
  for (const physicalPage of [0, 1.2, 1_000_001, Infinity]) assert.throws(() => f.workspace.saveProgress(MEMBER.id, source.resourceId,
    { sourceId: source.sourceId, physicalPage, revision: 0 }), error("invalid_input"));
  for (const rects of [[], [{ x: .9, y: 0, width: .2, height: .1 }], [{ x: 0, y: 0, width: 0, height: .1 }], [{ x: NaN, y: 0, width: .1, height: .1 }]]) {
    assert.throws(() => f.workspace.createHighlight(MEMBER.id, { ...annotation(source), rects }), error("invalid_input"));
  }
  for (const value of [source, b, c]) f.workspace.saveProgress(MEMBER.id, value.resourceId, { sourceId: value.sourceId, physicalPage: 2, revision: 0 });
  const first = f.workspace.recent(MEMBER.id, undefined, 2);
  const second = f.workspace.recent(MEMBER.id, first.nextBeforeId!, 2);
  assert.equal(first.items.length, 2); assert.equal(second.items.length, 1); assert.equal(second.nextBeforeId, null);
  assert.equal(new Set([...first.items, ...second.items].map((p) => p.sourceId)).size, 3);
  f.database.prepare("UPDATE personal_reader_progress SET updated_at = '2026-09-30T01:00:00.000Z' WHERE source_id = ?").run(source.sourceId);
  assert.equal(f.workspace.recent(MEMBER.id).items[0]!.sourceId, source.sourceId);
  assert.throws(() => f.workspace.createHighlight(MEMBER.id, annotation(f.file("not-pdf", MEMBER.id, "image/png"))), error("invalid_input"));
  assert.deepEqual(f.database.prepare("PRAGMA foreign_key_check").all(), []);
});
