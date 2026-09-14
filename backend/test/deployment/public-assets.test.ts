import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

const { publishAssets } = await import(new URL("../../../deployment/nginx/publish-assets.mjs", import.meta.url).href) as {
  publishAssets(releaseRoot: string, targetDirectory: string): { sourceCommit: string; assets: number; added: number };
};
const commit = "a".repeat(40);
const oldName = "index-old12345.js";
const newName = "index-new12345.js";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-public-assets-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, target: join(directory, "public-assets", "assets") };
}

function release(directory: string, label: string, files: Record<string, string>) {
  const root = join(directory, label);
  const entries = Object.entries(files).map(([name, text]) => {
    const path = `frontend/dist/assets/${name}`;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    return { path, type: "file", size: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };
  });
  const manifest = { sourceCommit: commit, files: entries };
  writeFileSync(join(root, "ARTIFACT-MANIFEST.json"), JSON.stringify(manifest));
  return { root, manifest, save: () => writeFileSync(join(root, "ARTIFACT-MANIFEST.json"), JSON.stringify(manifest)) };
}

function linkDirectory(target: string, link: string) {
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}

function linkFile(t: TestContext, target: string, link: string) {
  try {
    symlinkSync(target, link, "file");
    return true;
  } catch (error) {
    if (process.platform === "win32" && error instanceof Error && "code" in error && error.code === "EPERM") {
      t.skip("Windows file symlinks require a privilege not available to this test process");
      return false;
    }
    throw error;
  }
}

test("successive releases retain old browser chunks and republishing is idempotent", (t) => {
  const { directory, target } = fixture(t);
  const first = release(directory, "release-one", { [oldName]: "old chunk", "style-style123.css": "body {}" });
  const second = release(directory, "release-two", { [newName]: "new chunk", "style-style123.css": "body {}" });
  assert.deepEqual(publishAssets(first.root, target), { sourceCommit: commit, assets: 2, added: 2 });
  assert.deepEqual(publishAssets(second.root, target), { sourceCommit: commit, assets: 2, added: 1 });
  const before = lstatSync(join(target, oldName));
  assert.deepEqual(publishAssets(first.root, target), { sourceCommit: commit, assets: 2, added: 0 });
  assert.equal(lstatSync(join(target, oldName)).mtimeMs, before.mtimeMs);
  assert.equal(readFileSync(join(target, oldName), "utf8"), "old chunk");
  assert.equal(readFileSync(join(target, newName), "utf8"), "new chunk");
  assert.deepEqual(readdirSync(target).sort(), [oldName, newName, "style-style123.css"].sort());
  if (process.platform !== "win32") assert.equal(lstatSync(join(target, newName)).mode & 0o222, 0);
});

test("all source hashes and sizes are checked before any public file is created", async (t) => {
  for (const corruption of ["bytes", "hash", "size"] as const) {
    await t.test(corruption, (t) => {
      const { directory, target } = fixture(t);
      const candidate = release(directory, "release", { [oldName]: "old chunk", [newName]: "new chunk" });
      const entry = candidate.manifest.files[1]!;
      if (corruption === "bytes") writeFileSync(join(candidate.root, entry.path), "bad chunk");
      if (corruption === "hash") entry.sha256 = "0".repeat(64);
      if (corruption === "size") entry.size++;
      candidate.save();
      assert.throws(() => publishAssets(candidate.root, target));
      assert.equal(existsSync(target), false);
    });
  }
});

test("a retained hash-name collision rejects the entire publication without replacing old bytes", (t) => {
  const { directory, target } = fixture(t);
  const first = release(directory, "release-one", { [oldName]: "old chunk" });
  publishAssets(first.root, target);
  const candidate = release(directory, "release-two", { [newName]: "new chunk", [oldName]: "different bytes" });
  assert.throws(() => publishAssets(candidate.root, target), /retained asset name collision/u);
  assert.equal(readFileSync(join(target, oldName), "utf8"), "old chunk");
  assert.deepEqual(readdirSync(target), [oldName]);
});

test("only direct hashed public filenames are publishable and duplicate manifest entries fail closed", async (t) => {
  for (const name of ["../secret-deadbeef.js", "nested/index-deadbeef.js", "..\\index-deadbeef.js", "index.js", "private-deadbeef.json", "/index-deadbeef.js"]) {
    await t.test(name, (t) => {
      const { directory, target } = fixture(t);
      const candidate = release(directory, "release", { [newName]: "new chunk" });
      candidate.manifest.files[0]!.path = `frontend/dist/assets/${name}`;
      candidate.save();
      assert.throws(() => publishAssets(candidate.root, target), /only content-hashed public asset names/u);
      assert.equal(existsSync(target), false);
    });
  }
  await t.test("duplicate", (t) => {
    const { directory, target } = fixture(t);
    const candidate = release(directory, "release", { [newName]: "new chunk" });
    candidate.manifest.files.push({ ...candidate.manifest.files[0]! });
    candidate.save();
    assert.throws(() => publishAssets(candidate.root, target), /duplicate manifest asset/u);
    assert.equal(existsSync(target), false);
  });
});

test("source directory aliases cannot publish bytes from outside the immutable release", (t) => {
  const { directory, target } = fixture(t);
  const candidate = release(directory, "release", { [newName]: "new chunk" });
  const alias = join(directory, "aliased-release");
  linkDirectory(candidate.root, alias);
  assert.throws(() => publishAssets(alias, target), /asset source must not traverse symlinks/u);
  assert.equal(existsSync(target), false);
});

test("a source file symlink is rejected even when its bytes match the manifest", (t) => {
  const { directory, target } = fixture(t);
  const candidate = release(directory, "release", { [newName]: "new chunk" });
  const outside = join(directory, "outside.js");
  const source = join(candidate.root, `frontend/dist/assets/${newName}`);
  writeFileSync(outside, "new chunk");
  rmSync(source);
  if (!linkFile(t, outside, source)) return;
  assert.throws(() => publishAssets(candidate.root, target));
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(outside, "utf8"), "new chunk");
});

test("existing and dangling destination file symlinks are never followed or replaced", async (t) => {
  for (const dangling of [false, true]) {
    await t.test(dangling ? "dangling" : "existing", (t) => {
      const { directory, target } = fixture(t);
      const candidate = release(directory, "release", { [newName]: "new chunk" });
      const outside = join(directory, "outside.js");
      if (!dangling) writeFileSync(outside, "new chunk");
      mkdirSync(target, { recursive: true });
      const destination = join(target, newName);
      if (!linkFile(t, outside, destination)) return;
      assert.throws(() => publishAssets(candidate.root, target));
      assert.ok(lstatSync(destination).isSymbolicLink());
      assert.equal(existsSync(outside), !dangling);
      if (!dangling) assert.equal(readFileSync(outside, "utf8"), "new chunk");
    });
  }
});

test("existing destination directory aliases cannot receive public assets", (t) => {
  const { directory } = fixture(t);
  const candidate = release(directory, "release", { [newName]: "new chunk" });
  const outside = join(directory, "outside");
  const alias = join(directory, "aliased-public-assets");
  mkdirSync(outside);
  linkDirectory(outside, alias);
  assert.throws(() => publishAssets(candidate.root, alias));
  assert.deepEqual(readdirSync(outside), []);
});

test("destination parent aliases are rejected before creating a directory outside the public root", (t) => {
  const { directory } = fixture(t);
  const candidate = release(directory, "release", { [newName]: "new chunk" });
  const outside = join(directory, "outside");
  const alias = join(directory, "aliased-public-assets");
  mkdirSync(outside);
  linkDirectory(outside, alias);
  assert.throws(() => publishAssets(candidate.root, join(alias, "assets")));
  assert.deepEqual(readdirSync(outside), []);
});

test("a directory occupying an asset name is preserved and rejected", (t) => {
  const { directory, target } = fixture(t);
  const candidate = release(directory, "release", { [newName]: "new chunk" });
  mkdirSync(join(target, newName), { recursive: true });
  assert.throws(() => publishAssets(candidate.root, target));
  assert.ok(lstatSync(join(target, newName)).isDirectory());
});
