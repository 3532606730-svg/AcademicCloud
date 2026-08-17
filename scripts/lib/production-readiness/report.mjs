// Deterministic report rendering (markdown / json / both) and the final
// report-safety assertion gate.

import { computeOverall, exitCodeFor, createCheck } from "./model.mjs";
import { applyProfile, PROFILE_RULES } from "./profiles.mjs";
import { assertSafeReport } from "./safety.mjs";

export const REPORT_SCHEMA_VERSION = 1;
export const TOOL_VERSION = "1.1.0";
export const MAX_REPORT_BYTES = 1_000_000;

const CATEGORY_ORDER = [
  "transport", "repo", "dns", "tls", "edge", "host", "resources",
  "systemd", "network", "app", "release", "nginx", "env", "database",
  "backup", "automation", "oss", "expectation",
];

export function orderChecks(checks) {
  return [...checks].sort((left, right) => {
    const leftCategory = CATEGORY_ORDER.indexOf(left.category);
    const rightCategory = CATEGORY_ORDER.indexOf(right.category);
    const categoryOrder = (leftCategory < 0 ? CATEGORY_ORDER.length : leftCategory) - (rightCategory < 0 ? CATEGORY_ORDER.length : rightCategory);
    if (categoryOrder !== 0) return categoryOrder;
    return left.id.localeCompare(right.id, "en");
  });
}

// Profile completeness: a missing REQUIRED check can never silently allow
// READY. Any check ID the selected profile declares required but that was not
// produced by the audit mode is materialized as a deterministic UNKNOWN.
export function materializeMissingRequiredChecks(checks, profile, now = () => new Date()) {
  const present = new Set(checks.map((check) => check.id));
  const materialized = [];
  for (const [id, rules] of Object.entries(PROFILE_RULES[profile] ?? {})) {
    if (rules.requirement !== "required" || present.has(id)) continue;
    materialized.push(createCheck({
      id,
      category: "expectation",
      requirement: "required",
      status: "UNKNOWN",
      summary: "required evidence unavailable in this audit mode",
      evidence: {},
      provenance: "RECORDED_EXPECTATION",
      detail: `profile ${profile} requires ${id}; the selected mode did not produce it`,
      observedAt: now().toISOString(),
    }));
  }
  return [...checks, ...materialized];
}

export function buildReport({ mode, profile, checks, target }) {
  const profiled = checks.map((check) => applyProfile(check, profile));
  const complete = materializeMissingRequiredChecks(profiled, profile);
  const ordered = orderChecks(complete);
  const { overall, counts } = computeOverall(ordered);

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    profile,
    toolVersion: TOOL_VERSION,
    target,
    summary: { overall, ...counts },
    checks: ordered,
  };

  // Refuse to serialize anything unsafe. Throws REPORT_SAFETY_VIOLATION.
  assertSafeReport(report);

  return { report, exitCode: exitCodeFor(overall) };
}

function markdownFor(report) {
  const lines = [];
  lines.push("# AcademicCloud Production Readiness Audit");
  lines.push("");
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Profile: ${report.profile}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`Overall: **${report.summary.overall}**`);
  lines.push(`Pass ${report.summary.pass} · Fail ${report.summary.fail} · Warn ${report.summary.warn} · Unknown ${report.summary.unknown} · Info ${report.summary.info}`);
  lines.push("");

  let currentCategory = null;
  for (const check of report.checks) {
    if (check.category !== currentCategory) {
      currentCategory = check.category;
      lines.push("");
      lines.push(`## ${String(currentCategory).toUpperCase()}`);
      lines.push("");
    }
    const requirement = check.requirement === "required" ? " [required]" : "";
    const dependency = check.dependency ? ` (depends on ${check.dependency})` : "";
    lines.push(`- ${check.status}${requirement} **${check.id}** — ${check.summary}${dependency}`);
    if (check.detail) lines.push(`  - detail: ${String(check.detail)}`);
    for (const [key, value] of Object.entries(check.evidence ?? {})) {
      if (value === null || value === undefined) continue;
      const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`  - ${key}: ${rendered}`);
    }
  }

  lines.push("");
  lines.push("READ-ONLY AUDITOR — this tool never deploys, repairs, restarts, or modifies anything.");
  lines.push("");
  return lines.join("\n");
}

export function renderReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "both") {
    const markdown = markdownFor(report);
    const json = JSON.stringify(report, null, 2);
    const combined = `${markdown}\n\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
    if (Buffer.byteLength(combined, "utf8") > MAX_REPORT_BYTES) {
      throw new Error("REPORT_LIMIT_EXCEEDED");
    }
    return combined;
  }
  const markdown = markdownFor(report);
  if (Buffer.byteLength(markdown, "utf8") > MAX_REPORT_BYTES) {
    throw new Error("REPORT_LIMIT_EXCEEDED");
  }
  return markdown;
}

