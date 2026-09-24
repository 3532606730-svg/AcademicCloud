import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetPrefix = "frontend/dist/assets/";
const flatName = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|woff2?|png|jpe?g|gif|webp|svg|ico)$/u;
const pdfRootName = /^pdfjs-6\.2\.108-[a-f0-9]{64}$/u;
const pdfPath = /^(?:pdf\.worker\.min\.mjs|LICENSE\.txt|(?:cmaps|standard_fonts|wasm|iccs)\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)$/u;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stat = (path) => lstatSync(path, { throwIfNoEntry: false });

function assertDirectory(path) {
  const value = lstatSync(path);
  assert.ok(value.isDirectory() && !value.isSymbolicLink(), "asset directory must not be a symlink");
  assert.equal(realpathSync(path), path, "asset path must not traverse symlinks");
}
function validateAncestor(path) {
  let ancestor = path;
  while (!stat(ancestor)) { const parent = dirname(ancestor); assert.notEqual(parent, ancestor); ancestor = parent; }
  assertDirectory(ancestor);
}

/** Verify every source and collision before publishing; retain all old assets. */
export function publishAssets(releaseRoot, targetDirectory) {
  const root = resolve(releaseRoot), target = resolve(targetDirectory);
  const manifest = JSON.parse(readFileSync(join(root, "ARTIFACT-MANIFEST.json"), "utf8"));
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.ok(Array.isArray(manifest.files));
  const entries = manifest.files.filter((entry) => typeof entry.path === "string" && entry.path.startsWith(assetPrefix));
  assert.ok(entries.length > 0, "release must contain public assets");
  const names = new Set();
  const groups = new Map();
  const verified = entries.map((entry) => {
    const name = entry.path.slice(assetPrefix.length);
    assert.ok(!names.has(name), "duplicate manifest asset"); names.add(name);
    assert.equal(entry.type, "file");
    const slash = name.indexOf("/");
    if (slash < 0) assert.match(name, flatName, "only content-hashed public assets may be retained");
    else {
      const group = name.slice(0, slash), path = name.slice(slash + 1);
      assert.match(group, pdfRootName); assert.match(path, pdfPath);
      assert.ok(!path.split("/").some((segment) => segment === "." || segment === ".."));
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ path, entry });
    }
    const source = join(root, entry.path);
    const value = lstatSync(source);
    assert.ok(value.isFile() && !value.isSymbolicLink());
    assert.equal(realpathSync(source), source, "source must not traverse symlinks");
    const bytes = readFileSync(source);
    assert.equal(bytes.length, entry.size); assert.equal(digest(bytes), entry.sha256, "asset manifest mismatch");
    return { name, bytes };
  });
  for (const [group, files] of groups) {
    const hash = createHash("sha256");
    for (const { path, entry } of files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) hash.update(path + "\0" + entry.size + "\0" + entry.sha256 + "\n");
    assert.equal(hash.digest("hex"), group.slice(-64), "PDF asset directory digest mismatch");
  }
  validateAncestor(target);
  for (const { name, bytes } of verified) {
    const destination = join(target, name);
    validateAncestor(dirname(destination));
    const value = stat(destination);
    if (!value) continue;
    assert.ok(value.isFile() && !value.isSymbolicLink());
    assert.equal(realpathSync(destination), destination);
    assert.ok(readFileSync(destination).equals(bytes), "retained asset name collision");
  }
  let added = 0;
  for (const { name, bytes } of verified) {
    const destination = join(target, name);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o755 });
    assertDirectory(dirname(destination));
    if (stat(destination)) continue;
    writeFileSync(destination, bytes, { flag: "wx", mode: 0o444 }); added++;
  }
  return { sourceCommit: manifest.sourceCommit, assets: verified.length, added };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const releaseRoot = process.argv[2];
  assert.match(releaseRoot ?? "", /^\/opt\/academiccloud\/releases\/[a-f0-9]{40}$/u);
  console.log(JSON.stringify(publishAssets(releaseRoot, "/opt/academiccloud/public-assets/assets")));
}
