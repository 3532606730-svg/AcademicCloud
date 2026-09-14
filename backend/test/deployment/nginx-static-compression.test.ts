import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("../../../deployment/nginx/academiccloud.conf", import.meta.url), "utf8");
const assets = config.match(/    location \/assets\/ \{[\s\S]*?\n    \}/u)?.[0];

test("public JavaScript and CSS negotiate gzip without changing their immutable cache policy", () => {
  assert.ok(assets, "the public asset location must exist");
  assert.match(assets, /^\s*root \/opt\/academiccloud\/public-assets;$/mu,
    "open browser tabs must resolve retained chunks independently of the current release selector");
  assert.match(assets, /^\s*gzip on;$/mu);
  const types = assets.match(/^\s*gzip_types ([^;]+);$/mu)?.[1]?.split(/\s+/u);
  assert.ok(types, "the public asset location must declare compressed MIME types");
  assert.ok(types.includes("application/javascript"), "nginx serves the production JavaScript with this MIME type");
  assert.ok(types.includes("text/javascript"), "alternate JavaScript MIME mapping must also compress");
  assert.ok(types.includes("text/css"));
  assert.match(assets, /^\s*gzip_vary on;$/mu, "shared caches must distinguish accepted content encodings");
  assert.match(assets, /^\s*gzip_min_length 1024;$/mu);
  assert.match(assets, /^\s*gzip_comp_level 5;$/mu);
  assert.match(assets, /add_header Cache-Control "public, max-age=31536000, immutable";/u);
  assert.doesNotMatch(assets, /add_header Cache-Control [^;]+\balways\s*;/u,
    "a missing chunk must not acquire the successful asset's one-year immutable cache policy");
  assert.match(assets, /include \/etc\/nginx\/snippets\/academiccloud-security-headers\.conf;/u);
  assert.match(assets, /try_files \$uri =404;/u, "missing assets must not return the application shell");
});

test("static compression never broadens authenticated API or document response compression", () => {
  assert.ok(assets);
  const directives = assets.match(/^\s*gzip_types ([^;]+);$/mu)?.[1]?.split(/\s+/u);
  assert.deepEqual(new Set(directives), new Set(["application/javascript", "text/javascript", "text/css"]));
  assert.doesNotMatch(config.replace(assets, ""), /^\s*gzip(?:_[a-z]+)?\s/mu,
    "compression configuration belongs only to public assets, not the server or API locations");
  assert.doesNotMatch(assets, /proxy_pass/u, "the compressed location must continue serving static files");
});
