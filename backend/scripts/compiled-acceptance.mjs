import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { constants, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(backendDirectory, "..");
const distDirectory = join(backendDirectory, "dist");
const migrationsDirectory = join(repositoryDirectory, "database", "migrations");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-e08-"));
const databasePath = join(temporaryDirectory, "academiccloud.sqlite");
const backupPath = join(temporaryDirectory, "academiccloud.backup.sqlite");
const restoredPath = join(temporaryDirectory, "academiccloud.restored.sqlite");
const password = randomBytes(24).toString("base64url");
const port = await reservePort();
const environment = {
  ...process.env,
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: String(port),
  LOG_LEVEL: "silent",
  APP_ORIGIN: "https://cloud.example.edu",
  DATABASE_PATH: databasePath,
  MIGRATIONS_DIRECTORY: migrationsDirectory,
  STORAGE_PROVIDER: "aliyun-oss",
  OSS_ENDPOINT: "https://academiccloud-private.oss-ap-southeast-3.aliyuncs.com",
  OSS_REGION: "oss-ap-southeast-3",
  OSS_BUCKET: "academiccloud-private",
  OSS_ACCESS_KEY_ID: `local-${randomBytes(12).toString("hex")}`,
  OSS_ACCESS_KEY_SECRET: randomBytes(32).toString("base64url"),
  OSS_UPLOAD_AUTHORIZATION_SECONDS: "300",
  OSS_DOWNLOAD_AUTHORIZATION_SECONDS: "300",
  OSS_REQUEST_TIMEOUT_MILLISECONDS: "30000",
};

let application;

try {
  const firstMigration = runJson(join(distDirectory, "persistence", "sqlite", "migrate.js"));
  const account = runJson(
    join(distDirectory, "operations", "account-main.js"),
    ["--login=CompiledAcceptance", "--password-stdin"],
    environment,
    `${password}\n`,
  );

  application = startApplication();
  const health = await waitForJson(`http://127.0.0.1:${port}/api/health`);
  const readiness = await fetchJson(`http://127.0.0.1:${port}/api/ready`);
  const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: environment.APP_ORIGIN,
    },
    body: JSON.stringify({ loginName: "CompiledAcceptance", password }),
  });

  if (loginResponse.status !== 200) throw new Error("compiled login failed");
  const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("__Host-ac_session=")) throw new Error("compiled session cookie missing");
  await stopApplication(application);
  application = undefined;

  application = startApplication();
  await waitForJson(`http://127.0.0.1:${port}/api/health`);
  const session = await fetchJson(`http://127.0.0.1:${port}/api/auth/session`, {
    headers: { cookie },
  });
  await stopApplication(application);
  application = undefined;

  const maintenance = runJson(join(distDirectory, "maintenance", "main.js"));
  const createdBackup = runJson(
    join(distDirectory, "operations", "backup-main.js"),
    ["create", `--output=${backupPath}`],
  );
  const verifiedBackup = runJson(
    join(distDirectory, "operations", "backup-main.js"),
    ["verify", `--input=${backupPath}`],
  );
  copyFileSync(backupPath, restoredPath, constants.COPYFILE_EXCL);
  const verifiedRestore = runJson(
    join(distDirectory, "operations", "backup-main.js"),
    ["verify", `--input=${restoredPath}`],
  );
  const restoredEnvironment = { ...environment, DATABASE_PATH: restoredPath };
  application = startApplication(restoredEnvironment);
  const restoredReadiness = await waitForJson(`http://127.0.0.1:${port}/api/ready`);
  const restoredSession = await fetchJson(`http://127.0.0.1:${port}/api/auth/session`, {
    headers: { cookie },
  });
  await stopApplication(application);
  application = undefined;
  const redeployMigration = runJson(join(distDirectory, "persistence", "sqlite", "migrate.js"));

  const result = {
    status: "ok",
    compiledBuild: true,
    firstMigrationCount: firstMigration.appliedVersions.length,
    provisionedLogin: account.account.loginName,
    health: health.status,
    readiness: readiness.status,
    sessionSurvivedRestart: session.account.loginName === "CompiledAcceptance",
    maintenanceDryRun: maintenance.mode === "dry_run",
    backupVerified: createdBackup.sha256 === verifiedBackup.sha256,
    isolatedRestoreVerified: verifiedRestore.sha256 === verifiedBackup.sha256,
    restoredReadiness: restoredReadiness.status,
    restoredSessionValid: restoredSession.account.loginName === "CompiledAcceptance",
    redeployMigrationCount: redeployMigration.appliedVersions.length,
  };
  assert.equal(result.firstMigrationCount, 7);
  assert.equal(result.provisionedLogin, "CompiledAcceptance");
  assert.equal(result.health, "ok");
  assert.equal(result.readiness, "ready");
  assert.equal(result.sessionSurvivedRestart, true);
  assert.equal(result.maintenanceDryRun, true);
  assert.equal(result.backupVerified, true);
  assert.equal(result.isolatedRestoreVerified, true);
  assert.equal(result.restoredReadiness, "ready");
  assert.equal(result.restoredSessionValid, true);
  assert.equal(result.redeployMigrationCount, 0);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  if (application) await stopApplication(application);
  const resolvedTemporaryDirectory = resolve(temporaryDirectory);
  const resolvedSystemTemp = resolve(tmpdir());
  const relativeTemporaryDirectory = relative(resolvedSystemTemp, resolvedTemporaryDirectory);

  if (
    !relativeTemporaryDirectory ||
    relativeTemporaryDirectory.startsWith("..") ||
    isAbsolute(relativeTemporaryDirectory) ||
    !basename(resolvedTemporaryDirectory).startsWith("academiccloud-e08-")
  ) {
    throw new Error("refusing to clean a directory outside the acceptance prefix");
  }

  rmSync(resolvedTemporaryDirectory, { recursive: true, force: true });
}

function runJson(entrypoint, arguments_ = [], childEnvironment = environment, input) {
  const result = spawnSync(process.execPath, [entrypoint, ...arguments_], {
    cwd: repositoryDirectory,
    encoding: "utf8",
    env: childEnvironment,
    input,
    timeout: 30_000,
    windowsHide: true,
  });

  if (result.status !== 0) throw new Error(`compiled command failed: ${entrypoint}`);
  return JSON.parse(result.stdout);
}

function startApplication(childEnvironment = environment) {
  return spawn(process.execPath, [join(distDirectory, "main.js")], {
    cwd: repositoryDirectory,
    env: childEnvironment,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function stopApplication(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 5_000)),
  ]);

  if (!stopped) {
    child.kill("SIGKILL");
    await exited;
    throw new Error("compiled API required forced termination");
  }
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve a loopback port");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function waitForJson(url) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      return await fetchJson(url);
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }

  throw new Error("compiled API did not become healthy");
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`compiled API returned HTTP ${response.status}`);
  return response.json();
}
