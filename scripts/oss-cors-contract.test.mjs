import assert from "node:assert/strict";
import test from "node:test";

import {
  ACADEMICCLOUD_APP_ORIGIN,
  ACADEMICCLOUD_CORS_EXPOSED_HEADERS,
  assertAcademicCloudCorsDenied,
  assertAcademicCloudCorsSuccess,
} from "./oss-cors-contract.mjs";

function response(status, headers = {}) {
  return { status, headers: new Headers(headers) };
}

test("deployment readiness requires POST and the exact multipart PUT Content-MD5 contract", () => {
  const post = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Max-Age": "300",
    "Access-Control-Expose-Headers": ACADEMICCLOUD_CORS_EXPOSED_HEADERS.join(", "),
  });
  assert.doesNotThrow(() => assertAcademicCloudCorsSuccess(post, "POST"));
  assert.throws(() => assertAcademicCloudCorsSuccess(post, "PUT"), /PUT must be allowed/u);

  const put = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "PUT",
    "Access-Control-Allow-Headers": "Content-MD5",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "300",
    "Access-Control-Expose-Headers": ACADEMICCLOUD_CORS_EXPOSED_HEADERS.join(", "),
  });
  assert.doesNotThrow(() => assertAcademicCloudCorsSuccess(put, "PUT"));
});

test("deployment readiness rejects wildcard or unrelated CORS scope", () => {
  const wildcardOrigin = response(200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "PUT",
    "Access-Control-Allow-Headers": "Content-MD5",
    "Access-Control-Max-Age": "300",
    "Access-Control-Expose-Headers": ACADEMICCLOUD_CORS_EXPOSED_HEADERS.join(", "),
  });
  assert.throws(() => assertAcademicCloudCorsSuccess(wildcardOrigin, "PUT"), /exact application origin/u);

  const unrelatedHeader = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "POST, PUT",
    "Access-Control-Allow-Headers": "Content-MD5, X-Unrelated",
    "Access-Control-Max-Age": "300",
    "Access-Control-Expose-Headers": ACADEMICCLOUD_CORS_EXPOSED_HEADERS.join(", "),
  });
  assert.throws(() => assertAcademicCloudCorsSuccess(unrelatedHeader, "PUT"), /unrelated request header/u);

  const unrelatedMethod = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-MD5",
    "Access-Control-Max-Age": "300",
    "Access-Control-Expose-Headers": ACADEMICCLOUD_CORS_EXPOSED_HEADERS.join(", "),
  });
  assert.throws(() => assertAcademicCloudCorsSuccess(unrelatedMethod, "PUT"), /unrelated method/u);
});

test("negative preflights must fail without an allowed origin", () => {
  assert.doesNotThrow(() => assertAcademicCloudCorsDenied(response(403), "unapproved request"));
  assert.throws(
    () => assertAcademicCloudCorsDenied(response(403, { "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN }), "unapproved request"),
    /must not receive an allowed origin/u,
  );
});

 test("PDF GET requires Range and exact exposed response metadata", () => {
   const headers = { "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
     "Access-Control-Allow-Methods": "GET, POST, PUT", "Access-Control-Allow-Headers": "Range, Content-MD5",
     "Access-Control-Expose-Headers": ACADEMICCLOUD_CORS_EXPOSED_HEADERS.join(", "), "Access-Control-Max-Age": "300" };
   assert.doesNotThrow(() => assertAcademicCloudCorsSuccess(response(200, headers), "GET"));
   assert.throws(() => assertAcademicCloudCorsSuccess(response(200, {...headers, "Access-Control-Allow-Headers": "Content-MD5"}), "GET"), /allow Range/u);
   assert.throws(() => assertAcademicCloudCorsSuccess(response(200, {...headers, "Access-Control-Expose-Headers": "*"}), "GET"), /exactly the PDF/u);
   assert.throws(() => assertAcademicCloudCorsSuccess(response(200, {...headers, "Access-Control-Expose-Headers": "Content-Length"}), "GET"), /exactly the PDF/u);
   assert.throws(() => assertAcademicCloudCorsSuccess(response(200, {...headers, "Access-Control-Allow-Methods": "GET, HEAD"}), "GET"), /unrelated method/u);
 });
