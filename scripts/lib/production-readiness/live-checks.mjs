// LIVE-mode remote checks: fixed allowlisted commands, bounded execution,
// aggregate-only parsing, dependency propagation (SSH failure ⇒ dependent
// checks UNKNOWN, never FAIL).

import {
  classifyDrift,
  FIXED_REMOTE as remote,
  LIMITS,
  parseDfPk,
  parseEnvSafe,
  parseJournalLines,
  parseListeners,
  parseMemoryEvents,
  parseMeminfo,
  parseReleaseManifest,
  parseSystemctlShow,
  TARGET,
} from "./checks.mjs";
import { createCheck } from "./model.mjs";

function remoteResultToEvidence(result) {
  if (result.kind === "TIMEOUT") return { ok: false, kind: "TIMEOUT" };
  if (result.kind === "SAFETY_VIOLATION") return { ok: false, kind: "SAFETY_VIOLATION" };
  if (result.kind === "COMMAND_FAILED") return { ok: false, kind: "COMMAND_FAILED", exitCode: result.exitCode, stdout: result.stdout };
  if (result.limited) return { ok: false, kind: "OUTPUT_LIMIT_EXCEEDED" };
  return { ok: true, kind: "OK", stdout: result.stdout, exitCode: result.exitCode };
}

function stdoutOf(result) {
  return result?.stdout?.trim() || null;
}

// grep -c prints 0 and exits 1 when nothing matches: both are valid answers.
function grepCount(result) {
  if (!result) return null;
  if (result.ok || result.exitCode === 1) {
    const value = Number(result.stdout?.trim());
    return Number.isFinite(value) ? value : 0;
  }
  return null;
}

export async function runLiveRemoteChecks({
  runRemoteCheck,
  sshAlias,
  repoChecks = [],
  now = () => new Date(),
} = {}) {
  const checks = [];
  const at = now().toISOString();

  // Connectivity gate: a single fixed harmless command.
  const probe = await runRemoteCheck(sshAlias, ["true"]);
  const sshUp = probe.ok && probe.kind !== "COMMAND_FAILED" && !probe.limited;

  checks.push(createCheck({
    id: "SSH_CONNECTION", category: "transport", requirement: "required",
    status: sshUp ? "PASS" : "UNKNOWN",
    summary: sshUp ? `SSH alias ${sshAlias} reachable (non-interactive)` : `SSH alias ${sshAlias} unreachable or non-interactive`,
    evidence: { alias: sshAlias, kind: probe.kind }, provenance: "REMOTE_SSH", observedAt: at,
  }));

  const run = async (name, args) => {
    if (!sshUp) {
      return { ok: false, kind: "UPSTREAM_UNAVAILABLE" };
    }
    const result = await runRemoteCheck(sshAlias, args);
    return remoteResultToEvidence(result);
  };

  const dependent = (id, category, requirement, summary) =>
    createCheck({
      id, category, requirement, status: "UNKNOWN", summary,
      evidence: {}, provenance: "REMOTE_SSH", dependency: "SSH_CONNECTION", observedAt: at,
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

  const meminfoResult = await run("meminfo", remote.meminfo[0]);
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

  const diskResult = await run("disk", remote.disk[0]);
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
  const serviceResult = await run("serviceShow", remote.serviceShow[0]);
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

  const failedResult = await run("failedUnits", remote.failedUnits[0]);
  const failedCount = failedResult.ok ? parseJournalLines(failedResult.stdout) : null;
  checks.push(createCheck({
    id: "NO_FAILED_UNITS", category: "systemd", requirement: "required",
    status: failedCount === null ? "UNKNOWN" : failedCount === 0 ? "PASS" : "FAIL",
    summary: failedCount === 0 ? "no failed systemd units" : `${failedCount} failed systemd unit(s)`,
    evidence: { failedUnitCount: failedCount }, provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- network boundary
  const listenersResult = await run("listeners", remote.listeners[0]);
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
    ? await Promise.all([runRemoteCheck(sshAlias, remote.health[0]), runRemoteCheck(sshAlias, remote.ready[0])])
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
  const targetResult = await run("releaseTarget", remote.releaseTarget[0]);
  const listResult = await run("releaseList", remote.releaseList[0]);
  const writableResult = await run("releaseWritable", remote.releaseWritable[0]);
  const manifestResult = await run("releaseManifest", remote.releaseManifest[0]);
  const currentTarget = targetResult.ok ? targetResult.stdout.trim() : null;
  const releases = listResult.ok ? listResult.stdout.trim().split("\n").filter(Boolean) : [];
  const manifest = manifestResult.ok ? parseReleaseManifest(manifestResult.stdout) : null;
  const serviceWritable = writableResult.ok ? writableResult.exitCode === 0 : null;
  checks.push(createCheck({
    id: "RELEASE_CURRENT", category: "release", requirement: "required",
    status: currentTarget && manifest?.sourceCommit ? "PASS" : "UNKNOWN",
    summary: currentTarget ? `current -> ${currentTarget}` : "current release unknown",
    evidence: {
      currentTarget,
      releaseCount: releases.length,
      releaseBasenames: releases,
      serviceAccountWritable: serviceWritable,
      manifest: manifest ?? { sourceCommit: null },
    },
    provenance: "REMOTE_SSH", observedAt: at,
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

  // ---- nginx
  const siteLinkResult = await run("nginxSiteExists", remote.nginxSiteExists[0]);
  const siteHashResult = await run("nginxSiteHash", remote.nginxSiteHash[0]);
  const snippetHashResult = await run("nginxSnippetHash", remote.nginxSnippetHash[0]);
  const summaryResult = await run("nginxSummary", remote.nginxSummary[0]);
  const cspLiveResult = await run("cspLive", remote.cspLive[0]);
  const hstsLiveResult = await run("hstsLive", remote.hstsLive[0]);
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

  const liveCspHosts = new Set();
  for (const line of cspLiveLines) {
    const match = /https?:\/\/([^/\s"'*;]+)/g;
    let found;
    while ((found = match.exec(line)) !== null) liveCspHosts.add(found[1]);
  }
  checks.push(createCheck({
    id: "FILES_CSP_ALLOWED_LIVE", category: "nginx", requirement: "informational",
    status: liveCspHosts.has(TARGET.filesDomain) ? "PASS" : "INFO",
    summary: liveCspHosts.has(TARGET.filesDomain)
      ? "live snippet CSP includes files domain"
      : "live snippet CSP does not include files domain (expected before Transaction B)",
    evidence: { cspHostnames: [...liveCspHosts].sort() },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- environment (safe extraction)
  const envAllowedResult = await run("envAllowed", remote.envAllowed[0]);
  const envSecretId = await run("envSecretKeyId", remote.envSecretKeyId[0]);
  const envSecretSecret = await run("envSecretKeySecret", remote.envSecretKeySecret[0]);
  const envSecretSts = await run("envSecretSts", remote.envSecretSts[0]);
  let envSafe = null;
  const secretPresence = {};
  if (envAllowedResult.ok) {
    const parsed = parseEnvSafe(envAllowedResult.stdout);
    envSafe = parsed.values;
  }
  if (sshUp) {
    secretPresence.OSS_ACCESS_KEY_ID = grepCount(envSecretId) !== null ? (grepCount(envSecretId) > 0 ? "PRESENT" : "ABSENT") : "UNKNOWN";
    secretPresence.OSS_ACCESS_KEY_SECRET = grepCount(envSecretSecret) !== null ? (grepCount(envSecretSecret) > 0 ? "PRESENT" : "ABSENT") : "UNKNOWN";
    secretPresence.OSS_STS_TOKEN = grepCount(envSecretSts) !== null ? (grepCount(envSecretSts) > 0 ? "PRESENT" : "ABSENT") : "UNKNOWN";
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

  const browserEndpoint = envSafe?.OSS_BROWSER_ENDPOINT ?? null;
  checks.push(createCheck({
    id: "FILES_BROWSER_ENDPOINT_CONFIGURED", category: "env", requirement: "informational",
    status: browserEndpoint && browserEndpoint.startsWith("https://") ? "PASS" : browserEndpoint === "" || browserEndpoint === null ? "INFO" : "FAIL",
    summary: browserEndpoint && browserEndpoint.startsWith("https://")
      ? `OSS_BROWSER_ENDPOINT configured`
      : "OSS_BROWSER_ENDPOINT not configured (expected before Transaction B)",
    evidence: { configured: Boolean(browserEndpoint && browserEndpoint.startsWith("https://")) },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- database (read-only aggregates)
  const dbResult = await run("dbAudit", remote.dbAudit[0]);
  let db = null;
  if (dbResult.ok) {
    try {
      db = JSON.parse(dbResult.stdout.trim());
    } catch {
      db = null;
    }
  }
  checks.push(createCheck({
    id: "DB_INTEGRITY", category: "database", requirement: "required",
    status: db?.integrity === "ok" ? "PASS" : db === null ? "UNKNOWN" : "FAIL",
    summary: db?.integrity === "ok" ? "SQLite integrity ok" : db === null ? "database audit unavailable" : `integrity result: ${db.integrity}`,
    evidence: { integrity: db?.integrity ?? null, foreignKeyViolations: db?.fkRows ?? null, schemaVersion: db?.schemaVersion ?? null, counts: db?.counts ?? null, fileStates: db?.states ?? null },
    provenance: "REMOTE_SQLITE_READONLY", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  checks.push(createCheck({
    id: "DB_SCHEMA", category: "database", requirement: "required",
    status: db?.schemaVersion === 4 ? "PASS" : db === null ? "UNKNOWN" : "FAIL",
    summary: db?.schemaVersion === 4 ? "schema version 4" : `schema version ${db?.schemaVersion ?? "unknown"}`,
    evidence: { schemaVersion: db?.schemaVersion ?? null }, provenance: "REMOTE_SQLITE_READONLY", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  // ---- backups
  const [backupFiles, backupAge, backupManifests, ageKey] = sshUp
    ? await Promise.all([
        runRemoteCheck(sshAlias, remote.backupFileCount[0]),
        runRemoteCheck(sshAlias, remote.backupAgeCount[0]),
        runRemoteCheck(sshAlias, remote.backupManifestCount[0]),
        runRemoteCheck(sshAlias, remote.ageKeyStat[0]),
      ])
    : [];
  const newestTimestamp = (result) => {
    if (!result?.ok) return null;
    const stamps = result.stdout.trim().split("\n").map(Number).filter(Number.isFinite);
    return stamps.length ? new Date(Math.max(...stamps) * 1000).toISOString() : null;
  };
  const backupCount = backupFiles?.ok ? parseJournalLines(backupFiles.stdout) : null;
  const ageCount = backupAge?.ok ? parseJournalLines(backupAge.stdout) : null;
  const manifestCount = backupManifests?.ok ? parseJournalLines(backupManifests.stdout) : null;
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
    ? await Promise.all([
        runRemoteCheck(sshAlias, remote.certbotVersion[0]),
        runRemoteCheck(sshAlias, remote.certbotTimerEnabled[0]),
        runRemoteCheck(sshAlias, remote.certbotTimerActive[0]),
        runRemoteCheck(sshAlias, remote.renewalConfig[0]),
        runRemoteCheck(sshAlias, remote.timers[0]),
        runRemoteCheck(sshAlias, remote.cronAcademiccloud[0]),
      ])
    : [];
  const timerEnabledState = stdoutOf(timerEnabled);
  const renewalPresent = renewalConfig?.ok && renewalConfig.exitCode === 0;
  const academiccloudTimerLines = timers?.ok ? timers.stdout.split("\n").filter((line) => line.toLowerCase().includes("academiccloud")).length : null;
  const cronMatches = cronResult?.ok || cronResult?.exitCode === 1 ? 0 : null; // exit 1 = grep no matches
  const cronAcademiccloudEntries = cronResult?.ok ? parseJournalLines(cronResult.stdout) : cronMatches;
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

  // ---- OOM / error aggregation
  const [journalErrors, kernelOom, cgroupEvents, nginx5xx] = sshUp
    ? await Promise.all([
        runRemoteCheck(sshAlias, remote.journalErrors[0]),
        runRemoteCheck(sshAlias, remote.journalKernelOom[0]),
        runRemoteCheck(sshAlias, remote.cgroupMemoryEvents[0]),
        runRemoteCheck(sshAlias, remote.nginx5xx[0]),
      ])
    : [];
  const errorCount = journalErrors?.ok ? parseJournalLines(journalErrors.stdout) : journalErrors?.limited ? null : null;
  const kernelOomCount = kernelOom?.ok ? parseJournalLines(kernelOom.stdout) : null;
  const cgroupEventsData = cgroupEvents?.ok ? parseMemoryEvents(cgroupEvents.stdout) : null;
  const nginx5xxCount = grepCount(nginx5xx);
  checks.push(createCheck({
    id: "NO_ERROR_OOM_ACTIVITY", category: "resources", requirement: "required",
    status: errorCount === null && kernelOomCount === null ? "UNKNOWN"
      : errorCount === 0 && kernelOomCount === 0 && (cgroupEventsData?.oom_kill ?? 0) === 0 ? "PASS" : "FAIL",
    summary: `recent errors ${errorCount ?? "unknown"}, kernel OOM ${kernelOomCount ?? "unknown"}, cgroup oom_kill ${cgroupEventsData?.oom_kill ?? "unknown"}, nginx 5xx ${nginx5xxCount ?? "unknown"}`,
    evidence: { academiccloudErrorCountRecent: errorCount, kernelOomCountCurrentBoot: kernelOomCount, cgroupOomKill: cgroupEventsData?.oom_kill ?? null, cgroupOom: cgroupEventsData?.oom ?? null, nginx5xxCountRecent: nginx5xxCount },
    provenance: "REMOTE_SSH", observedAt: at,
    ...(!sshUp ? { dependency: "SSH_CONNECTION" } : {}),
  }));

  return checks;
}
