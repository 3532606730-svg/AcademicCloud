import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { verifyTesseractRuntime } from "./tesseract-runtime.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(scriptDirectory, "..");
const repositoryOutputDirectory = join(repositoryDirectory, "output");
const manifestName = "ARTIFACT-MANIFEST.json";
const pdfJsRuntimePolicy = Object.freeze({
  entrypoint: "pdfjs-dist/legacy/build/pdf.mjs",
  version: "6.2.108",
  canvasPackage: "@napi-rs/canvas",
  canvasVersion: "1.0.7",
  canvasNativePackage: "@napi-rs/canvas-linux-x64-gnu",
  canvasNativeModulePath: "node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node",
});
const requiredRuntimePaths = [
  "package.json",
  "package-lock.json",
  "backend/package.json",
  "backend/dist/main.js",
  "backend/dist/persistence/sqlite/migrate.js",
  "backend/dist/operations/account-main.js",
  "backend/dist/operations/backup-main.js",
  "backend/dist/operations/recovery-main.js",
  "backend/dist/maintenance/main.js",
  "backend/scripts/compiled-acceptance.mjs",
  "frontend/dist/index.html",
  "database/migrations",
  "deployment/env/academiccloud.env.example",
  "deployment/nginx/academiccloud.conf",
  "deployment/nginx/academiccloud-security-headers.conf",
  "deployment/systemd/academiccloud.service",
  "deployment/logrotate/academiccloud-nginx",
  "deployment/journald/90-academiccloud-retention.conf",
  "node_modules/argon2",
  "node_modules/better-sqlite3",
  "node_modules/pdfjs-dist",
  "node_modules/@napi-rs/canvas",
  "node_modules/@napi-rs/canvas-linux-x64-gnu",
  "runtime/tesseract/bin/tesseract",
  "runtime/tesseract/lib",
  "runtime/tesseract/tessdata/eng.traineddata",
  "runtime/tesseract/tessdata/chi_sim.traineddata",
  "runtime/tesseract/tessdata/chi_tra.traineddata",
  "runtime/tesseract/licenses/tesseract-LICENSE",
  "runtime/tesseract/licenses/tessdata_fast-LICENSE",
  "runtime/tesseract/BUILD-EVIDENCE.json",
  "scripts/build-tesseract-runtime.sh",
  "scripts/production-artifact.mjs",
  "scripts/tesseract-runtime.mjs",
  "scripts/production-readiness-audit.mjs",
  "scripts/lib/production-readiness",
];
const forbiddenProductionModules = [
  "@testing-library",
  "@types",
  "concurrently",
  "jsdom",
  "react",
  "tsx",
  "typescript",
  "vite",
  "vitest",
];
const expectedNativeModulePaths = [
  pdfJsRuntimePolicy.canvasNativeModulePath,
  "node_modules/argon2/prebuilds/linux-x64/argon2.glibc.node",
  "node_modules/better-sqlite3/prebuilds/linux-x64.node",
];

const [command, ...argumentList] = process.argv.slice(2);
const options = parseOptions(argumentList);

switch (command) {
  case "prepare":
    prepareRelease(requiredOption("release"));
    break;
  case "finalize":
    finalizeRelease(
      requiredOption("release"),
      requiredOption("manifest"),
      requiredOption("commit"),
    );
    break;
  case "pack":
    packRelease(
      requiredOption("release"),
      requiredOption("archive"),
      requiredOption("checksum"),
    );
    break;
  case "verify":
    await verifyArchive(
      requiredOption("archive"),
      requiredOption("manifest"),
      requiredOption("checksum"),
      requiredOption("evidence"),
    );
    break;
  default:
    throw new Error("usage: production-artifact.mjs <prepare|finalize|pack|verify> --option=value");
}

function prepareRelease(releaseOption) {
  assertLinuxBuilder();
  const releaseDirectory = resolveOutputPath(releaseOption, "release directory");
  rmSync(releaseDirectory, { recursive: true, force: true });
  mkdirSync(join(releaseDirectory, "backend"), { recursive: true });
  mkdirSync(join(releaseDirectory, "frontend"), { recursive: true });

  copyRequired("package.json", releaseDirectory);
  copyRequired("package-lock.json", releaseDirectory);
  copyRequired("backend/package.json", releaseDirectory);
  copyRequired("frontend/package.json", releaseDirectory);

  process.stdout.write(`${JSON.stringify({ status: "prepared", releaseDirectory })}\n`);
}

function finalizeRelease(releaseOption, manifestOption, commit) {
  assertLinuxBuilder();
  assert.match(commit, /^[0-9a-f]{40}$/u, "commit must be a full lowercase Git SHA");
  const releaseDirectory = resolveOutputPath(releaseOption, "release directory");
  const manifestPath = resolveOutputPath(manifestOption, "manifest path");
  assert.ok(existsSync(join(releaseDirectory, "node_modules")), "production node_modules is missing");

  for (const source of [
    "backend/dist",
    "backend/scripts/compiled-acceptance.mjs",
    "frontend/dist",
    "database/migrations",
    "deployment/env/academiccloud.env.example",
    "deployment/nginx",
    "deployment/systemd",
    "deployment/logrotate",
    "deployment/journald",
    "scripts/production-artifact.mjs",
    "scripts/build-tesseract-runtime.sh",
    "scripts/tesseract-runtime.mjs",
    "scripts/production-readiness-audit.mjs",
    "scripts/lib/production-readiness",
  ]) {
    copyRequired(source, releaseDirectory);
  }

  const prePrunePdfJsRuntime = verifyPdfJsRuntime(releaseDirectory, "pre-prune");
  pruneNonRuntimePackageFiles(releaseDirectory);
  pruneNonTargetNativeModules(releaseDirectory);
  validateReleasePolicy(releaseDirectory);
  const postPrunePdfJsRuntime = verifyPdfJsRuntime(releaseDirectory, "post-prune");
  const tesseractRuntime = verifyTesseractRuntime(releaseDirectory);
  const files = collectManifestEntries(releaseDirectory);
  const manifest = {
    schemaVersion: 2,
    product: "AcademicCloud",
    sourceCommit: commit,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    npmVersion: commandOutput("npm", ["--version"]),
    requiredRuntimePaths,
    tesseractRuntime,
    files,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(releaseDirectory, manifestName), manifestText, { encoding: "utf8", mode: 0o644 });
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, manifestText, { encoding: "utf8", mode: 0o644 });

  process.stdout.write(`${JSON.stringify({
    status: "finalized",
    sourceCommit: commit,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
    pdfJsRuntime: {
      prePrune: prePrunePdfJsRuntime.status,
      postPrune: postPrunePdfJsRuntime.status,
      nativeModulePath: postPrunePdfJsRuntime.nativeModulePath,
    },
    tesseractRuntime: {
      status: tesseractRuntime.status,
      engine: tesseractRuntime.engine,
      sourceCommit: tesseractRuntime.source.commit,
      packagedLibraryCount: tesseractRuntime.dynamicClosure.packagedLibraries.length,
      languages: tesseractRuntime.languages,
    },
    manifestPath,
  })}\n`);
}

function packRelease(releaseOption, archiveOption, checksumOption) {
  assertLinuxBuilder();
  const releaseDirectory = resolveOutputPath(releaseOption, "release directory");
  const archivePath = resolveOutputPath(archiveOption, "archive path");
  const checksumPath = resolveOutputPath(checksumOption, "checksum path");
  assert.ok(existsSync(join(releaseDirectory, manifestName)), "internal manifest is missing");
  mkdirSync(dirname(archivePath), { recursive: true });
  rmSync(archivePath, { force: true });

  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    archivePath,
    "-C",
    releaseDirectory,
    ".",
  ]);
  const archiveSha256 = sha256File(archivePath);
  writeFileSync(checksumPath, `${archiveSha256}  ${basename(archivePath)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  process.stdout.write(`${JSON.stringify({ status: "packed", archivePath, archiveSha256 })}\n`);
}

async function verifyArchive(archiveOption, manifestOption, checksumOption, evidenceOption) {
  assertLinuxBuilder();
  const archivePath = resolveOutputPath(archiveOption, "archive path");
  const manifestPath = resolveOutputPath(manifestOption, "manifest path");
  const checksumPath = resolveOutputPath(checksumOption, "checksum path");
  const evidencePath = resolveOutputPath(evidenceOption, "evidence path");
  const expectedChecksum = readFileSync(checksumPath, "utf8").trim().split(/\s+/u);
  assert.equal(expectedChecksum.length, 2, "checksum file must contain one SHA-256 entry");
  assert.equal(expectedChecksum[1], basename(archivePath), "checksum filename does not match archive");
  const archiveSha256 = sha256File(archivePath);
  assert.equal(archiveSha256, expectedChecksum[0], "archive SHA-256 mismatch");

  const listing = commandOutput("tar", ["-tzf", archivePath]);
  for (const rawPath of listing.split(/\r?\n/u).filter(Boolean)) {
    if (rawPath === "./") continue;
    const normalized = rawPath.replace(/^\.\//u, "");
    assert.ok(normalized && !isAbsolute(normalized), `unsafe archive path: ${rawPath}`);
    assert.ok(!normalized.split("/").includes(".."), `unsafe archive traversal: ${rawPath}`);
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-prod-artifact-"));
  try {
    run("tar", ["-xzf", archivePath, "-C", temporaryDirectory]);
    const internalManifestPath = join(temporaryDirectory, manifestName);
    const externalManifestText = readFileSync(manifestPath, "utf8");
    const internalManifestText = readFileSync(internalManifestPath, "utf8");
    assert.equal(internalManifestText, externalManifestText, "internal/external manifests differ");
    const manifest = JSON.parse(internalManifestText);
    verifyManifest(temporaryDirectory, manifest);
    validateReleasePolicy(temporaryDirectory);

    const runtime = await verifyRuntime(temporaryDirectory);
    const evidence = {
      schemaVersion: 1,
      status: "ok",
      sourceCommit: manifest.sourceCommit,
      archive: basename(archivePath),
      archiveSha256,
      manifestSha256: sha256Text(internalManifestText),
      manifestFileCount: manifest.files.length,
      manifestTotalBytes: manifest.files.reduce((sum, file) => sum + (file.size ?? 0), 0),
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      npmVersion: commandOutput("npm", ["--version"]),
      ...runtime,
    };
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o644,
    });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    safeRemoveTemporaryDirectory(temporaryDirectory);
  }
}

async function verifyRuntime(releaseDirectory) {
  const requireFromRelease = createRequire(join(releaseDirectory, "package.json"));
  const Database = requireFromRelease("better-sqlite3");
  const argon2 = requireFromRelease("argon2");
  const database = new Database(":memory:");
  let sqliteVersion;
  try {
    sqliteVersion = database.prepare("select sqlite_version() as version").get().version;
    database.exec("create table artifact_probe (id integer primary key, value text not null)");
    database.prepare("insert into artifact_probe (value) values (?)").run("ok");
    assert.equal(database.prepare("select value from artifact_probe").pluck().get(), "ok");
  } finally {
    database.close();
  }

  const password = randomBytes(24).toString("base64url");
  const encodedHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
  assert.match(encodedHash, /^\$argon2id\$v=19\$m=65536,p=1,t=3\$/u);
  assert.equal(await argon2.verify(encodedHash, password), true);

  const nativeModules = collectNativeModulePaths(releaseDirectory);
  assert.deepEqual(nativeModules, expectedNativeModulePaths, "unexpected production native module set");
  for (const nativeModule of nativeModules) verifyElfX64(join(releaseDirectory, ...nativeModule.split("/")));
  const pdfJsRuntime = verifyPdfJsRuntime(releaseDirectory, "extracted");
  const tesseractRuntime = verifyTesseractRuntime(releaseDirectory);

  const acceptance = spawnSync(
    process.execPath,
    [join(releaseDirectory, "backend", "scripts", "compiled-acceptance.mjs")],
    {
      cwd: releaseDirectory,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
      timeout: 120_000,
    },
  );
  if (acceptance.status !== 0) {
    throw new Error(`artifact compiled acceptance failed: ${acceptance.stderr || acceptance.stdout}`);
  }
  const compiledAcceptance = JSON.parse(acceptance.stdout.trim());
  assert.equal(compiledAcceptance.status, "ok");
  assert.equal(compiledAcceptance.compiledBuild, true);

  return {
    betterSqlite3: { status: "ok", sqliteVersion },
    argon2id: { status: "ok", parameters: "m=65536,t=3,p=1", verified: true },
    nativeModules: { status: "ok", format: "ELF64 x86-64", paths: nativeModules },
    pdfJsRuntime,
    tesseractRuntime,
    compiledAcceptance,
  };
}

function verifyPdfJsRuntime(releaseDirectory, stage) {
  assert.ok(["pre-prune", "post-prune", "extracted"].includes(stage), "invalid PDF.js runtime stage");
  const pdfJsPackage = JSON.parse(readFileSync(join(releaseDirectory, "node_modules", "pdfjs-dist", "package.json"), "utf8"));
  const canvasPackage = JSON.parse(readFileSync(join(releaseDirectory, "node_modules", "@napi-rs", "canvas", "package.json"), "utf8"));
  const canvasNativePackage = JSON.parse(readFileSync(
    join(releaseDirectory, "node_modules", "@napi-rs", "canvas-linux-x64-gnu", "package.json"),
    "utf8",
  ));
  assert.equal(pdfJsPackage.name, "pdfjs-dist");
  assert.equal(pdfJsPackage.version, pdfJsRuntimePolicy.version);
  assert.equal(pdfJsPackage.optionalDependencies?.[pdfJsRuntimePolicy.canvasPackage], "^1.0.0");
  assert.equal(canvasPackage.name, pdfJsRuntimePolicy.canvasPackage);
  assert.equal(canvasPackage.version, pdfJsRuntimePolicy.canvasVersion);
  assert.equal(canvasPackage.optionalDependencies?.[pdfJsRuntimePolicy.canvasNativePackage], pdfJsRuntimePolicy.canvasVersion);
  assert.equal(canvasNativePackage.name, pdfJsRuntimePolicy.canvasNativePackage);
  assert.equal(canvasNativePackage.version, pdfJsRuntimePolicy.canvasVersion);
  assert.deepEqual(canvasNativePackage.os, ["linux"]);
  assert.deepEqual(canvasNativePackage.cpu, ["x64"]);
  assert.deepEqual(canvasNativePackage.libc, ["glibc"]);
  verifyElfX64(join(releaseDirectory, ...pdfJsRuntimePolicy.canvasNativeModulePath.split("/")));

  const probe = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        "import { createRequire } from 'node:module';",
        "const require = createRequire(import.meta.url);",
        `const canvas = require(${JSON.stringify(pdfJsRuntimePolicy.canvasPackage)});`,
        "if (typeof canvas.DOMMatrix !== 'function') throw new Error('PDF.js DOMMatrix provider is unavailable');",
        `const pdfjs = await import(${JSON.stringify(pdfJsRuntimePolicy.entrypoint)});`,
        "if (typeof pdfjs.getDocument !== 'function') throw new Error('PDF.js getDocument export is unavailable');",
      ].join(" "),
    ],
    {
      cwd: releaseDirectory,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 30_000,
      windowsHide: true,
    },
  );
  assert.equal(probe.signal, null, `PDF.js ${stage} runtime probe was terminated`);
  assert.equal(probe.status, 0, `PDF.js ${stage} runtime probe failed`);

  return {
    status: "ok",
    stage,
    entrypoint: pdfJsRuntimePolicy.entrypoint,
    version: pdfJsRuntimePolicy.version,
    getDocument: true,
    domMatrixProvider: `${pdfJsRuntimePolicy.canvasPackage}@${pdfJsRuntimePolicy.canvasVersion}`,
    nativePackage: `${pdfJsRuntimePolicy.canvasNativePackage}@${pdfJsRuntimePolicy.canvasVersion}`,
    nativeModulePath: pdfJsRuntimePolicy.canvasNativeModulePath,
  };
}

function validateReleasePolicy(releaseDirectory) {
  for (const requiredPath of requiredRuntimePaths) {
    assert.ok(existsSync(join(releaseDirectory, ...requiredPath.split("/"))), `missing runtime path: ${requiredPath}`);
  }
  for (const moduleName of forbiddenProductionModules) {
    assert.equal(existsSync(join(releaseDirectory, "node_modules", moduleName)), false, `development module present: ${moduleName}`);
  }
  assert.deepEqual(
    collectNativeModulePaths(releaseDirectory),
    expectedNativeModulePaths,
    "artifact must contain only the approved Linux x64 glibc native modules",
  );
  for (const nativeModule of expectedNativeModulePaths) {
    verifyElfX64(join(releaseDirectory, ...nativeModule.split("/")));
  }
  for (const entry of collectManifestEntries(releaseDirectory)) {
    const lowerPath = entry.path.toLowerCase();
    assert.ok(!/(^|\/)\.env($|\.)/u.test(lowerPath), `environment file included: ${entry.path}`);
    assert.ok(!/\.(sqlite(?:-(?:wal|shm))?|log|exe|dll|cmd|ps1)$/u.test(lowerPath), `forbidden artifact file: ${entry.path}`);
    assert.ok(!/(^|\/)(coverage|\.git|\.vite|\.vs)(\/|$)/u.test(lowerPath), `cache or repository metadata included: ${entry.path}`);
  }
}

function pruneNonRuntimePackageFiles(releaseDirectory) {
  const nodeModulesDirectory = join(releaseDirectory, "node_modules");
  const removableDirectories = [];
  visit(nodeModulesDirectory);
  for (const directory of removableDirectories) rmSync(directory, { recursive: true, force: true });

  function visit(directory) {
    for (const name of readdirSync(directory)) {
      const candidate = join(directory, name);
      const stats = lstatSync(candidate);
      if (!stats.isDirectory()) continue;
      if (name === ".vs") {
        removableDirectories.push(candidate);
      } else {
        visit(candidate);
      }
    }
  }
}

function pruneNonTargetNativeModules(releaseDirectory) {
  const allowedPaths = new Set(expectedNativeModulePaths);
  for (const nativeModule of collectNativeModulePaths(releaseDirectory)) {
    if (!allowedPaths.has(nativeModule)) {
      rmSync(join(releaseDirectory, ...nativeModule.split("/")), { force: true });
    }
  }
  assert.deepEqual(
    collectNativeModulePaths(releaseDirectory),
    expectedNativeModulePaths,
    "failed to isolate the Linux x64 glibc native modules",
  );
}

function collectNativeModulePaths(releaseDirectory) {
  return collectManifestEntries(releaseDirectory)
    .filter((entry) => entry.type === "file" && entry.path.endsWith(".node"))
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function verifyManifest(releaseDirectory, manifest) {
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.product, "AcademicCloud");
  assert.equal(manifest.platform, "linux");
  assert.equal(manifest.architecture, "x64");
  assert.match(manifest.nodeVersion, /^v24\./u);
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/u);
  assert.deepEqual(manifest.requiredRuntimePaths, requiredRuntimePaths);
  assert.deepEqual(manifest.tesseractRuntime, verifyTesseractRuntime(releaseDirectory));
  const actualEntries = collectManifestEntries(releaseDirectory);
  assert.deepEqual(actualEntries, manifest.files, "artifact contents do not match manifest");
}

function collectManifestEntries(rootDirectory) {
  const entries = [];
  walk(rootDirectory, "");
  return entries.sort((left, right) => left.path.localeCompare(right.path, "en"));

  function walk(currentDirectory, relativeDirectory) {
    const names = readdirSync(currentDirectory).sort((left, right) => left.localeCompare(right, "en"));
    for (const name of names) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      if (relativePath === manifestName) continue;
      const absolutePath = join(currentDirectory, name);
      const stats = lstatSync(absolutePath);
      if (stats.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (stats.isSymbolicLink()) {
        const target = readlinkSync(absolutePath).replaceAll("\\", "/");
        const resolvedTarget = realpathSync(absolutePath);
        assertInside(rootDirectory, resolvedTarget, `symlink target for ${relativePath}`);
        entries.push({ path: relativePath, type: "symlink", target, sha256: sha256Text(target) });
      } else if (stats.isFile()) {
        entries.push({
          path: relativePath,
          type: "file",
          size: stats.size,
          mode: stats.mode & 0o777,
          sha256: sha256File(absolutePath),
        });
      } else {
        throw new Error(`unsupported artifact entry: ${relativePath}`);
      }
    }
  }
}

function copyRequired(sourceRelativePath, releaseDirectory) {
  const sourcePath = join(repositoryDirectory, ...sourceRelativePath.split("/"));
  assert.ok(existsSync(sourcePath), `required source is missing: ${sourceRelativePath}`);
  const destinationPath = join(releaseDirectory, ...sourceRelativePath.split("/"));
  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, { recursive: true, dereference: false, force: true });
}

function verifyElfX64(path) {
  const header = readFileSync(path).subarray(0, 20);
  assert.ok(header.length >= 20, `native module header too short: ${path}`);
  assert.deepEqual([...header.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46], `native module is not ELF: ${path}`);
  assert.equal(header[4], 2, `native module is not ELF64: ${path}`);
  assert.equal(header[5], 1, `native module is not little-endian: ${path}`);
  assert.equal(header.readUInt16LE(18), 0x3e, `native module is not x86-64: ${path}`);
}

function assertLinuxBuilder() {
  assert.equal(process.platform, "linux", "production artifacts must be built and verified on Linux");
  assert.equal(process.arch, "x64", "production artifacts must be built and verified on x64");
  assert.match(process.version, /^v24\./u, "production artifacts require Node.js 24.x");
}

function resolveOutputPath(candidate, label) {
  const resolvedPath = resolve(repositoryDirectory, candidate);
  assertInside(repositoryOutputDirectory, resolvedPath, label);
  assert.notEqual(resolvedPath, repositoryOutputDirectory, `${label} cannot be the output root`);
  return resolvedPath;
}

function assertInside(parent, candidate, label) {
  const relativePath = relative(resolve(parent), resolve(candidate));
  assert.ok(relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath), `${label} is outside the allowed root`);
}

function safeRemoveTemporaryDirectory(directory) {
  const resolvedDirectory = resolve(directory);
  const relativePath = relative(resolve(tmpdir()), resolvedDirectory);
  assert.ok(relativePath && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
  assert.ok(basename(resolvedDirectory).startsWith("academiccloud-prod-artifact-"));
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function commandOutput(executable, arguments_) {
  const result = spawnSync(executable, arguments_, { encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${executable} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function run(executable, arguments_) {
  const result = spawnSync(executable, arguments_, { encoding: "utf8", stdio: "inherit", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${executable} failed with exit code ${result.status}`);
}

function parseOptions(arguments_) {
  const parsed = new Map();
  for (const argument of arguments_) {
    const match = /^--([a-z-]+)=(.+)$/u.exec(argument);
    if (!match) throw new Error(`invalid option: ${argument}`);
    parsed.set(match[1], match[2]);
  }
  return parsed;
}

function requiredOption(name) {
  const value = options.get(name);
  if (!value) throw new Error(`missing --${name}=...`);
  return value;
}
