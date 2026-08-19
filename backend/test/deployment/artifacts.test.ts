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
  assert.match(logrotate, /daily/);
  assert.match(logrotate, /compress/);
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
    "Restart=on-failure",
    "RestartSec=5s",
    "StartLimitIntervalSec=300s",
    "StartLimitBurst=5",
  ]) {
    assert.ok(unit.includes(directive), `missing ${directive}`);
  }

  assert.doesNotMatch(unit, /MemoryDenyWriteExecute/);
  assert.doesNotMatch(unit, /ExecStart=.*tsx|npm run dev/);
});

test("future journald retention template is bounded and remains a repository artifact", () => {
  const journald = read("deployment/journald/90-academiccloud-retention.conf");
  assert.match(journald, /^\[Journal\]$/m);
  assert.match(journald, /^SystemMaxUse=512M$/m);
  assert.match(journald, /^SystemKeepFree=2G$/m);
  assert.match(journald, /^MaxRetentionSec=14day$/m);
  assert.match(journald, /^MaxFileSec=1day$/m);
  assert.match(journald, /^Compress=yes$/m);
  assert.match(journald, /separate Owner-approved production operations window/);
  assert.doesNotMatch(journald, /ForwardToRemote=yes|Storage=volatile/);
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

test("production artifact pins and verifies the exact PDF.js Linux native runtime boundary", () => {
  const artifact = read("scripts/production-artifact.mjs");

  for (const runtimePath of [
    "node_modules/pdfjs-dist",
    "node_modules/@napi-rs/canvas",
    "node_modules/@napi-rs/canvas-linux-x64-gnu",
    "node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node",
  ]) {
    assert.ok(artifact.includes(runtimePath), `missing artifact runtime policy for ${runtimePath}`);
  }
  assert.match(artifact, /entrypoint: "pdfjs-dist\/legacy\/build\/pdf\.mjs"/u);
  assert.match(artifact, /version: "6\.2\.108"/u);
  assert.match(artifact, /canvasVersion: "1\.0\.7"/u);
  assert.match(artifact, /verifyPdfJsRuntime\(releaseDirectory, "pre-prune"\)/u);
  assert.match(artifact, /verifyPdfJsRuntime\(releaseDirectory, "post-prune"\)/u);
  assert.match(artifact, /verifyPdfJsRuntime\(releaseDirectory, "extracted"\)/u);
  assert.match(artifact, /verifyElfX64\(join\(releaseDirectory, \.\.\.pdfJsRuntimePolicy\.canvasNativeModulePath/u);
  assert.match(artifact, /typeof pdfjs\.getDocument !== 'function'/u);
  assert.match(artifact, /typeof canvas\.DOMMatrix !== 'function'/u);
});

test("production artifact builds and independently verifies the exact release-local Tesseract boundary", () => {
  const artifact = read("scripts/production-artifact.mjs");
  const runtime = read("scripts/tesseract-runtime.mjs");
  const builder = read("scripts/build-tesseract-runtime.sh");
  const workflow = read(".github/workflows/production-build.yml");

  for (const runtimePath of [
    "runtime/tesseract/bin/tesseract",
    "runtime/tesseract/lib",
    "runtime/tesseract/tessdata/eng.traineddata",
    "runtime/tesseract/tessdata/chi_sim.traineddata",
    "runtime/tesseract/tessdata/chi_tra.traineddata",
    "runtime/tesseract/BUILD-EVIDENCE.json",
  ]) {
    assert.ok(artifact.includes(runtimePath), `missing artifact OCR runtime policy for ${runtimePath}`);
  }
  assert.match(runtime, /version: "5\.5\.3"/u);
  assert.match(runtime, /sourceCommit: "db0ec62f81b0737fbbe184d8fea40af5738f8eef"/u);
  assert.match(runtime, /sourceArchiveSha256: "9218e62793116d42a9f6d14cd9348518b27f382096eea3d0f2d1a24616bb5884"/u);
  assert.match(runtime, /tessdataVersion: "4\.1\.0"/u);
  assert.match(runtime, /eng: "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"/u);
  assert.match(runtime, /chi_sim: "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730"/u);
  assert.match(runtime, /chi_tra: "529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b"/u);
  assert.match(runtime, /verifyDynamicClosure/u);
  assert.match(runtime, /verifyLddResolution/u);
  assert.doesNotMatch(runtime, /\.map\(basename\)/u);
  assert.equal(runtime.includes("assert.doesNotMatch(ldd, /\\/work\\/"), false);
  assert.match(runtime, /synthetic OCR probe/u);
  assert.match(builder, /APT::Snapshot/u);
  assert.match(builder, /signed InRelease metadata still authenticates this first snapshot-only/u);
  assert.match(builder, /rm -f "\$\{SNAPSHOT_CA_BOOTSTRAP_CONFIG\}"/u);
  assert.match(builder, /require a normal certificate-verified snapshot refresh/u);
  assert.match(builder, /Authorization: Bearer \$\{GITHUB_API_TOKEN\}/u);
  assert.match(builder, /--retry 4 --retry-all-errors --retry-delay 2/u);
  assert.match(builder, /chown -R "\$\{ARTIFACT_OUTPUT_UID\}:\$\{ARTIFACT_OUTPUT_GID\}" "\$\{OUTPUT_ROOT\}"/u);
  assert.match(artifact, /mkdirSync\(join\(releaseDirectory, "runtime"\), \{ recursive: true \}\)/u);
  assert.match(builder, /tagSignatureVerified/u);
  assert.match(builder, /patchelf --set-rpath '\$ORIGIN\/\.\.\/lib'/u);
  assert.match(workflow, /ubuntu@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316/u);
  assert.equal(workflow.match(/--env "GITHUB_API_TOKEN=\$GITHUB_API_TOKEN"/gu)?.length, 2);
  assert.equal(workflow.match(/--env "ARTIFACT_OUTPUT_UID=\$\(id -u\)"/gu)?.length, 2);
  assert.equal(workflow.match(/--env "ARTIFACT_OUTPUT_GID=\$\(id -g\)"/gu)?.length, 2);
  assert.match(workflow, /Rebuild cleanly and prove deterministic archive and manifest/u);
  assert.doesNotMatch(workflow, /output\/repro-release/u);
  assert.doesNotMatch(workflow, /--prefix output\/release/u);
  assert.match(workflow, /diff --unified=3/u);
  assert.match(workflow, /verify-downloaded-artifact/u);
  assert.doesNotMatch(workflow, /apt(?:-get)? install tesseract/u);
});
