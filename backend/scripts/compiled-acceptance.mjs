import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { constants, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import {
  createBoundedStartupDiagnostics,
  describeStartupExit,
} from "../dist/deployment/compiled-startup-diagnostics.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(backendDirectory, "..");
const distDirectory = join(backendDirectory, "dist");
const migrationsDirectory = join(repositoryDirectory, "database", "migrations");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-e08-"));
const databasePath = join(temporaryDirectory, "academiccloud.sqlite");
const backupPath = join(temporaryDirectory, "academiccloud.backup.sqlite");
const backupReceiptPath = join(temporaryDirectory, "academiccloud.backup.receipt.json");
const restoredPath = join(temporaryDirectory, "academiccloud.restored.sqlite");
const password = randomBytes(24).toString("base64url");
const memberPassword = randomBytes(24).toString("base64url");
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
const applicationDiagnostics = new WeakMap();

try {
  const firstMigration = runJson(join(distDirectory, "persistence", "sqlite", "migrate.js"));
  const account = runJson(
    join(distDirectory, "operations", "account-main.js"),
    ["--login=CompiledAcceptance", "--password-stdin"],
    environment,
    `${password}\n`,
  );
  const compiledFileId = `compiled-file-${randomBytes(8).toString("hex")}`;
  seedCompiledFile(databasePath, account.account.id, compiledFileId);
  const compiledHolding = seedCompiledLibraryHolding(databasePath, account.account.id);

  application = startApplication();
  const health = await waitForJson(`http://127.0.0.1:${port}/api/health`, application);
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
  const metadataBefore = await fetchJson(
    `http://127.0.0.1:${port}/api/libraries/canonical-library/holdings/${compiledHolding.fileId}/details`,
    { headers: { cookie } },
  );
  const compiledAuthor = await fetchJson(
    `http://127.0.0.1:${port}/api/libraries/canonical-library/authorities`,
    {
      method: "POST",
      headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ type: "person", canonicalLabel: "Compiled Author", aliases: [] }),
    },
  );
  const compiledMetadata = await fetchJson(
    `http://127.0.0.1:${port}/api/libraries/canonical-library/holdings/${compiledHolding.fileId}/metadata`,
    {
      method: "PUT",
      headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({
        metadataVersion: metadataBefore.metadataVersion,
        materialType: "book",
        canonicalTitle: "Compiled Canonical Title",
        subtitle: null,
        alternativeTitles: [],
        dateStatement: "2026",
        identifiers: [{ scheme: "local", value: "compiled-1" }],
        typeFields: { editionStatement: "First edition" },
        authorityLinks: [{ authorityId: compiledAuthor.authority.id, role: "author" }],
      }),
    },
  );
  const invitation = await fetchJson(`http://127.0.0.1:${port}/api/accounts/invitations`, {
    method: "POST",
    headers: { cookie, origin: environment.APP_ORIGIN },
  });
  const registeredMember = await fetchJson(`http://127.0.0.1:${port}/api/auth/register`, {
    method: "POST",
    headers: { origin: environment.APP_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      inviteToken: invitation.rawToken,
      loginName: "CompiledMember",
      password: memberPassword,
    }),
  });
  const memberLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: environment.APP_ORIGIN },
    body: JSON.stringify({ loginName: "CompiledMember", password: memberPassword }),
  });
  if (memberLoginResponse.status !== 200) throw new Error("compiled Member login failed");
  const memberCookie = memberLoginResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!memberCookie?.startsWith("__Host-ac_session=")) throw new Error("compiled Member session cookie missing");
  const createdAnnouncement = await fetchJson(`http://127.0.0.1:${port}/api/announcements`, {
    method: "POST",
    headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Compiled announcement",
      body: "Compiled runtime announcement persistence.",
      severity: "info",
      linkUrl: null,
      expiresAt: null,
    }),
  });
  await fetchJson(`http://127.0.0.1:${port}/api/announcements/${createdAnnouncement.announcement.id}/publish`, {
    method: "POST",
    headers: { cookie, origin: environment.APP_ORIGIN },
  });
  const createdRecord = await fetchJson(`http://127.0.0.1:${port}/api/research/records`, {
    method: "POST",
    headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ label: "Compiled scholarly record" }),
  });
  const attachedRecord = await fetchJson(
    `http://127.0.0.1:${port}/api/research/records/${createdRecord.record.id}/artifacts`,
    {
      method: "POST",
      headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ fileId: compiledFileId }),
    },
  );
  const attachedArtifact = attachedRecord.record.artifacts[0];
  if (!attachedArtifact?.version) throw new Error("compiled scholarly attachment missing identity");
  const detachedRecord = await fetchJson(
    `http://127.0.0.1:${port}/api/research/records/${createdRecord.record.id}/artifacts/${attachedArtifact.id}`,
    { method: "DELETE", headers: { cookie, origin: environment.APP_ORIGIN } },
  );
  const reattachedRecord = await fetchJson(
    `http://127.0.0.1:${port}/api/research/records/${createdRecord.record.id}/artifacts`,
    {
      method: "POST",
      headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ fileId: compiledFileId }),
    },
  );
  await stopApplication(application);
  application = undefined;

  application = startApplication();
  await waitForJson(`http://127.0.0.1:${port}/api/health`, application);
  const session = await fetchJson(`http://127.0.0.1:${port}/api/auth/session`, {
    headers: { cookie },
  });
  const announcements = await fetchJson(`http://127.0.0.1:${port}/api/announcements`, {
    headers: { cookie },
  });
  const scholarlyRecords = await fetchJson(`http://127.0.0.1:${port}/api/research/records`, {
    headers: { cookie },
  });
  const scholarlyRecordAfterRestart = await fetchJson(
    `http://127.0.0.1:${port}/api/research/records/${createdRecord.record.id}`,
    { headers: { cookie } },
  );
  const metadataAfterRestart = await fetchJson(
    `http://127.0.0.1:${port}/api/libraries/canonical-library/holdings/${compiledHolding.fileId}/details`,
    { headers: { cookie } },
  );
  const retiredPasswordChange = await fetch(`http://127.0.0.1:${port}/api/auth/password`, {
    method: "POST",
    headers: { cookie, origin: environment.APP_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: password, newPassword: "retired-password-change-456" }),
  });
  if (retiredPasswordChange.status !== 404) {
    throw new Error("compiled self-service password route was not retired");
  }
  const issuedReset = await fetchJson(
    `http://127.0.0.1:${port}/api/accounts/${registeredMember.account.id}/credential-reset`,
    { method: "POST", headers: { cookie, origin: environment.APP_ORIGIN } },
  );
  const newMemberPassword = "compiled-member-reset-password-456";
  const credentialReset = await fetch(`http://127.0.0.1:${port}/api/auth/credential-reset`, {
    method: "POST",
    headers: { origin: environment.APP_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ token: issuedReset.rawToken, newPassword: newMemberPassword }),
  });
  if (credentialReset.status !== 204) throw new Error("compiled credential reset failed");
  const revokedMemberSession = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
    headers: { cookie: memberCookie },
  });
  const newMemberLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: environment.APP_ORIGIN },
    body: JSON.stringify({ loginName: "CompiledMember", password: newMemberPassword }),
  });
  if (newMemberLoginResponse.status !== 200) throw new Error("compiled post-reset Member login failed");
  const newMemberCookie = newMemberLoginResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!newMemberCookie?.startsWith("__Host-ac_session=")) throw new Error("compiled replacement Member session cookie missing");
  await stopApplication(application);
  application = undefined;

  const maintenance = runJson(join(distDirectory, "maintenance", "main.js"));
  const createdBackup = runJson(
    join(distDirectory, "operations", "recovery-main.js"),
    [
      "backup-create",
      `--backup=${backupPath}`,
      `--receipt=${backupReceiptPath}`,
      `--source-commit=${"a".repeat(40)}`,
    ],
  );
  const verifiedBackup = runJson(
    join(distDirectory, "operations", "backup-main.js"),
    ["verify", `--input=${backupPath}`],
  );
  const verifiedReceipt = runJson(
    join(distDirectory, "operations", "recovery-main.js"),
    [
      "receipt-verify",
      `--backup=${backupPath}`,
      `--receipt=${backupReceiptPath}`,
    ],
  );
  const operationsRestoreDrill = runJson(
    join(distDirectory, "operations", "recovery-main.js"),
    [
      "restore-drill",
      `--backup=${backupPath}`,
      `--receipt=${backupReceiptPath}`,
    ],
  );
  copyFileSync(backupPath, restoredPath, constants.COPYFILE_EXCL);
  const verifiedRestore = runJson(
    join(distDirectory, "operations", "backup-main.js"),
    ["verify", `--input=${restoredPath}`],
  );
  const restoredEnvironment = { ...environment, DATABASE_PATH: restoredPath };
  application = startApplication(restoredEnvironment);
  const restoredReadiness = await waitForJson(`http://127.0.0.1:${port}/api/ready`, application);
  const restoredSession = await fetchJson(`http://127.0.0.1:${port}/api/auth/session`, {
    headers: { cookie },
  });
  const restoredMemberSession = await fetchJson(`http://127.0.0.1:${port}/api/auth/session`, {
    headers: { cookie: newMemberCookie },
  });
  const restoredAnnouncements = await fetchJson(`http://127.0.0.1:${port}/api/announcements`, {
    headers: { cookie },
  });
  const restoredScholarlyRecords = await fetchJson(`http://127.0.0.1:${port}/api/research/records`, {
    headers: { cookie },
  });
  const restoredScholarlyRecord = await fetchJson(
    `http://127.0.0.1:${port}/api/research/records/${createdRecord.record.id}`,
    { headers: { cookie } },
  );
  const restoredMetadata = await fetchJson(
    `http://127.0.0.1:${port}/api/libraries/canonical-library/holdings/${compiledHolding.fileId}/details`,
    { headers: { cookie } },
  );
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
    announcementSurvivedRestart: announcements.announcements.some(
      (announcement) => announcement.id === createdAnnouncement.announcement.id,
    ),
    scholarlyRecordSurvivedRestart: scholarlyRecords.records.some(
      (record) => record.id === createdRecord.record.id && record.label === "Compiled scholarly record",
    ),
    scholarlyDetachReattachStable:
      detachedRecord.record.artifacts[0]?.attachmentState === "detached"
      && reattachedRecord.record.artifacts[0]?.id === attachedArtifact.id
      && reattachedRecord.record.artifacts[0]?.version?.id === attachedArtifact.version.id
      && reattachedRecord.record.artifacts[0]?.version?.file?.id === compiledFileId,
    scholarlyIdentitySurvivedRestart: scholarlyIdentityMatches(
      scholarlyRecordAfterRestart.record,
      createdRecord.record.id,
      attachedArtifact.id,
      attachedArtifact.version.id,
      compiledFileId,
    ),
    canonicalMetadataSurvivedRestart:
      metadataAfterRestart.displayTitle === "Compiled Canonical Title"
      && metadataAfterRestart.originalFilename === "compiled-acquisition.pdf"
      && metadataAfterRestart.metadata?.authorityLinks?.[0]?.canonicalLabel === "Compiled Author",
    selfServicePasswordRouteRetired: retiredPasswordChange.status === 404,
    credentialResetRevokedOldMemberSession: revokedMemberSession.status === 401,
    freshMemberLoginAfterCredentialReset: newMemberLoginResponse.status === 200,
    maintenanceDryRun: maintenance.mode === "dry_run",
    backupVerified: createdBackup.summary.sha256 === verifiedBackup.sha256,
    backupReceiptVerified:
      createdBackup.receipt.sha256 === verifiedBackup.sha256
      && verifiedReceipt.summary.sha256 === verifiedBackup.sha256,
    operationsRestoreDrillVerified:
      operationsRestoreDrill.status === "ok"
      && operationsRestoreDrill.sourceUnchanged === true
      && operationsRestoreDrill.restoredCopyUnchanged === true
      && operationsRestoreDrill.cleanupCompleted === true
      && operationsRestoreDrill.networkListenerOpened === false
      && operationsRestoreDrill.storageProvider === "memory",
    isolatedRestoreVerified: verifiedRestore.sha256 === verifiedBackup.sha256,
    restoredReadiness: restoredReadiness.status,
    restoredSessionValid: restoredSession.account.loginName === "CompiledAcceptance",
    restoredCredentialResetSessionValid: restoredMemberSession.account.loginName === "CompiledMember",
    restoredAnnouncementValid: restoredAnnouncements.announcements.some(
      (announcement) => announcement.id === createdAnnouncement.announcement.id,
    ),
    restoredScholarlyRecordValid: restoredScholarlyRecords.records.some(
      (record) => record.id === createdRecord.record.id && record.label === "Compiled scholarly record",
    ),
    restoredScholarlyIdentityValid: scholarlyIdentityMatches(
      restoredScholarlyRecord.record,
      createdRecord.record.id,
      attachedArtifact.id,
      attachedArtifact.version.id,
      compiledFileId,
    ),
    restoredCanonicalMetadataValid:
      restoredMetadata.displayTitle === compiledMetadata.displayTitle
      && restoredMetadata.originalFilename === "compiled-acquisition.pdf"
      && restoredMetadata.metadata?.identifiers?.[0]?.value === "compiled-1",
    redeployMigrationCount: redeployMigration.appliedVersions.length,
  };
  assert.equal(result.firstMigrationCount, 33);
  assert.equal(result.provisionedLogin, "CompiledAcceptance");
  assert.equal(result.health, "ok");
  assert.equal(result.readiness, "ready");
  assert.equal(result.sessionSurvivedRestart, true);
  assert.equal(result.announcementSurvivedRestart, true);
  assert.equal(result.scholarlyRecordSurvivedRestart, true);
  assert.equal(result.scholarlyDetachReattachStable, true);
  assert.equal(result.scholarlyIdentitySurvivedRestart, true);
  assert.equal(result.canonicalMetadataSurvivedRestart, true);
  assert.equal(result.selfServicePasswordRouteRetired, true);
  assert.equal(result.credentialResetRevokedOldMemberSession, true);
  assert.equal(result.freshMemberLoginAfterCredentialReset, true);
  assert.equal(result.maintenanceDryRun, true);
  assert.equal(result.backupVerified, true);
  assert.equal(result.backupReceiptVerified, true);
  assert.equal(result.operationsRestoreDrillVerified, true);
  assert.equal(result.isolatedRestoreVerified, true);
  assert.equal(result.restoredReadiness, "ready");
  assert.equal(result.restoredSessionValid, true);
  assert.equal(result.restoredCredentialResetSessionValid, true);
  assert.equal(result.restoredAnnouncementValid, true);
  assert.equal(result.restoredScholarlyRecordValid, true);
  assert.equal(result.restoredScholarlyIdentityValid, true);
  assert.equal(result.restoredCanonicalMetadataValid, true);
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

function seedCompiledFile(path, accountId, fileId) {
  const database = new Database(path);
  try {
    database.pragma("foreign_keys = ON");
    const now = new Date().toISOString();
    const inserted = database.prepare(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
        storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
        checksum, state, revision, created_at, updated_at, activated_at,
        deleted_at, purged_at, recycle_group_id
      )
      SELECT @fileId, ownership_domains.id, @accountId, NULL, 'compiled.pdf',
        'aliyun-oss', @objectKey, 'application/pdf', 8, 'md5',
        '1B2M2Y8AsgTpgAmY7PhCfg==', 'active', 0, @now, @now, @now,
        NULL, NULL, NULL
      FROM ownership_domains
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = @accountId
    `).run({ fileId, accountId, objectKey: `compiled/${fileId}`, now });
    if (inserted.changes !== 1) throw new Error("compiled scholarly file seed failed");
  } finally {
    database.close();
  }
}

function seedCompiledLibraryHolding(path, accountId) {
  const database = new Database(path);
  const suffix = randomBytes(8).toString("hex");
  const fileId = `compiled-library-file-${suffix}`;
  const recordId = `compiled-library-record-${suffix}`;
  const artifactId = `compiled-library-artifact-${suffix}`;
  const versionId = `compiled-library-version-${suffix}`;
  try {
    database.pragma("foreign_keys = ON");
    const now = new Date().toISOString();
    database.transaction(() => {
      database.prepare(`
        INSERT INTO files (
          id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
          storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
          checksum, state, revision, created_at, updated_at, activated_at,
          deleted_at, purged_at, recycle_group_id
        ) VALUES (
          @fileId, 'library:canonical-library', @accountId, NULL,
          'compiled-acquisition.pdf', 'aliyun-oss', @objectKey,
          'application/pdf', 8, 'md5', '1B2M2Y8AsgTpgAmY7PhCfg==',
          'active', 0, @now, @now, @now, NULL, NULL, NULL
        )
      `).run({ fileId, accountId, objectKey: `compiled-library/${fileId}`, now });
      database.prepare(`
        INSERT INTO scholarly_records (
          id, owner_domain_id, created_by_account_id, label, created_at, updated_at
        ) VALUES (
          @recordId, 'library:canonical-library', @accountId,
          'compiled legacy label', @now, @now
        )
      `).run({ recordId, accountId, now });
      database.prepare(`
        INSERT INTO scholarly_artifacts (
          id, owner_domain_id, record_id, attachment_state, created_at, updated_at
        ) VALUES (
          @artifactId, 'library:canonical-library', @recordId,
          'detached', @now, @now
        )
      `).run({ artifactId, recordId, now });
      database.prepare(`
        INSERT INTO scholarly_artifact_versions (
          id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at
        ) VALUES (
          @versionId, 'library:canonical-library', @artifactId, @fileId, @now, @now
        )
      `).run({ versionId, artifactId, fileId, now });
      database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(artifactId);
    })();
    return { fileId, recordId, artifactId, versionId };
  } finally {
    database.close();
  }
}

function scholarlyIdentityMatches(record, recordId, artifactId, versionId, fileId) {
  const artifact = record.artifacts?.find((candidate) => candidate.id === artifactId);
  return record.id === recordId
    && record.artifactCount === 1
    && artifact?.attachmentState === "attached"
    && artifact.version?.id === versionId
    && artifact.version.file?.id === fileId
    && artifact.version.file.availability === "available";
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
  const child = spawn(process.execPath, [join(distDirectory, "main.js")], {
    cwd: repositoryDirectory,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const diagnostics = createBoundedStartupDiagnostics(childEnvironment);
  child.stdout.on("data", (chunk) => diagnostics.append("stdout", chunk));
  child.stderr.on("data", (chunk) => diagnostics.append("stderr", chunk));
  const closed = new Promise((resolveClose) => child.once("close", resolveClose));
  applicationDiagnostics.set(child, { diagnostics, closed });
  return child;
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

async function waitForJson(url, child) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const exitDescription = describeStartupExit(child);
    if (exitDescription) {
      const state = applicationDiagnostics.get(child);
      if (state) {
        await Promise.race([
          state.closed,
          new Promise((resolveWait) => setTimeout(resolveWait, 250)),
        ]);
        throw new Error(state.diagnostics.format(exitDescription));
      }
      throw new Error(exitDescription);
    }

    try {
      return await fetchJson(url);
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }

  const state = applicationDiagnostics.get(child);
  throw new Error(state?.diagnostics.format("compiled API did not become healthy")
    ?? "compiled API did not become healthy");
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`compiled API returned HTTP ${response.status}`);
  return response.json();
}
