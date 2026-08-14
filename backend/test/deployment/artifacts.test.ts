import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");
}

test("Nginx terminates HTTPS, serves the SPA, and overwrites trusted proxy headers", () => {
  const config = read("deployment/nginx/academiccloud.conf");
  const headers = read("deployment/nginx/academiccloud-security-headers.conf");
  const logrotate = read("deployment/logrotate/academiccloud-nginx");

  assert.match(config, /listen 80 default_server/);
  assert.ok(config.match(/^\s*server_tokens off;/gm)?.length === 3);
  assert.match(config, /return 301 https:\/\/cloud\.example\.edu\$request_uri/);
  assert.match(config, /listen 443 ssl http2/);
  assert.match(config, /ssl_protocols TLSv1\.2 TLSv1\.3/);
  assert.match(config, /location \/api\//);
  assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:3000/);
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr/);
  assert.doesNotMatch(config, /\$proxy_add_x_forwarded_for/);
  assert.match(config, /client_max_body_size 16k/);
  assert.match(config, /proxy_next_upstream off/);
  assert.match(config, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(config, /ssl_reject_handshake on/);
  assert.match(config, /location = \/api[\s\S]*\{"error":"not_found"\}/);
  assert.equal(config.match(/^\s*include \/etc\/nginx\/snippets\/academiccloud-security-headers\.conf;/gm)?.length, 4);
  assert.match(headers, /Cross-Origin-Resource-Policy "same-origin"/);
  assert.match(headers, /Content-Security-Policy/);
  assert.doesNotMatch(headers, /^\s*add_header Strict-Transport-Security/m);
  assert.match(config, /log_format academiccloud_safe/);
  assert.doesNotMatch(config.match(/log_format academiccloud_safe[^;]+/)?.[0] ?? "", /request_uri|request\b|args|referer|cookie|authorization/i);
  assert.equal(config.match(/^\s*access_log \/var\/log\/academiccloud\/nginx-access\.log academiccloud_safe;/gm)?.length, 4);
  assert.match(logrotate, /rotate 14/);
  assert.match(logrotate, /maxsize 10M/);
});

test("systemd keeps one loopback API process inside a restrictive writable boundary", () => {
  const unit = read("deployment/systemd/academiccloud.service");

  for (const directive of [
    "User=academiccloud",
    "EnvironmentFile=/etc/academiccloud/academiccloud.env",
    "UMask=0077",
    "StateDirectoryMode=0700",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "PrivateDevices=true",
    "ProtectSystem=strict",
    "ProtectHome=true",
    "CapabilityBoundingSet=",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK",
    "ReadWritePaths=/var/lib/academiccloud",
    "MemoryHigh=320M",
    "MemoryMax=384M",
  ]) {
    assert.ok(unit.includes(directive), `missing ${directive}`);
  }

  assert.doesNotMatch(unit, /MemoryDenyWriteExecute/);
  assert.doesNotMatch(unit, /ExecStart=.*tsx|npm run dev/);
});

test("production environment example binds Fastify to loopback and contains no real secret", () => {
  const environment = read("deployment/env/academiccloud.env.example");

  assert.match(environment, /^NODE_ENV=production$/m);
  assert.match(environment, /^HOST=127\.0\.0\.1$/m);
  assert.match(environment, /^APP_ORIGIN=https:\/\//m);
  assert.match(environment, /^DATABASE_PATH=\/var\/lib\/academiccloud\//m);
  assert.match(environment, /^STORAGE_PROVIDER=aliyun-oss$/m);
  assert.match(environment, /^OSS_ACCESS_KEY_SECRET=replace-through-secret-installation$/m);
  assert.doesNotMatch(environment, /BEGIN PRIVATE KEY|ac_session=/);
});
