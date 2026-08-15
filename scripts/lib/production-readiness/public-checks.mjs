// Public observation checks: DNS, TLS, HTTP (GET only), CSP.
// No authentication, no cookies stored, no POST/PUT/PATCH/DELETE, no OPTIONS.

import { lookup } from "node:dns/promises";
import { resolveCaa, resolveCname, resolveNs } from "node:dns/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { connect as tlsConnect } from "node:tls";

import { createCheck } from "./model.mjs";
import { certificateStatus, parseCspHeader, TARGET } from "./checks.mjs";

export const PUBLIC_TIMEOUT_MS = 15_000;
export const DNS_TIMEOUT_MS = 15_000;

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]);
}

async function dnsCheck(resolver, id, summaryPrefix, label) {
  try {
    const records = await withTimeout(resolver(), DNS_TIMEOUT_MS, label);
    return createCheck({
      id, category: "dns", requirement: "advisory", status: "PASS",
      summary: `${summaryPrefix}: ${records.length} record(s)`,
      evidence: { records: records.map(String).slice(0, 8) },
      provenance: "PUBLIC_DNS",
    });
  } catch (error) {
    return createCheck({
      id, category: "dns", requirement: "advisory", status: "UNKNOWN",
      summary: `${summaryPrefix}: resolution failed (${error?.code ?? "error"})`,
      evidence: {}, provenance: "PUBLIC_DNS", detail: error?.code ?? "resolution_error",
    });
  }
}

// A/AAAA through getaddrinfo (system resolver, works even where direct
// c-ares queries are blocked). A missing AAAA set is a legitimate observation.
async function lookupCheck(hostname, family, id, summaryPrefix) {
  try {
    const records = await withTimeout(lookup(hostname, { family, all: true }), DNS_TIMEOUT_MS, id);
    return createCheck({
      id, category: "dns", requirement: "advisory", status: "PASS",
      summary: `${summaryPrefix}: ${records.length} record(s)`,
      evidence: { records: records.slice(0, 8).map((record) => record.address) },
      provenance: "PUBLIC_DNS",
    });
  } catch (error) {
    if (family === 6 && ["ENODATA", "ENOTFOUND", "EAI_NONAME"].includes(error?.code)) {
      return createCheck({
        id, category: "dns", requirement: "advisory", status: "INFO",
        summary: `${summaryPrefix}: no AAAA records`,
        evidence: { records: [] }, provenance: "PUBLIC_DNS",
      });
    }
    return createCheck({
      id, category: "dns", requirement: "advisory", status: "UNKNOWN",
      summary: `${summaryPrefix}: resolution failed (${error?.code ?? "error"})`,
      evidence: {}, provenance: "PUBLIC_DNS", detail: error?.code ?? "resolution_error",
    });
  }
}

function httpsGetOnce(url) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, { headers: { "User-Agent": "academiccloud-readiness-auditor" } }, (response) => {
      const headers = {};
      for (const name of ["content-security-policy", "strict-transport-security", "content-type", "set-cookie"]) {
        const value = response.headers[name];
        headers[name] = Array.isArray(value) ? value.length : value;
      }
      response.resume();
      response.on("end", () => {
        resolve({ status: response.statusCode, headers });
      });
    });
    request.setTimeout(PUBLIC_TIMEOUT_MS, () => {
      request.destroy(new Error("http timeout"));
    });
    request.on("error", reject);
  });
}

function httpRedirectProbe(url) {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, (response) => {
      const location = response.headers.location ?? null;
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode, location }));
    });
    request.setTimeout(PUBLIC_TIMEOUT_MS, () => request.destroy(new Error("http timeout")));
    request.on("error", reject);
  });
}

export function tlsProbe(hostname, port = 443) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let socket;
    try {
      socket = tlsConnect({
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: true,
      });
    } catch (error) {
      finish({ ok: false, error: String(error?.message ?? error) });
      return;
    }
    socket.setTimeout(PUBLIC_TIMEOUT_MS, () => {
      socket.destroy();
      finish({ ok: false, error: "TLS connection timed out" });
    });
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const subjectCn = cert?.subject?.CN ?? null;
      const issuerCn = cert?.issuer?.CN ?? null;
      const altNames = cert?.subjectaltname ?? "";
      const finishData = {
        ok: true,
        authorized: socket.authorized,
        authorizationError: socket.authorized ? null : socket.authorizationError,
        protocol: socket.getProtocol(),
        subjectCn,
        issuerCn,
        altNames,
        validFrom: cert?.valid_from ?? null,
        validTo: cert?.valid_to ?? null,
      };
      socket.destroy();
      finish(finishData);
    });
    socket.on("error", (error) => {
      finish({ ok: false, error: error?.code ?? error?.message ?? String(error) });
    });
  });
}

export function evaluateTlsEvidence(result, hostname) {
  if (!result.ok) {
    return createCheck({
      id: "TLS_CLOUD", category: "tls", requirement: "required", status: "UNKNOWN",
      summary: `TLS probe for ${hostname} failed: ${result.error ?? "unknown error"}`,
      evidence: { hostname }, provenance: "PUBLIC_TLS",
    });
  }
  const validTo = result.validTo ? new Date(result.validTo) : null;
  const daysRemaining = validTo ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000) : null;
  return createCheck({
    id: "TLS_CLOUD", category: "tls", requirement: "required",
    status: result.authorized ? certificateStatus(daysRemaining ?? 0) : "FAIL",
    summary: `TLS ${result.protocol ?? "unknown"} for ${hostname}${result.authorized ? "" : ` (authorization failed: ${result.authorizationError ?? "unknown"})`}`,
    evidence: {
      hostname,
      subjectCn: result.subjectCn,
      issuerCn: result.issuerCn,
      altNames: result.altNames,
      validFrom: result.validFrom,
      validTo: result.validTo,
      daysRemaining,
      protocol: result.protocol,
      authorized: result.authorized,
    },
    provenance: "PUBLIC_TLS",
  });
}

export async function runPublicChecks({ now = () => new Date() } = {}) {
  const checks = [];
  const at = now().toISOString();

  checks.push(await lookupCheck(TARGET.appHostname, 4, "DNS_CLOUD_A", `${TARGET.appHostname} A`));
  checks.push(await dnsCheck(() => resolveCname(TARGET.filesDomain), "FILES_DNS_TARGET", `${TARGET.filesDomain} CNAME`, "files CNAME"));
  checks.push(await lookupCheck(TARGET.filesDomain, 4, "DNS_FILES_A", `${TARGET.filesDomain} A`));
  checks.push(await lookupCheck(TARGET.filesDomain, 6, "DNS_FILES_AAAA", `${TARGET.filesDomain} AAAA`));
  checks.push(await dnsCheck(() => resolveNs(TARGET.apexDomain), "DNS_NS", `${TARGET.apexDomain} NS`, "apex NS"));

  let caaRecords = [];
  let caaError = null;
  for (const name of [TARGET.filesDomain, TARGET.apexDomain]) {
    try {
      const records = await withTimeout(resolveCaa(name), DNS_TIMEOUT_MS, `CAA ${name}`);
      caaRecords.push(...records.map((record) => ({ name, flags: record.flags, tag: record.tag, value: record.value })));
    } catch (error) {
      caaError = error?.code ?? "caa_error";
    }
  }
  checks.push(createCheck({
    id: "DNS_CAA", category: "dns", requirement: "advisory",
    status: caaError ? "UNKNOWN" : "PASS",
    summary: caaError ? "CAA inspection unavailable" : `CAA inspection complete (${caaRecords.length} record(s))`,
    evidence: { records: caaRecords, error: caaError }, provenance: "PUBLIC_DNS", observedAt: at,
  }));

  const tlsResult = await tlsProbe(TARGET.appHostname);
  checks.push(evaluateTlsEvidence(tlsResult, TARGET.appHostname));

  const filesTls = await tlsProbe(TARGET.filesDomain);
  checks.push(createCheck({
    id: "FILES_TLS_AVAILABLE", category: "tls", requirement: "informational",
    status: filesTls.ok && filesTls.authorized ? "PASS" : "INFO",
    summary: filesTls.ok
      ? `files domain TLS reachable${filesTls.authorized ? "" : " but not authorized"}`
      : "files domain TLS unavailable (expected until the custom domain is provisioned)",
    evidence: { ok: filesTls.ok, authorized: filesTls.authorized ?? null },
    provenance: "PUBLIC_TLS", observedAt: at,
  }));

  let publicResponse = null;
  let publicError = null;
  try {
    publicResponse = await withTimeout(httpsGetOnce(`${TARGET.appOrigin}/`), PUBLIC_TIMEOUT_MS, "public index");
  } catch (error) {
    publicError = error?.code ?? error?.message ?? "request failed";
  }
  checks.push(createCheck({
    id: "PUBLIC_HTTPS", category: "edge", requirement: "required",
    status: publicResponse?.status === 200 ? "PASS" : "FAIL",
    summary: publicResponse ? `public HTTPS ${publicResponse.status}` : `public HTTPS request failed (${publicError})`,
    evidence: { status: publicResponse?.status ?? null }, provenance: "PUBLIC_HTTPS", observedAt: at,
  }));

  let redirectResponse = null;
  try {
    redirectResponse = await withTimeout(httpRedirectProbe(`http://${TARGET.appHostname}/`), PUBLIC_TIMEOUT_MS, "http redirect");
  } catch {
    redirectResponse = null;
  }
  checks.push(createCheck({
    id: "PUBLIC_HTTP_REDIRECT", category: "edge", requirement: "required",
    status: redirectResponse?.status === 301 && redirectResponse.location?.startsWith(TARGET.appOrigin) ? "PASS" : "FAIL",
    summary: redirectResponse
      ? `HTTP ${redirectResponse.status} -> ${redirectResponse.location?.startsWith(TARGET.appOrigin) ? TARGET.appOrigin : "(unexpected target)"}`
      : "HTTP redirect probe failed",
    evidence: { status: redirectResponse?.status ?? null, redirectsToAppOrigin: Boolean(redirectResponse?.location?.startsWith(TARGET.appOrigin)) },
    provenance: "PUBLIC_HTTPS", observedAt: at,
  }));

  for (const [id, path] of [["PUBLIC_API_HEALTH", "/api/health"], ["PUBLIC_API_READY", "/api/ready"]]) {
    let apiResponse = null;
    let apiError = null;
    try {
      apiResponse = await withTimeout(httpsGetOnce(`${TARGET.appOrigin}${path}`), PUBLIC_TIMEOUT_MS, id);
    } catch (error) {
      apiError = error?.code ?? error?.message ?? "request failed";
    }
    checks.push(createCheck({
      id, category: "edge", requirement: "required",
      status: apiResponse?.status === 200 ? "PASS" : "FAIL",
      summary: apiResponse ? `${path} ${apiResponse.status}` : `${path} request failed (${apiError})`,
      evidence: { status: apiResponse?.status ?? null, setCookiePresent: apiResponse ? Boolean(apiResponse.headers["set-cookie"]) : null },
      provenance: "PUBLIC_HTTPS", observedAt: at,
    }));
  }

  const csp = parseCspHeader(publicResponse?.headers["content-security-policy"] ?? null);
  checks.push(createCheck({
    id: "CSP_SERVED", category: "edge", requirement: "advisory",
    status: csp.present ? "PASS" : "WARN",
    summary: csp.present ? "Content-Security-Policy header served" : "no CSP header observed",
    evidence: { present: csp.present, hostnames: csp.hostnames },
    provenance: "PUBLIC_HTTPS", observedAt: at,
  }));

  checks.push(createCheck({
    id: "FILES_CSP_ALLOWED", category: "edge", requirement: "informational",
    status: csp.present && csp.hostnames.includes(TARGET.filesDomain) ? "PASS" : "INFO",
    summary: csp.present && csp.hostnames.includes(TARGET.filesDomain)
      ? "files domain present in served CSP"
      : "files domain absent from served CSP (expected until Transaction B)",
    evidence: { filesDomainInCsp: csp.hostnames.includes(TARGET.filesDomain) },
    provenance: "PUBLIC_HTTPS", observedAt: at,
  }));

  checks.push(createCheck({
    id: "HSTS_SERVED", category: "edge", requirement: "informational",
    status: publicResponse?.headers["strict-transport-security"] ? "PASS" : "INFO",
    summary: publicResponse?.headers["strict-transport-security"] ? "HSTS header served" : "HSTS not served (per current runbook state)",
    evidence: { hstsPresent: Boolean(publicResponse?.headers["strict-transport-security"]) },
    provenance: "PUBLIC_HTTPS", observedAt: at,
  }));

  let ossListingStatus = null;
  let ossError = null;
  try {
    const ossResponse = await withTimeout(
      httpsGetOnce(`https://${TARGET.ossBucket}.${TARGET.ossRegion}.aliyuncs.com/?list-type=2&max-keys=1`),
      PUBLIC_TIMEOUT_MS,
      "oss listing",
    );
    ossListingStatus = ossResponse.status;
  } catch (error) {
    ossError = error?.code ?? error?.message ?? "request failed";
  }
  checks.push(createCheck({
    id: "OSS_ANON_LISTING", category: "oss", requirement: "required",
    status: ossListingStatus === 403 ? "PASS" : ossListingStatus ? "FAIL" : "UNKNOWN",
    summary: ossListingStatus === 403
      ? "anonymous bucket listing denied (403)"
      : ossListingStatus
        ? `anonymous bucket listing returned ${ossListingStatus} (expected 403)`
        : `bucket listing probe failed (${ossError})`,
    evidence: { status: ossListingStatus }, provenance: "PUBLIC_HTTPS", observedAt: at,
  }));

  return checks;
}
