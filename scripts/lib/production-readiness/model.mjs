// Stable check result model for the production readiness auditor.
// Statuses are deliberate: UNKNOWN is never FAIL and never becomes PASS.

export const CHECK_STATUSES = ["PASS", "FAIL", "WARN", "UNKNOWN", "INFO", "NOT_APPLICABLE"];
export const REQUIREMENT_LEVELS = ["required", "advisory", "informational"];
export const PROVENANCE = [
  "LOCAL_COMMAND",
  "LOCAL_FILESYSTEM",
  "PUBLIC_DNS",
  "PUBLIC_HTTPS",
  "PUBLIC_TLS",
  "REMOTE_SSH",
  "REMOTE_SQLITE_READONLY",
  "RECORDED_EXPECTATION",
];

export const OVERALL = ["READY", "NOT_READY", "INDETERMINATE"];
export const EXIT_CODES = Object.freeze({
  READY: 0,
  TOOL_ERROR: 1,
  NOT_READY: 2,
  INDETERMINATE: 3,
});

export function createCheck({
  id,
  category,
  requirement = "advisory",
  status,
  summary,
  evidence = {},
  provenance = "LOCAL_COMMAND",
  observedAt = null,
  dependency = null,
  detail = null,
}) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(id)) {
    throw new Error(`invalid check id: ${id}`);
  }
  if (!CHECK_STATUSES.includes(status)) {
    throw new Error(`invalid check status for ${id}: ${status}`);
  }
  if (!REQUIREMENT_LEVELS.includes(requirement)) {
    throw new Error(`invalid requirement level for ${id}: ${requirement}`);
  }

  return {
    id,
    category,
    requirement,
    status,
    summary,
    evidence,
    provenance,
    observedAt: observedAt ?? new Date().toISOString(),
    ...(dependency ? { dependency } : {}),
    ...(detail ? { detail } : {}),
  };
}

export function computeOverall(checks) {
  const counts = { pass: 0, fail: 0, warn: 0, unknown: 0, info: 0, notApplicable: 0 };
  let requiredFail = false;
  let requiredUnknown = false;

  for (const check of checks) {
    if (check.status === "PASS") counts.pass += 1;
    else if (check.status === "FAIL") counts.fail += 1;
    else if (check.status === "WARN") counts.warn += 1;
    else if (check.status === "UNKNOWN") counts.unknown += 1;
    else if (check.status === "INFO") counts.info += 1;
    else counts.notApplicable += 1;

    if (check.requirement !== "required") continue;
    if (check.status === "FAIL") requiredFail = true;
    if (check.status === "UNKNOWN") requiredUnknown = true;
  }

  // Deterministic gates — no invented probability.
  const overall = requiredFail ? "NOT_READY" : requiredUnknown ? "INDETERMINATE" : "READY";

  return { overall, counts };
}

export function exitCodeFor(overall) {
  if (overall === "NOT_READY") return EXIT_CODES.NOT_READY;
  if (overall === "INDETERMINATE") return EXIT_CODES.INDETERMINATE;
  return EXIT_CODES.READY;
}
