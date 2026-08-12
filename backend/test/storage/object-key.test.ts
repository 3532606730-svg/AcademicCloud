import assert from "node:assert/strict";
import test from "node:test";

import { createContentDisposition } from "../../src/storage/authorization.js";
import { assertValidObjectKey, createObjectKey } from "../../src/storage/object-key.js";

test("object keys are opaque, random, and contain no filename material", () => {
  const first = createObjectKey();
  const second = createObjectKey();

  assert.match(first, /^objects\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
  assert.notEqual(first, second);
  assert.doesNotThrow(() => assertValidObjectKey(first));
  assert.throws(() => assertValidObjectKey("objects/paper.pdf"), /application-generated opaque/);
  assert.throws(() => assertValidObjectKey("../secret"), /application-generated opaque/);
});

test("download content disposition supplies safe ASCII and UTF-8 filenames", () => {
  const disposition = createContentDisposition('蒙古史料 "终稿".pdf');

  assert.match(disposition, /^attachment; filename="/);
  assert.match(disposition, /filename\*=UTF-8''/);
  assert.doesNotMatch(disposition, /\r|\n/);
  assert.match(disposition, /%E8%92%99%E5%8F%A4/);
  assert.throws(() => createContentDisposition("bad\r\nname.pdf"), /safe filename/);
  assert.doesNotMatch(createContentDisposition("../draft.pdf"), /\.\.%2F|\.\.\//);
});
