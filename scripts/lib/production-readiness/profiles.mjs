// Expectation profiles: the SAME live state can be correct before a
// deployment and wrong after it. Profiles only adjust requirement levels and
// expected statuses for specific check IDs; they never change how evidence is
// collected and never add commands.

export const PROFILES = ["baseline", "ux01-ready", "post-ux01"];
export const DEFAULT_PROFILE = "post-ux01";

// For each profile: per-check overrides.
//   requirement: "required" | "advisory" | "informational"
//   expect:      array of statuses the raw result may legitimately have; if
//                the raw status is not listed, the check status is FAIL.
// A missing entry means the check's own default requirement/status applies.
export const PROFILE_RULES = {
  baseline: {
    SERVICE_AUTOSTART_DISABLED: { requirement: "advisory" },
    CERTBOT_TIMER: { requirement: "advisory" },
    BACKUP_CADENCE: { requirement: "advisory" },
    FILES_DNS_TARGET: { requirement: "informational", expect: ["INFO", "PASS"] },
    FILES_TLS_AVAILABLE: { requirement: "informational", expect: ["INFO", "PASS"] },
    FILES_CSP_ALLOWED: { requirement: "informational", expect: ["INFO", "PASS"] },
    FILES_BROWSER_ENDPOINT_CONFIGURED: { requirement: "informational", expect: ["INFO", "PASS"] },
    PRODUCTION_DRIFT: { requirement: "advisory", expect: ["WARN", "PASS", "INFO", "UNKNOWN"] },
  },
  "ux01-ready": {
    SERVICE_AUTOSTART_DISABLED: { requirement: "advisory" },
    CERTBOT_TIMER: { requirement: "advisory" },
    BACKUP_CADENCE: { requirement: "advisory" },
    FILES_DNS_TARGET: { requirement: "required", expect: ["PASS", "UNKNOWN"] },
    FILES_TLS_AVAILABLE: { requirement: "required", expect: ["PASS"] },
    FILES_CSP_ALLOWED: { requirement: "required", expect: ["PASS"] },
    FILES_BROWSER_ENDPOINT_CONFIGURED: { requirement: "required", expect: ["PASS"] },
    PRODUCTION_DRIFT: { requirement: "advisory", expect: ["WARN", "PASS", "INFO", "UNKNOWN"] },
  },
  "post-ux01": {
    SERVICE_AUTOSTART_DISABLED: { requirement: "advisory" },
    CERTBOT_TIMER: { requirement: "advisory" },
    BACKUP_CADENCE: { requirement: "advisory", expect: ["WARN", "UNKNOWN"] },
    BACKUP_PRESENT: { requirement: "advisory", expect: ["UNKNOWN"] },
    BACKUP_OFFHOST_VERIFIED: { requirement: "advisory", expect: ["UNKNOWN"] },
    FILES_DNS_TARGET: { requirement: "required", expect: ["PASS", "UNKNOWN"] },
    TLS_FILES_VALID: { requirement: "required", expect: ["PASS"] },
    TLS_FILES_EXPIRY_HEADROOM: { requirement: "required", expect: ["PASS", "WARN"] },
    FILES_CSP_ALLOWED: { requirement: "required", expect: ["PASS"] },
    FILES_BROWSER_ENDPOINT_CONFIGURED: { requirement: "required", expect: ["PASS"] },
    PRODUCTION_DRIFT: { requirement: "advisory", expect: ["WARN", "PASS", "INFO", "UNKNOWN"] },
  },
};

export function applyProfile(check, profile) {
  const rules = PROFILE_RULES[profile]?.[check.id];

  if (!rules) {
    return check;
  }

  const status = rules.expect && !rules.expect.includes(check.status) ? "FAIL" : check.status;

  return {
    ...check,
    requirement: rules.requirement ?? check.requirement,
    status,
    ...(status !== check.status
      ? { detail: `profile ${profile} expects ${rules.expect.join("/")}; observed ${check.status}` }
      : {}),
  };
}
