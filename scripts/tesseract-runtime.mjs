import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, relative } from "node:path";

export const tesseractRuntimePolicy = Object.freeze({
  directory: "runtime/tesseract",
  executable: "runtime/tesseract/bin/tesseract",
  libraryDirectory: "runtime/tesseract/lib",
  tessdataDirectory: "runtime/tesseract/tessdata",
  buildEvidence: "runtime/tesseract/BUILD-EVIDENCE.json",
  version: "5.5.3",
  sourceTag: "5.5.3",
  sourceTagObject: "6951ffe10ce031374bcd04fe400811da1e7e04ad",
  sourceCommit: "db0ec62f81b0737fbbe184d8fea40af5738f8eef",
  sourceArchiveUrl: "https://github.com/tesseract-ocr/tesseract/archive/refs/tags/5.5.3.tar.gz",
  sourceArchiveSha256: "9218e62793116d42a9f6d14cd9348518b27f382096eea3d0f2d1a24616bb5884",
  builderImage: "ubuntu@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316",
  aptSnapshot: "20260818T000000Z",
  tessdataVersion: "4.1.0",
  tessdataTagObject: "a8ba5063ab8013372a20e300da0c97ee46b92b07",
  tessdataCommit: "65727574dfcd264acbb0c3e07860e4e9e9b22185",
  models: Object.freeze({
    eng: "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
    chi_sim: "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730",
    chi_tra: "529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b",
  }),
  licenseSha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
});

const baselineLibraries = new Set([
  "ld-linux-x86-64.so.2",
  "libc.so.6",
  "libdl.so.2",
  "libm.so.6",
  "libpthread.so.0",
  "librt.so.1",
  "linux-vdso.so.1",
]);

export function verifyTesseractRuntime(releaseDirectory) {
  const runtimeDirectory = join(releaseDirectory, ...tesseractRuntimePolicy.directory.split("/"));
  const executablePath = join(releaseDirectory, ...tesseractRuntimePolicy.executable.split("/"));
  const libraryDirectory = join(releaseDirectory, ...tesseractRuntimePolicy.libraryDirectory.split("/"));
  const tessdataDirectory = join(releaseDirectory, ...tesseractRuntimePolicy.tessdataDirectory.split("/"));
  const evidencePath = join(releaseDirectory, ...tesseractRuntimePolicy.buildEvidence.split("/"));

  for (const path of [runtimeDirectory, executablePath, libraryDirectory, tessdataDirectory, evidencePath]) {
    assert.ok(existsSync(path), `missing release-local Tesseract path: ${path}`);
  }

  const buildEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  verifyBuildEvidence(buildEvidence);

  const modelEvidence = Object.entries(tesseractRuntimePolicy.models).map(([language, expectedSha256]) => {
    const path = join(tessdataDirectory, `${language}.traineddata`);
    assert.ok(existsSync(path), `missing Tesseract language model: ${language}`);
    const sha256 = sha256File(path);
    assert.equal(sha256, expectedSha256, `Tesseract language model hash mismatch: ${language}`);
    return { language, path: `tessdata/${language}.traineddata`, sha256, size: lstatSync(path).size };
  });

  for (const notice of ["tesseract-LICENSE", "tessdata_fast-LICENSE"]) {
    assert.equal(
      sha256File(join(runtimeDirectory, "licenses", notice)),
      tesseractRuntimePolicy.licenseSha256,
      `upstream notice hash mismatch: ${notice}`,
    );
  }

  const runtimeFiles = collectRuntimeFiles(runtimeDirectory);
  const elfFiles = runtimeFiles
    .filter((entry) => entry.path === "bin/tesseract" || entry.path.startsWith("lib/"))
    .map((entry) => entry.path);
  assert.ok(elfFiles.length >= 3, "release-local Tesseract closure is unexpectedly small");
  for (const path of elfFiles) {
    const absolutePath = join(runtimeDirectory, ...path.split("/"));
    verifyElfX64(absolutePath);
    const bytes = readFileSync(absolutePath);
    assert.equal(bytes.includes(Buffer.from("/tmp/academiccloud-tesseract-5.5.3")), false, `build path leaked into ${path}`);
    assert.equal(bytes.includes(Buffer.from("/work/")), false, `CI workspace path leaked into ${path}`);
  }

  const closure = verifyDynamicClosure(runtimeDirectory, executablePath, libraryDirectory, elfFiles);
  const childEnvironment = {
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    LD_LIBRARY_PATH: libraryDirectory,
    TESSDATA_PREFIX: tessdataDirectory,
  };
  const version = runChecked(executablePath, ["--version"], {
    cwd: runtimeDirectory,
    env: childEnvironment,
    timeout: 10_000,
  });
  assert.match(version, /^tesseract 5\.5\.3(?:\s|$)/u, "release-local Tesseract version mismatch");

  const languages = runChecked(executablePath, ["--tessdata-dir", tessdataDirectory, "--list-langs"], {
    cwd: runtimeDirectory,
    env: childEnvironment,
    timeout: 10_000,
  });
  const discoveredLanguages = languages.split(/\s+/u).filter((value) => Object.hasOwn(tesseractRuntimePolicy.models, value)).sort();
  assert.deepEqual(discoveredLanguages, ["chi_sim", "chi_tra", "eng"]);

  const requireFromRelease = createRequire(join(releaseDirectory, "package.json"));
  const { createCanvas } = requireFromRelease("@napi-rs/canvas");
  const canvas = createCanvas(900, 150);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.font = "bold 58px sans-serif";
  context.fillText("ACADEMIC CLOUD 2026", 35, 100);
  const probe = spawnSync(
    executablePath,
    ["--tessdata-dir", tessdataDirectory, "stdin", "stdout", "-l", "eng", "--oem", "1", "--psm", "7", "tsv"],
    {
      cwd: runtimeDirectory,
      env: childEnvironment,
      input: canvas.toBuffer("image/png"),
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  assert.equal(probe.signal, null, "release-local Tesseract synthetic probe was terminated");
  assert.equal(probe.status, 0, `release-local Tesseract synthetic probe failed: ${probe.stderr}`);
  const normalizedProbe = probe.stdout.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, " ");
  assert.match(normalizedProbe, /ACADEMIC/u, "synthetic OCR probe did not recognize ACADEMIC");
  assert.match(normalizedProbe, /CLOUD/u, "synthetic OCR probe did not recognize CLOUD");

  return {
    status: "ok",
    engine: `tesseract ${tesseractRuntimePolicy.version}`,
    source: buildEvidence.tesseractSource,
    builder: buildEvidence.builder,
    tessdata: {
      ...buildEvidence.tessdataSource,
      models: modelEvidence,
    },
    runtimePackages: buildEvidence.runtimePackages,
    runtimeFiles,
    dynamicClosure: closure,
    languages: discoveredLanguages,
    syntheticProbe: { status: "ok", input: "generated PNG: ACADEMIC CLOUD 2026", output: "ACADEMIC CLOUD" },
    networkRequired: false,
  };
}

function verifyBuildEvidence(evidence) {
  assert.equal(evidence.schemaVersion, 1);
  assert.deepEqual(evidence.tesseractSource, {
    tag: tesseractRuntimePolicy.sourceTag,
    tagObject: tesseractRuntimePolicy.sourceTagObject,
    commit: tesseractRuntimePolicy.sourceCommit,
    tagSignatureVerified: true,
    archiveUrl: tesseractRuntimePolicy.sourceArchiveUrl,
    archiveSha256: tesseractRuntimePolicy.sourceArchiveSha256,
  });
  assert.deepEqual(evidence.tessdataSource, {
    tag: tesseractRuntimePolicy.tessdataVersion,
    tagObject: tesseractRuntimePolicy.tessdataTagObject,
    commit: tesseractRuntimePolicy.tessdataCommit,
    tagSignatureVerified: true,
  });
  assert.equal(evidence.builder.image, tesseractRuntimePolicy.builderImage);
  assert.equal(evidence.builder.aptSnapshot, tesseractRuntimePolicy.aptSnapshot);
  assert.equal(evidence.builder.architecture, "amd64");
  assert.match(evidence.builder.osRelease, /^ubuntu 24\.04$/u);
  assert.match(evidence.builder.compiler, /g\+\+.*13\./u);
  assert.match(evidence.builder.cmake, /^cmake version 3\./u);
  assert.match(evidence.builder.ninja, /^1\./u);
  assert.match(evidence.builder.sourceDateEpoch, /^\d{10}$/u);
  assert.ok(Array.isArray(evidence.builder.packages) && evidence.builder.packages.length >= 10);
  assert.ok(Array.isArray(evidence.runtimePackages) && evidence.runtimePackages.length >= 2);
  for (const packageRecord of [...evidence.builder.packages, ...evidence.runtimePackages]) {
    assert.match(packageRecord.name, /^[a-z0-9][a-z0-9+.-]*(?::amd64)?$/u);
    assert.match(packageRecord.version, /^[A-Za-z0-9][A-Za-z0-9.+:~_-]*$/u);
  }
}

function verifyDynamicClosure(runtimeDirectory, executablePath, libraryDirectory, elfFiles) {
  const packagedNames = new Set(elfFiles.filter((path) => path.startsWith("lib/")).map((path) => basename(path)));
  for (const name of packagedNames) assert.equal(baselineLibraries.has(name), false, `baseline library was packaged: ${name}`);
  const neededByFile = new Map();
  for (const path of elfFiles) {
    const absolutePath = join(runtimeDirectory, ...path.split("/"));
    const output = runChecked("readelf", ["--dynamic", absolutePath], { timeout: 10_000 });
    const needed = [...output.matchAll(/\(NEEDED\).*Shared library: \[([^\]]+)\]/gu)].map((match) => match[1]).sort();
    assert.ok(needed.length >= 1, `ELF has no dynamic dependencies: ${path}`);
    for (const name of needed) {
      assert.ok(packagedNames.has(name) || baselineLibraries.has(name), `dependency outside bounded closure: ${path} -> ${name}`);
    }
    const expectedRunpath = path === "bin/tesseract" ? "$ORIGIN/../lib" : "$ORIGIN";
    const runpath = /\((?:RUNPATH|RPATH)\).*Library (?:run)?path: \[([^\]]+)\]/u.exec(output)?.[1];
    assert.equal(runpath, expectedRunpath, `unexpected release-local runpath: ${path}`);
    neededByFile.set(path, needed);
  }

  const reachable = new Set();
  const queue = ["bin/tesseract"];
  while (queue.length > 0) {
    const path = queue.shift();
    if (reachable.has(path)) continue;
    reachable.add(path);
    for (const name of neededByFile.get(path) ?? []) {
      if (packagedNames.has(name)) queue.push(`lib/${name}`);
    }
  }
  assert.deepEqual(
    [...reachable].filter((path) => path.startsWith("lib/")).sort(),
    elfFiles.filter((path) => path.startsWith("lib/")).sort(),
    "release-local closure contains an unreachable library",
  );

  const ldd = runChecked("ldd", [executablePath], {
    env: { ...process.env, LD_LIBRARY_PATH: libraryDirectory },
    timeout: 10_000,
  });
  verifyLddResolution(ldd, libraryDirectory);

  return {
    format: "ELF64 x86-64",
    executable: "bin/tesseract",
    packagedLibraries: [...packagedNames].sort(),
    baselineLibraries: [...new Set([...neededByFile.values()].flat().filter((name) => baselineLibraries.has(name)))].sort(),
    unresolved: false,
    workspaceReferences: false,
  };
}

export function verifyLddResolution(ldd, libraryDirectory) {
  assert.doesNotMatch(ldd, /not found/iu, "release-local dynamic dependency is unresolved");
  const prohibitedBuildPath = /\/work\/|\/tmp\/academiccloud-tesseract-5\.5\.3/iu;
  for (const line of ldd.split(/\r?\n/u)) {
    const match = /^\s*([^\s]+)\s+=>\s+(\/[^\s]+)/u.exec(line);
    if (!match) continue;
    if (baselineLibraries.has(match[1])) {
      assert.doesNotMatch(match[2], prohibitedBuildPath, `baseline dependency resolved into a build workspace: ${line}`);
    } else {
      assert.ok(
        match[2].startsWith(`${libraryDirectory}/`),
        `runtime dependency escaped local library directory: ${line}`,
      );
    }
  }
}

function collectRuntimeFiles(rootDirectory) {
  const files = [];
  walk(rootDirectory, "");
  return files.sort((left, right) => left.path.localeCompare(right.path, "en"));

  function walk(directory, relativeDirectory) {
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right, "en"))) {
      const absolutePath = join(directory, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const stats = lstatSync(absolutePath);
      assert.equal(stats.isSymbolicLink(), false, `Tesseract runtime symlink is prohibited: ${relativePath}`);
      if (stats.isDirectory()) {
        walk(absolutePath, relativePath);
      } else {
        assert.equal(stats.isFile(), true, `unsupported Tesseract runtime entry: ${relativePath}`);
        files.push({ path: relativePath, size: stats.size, mode: stats.mode & 0o777, sha256: sha256File(absolutePath) });
      }
    }
  }
}

function verifyElfX64(path) {
  const header = readFileSync(path).subarray(0, 20);
  assert.ok(header.length >= 20, `ELF header too short: ${path}`);
  assert.deepEqual([...header.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46], `not ELF: ${path}`);
  assert.equal(header[4], 2, `not ELF64: ${path}`);
  assert.equal(header[5], 1, `not little-endian ELF: ${path}`);
  assert.equal(header.readUInt16LE(18), 0x3e, `not x86-64 ELF: ${path}`);
}

function runChecked(executable, arguments_, options = {}) {
  const result = spawnSync(executable, arguments_, { encoding: "utf8", windowsHide: true, ...options });
  assert.equal(result.signal, null, `${executable} was terminated`);
  assert.equal(result.status, 0, `${executable} failed: ${result.stderr || result.stdout}`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
