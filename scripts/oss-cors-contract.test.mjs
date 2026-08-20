import assert from "node:assert/strict";
import test from "node:test";

import {
  ACADEMICCLOUD_APP_ORIGIN,
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
  });
  assert.doesNotThrow(() => assertAcademicCloudCorsSuccess(post, "POST"));
  assert.throws(() => assertAcademicCloudCorsSuccess(post, "PUT"), /PUT must be allowed/u);

  const put = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "PUT",
    "Access-Control-Allow-Headers": "Content-MD5",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "300",
  });
  assert.doesNotThrow(() => assertAcademicCloudCorsSuccess(put, "PUT"));
});

test("deployment readiness rejects wildcard or unrelated CORS scope", () => {
  const wildcardOrigin = response(200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "PUT",
    "Access-Control-Allow-Headers": "Content-MD5",
    "Access-Control-Max-Age": "300",
  });
  assert.throws(() => assertAcademicCloudCorsSuccess(wildcardOrigin, "PUT"), /exact application origin/u);

  const unrelatedHeader = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "POST, PUT",
    "Access-Control-Allow-Headers": "Content-MD5, X-Unrelated",
    "Access-Control-Max-Age": "300",
  });
  assert.throws(() => assertAcademicCloudCorsSuccess(unrelatedHeader, "PUT"), /unrelated request header/u);

  const unrelatedMethod = response(200, {
    "Access-Control-Allow-Origin": ACADEMICCLOUD_APP_ORIGIN,
    "Access-Control-Allow-Methods": "PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-MD5",
    "Access-Control-Max-Age": "300",
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
