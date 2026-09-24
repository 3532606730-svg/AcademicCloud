import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export const ACADEMICCLOUD_APP_ORIGIN = "https://cloud.ajtlab.top";
export const ACADEMICCLOUD_OSS_ORIGIN = "https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com";
export const ACADEMICCLOUD_CORS_METHODS = Object.freeze(["GET", "POST", "PUT"]);
export const ACADEMICCLOUD_CORS_ALLOWED_HEADERS = Object.freeze(["content-md5", "range"]);

export const ACADEMICCLOUD_FILES_ORIGIN = "https://files.ajtlab.top";
export const ACADEMICCLOUD_CORS_EXPOSED_HEADERS = Object.freeze(["accept-ranges", "content-encoding", "content-length", "content-range"]);

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
    assert.ok(allowedHeaders.includes("content-md5"), "multipart PUT must allow Content-MD5");
  }

  if (expectedMethod === "GET") assert.ok(allowedHeaders.includes("range"), "PDF GET must allow Range");
  assert.deepEqual(headerTokens(response.headers, "access-control-expose-headers").sort(), [...ACADEMICCLOUD_CORS_EXPOSED_HEADERS], "CORS must expose exactly the PDF range response headers");
  const credentials = response.headers.get("access-control-allow-credentials");
  assert.ok(credentials === null || credentials.toLowerCase() === "true", "CORS credentials must be absent or true");
  assert.equal(response.headers.get("access-control-max-age"), "300", "CORS preflight max age must remain 300 seconds");
}

export function assertAcademicCloudCorsDenied(response, label) {
  assert.equal(response.status, 403, `${label} CORS preflight must return 403`);
  assert.equal(response.headers.get("access-control-allow-origin"), null, `${label} must not receive an allowed origin`);
}

async function preflight({ target = ACADEMICCLOUD_OSS_ORIGIN, origin = ACADEMICCLOUD_APP_ORIGIN, method, requestHeaders = [] }) {
  const headers = new Headers({
    Origin: origin,
    "Access-Control-Request-Method": method,
  });
  if (requestHeaders.length > 0) headers.set("Access-Control-Request-Headers", requestHeaders.join(", "));
  return fetch(`${target}/`, {
    method: "OPTIONS",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function verifyAcademicCloudCorsContract() {
  for (const target of [ACADEMICCLOUD_OSS_ORIGIN, ACADEMICCLOUD_FILES_ORIGIN]) {
    assertAcademicCloudCorsSuccess(await preflight({ target, method: "POST" }), "POST");
    assertAcademicCloudCorsSuccess(await preflight({ target, method: "PUT", requestHeaders: ["Content-MD5"] }), "PUT");
    assertAcademicCloudCorsSuccess(await preflight({ target, method: "GET", requestHeaders: ["Range"] }), "GET");
    for (const method of ["DELETE", "HEAD", "PATCH"]) assertAcademicCloudCorsDenied(await preflight({ target, method }), "unapproved " + method);
    for (const method of ["PUT", "GET"]) assertAcademicCloudCorsDenied(
      await preflight({ target, method, requestHeaders: ["X-AcademicCloud-Unapproved"] }), "unapproved request header",
    );
    for (const origin of ["https://evil.invalid", "http://cloud.ajtlab.top", "http://localhost:5173"]) {
      assertAcademicCloudCorsDenied(await preflight({ target, origin, method: "GET", requestHeaders: ["Range"] }), "unapproved origin " + origin);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyAcademicCloudCorsContract();
  console.log("AcademicCloud OSS CORS contract PASS: exact Origin, GET+POST+PUT, Range+Content-MD5, exact PDF response headers on both storage origins.");
}
