import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { MAX_CATALOG_BATCH_RESOURCES, MAX_CATALOG_APPLY_BYTES } from "../../src/catalog-batch/contracts.js";

const config = readFileSync(
  fileURLToPath(new URL("../../../deployment/nginx/academiccloud.conf", import.meta.url)),
  "utf8",
);

test("Nginx keeps ordinary API bodies at 16 KiB and scopes 8 MiB to Catalog Preview", () => {
  assert.equal(config.match(/^\s*client_max_body_size 16k;$/gm)?.length, 1);
  assert.equal(config.match(/^\s*client_max_body_size 8m;$/gm)?.length, 1);
  assert.match(
    config,
    /location ~ "\^\/api\/libraries\/\[A-Za-z0-9_-\]\{1,128\}\/catalog-batches\/preview\$" \{[\s\S]*?client_max_body_size 8m;[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;[\s\S]*?proxy_request_buffering on;[\s\S]*?\}/u,
  );
  assert.match(config, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/u);
  assert.doesNotMatch(
    config.match(/location \/api\/ \{[\s\S]*?\n    \}/u)?.[0] ?? "",
    /client_max_body_size 8m/u,
  );
});

test("maximum Apply selections and all acknowledgements fit the plan-only transport envelope", () => {
  const selections = Array.from({ length: MAX_CATALOG_BATCH_RESOURCES }, (_, index) => ({
    resourceId: String(index).padStart(128, "x"), previewVersion: "v".repeat(43),
    acknowledgeEvidence: true, acknowledgeClear: true, acknowledgeHumanConflict: true,
  }));
  assert.ok(Buffer.byteLength(JSON.stringify({ planId: "p".repeat(43), selections })) < MAX_CATALOG_APPLY_BYTES);
  assert.equal(MAX_CATALOG_APPLY_BYTES, 256 * 1024);
  assert.match(config, /catalog-batches\/apply\$" \{[\s\S]*?client_max_body_size 256k;/u);
});

test("Catalog export admits its bounded resource selection without raising ordinary API limits", () => {
  const uuidIds = Array.from({ length: MAX_CATALOG_BATCH_RESOURCES }, (_, index) => `${String(index).padStart(8, "0")}-0000-0000-0000-000000000000`);
  assert.ok(Buffer.byteLength(JSON.stringify({ fileIds: uuidIds })) > 16 * 1024);
  const maximumIds = Array.from({ length: MAX_CATALOG_BATCH_RESOURCES }, (_, index) => String(index).padStart(128, "x"));
  assert.ok(Buffer.byteLength(JSON.stringify({ fileIds: maximumIds })) < 128 * 1024);
  assert.match(config, /location ~ "\^\/api\/libraries\/\[A-Za-z0-9_-\]\{1,128\}\/catalog-batches\/export-request\$" \{[\s\S]*?client_max_body_size 128k;[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;[\s\S]*?proxy_request_buffering on;[\s\S]*?\}/u);
  assert.doesNotMatch(config.match(/location \/api\/ \{[\s\S]*?\n    \}/u)?.[0] ?? "", /client_max_body_size/u);
});
