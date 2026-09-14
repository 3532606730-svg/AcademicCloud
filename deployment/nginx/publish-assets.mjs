import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetPrefix = "frontend/dist/assets/";
const assetName = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|woff2?|png|jpe?g|gif|webp|svg|ico)$/u;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function assertRealDirectory(directory) {
  const stats = lstatSync(directory);
  assert.ok(stats.isDirectory() && !stats.isSymbolicLink());
  assert.equal(realpathSync(directory), directory, "asset destination must not traverse symlinks");
}

/** Publish only manifest-verified public assets. Never overwrite or prune. */
export function publishAssets(releaseRoot, targetDirectory) {
  const root = resolve(releaseRoot);
  const target = resolve(targetDirectory);
  const manifest = JSON.parse(readFileSync(join(root, "ARTIFACT-MANIFEST.json"), "utf8"));
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.ok(Array.isArray(manifest.files));
  const assets = manifest.files.filter((entry) => entry.path.startsWith(assetPrefix));
  assert.ok(assets.length > 0, "the release must contain public assets");
  const names = new Set();
  const verified = assets.map((entry) => {
    const name = entry.path.slice(assetPrefix.length);
    assert.match(name, assetName, "only content-hashed public asset names may be retained");
    assert.ok(!names.has(name), "duplicate manifest asset");
    names.add(name);
    assert.equal(entry.type, "file");
    const source = join(root, entry.path);
    assert.ok(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink());
    assert.equal(realpathSync(source), source, "asset source must not traverse symlinks");
    const bytes = readFileSync(source);
    assert.equal(bytes.length, entry.size);
    assert.equal(digest(bytes), entry.sha256, "asset must match the verified release manifest");
    return { name, bytes };
  });
  // Validate existing ancestors before mkdir can follow an alias and create
  // directories outside the public asset root. Recheck the completed path too.
  let ancestor = target;
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    const parent = dirname(ancestor);
    assert.notEqual(parent, ancestor, "asset destination must have an existing ancestor");
    ancestor = parent;
  }
  assertRealDirectory(ancestor);
  mkdirSync(target, { recursive: true, mode: 0o755 });
  assertRealDirectory(target);
  // Check the entire publication before adding files, so a hash-name collision
  // cannot silently replace a chunk still used by an older open browser tab.
  for (const { name, bytes } of verified) {
    const destination = join(target, name);
    if (!existsSync(destination)) continue;
    assert.ok(lstatSync(destination).isFile() && !lstatSync(destination).isSymbolicLink());
    assert.ok(readFileSync(destination).equals(bytes), "retained asset name collision");
  }
  let added = 0;
  for (const { name, bytes } of verified) {
    const destination = join(target, name);
    if (existsSync(destination)) continue;
    writeFileSync(destination, bytes, { flag: "wx", mode: 0o444 });
    added++;
  }
  return { sourceCommit: manifest.sourceCommit, assets: verified.length, added };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const releaseRoot = process.argv[2];
  assert.match(releaseRoot ?? "", /^\/opt\/academiccloud\/releases\/[a-f0-9]{40}$/u);
  const result = publishAssets(releaseRoot, "/opt/academiccloud/public-assets/assets");
  console.log(JSON.stringify(result));
}
