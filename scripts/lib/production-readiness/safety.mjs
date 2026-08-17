// Final-report safety assertion and mutation denylist.
// Defense in depth: evidence is structurally restricted during collection
// (see checks.mjs), and the serializer refuses anything that still looks
// unsafe. On violation the tool reports REPORT_SAFETY_VIOLATION and prints
// NOTHING of the unsafe report.

export const MUTATION_TOKENS = [
  "systemctl start",
  "systemctl stop",
  "systemctl restart",
  "systemctl reload",
  "systemctl enable",
  "systemctl disable",
  "daemon-reload",
  "nginx -s reload",
  "certbot renew",
  "certbot certonly",
  "apt ",
  "apt-get",
  "dnf ",
  "yum ",
  "npm install",
  "npm ci",
  "rm ",
  "rmdir",
  "unlink",
  "mv ",
  "cp ",
  "chmod",
  "chown",
  "sed -i",
  "tee ",
  "truncate",
  "dd ",
  "touch ",
  "mkdir",
  "ln -s",
  "kill ",
  "pkill",
  "killall",
  "reboot",
  "shutdown",
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "VACUUM",
  "ossutil cp",
  "ossutil rm",
  "curl -X POST",
  "curl -X PUT",
  "curl -X PATCH",
  "curl -X DELETE",
];

// Unsafe-value detectors. Conservative on real secrets, deliberately blind to
// legitimate operational values (127.0.0.1:3000, hostnames, "active", commit
// SHAs, HTTP 200, ...).
const UNSAFE_PATTERNS = [
  { name: "privateKeyPem", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "authorizationHeader", pattern: /\bAuthorization\s*:\s*\S+/i },
  { name: "bearerToken", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { name: "sessionCookie", pattern: /__Host-ac_session=/ },
  { name: "ossAccessKeyId", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "ossAccessKeySecret", pattern: /OSS_ACCESS_KEY_SECRET\s*=\s*[A-Za-z0-9+/_-]{8,}/ },
  { name: "stsTokenValue", pattern: /OSS_STS_TOKEN\s*=\s*[A-Za-z0-9+/_-]{8,}/ },
  { name: "ossSignature", pattern: /[Xx]-[Oo]ss-[Ss]ignature\s*=/ },
  { name: "signedUrlQuery", pattern: /[?&]Signature=/ },
  { name: "postPolicy", pattern: /policy\s*=\s*[A-Za-z0-9+/]{40,}={0,2}/ },
  { name: "objectKeyPath", pattern: /\bobjects\/[0-9a-f]{2}\/[0-9a-f]{60,}\b/ },
  { name: "argon2Hash", pattern: /\$argon2id\$v=\d+\$/ },
  { name: "passwordHashField", pattern: /password[_]?[Hh]ash\s*[:=]\s*[^"'\s{}]+/ },
  { name: "ageSecretKey", pattern: /AGE-SECRET-KEY-1[0-9A-Z]{10,}/ },
  { name: "githubToken", pattern: /\bghp_[A-Za-z0-9]{20,}\b/ },
];

export function findUnsafeValue(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  for (const entry of UNSAFE_PATTERNS) {
    if (entry.pattern.test(value)) {
      return entry.name;
    }
  }
  return null;
}

export function assertSafeReport(report) {
  const walk = (value, path) => {
    if (typeof value === "string") {
      const unsafe = findUnsafeValue(value);
      if (unsafe) {
        const error = new Error(`unsafe report value at ${path}`);
        error.name = "REPORT_SAFETY_VIOLATION";
        error.safetyDetail = unsafe;
        throw error;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        walk(item, `${path}[${index}]`);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(child, `${path}.${key}`);
      }
    }
  };

  walk(report, "report");
  return true;
}

// Sanitize a git remote URL into owner/repo (SSH) or host/path without any
// embedded credentials.
export function sanitizeRemoteUrl(raw) {
  if (!raw) {
    return null;
  }
  const trimmed = String(raw).trim();
  // SSH scp-like form: [user@]host:path (no :// scheme).
  if (!trimmed.includes("://") && /^(?:[^@\s]+@)?[^:\s]+:.+$/.test(trimmed)) {
    const match = /^(?:[^@\s]+@)?([^:\s]+):(.+)$/.exec(trimmed);
    return { transport: "ssh", host: match?.[1] ?? null, path: match?.[2]?.replace(/\.git$/, "") ?? null };
  }
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
    }
    return { transport: url.protocol.replace(":", ""), host: url.hostname, path: url.pathname.replace(/^\/+/, "").replace(/\.git$/, "") };
  } catch {
    return { transport: "unrecognized", host: null, path: null };
  }
}

