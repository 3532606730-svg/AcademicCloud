import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export const ACADEMICCLOUD_APP_ORIGIN = "https://cloud.ajtlab.top";
export const ACADEMICCLOUD_OSS_ORIGIN = "https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com";
export const ACADEMICCLOUD_CORS_METHODS = Object.freeze(["POST", "PUT"]);
export const ACADEMICCLOUD_CORS_ALLOWED_HEADERS = Object.freeze(["content-md5"]);

function headerTokens(headers, name) {
  return (headers.get(name) ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function assertAcademicCloudCorsSuccess(response, expectedMethod) {
  assert.equal(response.status, 200, `${expectedMethod} CORS preflight must return 200`);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    ACADEMICCLOUD_APP_ORIGIN,
    `${expectedMethod} CORS preflight must allow only the exact application origin`,
  );

  const allowedMethods = headerTokens(response.headers, "access-control-allow-methods");
  assert.ok(allowedMethods.includes(expectedMethod.toLowerCase()), `${expectedMethod} must be allowed by CORS`);
  assert.ok(
    allowedMethods.every((method) => ACADEMICCLOUD_CORS_METHODS.some((allowed) => allowed.toLowerCase() === method)),
    "CORS must not expose an unrelated method",
  );

  const allowedHeaders = headerTokens(response.headers, "access-control-allow-headers");
  assert.ok(
    allowedHeaders.every((header) => ACADEMICCLOUD_CORS_ALLOWED_HEADERS.includes(header)),
    "CORS must not expose an unrelated request header",
  );
  if (expectedMethod === "PUT") {
    assert.deepEqual(allowedHeaders, ACADEMICCLOUD_CORS_ALLOWED_HEADERS, "multipart PUT must allow Content-MD5 exactly");
  }

  assert.deepEqual(headerTokens(response.headers, "access-control-expose-headers"), [], "CORS exposed headers must remain empty");
  const credentials = response.headers.get("access-control-allow-credentials");
  assert.ok(credentials === null || credentials.toLowerCase() === "true", "CORS credentials must be absent or true");
  assert.equal(response.headers.get("access-control-max-age"), "300", "CORS preflight max age must remain 300 seconds");
}

export function assertAcademicCloudCorsDenied(response, label) {
  assert.equal(response.status, 403, `${label} CORS preflight must return 403`);
  assert.equal(response.headers.get("access-control-allow-origin"), null, `${label} must not receive an allowed origin`);
}

async function preflight({ origin = ACADEMICCLOUD_APP_ORIGIN, method, requestHeaders = [] }) {
  const headers = new Headers({
    Origin: origin,
    "Access-Control-Request-Method": method,
  });
  if (requestHeaders.length > 0) headers.set("Access-Control-Request-Headers", requestHeaders.join(", "));
  return fetch(`${ACADEMICCLOUD_OSS_ORIGIN}/`, {
    method: "OPTIONS",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function verifyAcademicCloudCorsContract() {
  assertAcademicCloudCorsSuccess(await preflight({ method: "POST" }), "POST");
  assertAcademicCloudCorsSuccess(await preflight({ method: "PUT", requestHeaders: ["Content-MD5"] }), "PUT");
  assertAcademicCloudCorsDenied(await preflight({ method: "GET" }), "unapproved GET method");
  assertAcademicCloudCorsDenied(
    await preflight({ method: "PUT", requestHeaders: ["Content-MD5", "X-AcademicCloud-Unapproved"] }),
    "unapproved request header",
  );
  for (const origin of ["https://evil.invalid", "http://cloud.ajtlab.top", "http://localhost:5173"]) {
    assertAcademicCloudCorsDenied(await preflight({ origin, method: "POST" }), `unapproved origin ${origin}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyAcademicCloudCorsContract();
  console.log("AcademicCloud OSS CORS contract PASS: exact Origin, POST+PUT, Content-MD5 only, no exposed headers.");
}
