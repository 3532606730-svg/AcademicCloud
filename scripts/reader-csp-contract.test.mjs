import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const text = readFileSync(new URL("../deployment/nginx/academiccloud-security-headers.conf", import.meta.url), "utf8");
const policy = text.match(/add_header Content-Security-Policy "([^"\n]+)" always;/u)?.[1];
function directive(name) { return policy?.split(";").map((part) => part.trim().split(/\s+/u)).find((tokens) => tokens[0] === name)?.slice(1); }
test("owned PDF reader CSP permits exact workers fonts WASM and signed byte origins", () => {
  assert.deepEqual(directive("worker-src"), ["'self'"]);
  assert.deepEqual(directive("font-src"), ["'self'", "blob:"]);
  assert.deepEqual(directive("script-src"), ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(directive("connect-src"), ["'self'", "https://files.ajtlab.top", "https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com", "http://127.0.0.1:43117"]);
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(!policy.includes("*"));
  assert.deepEqual(directive("object-src"), ["'none'"]);
});
