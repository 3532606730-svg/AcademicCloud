import assert from "node:assert/strict";
import test from "node:test";

import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { parseAccountProvisionArguments } from "../../src/operations/account-options.js";
import { provisionAccount, validateLoginName } from "../../src/operations/account-provision.js";
import { createTestPersistence } from "../persistence/helpers.js";

const hasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`hashed:${password}`),
  verify: () => Promise.resolve(false),
};

test("account provisioning stores a hash and never returns the password", async (context) => {
  const { persistence } = createTestPersistence(context);
  const result = await provisionAccount(
    persistence,
    hasher,
    "Scholar",
    "correct-horse-battery",
    () => new Date("2026-08-13T08:00:00.000Z"),
  );
  const stored = persistence.repositories.accounts.findByLoginName("scholar");

  assert.equal(result.loginName, "Scholar");
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(stored?.passwordHash, "hashed:correct-horse-battery");
  assert.equal(stored?.role, "owner");
  assert.equal(JSON.stringify(result).includes("correct-horse-battery"), false);
  await assert.rejects(
    provisionAccount(persistence, hasher, "SCHOLAR", "another-secure-password"),
    /already exists/,
  );
});

test("account provisioning rejects unsafe names and short passwords", async (context) => {
  const { persistence } = createTestPersistence(context);
  assert.throws(() => validateLoginName(" Scholar "), /login name/);
  assert.throws(() => validateLoginName("two words"), /login name/);
  await assert.rejects(provisionAccount(persistence, hasher, "Scholar", "too-short"), /password/);
});

test("account CLI accepts stdin or a namespaced password environment variable", () => {
  assert.deepEqual(
    parseAccountProvisionArguments(["--login=Scholar", "--password-env=ACADEMICCLOUD_INITIAL_PASSWORD"]),
    {
      loginName: "Scholar",
      passwordSource: { type: "environment", name: "ACADEMICCLOUD_INITIAL_PASSWORD" },
    },
  );
  assert.deepEqual(
    parseAccountProvisionArguments(["--login=Scholar", "--password-stdin"]),
    { loginName: "Scholar", passwordSource: { type: "stdin" } },
  );
  assert.throws(
    () => parseAccountProvisionArguments(["--login=Scholar", "--password=visible"]),
    /usage/,
  );
  assert.throws(
    () => parseAccountProvisionArguments(["--login=Scholar", "--password-env=bad-name"]),
    /invalid/,
  );
  assert.throws(
    () => parseAccountProvisionArguments(["--login=Scholar", "--password-env=DATABASE_PATH"]),
    /invalid/,
  );
});
