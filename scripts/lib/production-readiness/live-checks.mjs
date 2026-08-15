// LIVE-mode remote checks: fixed allowlisted commands, bounded execution,
// aggregate-only parsing, dependency propagation (SSH failure ⇒ dependent
// checks UNKNOWN, never FAIL), a resource guard for heavy checks, and at most
// 2 concurrent SSH sessions.

import {
  classifyDrift,
  FIXED_REMOTE as remote,
  LIMITS,
  parseDfPk,
  parseEnvSafe,
  parseListeners,
  parseMemoryEvents,
  parseMeminfo,
  parseReleaseManifest,
  parseSystemctlShow,
  TARGET,
} from "./checks.mjs";
import { createCheck } from "./model.mjs";
import { normalizeEndpoint } from "./public-checks.mjs";

export const HEAVY_CHECK_MIN_MEM_AVAILABLE_KIB = 256 * 1024;
export const MAX_SSH_CONCURRENCY = 2;

// Bounded concurrency: at most `limit` in-flight promises.
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

function stdoutOf(result) {
  return result?.stdout?.trim() || null;
}

// Numeric output helpers: a 0/1 exit from grep -c or wc-style pipelines is a
// valid answer, never a failure.
function numericOf(result) {
  if (!result) return null;
  if (result.ok || result.exitCode === 1) {
    const value = Number(result.stdout?.trim());
    return Number.isFinite(value) ? value : 0;
  }
  return null;
}

function lineCountOf(result) {
  if (!result?.ok) return null;
  return result.stdout.split("\n").filter((line) => line.trim().length > 0).length;
}

export async function runLiveRemoteChecks({
  runRemoteCheck,
  sshAlias,
  repoChecks = [],
  profile = "baseline",
  now = () => new Date(),
} = {}) {
  const checks = [];
  const at = now().toISOString();
  const filesDomainOrigin = `https://${TARGET.filesDomain}`;

  // Connectivity gate: a single fixed harmless command.
  const probe = await runRemoteCheck(sshAlias, ["true"]);
  const sshUp = probe.ok && !probe.limited;

  checks.push(createCheck({
    id: "SSH_CONNECTION", category: "transport", requirement: "required",
    status: sshUp ? "PASS" : "UNKNOWN",
    summary: sshUp ? `SSH alias ${sshAlias} reachable (non-interactive)` : `SSH alias ${sshAlias} unreachable or non-interactive`,
    evidence: { alias: sshAlias, kind: probe.kind }, provenance: "REMOTE_SSH", observedAt: at,
  }));

  const dependent = (id, category, requirement, summary, detail = null) =>
    createCheck({
      id, category, requirement, status: "UNKNOWN", summary,
      evidence: {}, provenance: "REMOTE_SSH", dependency: "SSH_CONNECTION", observedAt: at,
      ...(detail ? { detail } : {}),
    });

  // ---- host identity + resources (sequential fixed reads)
  const hostEvidence = {};
  for (const args of remote.hostIdentity) {
    const result = sshUp ? await runRemoteCheck(sshAlias, args) : { ok: false };
    hostEvidence[args.join(" ")] = result.ok ? result.stdout.trim() : null;
  }
  const hostOk = sshUp && Boolean(hostEvidence.hostname);
  checks.push(hostOk
    ? createCheck({
        id: "HOST_IDENTITY", category: "host", requirement: "advisory", status: "PASS",
        summary: `host ${hostEvidence.hostname}`,
        evidence: {
          hostname: hostEvidence.hostname,
          os: hostEvidence["grep PRETTY_NAME /etc/os-release"]?.replace(/^PRETTY_NAME="?|"$/g, "") ?? null,
          kernel: hostEvidence["uname -r"] ?? null,
          architecture: hostEvidence["uname -m"] ?? null,
          cpuCount: hostEvidence.nproc ? Number(hostEvidence.nproc) : null,
          uptime: hostEvidence["uptime -p"] ?? null,
          bootTime: hostEvidence["stat -c %y /proc/1"]?.slice(0, 19) ?? null,
        },
        provenance: "REMOTE_SSH", observedAt: at,
      })
    : dependent("HOST_IDENTITY", "host", "advisory", "host identity unavailable (SSH down)"));

  const meminfoResult = sshUp ? await runRemoteCheck(sshAlias, remote.meminfo[0]) : { ok: false };
  const meminfo = meminfoResult.ok ? parseMeminfo(meminfoResult.stdout) : {};
  const memoryHeadroomKiB = meminfo.MemAvailable ?? null;
  checks.push(createCheck({
    id: "RESOURCE_MEMORY_HEADROOM", category: "resources", requirement: "required",
    status: memoryHeadroomKiB === null ? "UNKNOWN"
      : memoryHeadroomKiB >= LIMITS.memoryHeadroomKiB ? "PASS" : "FAIL",
    summary: memoryHeadroomKiB === null
      ? "memory headroom unavailable"
      : `MemAvailable ${memoryHeadroomKiB} KiB (gate ${LIMITS.memoryHeadroomKiB} KiB)`,
    evidence: { memTotalKiB: meminfo.MemTotal ?? null, memAvailableKiB: memoryHeadroomKiB, swapTotalKiB: meminfo.SwapTotal ?? null, swapFreeKiB: meminfo.SwapFree ?? null },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // Resource guard: below the heavy-check threshold, skip the expensive
  // read-only audits (SQLite integrity, journal aggregations) and mark them
  // UNKNOWN — a skipped check is never PASS.
  const heavyChecksAllowed = memoryHeadroomKiB === null || memoryHeadroomKiB >= HEAVY_CHECK_MIN_MEM_AVAILABLE_KIB;
  checks.push(createCheck({
    id: "RESOURCE_GUARD", category: "resources", requirement: "advisory",
    status: heavyChecksAllowed ? "PASS" : "WARN",
    summary: heavyChecksAllowed
      ? "resource guard clear (heavy read-only audits allowed)"
      : `MemAvailable below ${HEAVY_CHECK_MIN_MEM_AVAILABLE_KIB} KiB — heavy read-only audits skipped (UNKNOWN)`,
    evidence: { heavyChecksAllowed, thresholdKiB: HEAVY_CHECK_MIN_MEM_AVAILABLE_KIB },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  const diskResult = sshUp ? await runRemoteCheck(sshAlias, remote.disk[0]) : { ok: false };
  const disk = diskResult.ok ? parseDfPk(diskResult.stdout) : null;
  checks.push(createCheck({
    id: "RESOURCE_DISK_HEADROOM", category: "resources", requirement: "required",
    status: disk === null ? "UNKNOWN" : disk.availKiB >= LIMITS.diskHeadroomKiB ? "PASS" : "FAIL",
    summary: disk === null ? "disk headroom unavailable" : `root filesystem ${disk.availKiB} KiB available (gate ${LIMITS.diskHeadroomKiB} KiB)`,
    evidence: { filesystem: disk?.filesystem ?? null, sizeKiB: disk?.sizeKiB ?? null, usedKiB: disk?.usedKiB ?? null, availKiB: disk?.availKiB ?? null },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- systemd
  const serviceResult = sshUp ? await runRemoteCheck(sshAlias, remote.serviceShow[0]) : { ok: false };
  const service = serviceResult.ok ? parseSystemctlShow(serviceResult.stdout) : {};
  const activeState = service.ActiveState ?? null;
  checks.push(createCheck({
    id: "SERVICE_ACTIVE", category: "systemd", requirement: "required",
    status: activeState === "active" ? "PASS" : activeState === null ? "UNKNOWN" : "FAIL",
    summary: `academiccloud.service ${activeState ?? "unknown"}`,
    evidence: { activeState, subState: service.SubState ?? null, mainPid: service.MainPID ?? null, nRestarts: service.NRestarts ?? null, user: service.User ?? null, group: service.Group ?? null, workingDirectory: service.WorkingDirectory ?? null, execStart: service.ExecStart ?? null, environmentFiles: service.EnvironmentFiles ?? null, restart: service.Restart ?? null },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  const unitFileState = service.UnitFileState ?? null;
  checks.push(createCheck({
    id: "SERVICE_AUTOSTART_DISABLED", category: "systemd", requirement: "advisory",
    status: unitFileState === "disabled" ? "WARN" : unitFileState === "enabled" ? "PASS" : "UNKNOWN",
    summary: unitFileState === "disabled" ? "autostart disabled (decision still pending per PROD-03C2)" : `autostart ${unitFileState ?? "unknown"}`,
    evidence: { unitFileState }, provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  const restarts = service.NRestarts === undefined ? null : Number(service.NRestarts);
  checks.push(createCheck({
    id: "SERVICE_STABLE", category: "systemd", requirement: "advisory",
    status: restarts === null ? "UNKNOWN" : restarts === 0 ? "PASS" : "WARN",
    summary: restarts === 0 ? "no service restarts recorded" : `${restarts} service restart(s) recorded`,
    evidence: { nRestarts: restarts }, provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  const failedResult = sshUp ? await runRemoteCheck(sshAlias, remote.failedUnits[0]) : { ok: false };
  const failedCount = failedResult.ok ? failedResult.stdout.split("\n").filter((line) => line.trim()).length : null;
  checks.push(createCheck({
    id: "NO_FAILED_UNITS", category: "systemd", requirement: "required",
    status: failedCount === null ? "UNKNOWN" : failedCount === 0 ? "PASS" : "FAIL",
    summary: failedCount === 0 ? "no failed systemd units" : `${failedCount} failed systemd unit(s)`,
    evidence: { failedUnitCount: failedCount }, provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- network boundary
  const listenersResult = sshUp ? await runRemoteCheck(sshAlias, remote.listeners[0]) : { ok: false };
  const listeners = listenersResult.ok ? parseListeners(listenersResult.stdout) : [];
  const loopback3000 = listeners.some((entry) => entry.address === "127.0.0.1" && entry.port === 3000);
  const public3000 = listeners.some((entry) => (entry.address === "0.0.0.0" || entry.address.startsWith("[")) && entry.port === 3000);
  checks.push(createCheck({
    id: "LISTENER_LOOPBACK_ONLY", category: "network", requirement: "required",
    status: !listenersResult.ok ? "UNKNOWN" : loopback3000 && !public3000 ? "PASS" : "FAIL",
    summary: loopback3000 && !public3000
      ? "backend listens on 127.0.0.1:3000 only"
      : public3000
        ? "backend listener exposed beyond loopback"
        : "loopback listener not observed",
    evidence: { listeners, loopback3000, publiclyExposed: public3000 },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- application health (loopback, no auth)
  const [healthResult, readyResult] = sshUp
    ? await mapLimit([remote.health[0], remote.ready[0]], MAX_SSH_CONCURRENCY, (args) => runRemoteCheck(sshAlias, args))
    : [{ ok: false }, { ok: false }];
  for (const [id, result] of [["HEALTH_LOOPBACK", healthResult], ["READY_LOOPBACK", readyResult]]) {
    const status = result.ok ? Number(result.stdout.trim()) : null;
    checks.push(createCheck({
      id, category: "app", requirement: "required",
      status: status === 200 ? "PASS" : status === null ? "UNKNOWN" : "FAIL",
      summary: status === 200 ? `${id.replace("_LOOPBACK", "")} loopback 200` : `${id.replace("_LOOPBACK", "")} loopback ${status ?? "unreachable"}`,
      evidence: { status }, provenance: "REMOTE_SSH", observedAt: at,
      ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
    }));
  }

  // ---- release identity
  const targetResult = sshUp ? await runRemoteCheck(sshAlias, remote.releaseTarget[0]) : { ok: false };
  const listResult = sshUp ? await runRemoteCheck(sshAlias, remote.releaseList[0]) : { ok: false };
  const writableResult = sshUp ? await runRemoteCheck(sshAlias, remote.releaseWritable[0]) : { ok: false };
  const manifestResult = sshUp ? await runRemoteCheck(sshAlias, remote.releaseManifest[0]) : { ok: false };
  const currentTarget = targetResult.ok ? targetResult.stdout.trim() : null;
  const releases = listResult.ok ? listResult.stdout.trim().split("\n").filter(Boolean) : [];
  const manifest = manifestResult.ok ? parseReleaseManifest(manifestResult.stdout) : null;
  checks.push(createCheck({
    id: "RELEASE_CURRENT", category: "release", requirement: "required",
    status: currentTarget && manifest?.sourceCommit ? "PASS" : "UNKNOWN",
    summary: currentTarget ? `current -> ${currentTarget}` : "current release unknown",
    evidence: { currentTarget, releaseCount: releases.length, releaseBasenames: releases, manifest: manifest ?? { sourceCommit: null } },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // Immutability is its own required gate (non-mutating `test -w` probe).
  const serviceWritable = writableResult.ok || writableResult.exitCode === 1 ? writableResult.exitCode === 0 : null;
  checks.push(createCheck({
    id: "RELEASE_SERVICE_WRITE_DENIED", category: "release", requirement: "required",
    status: serviceWritable === null ? "UNKNOWN" : serviceWritable ? "FAIL" : "PASS",
    summary: serviceWritable === null
      ? "release writability check unavailable"
      : serviceWritable
        ? "service account CAN write the release tree"
        : "service account write to release tree denied",
    evidence: { serviceAccountWritable: serviceWritable }, provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  const localHead = repoChecks.find((check) => check.id === "GIT_HEAD")?.evidence?.head ?? null;
  const drift = classifyDrift(localHead, manifest?.sourceCommit ?? null);
  checks.push(createCheck({
    id: "PRODUCTION_DRIFT", category: "release", requirement: "advisory",
    status: drift.status,
    summary: drift.summary,
    evidence: { repositoryHead: localHead, productionRuntimeCommit: manifest?.sourceCommit ?? null },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- nginx (sequential fixed reads)
  const siteLinkResult = sshUp ? await runRemoteCheck(sshAlias, remote.nginxSiteExists[0]) : { ok: false };
  const siteHashResult = sshUp ? await runRemoteCheck(sshAlias, remote.nginxSiteHash[0]) : { ok: false };
  const snippetHashResult = sshUp ? await runRemoteCheck(sshAlias, remote.nginxSnippetHash[0]) : { ok: false };
  const summaryResult = sshUp ? await runRemoteCheck(sshAlias, remote.nginxSummary[0]) : { ok: false };
  const cspLiveResult = sshUp ? await runRemoteCheck(sshAlias, remote.cspLive[0]) : { ok: false };
  const hstsLiveResult = sshUp ? await runRemoteCheck(sshAlias, remote.hstsLive[0]) : { ok: false };
  const siteLink = siteLinkResult.ok ? siteLinkResult.stdout.trim() : null;
  const siteHash = siteHashResult.ok ? siteHashResult.stdout.split(/\s+/)[0] : null;
  const snippetHash = snippetHashResult.ok ? snippetHashResult.stdout.split(/\s+/)[0] : null;
  const summaryLines = summaryResult.ok ? summaryResult.stdout.trim().split("\n").filter(Boolean) : [];
  const cspLiveLines = cspLiveResult.ok ? cspLiveResult.stdout.split("\n").filter((line) => !line.trim().startsWith("#")) : [];
  const hstsLiveLines = hstsLiveResult.ok ? hstsLiveResult.stdout.split("\n").filter((line) => !line.trim().startsWith("#")) : [];
  checks.push(createCheck({
    id: "NGINX_SITE_ACTIVE", category: "nginx", requirement: "required",
    status: siteLink ? "PASS" : "UNKNOWN",
    summary: siteLink ? `active AcademicCloud site at ${siteLink}` : "active site unknown",
    evidence: { sitePath: siteLink, siteHash, snippetHash, serverConfigLines: summaryLines.slice(0, 12), hstsConfigured: hstsLiveLines.length > 0 },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // Live-snippet CSP must contain the files domain in img-src AND frame-src.
  const liveDirectives = {};
  for (const line of cspLiveLines) {
    const header = /Content-Security-Policy\s*"(.*)"/.exec(line)?.[1] ?? line;
    for (const part of header.split(";")) {
      const index = part.indexOf(" ");
      if (index < 0) continue;
      const name = part.slice(0, index).trim().toLowerCase();
      liveDirectives[name] = part.slice(index).trim().split(/\s+/).filter(Boolean);
    }
  }
  const liveImgAllows = (liveDirectives["img-src"] ?? []).includes(filesDomainOrigin);
  const liveFrameAllows = (liveDirectives["frame-src"] ?? []).includes(filesDomainOrigin);
  checks.push(createCheck({
    id: "FILES_CSP_ALLOWED_LIVE", category: "nginx", requirement: "informational",
    status: liveImgAllows && liveFrameAllows ? "PASS" : "INFO",
    summary: liveImgAllows && liveFrameAllows
      ? "live snippet CSP includes files domain in img-src AND frame-src"
      : "live snippet CSP does not include files domain in BOTH img-src and frame-src (expected before Transaction B)",
    evidence: { imgSrcAllows: liveImgAllows, frameSrcAllows: liveFrameAllows },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- environment (safe extraction)
  const envAllowedResult = sshUp ? await runRemoteCheck(sshAlias, remote.envAllowed[0]) : { ok: false };
  const [envSecretId, envSecretSecret, envSecretSts] = sshUp
    ? await mapLimit([remote.envSecretKeyId[0], remote.envSecretKeySecret[0], remote.envSecretSts[0]], MAX_SSH_CONCURRENCY, (args) => runRemoteCheck(sshAlias, args))
    : [{ ok: false }, { ok: false }, { ok: false }];
  let envSafe = null;
  const secretPresence = {};
  if (envAllowedResult.ok) {
    envSafe = parseEnvSafe(envAllowedResult.stdout).values;
  }
  if (sshUp) {
    secretPresence.OSS_ACCESS_KEY_ID = numericOf(envSecretId) !== null ? (numericOf(envSecretId) > 0 ? "PRESENT" : "ABSENT") : "UNKNOWN";
    secretPresence.OSS_ACCESS_KEY_SECRET = numericOf(envSecretSecret) !== null ? (numericOf(envSecretSecret) > 0 ? "PRESENT" : "ABSENT") : "UNKNOWN";
    secretPresence.OSS_STS_TOKEN = numericOf(envSecretSts) !== null ? (numericOf(envSecretSts) > 0 ? "PRESENT" : "ABSENT") : "UNKNOWN";
  }
  checks.push(createCheck({
    id: "ENV_SAFE_STATE", category: "env", requirement: "required",
    status: envSafe ? "PASS" : "UNKNOWN",
    summary: envSafe ? "environment safe fields collected" : "environment safe fields unavailable (sudo -n required)",
    evidence: { values: envSafe ?? {}, secrets: secretPresence },
    provenance: "REMOTE_SSH", observedAt: at,
    detail: envSafe ? null : (envAllowedResult.kind ?? "PERMISSION_UNAVAILABLE"),
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // Exact endpoint semantics: PASS only for https://files.ajtlab.top (same
  // trailing-slash-insensitive normalization as production config).
  const browserEndpoint = envSafe?.OSS_BROWSER_ENDPOINT ?? null;
  const endpointMatches = browserEndpoint !== null && normalizeEndpoint(browserEndpoint) === normalizeEndpoint(filesDomainOrigin);
  checks.push(createCheck({
    id: "FILES_BROWSER_ENDPOINT_CONFIGURED", category: "env", requirement: "informational",
    status: browserEndpoint === null || browserEndpoint === "" ? "INFO"
      : endpointMatches ? "PASS" : "FAIL",
    summary: browserEndpoint === null || browserEndpoint === ""
      ? "OSS_BROWSER_ENDPOINT not configured (expected before Transaction B)"
      : endpointMatches
        ? "OSS_BROWSER_ENDPOINT exactly matches the files domain"
        : "OSS_BROWSER_ENDPOINT does not match the expected files domain",
    evidence: { configured: browserEndpoint !== null && browserEndpoint !== "", matchesExpected: endpointMatches },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- database (read-only aggregates; skipped by the resource guard)
  let db = null;
  if (sshUp && heavyChecksAllowed) {
    const dbResult = await runRemoteCheck(sshAlias, remote.dbAudit[0]);
    if (dbResult.ok) {
      try {
        db = JSON.parse(dbResult.stdout.trim());
      } catch {
        db = null;
      }
    }
  }
  checks.push(createCheck({
    id: "DB_INTEGRITY", category: "database", requirement: "required",
    status: db?.integrity === "ok" ? "PASS" : db === null ? "UNKNOWN" : "FAIL",
    summary: db?.integrity === "ok" ? "SQLite integrity ok"
      : db === null ? "database integrity audit unavailable" : `integrity result: ${db.integrity}`,
    evidence: { integrity: db?.integrity ?? null },
    provenance: "REMOTE_SQLITE_READONLY", observedAt: at,
    detail: !heavyChecksAllowed ? "skipped by resource guard" : null,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));
  checks.push(createCheck({
    id: "DB_FOREIGN_KEYS", category: "database", requirement: "required",
    status: db === null ? "UNKNOWN" : db.fkRows === 0 ? "PASS" : "FAIL",
    summary: db === null ? "foreign-key audit unavailable" : db.fkRows === 0 ? "foreign-key check clean" : `${db.fkRows} foreign-key violation(s)`,
    evidence: { foreignKeyViolations: db?.fkRows ?? null },
    provenance: "REMOTE_SQLITE_READONLY", observedAt: at,
    detail: !heavyChecksAllowed ? "skipped by resource guard" : null,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // Expected schema derives from the REPOSITORY migration set, never a
  // hard-coded constant.
  const migrationCheck = repoChecks.find((check) => check.id === "GIT_MIGRATION_FILES");
  const expectedVersion = typeof migrationCheck?.evidence?.count === "number" ? migrationCheck.evidence.count : null;
  const liveVersion = db?.schemaVersion ?? null;
  checks.push(createCheck({
    id: "DB_SCHEMA", category: "database", requirement: "required",
    status: liveVersion === null || expectedVersion === null ? "UNKNOWN"
      : liveVersion === expectedVersion ? "PASS" : "FAIL",
    summary: liveVersion === null || expectedVersion === null
      ? `schema comparison unavailable (live ${liveVersion ?? "?"} vs repository ${expectedVersion ?? "?"})`
      : liveVersion === expectedVersion
        ? `schema version ${liveVersion} matches repository expectation`
        : `schema version ${liveVersion} does NOT match repository expectation ${expectedVersion}`,
    evidence: { liveSchemaVersion: liveVersion, expectedMigrationVersion: expectedVersion },
    provenance: "REMOTE_SQLITE_READONLY", observedAt: at,
    detail: !heavyChecksAllowed ? "skipped by resource guard" : null,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- backups
  const [backupFiles, backupAge, backupManifests, ageKey] = sshUp
    ? await mapLimit([remote.backupFileCount[0], remote.backupAgeCount[0], remote.backupManifestCount[0], remote.ageKeyStat[0]], MAX_SSH_CONCURRENCY, (args) => runRemoteCheck(sshAlias, args))
    : [{ ok: false }, { ok: false }, { ok: false }, { ok: false }];
  const newestTimestamp = (result) => {
    if (!result?.ok) return null;
    const stamps = result.stdout.trim().split("\n").map(Number).filter(Number.isFinite);
    return stamps.length ? new Date(Math.max(...stamps) * 1000).toISOString() : null;
  };
  const backupCount = lineCountOf(backupFiles);
  const ageCount = lineCountOf(backupAge);
  const manifestCount = lineCountOf(backupManifests);
  checks.push(createCheck({
    id: "BACKUP_PRESENT", category: "backup", requirement: "required",
    status: backupCount === null ? "UNKNOWN" : backupCount > 0 && ageCount > 0 ? "PASS" : "FAIL",
    summary: backupCount === null ? "backup inventory unavailable" : `${backupCount} backup file(s), ${ageCount} encrypted .age file(s)`,
    evidence: { backupFileCount: backupCount, encryptedAgeFileCount: ageCount, manifestCount, newestEncryptedAt: newestTimestamp(backupAge), agePublicKeyStat: ageKey?.ok ? ageKey.stdout.trim() : null },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- TLS automation
  const [certbotVersion, timerEnabled, timerActive, renewalConfig, timers, cronResult] = sshUp
    ? await mapLimit([remote.certbotVersion[0], remote.certbotTimerEnabled[0], remote.certbotTimerActive[0], remote.renewalConfig[0], remote.timers[0], remote.cronAcademiccloud[0]], MAX_SSH_CONCURRENCY, (args) => runRemoteCheck(sshAlias, args))
    : [{ ok: false }, { ok: false }, { ok: false }, { ok: false }, { ok: false }, { ok: false }];
  const timerEnabledState = stdoutOf(timerEnabled);
  const renewalPresent = renewalConfig?.ok && renewalConfig.exitCode === 0;
  const academiccloudTimerLines = numericOf(timers);
  const cronAcademiccloudEntries = numericOf(cronResult);
  checks.push(createCheck({
    id: "CERTBOT_TIMER", category: "automation", requirement: "advisory",
    status: timerEnabledState === "disabled" ? "WARN" : timerEnabledState === "enabled" ? "PASS" : "UNKNOWN",
    summary: `certbot timer ${timerEnabledState ?? "unknown"} (renewal automation ${timerEnabledState === "enabled" ? "on" : "off"})`,
    evidence: { certbotVersion: stdoutOf(certbotVersion), timerEnabled: timerEnabledState, timerActive: stdoutOf(timerActive), renewalConfigPresent: renewalPresent, academiccloudTimerLines: academiccloudTimerLines ?? null, academiccloudCronEntryCount: cronAcademiccloudEntries },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  checks.push(createCheck({
    id: "BACKUP_CADENCE", category: "automation", requirement: "advisory",
    status: academiccloudTimerLines === null && cronAcademiccloudEntries === null ? "UNKNOWN"
      : (academiccloudTimerLines ?? 0) > 0 || (cronAcademiccloudEntries ?? 0) > 0 ? "PASS" : "WARN",
    summary: "no automated backup cadence observed (event-driven backups only)",
    evidence: { timerLines: academiccloudTimerLines, cronEntries: cronAcademiccloudEntries },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- OOM / error aggregation (remote pipelines return counts only)
  let errorCount = null;
  let kernelOomCount = null;
  let nginx5xxCount = null;
  let cgroupEventsData = null;
  if (sshUp && heavyChecksAllowed) {
    const [journalErrors, kernelOom, cgroupEvents, nginx5xx] = await mapLimit(
      [remote.journalErrors[0], remote.journalKernelOom[0], remote.cgroupMemoryEvents[0], remote.nginx5xx[0]],
      MAX_SSH_CONCURRENCY,
      (args) => runRemoteCheck(sshAlias, args),
    );
    errorCount = numericOf(journalErrors);
    kernelOomCount = numericOf(kernelOom);
    cgroupEventsData = cgroupEvents?.ok ? parseMemoryEvents(cgroupEvents.stdout) : null;
    nginx5xxCount = numericOf(nginx5xx);
  }
  checks.push(createCheck({
    id: "NO_ERROR_OOM_ACTIVITY", category: "resources", requirement: "required",
    status: !heavyChecksAllowed ? "UNKNOWN"
      : errorCount === null && kernelOomCount === null ? "UNKNOWN"
        : errorCount === 0 && kernelOomCount === 0 && (cgroupEventsData?.oom_kill ?? 0) === 0 ? "PASS" : "FAIL",
    summary: `recent errors ${errorCount ?? "unknown"}, kernel OOM ${kernelOomCount ?? "unknown"}, cgroup oom_kill ${cgroupEventsData?.oom_kill ?? "unknown"}, nginx 5xx ${nginx5xxCount ?? "unknown"}`,
    evidence: { academiccloudErrorCountRecent: errorCount, kernelOomCountCurrentBoot: kernelOomCount, cgroupOomKill: cgroupEventsData?.oom_kill ?? null, cgroupOom: cgroupEventsData?.oom ?? null, nginx5xxCountRecent: nginx5xxCount },
    provenance: "REMOTE_SSH", observedAt: at,
    detail: !heavyChecksAllowed ? "skipped by resource guard" : null,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  return checks;
}
