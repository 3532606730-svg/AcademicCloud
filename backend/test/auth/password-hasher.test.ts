import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ARGON2ID_PARAMETERS,
  Argon2idPasswordHasher,
  PasswordKdfOverloadedError,
} from "../../src/auth/password-hasher.js";

test("Argon2id uses the selected memory-hard parameters", async () => {
  const hasher = new Argon2idPasswordHasher();
  const encodedHash = await hasher.hash("correct horse battery staple");

  assert.match(encodedHash, /^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
  assert.equal(ARGON2ID_PARAMETERS.hashLength, 32);
  assert.equal(await hasher.verify(encodedHash, "correct horse battery staple"), true);
  assert.equal(await hasher.verify(encodedHash, "wrong"), false);
});

test("Argon2id work is serialized and rejects beyond four queued operations", async () => {
  const hasher = new Argon2idPasswordHasher(1, 4);
  const operations = Array.from({ length: 6 }, (_, index) => hasher.hash(`password-${index}`));
  const results = await Promise.allSettled(operations);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof PasswordKdfOverloadedError);
});
