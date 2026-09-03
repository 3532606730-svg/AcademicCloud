import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const config = readFileSync(
  fileURLToPath(new URL("../../../deployment/nginx/academiccloud.conf", import.meta.url)),
  "utf8",
);

test("Nginx keeps ordinary API bodies at 16 KiB and scopes 8 MiB to catalog preview/apply", () => {
  assert.equal(config.match(/^\s*client_max_body_size 16k;$/gm)?.length, 1);
  assert.equal(config.match(/^\s*client_max_body_size 8m;$/gm)?.length, 1);
  assert.match(
    config,
    /location ~ "\^\/api\/libraries\/\[A-Za-z0-9_-\]\{1,128\}\/catalog-batches\/\(preview\|apply\)\$" \{[\s\S]*?client_max_body_size 8m;[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;[\s\S]*?proxy_request_buffering on;[\s\S]*?\}/u,
  );
  assert.match(config, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/u);
  assert.doesNotMatch(
    config.match(/location \/api\/ \{[\s\S]*?\n    \}/u)?.[0] ?? "",
    /client_max_body_size 8m/u,
  );
});
