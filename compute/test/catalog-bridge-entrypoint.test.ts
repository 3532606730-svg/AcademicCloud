import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { isCatalogBridgeEntrypoint } from "../src/catalog-bridge.js";

test("catalog bridge recognizes direct execution through a symlinked release selector", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink creation is privilege-dependent on Windows");
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "academiccloud-catalog-entrypoint-"));
  try {
    const releaseDir = join(root, "catalog-releases", "a".repeat(40));
    const currentDir = join(root, "catalog-current");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(releaseDir, { recursive: true }));
    const realEntry = join(releaseDir, "catalog-bridge.js");
    await writeFile(realEntry, "// fixture\n", "utf8");
    await symlink(releaseDir, currentDir, "dir");
    const invokedEntry = join(currentDir, "catalog-bridge.js");

    assert.notEqual(pathToFileURL(realEntry).href, pathToFileURL(invokedEntry).href);
    assert.equal(await realpath(invokedEntry), await realpath(realEntry));
    assert.equal(isCatalogBridgeEntrypoint(pathToFileURL(realEntry).href, invokedEntry), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("catalog bridge rejects a different executable as its entrypoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "academiccloud-catalog-entrypoint-other-"));
  try {
    const modulePath = join(root, "catalog-bridge.js");
    const otherPath = join(root, "other.js");
    await writeFile(modulePath, "// module\n", "utf8");
    await writeFile(otherPath, "// other\n", "utf8");
    assert.equal(isCatalogBridgeEntrypoint(pathToFileURL(modulePath).href, otherPath), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
