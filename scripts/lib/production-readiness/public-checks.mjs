// Public observation checks: DNS, TLS, HTTP (GET only), CSP.
// No authentication, no cookies stored, no POST/PUT/PATCH/DELETE, no OPTIONS.

import { lookup } from "node:dns/promises";
import { resolveCaa, resolveCname, resolveNs } from "node:dns/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { connect as tlsConnect } from "node:tls";

import { createCheck } from "./model.mjs";
import { certificateStatus, certificateUrgency, cspAllowsFiles, parseCspHeader, TARGET } from "./checks.mjs";

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
        // Complete the read-only handshake even when trust/hostname
        // authorization fails so the check can report a definite FAIL rather
        // than collapsing a presented-but-invalid certificate into UNKNOWN.
        // No application data or credential is sent.
        rejectUnauthorized: false,
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

export function normalizeHostname(hostname) {
  return String(hostname).trim().toLowerCase().replace(/\.$/, "");
}

export function normalizeEndpoint(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.replace(/\/+$/, "");
}

// Pure CNAME-target evaluation (case + trailing-dot normalized).
export function evaluateCnameTargets(targets, expectedFilesCname, profile) {
  const normalizedTargets = targets.map(normalizeHostname);
  if (expectedFilesCname) {
    const expected = normalizeHostname(expectedFilesCname);
    const matched = normalizedTargets.includes(expected);
    return {
      status: matched ? "PASS" : "FAIL",
      summary: matched
        ? `CNAME matches expected ${expected}`
        : `CNAME does not match expected ${expected} (observed: ${normalizedTargets.join(", ") || "none"})`,
      matched,
    };
  }
  if (profile === "ux01-ready" || profile === "post-ux01") {
    return { status: "UNKNOWN", summary: `CNAME expectation not supplied (--expected-files-cname required for ${profile})`, matched: false };
  }
  return { status: "INFO", summary: `CNAME observed: ${normalizedTargets.join(", ") || "(none)"}`, matched: false };
}

// Exact ORIGIN comparison (URL parsing), never prefix matching.
export function redirectsToOrigin(location, appOrigin) {
  if (!location) return false;
  try {
    return new URL(location).origin === appOrigin;
  } catch {
    return false;
  }
}

export function evaluateTlsEvidence(result, hostname, options = {}) {
  const prefix = options.prefix ?? "TLS_CLOUD";
  const expiryRequirement = options.expiryRequirement ?? "advisory";
  const now = options.now ?? (() => new Date());
  const checks = [];
  if (!result.ok) {
    checks.push(createCheck({
      id: `${prefix}_VALID`, category: "tls", requirement: "required", status: "UNKNOWN",
      summary: `TLS probe for ${hostname} failed: ${result.error ?? "unknown error"}`,
      evidence: { hostname }, provenance: "PUBLIC_TLS",
    }));
    checks.push(createCheck({
      id: `${prefix}_EXPIRY_HEADROOM`, category: "tls", requirement: expiryRequirement, status: "UNKNOWN",
      summary: "certificate expiry headroom unavailable",
      evidence: {}, provenance: "PUBLIC_TLS",
    }));
    return checks;
  }
  const observedNow = now();
  const validFrom = result.validFrom ? new Date(result.validFrom) : null;
  const validTo = result.validTo ? new Date(result.validTo) : null;
  const dateEvidenceKnown = Number.isFinite(observedNow?.getTime?.())
    && validFrom !== null
    && Number.isFinite(validFrom.getTime())
    && validTo !== null
    && Number.isFinite(validTo.getTime())
    && validFrom.getTime() <= validTo.getTime();
  const withinValidityWindow = dateEvidenceKnown
    && observedNow.getTime() >= validFrom.getTime()
    && observedNow.getTime() <= validTo.getTime();
  const daysRemaining = dateEvidenceKnown
    ? Math.floor((validTo.getTime() - observedNow.getTime()) / 86_400_000)
    : null;
  const validEvidence = {
    hostname,
    subjectCn: result.subjectCn,
    issuerCn: result.issuerCn,
    altNames: result.altNames,
    validFrom: result.validFrom,
    validTo: result.validTo,
    daysRemaining,
    protocol: result.protocol,
    authorized: result.authorized,
  };
  checks.push(createCheck({
    id: `${prefix}_VALID`, category: "tls", requirement: "required",
    status: result.authorized && withinValidityWindow ? "PASS" : "FAIL",
    summary: !dateEvidenceKnown
      ? `TLS validity evidence for ${hostname} is malformed`
      : result.authorized && withinValidityWindow
      ? `TLS ${result.protocol ?? "unknown"} for ${hostname} verified`
      : !withinValidityWindow
        ? `TLS certificate for ${hostname} is outside its validity window`
        : `TLS verification failed for ${hostname} (${result.authorizationError ?? "unknown error"})`,
    evidence: validEvidence, provenance: "PUBLIC_TLS",
  }));
  checks.push(createCheck({
    id: `${prefix}_EXPIRY_HEADROOM`, category: "tls", requirement: expiryRequirement,
    status: daysRemaining === null ? "UNKNOWN" : certificateStatus(daysRemaining),
    summary: daysRemaining === null
      ? "certificate expiry headroom unavailable"
      : `certificate expires in ${daysRemaining} days`,
    evidence: { daysRemaining, urgency: daysRemaining === null ? null : certificateUrgency(daysRemaining), thresholdsDays: [30, 14, 7] }, provenance: "PUBLIC_TLS",
  }));
  return checks;
}

export async function runPublicChecks({ now = () => new Date(), expectedFilesCname = null, profile = "baseline" } = {}) {
  const checks = [];
  const at = now().toISOString();
  const filesDomainOrigin = `https://${TARGET.filesDomain}`;

  checks.push(await lookupCheck(TARGET.appHostname, 4, "DNS_CLOUD_A", `${TARGET.appHostname} A`));

  // FILES_DNS_TARGET: without an expected target the parking/current CNAME is
  // reported as informational under baseline, but under ux01-ready a missing
  // expectation is UNKNOWN (never READY). With an expected target the resolved
  // CNAME must match exactly (case + trailing-dot normalized).
  let cnameCheck = null;
  try {
    const records = await withTimeout(resolveCname(TARGET.filesDomain), DNS_TIMEOUT_MS, "files CNAME");
    const targets = records.map((record) => normalizeHostname(record));
    const evaluation = evaluateCnameTargets(targets, expectedFilesCname, profile);
    cnameCheck = createCheck({
      id: "FILES_DNS_TARGET", category: "dns", requirement: "advisory", status: evaluation.status,
      summary: `${TARGET.filesDomain} ${evaluation.summary}`,
      evidence: { records: targets }, provenance: "PUBLIC_DNS", observedAt: at,
    });
  } catch (error) {
    cnameCheck = createCheck({
      id: "FILES_DNS_TARGET", category: "dns", requirement: "advisory", status: "UNKNOWN",
      summary: `${TARGET.filesDomain} CNAME resolution failed (${error?.code ?? "error"})`,
      evidence: {}, provenance: "PUBLIC_DNS", detail: error?.code ?? "resolution_error", observedAt: at,
    });
  }
  checks.push(cnameCheck);
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
  checks.push(...evaluateTlsEvidence(tlsResult, TARGET.appHostname, { now, expiryRequirement: "required" }));

  const filesTls = await tlsProbe(TARGET.filesDomain);
  checks.push(...evaluateTlsEvidence(filesTls, TARGET.filesDomain, {
    prefix: "TLS_FILES",
    now,
    expiryRequirement: "required",
  }));
  checks.push(createCheck({
    id: "FILES_TLS_AVAILABLE", category: "tls", requirement: "informational",
    status: filesTls.ok && filesTls.authorized ? "PASS" : "INFO",
    summary: filesTls.ok
      ? `files domain TLS reachable${filesTls.authorized ? "" : " but not authorized"}`
      : "files domain TLS observation unavailable",
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
  let redirectError = null;
  try {
    redirectResponse = await withTimeout(httpRedirectProbe(`http://${TARGET.appHostname}/`), PUBLIC_TIMEOUT_MS, "http redirect");
  } catch (error) {
    redirectError = error?.code ?? error?.message ?? "request failed";
  }
  // Exact ORIGIN comparison (URL parsing), never prefix matching: a redirect
  // to https://cloud.ajtlab.top.evil.example must NOT count as the app origin.
  const redirectsToAppOrigin = redirectsToOrigin(redirectResponse?.location ?? null, TARGET.appOrigin);
  checks.push(createCheck({
    id: "PUBLIC_HTTP_REDIRECT", category: "edge", requirement: "required",
    status: redirectResponse?.status === 301 && redirectsToAppOrigin ? "PASS" : "FAIL",
    summary: redirectResponse
      ? `HTTP ${redirectResponse.status} -> ${redirectsToAppOrigin ? TARGET.appOrigin : "(unexpected target)"}`
      : `HTTP redirect probe failed (${redirectError})`,
    evidence: { status: redirectResponse?.status ?? null, redirectsToAppOrigin },
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

  // UX01 contract: the files domain must appear in img-src AND frame-src.
  // Presence in connect-src/default-src/script-src is NOT sufficient.
  const filesCsp = cspAllowsFiles(csp.directives, filesDomainOrigin);
  checks.push(createCheck({
    id: "FILES_CSP_ALLOWED", category: "edge", requirement: "informational",
    status: filesCsp.satisfied ? "PASS" : "INFO",
    summary: filesCsp.satisfied
      ? "files domain present in served img-src AND frame-src"
      : profile === "post-ux01"
        ? "post-UX01 response is missing the files domain from img-src and/or frame-src"
        : "files domain is not present in both required served CSP directives",
    evidence: { imgSrcAllows: filesCsp.imgSrcAllows, frameSrcAllows: filesCsp.frameSrcAllows },
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
